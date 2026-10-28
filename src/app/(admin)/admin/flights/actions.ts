"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, formValues, type FormState } from "@/lib/forms";
import { cancelFlight, completeFlight, scheduleFlight, updateFlight } from "@/lib/services/flights";
import type { CompleteFlightInput, FlightInput } from "@/lib/validation/operations";

export async function scheduleFlightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  let flight: { id: string };
  try {
    const requestId = String(formData.get("requestId") ?? "") || undefined;
    flight = await scheduleFlight(db, viewer, formValues(formData) as unknown as FlightInput, { requestId });
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightScheduled");
  revalidatePath("/admin/flights");
  // "Enregistrer et planifier le retour": the same form, reversed.
  if (formData.get("then") === "return") redirect(`/admin/flights/new?returnOf=${flight.id}`);
  redirect("/admin/flights");
}

export async function updateFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateFlight(db, viewer, id, formValues(formData) as unknown as FlightInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightUpdated");
  revalidatePath("/admin/flights");
  redirect("/admin/flights");
}

export async function completeFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await completeFlight(db, viewer, id, formValues(formData) as unknown as CompleteFlightInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightClosed");
  revalidatePath("/admin", "layout");
  return { status: "success" };
}

export async function cancelFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await cancelFlight(db, viewer, id, String(formData.get("reason") ?? ""));
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightCancelled");
  revalidatePath("/admin", "layout");
  return { status: "success" };
}
