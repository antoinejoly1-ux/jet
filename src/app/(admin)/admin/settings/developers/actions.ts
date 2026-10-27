"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, formValues, type FormState } from "@/lib/forms";
import { createApiKey, revokeApiKey } from "@/lib/services/api-keys";
import { createWebhook, sendTestEvent, setWebhookEnabled } from "@/lib/services/webhooks";

/** Like FormState, plus the one-time secret to show right after creation. */
export type SecretState = FormState | { status: "created"; secret: string };

const PATH = "/admin/settings/developers";

export async function createApiKeyAction(_prev: SecretState, formData: FormData): Promise<SecretState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    const { key } = await createApiKey(db, viewer, {
      name: values.name ?? "",
      scopes: formData.getAll("scopes").map(String) as never,
    });
    revalidatePath(PATH);
    return { status: "created", secret: key };
  } catch (err) {
    return formError(err, values);
  }
}

export async function revokeApiKeyAction(id: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    await revokeApiKey(db, viewer, id);
  } catch (err) {
    return formError(err);
  }
  revalidatePath(PATH);
  return { status: "success" };
}

export async function createWebhookAction(_prev: SecretState, formData: FormData): Promise<SecretState> {
  const viewer = await requireStaff();
  const values = formValues(formData);
  try {
    const { secret } = await createWebhook(db, viewer, {
      name: values.name ?? "",
      url: values.url ?? "",
      events: formData.getAll("events").map(String) as never,
    });
    revalidatePath(PATH);
    return { status: "created", secret };
  } catch (err) {
    return formError(err, values);
  }
}

export async function setWebhookEnabledAction(id: string, enabled: boolean): Promise<void> {
  const viewer = await requireStaff();
  await setWebhookEnabled(db, viewer, id, enabled);
  revalidatePath(PATH);
}

export async function testWebhookAction(id: string, _prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    const result = await sendTestEvent(db, viewer, id);
    revalidatePath(PATH);
    return result.ok
      ? { status: "success", message: `HTTP ${result.status}` }
      : { status: "error", code: "webhook_test_failed", values: { detail: result.error ?? "" } };
  } catch (err) {
    return formError(err);
  }
}
