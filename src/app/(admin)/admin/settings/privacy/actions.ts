"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import {
  closePrivacyRequest,
  recordIncident,
  updateIncidentReporting,
  type IncidentInput,
} from "@/lib/services/privacy";

export async function closeRequestAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await closePrivacyRequest(db, viewer, id, values as { status: "done" | "refused"; response: string });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin/settings/privacy");
  return { status: "success" };
}

export async function recordIncidentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await recordIncident(db, viewer, values as unknown as IncidentInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin/settings/privacy");
  return { status: "success" };
}

export async function incidentReportingAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await updateIncidentReporting(db, viewer, id, values);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/admin/settings/privacy");
  return { status: "success" };
}
