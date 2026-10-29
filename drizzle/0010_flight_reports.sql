CREATE TYPE "public"."expense_category" AS ENUM('fuel', 'handling', 'airport_fees', 'hotel', 'per_diem', 'catering', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_payer" AS ENUM('pilot', 'company_card');--> statement-breakpoint
CREATE TYPE "public"."flight_report_status" AS ENUM('submitted', 'returned', 'approved');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'pilot';--> statement-breakpoint
CREATE TABLE "aircraft_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"fuel_cents_per_hour" bigint NOT NULL,
	"engine_reserve_cents_per_hour" bigint NOT NULL,
	"propeller_reserve_cents_per_hour" bigint NOT NULL,
	"airframe_reserve_cents_per_hour" bigint NOT NULL,
	"avionics_reserve_cents_per_hour" bigint NOT NULL,
	"pilot_cents_per_hour" bigint NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_report_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"paid_by" "expense_payer" DEFAULT 'company_card' NOT NULL,
	"receipt_file_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_report_expenses_positive" CHECK ("flight_report_expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "flight_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flight_id" uuid NOT NULL,
	"pilot_user_id" uuid,
	"flight_minutes" integer NOT NULL,
	"fuel_litres" integer,
	"notes" text,
	"status" "flight_report_status" DEFAULT 'submitted' NOT NULL,
	"share_id" uuid,
	"review_note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_reports_minutes_range" CHECK ("flight_reports"."flight_minutes" > 0 AND "flight_reports"."flight_minutes" <= 1440)
);
--> statement-breakpoint
ALTER TABLE "aircraft_rates" ADD CONSTRAINT "aircraft_rates_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aircraft_rates" ADD CONSTRAINT "aircraft_rates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_report_expenses" ADD CONSTRAINT "flight_report_expenses_report_id_flight_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."flight_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_report_expenses" ADD CONSTRAINT "flight_report_expenses_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD CONSTRAINT "flight_reports_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD CONSTRAINT "flight_reports_pilot_user_id_users_id_fk" FOREIGN KEY ("pilot_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD CONSTRAINT "flight_reports_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_reports" ADD CONSTRAINT "flight_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aircraft_rates_aircraft_from_uq" ON "aircraft_rates" USING btree ("aircraft_id","effective_from");--> statement-breakpoint
CREATE INDEX "flight_report_expenses_report_idx" ON "flight_report_expenses" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_reports_flight_uq" ON "flight_reports" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX "flight_reports_status_idx" ON "flight_reports" USING btree ("status");