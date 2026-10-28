"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { archiveHoldingCompany, createHoldingCompany, updateHoldingCompany } from "@/lib/services/holding-companies";
import type { HoldingCompanyInput } from "@/lib/validation/admin";
import { flash } from "@/lib/flash";
import { addManager, removeManager, updateBillingProfile, type BillingProfileInput } from "@/lib/services/billing";

export async function createHoldingCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  let id: string;
  try {
    id = (await createHoldingCompany(db, viewer, formValues(formData) as unknown as HoldingCompanyInput)).id;
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/holding-companies");
  redirect(`/admin/holding-companies/${id}`);
}

export async function updateHoldingCompanyAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateHoldingCompany(db, viewer, id, formValues(formData) as unknown as HoldingCompanyInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/holding-companies/${id}`);
  redirect(`/admin/holding-companies/${id}`);
}

export async function archiveHoldingCompanyAction(id: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await archiveHoldingCompany(db, viewer, id);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/holding-companies");
  redirect("/admin/holding-companies");
}

export async function saveBillingProfileAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await updateBillingProfile(db, viewer, id, values as unknown as BillingProfileInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath(`/admin/holding-companies/${id}`);
  await flash("billingSaved");
  return { status: "success" };
}

export async function addManagerAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    await addManager(db, viewer, id, { email: values.email ?? "" });
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath(`/admin/holding-companies/${id}`);
  return { status: "success" };
}

export async function removeManagerAction(id: string, managerId: string) {
  const viewer = await requireStaff();
  await removeManager(db, viewer, id, managerId);
  revalidatePath(`/admin/holding-companies/${id}`);
}
