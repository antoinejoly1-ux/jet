CREATE TABLE "holding_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"registration_number" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "member_role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "owner_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "owner_members" ALTER COLUMN "role" SET DEFAULT 'owner'::text;--> statement-breakpoint
-- primary becomes owner, viewer becomes read_only.
UPDATE "owner_members" SET "role" = CASE "role" WHEN 'primary' THEN 'owner' WHEN 'viewer' THEN 'read_only' ELSE "role" END;--> statement-breakpoint
UPDATE "invitations" SET "member_role" = CASE "member_role" WHEN 'primary' THEN 'owner' WHEN 'viewer' THEN 'read_only' ELSE "member_role" END;--> statement-breakpoint
DROP TYPE "public"."member_role";--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'assistant', 'read_only');--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "member_role" SET DATA TYPE "public"."member_role" USING "member_role"::"public"."member_role";--> statement-breakpoint
ALTER TABLE "owner_members" ALTER COLUMN "role" SET DEFAULT 'owner'::"public"."member_role";--> statement-breakpoint
ALTER TABLE "owner_members" ALTER COLUMN "role" SET DATA TYPE "public"."member_role" USING "role"::"public"."member_role";--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "can_see_finances" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_members" ADD COLUMN "can_see_finances" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Viewers could see finances before roles existed; they keep that.
UPDATE "owner_members" SET "can_see_finances" = true WHERE "role" = 'read_only';--> statement-breakpoint
UPDATE "invitations" SET "can_see_finances" = true WHERE "member_role" = 'read_only';--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "holding_company_id" uuid;--> statement-breakpoint
CREATE INDEX "holding_companies_legal_name_idx" ON "holding_companies" USING btree ("legal_name");--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_holding_company_id_holding_companies_id_fk" FOREIGN KEY ("holding_company_id") REFERENCES "public"."holding_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aircraft_holding_company_id_idx" ON "aircraft" USING btree ("holding_company_id");