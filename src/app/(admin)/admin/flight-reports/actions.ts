"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, formValues, type FormState } from "@/lib/forms";
import { approveReport, returnReport } from "@/lib/services/flight-reports";

export async function approveReportAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await approveReport(db, viewer, id, { shareId: values.shareId ?? "" });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin", "layout");
  await flash("reportApproved");
  redirect("/admin/flight-reports");
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
