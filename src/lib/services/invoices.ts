import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, files, invoices, owners, shares } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { formatMoney } from "@/lib/format";
import { invoiceInput, type InvoiceInput } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { emit } from "./outbox";
import { ConflictError, NotFoundError } from "./errors";
import { notifyOwnerMembers, sendPendingEmails } from "./owner-notifications";

const columns = {
  id: invoices.id,
  number: invoices.number,
  issuedOn: invoices.issuedOn,
  dueOn: invoices.dueOn,
  totalCents: invoices.totalCents,
  currency: invoices.currency,
  status: invoices.status,
  voidReason: invoices.voidReason,
  fileId: invoices.fileId,
  fileName: files.originalName,
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

/** Every invoice, for the back office. Filter by status, year or a search on number, owner or aircraft. */
export async function listInvoices(db: Db, actor: Actor, opts: { status?: string; year?: number; q?: string } = {}) {
  authorize(actor, "finance:read");
  const filters: SQL[] = [];
  if (opts.status === "issued" || opts.status === "paid" || opts.status === "void")
    filters.push(eq(invoices.status, opts.status));
  if (opts.year)
    filters.push(gte(invoices.issuedOn, `${opts.year}-01-01`), lt(invoices.issuedOn, `${opts.year + 1}-01-01`));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    filters.push(or(ilike(invoices.number, q), ilike(owners.legalName, q), ilike(aircraft.registration, q))!);
  }
  return base(db)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(invoices.issuedOn), desc(invoices.number))
    .limit(500);
}

/** The signed-in owner's own invoices, newest first. */
export async function listOwnerInvoices(db: Db, actor: Actor) {
  if (actor.ownerIds.length === 0) return [];
  authorize(actor, "finance:read", { ownerIds: actor.ownerIds });
  return base(db)
    .where(inArray(shares.ownerId, [...actor.ownerIds]))
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

export async function markInvoicePaid(db: Db, actor: Actor, id: string) {
  authorize(actor, "finance:write");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "paid" })
      .where(and(eq(invoices.id, id), eq(invoices.status, "issued")))
      .returning({ id: invoices.id, number: invoices.number });
    if (!row) throw new ConflictError("invoice_not_open");
    await recordAudit(tx, { actorUserId: actor.id, action: "invoice.paid", entityType: "invoice", entityId: id });
    await emit(tx, "invoice.paid", { invoiceId: id, number: row.number });
  });
}

/** Voids an invoice. It stays visible, with the reason; invoices are never deleted. */
export async function voidInvoice(db: Db, actor: Actor, id: string, reason: string) {
  authorize(actor, "finance:write");
  const text = reason.trim();
  if (text.length < 3) throw new ConflictError("void_reason_required");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "void", voidReason: text })
      .where(and(eq(invoices.id, id), inArray(invoices.status, ["issued", "paid"])))
      .returning({ id: invoices.id, number: invoices.number });
    if (!row) throw new ConflictError("invoice_already_void");
    await emit(tx, "invoice.voided", { invoiceId: id, number: row.number, reason: text });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.void",
      entityType: "invoice",
      entityId: id,
      after: { reason: text },
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
