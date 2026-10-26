import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Full page load on purpose: this runs outside React, so there is no router.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/two-factor");
      },
    }),
  ],
});
