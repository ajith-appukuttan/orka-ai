-- Project memory: durable facts, constraints, preferences across sessions
CREATE TABLE intake_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL
    CHECK (kind IN ('constraint', 'preference', 'standard', 'fact', 'integration')),
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'conversation'
    CHECK (source IN ('conversation', 'draft', 'user', 'tool')),
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_workspace ON intake_memory_items(intake_workspace_id, status);
CREATE INDEX idx_memory_kind ON intake_memory_items(intake_workspace_id, kind);
