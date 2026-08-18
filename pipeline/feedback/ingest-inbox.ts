// Polls the dedicated feedback inbox (emarketscope@gmail.com, per the
// spec's Setup reference) via IMAP and inserts each unseen message into
// forwarded_items. Graceful fallback, same pattern as email/send.ts: an
// unconfigured or failing inbox does not fail the pipeline run — it just
// skips ingestion for this run.
//
// Called as a step in weekly/run.ts (see that file) so forwarding
// something during the day genuinely "folds into the next run" with no
// laptop ritual, per spec — no separate script to remember to run.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { lookup } from "node:dns/promises";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import "dotenv/config";
import { supabase } from "../lib/supabase.js";

const IMAP_HOST = "imap.gmail.com";
const IMAP_PORT = 993;
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;
const MAX_BODY_CHARS = 10_000; // guard against pathological message sizes
const PREFLIGHT_STAGE_TIMEOUT_MS = 15_000;

// Upper bound on the whole connect+search+fetch session, independent of
// whatever timeout ImapFlow/the OS socket uses internally -- belt and
// suspenders so this can never hang the weekly run indefinitely even if
// neither of those fires cleanly.
const SESSION_TIMEOUT_MS = 60_000;

export interface IngestResult {
  ingested: number;
  skipped: boolean;
  reason?: string;
}

function timeoutRejection(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

// Diagnostic instrumentation, added after a real production timeout that
// gave us nothing more specific than "failed after 60s" -- twice, in two
// completely different network environments. ImapFlow's own connect()
// does DNS+TCP+TLS+LOGIN as one opaque call with no visibility into which
// of those four actually got stuck, so this runs DNS resolution, a bare
// TCP connect, and a full TLS handshake as three separate, independently
// timed and logged steps *before* handing off to ImapFlow for the real
// session below (which gets its own LOGIN-level visibility via the
// logger wired into the client). Each stage logs its own start/end so a
// stuck run points at exactly one of: DNS, TCP, TLS, or LOGIN, instead of
// just "IMAP session failed" with no further detail.
async function logConnectionPreflight(): Promise<void> {
  const tag = "[ingest-inbox preflight]";

  const dnsStart = Date.now();
  console.log(`${tag} DNS: resolving ${IMAP_HOST}...`);
  let resolvedAddress: string;
  try {
    const result = await lookup(IMAP_HOST);
    resolvedAddress = result.address;
    console.log(`${tag} DNS: resolved ${IMAP_HOST} -> ${resolvedAddress} in ${Date.now() - dnsStart}ms`);
  } catch (err) {
    console.warn(
      `${tag} DNS: FAILED after ${Date.now() - dnsStart}ms -- ${err instanceof Error ? err.message : String(err)}`,
    );
    return; // no point attempting TCP/TLS against a host that didn't resolve
  }

  await new Promise<void>((resolve) => {
    const tcpStart = Date.now();
    console.log(`${tag} TCP: connecting to ${resolvedAddress}:${IMAP_PORT}...`);
    const socket = netConnect({ host: IMAP_HOST, port: IMAP_PORT, timeout: PREFLIGHT_STAGE_TIMEOUT_MS });
    socket.on("connect", () => {
      console.log(`${tag} TCP: connected in ${Date.now() - tcpStart}ms`);
      socket.end();
      resolve();
    });
    socket.on("timeout", () => {
      console.warn(`${tag} TCP: TIMED OUT after ${Date.now() - tcpStart}ms`);
      socket.destroy();
      resolve();
    });
    socket.on("error", (err) => {
      console.warn(`${tag} TCP: ERROR after ${Date.now() - tcpStart}ms -- ${err.message}`);
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    const tlsStart = Date.now();
    console.log(`${tag} TLS: starting handshake with ${IMAP_HOST}:${IMAP_PORT}...`);
    const socket = tlsConnect({ host: IMAP_HOST, port: IMAP_PORT, timeout: PREFLIGHT_STAGE_TIMEOUT_MS });
    socket.on("secureConnect", () => {
      console.log(
        `${tag} TLS: handshake completed in ${Date.now() - tlsStart}ms (authorized=${socket.authorized}, protocol=${socket.getProtocol()})`,
      );
      socket.end();
      resolve();
    });
    socket.on("timeout", () => {
      console.warn(`${tag} TLS: handshake TIMED OUT after ${Date.now() - tlsStart}ms`);
      socket.destroy();
      resolve();
    });
    socket.on("error", (err) => {
      console.warn(`${tag} TLS: handshake ERROR after ${Date.now() - tlsStart}ms -- ${err.message}`);
      resolve();
    });
  });
}

// Defensive redaction for ImapFlow's own protocol-level debug log (wired
// in below). ImapFlow already compiles LOGIN's password argument with
// `sensitive: true` and masks it as "(* value hidden *)" specifically
// when compiling for logging (verified against
// node_modules/imapflow/lib/commands/login.js and handler/imap-compiler.js)
// -- so this should never actually fire. It's a second, independent net
// in case of a future ImapFlow regression or some other field carrying
// the raw value: an IMAP credential must never reach a log line, and
// this log is read back through `gh run view --log` into places (this
// chat, potentially) that must never see it either.
function redact(appPassword: string, text: string): string {
  return appPassword && text.includes(appPassword) ? text.split(appPassword).join("[REDACTED]") : text;
}

function buildImapLogger(appPassword: string) {
  const format = (level: string, entry: unknown) => {
    if (entry && typeof entry === "object") {
      const { src, msg, cid } = entry as { src?: string; msg?: string; cid?: unknown };
      if (typeof msg === "string") {
        const prefix = src === "c" ? "C:" : src === "s" ? "S:" : src === "auth" ? "AUTH:" : "";
        console.log(`[imap ${level}] ${prefix} ${redact(appPassword, msg)} (cid=${String(cid)})`.trim());
        return;
      }
    }
    console.log(`[imap ${level}]`, entry);
  };
  return {
    debug: (entry: unknown) => format("debug", entry),
    info: (entry: unknown) => format("info", entry),
    warn: (entry: unknown) => format("warn", entry),
    error: (entry: unknown) => format("error", entry),
  };
}

async function runSession(client: ImapFlow): Promise<IngestResult> {
  console.log("[ingest-inbox] LOGIN: calling client.connect() (DNS+TCP+TLS+LOGIN, ImapFlow-internal)...");
  const connectStart = Date.now();
  await client.connect();
  console.log(`[ingest-inbox] LOGIN: client.connect() resolved in ${Date.now() - connectStart}ms`);

  let ingested = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ seen: false }, { uid: true });
    if (!uids || uids.length === 0) {
      return { ingested: 0, skipped: false };
    }

    for await (const message of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
      if (!message.source) continue;

      const parsed = await simpleParser(message.source);
      const fromEmail = parsed.from?.value?.[0]?.address ?? null;
      const subject = parsed.subject ?? null;
      const bodyText = (parsed.text ?? parsed.html ?? "").toString().slice(0, MAX_BODY_CHARS);
      const urlMatch = bodyText.match(URL_REGEX);

      const { error } = await supabase.from("forwarded_items").insert({
        from_email: fromEmail,
        subject,
        body: bodyText || null,
        extracted_url: urlMatch ? urlMatch[0] : null,
        status: "pending",
      });

      if (error) {
        // Leave unseen so it's retried on the next run rather than
        // silently lost.
        console.warn(`Failed to save forwarded item (uid ${message.uid}): ${error.message}`);
        continue;
      }

      await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      ingested++;
    }
  } finally {
    lock.release();
  }

  return { ingested, skipped: false };
}

