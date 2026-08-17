// Resend wrapper for all outbound email — digest sends (backfill summary,
// monthly/quarterly rollups) and, as of Phase 7, failure-notification
// alerts too (see lib/notify-failure.ts), which is why this is named
// sendEmail rather than sendDigestEmail even though DIGEST_EMAIL_TO/FROM
// are still the env vars that configure it: there's one email address
// this whole system talks to, digest or alert.
//
// Best-effort by design: an unconfigured or failing email step should
// never turn an otherwise-successful pipeline run into a failure — the
// database writes are the source of truth; email is a notification on
// top of it. When sending isn't possible, the rendered HTML is written to
// a local file instead so the content isn't just lost.

import { Resend } from "resend";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

export interface SendResult {
  sent: boolean;
  reason?: string;
  localFallbackPath?: string;
}

export async function sendEmail(
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_EMAIL_TO;
  const from = process.env.DIGEST_EMAIL_FROM;

  if (!apiKey || !to || !from) {
    const missing = [
      !apiKey && "RESEND_API_KEY",
      !to && "DIGEST_EMAIL_TO",
      !from && "DIGEST_EMAIL_FROM",
    ]
      .filter(Boolean)
      .join(", ");
    const localPath = writeLocalFallback(subject, html);
    console.warn(
      `Email not sent — missing env var(s): ${missing}. Rendered HTML written to ${localPath} instead.`,
    );
    return { sent: false, reason: `missing env var(s): ${missing}`, localFallbackPath: localPath };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) {
      const localPath = writeLocalFallback(subject, html);
      console.warn(`Email send failed (${error.message}). Rendered HTML written to ${localPath} instead.`);
      return { sent: false, reason: error.message, localFallbackPath: localPath };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const localPath = writeLocalFallback(subject, html);
    console.warn(`Email send threw (${message}). Rendered HTML written to ${localPath} instead.`);
    return { sent: false, reason: message, localFallbackPath: localPath };
  }
}

function writeLocalFallback(subject: string, html: string): string {
  const dir = join(process.cwd(), ".email-fallback");
  mkdirSync(dir, { recursive: true });
  const safeName = subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
  const path = join(dir, `${Date.now()}-${safeName}.html`);
  writeFileSync(path, html, "utf-8");
  return path;
}
