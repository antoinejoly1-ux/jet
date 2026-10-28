import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { holdingCompanyManagers, ownerMembers, owners } from "@/lib/db/schema";
import type { Locale, StaffRole } from "@/lib/db/schema/_shared";
import { needsWelcome } from "./welcome";

export { needsWelcome, welcomeAudience, type WelcomeAudience } from "./welcome";
import { env } from "@/lib/env";
import { auth } from "./auth";
import { memberAccess, type Actor } from "./policy";
import { decodeViewAs, VIEW_AS_COOKIE } from "./view-as";
import { SIDE_COOKIE } from "@/lib/side";

/** The signed-in person, narrowed to what screens and the policy need. */
export type Viewer = Actor & {
  name: string;
  email: string;
  image: string | null;
  locale: Locale;
  twoFactorEnabled: boolean;
  /** Null until the person has been through the welcome tour. */
  onboardedAt: Date | null;
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
    onboardedAt?: Date | string | null;
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
    onboardedAt: u.onboardedAt ? new Date(u.onboardedAt) : null,
  };

  // Staff viewing as an owner see exactly that owner's data and nothing else.
  if (staffRole && staffRole !== "pilot") {
    const viewAsOwnerId = decodeViewAs(env.BETTER_AUTH_SECRET, u.id, (await cookies()).get(VIEW_AS_COOKIE)?.value);
    if (viewAsOwnerId) {
      const [owner] = await db
        .select({ id: owners.id, name: owners.legalName })
        .from(owners)
        .where(eq(owners.id, viewAsOwnerId));
      if (owner) return { ...base, ownerIds: [owner.id], viewingAs: { ownerId: owner.id, ownerName: owner.name } };
    }
  }

  const [memberships, managed] = await Promise.all([
    db
      .select({ ownerId: ownerMembers.ownerId, role: ownerMembers.role, canSeeFinances: ownerMembers.canSeeFinances })
      .from(ownerMembers)
      .where(eq(ownerMembers.userId, u.id)),
    db
      .select({ id: holdingCompanyManagers.holdingCompanyId })
      .from(holdingCompanyManagers)
      .where(eq(holdingCompanyManagers.userId, u.id)),
  ]);
  const access = memberships.map((m) => ({ ownerId: m.ownerId, ...memberAccess(m.role, m.canSeeFinances) }));
  return {
    ...base,
    ownerIds: access.map((m) => m.ownerId),
    financeOwnerIds: access.filter((m) => m.finances).map((m) => m.ownerId),
    actingOwnerIds: access.filter((m) => m.acts).map((m) => m.ownerId),
    managedCompanyIds: managed.map((m) => m.id),
    viewingAs: null,
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
  if (needsWelcome(viewer)) redirect("/welcome");
  if (viewer.staffRole === "pilot") redirect("/pilot");
  if (!viewer.staffRole && viewer.ownerIds.length === 0 && !viewer.managedCompanyIds?.length) redirect("/pending");
  return viewer;
}

/** Staff only, and with 2FA set up when the environment requires it. */
export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.staffRole) redirect("/");
  if (viewer.staffRole === "pilot") redirect("/pilot");
  // The tour comes first: it explains the security step that follows.
  if (needsWelcome(viewer)) redirect("/welcome");
  if (env.REQUIRE_STAFF_2FA && !viewer.twoFactorEnabled) redirect("/setup-2fa?next=/admin");
  return viewer;
}

/** Pilots only: their short side for filing flight reports. Staff 2FA rules apply to them too. */
export async function requirePilot(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.staffRole !== "pilot") redirect(viewer.staffRole ? "/admin" : "/");
  if (needsWelcome(viewer)) redirect("/welcome");
  if (env.REQUIRE_STAFF_2FA && !viewer.twoFactorEnabled) redirect("/setup-2fa?next=/pilot");
  return viewer;
}

/** Owner-side writes are refused while a staff member is viewing as an owner. */
export function assertNotViewingAs(viewer: Viewer) {
  if (viewer.viewingAs) throw new Error("Read-only: viewing as an owner");
}

/** Where a signed-in person lands: the side staff used last, Home for owners, or the waiting screen. */
export async function landingPath(viewer: Viewer): Promise<"/" | "/admin" | "/pending" | "/pilot" | "/billing"> {
  if (viewer.staffRole === "pilot") return "/pilot";
  if (viewer.staffRole) return (await cookies()).get(SIDE_COOKIE)?.value === "client" ? "/" : "/admin";
  if (viewer.ownerIds.length === 0) return viewer.managedCompanyIds?.length ? "/billing" : "/pending";
  return "/";
}
