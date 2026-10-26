import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

// The 2FA redirect after a password sign-in is handled by the sign-in form,
// which knows where the user was going.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), twoFactorClient()],
});
