-- Draft versions scoped to workspace (not session)
CREATE TABLE intake_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  draft_json JSONB NOT NULL DEFAULT '{}',
  readiness_score NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  ready_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(intake_workspace_id, version)
);

CREATE INDEX idx_draft_versions_workspace ON intake_draft_versions(intake_workspace_id, version DESC);

-- FK from workspaces to latest draft
ALTER TABLE intake_workspaces
  ADD CONSTRAINT fk_latest_draft
  FOREIGN KEY (latest_draft_id) REFERENCES intake_draft_versions(id) ON DELETE SET NULL;
