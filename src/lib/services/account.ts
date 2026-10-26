import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";
import type { Locale } from "@/lib/db/schema/_shared";
import { recordAudit } from "./audit";

export async function setLocale(db: Db, userId: string, locale: Locale) {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ locale }).where(eq(user.id, userId));
    await recordAudit(tx, {
      actorUserId: userId,
      action: "account.set_locale",
      entityType: "user",
      entityId: userId,
      after: { locale },
    });
  });
}

/** True when the account can sign in with a password (2FA setup then asks for it). */
export async function hasPassword(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return rows.length > 0;
}

export async function listSignInMethods(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
  return rows.map((r) => r.providerId);
}
