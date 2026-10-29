import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memberAccess, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { aircraft, notifications, ownerMembers, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft, getAircraft, updateAircraft } from "@/lib/services/aircraft";
import { listOwnerAircraft } from "@/lib/services/availability";
import { getOwnerFinances } from "@/lib/services/budgets";
import { getOwnerHome } from "@/lib/services/dashboard";
import {
  archiveHoldingCompany,
  createHoldingCompany,
  getHoldingCompany,
  listHoldingCompanies,
} from "@/lib/services/holding-companies";
import { acceptInvitation, createInvitation } from "@/lib/services/invitations";
import { createInvoice, listOwnerInvoices } from "@/lib/services/invoices";
import { getOwnerThread, sendOwnerMessage } from "@/lib/services/messages";
import { createOwner, updateOwnerMember } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const sent: Email[] = [];
vi.mock("@/lib/email/send", () => ({ sendEmail: async (e: Email) => void sent.push(e) }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let finance: Actor;
let dispatcher: Actor;
let planeId: string;
let ownerId: string;
let shareId: string;

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

/** A login for the owner with a role, and the actor the session would build for it. */
async function member(name: string, role: "owner" | "assistant" | "read_only", canSeeFinances = false) {
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  const [m] = await db.insert(ownerMembers).values({ ownerId, userId: u!.id, role, canSeeFinances }).returning();
  const access = memberAccess(role, canSeeFinances);
  const actor: Actor = {
    id: u!.id,
    staffRole: null,
    ownerIds: [ownerId],
    financeOwnerIds: access.finances ? [ownerId] : [],
    actingOwnerIds: access.acts ? [ownerId] : [],
  };
  return { actor, memberId: m!.id };
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  sent.length = 0;
  admin = await staff("admin");
  finance = await staff("finance");
  dispatcher = await staff("dispatcher");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" })).id;
  ownerId = (await createOwner(db, admin, { type: "person", legalName: "Jean Tremblay", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId, percent: 25, startsOn: "2025-01-01" })).id;
});

describe("holding companies", () => {
  it("own aircraft, list their shareholders, and can't be archived while they own one", async () => {
    const company = await createHoldingCompany(db, finance, {
      legalName: "Gestion PC-24 inc.",
      registrationNumber: "1170000000",
      email: "",
    });
    await expect(createHoldingCompany(db, dispatcher, { legalName: "Non" })).rejects.toThrow();

    const plane = (await getAircraft(db, admin, planeId)).aircraft;
    await updateAircraft(db, admin, planeId, {
      registration: plane.registration,
      model: plane.model,
      status: plane.status,
      holdingCompanyId: company.id,
    });
    expect((await getAircraft(db, admin, planeId)).aircraft.holdingCompanyName).toBe("Gestion PC-24 inc.");
    expect((await listHoldingCompanies(db, dispatcher)).map((c) => c.aircraft)).toEqual([["C-GJTA"]]);
    const detail = await getHoldingCompany(db, finance, company.id);
    expect(detail.shareholders.map((s) => [s.ownerName, s.percentageBp])).toEqual([["Jean Tremblay", 2500]]);

    await expect(archiveHoldingCompany(db, finance, company.id)).rejects.toMatchObject({
      code: "holding_company_has_aircraft",
    });
    await db.update(aircraft).set({ holdingCompanyId: null }).where(eq(aircraft.id, planeId));
    await archiveHoldingCompany(db, finance, company.id);
    expect(await listHoldingCompanies(db, finance)).toEqual([]);
    // An archived company can't take an aircraft.
    await expect(
      updateAircraft(db, admin, planeId, {
        registration: "C-GJTA",
        model: "PC-24",
        status: "available",
        holdingCompanyId: company.id,
      }),
    ).rejects.toMatchObject({ entity: "holding_company" });
  });

  it("show to the owner on their aircraft", async () => {
    const company = await createHoldingCompany(db, finance, { legalName: "Gestion PC-24 inc." });
    await db.update(aircraft).set({ holdingCompanyId: company.id }).where(eq(aircraft.id, planeId));
    const { actor } = await member("Jean", "owner");
    expect((await listOwnerAircraft(db, actor))[0]!.holdingCompanyName).toBe("Gestion PC-24 inc.");
  });
});

describe("member roles", () => {
  const invoice = () => ({ shareId, number: "INV-1", issuedOn: "2026-03-02", total: "1 000,00" });

  it("keep finances from assistants unless allowed", async () => {
    const jean = await member("Jean", "owner");
    const julie = await member("Julie", "assistant");
    await createInvoice(db, finance, invoice());

    expect(await listOwnerInvoices(db, jean.actor)).toHaveLength(1);
    expect(await listOwnerInvoices(db, julie.actor)).toEqual([]);
    expect(await getOwnerFinances(db, julie.actor, 2026)).toEqual([]);
    const [home] = await getOwnerHome(db, julie.actor);
    expect(home).toMatchObject({ showFinances: false, budget: null, latestInvoice: null });
    expect((await getOwnerHome(db, jean.actor))[0]).toMatchObject({ showFinances: true });

    // Only the owner hears about the invoice.
    const invoiceNotices = async (userId: string) =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.type, "invoice.issued")));
    expect(await invoiceNotices(jean.actor.id)).toHaveLength(1);
    expect(await invoiceNotices(julie.actor.id)).toHaveLength(0);
    expect(sent.map((e) => e.to)).toEqual(["jean@example.com"]);

    // Staff turn finances on for her.
    await updateOwnerMember(db, finance, ownerId, julie.memberId, { role: "assistant", canSeeFinances: true });
    const [row] = await db.select().from(ownerMembers).where(eq(ownerMembers.id, julie.memberId));
    expect(row).toMatchObject({ role: "assistant", canSeeFinances: true });
    await expect(
      updateOwnerMember(db, dispatcher, ownerId, julie.memberId, { role: "owner", canSeeFinances: false }),
    ).rejects.toThrow();
  });

  it("let read-only members read the thread but not write", async () => {
    const jean = await member("Jean", "owner");
    const lea = await member("Lea", "read_only", true);
    await sendOwnerMessage(db, jean.actor, ownerId, { body: "Bonjour" });
    expect((await getOwnerThread(db, lea.actor, ownerId, { markRead: false })).messages).toHaveLength(1);
    await expect(sendOwnerMessage(db, lea.actor, ownerId, { body: "Allo" })).rejects.toThrow();
    // Read-only with finances on still sees invoices.
    await createInvoice(db, finance, invoice());
    expect(await listOwnerInvoices(db, lea.actor)).toHaveLength(1);
  });

  it("come from the invitation", async () => {
    const { url } = await createInvitation(
      db,
      finance,
      { kind: "owner", email: "julie@example.com", ownerId, memberRole: "assistant", canSeeFinances: true },
      "http://localhost:3000",
    );
    const [u] = await db
      .insert(user)
      .values({ name: "Julie", email: "julie@example.com", emailVerified: true })
      .returning();
    await acceptInvitation(db, url.split("/invite/")[1]!, u!.id);
    const [row] = await db.select().from(ownerMembers).where(eq(ownerMembers.userId, u!.id));
    expect(row).toMatchObject({ role: "assistant", canSeeFinances: true });
  });
});
