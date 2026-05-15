-- Barcode-based moving workflow.
--
-- Adds:
--   * move_boxes.status — lifecycle (preparing → packed → loaded → delivered → unpacked)
--   * move_boxes.code_type — barcode symbology rendered on the label (qr | code128)
--   * move_items.barcode + move_items.code_type — optional per-item barcode
--     for high-value items tracked outside a box
--   * move_scan_events — audit log of every barcode scan; box status is
--     a denormalized roll-up of the most recent advancing scan
--
-- Defaults are chosen so existing data stays consistent:
--   * pre-existing boxes get status='preparing' (they may already be packed,
--     but we have no way to know retroactively — user can fast-forward via
--     scan-mode or a one-time bulk PATCH)
--   * code_type defaults to 'qr' for new rows; existing rows also become 'qr'

ALTER TABLE "move_boxes"
  ADD COLUMN IF NOT EXISTS "code_type" varchar(10) DEFAULT 'qr' NOT NULL;
--> statement-breakpoint
ALTER TABLE "move_boxes"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'preparing' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_boxes_status_idx" ON "move_boxes" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "move_items"
  ADD COLUMN IF NOT EXISTS "barcode" varchar(64);
--> statement-breakpoint
ALTER TABLE "move_items"
  ADD COLUMN IF NOT EXISTS "code_type" varchar(10) DEFAULT 'qr' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_barcode_idx" ON "move_items" USING btree ("barcode");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "move_scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(256) NOT NULL,
	"target_kind" varchar(10) NOT NULL,
	"target_id" uuid,
	"action" varchar(20) NOT NULL,
	"note" text,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_scan_events" ADD CONSTRAINT "move_scan_events_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "move_scan_events" ADD CONSTRAINT "move_scan_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_scan_events_move_idx" ON "move_scan_events" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_scan_events_target_idx" ON "move_scan_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_scan_events_scanned_at_idx" ON "move_scan_events" USING btree ("scanned_at");
