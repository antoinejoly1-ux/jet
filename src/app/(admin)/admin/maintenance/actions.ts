"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import {
  planMaintenance,
  setMaintenanceStatus,
  updateMaintenance,
  type MaintenanceStatus,
} from "@/lib/services/maintenance";
import type { MaintenanceInput } from "@/lib/validation/operations";

function refresh() {
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/aircraft", "layout");
}

export async function planMaintenanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await planMaintenance(db, viewer, formValues(formData) as unknown as MaintenanceInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  refresh();
  redirect("/admin/maintenance?saved=1");
}

export async function updateMaintenanceAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateMaintenance(db, viewer, id, formValues(formData) as unknown as MaintenanceInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  refresh();
  redirect("/admin/maintenance?saved=1");
}

export async function setMaintenanceStatusAction(
  id: string,
  status: MaintenanceStatus,
  _prev: FormState,
): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await setMaintenanceStatus(db, viewer, id, status);
  } catch (err) {
    return formError(err);
  }
  refresh();
  return { status: "success" };
}
