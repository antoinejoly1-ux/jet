"use client";

import { completeUploadAction, requestUploadAction } from "@/app/actions/files";
import type { FormState } from "@/lib/forms";

export type UploadResult = { ok: true; fileId: string; duplicateOf: string | null } | { ok: false; state: FormState };

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Some systems label CSV files oddly; normalise so the server's allow-list is predictable. */
function contentTypeOf(file: File): string {
  if (file.name.toLowerCase().endsWith(".csv")) return "text/csv";
  return file.type || "application/octet-stream";
}

/**
 * Uploads a file straight to storage: ask the server for a signed URL, PUT
 * the bytes there, then confirm. The file never passes through the app server.
 */
export async function uploadFile(
  file: File,
  purpose: "invoice" | "import" | "message" | "avatar" | "receipt",
): Promise<UploadResult> {
  const request = {
    purpose,
    filename: file.name,
    contentType: contentTypeOf(file),
    sizeBytes: file.size,
    sha256: await sha256Hex(file),
  };
  const step1 = await requestUploadAction(request);
  if (!step1.ok) return step1;
  const put = await fetch(step1.url, { method: "PUT", headers: step1.headers, body: file });
  if (!put.ok) return { ok: false, state: { status: "error", code: "upload_failed" } };
  return completeUploadAction({ ...request, key: step1.key });
}
