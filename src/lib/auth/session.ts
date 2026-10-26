import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { ownerMembers } from "@/lib/db/schema";
import type { Locale, StaffRole } from "@/lib/db/schema/_shared";
import { env } from "@/lib/env";
import { auth } from "./auth";
import type { Actor } from "./policy";

/** The signed-in person, narrowed to what screens and the policy need. */
export type Viewer = Actor & {
  name: string;
  email: string;
  image: string | null;
  locale: Locale;
  twoFactorEnabled: boolean;
};

/** One session lookup per request, however many components ask. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user as typeof result.user & {
    staffRole?: StaffRole | null;
    locale?: Locale;
    twoFactorEnabled?: boolean | null;
  };
  const memberships = await db
    .select({ ownerId: ownerMembers.ownerId })
    .from(ownerMembers)
    .where(eq(ownerMembers.userId, u.id));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    staffRole: u.staffRole ?? null,
    locale: u.locale ?? "fr",
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    ownerIds: memberships.map((m) => m.ownerId),
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}

/** Owners and staff only; an account with no access goes to the waiting screen. */
export async function requireAccess(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.staffRole && viewer.ownerIds.length === 0) redirect("/pending");
  return viewer;
}

/** Staff only, and with 2FA set up when the environment requires it. */
export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.staffRole) redirect("/");
  if (env.REQUIRE_STAFF_2FA && !viewer.twoFactorEnabled) redirect("/account/security?required=1");
  return viewer;
}
