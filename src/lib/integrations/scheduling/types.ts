/**
 * What the portal needs from the operator's scheduling software. Each vendor
 * gets an adapter that maps its API onto these shapes; the sync service never
 * sees vendor-specific fields. Ids are the vendor's own and stay stable.
 */

export type ExternalFlight = {
  id: string;
  /** Aircraft registration, e.g. C-GJTA. */
  registration: string;
  /** The vendor's id for the owner or share the flight is billed to, mapped via external_refs. */
  shareRef: string | null;
  fromAirport: string;
  toAirport: string;
  departsAt: Date;
  arrivesAt: Date | null;
  flightMinutes: number | null;
  status: "scheduled" | "completed" | "cancelled";
};

export type ExternalMaintenance = {
  id: string;
  registration: string;
  type: string;
  title: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: "planned" | "in_progress" | "done" | "cancelled";
};

export type ExternalBlock = {
  id: string;
  registration: string;
  startsAt: Date;
  endsAt: Date;
  kind: "booked" | "maintenance";
};

export type SchedulingChanges = {
  flights: ExternalFlight[];
  maintenance: ExternalMaintenance[];
  blocks: ExternalBlock[];
};

export interface SchedulingAdapter {
  /** Short stable name stored with synced records, e.g. "fake" or "leon". */
  readonly provider: string;
  /** Records changed since the last successful sync (everything when `since` is null). */
  fetchChanges(since: Date | null): Promise<SchedulingChanges>;
}
