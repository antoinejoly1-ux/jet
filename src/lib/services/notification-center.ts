/**
 * The bell: a person's own notifications, newest first, and their email
 * choices. Everything here is about the signed-in user only.
 */
import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/lib/db";
import { notificationPreferences, notifications } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { isNotificationType, NOTIFICATION_TYPES, OPTIONAL_EMAIL_TYPES } from "@/lib/notification-types";
import { recordAudit } from "./audit";

export async function listNotifications(db: Db, actor: Actor, { limit = 50 } = {}) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows
    .filter((n) => isNotificationType(n.type))
    .map((n) => {
      const data = (n.data ?? {}) as Record<string, string>;
      const type = n.type as keyof typeof NOTIFICATION_TYPES;
      return {
        id: n.id,
        type,
        data,
        readAt: n.readAt,
        createdAt: n.createdAt,
        href: NOTIFICATION_TYPES[type].href(data),
      };
    });
}

export async function unreadNotificationCount(db: Db, actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markAllNotificationsRead(db: Db, actor: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}

/** Email types this person has turned off. */
export async function emailOffFor(db: DbOrTx, userIds: string[]): Promise<Map<string, Set<string>>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds));
  return new Map(rows.map((r) => [r.userId, new Set(r.emailOff)]));
}

export async function getEmailPreferences(db: Db, actor: Actor) {
  const off = (await emailOffFor(db, [actor.id])).get(actor.id) ?? new Set();
  return OPTIONAL_EMAIL_TYPES.map((type) => ({ type, email: !off.has(type) }));
}

const preferencesInput = z.object({ on: z.array(z.enum(OPTIONAL_EMAIL_TYPES as [string, ...string[]])) });

/** Saves which optional emails stay on; everything not listed is turned off. */
export async function saveEmailPreferences(db: Db, actor: Actor, raw: { on: string[] }) {
  const { on } = preferencesInput.parse(raw);
  const emailOff = OPTIONAL_EMAIL_TYPES.filter((t) => !on.includes(t));
  await db.transaction(async (tx) => {
    await tx
      .insert(notificationPreferences)
      .values({ userId: actor.id, emailOff })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { emailOff } });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "account.email_preferences",
      entityType: "user",
      entityId: actor.id,
      after: { emailOff },
    });
  });
}
