ALTER TABLE "webhook_deliveries" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("next_attempt_at");