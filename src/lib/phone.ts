/**
 * The operator's phone number, however it was typed in the environment
 * (« +1 514 555-0100 », « (514) 555-0100 », « 5145550100 »): one link form for
 * tel:/sms:, and a display form in each language's convention.
 */

/** North American numbers as their 10 digits; anything else stays as typed. */
function nanp(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

/** "+15145550100", for tel: and sms: links. */
export function e164(raw: string): string {
  const n = nanp(raw);
  return n ? `+1${n}` : raw.replace(/[^\d+]/g, "");
}

export const telHref = (raw: string) => `tel:${e164(raw)}`;
export const smsHref = (raw: string) => `sms:${e164(raw)}`;

/** « 514 555-0100 » in French (OQLF), "514-555-0100" in English. */
export function formatPhone(raw: string, locale: string): string {
  const n = nanp(raw);
  if (!n) return raw;
  const [area, exchange, line] = [n.slice(0, 3), n.slice(3, 6), n.slice(6)];
  return locale.startsWith("en") ? `${area}-${exchange}-${line}` : `${area} ${exchange}-${line}`;
}
