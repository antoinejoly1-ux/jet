/**
 * Money is typed by people as dollars ("1 234,56" or "1234.56") and stored as
 * integer cents. Parsing happens once, here.
 */
import { z } from "zod";

/** "1 234,56 $", "1,234.56", "-50" → cents. Accepts French and English formats. */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/[\s  $]/g, "").replace(/CAD|USD/gi, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return s.startsWith("-") ? -cents : cents;
}

export const money = z.string().transform((v, ctx) => {
  const cents = parseMoneyToCents(v);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "invalid_amount" });
    return z.NEVER;
  }
  return cents;
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const invoiceInput = z.object({
  shareId: z.string().uuid(),
  flightId: optionalUuid,
  number: z.string().trim().min(1).max(60),
  issuedOn: isoDate,
  dueOn: isoDate.optional().or(z.literal("").transform(() => undefined)),
  total: money.refine((c) => c > 0, "must_be_positive"),
  currency: z.enum(["CAD", "USD"]),
  fileId: optionalUuid,
});
export type InvoiceInput = z.input<typeof invoiceInput>;

export const transactionInput = z.object({
  shareId: z.string().uuid(),
  occurredOn: isoDate,
  kind: z.enum(["cost", "revenue", "payment"]),
  amount: money.refine((c) => c !== 0, "must_not_be_zero"),
  currency: z.enum(["CAD", "USD"]),
  categoryId: optionalUuid,
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});
export type TransactionInput = z.input<typeof transactionInput>;

export const hoursInput = z.object({
  kind: z.enum(["purchase", "adjustment"]),
  hours: z.coerce
    .number()
    .refine((h) => h !== 0 && Math.abs(h) <= 2000, "invalid_hours")
    .transform((h) => Math.round(h * 60)),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});
export type HoursInput = z.input<typeof hoursInput>;

export const budgetLinesInput = z.array(
  z.object({ categoryId: z.string().uuid(), planned: money.refine((c) => c >= 0) }),
);
