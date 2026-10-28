CREATE TYPE "public"."company_expense_category" AS ENUM('pilot_pay', 'insurance', 'hangar', 'maintenance', 'fuel', 'fees', 'other');--> statement-breakpoint
CREATE TYPE "public"."reserve_component" AS ENUM('engine', 'propeller', 'airframe', 'avionics');--> statement-breakpoint
CREATE TYPE "public"."reserve_entry_kind" AS ENUM('flight', 'work', 'adjustment');--> statement-breakpoint
CREATE TABLE "company_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"holding_company_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"category" "company_expense_category" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text,
	"reverses_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"component" "reserve_component" NOT NULL,
	"kind" "reserve_entry_kind" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"invoice_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"component" "reserve_component" NOT NULL,
	"target_cents" bigint NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_holding_company_id_holding_companies_id_fk" FOREIGN KEY ("holding_company_id") REFERENCES "public"."holding_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_reverses_id_company_expenses_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."company_expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_ledger" ADD CONSTRAINT "reserve_ledger_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_ledger" ADD CONSTRAINT "reserve_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_ledger" ADD CONSTRAINT "reserve_ledger_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_targets" ADD CONSTRAINT "reserve_targets_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_expenses_company_date_idx" ON "company_expenses" USING btree ("holding_company_id","occurred_on");--> statement-breakpoint
CREATE INDEX "reserve_ledger_aircraft_idx" ON "reserve_ledger" USING btree ("aircraft_id","component");--> statement-breakpoint
CREATE UNIQUE INDEX "reserve_targets_aircraft_component_uq" ON "reserve_targets" USING btree ("aircraft_id","component");