/**
 * The back office's search (⌘K): owners, holding companies, aircraft,
 * invoices and conversations by what staff type, each with where it leads.
 */
import "server-only";
import { and, eq, isNull, or, sql, type ilike } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, conversations, holdingCompanies, invoices, owners, shares } from "@/lib/db/schema";
import { authorize, can, type Actor } from "@/lib/auth/policy";

export type SearchHit = {
  kind: "owner" | "company" | "aircraft" | "invoice" | "conversation";
  id: string;
  title: string;
  detail: string | null;
  href: string;
};

const LIMIT = 6;
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

  const [ownerRows, companyRows, planeRows, invoiceRows, threadRows] = await Promise.all([
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
