"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilot } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, formValues, type FormState } from "@/lib/forms";
import { submitReport, type ReportInput } from "@/lib/services/flight-reports";

/** The pilot's report. Expenses arrive as JSON from the form's rows. */
export async function submitReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requirePilot();
  const values = formValues(formData);
  try {
    let expenses: unknown = [];
    try {
      expenses = JSON.parse(values.expenses || "[]");
    } catch {
      expenses = null;
    }
    await submitReport(db, viewer, { ...values, expenses } as unknown as ReportInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/pilot");
  await flash("reportSent");
  redirect("/pilot");
}
