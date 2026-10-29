ALTER TYPE "public"."invoice_line_kind" ADD VALUE 'included';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_on" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zero_rated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_report_expenses" ADD COLUMN "amount_cad_cents" bigint;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD COLUMN "usd_cad_rate" numeric(10, 6);--> statement-breakpoint
UPDATE "flight_report_expenses" e SET "amount_cad_cents" = e."amount_cents" FROM "flight_reports" r WHERE r."id" = e."report_id" AND r."status" = 'approved' AND e."currency" = 'CAD';--> statement-breakpoint
UPDATE "invoices" SET "voided_on" = ("updated_at" AT TIME ZONE 'America/Montreal')::date WHERE "status" = 'void';
