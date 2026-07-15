CREATE TABLE IF NOT EXISTS "property_custom_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_custom_type_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"custom_type_id" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "property_custom_types" ADD CONSTRAINT "property_custom_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "property_custom_type_links" ADD CONSTRAINT "property_custom_type_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "property_custom_type_links" ADD CONSTRAINT "property_custom_type_links_custom_type_id_property_custom_types_id_fk" FOREIGN KEY ("custom_type_id") REFERENCES "public"."property_custom_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_custom_types_user_idx" ON "property_custom_types" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_custom_type_links_property_idx" ON "property_custom_type_links" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_custom_type_links_type_idx" ON "property_custom_type_links" USING btree ("custom_type_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_custom_type_links_unique_idx" ON "property_custom_type_links" USING btree ("property_id","custom_type_id");
