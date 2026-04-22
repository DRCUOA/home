-- Floor Plan Designer primitives (UI/UX refactor, phase 2).
--
-- Promotes walls, openings (doors/windows), annotations, and user-editable
-- layers from client-side-only state (phase 1 serialized them into
-- move_stickers.label JSON) to first-class tables. Coordinates remain
-- 0..1 normalized so renders scale with image size.

CREATE TABLE IF NOT EXISTS "move_layers" (
	"id" varchar(40) NOT NULL,
	"move_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "move_layers_pk" PRIMARY KEY ("move_id", "id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_layers" ADD CONSTRAINT "move_layers_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_layers_move_idx" ON "move_layers" USING btree ("move_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "move_walls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"side" varchar(20) NOT NULL,
	"x1" real DEFAULT 0.2 NOT NULL,
	"y1" real DEFAULT 0.2 NOT NULL,
	"x2" real DEFAULT 0.8 NOT NULL,
	"y2" real DEFAULT 0.2 NOT NULL,
	"thickness" real DEFAULT 0.012 NOT NULL,
	"line_style" varchar(10) DEFAULT 'solid' NOT NULL,
	"color" varchar(20) DEFAULT '#0f172a' NOT NULL,
	"layer_id" varchar(40) DEFAULT 'walls' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"label" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_walls" ADD CONSTRAINT "move_walls_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_walls_move_idx" ON "move_walls" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_walls_side_idx" ON "move_walls" USING btree ("side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_walls_layer_idx" ON "move_walls" USING btree ("layer_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "move_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"side" varchar(20) NOT NULL,
	"wall_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"t" real DEFAULT 0.5 NOT NULL,
	"width" real DEFAULT 0.15 NOT NULL,
	"swing" varchar(10) DEFAULT 'none' NOT NULL,
	"layer_id" varchar(40) DEFAULT 'walls' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"label" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_openings" ADD CONSTRAINT "move_openings_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_openings" ADD CONSTRAINT "move_openings_wall_id_move_walls_id_fk" FOREIGN KEY ("wall_id") REFERENCES "public"."move_walls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_openings_move_idx" ON "move_openings" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_openings_side_idx" ON "move_openings" USING btree ("side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_openings_wall_idx" ON "move_openings" USING btree ("wall_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "move_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"side" varchar(20) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"x" real DEFAULT 0.4 NOT NULL,
	"y" real DEFAULT 0.4 NOT NULL,
	"width" real,
	"height" real,
	"x2" real,
	"y2" real,
	"text" text,
	"font_size_px" real DEFAULT 12 NOT NULL,
	"bold" boolean DEFAULT false NOT NULL,
	"color" varchar(20) DEFAULT '#0f172a' NOT NULL,
	"layer_id" varchar(40) DEFAULT 'annotations' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_annotations" ADD CONSTRAINT "move_annotations_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_annotations_move_idx" ON "move_annotations" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_annotations_side_idx" ON "move_annotations" USING btree ("side");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_annotations_layer_idx" ON "move_annotations" USING btree ("layer_id");
