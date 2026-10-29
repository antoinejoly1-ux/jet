/**
 * Chat between an owner and the dispatch team. Each owner has one running
 * thread; staff assign it to themselves and mark it resolved, and a new
 * message reopens it. Messages are never edited or deleted.
 */
import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import {
  conversations,
  files,
  messages,
  notifications,
  ownerMembers,
  owners,
  user,
  type MessageMeta,
} from "@/lib/db/schema";
import { authorize, can, type Actor } from "@/lib/auth/policy";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

export const messageInput = z.object({
  body: z.string().trim().max(4000),
  attachmentFileId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type MessageInput = z.input<typeof messageInput>;

const parse = (raw: MessageInput) => {
  const input = messageInput.parse(raw);
  if (!input.body && !input.attachmentFileId) throw new ConflictError("message_empty");
  return input;
};

const preview = (body: string) => (body.length > 140 ? `${body.slice(0, 137)}…` : body);

const sender = alias(user, "sender");
const threadColumns = {
  id: messages.id,
  body: messages.body,
  createdAt: messages.createdAt,
  readAt: messages.readAt,
  senderUserId: messages.senderUserId,
  senderName: sender.name,
  fromStaff: sql<boolean>`${sender.staffRole} is not null`,
  attachmentFileId: messages.attachmentFileId,
  attachmentName: files.originalName,
  meta: messages.meta,
};

async function readThread(db: Db, conversationId: string) {
  return db
    .select(threadColumns)
    .from(messages)
    .leftJoin(sender, eq(sender.id, messages.senderUserId))
    .leftJoin(files, eq(files.id, messages.attachmentFileId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

async function conversationFor(tx: Tx | Db, ownerId: string) {
  const [existing] = await tx.select().from(conversations).where(eq(conversations.ownerId, ownerId));
  if (existing) return existing;
  const [created] = await tx
    .insert(conversations)
    .values({ ownerId })
    .onConflictDoNothing({ target: conversations.ownerId })
    .returning();
  return created ?? (await tx.select().from(conversations).where(eq(conversations.ownerId, ownerId)))[0]!;
}

/** The attachment must exist and be one the sender uploaded, so nobody attaches someone else's file. */
async function assertOwnAttachment(tx: Tx, actor: Actor, fileId: string | undefined) {
  if (!fileId) return;
  const [file] = await tx.select({ by: files.uploadedByUserId }).from(files).where(eq(files.id, fileId));
  if (!file || file.by !== actor.id) throw new NotFoundError("file");
}

/* ---------- Owner side ---------- */

/** The owner's thread with dispatch. Opening it marks dispatch's messages read, unless staff are only viewing as. */
export async function getOwnerThread(db: Db, actor: Actor, ownerId: string, { markRead = true } = {}) {
  // Reading is open to every member; read-only members just can't write.
  authorize(actor, "owners:read", { ownerIds: [ownerId] });
  const [conversation] = await db.select().from(conversations).where(eq(conversations.ownerId, ownerId));
  if (!conversation) return { conversationId: null, messages: [] };
  if (markRead) await markRead_(db, conversation.id, "staff");
  return { conversationId: conversation.id, messages: await readThread(db, conversation.id) };
}

export async function sendOwnerMessage(db: Db, actor: Actor, ownerId: string, raw: MessageInput) {
  authorize(actor, "messages:send", { ownerIds: [ownerId] });
  const input = parse(raw);
  return db.transaction(async (tx) => {
    await assertOwnAttachment(tx, actor, input.attachmentFileId);
    return postOwnerMessage(tx, actor, ownerId, { body: input.body, attachmentFileId: input.attachmentFileId });
  });
}

/**
 * Writes an owner's message in their thread (reopening it if resolved) and
 * tells dispatch. The caller has already authorized and runs the transaction.
 */
export async function postOwnerMessage(
  tx: Tx,
  actor: Actor,
  ownerId: string,
  content: { body: string; attachmentFileId?: string; meta?: MessageMeta },
) {
  const conversation = await conversationFor(tx, ownerId);
  const [message] = await tx
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderUserId: actor.id,
      body: content.body,
      attachmentFileId: content.attachmentFileId ?? null,
      meta: content.meta ?? null,
    })
    .returning();
  if (conversation.resolvedAt)
    await tx.update(conversations).set({ resolvedAt: null }).where(eq(conversations.id, conversation.id));
  else await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

  // The assigned dispatcher hears about it; with nobody assigned, everyone who can answer does.
  const [owner] = await tx.select({ name: owners.legalName }).from(owners).where(eq(owners.id, ownerId));
  const recipients = conversation.assignedToUserId
    ? [{ id: conversation.assignedToUserId }]
    : await tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.staffRole, ["admin", "dispatcher"]));
  if (recipients.length)
    await tx.insert(notifications).values(
      recipients.map((r) => ({
        userId: r.id,
        type: "message.from_owner",
        data: {
          conversationId: conversation.id,
          messageId: message!.id,
          ownerName: owner?.name ?? "",
          preview: preview(content.body),
        },
      })),
    );
  return message!;
}

/* ---------- Staff side ---------- */

export type InboxFilter = "waiting" | "open" | "mine" | "resolved";

/** Conversations for the back office, most recent activity first, with unread counts. */
export async function listInbox(db: Db, actor: Actor, filter: InboxFilter = "waiting") {
  authorize(actor, "messages:reply");
  const assignee = alias(user, "assignee");
  // "En attente": open threads whose latest message is the owner's, i.e. someone is waiting for us.
  const ownerWrote = sql`(select u.staff_role from messages m left join users u on u.id = m.sender_user_id
    where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1) is null`;
  const where =
    filter === "resolved"
      ? isNotNull(conversations.resolvedAt)
      : filter === "mine"
        ? and(isNull(conversations.resolvedAt), eq(conversations.assignedToUserId, actor.id))
        : filter === "waiting"
          ? and(isNull(conversations.resolvedAt), ownerWrote)
          : isNull(conversations.resolvedAt);
  const lastAt = sql<Date | null>`(select max(m.created_at) from messages m where m.conversation_id = ${conversations.id})`;
  return (
    db
      .select({
        id: conversations.id,
        ownerId: conversations.ownerId,
        ownerName: owners.legalName,
        ownerImage: sql<string | null>`(select u.image from owner_members m join users u on u.id = m.user_id
          where m.owner_id = ${owners.id} and u.image is not null order by (m.role = 'owner') desc limit 1)`,
        assignedToUserId: conversations.assignedToUserId,
        assignedToName: assignee.name,
        resolvedAt: conversations.resolvedAt,
        lastMessageAt: lastAt,
        lastBody: sql<
          string | null
        >`(select m.body from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
        unread: sql<number>`(select count(*)::int from messages m join users u on u.id = m.sender_user_id
        where m.conversation_id = ${conversations.id} and m.read_at is null and u.staff_role is null)`,
      })
      .from(conversations)
      .innerJoin(owners, eq(owners.id, conversations.ownerId))
      .leftJoin(assignee, eq(assignee.id, conversations.assignedToUserId))
      // Threads opened from an owner's page but never written in stay out of the inbox.
      .where(and(where, sql`${lastAt} is not null`))
      // Waiting: longest wait first. Everything else: latest activity first.
      .orderBy(filter === "waiting" ? asc(lastAt) : desc(lastAt))
      .limit(200)
  );
}

/** A thread for staff. Opening it marks the owner's messages read. */
export async function getStaffThread(db: Db, actor: Actor, conversationId: string) {
  authorize(actor, "messages:reply");
  const assignee = alias(user, "assignee");
  const [conversation] = await db
    .select({
      id: conversations.id,
      ownerId: conversations.ownerId,
      ownerName: owners.legalName,
      ownerEmail: owners.email,
      ownerPhone: owners.phone,
      assignedToUserId: conversations.assignedToUserId,
      assignedToName: assignee.name,
      resolvedAt: conversations.resolvedAt,
    })
    .from(conversations)
    .innerJoin(owners, eq(owners.id, conversations.ownerId))
    .leftJoin(assignee, eq(assignee.id, conversations.assignedToUserId))
    .where(eq(conversations.id, conversationId));
  if (!conversation) throw new NotFoundError("conversation");
  await markRead_(db, conversationId, "owner");
  // Notifications about this thread are now seen too.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.id),
        eq(notifications.type, "message.from_owner"),
        isNull(notifications.readAt),
        sql`${notifications.data}->>'conversationId' = ${conversationId}`,
      ),
    );
  return { conversation, messages: await readThread(db, conversationId) };
}

/** Starts or continues the thread with an owner, from the owner's page. */
export async function conversationIdForOwner(db: Db, actor: Actor, ownerId: string) {
  authorize(actor, "messages:reply");
  const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId));
  if (!owner) throw new NotFoundError("owner");
  return (await conversationFor(db, ownerId)).id;
}

export async function replyAsStaff(db: Db, actor: Actor, conversationId: string, raw: MessageInput) {
  authorize(actor, "messages:reply");
  const input = parse(raw);
  return db.transaction(async (tx) => {
    await assertOwnAttachment(tx, actor, input.attachmentFileId);
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    if (!conversation) throw new NotFoundError("conversation");
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderUserId: actor.id,
        body: input.body,
        attachmentFileId: input.attachmentFileId ?? null,
      })
      .returning();
    // Answering takes the thread if nobody has it, and reopens it if it was resolved.
    await tx
      .update(conversations)
      .set({ assignedToUserId: conversation.assignedToUserId ?? actor.id, resolvedAt: null })
      .where(eq(conversations.id, conversationId));
    // Every login of the owner sees it in the app; the email waits five minutes in case they read it first.
    const members = await tx
      .select({ userId: ownerMembers.userId })
      .from(ownerMembers)
      .where(eq(ownerMembers.ownerId, conversation.ownerId));
    if (members.length)
      await tx.insert(notifications).values(
        members.map((m) => ({
          userId: m.userId,
          type: "message.from_dispatch",
          data: { conversationId, messageId: message!.id, preview: preview(input.body) },
        })),
      );
    return message!;
  });
}

export async function assignConversation(db: Db, actor: Actor, conversationId: string, userId: string | null) {
  authorize(actor, "messages:reply");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).for("update");
    if (!before) throw new NotFoundError("conversation");
    if (userId) {
      const [target] = await tx.select({ role: user.staffRole }).from(user).where(eq(user.id, userId));
      if (!target || !can({ id: userId, staffRole: target.role, ownerIds: [] }, "messages:reply"))
        throw new ConflictError("assignee_cannot_reply");
    }
    await tx.update(conversations).set({ assignedToUserId: userId }).where(eq(conversations.id, conversationId));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "conversation.assign",
      entityType: "conversation",
      entityId: conversationId,
      before: { assignedToUserId: before.assignedToUserId },
      after: { assignedToUserId: userId },
    });
  });
}

export async function setResolved(db: Db, actor: Actor, conversationId: string, resolved: boolean) {
  authorize(actor, "messages:reply");
  const [row] = await db
    .update(conversations)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });
  if (!row) throw new NotFoundError("conversation");
}

/** Staff who can answer, for the "assign to" picker (finance can take billing questions). */
export async function listResponders(db: Db, actor: Actor) {
  authorize(actor, "messages:reply");
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(isNotNull(user.staffRole))
    .orderBy(asc(user.name));
}

/* ---------- Shared ---------- */

/** Marks the other side's messages read: "staff" marks staff messages (owner reading), "owner" the reverse. */
async function markRead_(db: Db, conversationId: string, from: "staff" | "owner") {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.readAt),
        sql`exists (select 1 from users u where u.id = ${messages.senderUserId} and u.staff_role is ${sql.raw(from === "staff" ? "not null" : "null")})`,
      ),
    );
  if (from === "staff")
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.type, "message.from_dispatch"),
          isNull(notifications.readAt),
          sql`${notifications.data}->>'conversationId' = ${conversationId}`,
        ),
      );
}

/** Badge counts for the navigation. */
export async function unreadMessageCount(db: Db, actor: Actor, side: "client" | "admin"): Promise<number> {
  if (side === "admin") {
    if (!can(actor, "messages:reply")) return 0;
    const [row] = await db
      .select({ n: count() })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(user, eq(user.id, messages.senderUserId))
      .where(
        and(
          isNull(messages.readAt),
          isNull(user.staffRole),
          isNull(conversations.resolvedAt),
          or(isNull(conversations.assignedToUserId), eq(conversations.assignedToUserId, actor.id)),
        ),
      );
    return row?.n ?? 0;
  }
  if (actor.ownerIds.length === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(user, eq(user.id, messages.senderUserId))
    .where(
      and(
        isNull(messages.readAt),
        sql`${user.staffRole} is not null`,
        inArray(conversations.ownerId, [...actor.ownerIds]),
      ),
    );
  return row?.n ?? 0;
}
