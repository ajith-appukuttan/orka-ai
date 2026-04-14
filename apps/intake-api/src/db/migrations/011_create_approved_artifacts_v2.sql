-- Approved artifacts with run_id correlation and object storage references
CREATE TABLE approved_artifacts_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  workspace_id UUID REFERENCES intake_workspaces(id) ON DELETE SET NULL,
  project_id UUID,
  session_id UUID REFERENCES intake_sessions(id) ON DELETE SET NULL,
  run_id VARCHAR(100) NOT NULL,
  approval_id UUID NOT NULL DEFAULT gen_random_uuid(),
  stage VARCHAR(50) NOT NULL DEFAULT 'INTAKE'
    CHECK (stage IN ('INTAKE', 'ELABORATION', 'DESIGN', 'BUILD')),
  artifact_type VARCHAR(50) NOT NULL DEFAULT 'PRD'
    CHECK (artifact_type IN ('PRD', 'INTAKE_DRAFT', 'VISUAL_REQUIREMENT_SET')),
  version INTEGER NOT NULL DEFAULT 1,
  bucket_name VARCHAR(255) NOT NULL,
  object_key TEXT NOT NULL,
  checksum VARCHAR(128) NOT NULL,
  content_type VARCHAR(100) NOT NULL DEFAULT 'application/json',
  approved_by VARCHAR(255) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
    CHECK (status IN ('APPROVED', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approved_v2_run ON approved_artifacts_v2(run_id);
CREATE INDEX idx_approved_v2_workspace ON approved_artifacts_v2(workspace_id);
CREATE INDEX idx_approved_v2_tenant ON approved_artifacts_v2(tenant_id);
CREATE INDEX idx_approved_v2_stage ON approved_artifacts_v2(stage, artifact_type);

-- Add run_id to sessions and draft versions
ALTER TABLE intake_sessions
  ADD COLUMN IF NOT EXISTS run_id VARCHAR(100);

ALTER TABLE intake_draft_versions
  ADD COLUMN IF NOT EXISTS run_id VARCHAR(100);

-- Run ID sequence table for generating run-YYYYMMDD-NNN
CREATE TABLE run_id_sequence (
  date_key VARCHAR(8) PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);
