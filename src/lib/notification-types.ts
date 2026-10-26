/**
 * Every kind of notification the portal sends, in one place: who it's for,
 * where it links, and whether its email can be turned off. Security emails
 * (sign-in links, password resets) aren't notifications and can't be.
 */
export const NOTIFICATION_TYPES = {
  "invoice.issued": { audience: "owner", optionalEmail: true, href: () => "/invoices" },
  "budget.published": { audience: "owner", optionalEmail: true, href: () => "/finances" },
  "hours.low": { audience: "owner", optionalEmail: true, href: () => "/" },
  "maintenance.planned": { audience: "owner", optionalEmail: true, href: () => "/aircraft" },
  "message.from_dispatch": { audience: "owner", optionalEmail: true, href: () => "/messages" },
  "message.from_owner": {
    audience: "staff",
    optionalEmail: false,
    href: (d: Record<string, string>) => `/admin/messages/${d.conversationId}`,
  },
  "hours.low_staff": { audience: "staff", optionalEmail: false, href: () => "/admin/budgets" },
  "access.uninvited_sign_up": { audience: "staff", optionalEmail: false, href: () => "/admin/invitations" },
  "sync.failed": { audience: "staff", optionalEmail: false, href: () => "/admin/settings" },
} as const satisfies Record<
  string,
  { audience: "owner" | "staff"; optionalEmail: boolean; href: (d: Record<string, string>) => string }
>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export const OPTIONAL_EMAIL_TYPES = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
  (k) => NOTIFICATION_TYPES[k].optionalEmail,
);

export const isNotificationType = (t: string): t is NotificationType => t in NOTIFICATION_TYPES;
