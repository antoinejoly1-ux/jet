/**
 * The back office's search (⌘K): owners, holding companies, aircraft,
 * flights, invoices and conversations by what staff type, each with where it
 * leads; and the pages and quick actions this person's role can use.
 */
import "server-only";
import { and, eq, isNull, or, sql, type ilike, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, conversations, flights, holdingCompanies, invoices, owners, shares } from "@/lib/db/schema";
import { authorize, can, type Actor } from "@/lib/auth/policy";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export type SearchHit = {
  kind: "owner" | "company" | "aircraft" | "flight" | "invoice" | "conversation";
  id: string;
  title: string;
  detail: string | null;
  href: string;
};

const LIMIT = 6;

export type Shortcut = { kind: "page" | "action"; key: string; href: string };

/**
 * The pages and quick actions ⌘K offers this person, by message key: only
 * what their role can open or do. The palette filters them as they type.
 */
export function adminShortcuts(actor: Actor): Shortcut[] {
  authorize(actor, "admin:access");
  const ops = can(actor, "operations:write");
  const money = can(actor, "finance:read");
  const items: (Shortcut | false)[] = [
    ops && { kind: "action", key: "newFlight", href: "/admin/flights/new" },
    can(actor, "owners:write") && { kind: "action", key: "newOwner", href: "/admin/owners/new" },
    can(actor, "owners:invite") && { kind: "action", key: "invite", href: "/admin/invitations" },
    { kind: "page", key: "dashboard", href: "/admin" },
    { kind: "page", key: "aircraft", href: "/admin/aircraft" },
    { kind: "page", key: "flights", href: "/admin/flights" },
    { kind: "page", key: "maintenance", href: "/admin/maintenance" },
    can(actor, "messages:reply") && { kind: "page", key: "messages", href: "/admin/messages" },
    { kind: "page", key: "owners", href: "/admin/owners" },
    money && { kind: "page", key: "flightReports", href: "/admin/flight-reports" },
    money && { kind: "page", key: "transactions", href: "/admin/transactions" },
    money && { kind: "page", key: "invoices", href: "/admin/invoices" },
    can(actor, "finance:write") && { kind: "page", key: "imports", href: "/admin/imports" },
    can(actor, "team:manage") && { kind: "page", key: "settings", href: "/admin/settings" },
  ];
  return items.filter((i): i is Shortcut => Boolean(i));
}
const ACCENTED = "àâäáãåéèêëíìîïóòôöõúùûüçñÿ";
const PLAIN = "aaaaaaeeeeiiiiooooouuuucny";
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export async function searchAdmin(db: Db, actor: Actor, raw: string): Promise<SearchHit[]> {
  authorize(actor, "admin:access");
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  // Accents and case don't matter: « societe » finds Société. (translate(), so no database extension is needed.)
  const folded = fold(q).replace(/[%_\\]/g, (c) => `\\${c}`);
  const like = `%${folded}%`;
  const match = (column: Parameters<typeof ilike>[0]) =>
    sql`translate(lower(coalesce(${column}, '')), ${ACCENTED}, ${PLAIN}) like ${like}`;

  // Flights: every word must match the registration, an airport or the local date (« cyul 2026-10 »).
  const day = sql`to_char(${flights.departsAt} at time zone ${OPERATOR_TIME_ZONE}, 'YYYY-MM-DD')`;
  const words = fold(q)
    .split(/[\s→>-]+/)
    .filter((w) => w.length >= 2)
    .slice(0, 4);
  const wordMatch = (w: string): SQL => {
    const pattern = `%${w.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return sql`(lower(${aircraft.registration}) like ${pattern} or lower(${flights.fromAirport}) like ${pattern}
      or lower(${flights.toAirport}) like ${pattern} or ${day} like ${pattern})`;
  };

  const [ownerRows, companyRows, planeRows, flightRows, invoiceRows, threadRows] = await Promise.all([
    db
      .select({ id: owners.id, name: owners.legalName, email: owners.email })
      .from(owners)
      .where(and(isNull(owners.deletedAt), or(match(owners.legalName), match(owners.email))))
      .limit(LIMIT),
    db
      .select({ id: holdingCompanies.id, name: holdingCompanies.legalName })
      .from(holdingCompanies)
      .where(and(isNull(holdingCompanies.deletedAt), match(holdingCompanies.legalName)))
      .limit(LIMIT),
    db
      .select({ id: aircraft.id, registration: aircraft.registration, model: aircraft.model })
      .from(aircraft)
      .where(and(isNull(aircraft.deletedAt), or(match(aircraft.registration), match(aircraft.model))))
      .limit(LIMIT),
    // No money here: dispatch searches flights too.
    words.length
      ? db
          .select({
            id: flights.id,
            registration: aircraft.registration,
            from: flights.fromAirport,
            to: flights.toAirport,
            day,
          })
          .from(flights)
          .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
          .where(and(isNull(aircraft.deletedAt), ...words.map(wordMatch)))
          // The flights closest to today first.
          .orderBy(sql`abs(extract(epoch from ${flights.departsAt} - now()))`)
          .limit(LIMIT)
      : Promise.resolve([]),
    can(actor, "finance:read")
      ? db
          .select({ id: invoices.id, number: invoices.number, ownerName: owners.legalName })
          .from(invoices)
          .innerJoin(shares, eq(shares.id, invoices.shareId))
          .innerJoin(owners, eq(owners.id, shares.ownerId))
          .where(match(invoices.number))
          .limit(LIMIT)
      : Promise.resolve([]),
    can(actor, "messages:reply")
      ? db
          .select({ id: conversations.id, ownerName: owners.legalName })
          .from(conversations)
          .innerJoin(owners, eq(owners.id, conversations.ownerId))
          .where(match(owners.legalName))
          .limit(LIMIT)
      : Promise.resolve([]),
  ]);

  return [
    ...planeRows.map((a) => ({
      kind: "aircraft" as const,
      id: a.id,
      title: a.registration,
      detail: a.model,
      href: `/admin/aircraft/${a.id}`,
    })),
    ...flightRows.map((f) => ({
      kind: "flight" as const,
      id: f.id,
      title: `${f.from} → ${f.to}`,
      detail: `${f.registration} · ${f.day as string}`,
      href: `/admin/flights/${f.id}`,
    })),
    ...ownerRows.map((o) => ({
      kind: "owner" as const,
      id: o.id,
      title: o.name,
      detail: o.email,
      href: `/admin/owners/${o.id}`,
    })),
    ...companyRows.map((c) => ({
      kind: "company" as const,
      id: c.id,
      title: c.name,
      detail: null,
      href: `/admin/holding-companies/${c.id}`,
    })),
    ...invoiceRows.map((i) => ({
      kind: "invoice" as const,
      id: i.id,
      title: i.number,
      detail: i.ownerName,
      href: `/admin/invoices?q=${encodeURIComponent(i.number)}`,
    })),
    ...threadRows.map((c) => ({
      kind: "conversation" as const,
      id: c.id,
      title: c.ownerName,
      detail: null,
      href: `/admin/messages/${c.id}`,
    })),
  ];
}
