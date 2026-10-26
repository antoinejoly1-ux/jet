import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { auditLog, ownerMembers, session, user } from "@/lib/db/schema";
import { addShare, createAircraft, endShare, getAircraft, listAircraft, updateAircraft } from "@/lib/services/aircraft";
import { ConflictError } from "@/lib/services/errors";
import { archiveOwner, createOwner, getOwner, listOwners, updateOwner } from "@/lib/services/owners";
import { listAudit, setStaffRole } from "@/lib/services/team";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;

async function staff(role: "admin" | "finance" | "dispatcher", email = `${role}-${Math.random()}@jet.test`) {
  const [u] = await db.insert(user).values({ name: role, email, emailVerified: true, staffRole: role }).returning();
  return { id: u.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

const plane = (registration = "C-GJTA") =>
  createAircraft(db, admin, { registration, model: "Pilatus PC-24", status: "available" });

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
});

describe("owners", () => {
  it("creates, updates and lists owners, with audit entries", async () => {
    const o = await createOwner(db, admin, {
      type: "company",
      legalName: "Groupe Laurentides",
      email: "",
      locale: "fr",
    });
    expect(o.email).toBeNull();
    await updateOwner(db, admin, o.id, {
      type: "company",
      legalName: "Groupe Laurentides inc.",
      email: "FIN@Example.com",
      locale: "en",
    });
    const detail = await getOwner(db, admin, o.id);
    expect(detail.owner.legalName).toBe("Groupe Laurentides inc.");
    expect(detail.owner.email).toBe("fin@example.com");
    expect(detail.history.map((h) => h.action)).toEqual(["owner.update", "owner.create"]);
    expect(await listOwners(db, admin, { q: "laurent" })).toHaveLength(1);
    expect(await listOwners(db, admin, { q: "nobody" })).toHaveLength(0);
  });

  it("refuses to archive an owner with an active share, then archives once it has ended", async () => {
    const o = await createOwner(db, admin, { type: "person", legalName: "Jean Tremblay", locale: "fr" });
    const a = await plane();
    const s = await addShare(db, admin, a.id, { ownerId: o.id, percent: 25, startsOn: "2026-01-01" });
    await expect(archiveOwner(db, admin, o.id)).rejects.toMatchObject({ code: "owner_has_active_shares" });
    await endShare(db, admin, s.id, { endsOn: "2026-06-30" });
    await archiveOwner(db, admin, o.id);
    expect(await listOwners(db, admin)).toHaveLength(0);
  });

  it("is read-only for dispatchers", async () => {
    const dispatcher = await staff("dispatcher");
    await expect(
      createOwner(db, dispatcher, { type: "person", legalName: "X Y", locale: "fr" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listOwners(db, dispatcher)).resolves.toEqual([]);
  });
});

describe("aircraft and shares", () => {
  it("rejects a registration that is already used", async () => {
    await plane("C-GJTA");
    await expect(plane("c-gjta")).rejects.toMatchObject({ code: "registration_taken" });
  });

  it("validates registration, home base and transponder formats", async () => {
    await expect(
      createAircraft(db, admin, { registration: "not a mark!", model: "PC-24", status: "available" }),
    ).rejects.toThrow();
    const a = await createAircraft(db, admin, {
      registration: "c-fjtb",
      model: "Phenom 300E",
      status: "available",
      homeBase: "cyul",
      icaoHex: "C03B7E",
    });
    expect([a.registration, a.homeBase, a.icaoHex]).toEqual(["C-FJTB", "CYUL", "c03b7e"]);
  });

  it("never lets active shares exceed 100%", async () => {
    const a = await plane();
    const owners = await Promise.all(
      ["A", "B", "C", "D", "E"].map((n) =>
        createOwner(db, admin, { type: "person", legalName: `Owner ${n}`, locale: "fr" }),
      ),
    );
    for (const o of owners.slice(0, 4))
      await addShare(db, admin, a.id, { ownerId: o.id, percent: 25, startsOn: "2026-01-01" });
    expect((await getAircraft(db, admin, a.id)).assignedBp).toBe(10_000);
    await expect(
      addShare(db, admin, a.id, { ownerId: owners[4]!.id, percent: 0.01, startsOn: "2026-01-01" }),
    ).rejects.toMatchObject({
      code: "shares_over_100",
    });
    expect((await listAircraft(db, admin))[0]).toMatchObject({ assignedBp: 10_000, owners: 4 });
  });

  it("frees up percentage when a share ends", async () => {
    const a = await plane();
    const o1 = await createOwner(db, admin, { type: "person", legalName: "One", locale: "fr" });
    const o2 = await createOwner(db, admin, { type: "person", legalName: "Two", locale: "fr" });
    const s1 = await addShare(db, admin, a.id, { ownerId: o1.id, percent: 100, startsOn: "2025-01-01" });
    await endShare(db, admin, s1.id, { endsOn: "2025-12-31" });
    await addShare(db, admin, a.id, { ownerId: o2.id, percent: 100, startsOn: "2026-01-01" });
    expect((await getAircraft(db, admin, a.id)).assignedBp).toBe(10_000);
  });

  it("stores percent as basis points and hours as minutes", async () => {
    const a = await plane();
    const o = await createOwner(db, admin, { type: "person", legalName: "One", locale: "fr" });
    const s = await addShare(db, admin, a.id, {
      ownerId: o.id,
      percent: 12.5,
      annualHours: 25.5,
      startsOn: "2026-01-01",
    });
    expect([s.percentageBp, s.annualHoursMinutes]).toEqual([1250, 1530]);
  });

  it("refuses a second active share for the same owner", async () => {
    const a = await plane();
    const o = await createOwner(db, admin, { type: "person", legalName: "One", locale: "fr" });
    await addShare(db, admin, a.id, { ownerId: o.id, percent: 25, startsOn: "2026-01-01" });
    await expect(
      addShare(db, admin, a.id, { ownerId: o.id, percent: 25, startsOn: "2026-02-01" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("only admins change the fleet", async () => {
    const finance = await staff("finance");
    await plane();
    const [a] = await listAircraft(db, admin);
    await expect(
      updateAircraft(db, finance, a!.id, { registration: "C-GJTA", model: "X", status: "inactive" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("team", () => {
  it("changes roles and signs out removed members", async () => {
    const d = await staff("dispatcher");
    await db.insert(session).values({ userId: d.id, token: "t", expiresAt: new Date(Date.now() + 1e6) });
    await setStaffRole(db, admin, d.id, { role: "finance" });
    expect((await db.select().from(user).where(eq(user.id, d.id)))[0]!.staffRole).toBe("finance");
    await setStaffRole(db, admin, d.id, { role: "none" });
    expect((await db.select().from(user).where(eq(user.id, d.id)))[0]!.staffRole).toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, d.id))).toHaveLength(0);
  });

  it("never removes the last admin", async () => {
    await expect(setStaffRole(db, admin, admin.id, { role: "finance" })).rejects.toMatchObject({ code: "last_admin" });
    const second = await staff("admin");
    await setStaffRole(db, admin, second.id, { role: "dispatcher" });
  });

  it("is admin only, and so is the audit log", async () => {
    const finance = await staff("finance");
    await expect(setStaffRole(db, finance, admin.id, { role: "none" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAudit(db, finance)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("audit log", () => {
  it("filters by action prefix and pages", async () => {
    await createOwner(db, admin, { type: "person", legalName: "One", locale: "fr" });
    await plane();
    const owners = await listAudit(db, admin, { action: "owner." });
    expect(owners.rows.map((r) => r.action)).toEqual(["owner.create"]);
    expect((await listAudit(db, admin)).rows).toHaveLength(2);
    const all = await db.select().from(auditLog);
    expect(all.every((r) => r.actorUserId === admin.id)).toBe(true);
  });
});

it("archiving an owner removes their logins' access", async () => {
  const o = await createOwner(db, admin, { type: "person", legalName: "One", locale: "fr" });
  const [u] = await db.insert(user).values({ name: "o", email: "o@example.com", emailVerified: true }).returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  await archiveOwner(db, admin, o.id);
  expect(await db.select().from(ownerMembers)).toHaveLength(0);
});