export async function ingestInbox(): Promise<IngestResult> {
  const address = process.env.FEEDBACK_INBOX_ADDRESS;
  const appPassword = process.env.FEEDBACK_INBOX_APP_PASSWORD;

  if (!address || !appPassword) {
    const reason = "FEEDBACK_INBOX_ADDRESS / FEEDBACK_INBOX_APP_PASSWORD not set";
    console.warn(`Inbox ingestion skipped — ${reason}.`);
    return { ingested: 0, skipped: true, reason };
  }

  await logConnectionPreflight();

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: address, pass: appPassword },
    logger: buildImapLogger(appPassword),
    // Root-caused via the preflight/logger instrumentation above: with
    // COMPRESS=DEFLATE negotiated (ImapFlow's default whenever the server
    // offers it, which Gmail does), LOGIN/SEARCH/small responses all
    // completed normally, but UID FETCH's larger multi-message response
    // hung indefinitely with zero bytes ever received -- reproduced
    // identically on a real GitHub Actions runner and locally, so this
    // isn't one environment's fluke. Disabling compression made the exact
    // same FETCH return instantly. The bandwidth cost of uncompressed
    // IMAP traffic for a handful of forwarded emails a week is irrelevant
    // next to "ingestion silently never completes."
    disableCompression: true,
  });

  // ImapFlow is an EventEmitter -- socket-level failures (timeouts,
  // resets) surface as an 'error' event on the client itself, which is
  // NOT the same thing as a rejection of whatever call happens to be in
  // flight. Confirmed directly in testing: a socket timeout crashed the
  // whole Node process with zero output, bypassing every try/catch below,
  // because nothing was listening for it -- Node's default behavior for
  // an unhandled EventEmitter 'error' is to throw. Racing the real work
  // against this promise is what turns that crash into an ordinary,
  // caught failure; the timeoutRejection below is a second, independent
  // backstop in case a failure mode exists that trips neither ImapFlow's
  // own error event nor its socket timeout.
  const errorSignal = new Promise<never>((_, reject) => {
    client.on("error", (err: Error) => reject(err instanceof Error ? err : new Error(String(err))));
  });
  errorSignal.catch(() => {}); // never let this be *the* unhandled rejection either

  // Promise.race doesn't cancel the losing promises -- if errorSignal or
  // the timeout below wins while runSession() is still genuinely mid-loop
  // (observed directly in testing), runSession() keeps running,
  // unobserved, while the finally block's client.logout()/close() tears
  // down the very connection it's still using. If that abandoned promise
  // later rejects as a result, nothing is listening for it anymore --
  // this second subscription is what keeps that from becoming an
  // unhandled rejection, same reasoning as errorSignal's own safety net
  // above. It does not change what wins the race below.
  const sessionPromise = runSession(client);
  sessionPromise.catch(() => {});

  try {
    return await Promise.race([
      sessionPromise,
      errorSignal,
      timeoutRejection(SESSION_TIMEOUT_MS, `IMAP session exceeded ${SESSION_TIMEOUT_MS / 1000}s`),
    ]);
  } catch (err) {
    const reason = `IMAP session failed: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`Inbox ingestion skipped — ${reason}.`);
    return { ingested: 0, skipped: true, reason };
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
