"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { createInvoice, markInvoicePaid, voidInvoice } from "@/lib/services/invoices";
import type { InvoiceInput } from "@/lib/validation/finance";

export async function createInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await createInvoice(db, viewer, formValues(formData) as unknown as InvoiceInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/invoices");
  redirect("/admin/invoices?created=1");
}

export async function markPaidAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await markInvoicePaid(db, viewer, id, { paidOn: values.paidOn || undefined, reference: values.reference });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin/invoices", "layout");
  return { status: "success" };
}

export async function voidInvoiceAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await voidInvoice(db, viewer, id, String(formData.get("reason") ?? ""));
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/invoices", "layout");
  return { status: "success" };
}
