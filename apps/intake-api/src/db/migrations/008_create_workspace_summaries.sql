-- Rolling workspace summaries for long-session continuity
CREATE TABLE workspace_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  generated_from_message_id UUID REFERENCES intake_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_summaries_workspace ON workspace_summaries(intake_workspace_id, created_at DESC);

-- FK from workspaces to latest summary
ALTER TABLE intake_workspaces
  ADD CONSTRAINT fk_latest_summary
  FOREIGN KEY (latest_summary_id) REFERENCES workspace_summaries(id) ON DELETE SET NULL;
