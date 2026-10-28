import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { createAircraft } from "@/lib/services/aircraft";
import { createOwner } from "@/lib/services/owners";
import { scheduleFlight } from "@/lib/services/flights";
import { adminShortcuts, searchAdmin } from "@/lib/services/search";
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

describe("admin search: flights and shortcuts", () => {
  it("finds flights by registration, airports and date", async () => {
    const plane = (await searchAdmin(db, admin, "gjta"))[0]!;
    await scheduleFlight(db, admin, {
      aircraftId: plane.id,
      shareId: "",
      fromAirport: "CYUL",
      toAirport: "CYQB",
      departsAt: "2026-11-03T09:00",
      arrivesAt: "",
    });
    const hits = await searchAdmin(db, admin, "cyul cyqb");
    expect(hits.map((h) => [h.kind, h.title, h.detail])).toEqual([["flight", "CYUL → CYQB", "C-GJTA · 2026-11-03"]]);
    expect((await searchAdmin(db, admin, "gjta 2026-11-03")).map((h) => h.kind)).toEqual(["flight"]);
  });

  it("offers only the pages and actions the role can use", () => {
    const keys = (actor: Actor) => adminShortcuts(actor).map((s) => s.key);
    const dispatcher: Actor = { id: admin.id, staffRole: "dispatcher", ownerIds: [] };
    expect(keys(admin)).toEqual(expect.arrayContaining(["newFlight", "invite", "flights", "invoices", "settings"]));
    expect(keys(dispatcher)).toContain("flights");
    expect(keys(dispatcher)).not.toContain("invoices");
    expect(keys(dispatcher)).not.toContain("invite");
    expect(() => adminShortcuts({ id: admin.id, staffRole: null, ownerIds: [] })).toThrow();
  });
});
