"use server";

import { requireAccess, requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import { completeUpload, requestUpload, type UploadRequest } from "@/lib/services/files";

export type UploadStep1 =
  { ok: true; key: string; url: string; headers: Record<string, string> } | { ok: false; state: FormState };
export type UploadStep2 = { ok: true; fileId: string; duplicateOf: string | null } | { ok: false; state: FormState };

/** Owners may upload only chat attachments; everything else is back-office work. */
const uploader = (input: UploadRequest) => (input.purpose === "message" ? requireAccess() : requireStaff());

export async function requestUploadAction(input: UploadRequest): Promise<UploadStep1> {
  const viewer = await uploader(input);
  try {
    const { key, ticket } = await requestUpload(db, viewer, input);
    return { ok: true, key, url: ticket.url, headers: ticket.headers };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}

export async function completeUploadAction(input: UploadRequest & { key: string }): Promise<UploadStep2> {
  const viewer = await uploader(input);
  try {
    const { file, duplicates } = await completeUpload(db, viewer, input);
    return { ok: true, fileId: file.id, duplicateOf: duplicates[0]?.originalName ?? null };
  } catch (err) {
    return { ok: false, state: formError(err) };
  }
}
