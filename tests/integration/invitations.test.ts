import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import { auditLog, invitations, ownerMembers, owners, user } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { acceptInvitation, createInvitation, findInvitation, InvitationError } from "@/lib/services/invitations";
import { ForbiddenError } from "@/lib/auth/policy";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
const BASE = "http://localhost:3000";

let admin: Actor;
let ownerId: string;

async function makeUser(email: string, staffRole: "admin" | "finance" | "dispatcher" | null = null) {
  const [row] = await db.insert(user).values({ name: email, email, emailVerified: true, staffRole }).returning();
  return row;
}

const tokenFrom = (url: string) => url.split("/invite/")[1];

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const a = await makeUser("admin@jet.test", "admin");
  admin = { id: a.id, staffRole: "admin", ownerIds: [] };
  const [o] = await db.insert(owners).values({ legalName: "Jean Tremblay" }).returning();
  ownerId = o.id;
});

describe("owner invitation", () => {
  it("links the invited account to the owner, once", async () => {
    const { url } = await createInvitation(db, admin, { kind: "owner", email: "Jean@Example.com", ownerId }, BASE);
    const token = tokenFrom(url);
    const invitee = await makeUser("jean@example.com");

    await acceptInvitation(db, token, invitee.id);

    const members = await db.select().from(ownerMembers).where(eq(ownerMembers.userId, invitee.id));
    expect(members).toHaveLength(1);
    expect(members[0].ownerId).toBe(ownerId);
    expect((await findInvitation(db, token)).state).toBe("accepted");
    await expect(acceptInvitation(db, token, invitee.id)).rejects.toMatchObject({ code: "accepted" });
  });

  it("stores only a hash of the token", async () => {
    const { url } = await createInvitation(db, admin, { kind: "owner", email: "jean@example.com", ownerId }, BASE);
    const [row] = await db.select().from(invitations);
    expect(row.tokenHash).not.toContain(tokenFrom(url));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an account with a different email", async () => {
    const { url } = await createInvitation(db, admin, { kind: "owner", email: "jean@example.com", ownerId }, BASE);
    const stranger = await makeUser("someone-else@example.com");
    await expect(acceptInvitation(db, tokenFrom(url), stranger.id)).rejects.toBeInstanceOf(InvitationError);
    expect(await db.select().from(ownerMembers)).toHaveLength(0);
  });

  it("refuses an expired invitation", async () => {
    const { url } = await createInvitation(db, admin, { kind: "owner", email: "jean@example.com", ownerId }, BASE);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    const invitee = await makeUser("jean@example.com");
    await expect(acceptInvitation(db, tokenFrom(url), invitee.id)).rejects.toMatchObject({ code: "expired" });
  });

  it("refuses an unknown token", async () => {
    const invitee = await makeUser("jean@example.com");
    await expect(acceptInvitation(db, "not-a-real-token", invitee.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes audit entries for creation and acceptance", async () => {
    const { url } = await createInvitation(db, admin, { kind: "owner", email: "jean@example.com", ownerId }, BASE);
    const invitee = await makeUser("jean@example.com");
    await acceptInvitation(db, tokenFrom(url), invitee.id);
    const actions = (await db.select().from(auditLog)).map((r) => r.action).sort();
    expect(actions).toEqual(["invitation.accept", "invitation.create"]);
  });
});

describe("staff invitation", () => {
  it("gives the invited account its staff role", async () => {
    const { url } = await createInvitation(
      db,
      admin,
      { kind: "staff", email: "dispatch@jet.test", staffRole: "dispatcher" },
      BASE,
    );
    const invitee = await makeUser("dispatch@jet.test");
    await acceptInvitation(db, tokenFrom(url), invitee.id);
    const [row] = await db.select().from(user).where(eq(user.id, invitee.id));
    expect(row.staffRole).toBe("dispatcher");
  });

  it("can only be created by an admin", async () => {
    const finance = await makeUser("finance@jet.test", "finance");
    const actor: Actor = { id: finance.id, staffRole: "finance", ownerIds: [] };
    await expect(
      createInvitation(db, actor, { kind: "staff", email: "x@jet.test", staffRole: "admin" }, BASE),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

it("owners cannot invite anyone", async () => {
  const actor: Actor = { id: admin.id, staffRole: null, ownerIds: [ownerId] };
  await expect(
    createInvitation(db, actor, { kind: "owner", email: "friend@example.com", ownerId }, BASE),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
