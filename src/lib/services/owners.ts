import "server-only";
import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, owners, shares } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";

/** Every active owner with the aircraft they hold shares in. Staff only. */
export async function listOwners(db: Db, actor: Actor) {
  authorize(actor, "owners:read");
  return db
    .select({
      id: owners.id,
      legalName: owners.legalName,
      type: owners.type,
      email: owners.email,
      aircraft: sql<
        string[]
      >`coalesce(array_agg(${aircraft.registration} order by ${aircraft.registration}) filter (where ${aircraft.id} is not null), '{}')`,
      members: sql<number>`(select count(*)::int from owner_members m where m.owner_id = ${owners.id})`,
    })
    .from(owners)
    .leftJoin(shares, eq(shares.ownerId, owners.id))
    .leftJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(isNull(owners.deletedAt))
    .groupBy(owners.id)
    .orderBy(asc(owners.legalName));
}
