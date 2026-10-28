"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { assertNotViewingAs, requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { lang } from "@/lib/locale";
import { requestFlight, type FlightRequestInput } from "@/lib/services/flight-requests";

/** The owner's "Demander un vol" sheet. */
export async function requestFlightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const values = formValues(formData);
  try {
    assertNotViewingAs(viewer);
    await requestFlight(db, viewer, values as unknown as FlightRequestInput, lang(await getLocale()));
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
