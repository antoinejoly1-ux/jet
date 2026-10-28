"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formError, formValues, type FormState } from "@/lib/forms";
import { cancelFlight, completeFlight, scheduleFlight, updateFlight } from "@/lib/services/flights";
import type { CompleteFlightInput, FlightInput } from "@/lib/validation/operations";

/**
 * "Facturé à" is required: a share, or « Aucun — convoyage » ("none") said
 * out loud, so a flight is never billed to nobody by default.
 */
function flightValues(formData: FormData): FlightInput | FormState {
  const values = formValues(formData);
  if (!values.shareId)
    return { status: "error", code: "invalid", fields: { shareId: "required" }, values } satisfies FormState;
  return { ...values, shareId: values.shareId === "none" ? "" : values.shareId } as unknown as FlightInput;
}
const isState = (v: FlightInput | FormState): v is FormState => "status" in v;

/** Back on the list, on the right tab, with the saved flight scrolled into view and highlighted. */
function landOn(flight: { id: string; departsAt: Date }) {
  const view = flight.departsAt < new Date() ? "past" : "upcoming";
  redirect(`/admin/flights?view=${view}&new=${flight.id}`);
}

export async function scheduleFlightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const input = flightValues(formData);
  if (isState(input)) return input;
  let flight: { id: string; departsAt: Date };
  try {
    const requestId = String(formData.get("requestId") ?? "") || undefined;
    flight = await scheduleFlight(db, viewer, input, { requestId });
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightScheduled");
  revalidatePath("/admin/flights");
  // "Enregistrer et planifier le retour": the same form, reversed.
  if (formData.get("then") === "return") redirect(`/admin/flights/new?returnOf=${flight.id}`);
  landOn(flight);
  return { status: "success" };
}

export async function updateFlightAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const input = flightValues(formData);
  if (isState(input)) return input;
  let flight: { id: string; departsAt: Date };
  try {
    flight = await updateFlight(db, viewer, id, input);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  await flash("flightUpdated");
  revalidatePath("/admin/flights");
  landOn(flight);
  return { status: "success" };
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
