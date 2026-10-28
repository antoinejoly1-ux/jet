"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, formValues, type FormState } from "@/lib/forms";
import { issueInvoice } from "@/lib/services/billing";
import { approveReport, returnReport } from "@/lib/services/flight-reports";

export async function approveReportAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await approveReport(db, viewer, id, { shareId: values.shareId ?? "", usdRate: values.usdRate });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin", "layout");
  await flash("reportApproved");
  // Straight on to the invoice it now makes.
  redirect(`/admin/flight-reports/${id}`);
}

export async function returnReportAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await returnReport(db, viewer, id, { note: values.note ?? "" });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin", "layout");
  await flash("reportReturned");
  redirect("/admin/flight-reports");
}

/** Finance issues the holding company's invoice for an approved report. */
export async function issueInvoiceAction(reportId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  let id: string;
  try {
    id = (await issueInvoice(db, viewer, reportId, { zeroRated: formData.get("zeroRated") === "on" })).id;
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin", "layout");
  await flash("invoiceIssued");
  redirect(`/admin/invoices/${id}`);
}
