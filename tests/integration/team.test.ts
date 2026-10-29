import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { ownerMembers, session, user } from "@/lib/db/schema";
import { createInvitation } from "@/lib/services/invitations";
import { createOwner, listOwners } from "@/lib/services/owners";
import { listStaff } from "@/lib/services/team";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcherId: string;

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const [a, d] = await db
    .insert(user)
    .values([
      { name: "Alice Admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" },
      { name: "Denis Dispatch", email: "dispatch@jet.test", emailVerified: true, staffRole: "dispatcher" },
    ])
    .returning();
  admin = { id: a!.id, staffRole: "admin", ownerIds: [] };
  dispatcherId = d!.id;
});

describe("team", () => {
  it("shows each person's own last sign-in, and none for who never signed in", async () => {
    const day = (iso: string) => new Date(iso);
    await db.insert(session).values([
      { userId: admin.id, token: "a1", expiresAt: day("2027-01-01"), createdAt: day("2026-10-01T12:00:00Z") },
      { userId: admin.id, token: "a2", expiresAt: day("2027-01-01"), createdAt: day("2026-10-20T12:00:00Z") },
    ]);
    const staff = await listStaff(db, admin);
    const byName = Object.fromEntries(staff.map((s) => [s.name, s.lastSignInAt?.toISOString() ?? null]));
    expect(byName).toEqual({ "Alice Admin": "2026-10-20T12:00:00.000Z", "Denis Dispatch": null });
  });
});

describe("owners by portal access", () => {
  it("tells apart owners with an account, an invitation on its way, or neither", async () => {
    const make = (legalName: string) => createOwner(db, admin, { type: "person", legalName, locale: "fr" });
    const [withAccount, invited] = [await make("Anne Compte"), await make("Bruno Invité")];
    await make("Claire Rien");
    await db.insert(ownerMembers).values({ ownerId: withAccount.id, userId: dispatcherId });
    await createInvitation(
      db,
      admin,
      { kind: "owner", email: "bruno@example.com", ownerId: invited.id },
      "http://localhost:3000",
    );
    const names = async (access?: "active" | "invited" | "not_invited") =>
      (await listOwners(db, admin, { access })).map((o) => [o.legalName, o.members, o.invited]);
    expect(await names()).toEqual([
      ["Anne Compte", 1, false],
      ["Bruno Invité", 0, true],
      ["Claire Rien", 0, false],
    ]);
    expect(await names("active")).toEqual([["Anne Compte", 1, false]]);
    expect(await names("invited")).toEqual([["Bruno Invité", 0, true]]);
    expect(await names("not_invited")).toEqual([["Claire Rien", 0, false]]);
  });
});
