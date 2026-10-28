"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import type { DateOrder } from "@/lib/import-dates";
import { commitImport, validateImport, type RowError } from "@/lib/services/imports";

export type PreviewResult =
  | {
      ok: true;
      total: number;
      valid: number;
      errors: RowError[];
      sample: {
        row: number;
        occurredOn: string;
        registration: string;
        ownerName: string;
        kind: "cost" | "revenue" | "payment";
        amountCents: number;
        category: string | null;
        description: string | null;
      }[];
    }
  | { ok: false; state: FormState };

export async function previewImportAction(
  mapping: Record<string, string>,
  rows: Record<string, string>[],
  dateOrder: DateOrder = "dmy",
): Promise<PreviewResult> {
  const viewer = await requireStaff();
  try {
    const result = await validateImport(db, viewer, mapping, rows, { dateOrder: dateOrder === "mdy" ? "mdy" : "dmy" });
    return {
      ok: true,
      total: result.total,
      valid: result.valid.length,
      errors: result.errors.slice(0, 200),
      // The first parsed rows exactly as they'd be imported, to check dates and amounts read right.
      sample: result.valid.slice(0, 10).map((r) => ({
        row: r.row,
        occurredOn: r.occurredOn,
        registration: r.registration,
        ownerName: r.ownerName,
        kind: r.kind,
        amountCents: r.amountCents,
        category: r.category,
        description: r.description,
      })),
    };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}

export async function commitImportAction(
  fileId: string,
  mapping: Record<string, string>,
  rows: Record<string, string>[],
  dateOrder: DateOrder = "dmy",
): Promise<{ ok: true; imported: number; rejected: number } | { ok: false; state: FormState }> {
  const viewer = await requireStaff();
  try {
    const record = await commitImport(db, viewer, {
      fileId,
      mapping,
      rows,
      dateOrder: dateOrder === "mdy" ? "mdy" : "dmy",
    });
    revalidatePath("/admin/imports");
    revalidatePath("/admin/transactions");
    return { ok: true, imported: record.rowsImported, rejected: record.rowsRejected };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}
