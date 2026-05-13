-- Calendar: support multi-day tasks/events selected via drag-range on the
-- calendar grid. `end_date` is the inclusive last day of the range; left
-- null for single-day entries so existing rows are unaffected.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "end_date" timestamp;
