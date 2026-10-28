import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { aircraft, files, flightReports, invoices, owners, shares, transactions } from "@/lib/db/schema";
import { authorize, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { formatMoney } from "@/lib/format";
import { zonedDay } from "@/lib/time";
import { invoiceInput, type InvoiceInput } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { emit } from "./outbox";
import { ConflictError, NotFoundError } from "./errors";
import { notifyOwnerMembers, sendPendingEmails } from "./owner-notifications";
import { reverseReservesOf } from "./reserves";

const columns = {
  id: invoices.id,
  number: invoices.number,
  issuedOn: invoices.issuedOn,
  dueOn: invoices.dueOn,
  totalCents: invoices.totalCents,
  currency: invoices.currency,
  status: invoices.status,
  voidReason: invoices.voidReason,
  voidedOn: invoices.voidedOn,
  paidOn: invoices.paidOn,
  paymentReference: invoices.paymentReference,
  fileId: invoices.fileId,
  fileName: files.originalName,
  /** Set when the portal generated it: it has lines, a detail page and a PDF drawn on demand. */
  holdingCompanyId: invoices.holdingCompanyId,
  shareId: shares.id,
  ownerId: owners.id,
  ownerName: owners.legalName,
  registration: aircraft.registration,
};

const base = (db: Db) =>
  db
    .select(columns)
    .from(invoices)
    .innerJoin(shares, eq(shares.id, invoices.shareId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .leftJoin(files, eq(files.id, invoices.fileId));

type ListOpts = { status?: string; year?: number; q?: string };

/** "overdue" is an issued invoice past its due date, a view of "issued" rather than a status of its own. */
function listFilters(opts: ListOpts, today: string) {
  const filters: SQL[] = [];
  if (opts.status === "issued" || opts.status === "paid" || opts.status === "void")
    filters.push(eq(invoices.status, opts.status));
  if (opts.status === "overdue") filters.push(eq(invoices.status, "issued"), lt(invoices.dueOn, today));
  if (opts.year)
    filters.push(gte(invoices.issuedOn, `${opts.year}-01-01`), lt(invoices.issuedOn, `${opts.year + 1}-01-01`));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    filters.push(or(ilike(invoices.number, q), ilike(owners.legalName, q), ilike(aircraft.registration, q))!);
  }
  return filters;
}

/** Every invoice, for the back office (API and CSV). Filter by status, year or a search on number, owner or aircraft. */
export async function listInvoices(db: Db, actor: Actor, opts: ListOpts = {}) {
  authorize(actor, "finance:read");
  const filters = listFilters(opts, zonedDay(new Date()));
  return base(db)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(invoices.issuedOn), desc(invoices.number))
    .limit(500);
}

export const INVOICES_PER_PAGE = 50;

/**
 * One page of the back office's invoices, with what's owed: open invoices
 * (receivable) and those past due, for the same filters.
 */
export async function listInvoicesPage(db: Db, actor: Actor, opts: ListOpts & { page?: number } = {}) {
  authorize(actor, "finance:read");
  const today = zonedDay(new Date());
  const filters = listFilters(opts, today);
  const where = filters.length ? and(...filters) : undefined;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [rows, [totals]] = await Promise.all([
    base(db)
      .where(where)
      .orderBy(desc(invoices.issuedOn), desc(invoices.number))
      .limit(INVOICES_PER_PAGE)
      .offset((page - 1) * INVOICES_PER_PAGE),
    db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        receivableCents:
          sql<number>`coalesce(sum(${invoices.totalCents}) filter (where ${invoices.status} = 'issued'), 0)`.mapWith(
            Number,
          ),
        receivableCount: sql<number>`count(*) filter (where ${invoices.status} = 'issued')`.mapWith(Number),
        overdueCents:
          sql<number>`coalesce(sum(${invoices.totalCents}) filter (where ${invoices.status} = 'issued' and ${invoices.dueOn} < ${today}), 0)`.mapWith(
            Number,
          ),
        overdueCount:
          sql<number>`count(*) filter (where ${invoices.status} = 'issued' and ${invoices.dueOn} < ${today})`.mapWith(
            Number,
          ),
      })
      .from(invoices)
      .innerJoin(shares, eq(shares.id, invoices.shareId))
      .innerJoin(owners, eq(owners.id, shares.ownerId))
      .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
      .where(where),
  ]);
  const t = totals ?? { count: 0, receivableCents: 0, receivableCount: 0, overdueCents: 0, overdueCount: 0 };
  return {
    rows: rows.map((r) => ({ ...r, overdue: r.status === "issued" && !!r.dueOn && r.dueOn < today })),
    page,
    pages: Math.max(1, Math.ceil(t.count / INVOICES_PER_PAGE)),
    ...t,
  };
}

/** The signed-in owner's own invoices, newest first. */
export async function listOwnerInvoices(db: Db, actor: Actor) {
  const ids = financeOwnerIds(actor);
  if (ids.length === 0) return [];
  authorize(actor, "finance:read", { ownerIds: ids });
  return base(db)
    .where(inArray(shares.ownerId, [...ids]))
    .orderBy(desc(invoices.issuedOn), desc(invoices.number));
}

/**
 * Issues an invoice. The owner's logins are notified in the app and by email,
 * and an `invoice.issued` event is queued for connected systems.
 */
