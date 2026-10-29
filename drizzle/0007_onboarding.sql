ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
-- Everyone who already uses the portal has, in effect, been welcomed.
UPDATE "users" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;