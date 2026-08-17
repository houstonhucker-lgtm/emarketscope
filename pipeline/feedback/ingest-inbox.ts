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
import "dotenv/config";
import { supabase } from "../lib/supabase.js";

const IMAP_HOST = "imap.gmail.com";
const IMAP_PORT = 993;
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;
const MAX_BODY_CHARS = 10_000; // guard against pathological message sizes

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

async function runSession(client: ImapFlow): Promise<IngestResult> {
  await client.connect();

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

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: address, pass: appPassword },
    logger: false,
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

  try {
    return await Promise.race([
      runSession(client),
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
