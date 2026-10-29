import { describe, expect, it } from "vitest";
import { authorize, can, ForbiddenError, memberAccess, type Actor, type Permission } from "@/lib/auth/policy";

const OWNER_A = "00000000-0000-7000-8000-00000000000a";
const OWNER_B = "00000000-0000-7000-8000-00000000000b";

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  id: "user-1",
  staffRole: null,
  ownerIds: [],
  ...overrides,
});

const ALL: Permission[] = [
  "admin:access",
  "owners:read",
  "owners:write",
  "owners:invite",
  "fleet:read",
  "fleet:write",
  "operations:write",
  "finance:read",
  "finance:write",
  "messages:send",
  "messages:reply",
  "team:manage",
  "integrations:manage",
  "audit:read",
];

// The full matrix, written out so a change to any role is a visible diff here.
const EXPECTED: Record<"admin" | "finance" | "dispatcher", Permission[]> = {
  // Staff write to owners with messages:reply; messages:send is the owner's side of the chat.
  admin: ALL.filter((p) => p !== "messages:send"),
  finance: [
    "admin:access",
    "owners:read",
    "owners:write",
    "owners:invite",
    "fleet:read",
    "operations:write",
    "finance:read",
    "finance:write",
    "messages:reply",
  ],
  dispatcher: ["admin:access", "owners:read", "fleet:read", "operations:write", "messages:reply"],
};

describe("staff roles", () => {
  for (const role of ["admin", "finance", "dispatcher"] as const) {
    for (const permission of ALL) {
      const allowed = EXPECTED[role].includes(permission);
      it(`${role} ${allowed ? "can" : "cannot"} ${permission}`, () => {
        expect(can(actor({ staffRole: role }), permission)).toBe(allowed);
      });
    }
  }
});

describe("owners", () => {
  const ownerA = actor({ ownerIds: [OWNER_A] });

  it("cannot reach the admin side", () => {
    expect(can(ownerA, "admin:access")).toBe(false);
  });

  it("reads their own finances", () => {
    expect(can(ownerA, "finance:read", { ownerIds: [OWNER_A] })).toBe(true);
  });

  it("cannot read another owner's finances", () => {
    expect(can(ownerA, "finance:read", { ownerIds: [OWNER_B] })).toBe(false);
  });

  it("reads an aircraft they share with others", () => {
    expect(can(ownerA, "fleet:read", { ownerIds: [OWNER_B, OWNER_A] })).toBe(true);
  });

  it("is denied an owner-readable permission when no scope is given", () => {
    expect(can(ownerA, "finance:read")).toBe(false);
  });

  it("writes to dispatch about their own account only", () => {
    expect(can(ownerA, "messages:send", { ownerIds: [OWNER_A] })).toBe(true);
    expect(can(ownerA, "messages:send", { ownerIds: [OWNER_B] })).toBe(false);
  });

  it("never gets other write permissions, even on their own data", () => {
    const ownerPermissions = ["owners:read", "fleet:read", "finance:read", "messages:send"];
    for (const permission of ALL.filter((p) => !ownerPermissions.includes(p))) {
      expect(can(ownerA, permission, { ownerIds: [OWNER_A] })).toBe(false);
    }
  });
});

describe("member roles", () => {
  // How the session turns a membership into an actor.
  const member = (role: "owner" | "assistant" | "read_only", canSeeFinances = false) => {
    const a = memberAccess(role, canSeeFinances);
    return actor({
      ownerIds: [OWNER_A],
      financeOwnerIds: a.finances ? [OWNER_A] : [],
      actingOwnerIds: a.acts ? [OWNER_A] : [],
    });
  };
  const mine = { ownerIds: [OWNER_A] };

  it("owners see finances and act, whatever the finance setting", () => {
    expect(can(member("owner"), "finance:read", mine)).toBe(true);
    expect(can(member("owner"), "messages:send", mine)).toBe(true);
  });

  it("assistants see the schedule and act, and see finances only when allowed", () => {
    expect(can(member("assistant"), "fleet:read", mine)).toBe(true);
    expect(can(member("assistant"), "messages:send", mine)).toBe(true);
    expect(can(member("assistant"), "finance:read", mine)).toBe(false);
    expect(can(member("assistant", true), "finance:read", mine)).toBe(true);
  });

  it("read-only members look but never act", () => {
    expect(can(member("read_only"), "fleet:read", mine)).toBe(true);
    expect(can(member("read_only"), "owners:read", mine)).toBe(true);
    expect(can(member("read_only", true), "finance:read", mine)).toBe(true);
    expect(can(member("read_only", true), "messages:send", mine)).toBe(false);
  });
});

describe("accounts without access", () => {
  it("can do nothing", () => {
    for (const permission of ALL) {
      expect(can(actor(), permission, { ownerIds: [OWNER_A] })).toBe(false);
    }
  });

  it("signed-out visitors can do nothing", () => {
    expect(can(null, "finance:read", { ownerIds: [OWNER_A] })).toBe(false);
  });
});

describe("API keys", () => {
  const key = actor({ id: "creator", staffRole: "admin", apiScopes: ["finance:read"] });

  it("get exactly their scopes, whatever their creator's role", () => {
    expect(can(key, "finance:read")).toBe(true);
    expect(can(key, "finance:write")).toBe(false);
    expect(can(key, "team:manage")).toBe(false);
  });

  it("read across owners like staff do", () => {
    expect(can(key, "finance:read", { ownerIds: [OWNER_A] })).toBe(true);
  });
});

describe("authorize", () => {
  it("throws ForbiddenError when denied", () => {
    expect(() => authorize(actor({ staffRole: "dispatcher" }), "finance:write")).toThrow(ForbiddenError);
  });

  it("returns quietly when allowed", () => {
    expect(() => authorize(actor({ staffRole: "admin" }), "finance:write")).not.toThrow();
  });
});
