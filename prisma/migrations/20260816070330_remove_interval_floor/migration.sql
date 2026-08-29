-- Product decision reversed: the 90-minute minimum interval is no longer
-- enforced (see docs/telegram-ai-poster-plan.md §5, now superseded for this
-- deployment). Drops the hand-added CHECK constraint from the init migration.
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_interval_floor_check";
