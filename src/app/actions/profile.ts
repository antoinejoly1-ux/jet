"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertNotViewingAs, landingPath, requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import { completeOnboarding, removeAvatar, setAvatar, updateProfile, type ProfileInput } from "@/lib/services/profile";
import { LOCALE_COOKIE } from "@/i18n/request";

/** Name and language, from the welcome tour or Settings. */
export async function saveProfileAction(input: ProfileInput): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    assertNotViewingAs(viewer);
    await updateProfile(db, viewer, input);
  } catch (err) {
    return formError(err);
  }
  if (input.locale)
    (await cookies()).set(LOCALE_COOKIE, input.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function setAvatarAction(fileId: string): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    assertNotViewingAs(viewer);
    await setAvatar(db, viewer, fileId);
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function removeAvatarAction(): Promise<FormState> {
  const viewer = await requireViewer();
  assertNotViewingAs(viewer);
  await removeAvatar(db, viewer);
  revalidatePath("/", "layout");
  return { status: "success" };
}

/** The last step of the welcome tour. */
export async function finishWelcomeAction(formData?: FormData) {
  const viewer = await requireViewer();
  assertNotViewingAs(viewer);
  await completeOnboarding(db, viewer);
  // Straight to the destination: redirecting an action to the /start route handler leaves /start in the address bar.
  const to = await landingPath(viewer);
  // "Faire une première demande de vol": Home opens the request sheet.
  redirect(formData?.get("then") === "request" && to === "/" ? "/?request=1" : to);
}
