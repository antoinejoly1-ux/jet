import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { owners } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { recordAudit } from "./audit";
import { NotFoundError } from "./errors";

/** Records that a staff member opened an owner's view. The cookie is set by the caller. */
export async function startViewAs(db: Db, actor: Actor, ownerId: string) {
  authorize(actor, "owners:read");
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.id, ownerId), isNull(owners.deletedAt)));
  if (!owner) throw new NotFoundError("owner");
  await recordAudit(db, {
    actorUserId: actor.id,
    action: "owner.view_as_start",
    entityType: "owner",
    entityId: ownerId,
  });
}

export async function endViewAs(db: Db, actor: Actor, ownerId: string) {
  await recordAudit(db, { actorUserId: actor.id, action: "owner.view_as_end", entityType: "owner", entityId: ownerId });
}
