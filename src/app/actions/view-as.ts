"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { encodeViewAs, VIEW_AS_COOKIE, VIEW_AS_TTL_SECONDS } from "@/lib/auth/view-as";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { endViewAs, startViewAs } from "@/lib/services/view-as";

/** Opens the Client side as one owner sees it, read-only, for up to an hour. */
export async function startViewAsAction(ownerId: string) {
  const viewer = await requireStaff();
  const id = z.string().uuid().parse(ownerId);
  await startViewAs(db, viewer, id);
  (await cookies()).set(VIEW_AS_COOKIE, encodeViewAs(env.BETTER_AUTH_SECRET, viewer.id, id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VIEW_AS_TTL_SECONDS,
  });
  redirect("/");
}

export async function exitViewAsAction() {
  const viewer = await requireStaff();
  const ownerId = viewer.viewingAs?.ownerId;
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (ownerId) {
    await endViewAs(db, viewer, ownerId);
    redirect(`/admin/owners/${ownerId}`);
  }
  redirect("/admin/owners");
}
