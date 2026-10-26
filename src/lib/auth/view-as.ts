/**
 * "View as owner": a staff member sees the Client side exactly as one owner
 * sees it, read-only. The choice lives in a signed cookie bound to the staff
 * member's user id and expiring after an hour, so it can't be forged, reused
 * by someone else, or forgotten on.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const VIEW_AS_COOKIE = "view_as";
export const VIEW_AS_TTL_SECONDS = 60 * 60;

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function encodeViewAs(secret: string, staffUserId: string, ownerId: string, now = Date.now()): string {
  const payload = `${staffUserId}.${ownerId}.${now + VIEW_AS_TTL_SECONDS * 1000}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** Returns the owner id when the cookie is valid for this staff member, else null. */
export function decodeViewAs(
  secret: string,
  staffUserId: string,
  value: string | undefined,
  now = Date.now(),
): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [userId, ownerId, expires, signature] = parts as [string, string, string, string];
  const expected = Buffer.from(sign(secret, `${userId}.${ownerId}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (userId !== staffUserId || Number(expires) < now) return null;
  return ownerId;
}
