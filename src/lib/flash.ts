import "server-only";
import { cookies } from "next/headers";

/**
 * One-time confirmations after an action ("Vol clôturé"): the action sets a
 * short-lived cookie, the shell shows it as a toast on the next render and
 * the toast clears it. Works across redirects and with JavaScript off.
 */
export const FLASH_COOKIE = "flash";

export const FLASHES = [
  "flightScheduled",
  "flightUpdated",
  "flightClosed",
  "flightCancelled",
  "maintenanceSaved",
  "maintenanceStatus",
  "invitationSent",
  "invitationRevoked",
  "profileSaved",
] as const;
export type Flash = (typeof FLASHES)[number];

export async function flash(key: Flash) {
  (await cookies()).set(FLASH_COOKIE, key, { path: "/", maxAge: 30, sameSite: "lax" });
}

export async function readFlash(): Promise<Flash | null> {
  const value = (await cookies()).get(FLASH_COOKIE)?.value;
  return (FLASHES as readonly string[]).includes(value ?? "") ? (value as Flash) : null;
}
