/**
 * Better Auth's two-factor plugin only challenges password sign-ins. Without
 * this plugin, an account with 2FA could sign in with a magic link or Google
 * and never be asked for a code.
 *
 * This applies the same challenge to every other way a session gets created:
 * the fresh session is discarded, the two-factor cookie is set, and the user
 * is redirected to /two-factor. It mirrors the plugin's own logic (same
 * cookies, same verification records, same trusted-device rules), so the
 * plugin's verify endpoints finish the sign-in exactly as for passwords.
 */
import { createHMAC } from "@better-auth/utils/hmac";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie, expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { safeNext } from "@/lib/safe-next";

// Must match better-auth/plugins/two-factor constants and options.
const TWO_FACTOR_COOKIE_NAME = "two_factor";
const TRUST_DEVICE_COOKIE_NAME = "trust_device";
const TRUST_DEVICE_MAX_AGE = 30 * 24 * 60 * 60;
const CHALLENGE_MAX_AGE = 10 * 60;

/** Sign-in endpoints other than the password one that create a session. */
const SESSION_CREATING_PATHS = new Set(["/magic-link/verify", "/callback/:id", "/verify-email"]);

/** Where the endpoint was about to send the browser, so the user lands there after the code. */
function intendedDestination(returned: unknown): string {
  const headers = (returned as { headers?: Headers } | undefined)?.headers;
  const location = headers instanceof Headers ? headers.get("location") : null;
  if (!location) return "/start";
  try {
    const url = new URL(location, "http://local");
    return safeNext(`${url.pathname}${url.search}`);
  } catch {
    return "/start";
  }
}

export const secondFactorEverywhere = () =>
  ({
    id: "second-factor-everywhere",
    hooks: {
      after: [
        {
          matcher: (ctx) => SESSION_CREATING_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession;
            if (!data || !(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) return;

            // A device the user chose to trust skips the code, as with passwords.
            const trustCookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
              maxAge: TRUST_DEVICE_MAX_AGE,
            });
            const trustValue = await ctx.getSignedCookie(trustCookie.name, ctx.context.secret);
            if (trustValue) {
              const [token, identifier] = trustValue.split("!");
              if (token && identifier) {
                const expected = await createHMAC("SHA-256", "base64urlnopad").sign(
                  ctx.context.secret,
                  `${data.user.id}!${identifier}`,
                );
                const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
                if (token === expected && record?.value === data.user.id && record.expiresAt > new Date()) return;
              }
              expireCookie(ctx, trustCookie);
            }

            const destination = intendedDestination(ctx.context.returned);

            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(data.session.token);
            ctx.context.setNewSession(null);

            const challengeCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, { maxAge: CHALLENGE_MAX_AGE });
            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(Date.now() + CHALLENGE_MAX_AGE * 1000);
            await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt });
            await ctx.context.internalAdapter.createVerificationValue({
              value: "0",
              identifier: `2fa-attempts-${identifier}`,
              expiresAt,
            });
            await ctx.setSignedCookie(challengeCookie.name, identifier, ctx.context.secret, challengeCookie.attributes);

            throw ctx.redirect(`/two-factor?next=${encodeURIComponent(destination)}`);
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
