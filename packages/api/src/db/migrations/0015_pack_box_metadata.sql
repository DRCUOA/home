-- Pack-box flow metadata.
--
-- Adds three nullable columns to move_boxes so the fast multi-item
-- scanning view can stamp each box with where it was packed, who
-- packed it, and when. All columns are nullable so existing boxes
-- (and boxes created via the legacy single-item flow) survive
-- unchanged.
--
--   * source_room_id — fk to move_rooms; set once per pack session
--     and inherited by every item scanned into the box
--   * packed_on      — YYYY-MM-DD string (matches moves.move_date)
--   * packed_by      — freeform name; defaults to the signed-in user
--                      on the client but stays editable so a crew
--                      member can be credited even if they're not
--                      authenticated

ALTER TABLE "move_boxes"
  ADD COLUMN IF NOT EXISTS "source_room_id" uuid;
--> statement-breakpoint
ALTER TABLE "move_boxes"
  ADD COLUMN IF NOT EXISTS "packed_on" varchar(20);
--> statement-breakpoint
ALTER TABLE "move_boxes"
  ADD COLUMN IF NOT EXISTS "packed_by" varchar(200);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "move_boxes"
    ADD CONSTRAINT "move_boxes_source_room_id_move_rooms_id_fk"
    FOREIGN KEY ("source_room_id")
    REFERENCES "public"."move_rooms"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
