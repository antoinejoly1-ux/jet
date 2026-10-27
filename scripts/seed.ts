/**
 * Demo data for local work and demos: 3 aircraft, 8 owners, a year of flights,
 * budgets, transactions and invoices, plus three logins (password: demo-password-2026).
 *
 *   pnpm db:seed           wipes the domain tables and reseeds
 *
 * Refuses to run when NODE_ENV=production.
 */
import { createOTP } from "@better-auth/utils/otp";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
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

/** A small, valid one-page PDF with a few lines of text, standing in for real invoices. */
function demoPdf(lines: string[]): Buffer {
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 56 ${770 - i * 22} Td (${l.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const storageDir = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "tmp/storage");

async function storeDemoFile(name: string, bytes: Buffer) {
  const key = `invoices/${uuidv7()}.pdf`;
  await mkdir(path.join(storageDir, "invoices"), { recursive: true });
  await writeFile(path.join(storageDir, key), bytes);
  const [file] = await db
    .insert(s.files)
    .values({
      storageKey: key,
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      originalName: name,
    })
    .returning();
  return file!.id;
}

const DEMO_PASSWORD = "demo-password-2026";
/** Shared 2FA secret for the demo staff logins (also in tests/e2e/support.ts). Never use outside demos. */
const DEMO_TOTP_SECRET = "JetDemoTotpSecretForLocalUse2026";
const DEMO_BACKUP_CODES = ["demo1-aaaaa", "demo2-bbbbb", "demo3-ccccc", "demo4-ddddd", "demo5-eeeee"];
const year = new Date().getFullYear();

// Deterministic pseudo-random numbers, so every seed produces the same fleet.
let state = 42;
const rand = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function createLogin(email: string, name: string, staffRole: s.StaffRole | null, withTwoFactor = false) {
  const [u] = await db
    .insert(s.user)
    .values({ name, email, emailVerified: true, staffRole, twoFactorEnabled: withTwoFactor })
    .returning();
  await db.insert(s.account).values({
    userId: u.id,
    accountId: u.id,
    providerId: "credential",
    password: await hashPassword(DEMO_PASSWORD),
  });
  if (withTwoFactor) {
    // Stored exactly as Better Auth stores it: encrypted with BETTER_AUTH_SECRET.
    const key = process.env.BETTER_AUTH_SECRET!;
    await db.insert(s.twoFactor).values({
      userId: u.id,
      secret: await symmetricEncrypt({ key, data: DEMO_TOTP_SECRET }),
      backupCodes: await symmetricEncrypt({ key, data: JSON.stringify(DEMO_BACKUP_CODES) }),
      verified: true,
    });
  }
  return u;
}

async function main() {
  console.log("Clearing tables…");
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await rm(path.join(storageDir, "invoices"), { recursive: true, force: true });

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

  // Each aircraft belongs to a holding company whose shareholders are its owners.
  const companies = await db
    .insert(s.holdingCompanies)
    .values([
      { legalName: "Gestion Aviation JTA inc.", registrationNumber: "1171234567", email: "jta@example.com" },
      { legalName: "Altitude PC-12 S.E.C.", registrationNumber: "3372345678" },
      { legalName: "Citation Québec S.E.C.", registrationNumber: "3373456789" },
      { legalName: "King Air Laurentien inc.", registrationNumber: "1174567890" },
      { legalName: "Saint-Laurent Jet Partners inc.", registrationNumber: "1175678901" },
    ])
    .returning();

  const fleet = await db
    .insert(s.aircraft)
    .values([
      {
        holdingCompanyId: companies[0]!.id,
        registration: "C-GJTA",
        model: "Pilatus PC-12 NGX",
        serialNumber: "2112",
        homeBase: "CYHU",
        status: "available",
        icaoHex: "c05a1b",
      },
      {
        holdingCompanyId: companies[1]!.id,
        registration: "C-FJTB",
        model: "Pilatus PC-12 NGX",
        serialNumber: "2087",
        homeBase: "CYHU",
        status: "maintenance",
        icaoHex: "c03b7e",
      },
      {
        holdingCompanyId: companies[2]!.id,
        registration: "C-GJTC",
        model: "Cessna Citation CJ4",
        serialNumber: "525C-0388",
        homeBase: "CYQB",
        status: "available",
        icaoHex: "c06d22",
      },
      {
        holdingCompanyId: companies[3]!.id,
        registration: "C-GUVR",
        model: "Beechcraft King Air 350i",
        serialNumber: "FL-1187",
        homeBase: "CYHU",
        status: "available",
        icaoHex: "c07b44",
      },
      {
        holdingCompanyId: companies[4]!.id,
        registration: "C-FUNV",
        model: "Bombardier Challenger 350",
        serialNumber: "20812",
        homeBase: "CYUL",
        status: "available",
        icaoHex: "c02e91",
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
      { legalName: "Hélène Fortin", type: "person", email: "helene.fortin@example.com" },
      { legalName: "Philippe Lavoie", type: "person", email: "philippe.lavoie@example.com" },
      { legalName: "Groupe Boréal inc.", type: "company", email: "direction@boreal.example.com" },
      { legalName: "Isabelle Martel", type: "person", email: "isabelle.martel@example.com" },
      { legalName: "Mathieu Gendron", type: "person", email: "mathieu.gendron@example.com", locale: "en" },
    ])
    .returning();

  // Thirteen owners across the five aircraft: quarters on C-GJTA, halves on the other PC-12 and
  // the CJ4, thirds on the King Air, 60/40 on the Challenger.
  const plan: [number, number, number][] = [
    [0, 0, 2500],
    [1, 0, 2500],
    [2, 0, 2500],
    [3, 0, 2500],
    [4, 1, 5000],
    [5, 1, 5000],
    [6, 2, 5000],
    [7, 2, 5000],
    [8, 3, 3400],
    [9, 3, 3300],
    [10, 3, 3300],
    [11, 4, 6000],
    [12, 4, 4000],
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
        const flown = 60 + Math.floor(rand() * 120);
        const [flight] = await db
          .insert(s.flights)
          .values({
            aircraftId: share.aircraftId,
            shareId: share.id,
            fromAirport: from,
            toAirport: to,
            departsAt: departs,
            arrivesAt: new Date(departs.getTime() + flown * 60_000),
            flightMinutes: flown,
            status: "completed",
          })
          .returning();
        await db
          .insert(s.hourLedger)
          .values({ shareId: share.id, kind: "flight", minutes: -flown, flightId: flight!.id });

        const fuel = Math.round(flown * (28 + rand() * 8)) * 100;
        const crew = Math.round(flown * 10) * 100;
        const fees = Math.round(400 + rand() * 900) * 100;
        const total = fuel + crew + fees;
        const number = `INV-${year}-${String(invoiceSeq++).padStart(4, "0")}`;
        const fileId = await storeDemoFile(
          `${number}.pdf`,
          demoPdf([
            `Facture ${number}`,
            `Vol ${from} - ${to}, ${isoDay(departs)}`,
            `Carburant: ${(fuel / 100).toFixed(2)} $`,
            `Equipage: ${(crew / 100).toFixed(2)} $`,
            `Frais d'aeroport: ${(fees / 100).toFixed(2)} $`,
            `Total: ${(total / 100).toFixed(2)} $ CAD`,
          ]),
        );
        const [invoice] = await db
          .insert(s.invoices)
          .values({
            shareId: share.id,
            flightId: flight!.id,
            number,
            fileId,
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
        fromAirport: plane.homeBase ?? "CYHU",
        toAirport: pick(["KPBI", "KTEB", "TNCM", "CYVR"]),
        departsAt: departs,
        status: "scheduled",
      });
    }
    // A charter: Univair sells the aircraft's time when owners aren't flying it.
    const charter = new Date(now + (9 + i) * 86_400_000);
    charter.setUTCHours(15, 0, 0, 0);
    await db.insert(s.flights).values({
      aircraftId: plane.id,
      shareId: null,
      fromAirport: plane.homeBase ?? "CYHU",
      toAirport: "CYYZ",
      departsAt: charter,
      status: "scheduled",
    });
    await db.insert(s.maintenanceEvents).values({
      aircraftId: plane.id,
      type: i === 1 ? "unscheduled" : "inspection",
      title: i === 1 ? "Remplacement de démarreur-générateur" : "Inspection de 600 heures",
      startsAt: new Date(now + (i === 1 ? -1 : 18 + i * 5) * 86_400_000),
      endsAt: new Date(now + (i === 1 ? 3 : 21 + i * 5) * 86_400_000),
      status: i === 1 ? "in_progress" : "planned",
    });
  }

  // In the air right now, so the live map has something to show: Jean's PC-12 to Palm Beach,
  // and a charter on the Challenger. Re-seed before a demo; they land after a few hours.
  const jeanShare = shareRows.find((sh) => sh.ownerId === ownerRows[0]!.id)!;
  await db.insert(s.flights).values([
    {
      aircraftId: fleet[0]!.id,
      shareId: jeanShare.id,
      fromAirport: "CYHU",
      toAirport: "KPBI",
      departsAt: new Date(now - 70 * 60_000),
      arrivesAt: new Date(now + 3 * 3_600_000 + 50 * 60_000),
      status: "scheduled",
    },
    {
      aircraftId: fleet[4]!.id,
      shareId: null,
      fromAirport: "CYUL",
      toAirport: "KTEB",
      departsAt: new Date(now - 25 * 60_000),
      arrivesAt: new Date(now + 55 * 60_000),
      status: "scheduled",
    },
  ]);

  console.log("Demo logins…");
  await createLogin("admin@jet.test", "Alex Admin", "admin", true);
  const dispatch = await createLogin("dispatch@jet.test", "Dani Dispatch", "dispatcher", true);
  await createLogin("finance@jet.test", "Fred Finance", "finance", false);
  const owner = await createLogin("owner@jet.test", "Jean Tremblay", null);
  await db.insert(s.ownerMembers).values({ id: uuidv7(), ownerId: ownerRows[0]!.id, userId: owner.id, role: "owner" });
  // Jean's executive assistant: sees the schedule, not the finances.
  const assistant = await createLogin("assistant@jet.test", "Julie Assistante", null);
  await db
    .insert(s.ownerMembers)
    .values({ id: uuidv7(), ownerId: ownerRows[0]!.id, userId: assistant.id, role: "assistant" });

  // A short conversation with dispatch, already read on both sides.
  const [conversation] = await db
    .insert(s.conversations)
    .values({ id: uuidv7(), ownerId: ownerRows[0]!.id, assignedToUserId: dispatch.id })
    .returning();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);
  await db.insert(s.messages).values([
    {
      id: uuidv7(),
      conversationId: conversation!.id,
      senderUserId: owner.id,
      body: "Bonjour, est-ce que l'appareil est libre la fin de semaine prochaine pour un aller-retour à Québec?",
      createdAt: at(30),
      readAt: at(29),
    },
    {
      id: uuidv7(),
      conversationId: conversation!.id,
      senderUserId: dispatch.id,
      body: "Bonjour Jean! Oui, samedi et dimanche sont libres. Je vous le réserve pour samedi 9 h?",
      createdAt: at(29),
      readAt: at(28),
    },
  ]);

  const otpauth = createOTP(DEMO_TOTP_SECRET).url("Jet (demo)", "staff@jet.test");
  console.log(`\nSeeded. Sign in with any of these (password: ${DEMO_PASSWORD}):`);
  console.log("  admin@jet.test     admin       2FA on");
  console.log("  dispatch@jet.test  dispatcher  2FA on");
  console.log("  finance@jet.test   finance     2FA not set up yet: shows the setup flow");
  console.log("  owner@jet.test     owner of 25% of C-GJTA (in the air now)");
  console.log("  assistant@jet.test the owner's assistant: schedule, no finances");
  console.log(`\nDemo 2FA key for admin and dispatch (add it to an authenticator app):`);
  console.log(`  ${new URL(otpauth).searchParams.get("secret")}`);
  console.log(`  backup codes: ${DEMO_BACKUP_CODES.join(", ")}\n`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
