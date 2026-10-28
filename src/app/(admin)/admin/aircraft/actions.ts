"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { addShare, createAircraft, endShare, setAircraftPhoto, updateAircraft } from "@/lib/services/aircraft";
import { addBlock, removeBlock } from "@/lib/services/availability";
import { setRate, type RateInput } from "@/lib/services/rates";
import {
  payFromReserve,
  setReserveTarget,
  type ReserveTargetInput,
  type ReserveWorkInput,
} from "@/lib/services/reserves";
import { flash } from "@/lib/flash";
import type { AircraftInput, ShareInput } from "@/lib/validation/admin";
import type { BlockInput } from "@/lib/validation/operations";

export async function createAircraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  let id: string;
  try {
    id = (await createAircraft(db, viewer, formValues(formData) as unknown as AircraftInput)).id;
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/aircraft");
  redirect(`/admin/aircraft/${id}`);
}

export async function updateAircraftAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateAircraft(db, viewer, id, formValues(formData) as unknown as AircraftInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/aircraft/${id}`);
  redirect(`/admin/aircraft/${id}`);
}

export async function addShareAction(aircraftId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await addShare(db, viewer, aircraftId, {
      ...values,
      annualHours: values.annualHours === "" ? undefined : values.annualHours,
    } as unknown as ShareInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function endShareAction(
  aircraftId: string,
  shareId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await endShare(db, viewer, shareId, { endsOn: String(formData.get("endsOn") ?? "") });
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function addBlockAction(aircraftId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await addBlock(db, viewer, aircraftId, formValues(formData) as unknown as BlockInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function removeBlockAction(aircraftId: string, blockId: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await removeBlock(db, viewer, blockId);
  } catch (err) {
    return formError(err);
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function setRateAction(aircraftId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await setRate(db, viewer, aircraftId, values as unknown as RateInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  await flash("rateSaved");
  return { status: "success" };
}

export async function payFromReserveAction(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await payFromReserve(db, viewer, aircraftId, values as unknown as ReserveWorkInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function setReserveTargetAction(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await setReserveTarget(db, viewer, aircraftId, values as unknown as ReserveTargetInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath(`/admin/aircraft/${aircraftId}`);
  return { status: "success" };
}

export async function setAircraftPhotoAction(aircraftId: string, fileId: string | null): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await setAircraftPhoto(db, viewer, aircraftId, fileId);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin", "layout");
  return { status: "success" };
}
