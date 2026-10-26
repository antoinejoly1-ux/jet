import "server-only";
import { appendFile } from "node:fs/promises";
import { Resend } from "resend";
import { env } from "@/lib/env";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Sends a transactional email. Without RESEND_API_KEY (local development and
 * tests) the email is printed to the server console instead, links included.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (!resend) {
    console.info(`\n[email] to=${email.to}\n[email] subject=${email.subject}\n${email.text}\n`);
    // End-to-end tests read links from this file. Never set in production.
    if (process.env.EMAIL_OUTBOX_FILE) {
      await appendFile(
        process.env.EMAIL_OUTBOX_FILE,
        `${JSON.stringify({ ...email, at: new Date().toISOString() })}\n`,
      );
    }
    return;
  }
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) throw new Error(`Email to ${email.to} failed: ${error.message}`);
}
