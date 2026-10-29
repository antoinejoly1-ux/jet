import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { budgetCategories, notifications, ownerMembers, outboxEvents, transactions, user } from "@/lib/db/schema";
import { localPath } from "@/lib/storage/local";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import {
  copyBudgetFromPreviousYear,
  getBudget,
  getOwnerFinances,
  publishBudget,
  saveBudget,
} from "@/lib/services/budgets";
import { completeUpload, fileDownloadUrl, requestUpload } from "@/lib/services/files";
import { commitImport, validateImport } from "@/lib/services/imports";
import { createInvoice, listOwnerInvoices, markInvoicePaid, voidInvoice } from "@/lib/services/invoices";
import { addHours, addTransaction, listHours, listTransactions, reverseTransaction } from "@/lib/services/ledger";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let finance: Actor;
let dispatcher: Actor;
let ownerA: { actor: Actor; ownerId: string; shareId: string };
let ownerB: { actor: Actor; ownerId: string; shareId: string };
let fuel: string;
const year = 2026;

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function ownerWithShare(name: string, aircraftId: string, percent: number) {
  const o = await createOwner(db, admin, { type: "person", legalName: name, locale: "fr" });
  const s = await addShare(db, admin, aircraftId, { ownerId: o.id, percent, startsOn: "2025-01-01" });
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  return { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] } satisfies Actor, ownerId: o.id, shareId: s.id };
}

beforeAll(async () => {
  await t.setup();
  await rm(path.resolve("tmp/test-storage"), { recursive: true, force: true });
});
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  finance = await staff("finance");
  dispatcher = await staff("dispatcher");
  const plane = await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" });
  ownerA = await ownerWithShare("Anne", plane.id, 50);
  ownerB = await ownerWithShare("Bruno", plane.id, 50);
  const [category] = await db
    .insert(budgetCategories)
    .values({ nameFr: "Carburant", nameEn: "Fuel", sortOrder: 1 })
    .returning();
  fuel = category!.id;
});

