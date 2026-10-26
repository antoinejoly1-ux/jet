/**
 * Emails that wait: a reply from dispatch is emailed only if the owner
 * hasn't read it in the app within five minutes. Run by the scheduled job.
 */
import "server-only";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { notifications, user } from "@/lib/db/schema";
import { actionEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { emailOffFor } from "./notification-center";

export const MESSAGE_EMAIL_DELAY_MS = 5 * 60_000;

export async function sendDueMessageEmails(db: Db, now = new Date()) {
  const due = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      data: notifications.data,
      email: user.email,
      locale: user.locale,
    })
    .from(notifications)
    .innerJoin(user, eq(user.id, notifications.userId))
    .where(
      and(
        eq(notifications.type, "message.from_dispatch"),
        isNull(notifications.readAt),
        isNull(notifications.emailedAt),
        lte(notifications.createdAt, new Date(now.getTime() - MESSAGE_EMAIL_DELAY_MS)),
      ),
    )
    .limit(500);
  if (due.length === 0) return { sent: 0, skipped: 0 };

  // One email per person however many replies are waiting; it quotes the latest.
  const byUser = new Map<string, typeof due>();
  for (const n of due) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  const off = await emailOffFor(db, [...byUser.keys()]);
  let sent = 0;
  let skipped = 0;
  for (const [userId, items] of byUser) {
    const latest = items.at(-1)!;
    if (off.get(userId)?.has("message.from_dispatch")) skipped++;
    else {
      try {
        await sendEmail(
          actionEmail("newMessage", latest.email, `${env.BETTER_AUTH_URL}/messages`, latest.locale, {
            preview: String((latest.data as Record<string, string>).preview ?? ""),
          }),
        );
        sent++;
      } catch (err) {
        // Left unmarked, so the next run tries again.
        console.error(`[email] newMessage to ${latest.email} failed`, err);
        continue;
      }
    }
    // Marked as handled whether emailed or turned off, so it isn't looked at again.
    await db
      .update(notifications)
      .set({ emailedAt: now })
      .where(
        inArray(
          notifications.id,
          items.map((i) => i.id),
        ),
      );
  }
  return { sent, skipped };
}
