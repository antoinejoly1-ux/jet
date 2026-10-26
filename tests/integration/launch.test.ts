import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { ownerMembers, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { getAdminStats } from "@/lib/services/dashboard";
import { inviteOwnersWithoutAccess, listOwnersWithoutAccess } from "@/lib/services/invitations";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const sent: Email[] = [];
vi.mock("@/lib/email/send", () => ({ sendEmail: async (e: Email) => void sent.push(e) }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  sent.length = 0;
  const [a] = await db
    .insert(user)
    .values({ name: "admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" })
    .returning();
  admin = { id: a!.id, staffRole: "admin", ownerIds: [] };
});

describe("inviting every owner", () => {
  it("invites owners without access once, and reports those without an email", async () => {
    const linked = await createOwner(db, admin, {
      type: "person",
      legalName: "Anne",
      email: "anne@example.com",
      locale: "fr",
    });
    const [u] = await db
      .insert(user)
      .values({ name: "Anne", email: "anne@example.com", emailVerified: true })
      .returning();
    await db.insert(ownerMembers).values({ ownerId: linked.id, userId: u!.id });
    await createOwner(db, admin, { type: "person", legalName: "Bruno", email: "bruno@example.com", locale: "en" });
    await createOwner(db, admin, { type: "company", legalName: "Côté Holdings", locale: "fr" });

    expect((await listOwnersWithoutAccess(db, admin)).map((o) => o.legalName)).toEqual(["Bruno", "Côté Holdings"]);
    expect((await getAdminStats(db, admin, new Date())).ownersWithoutAccess).toBe(2);

    const result = await inviteOwnersWithoutAccess(db, admin, "http://localhost:3000");
    expect(result).toEqual({ invited: ["Bruno"], missingEmail: ["Côté Holdings"] });
    expect(sent.map((e) => [e.to, e.subject])).toEqual([["bruno@example.com", "Your access to the owner portal"]]);

    // Bruno now has an open invitation, so a second run sends nothing new.
    expect((await inviteOwnersWithoutAccess(db, admin, "http://localhost:3000")).invited).toEqual([]);
    expect(sent).toHaveLength(1);
  });
});
