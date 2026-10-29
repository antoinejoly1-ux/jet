import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { auditLog, user } from "@/lib/db/schema";
import { localPath } from "@/lib/storage/local";
import { completeUpload, requestUpload } from "@/lib/services/files";
import {
  avatarStorageKey,
  avatarUrl,
  completeOnboarding,
  removeAvatar,
  setAvatar,
  updateProfile,
} from "@/lib/services/profile";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let helene: Actor;
let marc: Actor;

async function person(name: string, staffRole: "admin" | null = null) {
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@jet.test`, emailVerified: true, staffRole })
    .returning();
  return { id: u!.id, staffRole, ownerIds: [] } satisfies Actor;
}

const photo = Buffer.from("RIFF fake webp portrait");
const sha256 = createHash("sha256").update(photo).digest("hex");

/** Uploads a photo the way the browser does: sign, PUT, confirm. */
async function uploadAvatar(actor: Actor) {
  const req = {
    purpose: "avatar" as const,
    filename: "avatar.webp",
    contentType: "image/webp",
    sizeBytes: photo.length,
    sha256,
  };
  const { key } = await requestUpload(db, actor, req);
  await mkdir(path.dirname(localPath(key)), { recursive: true });
  await writeFile(localPath(key), photo);
  return (await completeUpload(db, actor, { ...req, key })).file;
}

const audited = (userId: string, action: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityId, userId), eq(auditLog.action, action)));

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  helene = await person("Helene");
  marc = await person("Marc", "admin");
});

describe("profile", () => {
  it("updates one's own name and language, audited", async () => {
    await updateProfile(db, helene, { firstName: " Hélène ", lastName: "Fortin", locale: "en" });
    const [row] = await db.select().from(user).where(eq(user.id, helene.id));
    expect(row).toMatchObject({ name: "Hélène Fortin", locale: "en" });
    const [entry] = await audited(helene.id, "profile.update");
    expect(entry).toMatchObject({ actorUserId: helene.id, after: { name: "Hélène Fortin", locale: "en" } });
    await expect(updateProfile(db, helene, { firstName: "  " })).rejects.toThrow();
  });

  it("lets anyone signed in upload a photo, within the avatar rules", async () => {
    const base = { purpose: "avatar" as const, filename: "a.webp", sha256 };
    await expect(
      requestUpload(db, helene, { ...base, contentType: "application/pdf", sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: "file_type_not_allowed" });
    await expect(
      requestUpload(db, helene, { ...base, contentType: "image/webp", sizeBytes: 6 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: "file_too_large" });
    const file = await uploadAvatar(helene);
    expect(file.storageKey).toMatch(/^avatars\/.+\.webp$/);
  });

  it("sets and removes one's own photo, never someone else's", async () => {
    const file = await uploadAvatar(helene);
    await expect(setAvatar(db, marc, file.id)).rejects.toMatchObject({ entity: "file" });

    await setAvatar(db, helene, file.id);
    const [row] = await db.select().from(user).where(eq(user.id, helene.id));
    expect(row).toMatchObject({ avatarFileId: file.id, image: avatarUrl(helene.id, file.id) });
    expect(await avatarStorageKey(db, helene.id)).toEqual({ key: file.storageKey, contentType: "image/webp" });
    expect(await audited(helene.id, "profile.avatar_set")).toHaveLength(1);

    await removeAvatar(db, helene);
    const [after] = await db.select().from(user).where(eq(user.id, helene.id));
    expect(after).toMatchObject({ avatarFileId: null, image: null });
    expect(await avatarStorageKey(db, helene.id)).toBeNull();
    expect(await audited(helene.id, "profile.avatar_remove")).toHaveLength(1);
  });

  it("refuses a file that wasn't uploaded as a photo", async () => {
    const pdf = Buffer.from("%PDF-1.7");
    const req = {
      purpose: "message" as const,
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    };
    const { key } = await requestUpload(db, marc, req);
    await mkdir(path.dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), pdf);
    const { file } = await completeUpload(db, marc, { ...req, key });
    await expect(setAvatar(db, marc, file.id)).rejects.toMatchObject({ code: "not_an_avatar" });
  });

  it("marks the welcome tour done", async () => {
    await completeOnboarding(db, helene);
    const [row] = await db.select().from(user).where(eq(user.id, helene.id));
    expect(row!.onboardedAt).toBeInstanceOf(Date);
    expect(await audited(helene.id, "profile.onboarded")).toHaveLength(1);
  });
});
