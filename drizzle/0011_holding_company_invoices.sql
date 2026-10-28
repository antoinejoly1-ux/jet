CREATE TYPE "public"."invoice_line_kind" AS ENUM('hours', 'expense');--> statement-breakpoint
CREATE TABLE "holding_company_managers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"holding_company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" "invoice_line_kind" NOT NULL,
	"part" text NOT NULL,
	"description" text,
	"minutes" integer,
	"unit_cents" bigint,
	"amount_cents" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "gst_number" text;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "qst_number" text;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "invoice_prefix" text;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "invoice_seq_year" integer;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "invoice_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_companies" ADD COLUMN "payment_instructions" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "holding_company_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subtotal_cents" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "gst_cents" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "qst_cents" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issuer" jsonb;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "holding_company_managers" ADD CONSTRAINT "holding_company_managers_holding_company_id_holding_companies_id_fk" FOREIGN KEY ("holding_company_id") REFERENCES "public"."holding_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_company_managers" ADD CONSTRAINT "holding_company_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holding_company_managers_uq" ON "holding_company_managers" USING btree ("holding_company_id","user_id");--> statement-breakpoint
CREATE INDEX "holding_company_managers_user_idx" ON "holding_company_managers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_holding_company_id_holding_companies_id_fk" FOREIGN KEY ("holding_company_id") REFERENCES "public"."holding_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD CONSTRAINT "flight_reports_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;