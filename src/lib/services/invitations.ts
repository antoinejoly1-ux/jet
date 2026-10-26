import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { invitations, ownerMembers, owners, user } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { actionEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { recordAudit } from "./audit";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const createInvitationInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("owner"),
    email: z.string().trim().toLowerCase().email(),
    ownerId: z.string().uuid(),
    memberRole: z.enum(["primary", "viewer"]).default("primary"),
  }),
  z.object({
    kind: z.literal("staff"),
    email: z.string().trim().toLowerCase().email(),
    staffRole: z.enum(["admin", "finance", "dispatcher"]),
  }),
]);
export type CreateInvitationInput = z.input<typeof createInvitationInput>;

/**
 * Creates a single-use invitation and emails its link. Owner invitations need
 * `owners:invite`; staff invitations need `team:manage` (admins only).
 */
export async function createInvitation(db: Db, actor: Actor, raw: CreateInvitationInput, baseUrl: string) {
  const input = createInvitationInput.parse(raw);
  authorize(actor, input.kind === "staff" ? "team:manage" : "owners:invite");

  let locale: "fr" | "en" = "fr";
  if (input.kind === "owner") {
    const [owner] = await db.select({ locale: owners.locale }).from(owners).where(eq(owners.id, input.ownerId));
    if (!owner) throw new Error("Owner not found");
    locale = owner.locale;
  }

  const token = randomBytes(32).toString("base64url");
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invitations)
      .values({
        email: input.email,
        ownerId: input.kind === "owner" ? input.ownerId : null,
        memberRole: input.kind === "owner" ? input.memberRole : null,
        staffRole: input.kind === "staff" ? input.staffRole : null,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invitation.create",
      entityType: "invitation",
      entityId: row.id,
      after: { email: row.email, ownerId: row.ownerId, staffRole: row.staffRole },
    });
    return row;
  });

  const url = `${baseUrl}/invite/${token}`;
  await sendEmail(actionEmail("invitation", input.email, url, locale));
  return { invitation: created, url };
}

export type InvitationState = "valid" | "expired" | "accepted" | "revoked" | "not_found";

export async function findInvitation(db: Db, token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      ownerId: invitations.ownerId,
      staffRole: invitations.staffRole,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      ownerName: owners.legalName,
    })
    .from(invitations)
    .leftJoin(owners, eq(owners.id, invitations.ownerId))
    .where(eq(invitations.tokenHash, hashToken(token)));
  if (!row) return { state: "not_found" as const, invitation: null };
  return { state: stateOf(row), invitation: row };
}

function stateOf(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InvitationState {
  if (row.revokedAt) return "revoked";
  if (row.acceptedAt) return "accepted";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "valid";
}

export class InvitationError extends Error {
  constructor(public readonly code: Exclude<InvitationState, "valid"> | "email_mismatch") {
    super(`Invitation cannot be accepted: ${code}`);
    this.name = "InvitationError";
  }
}

/**
 * Links the signed-in user to the invitation's owner (or staff role). The
 * invitation is bound to its email: a different account cannot use the link.
 * Runs in one transaction with the row locked, so a link is used exactly once.
 */
export async function acceptInvitation(db: Db, token: string, userId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)))
      .for("update");
    if (!row) throw new InvitationError("not_found");
    const state = stateOf(row);
    if (state !== "valid") throw new InvitationError(state);

    const [account] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
    if (!account || account.email.toLowerCase() !== row.email) throw new InvitationError("email_mismatch");

    if (row.ownerId) {
      await tx
        .insert(ownerMembers)
        .values({ ownerId: row.ownerId, userId, role: row.memberRole ?? "primary" })
        .onConflictDoNothing();
    } else if (row.staffRole) {
      await tx.update(user).set({ staffRole: row.staffRole }).where(eq(user.id, userId));
    }

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedByUserId: userId })
      .where(eq(invitations.id, row.id));
    await recordAudit(tx, {
      actorUserId: userId,
      action: "invitation.accept",
      entityType: "invitation",
      entityId: row.id,
      after: { ownerId: row.ownerId, staffRole: row.staffRole },
    });
    return { ownerId: row.ownerId, staffRole: row.staffRole };
  });
}

export async function revokeInvitation(db: Db, actor: Actor, invitationId: string) {
  authorize(actor, "owners:invite");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id, staffRole: invitations.staffRole });
    if (!row) return;
    if (row.staffRole) authorize(actor, "team:manage");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invitation.revoke",
      entityType: "invitation",
      entityId: row.id,
    });
  });
}

export async function listInvitations(db: Db, actor: Actor) {
  authorize(actor, "owners:invite");
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      ownerName: owners.legalName,
      staffRole: invitations.staffRole,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .leftJoin(owners, eq(owners.id, invitations.ownerId))
    .orderBy(desc(invitations.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, state: stateOf(r) }));
}

/**
 * Owners nobody can sign in for yet: no login linked and no invitation still
 * open. Launch is done when this list is empty.
 */
export async function listOwnersWithoutAccess(db: Db, actor: Actor) {
  authorize(actor, "owners:read");
  return db
    .select({ id: owners.id, legalName: owners.legalName, email: owners.email })
    .from(owners)
    .where(
      and(
        isNull(owners.deletedAt),
        sql`not exists (select 1 from ${ownerMembers} m where m.owner_id = ${owners.id})`,
        sql`not exists (select 1 from ${invitations} i where i.owner_id = ${owners.id}
          and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())`,
      ),
    )
    .orderBy(asc(owners.legalName));
}

/** Invites, at their address on file, every owner without access. Owners with no email are returned to fix by hand. */
export async function inviteOwnersWithoutAccess(db: Db, actor: Actor, baseUrl: string) {
  authorize(actor, "owners:invite");
  const pending = await listOwnersWithoutAccess(db, actor);
  const invited: string[] = [];
  const missingEmail: string[] = [];
  for (const o of pending) {
    if (!o.email) {
      missingEmail.push(o.legalName);
      continue;
    }
    await createInvitation(db, actor, { kind: "owner", email: o.email, ownerId: o.id }, baseUrl);
    invited.push(o.legalName);
  }
  return { invited, missingEmail };
}
