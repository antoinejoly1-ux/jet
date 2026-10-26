import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { auditLog, hourLedger, user } from "@/lib/db/schema";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { API_RATE_PER_MINUTE, authenticateApiKey, createApiKey, revokeApiKey } from "@/lib/services/api-keys";
import { addHours } from "@/lib/services/ledger";
import { createOwner } from "@/lib/services/owners";
import {
  createWebhook,
  isPrivateAddress,
  listWebhooks,
  processWebhooks,
  RETRY_MINUTES,
  sendTestEvent,
  setWebhookEnabled,
} from "@/lib/services/webhooks";
import * as aircraftRoute from "@/app/api/v1/aircraft/route";
import * as completeRoute from "@/app/api/v1/flights/[id]/complete/route";
import * as flightsRoute from "@/app/api/v1/flights/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import * as transactionsRoute from "@/app/api/v1/transactions/route";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let planeId: string;
let shareId: string;

const call = async (
  route: { GET?: unknown; POST?: unknown },
  method: "GET" | "POST",
  path: string,
  key: string | null,
  body?: unknown,
  params: Record<string, string> = {},
) => {
  const handler = route[method] as (
    r: NextRequest,
    c: { params: Promise<Record<string, string>> },
  ) => Promise<Response>;
  const res = await handler(
    new NextRequest(`http://localhost/api/v1${path}`, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
  return { status: res.status, json: (await res.json()) as { data?: unknown; error?: { code: string } } };
};

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const [a] = await db
    .insert(user)
    .values({ name: "admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" })
    .returning();
  admin = { id: a!.id, staffRole: "admin", ownerIds: [] };
  const [d] = await db
    .insert(user)
    .values({ name: "dispatch", email: "dispatch@jet.test", emailVerified: true, staffRole: "dispatcher" })
    .returning();
  dispatcher = { id: d!.id, staffRole: "dispatcher", ownerIds: [] };
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" })).id;
  const o = await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" });
  shareId = (await addShare(db, admin, planeId, { ownerId: o.id, percent: 50, startsOn: "2025-01-01" })).id;
  await addHours(db, admin, shareId, { kind: "purchase", hours: "10" });
});

describe("API keys", () => {
  it("are shown once, stored hashed, scoped, rate limited and revocable", async () => {
    const { id, key } = await createApiKey(db, admin, { name: "Comptabilité", scopes: ["finance:read"] });
    expect(key).toMatch(/^jet_[a-f0-9]{8}_[\w-]{32}$/);
    const rows = await db.select().from(auditLog);
    expect(JSON.stringify(rows)).not.toContain(key);

    const auth = await authenticateApiKey(db, `Bearer ${key}`);
    expect(auth).toMatchObject({ ok: true, actor: { apiScopes: ["finance:read"], staffRole: null } });
    expect(await authenticateApiKey(db, "Bearer jet_00000000_wrongwrongwrongwrongwrong")).toMatchObject({
      code: "invalid_key",
    });
    expect(await authenticateApiKey(db, null)).toMatchObject({ code: "missing_key" });

    const now = Date.parse("2026-10-26T12:00:30Z");
    for (let i = 0; i < API_RATE_PER_MINUTE; i++) await authenticateApiKey(db, `Bearer ${key}`, now);
    expect(await authenticateApiKey(db, `Bearer ${key}`, now)).toMatchObject({ status: 429 });
    expect(await authenticateApiKey(db, `Bearer ${key}`, now + 60_000)).toMatchObject({ ok: true });

    await revokeApiKey(db, admin, id);
    expect(await authenticateApiKey(db, `Bearer ${key}`)).toMatchObject({ code: "invalid_key" });
    await expect(createApiKey(db, dispatcher, { name: "x", scopes: ["fleet:read"] })).rejects.toThrow();
  });
});

