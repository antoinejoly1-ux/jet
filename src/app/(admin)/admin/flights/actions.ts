"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { cancelFlight, completeFlight, scheduleFlight, updateFlight } from "@/lib/services/flights";
import type { CompleteFlightInput, FlightInput } from "@/lib/validation/operations";

export async function scheduleFlightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await scheduleFlight(db, viewer, formValues(formData) as unknown as FlightInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/flights");
  redirect("/admin/flights?saved=1");
}

export async function updateFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateFlight(db, viewer, id, formValues(formData) as unknown as FlightInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/flights");
  redirect("/admin/flights?saved=1");
}

export async function completeFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await completeFlight(db, viewer, id, formValues(formData) as unknown as CompleteFlightInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/flights");
  return { status: "success" };
}

export async function cancelFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await cancelFlight(db, viewer, id, String(formData.get("reason") ?? ""));
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/flights");
  return { status: "success" };
}
