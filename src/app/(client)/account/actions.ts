"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { setLocale } from "@/lib/services/account";
import { LOCALE_COOKIE } from "@/i18n/request";

export async function setLocaleAction(formData: FormData) {
  const viewer = await requireViewer();
  const locale = z.enum(["fr", "en"]).parse(formData.get("locale"));
  await setLocale(db, viewer.id, locale);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
