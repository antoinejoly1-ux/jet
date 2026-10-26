/**
 * Demo data for local work and demos: 3 aircraft, 8 owners, a year of flights,
 * budgets, transactions and invoices, plus three logins (password: demo-password-2026).
 *
 *   pnpm db:seed           wipes the domain tables and reseeds
 *
 * Refuses to run when NODE_ENV=production.
 */
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";
import * as s from "../src/lib/db/schema";

config({ path: ".env.local" });
config();

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const db = drizzle(pool, { schema: s, casing: "snake_case" });

const DEMO_PASSWORD = "demo-password-2026";
const year = new Date().getFullYear();

// Deterministic pseudo-random numbers, so every seed produces the same fleet.
let state = 42;
const rand = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function createLogin(email: string, name: string, staffRole: s.StaffRole | null) {
  const [u] = await db.insert(s.user).values({ name, email, emailVerified: true, staffRole }).returning();
  await db.insert(s.account).values({
    userId: u.id,
    accountId: u.id,
    providerId: "credential",
    password: await hashPassword(DEMO_PASSWORD),
  });
  return u;
}

async function main() {
  console.log("Clearing tables…");
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

  const categories = await db
    .insert(s.budgetCategories)
    .values([
      { nameFr: "Carburant", nameEn: "Fuel", accountingAccountCode: "5100", sortOrder: 1 },
      { nameFr: "Équipage", nameEn: "Crew", accountingAccountCode: "5200", sortOrder: 2 },
      { nameFr: "Maintenance", nameEn: "Maintenance", accountingAccountCode: "5300", sortOrder: 3 },
      { nameFr: "Hangar", nameEn: "Hangar", accountingAccountCode: "5400", sortOrder: 4 },
      { nameFr: "Assurance", nameEn: "Insurance", accountingAccountCode: "5500", sortOrder: 5 },
      { nameFr: "Frais d'aéroport", nameEn: "Airport fees", accountingAccountCode: "5600", sortOrder: 6 },
    ])
    .returning();
  const cat = Object.fromEntries(categories.map((c) => [c.nameEn, c.id]));

  const fleet = await db
    .insert(s.aircraft)
    .values([
      {
        registration: "C-GJTA",
        model: "Pilatus PC-24",
        serialNumber: "PC24-112",
        homeBase: "CYUL",
        status: "available",
        icaoHex: "c05a1b",
      },
      {
        registration: "C-FJTB",
        model: "Embraer Phenom 300E",
        serialNumber: "50500611",
        homeBase: "CYUL",
        status: "maintenance",
        icaoHex: "c03b7e",
      },
      {
        registration: "C-GJTC",
        model: "Cessna Citation CJ4",
        serialNumber: "525C-0388",
        homeBase: "CYQB",
        status: "available",
        icaoHex: "c06d22",
      },
    ])
    .returning();

  const ownerRows = await db
    .insert(s.owners)
    .values([
      { legalName: "Jean Tremblay", type: "person", email: "jean.tremblay@example.com" },
      { legalName: "Marie Gagnon", type: "person", email: "marie.gagnon@example.com" },
      { legalName: "Groupe Laurentides inc.", type: "company", email: "finances@laurentides.example.com" },
      { legalName: "Sophie Roy", type: "person", email: "sophie.roy@example.com", locale: "en" },
      { legalName: "Côté Holdings", type: "company", email: "admin@coteholdings.example.com" },
      { legalName: "Luc Bergeron", type: "person", email: "luc.bergeron@example.com" },
      { legalName: "Nadia Pelletier", type: "person", email: "nadia.pelletier@example.com" },
      { legalName: "Atlantique Capital", type: "company", email: "ops@atlantique.example.com", locale: "en" },
    ])
    .returning();

  // Four quarter shares on the PC-24, two halves on the Phenom, two halves on the CJ4.
  const plan: [number, number, number][] = [
    [0, 0, 2500],
    [1, 0, 2500],
    [2, 0, 2500],
    [3, 0, 2500],
    [4, 1, 5000],
    [5, 1, 5000],
    [6, 2, 5000],
    [7, 2, 5000],
  ];
  const shareRows = await db
    .insert(s.shares)
    .values(
      plan.map(([o, a, bp]) => ({
        ownerId: ownerRows[o]!.id,
        aircraftId: fleet[a]!.id,
        percentageBp: bp,
        annualHoursMinutes: (bp / 10000) * 200 * 60,
        startsOn: `${year - 1}-01-01`,
      })),
    )
    .returning();

  console.log("Flights, hours, money…");
  const airports = ["CYUL", "CYQB", "CYYZ", "KTEB", "KPBI", "KMIA", "MYNN", "TNCM", "CYVR", "KBOS"];
  let invoiceSeq = 1;
  for (const share of shareRows) {
    await db
      .insert(s.hourLedger)
      .values({ shareId: share.id, kind: "purchase", minutes: share.annualHoursMinutes!, note: `Bloc annuel ${year}` });

    const [budget] = await db.insert(s.budgets).values({ shareId: share.id, year, status: "published" }).returning();
    const scale = share.percentageBp / 10000;
    const planned = {
      Fuel: 420_000,
      Crew: 260_000,
      Maintenance: 300_000,
      Hangar: 90_000,
      Insurance: 120_000,
      "Airport fees": 60_000,
    };
    await db.insert(s.budgetLines).values(
      Object.entries(planned).map(([name, dollars]) => ({
        budgetId: budget!.id,
        categoryId: cat[name]!,
        plannedCents: Math.round(dollars * scale) * 100,
      })),
    );

    // Past flights this year, about one a month per share.
    const today = new Date();
    for (let month = 0; month <= today.getMonth(); month++) {
      for (let k = 0; k < (share.percentageBp >= 5000 ? 2 : 1); k++) {
        const departs = new Date(Date.UTC(year, month, 3 + Math.floor(rand() * 24), 12 + Math.floor(rand() * 8)));
        if (departs >= today) continue;
        const from = pick(airports);
        let to = pick(airports);
        while (to === from) to = pick(airports);
        const block = 60 + Math.floor(rand() * 120);
        const [flight] = await db
          .insert(s.flights)
          .values({
            aircraftId: share.aircraftId,
            shareId: share.id,
            fromAirport: from,
            toAirport: to,
            departsAt: departs,
            arrivesAt: new Date(departs.getTime() + block * 60_000),
            blockMinutes: block,
            status: "completed",
          })
          .returning();
        await db
          .insert(s.hourLedger)
          .values({ shareId: share.id, kind: "flight", minutes: -block, flightId: flight!.id });

        const fuel = Math.round(block * (28 + rand() * 8)) * 100;
        const crew = Math.round(block * 10) * 100;
        const fees = Math.round(400 + rand() * 900) * 100;
        const total = fuel + crew + fees;
        const [invoice] = await db
          .insert(s.invoices)
          .values({
            shareId: share.id,
            flightId: flight!.id,
            number: `INV-${year}-${String(invoiceSeq++).padStart(4, "0")}`,
            issuedOn: isoDay(new Date(departs.getTime() + 2 * 86_400_000)),
            dueOn: isoDay(new Date(departs.getTime() + 32 * 86_400_000)),
            totalCents: total,
            status: departs.getTime() < today.getTime() - 40 * 86_400_000 ? "paid" : "issued",
          })
          .returning();
        const occurredOn = isoDay(departs);
        await db.insert(s.transactions).values([
          {
            shareId: share.id,
            occurredOn,
            categoryId: cat.Fuel,
            kind: "cost",
            amountCents: fuel,
            invoiceId: invoice!.id,
            description: `Carburant ${from}–${to}`,
          },
          {
            shareId: share.id,
            occurredOn,
            categoryId: cat.Crew,
            kind: "cost",
            amountCents: crew,
            invoiceId: invoice!.id,
            description: "Équipage",
          },
          {
            shareId: share.id,
            occurredOn,
            categoryId: cat["Airport fees"],
            kind: "cost",
            amountCents: fees,
            invoiceId: invoice!.id,
            description: `Frais ${to}`,
          },
        ]);
      }
    }
    // Fixed monthly costs.
    for (let month = 0; month <= today.getMonth(); month++) {
      const occurredOn = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      await db.insert(s.transactions).values([
        {
          shareId: share.id,
          occurredOn,
          categoryId: cat.Hangar,
          kind: "cost",
          amountCents: Math.round((90_000 * scale) / 12) * 100,
          description: "Hangar mensuel",
        },
        {
          shareId: share.id,
          occurredOn,
          categoryId: cat.Insurance,
          kind: "cost",
          amountCents: Math.round((120_000 * scale) / 12) * 100,
          description: "Assurance mensuelle",
        },
      ]);
    }
  }

  // Upcoming flights and maintenance per aircraft.
  const now = Date.now();
  for (const [i, plane] of fleet.entries()) {
    const holders = shareRows.filter((sh) => sh.aircraftId === plane.id);
    for (let k = 1; k <= 3; k++) {
      const departs = new Date(now + (k * 6 + i) * 86_400_000);
      departs.setUTCHours(13, 30, 0, 0);
      await db.insert(s.flights).values({
        aircraftId: plane.id,
        shareId: holders[k % holders.length]!.id,
        fromAirport: "CYUL",
        toAirport: pick(["KPBI", "KTEB", "TNCM", "CYVR"]),
        departsAt: departs,
        status: "scheduled",
      });
    }
    await db.insert(s.maintenanceEvents).values({
      aircraftId: plane.id,
      type: i === 1 ? "unscheduled" : "inspection",
      title: i === 1 ? "Remplacement de démarreur-générateur" : "Inspection de 600 heures",
      startsAt: new Date(now + (i === 1 ? -1 : 18 + i * 5) * 86_400_000),
      endsAt: new Date(now + (i === 1 ? 3 : 21 + i * 5) * 86_400_000),
      status: i === 1 ? "in_progress" : "planned",
    });
  }

  console.log("Demo logins…");
  await createLogin("admin@jet.test", "Alex Admin", "admin");
  await createLogin("dispatch@jet.test", "Dani Dispatch", "dispatcher");
  const owner = await createLogin("owner@jet.test", "Jean Tremblay", null);
  await db
    .insert(s.ownerMembers)
    .values({ id: uuidv7(), ownerId: ownerRows[0]!.id, userId: owner.id, role: "primary" });

  console.log(`\nSeeded. Sign in with any of these (password: ${DEMO_PASSWORD}):`);
  console.log("  admin@jet.test     admin");
  console.log("  dispatch@jet.test  dispatcher");
  console.log("  owner@jet.test     owner of 25% of C-GJTA\n");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
