CREATE TABLE IF NOT EXISTS "move_stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"side" varchar(20) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"x" real DEFAULT 0.4 NOT NULL,
	"y" real DEFAULT 0.4 NOT NULL,
	"width" real DEFAULT 0.2 NOT NULL,
	"height" real DEFAULT 0.1 NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"color" varchar(20),
	"label" varchar(120),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_stickers" ADD CONSTRAINT "move_stickers_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_stickers_move_idx" ON "move_stickers" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_stickers_side_idx" ON "move_stickers" USING btree ("side");
