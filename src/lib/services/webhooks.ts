/**
 * Outgoing webhooks. Changes write events to the outbox in their own
 * transaction; a job fans each event out to the endpoints subscribed to it
 * and delivers them: signed, retried with backoff, and logged.
 *
 * Signature: header `Jet-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`
 * with the endpoint's secret. Receivers should reject timestamps older than five minutes.
 */
import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { outboxEvents, webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

/** Minutes to wait before each retry; after the last one the delivery is given up. */
export const RETRY_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440] as const;
const TIMEOUT_MS = 10_000;
const allowLocal = () => process.env.NODE_ENV !== "production" || process.env.WEBHOOKS_ALLOW_PRIVATE === "true";

export const webhookInput = z.object({
  name: z.string().trim().min(2).max(80),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => {
      const url = new URL(u);
      return url.protocol === "https:" || (allowLocal() && url.protocol === "http:");
    }, "https_required"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});
export type WebhookInput = z.input<typeof webhookInput>;

export async function createWebhook(db: Db, actor: Actor, raw: WebhookInput) {
  authorize(actor, "integrations:manage");
  const input = webhookInput.parse(raw);
  await assertPublicHost(new URL(input.url).hostname);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(webhookEndpoints)
      .values({ name: input.name, url: input.url, events: input.events, encryptedSecret: encryptSecret(secret) })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "webhook.create",
      entityType: "webhook",
      entityId: created!.id,
      after: { name: input.name, url: input.url, events: input.events },
    });
    return created!;
  });
  // Shown once, for the receiving app's configuration.
  return { id: row.id, secret };
}

export async function listWebhooks(db: Db, actor: Actor) {
  authorize(actor, "integrations:manage");
  const endpoints = await db.select().from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt));
  if (endpoints.length === 0) return [];
  const recent = await db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      type: outboxEvents.type,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      deliveredAt: webhookDeliveries.deliveredAt,
      nextAttemptAt: webhookDeliveries.nextAttemptAt,
      lastError: webhookDeliveries.lastError,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .innerJoin(outboxEvents, eq(outboxEvents.id, webhookDeliveries.eventId))
    .where(
      inArray(
        webhookDeliveries.endpointId,
        endpoints.map((e) => e.id),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(200);
  return endpoints.map(({ encryptedSecret: _secret, ...e }) => ({
    ...e,
    deliveries: recent.filter((d) => d.endpointId === e.id).slice(0, 10),
  }));
}

export async function setWebhookEnabled(db: Db, actor: Actor, id: string, enabled: boolean) {
  authorize(actor, "integrations:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(webhookEndpoints)
      .set({ disabledAt: enabled ? null : new Date() })
      .where(eq(webhookEndpoints.id, id))
      .returning({ id: webhookEndpoints.id });
    if (!row) throw new NotFoundError("webhook");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: enabled ? "webhook.enable" : "webhook.disable",
      entityType: "webhook",
      entityId: id,
    });
  });
}

/** Queues a "webhook.test" event for one endpoint and delivers it now. */
export async function sendTestEvent(db: Db, actor: Actor, id: string, fetchImpl: typeof fetch = fetch) {
  authorize(actor, "integrations:manage");
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  if (!endpoint) throw new NotFoundError("webhook");
  if (endpoint.disabledAt) throw new ConflictError("webhook_disabled");
  const [event] = await db
    .insert(outboxEvents)
    .values({ type: "webhook.test", payload: { message: "Test from the owner portal" }, processedAt: new Date() })
    .returning();
  const [delivery] = await db.insert(webhookDeliveries).values({ endpointId: id, eventId: event!.id }).returning();
  await deliver(db, delivery!.id, new Date(), fetchImpl);
  const [after] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, delivery!.id));
  return { ok: !!after?.deliveredAt, status: after?.responseStatus ?? null, error: after?.lastError ?? null };
}

/* ---------- The job ---------- */

/** Fans new events out to subscribers, then delivers what's due. Safe to run concurrently with itself. */
export async function processWebhooks(db: Db, now = new Date(), fetchImpl: typeof fetch = fetch) {
  // 1. Fan out. Locked rows are skipped, so two runs never fan out the same event twice.
  const fannedOut = await db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.processedAt))
      .orderBy(outboxEvents.createdAt)
      .limit(200)
      .for("update", { skipLocked: true });
    if (events.length === 0) return 0;
    const endpoints = await tx.select().from(webhookEndpoints).where(isNull(webhookEndpoints.disabledAt));
    const rows = events.flatMap((e) =>
      endpoints.filter((ep) => ep.events.includes(e.type)).map((ep) => ({ endpointId: ep.id, eventId: e.id })),
    );
    if (rows.length) await tx.insert(webhookDeliveries).values(rows.map((r) => ({ ...r, nextAttemptAt: now })));
    await tx
      .update(outboxEvents)
      .set({ processedAt: now })
      .where(
        inArray(
          outboxEvents.id,
          events.map((e) => e.id),
        ),
      );
    return rows.length;
  });

  // 2. Deliver what's due.
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(
      and(
        isNull(webhookDeliveries.deliveredAt),
        lte(webhookDeliveries.nextAttemptAt, now),
        isNull(webhookEndpoints.disabledAt),
      ),
    )
    .orderBy(webhookDeliveries.nextAttemptAt)
    .limit(100);
  let delivered = 0;
  let failed = 0;
  for (const d of due) {
    if (await deliver(db, d.id, now, fetchImpl)) delivered++;
    else failed++;
  }
  return { fannedOut, delivered, failed };
}

export function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function deliver(db: Db, deliveryId: string, now: Date, fetchImpl: typeof fetch): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Claim the row; another run holding it skips it.
    const [row] = await tx
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints, event: outboxEvents })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .innerJoin(outboxEvents, eq(outboxEvents.id, webhookDeliveries.eventId))
      .where(and(eq(webhookDeliveries.id, deliveryId), isNull(webhookDeliveries.deliveredAt)))
      .for("update", { of: webhookDeliveries, skipLocked: true });
    if (!row) return false;
    const { delivery, endpoint, event } = row;

    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt.toISOString(),
      data: event.payload,
    });
    const timestamp = Math.floor(now.getTime() / 1000);
    let status: number | null = null;
    let error: string | null = null;
    try {
      await assertPublicHost(new URL(endpoint.url).hostname);
      const response = await fetchImpl(endpoint.url, {
        method: "POST",
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Jet-Webhooks/1",
          "Jet-Event": event.type,
          "Jet-Delivery": delivery.id,
          "Jet-Signature": `t=${timestamp},v1=${sign(decryptSecret(endpoint.encryptedSecret), timestamp, body)}`,
        },
      });
      status = response.status;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : "delivery failed";
    }

    const attempts = delivery.attempts + 1;
    const wait = RETRY_MINUTES[attempts - 1];
    await tx
      .update(webhookDeliveries)
      .set(
        error
          ? {
              attempts,
              responseStatus: status,
              lastError: error,
              // After the last retry the delivery is given up (no next attempt).
              nextAttemptAt: wait ? new Date(now.getTime() + wait * 60_000) : null,
            }
          : { attempts, responseStatus: status, lastError: null, deliveredAt: now, nextAttemptAt: null },
      )
      .where(eq(webhookDeliveries.id, delivery.id));
    return !error;
  });
}

/* ---------- No requests to private networks ---------- */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Refuses hosts that resolve to private, loopback or link-local addresses (cloud metadata, internal services). */
async function assertPublicHost(hostname: string) {
  if (allowLocal()) return;
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new ConflictError("webhook_private_address");
}
