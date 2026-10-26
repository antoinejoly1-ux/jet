CREATE TYPE "public"."incident_severity" AS ENUM('low', 'serious');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_kind" AS ENUM('access', 'correction', 'deletion', 'portability');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('open', 'done', 'refused');--> statement-breakpoint
CREATE TABLE "confidentiality_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_on" date NOT NULL,
	"discovered_on" date NOT NULL,
	"description" text NOT NULL,
	"data_concerned" text NOT NULL,
	"people_concerned" text NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"measures" text NOT NULL,
	"reported_to_cai_on" date,
	"people_notified_on" date,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_off" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"kind" "privacy_request_kind" NOT NULL,
	"details" text,
	"status" "privacy_request_status" DEFAULT 'open' NOT NULL,
	"response" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "conversations_owner_idx";--> statement-breakpoint
ALTER TABLE "confidentiality_incidents" ADD CONSTRAINT "confidentiality_incidents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_owner_uq" ON "conversations" USING btree ("owner_id");