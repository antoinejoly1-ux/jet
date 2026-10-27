import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, magicLink, twoFactor } from "better-auth/plugins";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/lib/db";
import { account, rateLimit, session, twoFactor as twoFactorTable, user, verification } from "@/lib/db/schema";
import { actionEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env, googleEnabled } from "@/lib/env";
import { recordAudit } from "@/lib/services/audit";
import { secondFactorEverywhere } from "./second-factor-everywhere";
import { notifyAdminsOfUninvitedSignUp } from "@/lib/services/notifications";

const asLocale = (value: unknown) => (value === "en" ? "en" : "fr");

export const auth = betterAuth({
  appName: "Univair Management",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, twoFactor: twoFactorTable, rateLimit },
  }),
  advanced: {
    database: { generateId: () => uuidv7() },
  },
  user: {
    additionalFields: {
      staffRole: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, defaultValue: "fr", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(actionEmail("reset", user.email, url, asLocale((user as { locale?: string }).locale)));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(actionEmail("verify", user.email, url, asLocale((user as { locale?: string }).locale)));
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {},
  account: {
    // Signing in with Google using the same verified email lands in the same account.
    accountLinking: { enabled: true, trustedProviders: ["google", "email-password"] },
  },
  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT === "on",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await recordAudit(db, {
            actorUserId: created.id,
            action: "auth.sign_up",
            entityType: "user",
            entityId: created.id,
          });
          // Invitation acceptance links the account right after; until then the
          // account has no access, and admins are told someone is waiting.
          await notifyAdminsOfUninvitedSignUp(db, { userId: created.id, email: created.email });
        },
      },
    },
    session: {
      create: {
        after: async (created) => {
          await recordAudit(db, {
            actorUserId: created.userId,
            action: "auth.sign_in",
            entityType: "session",
            entityId: created.id,
            ipAddress: created.ipAddress ?? null,
            userAgent: created.userAgent ?? null,
          });
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 10,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendEmail(actionEmail("magicLink", email, url));
      },
    }),
    // Authenticator-app 2FA. Passwordless users (Google, magic link) can enable it too.
    twoFactor({ issuer: "Univair", allowPasswordless: true }),
    // The plugin above only challenges password sign-ins; this covers magic links,
    // Google and email verification, so 2FA can't be skipped by changing method.
    secondFactorEverywhere(),
    // Checks new passwords against known breaches. Needs outbound network, so production only.
    ...(process.env.NODE_ENV === "production" ? [haveIBeenPwned()] : []),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
