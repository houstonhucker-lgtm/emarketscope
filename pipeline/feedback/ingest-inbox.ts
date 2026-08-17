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

export interface IngestResult {
  ingested: number;
  skipped: boolean;
  reason?: string;
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

  let ingested = 0;

  try {
    await client.connect();
  } catch (err) {
    const reason = `IMAP connect failed: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`Inbox ingestion skipped — ${reason}.`);
    return { ingested: 0, skipped: true, reason };
  }

  try {
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
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }

  return { ingested, skipped: false };
}
