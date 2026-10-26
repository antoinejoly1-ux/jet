import {
  bigint,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./_shared";
import { user } from "./auth";
import { owners } from "./owners";

export const importStatus = pgEnum("import_status", ["uploaded", "validated", "committed", "failed", "cancelled"]);
export const integrationStatus = pgEnum("integration_status", ["connected", "error", "disconnected"]);
export const syncDirection = pgEnum("sync_direction", ["pull", "push"]);

/** Every stored file. Keys never contain names or emails. */
export const files = pgTable(
  "files",
  {
    id: id(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    originalName: text("original_name"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("files_sha256_idx").on(t.sha256)],
);

export const imports = pgTable("imports", {
  id: id(),
  kind: text("kind").notNull(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "restrict" }),
  status: importStatus("status").notNull().default("uploaded"),
  columnMapping: jsonb("column_mapping"),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsRejected: integer("rows_rejected").notNull().default(0),
  errorReport: jsonb("error_report"),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps(),
  },
  // One running thread per owner with dispatch; resolving it doesn't close it for good.
  (t) => [uniqueIndex("conversations_owner_uq").on(t.ownerId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    attachmentFileId: uuid("attachment_file_id").references(() => files.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

/** Emails a person has turned off, by notification type. Security emails can't be turned off. */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  emailOff: text("email_off").array().notNull().default([]),
  ...timestamps(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const integrations = pgTable("integrations", {
  id: id(),
  provider: text("provider").notNull().unique(),
  status: integrationStatus("status").notNull().default("disconnected"),
  /** AES-256-GCM ciphertext; never sent to the browser. */
  encryptedCredentials: text("encrypted_credentials"),
  settings: jsonb("settings").notNull().default({}),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps(),
});

/** Maps a local record to its id in an outside system. */
export const externalRefs = pgTable(
  "external_refs",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    localId: uuid("local_id").notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    lastSyncedHash: text("last_synced_hash"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("external_refs_local_uq").on(t.entityType, t.localId, t.provider),
    uniqueIndex("external_refs_external_uq").on(t.entityType, t.provider, t.externalId),
  ],
);

export const syncRuns = pgTable("sync_runs", {
  id: id(),
  provider: text("provider").notNull(),
  direction: syncDirection("direction").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  counts: jsonb("counts").notNull().default({}),
  errors: jsonb("errors").notNull().default([]),
});

/** Events written in the same transaction as the change, delivered by a job. */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_unprocessed_idx").on(t.processedAt, t.createdAt)],
);

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: id(),
  url: text("url").notNull(),
  events: text("events").array().notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId)],
);

export const apiKeys = pgTable("api_keys", {
  id: id(),
  name: text("name").notNull(),
  /** First characters of the key, shown in the UI to tell keys apart. */
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Append-only record of who did what. Never updated or deleted by the app. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);

export const incidentSeverity = pgEnum("incident_severity", ["low", "serious"]);

/**
 * Law 25 register of confidentiality incidents. Every incident is recorded;
 * serious ones are reported to the Commission d'accès à l'information and to
 * the people concerned, and the dates say when.
 */
export const confidentialityIncidents = pgTable("confidentiality_incidents", {
  id: id(),
  occurredOn: date("occurred_on").notNull(),
  discoveredOn: date("discovered_on").notNull(),
  description: text("description").notNull(),
  dataConcerned: text("data_concerned").notNull(),
  peopleConcerned: text("people_concerned").notNull(),
  severity: incidentSeverity("severity").notNull(),
  measures: text("measures").notNull(),
  reportedToCaiOn: date("reported_to_cai_on"),
  peopleNotifiedOn: date("people_notified_on"),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps(),
});

export const privacyRequestKind = pgEnum("privacy_request_kind", ["access", "correction", "deletion", "portability"]);
export const privacyRequestStatus = pgEnum("privacy_request_status", ["open", "done", "refused"]);

/** Law 25 requests from a person about their own information; answered within 30 days. */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: id(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    kind: privacyRequestKind("kind").notNull(),
    details: text("details"),
    status: privacyRequestStatus("status").notNull().default("open"),
    response: text("response"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("privacy_requests_status_idx").on(t.status, t.createdAt)],
);
