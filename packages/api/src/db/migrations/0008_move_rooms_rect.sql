-- Rooms-as-stickers: give move_rooms the same rectangle geometry the
-- sticker table has, so the editor can move/resize/rotate rooms with
-- the exact same UX. The existing polygon column is kept around so
-- legacy rows keep rendering; new rooms will rely on the rect fields.

ALTER TABLE "move_rooms" ADD COLUMN IF NOT EXISTS "x" real DEFAULT 0.3 NOT NULL;--> statement-breakpoint
ALTER TABLE "move_rooms" ADD COLUMN IF NOT EXISTS "y" real DEFAULT 0.3 NOT NULL;--> statement-breakpoint
ALTER TABLE "move_rooms" ADD COLUMN IF NOT EXISTS "width" real DEFAULT 0.4 NOT NULL;--> statement-breakpoint
ALTER TABLE "move_rooms" ADD COLUMN IF NOT EXISTS "height" real DEFAULT 0.3 NOT NULL;--> statement-breakpoint
ALTER TABLE "move_rooms" ADD COLUMN IF NOT EXISTS "rotation" real DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Backfill: derive an axis-aligned bounding box from any existing
-- polygon, so rooms that were drawn before this migration keep the
-- same footprint after we switch the editor over to rectangles.
-- jsonb_array_elements lets us decompose the polygon and aggregate.
UPDATE "move_rooms"
SET
  "x"      = LEAST(GREATEST(bb.min_x, 0), 1),
  "y"      = LEAST(GREATEST(bb.min_y, 0), 1),
  "width"  = LEAST(GREATEST(bb.max_x - bb.min_x, 0.05), 1),
  "height" = LEAST(GREATEST(bb.max_y - bb.min_y, 0.05), 1)
FROM (
  SELECT
    r.id AS room_id,
    MIN((p->>'x')::real) AS min_x,
    MAX((p->>'x')::real) AS max_x,
    MIN((p->>'y')::real) AS min_y,
    MAX((p->>'y')::real) AS max_y
  FROM "move_rooms" r, jsonb_array_elements(r.polygon) AS p
  WHERE jsonb_typeof(r.polygon) = 'array' AND jsonb_array_length(r.polygon) >= 2
  GROUP BY r.id
) bb
WHERE "move_rooms".id = bb.room_id;
