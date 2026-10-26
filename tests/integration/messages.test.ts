import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { files, notifications, ownerMembers, user } from "@/lib/db/schema";
import {
  assignConversation,
  getOwnerThread,
  getStaffThread,
  listInbox,
  replyAsStaff,
  sendOwnerMessage,
  setResolved,
  unreadMessageCount,
} from "@/lib/services/messages";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let finance: Actor;
let anne: { actor: Actor; ownerId: string };
let bruno: { actor: Actor; ownerId: string };

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function owner(name: string) {
  const o = await createOwner(db, admin, { type: "person", legalName: name, locale: "fr" });
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  return { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] } satisfies Actor, ownerId: o.id };
}

const notificationsOf = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  finance = await staff("finance");
  anne = await owner("Anne");
  bruno = await owner("Bruno");
});

describe("chat with dispatch", () => {
  it("an owner writes, dispatch is told, answers, and both sides see read state", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Puis-je réserver vendredi?" });
    expect(await unreadMessageCount(db, dispatcher, "admin")).toBe(1);
    // Nobody is assigned, so everyone who answers owners hears about it; finance doesn't.
    expect(await notificationsOf(dispatcher.id, "message.from_owner")).toHaveLength(1);
    expect(await notificationsOf(admin.id, "message.from_owner")).toHaveLength(1);
    expect(await notificationsOf(finance.id, "message.from_owner")).toHaveLength(0);

    const [row] = await listInbox(db, dispatcher, "open");
    expect(row).toMatchObject({ ownerName: "Anne", unread: 1, lastBody: "Puis-je réserver vendredi?" });

    const opened = await getStaffThread(db, dispatcher, row!.id);
    expect(opened.messages[0]!.fromStaff).toBe(false);
    expect(await unreadMessageCount(db, dispatcher, "admin")).toBe(0);

    await replyAsStaff(db, dispatcher, row!.id, { body: "Oui, c'est noté." });
    // Answering takes the thread.
    expect((await listInbox(db, dispatcher, "mine")).map((r) => r.id)).toEqual([row!.id]);
    expect(await unreadMessageCount(db, anne.actor, "client")).toBe(1);
    expect(await notificationsOf(anne.actor.id, "message.from_dispatch")).toHaveLength(1);

    const thread = await getOwnerThread(db, anne.actor, anne.ownerId);
    expect(thread.messages.map((m) => [m.body, m.fromStaff])).toEqual([
      ["Puis-je réserver vendredi?", false],
      ["Oui, c'est noté.", true],
    ]);
    expect(await unreadMessageCount(db, anne.actor, "client")).toBe(0);
    const [notice] = await notificationsOf(anne.actor.id, "message.from_dispatch");
    expect(notice!.readAt).not.toBeNull();
  });

  it("keeps one thread per owner, and a new message reopens a resolved one", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Bonjour" });
    const [row] = await listInbox(db, dispatcher, "open");
    await setResolved(db, dispatcher, row!.id, true);
    expect(await listInbox(db, dispatcher, "open")).toHaveLength(0);
    expect(await listInbox(db, dispatcher, "resolved")).toHaveLength(1);

    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Encore moi" });
    const open = await listInbox(db, dispatcher, "open");
    expect(open.map((r) => r.id)).toEqual([row!.id]);
  });

  it("only notifies the assigned dispatcher once someone has the thread", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Un" });
    const [row] = await listInbox(db, dispatcher, "open");
    await assignConversation(db, admin, row!.id, dispatcher.id);
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Deux" });
    expect(await notificationsOf(dispatcher.id, "message.from_owner")).toHaveLength(2);
    expect(await notificationsOf(admin.id, "message.from_owner")).toHaveLength(1);
    await expect(assignConversation(db, admin, row!.id, anne.actor.id)).rejects.toMatchObject({
      code: "assignee_cannot_reply",
    });
  });

  it("keeps owners to their own thread", async () => {
    await sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "Privé" });
    await expect(getOwnerThread(db, bruno.actor, anne.ownerId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendOwnerMessage(db, bruno.actor, anne.ownerId, { body: "Salut" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listInbox(db, anne.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses empty messages and someone else's attachment", async () => {
    await expect(sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "   " })).rejects.toMatchObject({
      code: "message_empty",
    });
    const [file] = await db
      .insert(files)
      .values({
        storageKey: "messages/x.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        sha256: "0".repeat(64),
        uploadedByUserId: bruno.actor.id,
      })
      .returning();
    await expect(
      sendOwnerMessage(db, anne.actor, anne.ownerId, { body: "", attachmentFileId: file!.id }),
    ).rejects.toMatchObject({ entity: "file" });
    await expect(
      sendOwnerMessage(db, bruno.actor, bruno.ownerId, { body: "", attachmentFileId: file!.id }),
    ).resolves.toBeTruthy();
  });
});
