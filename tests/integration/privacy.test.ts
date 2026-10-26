import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { invitations, notifications, ownerMembers, session, transactions, user } from "@/lib/db/schema";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { addTransaction } from "@/lib/services/ledger";
import { sendOwnerMessage } from "@/lib/services/messages";
import { createOwner } from "@/lib/services/owners";
import {
  closePrivacyRequest,
  createPrivacyRequest,
  exportMyData,
  listIncidents,
  listMyPrivacyRequests,
  listPrivacyRequests,
  recordIncident,
  runRetention,
  updateIncidentReporting,
} from "@/lib/services/privacy";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let anne: { actor: Actor; ownerId: string; shareId: string };
let bruno: { actor: Actor; ownerId: string; shareId: string };

async function staff(role: "admin" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function owner(name: string, planeId: string) {
  const o = await createOwner(db, admin, { type: "person", legalName: name, locale: "fr" });
  const s = await addShare(db, admin, planeId, { ownerId: o.id, percent: 50, startsOn: "2025-01-01" });
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  return { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] } satisfies Actor, ownerId: o.id, shareId: s.id };
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  const plane = await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" });
  anne = await owner("Anne", plane.id);
  bruno = await owner("Bruno", plane.id);
});

describe("data portability", () => {
  it("gives a person their own data and nothing of a co-owner's", async () => {
    await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2026-02-01",
      kind: "cost",
      amount: "100",
      currency: "CAD",
    });
    await addTransaction(db, admin, {
      shareId: bruno.shareId,
      occurredOn: "2026-02-01",
      kind: "cost",
      amount: "999",
      currency: "CAD",
    });
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Bonjour" });

    const data = await exportMyData(db, anne.actor);
    expect(data.account.email).toBe("anne@example.com");
    expect(data.owners.map((o) => o.legalName)).toEqual(["Anne"]);
    expect(data.shares.map((s) => s.id)).toEqual([anne.shareId]);
    expect(data.transactions.map((x) => x.amountCents)).toEqual([10_000]);
    expect(data.messages).toEqual([expect.objectContaining({ body: "Bonjour", fromMe: true })]);
    expect(JSON.stringify(data)).not.toContain("Bruno");
  });
});

describe("requests", () => {
  it("are recorded, sent to admins, answered once, and visible to the person", async () => {
    await createPrivacyRequest(db, anne.actor, { kind: "correction", details: "Mon téléphone a changé." });
    await expect(createPrivacyRequest(db, anne.actor, { kind: "correction" })).rejects.toMatchObject({
      code: "privacy_request_open",
    });
    const notices = await db.select().from(notifications).where(eq(notifications.userId, admin.id));
    expect(notices.map((n) => n.type)).toEqual(["privacy.request"]);

    const { open } = await listPrivacyRequests(db, admin);
    expect(open).toHaveLength(1);
    await expect(listPrivacyRequests(db, dispatcher)).rejects.toBeInstanceOf(ForbiddenError);
    await closePrivacyRequest(db, admin, open[0]!.id, { status: "done", response: "Corrigé." });
    await expect(
      closePrivacyRequest(db, admin, open[0]!.id, { status: "done", response: "Encore" }),
    ).rejects.toMatchObject({
      code: "privacy_request_closed",
    });
    const mine = await listMyPrivacyRequests(db, anne.actor);
    expect(mine[0]).toMatchObject({ status: "done", response: "Corrigé." });
  });
});

describe("incident register", () => {
  it("records incidents and when they were reported; admins only", async () => {
    const incident = await recordIncident(db, admin, {
      occurredOn: "2026-10-01",
      discoveredOn: "2026-10-02",
      description: "Une facture envoyée au mauvais destinataire.",
      dataConcerned: "Nom, montant de facture",
      peopleConcerned: "1 propriétaire",
      severity: "serious",
      measures: "Destinataire a confirmé la suppression.",
    });
    await updateIncidentReporting(db, admin, incident.id, {
      reportedToCaiOn: "2026-10-03",
      peopleNotifiedOn: "2026-10-03",
    });
    expect((await listIncidents(db, admin))[0]).toMatchObject({ reportedToCaiOn: "2026-10-03" });
    await expect(
      recordIncident(db, admin, {
        occurredOn: "2026-10-05",
        discoveredOn: "2026-10-01",
        description: "Dates inversées",
        dataConcerned: "x",
        peopleConcerned: "x",
        severity: "low",
        measures: "x",
      }),
    ).rejects.toThrow();
    await expect(listIncidents(db, dispatcher)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("retention", () => {
  it("deletes expired and old operational data, never financial records", async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const old = new Date("2025-01-01T00:00:00Z");
    await db.insert(session).values({ token: "expired", userId: anne.actor.id, expiresAt: old });
    await db.insert(session).values({ token: "live", userId: anne.actor.id, expiresAt: new Date("2027-01-01") });
    await db.insert(invitations).values({
      email: "late@example.com",
      tokenHash: "h1",
      ownerId: anne.ownerId,
      invitedByUserId: admin.id,
      expiresAt: old,
    });
    await db.insert(notifications).values([
      { userId: anne.actor.id, type: "invoice.issued", readAt: old, createdAt: old },
      { userId: anne.actor.id, type: "invoice.issued", createdAt: old }, // unread: kept
    ]);
    await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2019-01-01",
      kind: "cost",
      amount: "1",
      currency: "CAD",
    });

    const counts = await runRetention(db, now);
    expect(counts).toMatchObject({ sessions: 1, invitations: 1, notifications: 1 });
    expect((await db.select().from(session)).map((s) => s.token)).toEqual(["live"]);
    expect(await db.select().from(transactions)).toHaveLength(1);
  });
});
