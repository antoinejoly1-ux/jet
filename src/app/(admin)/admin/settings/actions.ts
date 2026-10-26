"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { setStaffRole } from "@/lib/services/team";

export async function setStaffRoleAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await setStaffRole(db, viewer, userId, { role: String(formData.get("role") ?? "") });
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/settings");
  return { status: "success" };
}
