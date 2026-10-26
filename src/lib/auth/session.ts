import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { ownerMembers, owners } from "@/lib/db/schema";
import type { Locale, StaffRole } from "@/lib/db/schema/_shared";
import { env } from "@/lib/env";
import { auth } from "./auth";
import type { Actor } from "./policy";
import { decodeViewAs, VIEW_AS_COOKIE } from "./view-as";

/** The signed-in person, narrowed to what screens and the policy need. */
export type Viewer = Actor & {
  name: string;
  email: string;
  image: string | null;
  locale: Locale;
  twoFactorEnabled: boolean;
  /** Set while a staff member is viewing the Client side as one owner (read-only). */
  viewingAs: { ownerId: string; ownerName: string } | null;
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
  const staffRole = u.staffRole ?? null;
  const base = {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    staffRole,
    locale: u.locale ?? "fr",
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };

  // Staff viewing as an owner see exactly that owner's data and nothing else.
  if (staffRole) {
    const viewAsOwnerId = decodeViewAs(env.BETTER_AUTH_SECRET, u.id, (await cookies()).get(VIEW_AS_COOKIE)?.value);
    if (viewAsOwnerId) {
      const [owner] = await db
        .select({ id: owners.id, name: owners.legalName })
        .from(owners)
        .where(eq(owners.id, viewAsOwnerId));
      if (owner) return { ...base, ownerIds: [owner.id], viewingAs: { ownerId: owner.id, ownerName: owner.name } };
    }
  }

  const memberships = await db
    .select({ ownerId: ownerMembers.ownerId })
    .from(ownerMembers)
    .where(eq(ownerMembers.userId, u.id));
  return { ...base, ownerIds: memberships.map((m) => m.ownerId), viewingAs: null };
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
  if (env.REQUIRE_STAFF_2FA && !viewer.twoFactorEnabled) redirect("/setup-2fa?next=/admin");
  return viewer;
}

/** Owner-side writes are refused while a staff member is viewing as an owner. */
export function assertNotViewingAs(viewer: Viewer) {
  if (viewer.viewingAs) throw new Error("Read-only: viewing as an owner");
}
