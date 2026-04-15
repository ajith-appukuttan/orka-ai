-- Add status_changed_at column to intake_workspaces.
-- Unlike updated_at (which is modified by many operations),
-- status_changed_at is ONLY set by pipelineTransition.ts on status changes.
-- This enables accurate "time in current status" calculations in the UI.

ALTER TABLE intake_workspaces
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill from updated_at for existing rows (best approximation)
UPDATE intake_workspaces SET status_changed_at = updated_at;
