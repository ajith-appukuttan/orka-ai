-- Intake Workspaces: long-lived container for one app idea / project
CREATE TABLE intake_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL DEFAULT 'Untitled Workspace',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVIEWING', 'APPROVED', 'ARCHIVED')),
  latest_draft_id UUID,       -- FK added after draft_versions table
  latest_summary_id UUID,     -- FK added after summaries table
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_tenant ON intake_workspaces(tenant_id);
CREATE INDEX idx_workspaces_status ON intake_workspaces(status);
CREATE INDEX idx_workspaces_updated ON intake_workspaces(updated_at DESC);

-- Add workspace reference to existing sessions
ALTER TABLE intake_sessions
  ADD COLUMN intake_workspace_id UUID REFERENCES intake_workspaces(id) ON DELETE CASCADE;

-- Add title to sessions for sidebar display
ALTER TABLE intake_sessions
  ADD COLUMN title VARCHAR(500) NOT NULL DEFAULT 'New Session';

CREATE INDEX idx_sessions_workspace ON intake_sessions(intake_workspace_id, created_at DESC);
