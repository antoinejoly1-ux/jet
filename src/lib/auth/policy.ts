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
  /** Owners this user acts for (via owner_members). */
  ownerIds: readonly string[];
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
  | "messages:reply"
  | "team:manage"
  | "integrations:manage"
  | "audit:read";

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

const admin: readonly Permission[] = [...finance, "fleet:write", "team:manage", "integrations:manage", "audit:read"];

const STAFF: Record<StaffRole, ReadonlySet<Permission>> = {
  dispatcher: new Set(dispatcher),
  finance: new Set(finance),
  admin: new Set(admin),
};

/** Permissions an owner can hold, and only for their own data. */
const OWNER_READABLE: ReadonlySet<Permission> = new Set(["owners:read", "fleet:read", "finance:read"]);

export function can(actor: Actor | null, permission: Permission, scope?: Scope): boolean {
  if (!actor) return false;
  if (actor.staffRole && STAFF[actor.staffRole].has(permission)) return true;
  if (!OWNER_READABLE.has(permission) || !scope) return false;
  return scope.ownerIds.some((ownerId) => actor.ownerIds.includes(ownerId));
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

export const isStaff = (actor: Pick<Actor, "staffRole"> | null): boolean => Boolean(actor?.staffRole);
