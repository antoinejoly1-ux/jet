import "server-only";
import type { DbOrTx } from "@/lib/db";
import { outboxEvents } from "@/lib/db/schema";
import type { WebhookEvent } from "@/lib/webhook-events";

/**
 * Queues an event for webhook subscribers. Call it with the transaction that
 * makes the change, so the event exists if and only if the change committed.
 */
export async function emit(tx: DbOrTx, type: WebhookEvent, payload: Record<string, unknown>) {
  await tx.insert(outboxEvents).values({ type, payload });
}
