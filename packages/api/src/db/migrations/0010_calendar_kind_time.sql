-- Calendar: distinguish tasks from events on the unified tasks table.
--
-- `kind` partitions rows into checklist-style tasks vs scheduled events
-- (open homes, viewings, photoshoots, auctions). `start_time` carries the
-- HH:MM time-of-day on events; tasks leave it null and use `due_date` only.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "kind" varchar(10) DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_time" varchar(5);
