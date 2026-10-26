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
  /** "off" only for end-to-end test runs, which sign in many times a minute. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  REQUIRE_STAFF_2FA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export const env = schema.parse(process.env);

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
