CREATE TABLE approved_intake_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  artifact JSONB NOT NULL,
  approved_by VARCHAR(255) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, version)
);

CREATE INDEX idx_artifacts_session ON approved_intake_artifacts(session_id);
