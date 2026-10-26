"use server";

import { revalidatePath } from "next/cache";
import { assertNotViewingAs, requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { sendOwnerMessage, type MessageInput } from "@/lib/services/messages";

export async function sendOwnerMessageAction(
  ownerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireAccess();
  try {
    assertNotViewingAs(viewer);
    await sendOwnerMessage(db, viewer, ownerId, formValues(formData) as unknown as MessageInput);
  } catch (err) {
    return formError(err, formValues(formData));
  }
  revalidatePath("/messages");
  return { status: "success" };
}