describe("/api/v1", () => {
  it("answers with data, refuses missing keys and missing scopes", async () => {
    const { key: readFleet } = await createApiKey(db, admin, { name: "Flotte", scopes: ["fleet:read"] });
    expect((await call(aircraftRoute, "GET", "/aircraft", null)).status).toBe(401);
    const ok = await call(aircraftRoute, "GET", "/aircraft", readFleet);
    expect(ok.status).toBe(200);
    expect(ok.json.data).toEqual([expect.objectContaining({ registration: "C-GJTA" })]);
    const denied = await call(transactionsRoute, "GET", "/transactions", readFleet);
    expect(denied).toMatchObject({ status: 403, json: { error: { code: "forbidden" } } });
  });

  it("schedules and completes a flight in UTC, deducting hours like the screens do", async () => {
    const { key } = await createApiKey(db, admin, {
      name: "Planification",
      scopes: ["operations:write", "fleet:read"],
    });
    const bad = await call(flightsRoute, "POST", "/flights", key, { aircraftId: planeId, fromAirport: "CYUL" });
    expect(bad).toMatchObject({ status: 400, json: { error: { code: "invalid" } } });

    const created = await call(flightsRoute, "POST", "/flights", key, {
      aircraftId: planeId,
      shareId,
      fromAirport: "CYUL",
      toAirport: "KPBI",
      departsAt: "2026-10-10T12:30:00Z",
    });
    expect(created.status).toBe(200);
    const flight = created.json.data as { id: string; departsAt: string };
    expect(flight.departsAt).toBe("2026-10-10T12:30:00.000Z");

    const done = await call(
      completeRoute,
      "POST",
      `/flights/${flight.id}/complete`,
      key,
      { blockMinutes: 95 },
      { id: flight.id },
    );
    expect(done).toMatchObject({ status: 200, json: { data: { status: "completed", blockMinutes: 95 } } });
    const again = await call(
      completeRoute,
      "POST",
      `/flights/${flight.id}/complete`,
      key,
      { blockMinutes: 95 },
      { id: flight.id },
    );
    expect(again).toMatchObject({ status: 409, json: { error: { code: "flight_not_scheduled" } } });
    const ledger = await db.select().from(hourLedger);
    expect(ledger.reduce((n, e) => n + e.minutes, 0)).toBe(600 - 95);
  });

  it("adds ledger entries from integer cents", async () => {
    const { key } = await createApiKey(db, admin, { name: "Compta", scopes: ["finance:read", "finance:write"] });
    const res = await call(transactionsRoute, "POST", "/transactions", key, {
      shareId,
      occurredOn: "2026-10-01",
      kind: "cost",
      amountCents: 123456,
      currency: "CAD",
    });
    expect(res).toMatchObject({ status: 200, json: { data: { amountCents: 123456, source: "import" } } });
  });

  it("publishes an OpenAPI document built from the same schemas", async () => {
    const doc = (await openapiRoute.GET().json()) as {
      openapi: string;
      paths: Record<
        string,
        Record<string, { requestBody?: { content: Record<string, { schema: { required?: string[] } }> } }>
      >;
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/flights"]!.post!.requestBody!.content["application/json"]!.schema.required).toEqual(
      expect.arrayContaining(["aircraftId", "fromAirport", "toAirport", "departsAt"]),
    );
  });
});

describe("webhooks", () => {
  type Sent = { url: string; headers: Record<string, string>; body: string };
  const receiver = (statuses: number[]) => {
    const sent: Sent[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
      return new Response(null, { status: statuses.shift() ?? 200 });
    }) as unknown as typeof fetch;
    return { sent, impl };
  };

  it("delivers subscribed events, signed, and retries failures with backoff", async () => {
    const { secret } = await createWebhook(db, admin, {
      name: "Compta",
      url: "http://localhost:9999/hook",
      events: ["flight.completed"],
    });
    const { key } = await createApiKey(db, admin, { name: "Planif", scopes: ["operations:write"] });
    const created = await call(flightsRoute, "POST", "/flights", key, {
      aircraftId: planeId,
      shareId,
      fromAirport: "CYUL",
      toAirport: "KTEB",
      departsAt: "2026-10-11T12:00:00Z",
    });
    const id = (created.json.data as { id: string }).id;
    await call(completeRoute, "POST", "", key, { blockMinutes: 60 }, { id });

    const { sent, impl } = receiver([500, 200]);
    const now = new Date();
    expect(await processWebhooks(db, now, impl)).toEqual({ fannedOut: 1, delivered: 0, failed: 1 });
    // flight.scheduled was not subscribed to, so only one delivery exists.
    expect(sent).toHaveLength(1);
    const { body, headers } = sent[0]!;
    expect(JSON.parse(body)).toMatchObject({ type: "flight.completed", data: { flightId: id, blockMinutes: 60 } });
    const [, ts, sig] = headers["Jet-Signature"]!.match(/^t=(\d+),v1=([a-f0-9]{64})$/)!;
    expect(sig).toBe(createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"));

    // Not due yet; then due after the first backoff.
    expect(await processWebhooks(db, now, impl)).toMatchObject({ delivered: 0, failed: 0 });
    const later = new Date(now.getTime() + RETRY_MINUTES[0] * 60_000);
    expect(await processWebhooks(db, later, impl)).toMatchObject({ delivered: 1, failed: 0 });
    const [endpoint] = await listWebhooks(db, admin);
    expect(endpoint!.deliveries[0]).toMatchObject({ attempts: 2, responseStatus: 200 });
    expect(JSON.stringify(endpoint)).not.toContain(secret);
  });

  it("sends a test event, skips disabled endpoints, and refuses private addresses", async () => {
    const { id } = await createWebhook(db, admin, {
      name: "Test",
      url: "http://localhost:9999/x",
      events: ["invoice.issued"],
    });
    const { sent, impl } = receiver([204]);
    expect(await sendTestEvent(db, admin, id, impl)).toEqual({ ok: true, status: 204, error: null });
    expect(JSON.parse(sent[0]!.body).type).toBe("webhook.test");
    await setWebhookEnabled(db, admin, id, false);
    await expect(sendTestEvent(db, admin, id, impl)).rejects.toMatchObject({ code: "webhook_disabled" });

    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "192.168.0.10",
      "172.20.0.1",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "35.182.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
