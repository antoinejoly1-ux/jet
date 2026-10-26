import "server-only";
import type { SchedulingAdapter } from "./types";

export type { SchedulingAdapter } from "./types";

/**
 * The configured scheduling software, or null while none is connected. The
 * vendor isn't chosen yet; its adapter is added here when it is.
 */
export function getSchedulingAdapter(): SchedulingAdapter | null {
  return null;
}