describe("transactions ledger", () => {
  it("adds entries in cents and reverses them once, never edits", async () => {
    const tx = await addTransaction(db, finance, {
      shareId: ownerA.shareId,
      occurredOn: "2026-03-01",
      kind: "cost",
      amount: "1 234,56",
      currency: "CAD",
      categoryId: fuel,
    });
    expect(tx.amountCents).toBe(123456);
    const rev = await reverseTransaction(db, finance, tx.id, "Saisie en double");
    expect(rev.amountCents).toBe(-123456);
    expect(rev.reversesId).toBe(tx.id);
    await expect(reverseTransaction(db, finance, tx.id, "again")).rejects.toMatchObject({ code: "already_reversed" });
    await expect(reverseTransaction(db, finance, rev.id, "undo")).rejects.toMatchObject({
      code: "cannot_reverse_a_reversal",
    });
    const list = await listTransactions(db, finance, { shareId: ownerA.shareId });
    expect(list.find((r) => r.id === tx.id)?.reversedById).toBe(rev.id);
  });

  it("rejects zero and unparseable amounts", async () => {
    await expect(
      addTransaction(db, finance, {
        shareId: ownerA.shareId,
        occurredOn: "2026-03-01",
        kind: "cost",
        amount: "0",
        currency: "CAD",
      }),
    ).rejects.toThrow();
    await expect(
      addTransaction(db, finance, {
        shareId: ownerA.shareId,
        occurredOn: "2026-03-01",
        kind: "cost",
        amount: "douze",
        currency: "CAD",
      }),
    ).rejects.toThrow();
  });

  it("is closed to dispatchers", async () => {
    await expect(
      addTransaction(db, dispatcher, {
        shareId: ownerA.shareId,
        occurredOn: "2026-03-01",
        kind: "cost",
        amount: "10",
        currency: "CAD",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listTransactions(db, dispatcher)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("hours ledger", () => {
  it("keeps a running balance from purchases and adjustments", async () => {
    await addHours(db, finance, ownerA.shareId, { kind: "purchase", hours: "50", note: "Bloc 2026" });
    await addHours(db, finance, ownerA.shareId, { kind: "adjustment", hours: "-1.5", note: "Correction" });
    const { balanceMinutes, entries } = await listHours(db, finance, ownerA.shareId);
    expect(balanceMinutes).toBe(50 * 60 - 90);
    expect(entries).toHaveLength(2);
    await expect(addHours(db, finance, ownerA.shareId, { kind: "purchase", hours: "-5" })).rejects.toMatchObject({
      code: "purchase_must_be_positive",
    });
  });
});

describe("budgets", () => {
  it("compares planned with actual costs per category", async () => {
    await saveBudget(db, finance, ownerA.shareId, year, [{ categoryId: fuel, planned: "100 000" }]);
    await addTransaction(db, finance, {
      shareId: ownerA.shareId,
      occurredOn: "2026-05-01",
      kind: "cost",
      amount: "25000",
      currency: "CAD",
      categoryId: fuel,
    });
    const view = await getBudget(db, finance, ownerA.shareId, year);
    expect(view.budget?.status).toBe("draft");
    expect(view.rows[0]).toMatchObject({ plannedCents: 10_000_000, spentCents: 2_500_000, remainingCents: 7_500_000 });
  });

  it("stays hidden from the owner until published, then notifies them", async () => {
    await saveBudget(db, finance, ownerA.shareId, year, [{ categoryId: fuel, planned: "100000" }]);
    let [mine] = await getOwnerFinances(db, ownerA.actor, year);
    expect(mine!.published).toBe(false);
    expect(mine!.totals.plannedCents).toBe(0);

    await publishBudget(db, finance, ownerA.shareId, year);
    [mine] = await getOwnerFinances(db, ownerA.actor, year);
    expect(mine!.published).toBe(true);
    expect(mine!.totals.plannedCents).toBe(10_000_000);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, ownerA.actor.id));
    expect(notes.map((n) => n.type)).toEqual(["budget.published"]);
  });

  it("copies last year's amounts into a new year", async () => {
    await saveBudget(db, finance, ownerA.shareId, year - 1, [{ categoryId: fuel, planned: "80000" }]);
    await copyBudgetFromPreviousYear(db, finance, ownerA.shareId, year);
    expect((await getBudget(db, finance, ownerA.shareId, year)).totals.plannedCents).toBe(8_000_000);
    await expect(copyBudgetFromPreviousYear(db, finance, ownerA.shareId, year)).rejects.toMatchObject({
      code: "budget_exists",
    });
  });

  it("owners only ever see their own shares", async () => {
    const mine = await getOwnerFinances(db, ownerA.actor, year);
    expect(mine.map((s) => s.shareId)).toEqual([ownerA.shareId]);
  });
});

describe("invoices", () => {
  const invoice = (overrides = {}) => ({
    shareId: ownerA.shareId,
    number: "INV-2026-0001",
    issuedOn: "2026-03-02",
    total: "8 297,00",
    currency: "CAD" as const,
    ...overrides,
  });

  it("issues an invoice, notifies the owner and queues an event", async () => {
    const inv = await createInvoice(db, finance, invoice());
    expect(inv.totalCents).toBe(829_700);
    expect(await db.select().from(notifications).where(eq(notifications.userId, ownerA.actor.id))).toHaveLength(1);
    expect((await db.select().from(outboxEvents)).map((e) => e.type)).toEqual(["invoice.issued"]);
    await expect(createInvoice(db, finance, invoice())).rejects.toMatchObject({ code: "invoice_number_taken" });
  });

  it("shows each owner only their own invoices", async () => {
    await createInvoice(db, finance, invoice());
    await createInvoice(db, finance, invoice({ shareId: ownerB.shareId, number: "INV-2026-0002" }));
    expect((await listOwnerInvoices(db, ownerA.actor)).map((i) => i.number)).toEqual(["INV-2026-0001"]);
    expect((await listOwnerInvoices(db, ownerB.actor)).map((i) => i.number)).toEqual(["INV-2026-0002"]);
  });

  it("is marked paid once, and voided with a reason, never deleted", async () => {
    const paid = await createInvoice(db, finance, invoice({ number: "INV-2026-0009" }));
    await markInvoicePaid(db, finance, paid.id);
    await expect(markInvoicePaid(db, finance, paid.id)).rejects.toMatchObject({ code: "invoice_not_open" });
    // Paid: a refund or a credit, not a void.
    await expect(voidInvoice(db, finance, paid.id, "Erreur")).rejects.toMatchObject({ code: "invoice_paid" });
    const inv = await createInvoice(db, finance, invoice());
    await expect(voidInvoice(db, finance, inv.id, "")).rejects.toMatchObject({ code: "void_reason_required" });
    await voidInvoice(db, finance, inv.id, "Facturé au mauvais propriétaire");
    const mine = (await listOwnerInvoices(db, ownerA.actor)).find((i) => i.id === inv.id);
    expect(mine).toMatchObject({ status: "void", voidReason: "Facturé au mauvais propriétaire" });
  });
});

describe("files", () => {
  const pdf = Buffer.from("%PDF-1.7 test invoice");
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const upload = async () => {
    const req = {
      purpose: "invoice" as const,
      filename: "Facture mars.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      sha256,
    };
    const { key, ticket } = await requestUpload(db, finance, req);
    expect(ticket.url).toContain("/api/storage/local?op=put");
    // Stand-in for the browser's PUT to the signed URL.
    await mkdir(path.dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), pdf);
    return completeUpload(db, finance, { ...req, key });
  };

  it("refuses types and sizes outside the rules before signing anything", async () => {
    await expect(
      requestUpload(db, finance, {
        purpose: "invoice",
        filename: "x.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 10,
        sha256,
      }),
    ).rejects.toMatchObject({ code: "file_type_not_allowed" });
    await expect(
      requestUpload(db, finance, {
        purpose: "invoice",
        filename: "big.pdf",
        contentType: "application/pdf",
        sizeBytes: 26 * 1024 * 1024,
        sha256,
      }),
    ).rejects.toMatchObject({ code: "file_too_large" });
    await expect(
      requestUpload(db, dispatcher, {
        purpose: "invoice",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        sha256,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only records a file that really arrived, and flags duplicates", async () => {
    const { key } = await requestUpload(db, finance, {
      purpose: "invoice",
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      sha256,
    });
    await expect(
      completeUpload(db, finance, {
        purpose: "invoice",
        filename: "a.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        sha256,
        key,
      }),
    ).rejects.toMatchObject({ code: "upload_missing" });
    const first = await upload();
    expect(first.duplicates).toHaveLength(0);
    const second = await upload();
    expect(second.duplicates.map((d) => d.id)).toEqual([first.file.id]);
  });

  it("lets the invoice's owner download its PDF, and nobody else", async () => {
    const { file } = await upload();
    await createInvoice(db, finance, {
      shareId: ownerA.shareId,
      number: "INV-1",
      issuedOn: "2026-03-02",
      total: "100",
      currency: "CAD",
      fileId: file.id,
    });
    expect(await fileDownloadUrl(db, ownerA.actor, file.id)).toContain("op=get");
    expect(await fileDownloadUrl(db, finance, file.id)).toContain("op=get");
    await expect(fileDownloadUrl(db, ownerB.actor, file.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("spreadsheet import", () => {
  const mapping = {
    date: "Date",
    registration: "Immat",
    owner: "Propriétaire",
    kind: "Type",
    amount: "Montant",
    category: "Catégorie",
    description: "Note",
  };
  const rows = [
    {
      Date: "01/03/2026",
      Immat: "c-gjta",
      Propriétaire: "anne",
      Type: "Coût",
      Montant: "1 000,00",
      Catégorie: "carburant",
      Note: "Vol YUL-PBI",
    },
    { Date: "2026-03-05", Immat: "C-GJTA", Propriétaire: "Bruno", Type: "", Montant: "250", Catégorie: "", Note: "" },
    { Date: "31/02/2026", Immat: "C-GJTA", Propriétaire: "Anne", Type: "Coût", Montant: "10", Catégorie: "", Note: "" },
    {
      Date: "2026-03-06",
      Immat: "C-XXXX",
      Propriétaire: "Anne",
      Type: "Coût",
      Montant: "10",
      Catégorie: "Snacks",
      Note: "",
    },
  ];

  it("reports each bad row and field without writing anything", async () => {
    const result = await validateImport(db, finance, mapping, rows);
    expect(result.valid.map((r) => r.row)).toEqual([2, 3]);
    expect(result.valid[0]).toMatchObject({
      shareId: ownerA.shareId,
      kind: "cost",
      amountCents: 100_000,
      categoryId: fuel,
    });
    expect(result.errors).toEqual([
      { row: 4, field: "date", code: "invalid_date" },
      { row: 5, field: "owner", code: "share_not_found" },
      { row: 5, field: "category", code: "unknown_category" },
    ]);
    expect(await db.select().from(transactions)).toHaveLength(0);
  });

  it("imports the valid rows in one go and keeps a record", async () => {
    const { file } = await (async () => {
      const csv = Buffer.from("Date,Montant\n");
      const sha256 = createHash("sha256").update(csv).digest("hex");
      const req = {
        purpose: "import" as const,
        filename: "mars.csv",
        contentType: "text/csv",
        sizeBytes: csv.length,
        sha256,
      };
      const { key } = await requestUpload(db, finance, req);
      await mkdir(path.dirname(localPath(key)), { recursive: true });
      await writeFile(localPath(key), csv);
      return completeUpload(db, finance, { ...req, key });
    })();
    const record = await commitImport(db, finance, { fileId: file.id, mapping, rows });
    expect(record).toMatchObject({ rowsImported: 2, rowsRejected: 2, status: "committed" });
    const imported = await db.select().from(transactions);
    expect(imported.every((r) => r.source === "import")).toBe(true);
  });

  it("requires the key columns to be mapped", async () => {
    await expect(validateImport(db, finance, { date: "Date" }, rows)).rejects.toThrow();
  });
});

describe("upload limit", () => {
  it("stops a person after an hour's worth of uploads", async () => {
    const { files } = await import("@/lib/db/schema");
    const { UPLOADS_PER_HOUR } = await import("@/lib/services/files");
    await db.insert(files).values(
      Array.from({ length: UPLOADS_PER_HOUR }, (_, i) => ({
        storageKey: `invoices/limit-${i}.pdf`,
        contentType: "application/pdf",
        sizeBytes: 10,
        sha256: "a".repeat(64),
        uploadedByUserId: finance.id,
      })),
    );
    await expect(
      requestUpload(db, finance, {
        purpose: "invoice",
        filename: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        sha256: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "too_many_uploads" });
  });
});
