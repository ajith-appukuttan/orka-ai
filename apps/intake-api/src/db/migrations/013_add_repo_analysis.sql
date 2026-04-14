-- Add repo_url to intake_workspaces for linking a GitHub repository
ALTER TABLE intake_workspaces
  ADD COLUMN IF NOT EXISTS repo_url TEXT,
  ADD COLUMN IF NOT EXISTS repo_provider VARCHAR(20) DEFAULT 'github'
    CHECK (repo_provider IN ('github', 'gitlab', 'bitbucket', 'azure_devops')),
  ADD COLUMN IF NOT EXISTS repo_default_branch VARCHAR(255) DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS repo_status VARCHAR(20) DEFAULT NULL
    CHECK (repo_status IN ('PENDING', 'ANALYZING', 'READY', 'FAILED'));

-- Repository analysis results (cached per workspace)
CREATE TABLE IF NOT EXISTS repository_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  repo_url TEXT NOT NULL,
  analysis_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (analysis_status IN ('PENDING', 'ANALYZING', 'READY', 'FAILED')),
  -- Extracted metadata
  readme_summary TEXT,
  tech_stack JSONB NOT NULL DEFAULT '[]',
  file_tree JSONB NOT NULL DEFAULT '[]',
  key_components JSONB NOT NULL DEFAULT '[]',
  architecture_notes TEXT,
  entry_points JSONB NOT NULL DEFAULT '[]',
  -- Error tracking
  error_message TEXT,
  -- Timestamps
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repo_analyses_workspace
  ON repository_analyses(intake_workspace_id);

-- Code target mappings for visual requirements
CREATE TABLE IF NOT EXISTS visual_requirement_code_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visual_requirement_id UUID NOT NULL REFERENCES visual_requirements(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  symbol_name VARCHAR(500),
  match_reason TEXT,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_targets_requirement
  ON visual_requirement_code_targets(visual_requirement_id);
