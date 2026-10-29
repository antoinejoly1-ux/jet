/**
 * A person's own profile: their name, language and photo, and the welcome
 * tour. Everyone may change these for themselves only; every change is audited.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { files, user } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

export const profileInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  locale: z.enum(["fr", "en"]).optional(),
});
export type ProfileInput = z.input<typeof profileInput>;

/** The URL the avatar route answers at; the file id busts caches when the photo changes. */
export const avatarUrl = (userId: string, fileId: string) => `/avatars/${userId}?v=${fileId}`;

export async function updateProfile(db: Db, actor: Actor, raw: ProfileInput) {
  const input = profileInput.parse(raw);
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ name: user.name, locale: user.locale }).from(user).where(eq(user.id, actor.id));
    if (!before) throw new NotFoundError("user");
    const after = { name, ...(input.locale ? { locale: input.locale } : {}) };
    await tx.update(user).set(after).where(eq(user.id, actor.id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "profile.update",
      entityType: "user",
      entityId: actor.id,
      before,
      after,
    });
  });
}

/** Uses a photo the person just uploaded (purpose "avatar") as their profile photo. */
export async function setAvatar(db: Db, actor: Actor, fileId: string) {
  await db.transaction(async (tx) => {
    const [file] = await tx
      .select({ id: files.id, key: files.storageKey })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.uploadedByUserId, actor.id)));
    if (!file) throw new NotFoundError("file");
    if (!file.key.startsWith("avatars/")) throw new ConflictError("not_an_avatar");
    await tx
      .update(user)
      .set({ avatarFileId: file.id, image: avatarUrl(actor.id, file.id) })
      .where(eq(user.id, actor.id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "profile.avatar_set",
      entityType: "user",
      entityId: actor.id,
      after: { fileId },
    });
  });
}

export async function removeAvatar(db: Db, actor: Actor) {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ avatarFileId: null, image: null }).where(eq(user.id, actor.id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "profile.avatar_remove",
      entityType: "user",
      entityId: actor.id,
    });
  });
}

/** Marks the welcome tour done, once. */
export async function completeOnboarding(db: Db, actor: Actor) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(user)
      .set({ onboardedAt: new Date() })
      .where(eq(user.id, actor.id))
      .returning({ id: user.id });
    if (!row) throw new NotFoundError("user");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "profile.onboarded",
      entityType: "user",
      entityId: actor.id,
    });
  });
}

/** Shows the welcome tour again at the next visit, from Settings. */
export async function restartOnboarding(db: Db, actor: Actor) {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ onboardedAt: null }).where(eq(user.id, actor.id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "profile.tour_restarted",
      entityType: "user",
      entityId: actor.id,
    });
  });
}

/** Where a person's photo is stored, for the avatar route. Any signed-in person may see team members' and co-owners' photos. */
export async function avatarStorageKey(db: Db, userId: string) {
  const [row] = await db
    .select({ key: files.storageKey, contentType: files.contentType })
    .from(user)
    .innerJoin(files, eq(files.id, user.avatarFileId))
    .where(eq(user.id, userId));
  return row ?? null;
}
