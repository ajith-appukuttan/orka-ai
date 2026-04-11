CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVIEWING', 'APPROVED', 'ARCHIVED')),
  readiness_score NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_project ON intake_sessions(project_id);
CREATE INDEX idx_sessions_tenant ON intake_sessions(tenant_id);
CREATE INDEX idx_sessions_status ON intake_sessions(status);
