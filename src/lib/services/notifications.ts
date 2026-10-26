import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { invitations, notifications, user } from "@/lib/db/schema";

/**
 * Tells every admin that someone signed up without a pending invitation, so
 * they can link or reject the account. Invited sign-ups are skipped: accepting
 * the invitation links them a moment later.
 */
export async function notifyAdminsOfUninvitedSignUp(db: DbOrTx, args: { userId: string; email: string }) {
  const pending = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, args.email.toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (pending.length > 0) return;

  const admins = await db.select({ id: user.id }).from(user).where(eq(user.staffRole, "admin"));
  if (admins.length === 0) return;

  await db.insert(notifications).values(
    admins.map((admin) => ({
      userId: admin.id,
      type: "access.uninvited_sign_up",
      data: { userId: args.userId, email: args.email },
    })),
  );
}
