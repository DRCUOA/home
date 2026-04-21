CREATE TABLE IF NOT EXISTS "moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"origin_property_id" uuid,
	"destination_property_id" uuid,
	"origin_floor_plan_file_id" uuid,
	"destination_floor_plan_file_id" uuid,
	"move_date" varchar(20),
	"status" varchar(30) DEFAULT 'planning' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "move_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"side" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(20) DEFAULT '#8b5cf6' NOT NULL,
	"polygon" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "move_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"barcode" varchar(64) NOT NULL,
	"label" varchar(200) NOT NULL,
	"destination_room_id" uuid,
	"fragile" boolean DEFAULT false NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "move_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"origin_room_id" uuid,
	"destination_room_id" uuid,
	"box_id" uuid,
	"status" varchar(30) DEFAULT 'unpacked' NOT NULL,
	"category" varchar(50),
	"value_estimate" real,
	"fragile" boolean DEFAULT false NOT NULL,
	"photo_file_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_origin_property_id_properties_id_fk" FOREIGN KEY ("origin_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_destination_property_id_properties_id_fk" FOREIGN KEY ("destination_property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_origin_floor_plan_file_id_files_id_fk" FOREIGN KEY ("origin_floor_plan_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "moves" ADD CONSTRAINT "moves_destination_floor_plan_file_id_files_id_fk" FOREIGN KEY ("destination_floor_plan_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_rooms" ADD CONSTRAINT "move_rooms_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_boxes" ADD CONSTRAINT "move_boxes_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_boxes" ADD CONSTRAINT "move_boxes_destination_room_id_move_rooms_id_fk" FOREIGN KEY ("destination_room_id") REFERENCES "public"."move_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_items" ADD CONSTRAINT "move_items_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_items" ADD CONSTRAINT "move_items_origin_room_id_move_rooms_id_fk" FOREIGN KEY ("origin_room_id") REFERENCES "public"."move_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_items" ADD CONSTRAINT "move_items_destination_room_id_move_rooms_id_fk" FOREIGN KEY ("destination_room_id") REFERENCES "public"."move_rooms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_items" ADD CONSTRAINT "move_items_box_id_move_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."move_boxes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_items" ADD CONSTRAINT "move_items_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moves_user_idx" ON "moves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moves_project_idx" ON "moves" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_rooms_move_idx" ON "move_rooms" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_rooms_side_idx" ON "move_rooms" USING btree ("side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_boxes_move_idx" ON "move_boxes" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_boxes_barcode_idx" ON "move_boxes" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_move_idx" ON "move_items" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_origin_room_idx" ON "move_items" USING btree ("origin_room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_destination_room_idx" ON "move_items" USING btree ("destination_room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_box_idx" ON "move_items" USING btree ("box_id");
