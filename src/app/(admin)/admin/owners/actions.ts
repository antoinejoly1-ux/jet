"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { archiveOwner, createOwner, removeOwnerMember, updateOwner, updateOwnerMember } from "@/lib/services/owners";
import type { OwnerInput } from "@/lib/validation/admin";

export async function createOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  let id: string;
  try {
    id = (await createOwner(db, viewer, formValues(formData) as unknown as OwnerInput)).id;
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/owners");
  redirect(`/admin/owners/${id}`);
}

export async function updateOwnerAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await updateOwner(db, viewer, id, formValues(formData) as unknown as OwnerInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath(`/admin/owners/${id}`);
  redirect(`/admin/owners/${id}`);
}

export async function archiveOwnerAction(id: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await archiveOwner(db, viewer, id);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/owners");
  redirect("/admin/owners");
}

export async function removeMemberAction(ownerId: string, memberId: string) {
  const viewer = await requireStaff();
  await removeOwnerMember(db, viewer, ownerId, memberId);
  revalidatePath(`/admin/owners/${ownerId}`);
}

export async function updateMemberAction(ownerId: string, memberId: string, formData: FormData) {
  const viewer = await requireStaff();
  await updateOwnerMember(db, viewer, ownerId, memberId, {
    role: String(formData.get("role")) as "owner" | "assistant" | "read_only",
    canSeeFinances: formData.get("canSeeFinances") === "on",
  });
  revalidatePath(`/admin/owners/${ownerId}`);
}
