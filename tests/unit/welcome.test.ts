import { describe, expect, it } from "vitest";
import { needsWelcome, welcomeAudience } from "@/lib/auth/welcome";

const person = (p: Partial<Parameters<typeof needsWelcome>[0]> = {}) => ({
  staffRole: null,
  ownerIds: [] as string[],
  managedCompanyIds: [] as string[],
  onboardedAt: null,
  viewingAs: null,
  ...p,
});

describe("welcome tour", () => {
  it("is shown once to everyone with access, whatever their role", () => {
    expect(needsWelcome(person({ ownerIds: ["o1"] }))).toBe(true);
    for (const staffRole of ["admin", "finance", "dispatcher", "pilot"] as const)
      expect(needsWelcome(person({ staffRole }))).toBe(true);
    expect(needsWelcome(person({ managedCompanyIds: ["c1"] }))).toBe(true);
    expect(needsWelcome(person({ staffRole: "admin", onboardedAt: new Date() }))).toBe(false);
  });

  it("waits for access, and never shows to staff viewing as an owner", () => {
    expect(needsWelcome(person())).toBe(false);
    expect(needsWelcome(person({ staffRole: "admin", ownerIds: ["o1"], viewingAs: { ownerId: "o1" } }))).toBe(false);
  });

  it("speaks to each role", () => {
    expect(welcomeAudience(person({ ownerIds: ["o1"] }))).toBe("owner");
    expect(welcomeAudience(person({ staffRole: "finance" }))).toBe("staff");
    expect(welcomeAudience(person({ staffRole: "pilot" }))).toBe("pilot");
    expect(welcomeAudience(person({ managedCompanyIds: ["c1"] }))).toBe("manager");
    // An owner who also manages a company sees the owner's tour.
    expect(welcomeAudience(person({ ownerIds: ["o1"], managedCompanyIds: ["c1"] }))).toBe("owner");
  });
});
