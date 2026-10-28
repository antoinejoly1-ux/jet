/**
 * The single place that decides who can do what. Every server action, route
 * handler, API endpoint and job asks `can` / `authorize`; nothing else checks
 * roles. Pure and synchronous so it can be tested exhaustively.
 */
import type { StaffRole } from "@/lib/db/schema/_shared";

/** What the policy needs to know about the person acting. */
export type Actor = {
  id: string;
  staffRole: StaffRole | null;
  /** Owners this user acts for (via owner_members): they can see the schedule and aircraft. */
  ownerIds: readonly string[];
  /** Of those, the owners whose finances they see. Defaults to all of `ownerIds`. */
  financeOwnerIds?: readonly string[];
  /** Of those, the owners they can act for (write to the team, request flights). Defaults to all of `ownerIds`. */
  actingOwnerIds?: readonly string[];
  /** Holding companies whose books this login runs: they issue those companies' invoices. */
  managedCompanyIds?: readonly string[];
  /** Set when the request comes with an API key: exactly these permissions, organisation-wide. */
  apiScopes?: readonly Permission[];
};

export type Permission =
  | "admin:access"
  | "owners:read"
  | "owners:write"
  | "owners:invite"
  | "fleet:read"
  | "fleet:write"
  | "operations:write"
  | "finance:read"
  | "finance:write"
  | "messages:send"
  | "messages:reply"
  | "team:manage"
  | "integrations:manage"
  | "audit:read"
  /** A pilot files the report of a flight they flew. */
  | "reports:file";

/**
 * Which owner(s) the target data belongs to. Required for owner-facing reads:
 * an owner may read data only when it belongs to one of their own owners.
 * For aircraft-level data, pass every owner holding a share in that aircraft.
 */
export type Scope = { ownerIds: readonly string[] };

const dispatcher: readonly Permission[] = [
  "admin:access",
  "owners:read",
  "fleet:read",
  "operations:write",
  "messages:reply",
];

const finance: readonly Permission[] = [
  ...dispatcher,
  "owners:write",
  "owners:invite",
  "finance:read",
  "finance:write",
];

/** Pilots file flight reports and see the fleet's flights, never owners' money. */
const pilot: readonly Permission[] = ["reports:file"];

const admin: readonly Permission[] = [...finance, "fleet:write", "team:manage", "integrations:manage", "audit:read"];

/** What an API key can be granted. Never team, integration or audit administration. */
export const API_SCOPES = [
  "owners:read",
  "fleet:read",
  "finance:read",
  "finance:write",
  "operations:write",
] as const satisfies readonly Permission[];

const STAFF: Record<StaffRole, ReadonlySet<Permission>> = {
  dispatcher: new Set(dispatcher),
  finance: new Set(finance),
  admin: new Set(admin),
  pilot: new Set(pilot),
};

/** Permissions an owner can hold, and only for their own data. Writing to dispatch is the one write. */
const OWNER_READABLE: ReadonlySet<Permission> = new Set(["owners:read", "fleet:read", "finance:read", "messages:send"]);

/** The owners whose finances this login sees. */
export const financeOwnerIds = (actor: Actor) => actor.financeOwnerIds ?? actor.ownerIds;
/** The owners this login can act for. */
export const actingOwnerIds = (actor: Actor) => actor.actingOwnerIds ?? actor.ownerIds;

/** Which of an owner login's owners a permission applies to. */
function ownersFor(actor: Actor, permission: Permission) {
  if (permission === "finance:read") return financeOwnerIds(actor);
  if (permission === "messages:send") return actingOwnerIds(actor);
  return actor.ownerIds;
}

export function can(actor: Actor | null, permission: Permission, scope?: Scope): boolean {
  if (!actor) return false;
  if (actor.apiScopes) return actor.apiScopes.includes(permission);
  if (actor.staffRole && STAFF[actor.staffRole].has(permission)) return true;
  if (!OWNER_READABLE.has(permission) || !scope) return false;
  const mine = ownersFor(actor, permission);
  return scope.ownerIds.some((ownerId) => mine.includes(ownerId));
}

/** What each member role gets, given the per-member finance setting. */
export function memberAccess(role: "owner" | "assistant" | "read_only", canSeeFinances: boolean) {
  return { finances: role === "owner" || canSeeFinances, acts: role !== "read_only" };
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Forbidden: missing ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function authorize(actor: Actor | null, permission: Permission, scope?: Scope): asserts actor is Actor {
  if (!can(actor, permission, scope)) throw new ForbiddenError(permission);
}

/**
 * Who may issue a holding company's invoices: finance, and the people who
 * manage that company's books (Charles's « adjointes ou techniciens »).
 */
export function canIssueInvoicesFor(actor: Actor | null, holdingCompanyId: string): boolean {
  if (!actor || actor.apiScopes) return false;
  return can(actor, "finance:write") || Boolean(actor.managedCompanyIds?.includes(holdingCompanyId));
}

export function authorizeInvoicing(actor: Actor | null, holdingCompanyId: string): asserts actor is Actor {
  if (!canIssueInvoicesFor(actor, holdingCompanyId)) throw new ForbiddenError("finance:write");
}

export const isStaff = (actor: Pick<Actor, "staffRole"> | null): boolean => Boolean(actor?.staffRole);
