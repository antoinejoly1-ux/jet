import type { StaffRole } from "@/lib/db/schema/_shared";

/** What the welcome rules need to know about a person. */
type Person = {
  staffRole: StaffRole | null;
  ownerIds: readonly string[];
  managedCompanyIds?: readonly string[];
  onboardedAt?: Date | null;
  viewingAs?: unknown;
};

/**
 * Everyone with access goes through the welcome tour once: owners, the team,
 * pilots and company managers. Someone still waiting for access takes it when
 * access arrives; staff viewing as an owner never do.
 */
export const needsWelcome = (viewer: Person) =>
  !viewer.onboardedAt &&
  !viewer.viewingAs &&
  (Boolean(viewer.staffRole) || viewer.ownerIds.length > 0 || Boolean(viewer.managedCompanyIds?.length));

/** Who the welcome tour speaks to. */
export type WelcomeAudience = "owner" | "staff" | "pilot" | "manager";
export const welcomeAudience = (viewer: Person): WelcomeAudience =>
  viewer.staffRole === "pilot"
    ? "pilot"
    : viewer.staffRole
      ? "staff"
      : viewer.ownerIds.length === 0 && viewer.managedCompanyIds?.length
        ? "manager"
        : "owner";
