CREATE TABLE IF NOT EXISTS "map_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"color" varchar(20) DEFAULT '#8b5cf6' NOT NULL,
	"icon" varchar(30) DEFAULT 'pin' NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "map_pins" ADD CONSTRAINT "map_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_pins_user_idx" ON "map_pins" USING btree ("user_id");