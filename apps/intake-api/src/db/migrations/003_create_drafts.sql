CREATE TABLE intake_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  draft JSONB NOT NULL DEFAULT '{}',
  readiness_score NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, version)
);

CREATE INDEX idx_drafts_session ON intake_drafts(session_id, version DESC);
