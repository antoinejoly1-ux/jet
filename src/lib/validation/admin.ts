/**
 * Input schemas for the admin back office. Shared by server actions (which
 * parse FormData) and services (which re-validate before writing).
 */
import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : null));

export const ownerInput = z.object({
  type: z.enum(["person", "company"]),
  legalName: z.string().trim().min(2).max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  phone: optionalText,
  locale: z.enum(["fr", "en"]),
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type OwnerInput = z.input<typeof ownerInput>;

export const holdingCompanyInput = z.object({
  legalName: z.string().trim().min(2).max(200),
  registrationNumber: optionalText,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  phone: optionalText,
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type HoldingCompanyInput = z.input<typeof holdingCompanyInput>;

/** Canadian marks look like C-GJTA; US N-numbers and others are allowed too. */
export const aircraftInput = z.object({
  registration: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,3}-?[A-Z0-9]{1,6}$/),
  model: z.string().trim().min(2).max(120),
  serialNumber: optionalText,
  homeBase: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,4}$/)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  status: z.enum(["available", "flying", "maintenance", "inactive"]),
  icaoHex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{6}$/)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  holdingCompanyId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
});
export type AircraftInput = z.input<typeof aircraftInput>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Percent and hours as people type them; stored as basis points and minutes. */
export const shareInput = z.object({
  ownerId: z.string().uuid(),
  percent: z.coerce.number().gt(0).lte(100),
  annualHours: z.coerce.number().min(0).max(5000).optional(),
  startsOn: isoDate,
});
export type ShareInput = z.input<typeof shareInput>;

export const endShareInput = z.object({ endsOn: isoDate });

export const staffRoleInput = z.object({
  role: z.enum(["admin", "finance", "dispatcher", "none"]),
});
