/** Events other apps can subscribe to. Each is written to the outbox in the same transaction as the change. */
export const WEBHOOK_EVENTS = [
  "invoice.issued",
  "invoice.paid",
  "invoice.voided",
  "transaction.created",
  "budget.published",
  "flight.scheduled",
  "flight.completed",
  "flight.cancelled",
  "maintenance.planned",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
