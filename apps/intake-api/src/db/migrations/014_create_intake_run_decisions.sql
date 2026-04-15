CREATE TABLE IF NOT EXISTS intake_run_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(50) NOT NULL,
  approved_artifact_id UUID REFERENCES approved_artifacts_v2(id) ON DELETE CASCADE,
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  tenant_id VARCHAR(100) NOT NULL,
  classification VARCHAR(50) NOT NULL
    CHECK (classification IN ('RETURN_TO_INTAKE','DIRECT_TO_BUILD','NEEDS_ELABORATION','NEEDS_PLANNING','NEEDS_ELABORATION_AND_PLANNING')),
  build_readiness_score NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  reasoning_summary TEXT,
  signals JSONB NOT NULL DEFAULT '{}',
  required_next_stages JSONB NOT NULL DEFAULT '[]',
  blocking_questions JSONB NOT NULL DEFAULT '[]',
  object_key TEXT,
  bucket_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_decisions_run_id ON intake_run_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_run_decisions_workspace ON intake_run_decisions(intake_workspace_id);
