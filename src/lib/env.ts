import { z } from "zod";

/**
 * Server environment, validated once at startup so a missing variable fails
 * loudly instead of surfacing as a confusing runtime error.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Jet <noreply@example.com>"),
  /** "s3" in staging and production (private bucket in ca-central-1); "local" for development and tests. */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().default("ca-central-1"),
  LOCAL_STORAGE_DIR: z.string().default("tmp/storage"),
  /** "off" only for end-to-end test runs, which sign in many times a minute. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  /** 32 random bytes, base64: encrypts webhook secrets and integration credentials. Derived from BETTER_AUTH_SECRET if unset. */
  ENCRYPTION_KEY: z.string().optional().default(""),
  /** Shared secret scheduled jobs send to /api/cron/*. Jobs refuse to run without it. */
  CRON_SECRET: z
    .string()
    .min(16)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Law 25: the person in charge of protecting personal information, published on /privacy. */
  PRIVACY_OFFICER_NAME: z.string().optional().default(""),
  PRIVACY_OFFICER_EMAIL: z.string().optional().default(""),
  /** The operator's legal name, as it should appear in the privacy policy. */
  OPERATOR_LEGAL_NAME: z.string().optional().default(""),
  /** Shown to owners as a "call to book" button. Optional until the operator's number is settled. */
  OPERATOR_PHONE: z.string().optional().default(""),
  REQUIRE_STAFF_2FA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export const env = schema.parse(process.env);

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
