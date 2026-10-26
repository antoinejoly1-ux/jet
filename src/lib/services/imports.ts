import "server-only";
import { desc, eq, isNull, and } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { aircraft, budgetCategories, imports, owners, shares, transactions } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { parseMoneyToCents } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { ConflictError } from "./errors";

/** The fields a transactions spreadsheet maps onto. Category and description are optional. */
export const IMPORT_FIELDS = ["date", "registration", "owner", "kind", "amount", "category", "description"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const REQUIRED_FIELDS: ImportField[] = ["date", "registration", "owner", "amount"];
export const MAX_IMPORT_ROWS = 5000;

export const mappingSchema = z
  .object(
    Object.fromEntries(IMPORT_FIELDS.map((f) => [f, z.string().optional()])) as Record<
      ImportField,
      z.ZodOptional<z.ZodString>
    >,
  )
  .refine((m) => REQUIRED_FIELDS.every((f) => m[f]), "missing_required_column");
export type ColumnMapping = z.infer<typeof mappingSchema>;

const rowsSchema = z.array(z.record(z.string(), z.string())).max(MAX_IMPORT_ROWS);

export type RowError = { row: number; field: ImportField; code: string };
type ParsedRow = {
  row: number;
  shareId: string;
  occurredOn: string;
  kind: "cost" | "revenue" | "payment";
  amountCents: number;
  categoryId: string | null;
  description: string | null;
};

const KINDS: Record<string, ParsedRow["kind"]> = {
  cost: "cost",
  coût: "cost",
  cout: "cost",
  dépense: "cost",
  depense: "cost",
  revenue: "revenue",
  revenu: "revenue",
  payment: "payment",
  paiement: "payment",
};

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** 2026-03-01, 01/03/2026 or 1-3-2026 (day first, as in Quebec) → 2026-03-01. */
export function parseImportDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Checks every row and returns what would be imported and what wouldn't, with
 * the reason per field. Nothing is written.
 */
export async function validateImport(db: Db, actor: Actor, rawMapping: unknown, rawRows: unknown) {
  authorize(actor, "finance:write");
  const mapping = mappingSchema.parse(rawMapping);
  const rows = rowsSchema.parse(rawRows);

  const [shareRows, categoryRows] = await Promise.all([
    db
      .select({
        id: shares.id,
        registration: aircraft.registration,
        ownerName: owners.legalName,
        endsOn: shares.endsOn,
      })
      .from(shares)
      .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
      .innerJoin(owners, eq(owners.id, shares.ownerId))
      .where(isNull(owners.deletedAt)),
    db.select().from(budgetCategories),
  ]);
  const shareIndex = new Map(shareRows.map((s) => [`${norm(s.registration)}|${norm(s.ownerName)}`, s.id]));
  const categoryIndex = new Map(
    categoryRows.flatMap(
      (c) =>
        [
          [norm(c.nameFr), c.id],
          [norm(c.nameEn), c.id],
        ] as const,
    ),
  );

  const valid: ParsedRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((raw, i) => {
    const row = i + 2; // spreadsheet row number: header is row 1
    const get = (f: ImportField) => (mapping[f] ? (raw[mapping[f]!] ?? "").trim() : "");
    const rowErrors: RowError[] = [];

    const occurredOn = parseImportDate(get("date"));
    if (!occurredOn) rowErrors.push({ row, field: "date", code: "invalid_date" });

    const shareId = shareIndex.get(`${norm(get("registration"))}|${norm(get("owner"))}`);
    if (!shareId) rowErrors.push({ row, field: "owner", code: "share_not_found" });

    const kindText = get("kind");
    const kind = kindText ? KINDS[norm(kindText)] : "cost";
    if (!kind) rowErrors.push({ row, field: "kind", code: "invalid_kind" });

    const amountCents = parseMoneyToCents(get("amount"));
    if (amountCents === null || amountCents === 0) rowErrors.push({ row, field: "amount", code: "invalid_amount" });

    const categoryText = get("category");
    const categoryId = categoryText ? (categoryIndex.get(norm(categoryText)) ?? null) : null;
    if (categoryText && !categoryId) rowErrors.push({ row, field: "category", code: "unknown_category" });

    if (rowErrors.length) errors.push(...rowErrors);
    else
      valid.push({
        row,
        shareId: shareId!,
        occurredOn: occurredOn!,
        kind: kind!,
        amountCents: amountCents!,
        categoryId,
        description: get("description").slice(0, 300) || null,
      });
  });

  return { mapping, total: rows.length, valid, errors };
}

/**
 * Imports the valid rows as ledger entries in one transaction, and keeps a
 * record of the import (file, mapping, counts, rejected rows).
 */
export async function commitImport(db: Db, actor: Actor, input: { fileId: string; mapping: unknown; rows: unknown }) {
  const result = await validateImport(db, actor, input.mapping, input.rows);
  if (result.valid.length === 0) throw new ConflictError("nothing_to_import");
  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(imports)
      .values({
        kind: "transactions",
        fileId: input.fileId,
        status: "committed",
        columnMapping: result.mapping,
        rowsImported: result.valid.length,
        rowsRejected: result.total - result.valid.length,
        errorReport: result.errors,
        createdByUserId: actor.id,
      })
      .returning();
    await tx.insert(transactions).values(
      result.valid.map((r) => ({
        shareId: r.shareId,
        occurredOn: r.occurredOn,
        kind: r.kind,
        amountCents: r.amountCents,
        categoryId: r.categoryId,
        description: r.description,
        source: "import" as const,
        externalId: `import:${record.id}:${r.row}`,
        createdByUserId: actor.id,
      })),
    );
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "import.commit",
      entityType: "import",
      entityId: record.id,
      after: { imported: record.rowsImported, rejected: record.rowsRejected },
    });
    return record;
  });
}

/** Recent imports, and the column mapping last used (so the next import starts pre-filled). */
export async function listImports(db: Db, actor: Actor) {
  authorize(actor, "finance:read");
  const rows = await db
    .select()
    .from(imports)
    .where(and(eq(imports.kind, "transactions")))
    .orderBy(desc(imports.createdAt))
    .limit(20);
  return { rows, lastMapping: (rows[0]?.columnMapping ?? null) as ColumnMapping | null };
}
