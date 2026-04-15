-- Expand workspace status to cover full pipeline lifecycle
-- Drop the old CHECK and add expanded one
ALTER TABLE intake_workspaces DROP CONSTRAINT IF EXISTS intake_workspaces_status_check;
ALTER TABLE intake_workspaces ADD CONSTRAINT intake_workspaces_status_check
  CHECK (status IN (
    'ACTIVE',         -- Intake in progress
    'APPROVED',       -- PRD approved, awaiting classification
    'CLASSIFYING',    -- Classifier running
    'ELABORATING',    -- Needs elaboration, copilot in elab mode
    'PLANNING',       -- Needs planning/decomposition
    'BUILDING',       -- Builder executing
    'BUILT',          -- Build complete (has PR)
    'FAILED',         -- Build or classification failed
    'ARCHIVED'        -- Soft-deleted
  ));

-- Pipeline transition history for audit trail
CREATE TABLE IF NOT EXISTS pipeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  trigger VARCHAR(50) NOT NULL,
  run_id VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_workspace
  ON pipeline_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_created
  ON pipeline_history(created_at);
