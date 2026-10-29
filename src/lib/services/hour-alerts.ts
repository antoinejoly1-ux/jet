import "server-only";
import { eq, inArray, sum } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { aircraft, hourLedger, notifications, owners, shares, user } from "@/lib/db/schema";
import { formatHours } from "@/lib/format";
import { notifyOwnerMembers, type PendingEmail } from "./owner-notifications";

/** Below this share of the annual allotment, the owner and the team are told. */
const LOW = 0.1;

/**
 * Call after hours were taken from a share, in the same transaction. Warns
 * once, when the balance crosses the 10% line, not on every flight after.
 */
export async function alertIfHoursLow(tx: Tx, shareId: string, minutesUsed: number): Promise<PendingEmail[]> {
  const [share] = await tx
    .select({
      annual: shares.annualHoursMinutes,
      ownerId: shares.ownerId,
      ownerName: owners.legalName,
      registration: aircraft.registration,
    })
    .from(shares)
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(eq(shares.id, shareId));
  if (!share?.annual || minutesUsed <= 0) return [];
  const [row] = await tx
    .select({ minutes: sum(hourLedger.minutes).mapWith(Number) })
    .from(hourLedger)
    .where(eq(hourLedger.shareId, shareId));
  const after = row?.minutes ?? 0;
  const before = after + minutesUsed;
  const line = share.annual * LOW;
  if (!(before > line && after <= line)) return [];

  const left = Math.max(0, after);
  const hours = formatHours(left, "fr");
  const staff = await tx
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.staffRole, ["admin", "finance"]));
  if (staff.length)
    await tx.insert(notifications).values(
      staff.map((s) => ({
        userId: s.id,
        type: "hours.low_staff",
        data: { ownerName: share.ownerName, aircraft: share.registration, hours },
      })),
    );
  return notifyOwnerMembers(
    tx,
    share.ownerId,
    "hours.low",
    (locale) => ({ aircraft: share.registration, hours: formatHours(left, locale) }),
    { template: "hoursLow", path: "/" },
  );
}
