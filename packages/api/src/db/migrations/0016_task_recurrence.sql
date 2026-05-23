-- Calendar recurrence: tasks/events can repeat on common Outlook-style
-- patterns (daily / weekly / monthly / yearly) with an interval and an
-- optional end condition. When recurrence_frequency is NULL the task is
-- a one-off and these columns are ignored, so existing rows survive
-- unchanged.
--
--   * recurrence_frequency — daily | weekly | monthly | yearly
--   * recurrence_interval  — every N units of the frequency (default 1)
--   * recurrence_weekdays  — CSV of weekday indices (0=Mon..6=Sun)
--                            only meaningful when frequency = weekly
--   * recurrence_end_date  — inclusive last day the series may repeat on
--   * recurrence_count     — alternative stop condition: stop after N
--                            occurrences total (including the first)
--
-- Per-occurrence overrides/skips are intentionally NOT modeled in v1.
-- Edits and deletes always apply to the whole series.

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_frequency" varchar(10);
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_interval" integer;
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_weekdays" varchar(20);
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_end_date" timestamp;
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_count" integer;
