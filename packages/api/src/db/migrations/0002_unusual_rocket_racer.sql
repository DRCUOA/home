ALTER TABLE "agent_runs" ADD COLUMN "model" varchar(50);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "tools" jsonb DEFAULT '[]'::jsonb;