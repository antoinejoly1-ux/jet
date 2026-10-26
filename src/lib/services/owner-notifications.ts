import "server-only";
import { eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/lib/db";
import { notifications, ownerMembers, user } from "@/lib/db/schema";
import { actionEmail, type TemplateName } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { emailOffFor } from "./notification-center";

export type PendingEmail = {
  template: TemplateName;
  to: string;
  locale: "fr" | "en";
  path: string;
  vars: Record<string, string>;
};

/**
 * Records an in-app notification for every login of an owner, inside the
 * caller's transaction, and returns the emails to send once it commits.
 */
export async function notifyOwnerMembers(
  tx: DbOrTx,
  ownerId: string,
  type: string,
  data: Record<string, string>,
  email: { template: TemplateName; path: string },
): Promise<PendingEmail[]> {
  const members = await tx
    .select({ userId: user.id, email: user.email, locale: user.locale })
    .from(ownerMembers)
    .innerJoin(user, eq(user.id, ownerMembers.userId))
    .where(eq(ownerMembers.ownerId, ownerId));
  if (members.length === 0) return [];
  await tx.insert(notifications).values(members.map((m) => ({ userId: m.userId, type, data })));
  // Everyone sees it in the app; the email only goes to those who haven't turned it off.
  const off = await emailOffFor(
    tx,
    members.map((m) => m.userId),
  );
  return members
    .filter((m) => !off.get(m.userId)?.has(type))
    .map((m) => ({
      template: email.template,
      to: m.email,
      locale: m.locale,
      path: email.path,
      vars: data,
    }));
}

/**
 * Sends emails after the change is committed. A failed email never undoes the
 * change; it is logged and the in-app notification is still there.
 * (A background job with retries replaces this once Inngest is added.)
 */
export async function sendPendingEmails(_db: Db, pending: PendingEmail[]) {
  await Promise.all(
    pending.map(async (p) => {
      try {
        await sendEmail(actionEmail(p.template, p.to, `${env.BETTER_AUTH_URL}${p.path}`, p.locale, p.vars));
      } catch (err) {
        console.error(`[email] ${p.template} to ${p.to} failed`, err);
      }
    }),
  );
}
