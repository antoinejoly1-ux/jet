"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { copyBudgetFromPreviousYear, publishBudget, saveBudget } from "@/lib/services/budgets";
import { addHours } from "@/lib/services/ledger";
import type { HoursInput } from "@/lib/validation/finance";

const PLANNED = "planned:";

export async function saveBudgetAction(
  shareId: string,
  year: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireStaff();
  const lines = [...formData.entries()]
    .filter(([k]) => k.startsWith(PLANNED))
    .map(([k, v]) => ({ categoryId: k.slice(PLANNED.length), planned: String(v).trim() || "0" }));
  try {
    await saveBudget(db, viewer, shareId, year, lines);
    if (formData.get("intent") === "publish") await publishBudget(db, viewer, shareId, year);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/budgets");
  return { status: "success" };
}

export async function copyBudgetAction(shareId: string, year: number, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await copyBudgetFromPreviousYear(db, viewer, shareId, year);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/budgets");
  return { status: "success" };
}

export async function addHoursAction(shareId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await addHours(db, viewer, shareId, formValues(formData) as unknown as HoursInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/budgets");
  return { status: "success" };
}
