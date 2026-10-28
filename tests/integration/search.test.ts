import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createAircraft } from "@/lib/services/aircraft";
import { createOwner } from "@/lib/services/owners";
import { searchAdmin } from "@/lib/services/search";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const [u] = await db
    .insert(user)
    .values({ name: "admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" })
    .returning();
  admin = { id: u!.id, staffRole: "admin", ownerIds: [] };
  await createAircraft(db, admin, { registration: "C-GJTA", model: "Pilatus PC-12", status: "available" });
  await createOwner(db, admin, { type: "company", legalName: "Société Énergie Boréale", locale: "fr" });
});

describe("admin search", () => {
  it("finds aircraft and owners, accents and case aside", async () => {
    expect((await searchAdmin(db, admin, "gjta")).map((h) => [h.kind, h.title])).toEqual([["aircraft", "C-GJTA"]]);
    const hits = await searchAdmin(db, admin, "energie boreale");
    expect(hits[0]).toMatchObject({ kind: "owner", title: "Société Énergie Boréale" });
    expect(await searchAdmin(db, admin, "x")).toEqual([]);
  });

  it("is for staff only", async () => {
    await expect(searchAdmin(db, { id: admin.id, staffRole: null, ownerIds: [] }, "gjta")).rejects.toThrow();
  });
});
