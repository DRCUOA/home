-- Moving workflow layer over the existing moving subsystem.
--
-- Adds:
--   * move_items.disposition — workflow decision (keep | sell | donate |
--     recycle | dump | stage_only | repair_clean_first | unassessed)
--   * move_rooms.room_type — workflow role (normal_room | holding_zone |
--     staging_area | vehicle_zone | storage_zone)
--
-- Normalizes:
--   * move_items.status default flips from 'unpacked' (legacy: "not yet
--     packed") to 'surveyed' (initial state in the new vocabulary)
--   * Existing rows with the legacy 'unpacked' value are remapped to
--     'surveyed' (default-state semantics carried forward)
--   * Existing rows with 'unpacked_at_destination' collapse to the new
--     terminal 'unpacked' value
--
-- Preserves:
--   * Origin / destination room behaviour — room_type defaults to
--     `normal_room` for every existing row, so floor-plan rendering is
--     unchanged.
--   * The existing scan-action vocabulary — new actions (stage,
--     deliver_to_room, install, remove, mark_missing, mark_damaged) are
--     additive; no DDL needed for move_scan_events.action since it's
--     a free-form varchar.
--
-- Indexes on disposition + status help the Survey, Declutter, Pack,
-- Load, Unpack, and Exceptions tabs filter quickly.

ALTER TABLE "move_rooms"
  ADD COLUMN IF NOT EXISTS "room_type" varchar(30) DEFAULT 'normal_room' NOT NULL;
--> statement-breakpoint

ALTER TABLE "move_items"
  ADD COLUMN IF NOT EXISTS "disposition" varchar(30) DEFAULT 'unassessed' NOT NULL;
--> statement-breakpoint

-- Remap legacy status values to the new vocabulary. Done before
-- changing the column default so the rewrite stays consistent.
UPDATE "move_items" SET "status" = 'unpacked' WHERE "status" = 'unpacked_at_destination';
--> statement-breakpoint
UPDATE "move_items" SET "status" = 'surveyed' WHERE "status" = 'unpacked';
--> statement-breakpoint

ALTER TABLE "move_items" ALTER COLUMN "status" SET DEFAULT 'surveyed';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "move_items_disposition_idx" ON "move_items" USING btree ("disposition");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_items_status_idx" ON "move_items" USING btree ("status");
