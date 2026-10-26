"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { assertNotViewingAs, requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import { setLocale } from "@/lib/services/account";
import { saveEmailPreferences } from "@/lib/services/notification-center";
import { createPrivacyRequest, type PrivacyRequestInput } from "@/lib/services/privacy";
import { LOCALE_COOKIE } from "@/i18n/request";

export async function setLocaleAction(formData: FormData) {
  const viewer = await requireViewer();
  const locale = z.enum(["fr", "en"]).parse(formData.get("locale"));
  await setLocale(db, viewer.id, locale);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function saveEmailPreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    assertNotViewingAs(viewer);
    await saveEmailPreferences(db, viewer, { on: formData.getAll("on").map(String) });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/account");
  const t = await getTranslations("account");
  return { status: "success", message: t("emailsSaved") };
}

export async function privacyRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const values = { kind: String(formData.get("kind") ?? ""), details: String(formData.get("details") ?? "") };
  try {
    assertNotViewingAs(viewer);
    await createPrivacyRequest(db, viewer, values as PrivacyRequestInput);
  } catch (err) {
    return formError(err, values);
  }
  revalidatePath("/account");
  const t = await getTranslations("account");
  return { status: "success", message: t("privacySent") };
}
