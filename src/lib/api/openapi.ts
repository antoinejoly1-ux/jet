/**
 * The OpenAPI 3.1 description of /api/v1, built from the same Zod schemas the
 * routes validate with, so the document can't drift from the code.
 */
import { z } from "zod";
import { API_SCOPES } from "@/lib/auth/policy";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { apiCancelBody, apiCompleteBody, apiFlightBody, apiTransactionBody } from "./schemas";

const json = (schema: z.ZodType) => ({ "application/json": { schema: z.toJSONSchema(schema, { io: "input" }) } });
const ok = (description: string) => ({
  description,
  content: { "application/json": { schema: { type: "object", properties: { data: {} } } } },
});
const errors = {
  "400": { $ref: "#/components/responses/Invalid" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "429": { $ref: "#/components/responses/RateLimited" },
};
const scope = (s: (typeof API_SCOPES)[number]) => ({ "x-required-scope": s, security: [{ apiKey: [] }] });
const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }];
const q = (name: string, schema: object, description?: string) => ({ name, in: "query", schema, description });

export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Univair Management API",
      version: "1.0.0",
      description:
        "Read and write the portal's fleet, flights and ledger. Authenticate with an API key created by an admin " +
        "(Admin → Settings → Developers): `Authorization: Bearer jet_…`. Each key has scopes. Money is integer " +
        "cents with a currency; durations are minutes; times are ISO 8601 (UTC in responses). Responses are " +
        '`{ "data": … }`; errors are `{ "error": { "code", "message", "fields"? } }`. ' +
        `Limit: 120 requests per minute per key. Outgoing webhook events: ${WEBHOOK_EVENTS.join(", ")}.`,
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: `Scopes: ${API_SCOPES.join(", ")}` } },
      responses: {
        Invalid: { description: "Invalid input; `fields` says which" },
        Unauthorized: { description: "Missing or invalid API key" },
        Forbidden: { description: "The key's scopes don't allow this" },
        NotFound: { description: "No such record" },
        Conflict: { description: "Not possible in the record's current state (the code says why)" },
        RateLimited: { description: "More than 120 requests in a minute" },
      },
    },
    paths: {
      "/owners": {
        get: {
          summary: "List owners",
          ...scope("owners:read"),
          parameters: [q("q", { type: "string" }, "Search")],
          responses: { "200": ok("Owners"), ...errors },
        },
      },
      "/aircraft": {
        get: { summary: "List aircraft", ...scope("fleet:read"), responses: { "200": ok("Aircraft"), ...errors } },
      },
      "/shares": {
        get: { summary: "List active shares", ...scope("fleet:read"), responses: { "200": ok("Shares"), ...errors } },
      },
      "/flights": {
        get: {
          summary: "List flights departing in a window",
          ...scope("fleet:read"),
          parameters: [
            q("from", { type: "string", format: "date-time" }, "Default: 30 days ago"),
            q("to", { type: "string", format: "date-time" }, "Default: 90 days ahead"),
            q("aircraftId", { type: "string", format: "uuid" }),
            q("status", { enum: ["scheduled", "completed", "cancelled"] }),
          ],
          responses: { "200": ok("Flights"), ...errors },
        },
        post: {
          summary: "Schedule a flight",
          ...scope("operations:write"),
          requestBody: { required: true, content: json(apiFlightBody) },
          responses: {
            "200": ok("The new flight"),
            ...errors,
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { $ref: "#/components/responses/Conflict" },
          },
        },
      },
      "/flights/{id}/complete": {
        post: {
          summary: "Complete a flight (deducts its flight time from the share's hours)",
          ...scope("operations:write"),
          parameters: idParam,
          requestBody: { required: true, content: json(apiCompleteBody) },
          responses: {
            "200": ok("The completed flight"),
            ...errors,
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { $ref: "#/components/responses/Conflict" },
          },
        },
      },
      "/flights/{id}/cancel": {
        post: {
          summary: "Cancel a flight (gives a completed flight's hours back)",
          ...scope("operations:write"),
          parameters: idParam,
          requestBody: { content: json(apiCancelBody) },
          responses: {
            "200": ok("The cancelled flight"),
            ...errors,
            "404": { $ref: "#/components/responses/NotFound" },
            "409": { $ref: "#/components/responses/Conflict" },
          },
        },
      },
      "/invoices": {
        get: {
          summary: "List invoices",
          ...scope("finance:read"),
          parameters: [
            q("status", { enum: ["issued", "paid", "void"] }),
            q("year", { type: "integer" }),
            q("q", { type: "string" }),
          ],
          responses: { "200": ok("Invoices"), ...errors },
        },
      },
      "/transactions": {
        get: {
          summary: "List ledger entries",
          ...scope("finance:read"),
          parameters: [
            q("year", { type: "integer" }),
            q("shareId", { type: "string", format: "uuid" }),
            q("kind", { enum: ["cost", "revenue", "payment"] }),
          ],
          responses: { "200": ok("Entries"), ...errors },
        },
        post: {
          summary: "Add a ledger entry",
          ...scope("finance:write"),
          requestBody: { required: true, content: json(apiTransactionBody) },
          responses: { "200": ok("The new entry"), ...errors, "404": { $ref: "#/components/responses/NotFound" } },
        },
      },
    },
  };
}
