/** Only same-site paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = "/start"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
