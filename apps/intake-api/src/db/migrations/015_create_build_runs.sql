-- Build runs: one per approved PRD execution
CREATE TABLE IF NOT EXISTS build_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(50) NOT NULL,
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  tenant_id VARCHAR(100) NOT NULL,
  approved_artifact_id UUID REFERENCES approved_artifacts_v2(id),
  classification_id UUID REFERENCES intake_run_decisions(id),

  -- Repository
  repo_url TEXT NOT NULL,
  repo_branch VARCHAR(255) NOT NULL DEFAULT 'main',
  worktree_branch VARCHAR(255) NOT NULL, -- run/{runId}
  worktree_path TEXT,

  -- Execution state
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'INITIALIZING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED')),
  summary TEXT,

  -- PR
  pr_url TEXT,
  pr_number INTEGER,

  -- Metrics
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  failed_tasks INTEGER NOT NULL DEFAULT 0,

  -- Object storage
  execution_log_key TEXT,
  bucket_name VARCHAR(255),

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_build_runs_run_id ON build_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_build_runs_workspace ON build_runs(intake_workspace_id);
CREATE INDEX IF NOT EXISTS idx_build_runs_status ON build_runs(status);

-- Build tasks: individual work items within a build run
CREATE TABLE IF NOT EXISTS build_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_run_id UUID NOT NULL REFERENCES build_runs(id) ON DELETE CASCADE,
  task_index INTEGER NOT NULL DEFAULT 0,

  -- Task definition
  description TEXT NOT NULL,
  files_affected JSONB NOT NULL DEFAULT '[]',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  dependencies JSONB NOT NULL DEFAULT '[]',

  -- Execution
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED')),
  commit_hash VARCHAR(40),
  commit_message TEXT,
  error_message TEXT,

  -- Agent outputs
  code_diff TEXT,
  review_notes TEXT,
  test_results JSONB,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_build_tasks_run ON build_tasks(build_run_id);
CREATE INDEX IF NOT EXISTS idx_build_tasks_status ON build_tasks(status);
