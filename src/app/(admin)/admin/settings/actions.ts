"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { getTranslations } from "next-intl/server";
import { getSchedulingAdapter } from "@/lib/integrations/scheduling";
import { syncScheduling } from "@/lib/services/scheduling-sync";
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

export async function syncNowAction(_prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  const adapter = getSchedulingAdapter();
  if (!adapter) return { status: "error", code: "integration_not_connected" };
  let result;
  try {
    result = await syncScheduling(db, viewer, adapter);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin", "layout");
  const t = await getTranslations("integrations");
  return { status: "success", message: t("runSummary", result.counts) };
}
