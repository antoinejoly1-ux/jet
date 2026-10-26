/**
 * Navigates with a full page load. Used right after sign-in steps, so every
 * server component re-renders with the new session, and for destinations that
 * may be route handlers (such as /start) rather than pages.
 */
export function fullPageLoad(to: string) {
  window.location.assign(to);
}
