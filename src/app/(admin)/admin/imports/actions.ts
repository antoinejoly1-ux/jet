"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import { commitImport, validateImport, type RowError } from "@/lib/services/imports";

export type PreviewResult =
  | {
      ok: true;
      total: number;
      valid: number;
      errors: RowError[];
      sample: { row: number; occurredOn: string; amountCents: number }[];
    }
  | { ok: false; state: FormState };

export async function previewImportAction(
  mapping: Record<string, string>,
  rows: Record<string, string>[],
): Promise<PreviewResult> {
  const viewer = await requireStaff();
  try {
    const result = await validateImport(db, viewer, mapping, rows);
    return {
      ok: true,
      total: result.total,
      valid: result.valid.length,
      errors: result.errors.slice(0, 200),
      sample: result.valid
        .slice(0, 5)
        .map((r) => ({ row: r.row, occurredOn: r.occurredOn, amountCents: r.amountCents })),
    };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}

export async function commitImportAction(
  fileId: string,
  mapping: Record<string, string>,
  rows: Record<string, string>[],
): Promise<{ ok: true; imported: number; rejected: number } | { ok: false; state: FormState }> {
  const viewer = await requireStaff();
  try {
    const record = await commitImport(db, viewer, { fileId, mapping, rows });
    revalidatePath("/admin/imports");
    revalidatePath("/admin/transactions");
    return { ok: true, imported: record.rowsImported, rejected: record.rowsRejected };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}
