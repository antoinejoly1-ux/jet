"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import {
  assignConversation,
  conversationIdForOwner,
  replyAsStaff,
  setResolved,
  type MessageInput,
} from "@/lib/services/messages";

export async function replyAction(conversationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await replyAsStaff(db, viewer, conversationId, formValues(formData) as unknown as MessageInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/admin/messages", "layout");
  return { status: "success" };
}

export async function assignAction(conversationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await assignConversation(db, viewer, conversationId, String(formData.get("assignee") ?? "") || null);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/messages", "layout");
  return { status: "success" };
}

export async function resolveAction(conversationId: string, resolved: boolean): Promise<void> {
  const viewer = await requireStaff();
  await setResolved(db, viewer, conversationId, resolved);
  revalidatePath("/admin/messages", "layout");
  if (resolved) redirect("/admin/messages");
}

/** "Write to this owner" from their page. */
export async function openOwnerConversationAction(ownerId: string): Promise<void> {
  const viewer = await requireStaff();
  const id = await conversationIdForOwner(db, viewer, ownerId);
  redirect(`/admin/messages/${id}`);
}
