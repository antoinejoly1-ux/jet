CREATE TABLE "aircraft_positions" (
	"aircraft_id" uuid PRIMARY KEY NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"altitude_ft" integer,
	"ground_speed_kt" integer,
	"heading_deg" integer,
	"on_ground" boolean,
	"callsign" text,
	"origin" text,
	"destination" text,
	"eta" timestamp with time zone,
	"source" text,
	"seen_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aircraft_positions" ADD CONSTRAINT "aircraft_positions_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;