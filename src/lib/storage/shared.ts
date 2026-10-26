/** Shared by the storage drivers (kept apart from index.ts to avoid an import cycle). */
export type UploadTicket = { url: string; method: "PUT"; headers: Record<string, string> };

export interface StorageDriver {
  /** A URL the browser can PUT exactly this file to, valid for a few minutes. */
  presignUpload(
    key: string,
    file: { contentType: string; sizeBytes: number; sha256Base64: string },
  ): Promise<UploadTicket>;
  /** A URL that downloads (or displays) the file, valid for a few minutes. */
  presignDownload(key: string, opts: { filename: string; contentType: string; inline?: boolean }): Promise<string>;
  /** The stored object's size, or null when nothing was uploaded under this key. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
}

export const UPLOAD_TTL_SECONDS = 5 * 60;
export const DOWNLOAD_TTL_SECONDS = 5 * 60;

/** Content-Disposition with a safe ASCII fallback and the real name in UTF-8. */
export function contentDisposition(filename: string, inline = false): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
