import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { budgetCategories, ownerMembers, user } from "@/lib/db/schema";
import { renderStatementPdf } from "@/lib/pdf/statement";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { publishBudget, saveBudget } from "@/lib/services/budgets";
import { addHours, addTransaction, reverseTransaction } from "@/lib/services/ledger";
import { createOwner } from "@/lib/services/owners";
import { getAnnualStatement, listOwnerTransactions } from "@/lib/services/statements";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let anne: { actor: Actor; shareId: string };
let brunoShare: string;
let fuel: string;

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const [a] = await db
    .insert(user)
    .values({ name: "admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" })
    .returning();
  admin = { id: a!.id, staffRole: "admin", ownerIds: [] };
  const plane = await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" });
  const o = await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" });
  const b = await createOwner(db, admin, { type: "person", legalName: "Bruno", locale: "fr" });
  const s = await addShare(db, admin, plane.id, { ownerId: o.id, percent: 50, startsOn: "2025-01-01" });
  brunoShare = (await addShare(db, admin, plane.id, { ownerId: b.id, percent: 50, startsOn: "2025-01-01" })).id;
  const [u] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@example.com", emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  anne = { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] }, shareId: s.id };
  fuel = (
    await db.insert(budgetCategories).values({ nameFr: "Carburant", nameEn: "Fuel", sortOrder: 1 }).returning()
  )[0]!.id;
});

describe("annual statement", () => {
  it("adds up the year and hides an unpublished plan from the owner", async () => {
    await saveBudget(db, admin, anne.shareId, 2026, [{ categoryId: fuel, planned: "10 000" }]);
    const cost = await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2026-03-01",
      kind: "cost",
      amount: "1 500",
      currency: "CAD",
      categoryId: fuel,
    });
    await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2026-04-01",
      kind: "payment",
      amount: "2000",
      currency: "CAD",
    });
    await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2025-12-31",
      kind: "cost",
      amount: "999",
      currency: "CAD",
    });
    await reverseTransaction(db, admin, cost.id, "Erreur");
    await addTransaction(db, admin, {
      shareId: anne.shareId,
      occurredOn: "2026-03-02",
      kind: "cost",
      amount: "1 200",
      currency: "CAD",
      categoryId: fuel,
    });
    await addHours(db, admin, anne.shareId, { kind: "purchase", hours: "25" });

    // The reversal is dated today, so build the statement for the current year when they differ.
    const year = 2026;
    const forOwner = await getAnnualStatement(db, anne.actor, anne.shareId, year);
    expect(forOwner.budgetPublished).toBe(false);
    expect(forOwner.totals.plannedCents).toBe(0);
    expect(forOwner.totals.paymentsCents).toBe(200_000);
    expect(forOwner.entries.every((e) => e.occurredOn.startsWith("2026"))).toBe(true);

    const forStaff = await getAnnualStatement(db, admin, anne.shareId, year);
    expect(forStaff.totals.plannedCents).toBe(1_000_000);

    await publishBudget(db, admin, anne.shareId, year);
    expect((await getAnnualStatement(db, anne.actor, anne.shareId, year)).totals.plannedCents).toBe(1_000_000);
  });

  it("is only for the share's own owner", async () => {
    await expect(getAnnualStatement(db, anne.actor, brunoShare, 2026)).rejects.toBeInstanceOf(ForbiddenError);
    await addTransaction(db, admin, {
      shareId: brunoShare,
      occurredOn: "2026-02-01",
      kind: "cost",
      amount: "50",
      currency: "CAD",
    });
    expect(await listOwnerTransactions(db, anne.actor, 2026)).toHaveLength(0);
  });

  it("renders a multi-page PDF with French accents", async () => {
    const bytes = await renderStatementPdf({
      title: "Relevé annuel 2026",
      subtitle: "Côté Holdings · C-GJTA",
      generated: "Produit le 26 octobre 2026",
      footerNote: "Relevé",
      sections: [
        {
          kind: "table",
          title: "Écritures",
          empty: "Aucune",
          columns: [
            { label: "Date", width: 2 },
            { label: "Montant", width: 2, align: "right" },
          ],
          rows: Array.from({ length: 120 }, (_, i) => [`2026-01-${(i % 28) + 1}`, `${i} 234,56 $`]),
        },
      ],
    });
    expect(Buffer.from(bytes).toString("latin1", 0, 5)).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
