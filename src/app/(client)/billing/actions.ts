"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertNotViewingAs, requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, type FormState } from "@/lib/forms";
import { issueInvoice } from "@/lib/services/billing";

/** A holding company's manager issues the invoice for an approved flight report. */
export async function issueInvoiceAction(reportId: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireAccess();
  let id: string;
  try {
    assertNotViewingAs(viewer);
    id = (await issueInvoice(db, viewer, reportId)).id;
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/billing");
  await flash("invoiceIssued");
  redirect(`/invoices/${id}`);
}
