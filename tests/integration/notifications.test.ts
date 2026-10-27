import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { notifications, ownerMembers, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { sendDueMessageEmails } from "@/lib/services/delayed-emails";
import { completeFlight, scheduleFlight } from "@/lib/services/flights";
import { addHours } from "@/lib/services/ledger";
import { planMaintenance } from "@/lib/services/maintenance";
import { listInbox, replyAsStaff, getOwnerThread, sendOwnerMessage } from "@/lib/services/messages";
import {
  getEmailPreferences,
  listNotifications,
  markAllNotificationsRead,
  saveEmailPreferences,
  unreadNotificationCount,
} from "@/lib/services/notification-center";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const sent: Email[] = [];
vi.mock("@/lib/email/send", () => ({ sendEmail: async (e: Email) => void sent.push(e) }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let finance: Actor;
let planeId: string;
let anne: { actor: Actor; ownerId: string; shareId: string };

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

const ofType = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  sent.length = 0;
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  finance = await staff("finance");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" })).id;
  const o = await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" });
  const s = await addShare(db, admin, planeId, {
    ownerId: o.id,
    percent: 50,
    startsOn: "2025-01-01",
    annualHours: "20",
  });
  const [u] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@example.com", emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  anne = { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] }, ownerId: o.id, shareId: s.id };
});

describe("email preferences", () => {
  it("are all on by default, and turning one off stops that email but not the in-app notice", async () => {
    expect((await getEmailPreferences(db, anne.actor)).every((p) => p.email)).toBe(true);
    await saveEmailPreferences(db, anne.actor, { on: ["invoice.issued", "budget.published", "hours.low"] });
    const prefs = await getEmailPreferences(db, anne.actor);
    expect(prefs.filter((p) => !p.email).map((p) => p.type)).toEqual(["maintenance.planned", "message.from_dispatch"]);

    await planMaintenance(db, dispatcher, {
      aircraftId: planeId,
      type: "inspection",
      title: "Inspection annuelle",
      startsAt: "2026-12-01T08:00",
      endsAt: "2026-12-03T17:00",
    });
    expect(await ofType(anne.actor.id, "maintenance.planned")).toHaveLength(1);
    expect(sent).toHaveLength(0);

    await saveEmailPreferences(db, anne.actor, { on: ["maintenance.planned"] });
    await planMaintenance(db, dispatcher, {
      aircraftId: planeId,
      type: "inspection",
      title: "Inspection de phase",
      startsAt: "2027-01-10T08:00",
      endsAt: "",
    });
    expect(sent.map((e) => e.subject)).toEqual(["Maintenance prévue sur C-GJTA"]);
    expect(sent[0]!.text).toContain("C-GJTA sera en maintenance à partir du 10 janvier 2027");
    expect(sent[0]!.text).not.toContain("Inspection de phase");
  });

  it("refuses types that can't be turned off", async () => {
    await expect(saveEmailPreferences(db, anne.actor, { on: ["access.uninvited_sign_up"] })).rejects.toThrow();
  });
});

describe("low hours", () => {
  it("warns once when the balance crosses 10% of the annual hours", async () => {
    await addHours(db, finance, anne.shareId, { kind: "purchase", hours: "3" }); // 180 min; the line is 120
    const fly = async (flown: string) => {
      const f = await scheduleFlight(db, dispatcher, {
        aircraftId: planeId,
        shareId: anne.shareId,
        fromAirport: "CYUL",
        toAirport: "KPBI",
        departsAt: "2026-09-01T08:00",
        arrivesAt: "",
      });
      await completeFlight(db, dispatcher, f.id, { flightTime: flown, arrivesAt: "" });
    };
    await fly("0:30"); // 150 left: still above
    expect(await ofType(anne.actor.id, "hours.low")).toHaveLength(0);
    await fly("0:45"); // 105 left: crosses
    expect(await ofType(anne.actor.id, "hours.low")).toHaveLength(1);
    expect(await ofType(finance.id, "hours.low_staff")).toHaveLength(1);
    expect(await ofType(dispatcher.id, "hours.low_staff")).toHaveLength(0);
    expect(sent.map((e) => e.subject)).toEqual(["Il vous reste 1,8 h sur C-GJTA"]);
    await fly("0:30"); // already below: no second warning
    expect(await ofType(anne.actor.id, "hours.low")).toHaveLength(1);
  });
});

describe("chat emails", () => {
  it("waits five minutes and skips replies the owner already read", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Bonjour" });
    const [conv] = await listInbox(db, dispatcher);
    await replyAsStaff(db, dispatcher, conv!.id, { body: "Bonjour Anne, voici votre confirmation." });

    expect(await sendDueMessageEmails(db)).toEqual({ sent: 0, skipped: 0 }); // too early
    const later = new Date(Date.now() + 6 * 60_000);
    expect(await sendDueMessageEmails(db, later)).toEqual({ sent: 1, skipped: 0 });
    expect(sent[0]!.text).toContain("Bonjour Anne, voici votre confirmation.");
    expect(await sendDueMessageEmails(db, later)).toEqual({ sent: 0, skipped: 0 }); // only once

    await replyAsStaff(db, dispatcher, conv!.id, { body: "Autre chose?" });
    await getOwnerThread(db, anne.actor, anne.ownerId); // read in the app
    expect(await sendDueMessageEmails(db, new Date(Date.now() + 6 * 60_000))).toEqual({ sent: 0, skipped: 0 });
  });
});

describe("the bell", () => {
  it("lists a person's own notifications with links, and marks them read", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Allô" });
    expect(await unreadNotificationCount(db, dispatcher)).toBe(1);
    const [item] = await listNotifications(db, dispatcher);
    expect(item!.href).toMatch(/^\/admin\/messages\/[0-9a-f-]+$/);
    expect(item!.data.ownerName).toBe("Anne");
    await markAllNotificationsRead(db, dispatcher);
    expect(await unreadNotificationCount(db, dispatcher)).toBe(0);
    expect(await listNotifications(db, anne.actor)).toHaveLength(0);
  });
});
