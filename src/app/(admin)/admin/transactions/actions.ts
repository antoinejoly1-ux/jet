"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { addTransaction, reverseTransaction } from "@/lib/services/ledger";
import type { TransactionInput } from "@/lib/validation/finance";

export async function addTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await addTransaction(db, viewer, formValues(formData) as unknown as TransactionInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/transactions");
  return { status: "success" };
}

export async function reverseTransactionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await reverseTransaction(db, viewer, id, String(formData.get("reason") ?? ""));
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/transactions");
  return { status: "success" };
}