export async function createInvoice(db: Db, actor: Actor, raw: InvoiceInput) {
  authorize(actor, "finance:write");
  const input = invoiceInput.parse(raw);

  const { invoice, emails } = await db.transaction(async (tx) => {
    const [share] = await tx
      .select({ id: shares.id, ownerId: shares.ownerId, registration: aircraft.registration })
      .from(shares)
      .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
      .where(eq(shares.id, input.shareId));
    if (!share) throw new NotFoundError("share");

    const taken = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, input.number)).limit(1);
    if (taken.length > 0) throw new ConflictError("invoice_number_taken");
    if (input.flightId) {
      // One live invoice per flight: its costs reach the owner's ledger once.
      const [live] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.flightId, input.flightId), ne(invoices.status, "void")))
        .limit(1);
      if (live) throw new ConflictError("flight_already_invoiced");
    }
    if (input.fileId) {
      const used = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.fileId, input.fileId))
        .limit(1);
      if (used.length > 0) throw new ConflictError("file_already_attached");
    }

    const [invoice] = await tx
      .insert(invoices)
      .values({
        shareId: input.shareId,
        flightId: input.flightId ?? null,
        number: input.number,
        issuedOn: input.issuedOn,
        dueOn: input.dueOn ?? null,
        totalCents: input.total,
        currency: input.currency,
        fileId: input.fileId ?? null,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoice.id,
      after: { number: invoice.number, totalCents: invoice.totalCents },
    });
    await emit(tx, "invoice.issued", {
      invoiceId: invoice.id,
      number: invoice.number,
      shareId: invoice.shareId,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      issuedOn: invoice.issuedOn,
    });

    const emails = await notifyOwnerMembers(
      tx,
      share.ownerId,
      "invoice.issued",
      {
        number: invoice.number,
        amount: formatMoney(invoice.totalCents, invoice.currency, "fr"),
        aircraft: share.registration,
      },
      { template: "invoiceIssued", path: "/invoices" },
    );
    return { invoice, emails };
  });

  await sendPendingEmails(db, emails);
  return invoice;
}

export const markPaidInput = z.object({
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
});
export type MarkPaidInput = z.input<typeof markPaidInput>;

/** Records the payment: the day it came in (today unless told otherwise) and an optional reference. */
export async function markInvoicePaid(db: Db, actor: Actor, id: string, raw: MarkPaidInput = {}, now = new Date()) {
  authorize(actor, "finance:write");
  const input = markPaidInput.parse(raw);
  const today = zonedDay(now);
  const paidOn = input.paidOn ?? today;
  if (paidOn > today) throw new ConflictError("paid_in_future");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "paid", paidOn, paymentReference: input.reference })
      .where(and(eq(invoices.id, id), eq(invoices.status, "issued")))
      .returning({ id: invoices.id, number: invoices.number });
    if (!row) throw new ConflictError("invoice_not_open");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.paid",
      entityType: "invoice",
      entityId: id,
      after: { paidOn, reference: input.reference },
    });
    await emit(tx, "invoice.paid", { invoiceId: id, number: row.number });
  });
}

/**
 * Voids an issued invoice. It stays visible, with the reason and the day;
 * invoices are never deleted. A paid invoice can't be voided (the money came
 * in: that's a refund or a credit, not a void). A generated one hands back its
 * reserves and can be reissued; every reversing entry is dated the void day.
 */
export async function voidInvoice(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  authorize(actor, "finance:write");
  const text = reason.trim();
  if (text.length < 3) throw new ConflictError("void_reason_required");
  const voidedOn = zonedDay(now);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, id))
      .for("update");
    if (!current) throw new NotFoundError("invoice");
    if (current.status === "paid") throw new ConflictError("invoice_paid");
    if (current.status === "void") throw new ConflictError("invoice_already_void");
    const [row] = await tx
      .update(invoices)
      .set({ status: "void", voidReason: text, voidedOn })
      .where(eq(invoices.id, id))
      .returning({ id: invoices.id, number: invoices.number, generated: invoices.holdingCompanyId });
    if (row!.generated) {
      // A generated invoice wrote the owner's ledger and the reserves: both get opposite entries,
      // and its flight goes back to "to invoice".
      const entries = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.invoiceId, id), isNull(transactions.reversesId)));
      if (entries.length)
        await tx.insert(transactions).values(
          entries.map((e) => ({
            shareId: e.shareId,
            occurredOn: voidedOn,
            categoryId: e.categoryId,
            kind: e.kind,
            amountCents: -e.amountCents,
            currency: e.currency,
            description: e.description,
            invoiceId: id,
            reversesId: e.id,
            createdByUserId: actor.id,
          })),
        );
      await reverseReservesOf(tx, id, actor.id, text, voidedOn);
      await tx.update(flightReports).set({ invoiceId: null }).where(eq(flightReports.invoiceId, id));
    }
    await emit(tx, "invoice.voided", { invoiceId: id, number: row!.number, reason: text });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.void",
      entityType: "invoice",
      entityId: id,
      after: { reason: text, voidedOn },
    });
  });
}

/** Shares that can be invoiced, labelled "C-GJTA · Jean Tremblay (25%)", for pickers. */
export async function listShareOptions(db: Db, actor: Actor) {
  authorize(actor, "finance:read");
  return db
    .select({
      id: shares.id,
      registration: aircraft.registration,
      ownerName: owners.legalName,
      percentageBp: shares.percentageBp,
      ended: shares.endsOn,
    })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .where(and(isNull(aircraft.deletedAt), isNull(owners.deletedAt)))
    .orderBy(aircraft.registration, owners.legalName);
}
