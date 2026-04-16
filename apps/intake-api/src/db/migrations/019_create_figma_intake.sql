-- Figma design sessions
CREATE TABLE figma_design_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  figma_file_key VARCHAR(255) NOT NULL,
  figma_file_url TEXT NOT NULL,
  file_name VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'LOADING'
    CHECK (status IN ('LOADING', 'READY', 'EXTRACTING', 'EXTRACTED', 'FAILED', 'CLOSED')),
  extracted_context JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_sessions_workspace ON figma_design_sessions(intake_workspace_id);

-- Figma frames / pages extracted from the design file
CREATE TABLE figma_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES figma_design_sessions(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  node_type VARCHAR(50) NOT NULL DEFAULT 'FRAME',
  parent_node_id VARCHAR(255),
  page_name VARCHAR(500),
  width NUMERIC,
  height NUMERIC,
  thumbnail_url TEXT,
  extracted_text JSONB NOT NULL DEFAULT '[]',
  child_components JSONB NOT NULL DEFAULT '[]',
  layout_info JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_frames_session ON figma_frames(session_id);

-- Figma components extracted from the design
CREATE TABLE figma_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES figma_design_sessions(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  component_set_name VARCHAR(500),
  description TEXT,
  page_name VARCHAR(500),
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_components_session ON figma_components(session_id);

-- User's node selections for scoping intake
CREATE TABLE figma_node_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES figma_design_sessions(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_selections_session ON figma_node_selections(session_id);

-- Figma repo discovery results (mapping design components to code)
CREATE TABLE figma_repo_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES figma_design_sessions(id) ON DELETE CASCADE,
  figma_component_name VARCHAR(500) NOT NULL,
  file_path TEXT,
  symbol_name VARCHAR(500),
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50,
  match_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_repo_mappings_session ON figma_repo_mappings(session_id);

-- Figma-generated requirements (similar to visual_requirements)
CREATE TABLE figma_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES figma_design_sessions(id) ON DELETE CASCADE,
  intake_workspace_id UUID NOT NULL REFERENCES intake_workspaces(id) ON DELETE CASCADE,
  frame_node_id VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  requirement_type VARCHAR(50) NOT NULL DEFAULT 'SCREEN'
    CHECK (requirement_type IN ('SCREEN', 'COMPONENT', 'INTERACTION', 'LAYOUT', 'CONTENT')),
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  code_target_hints JSONB NOT NULL DEFAULT '[]',
  open_questions JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACCEPTED', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_figma_reqs_session ON figma_requirements(session_id);
CREATE INDEX idx_figma_reqs_workspace ON figma_requirements(intake_workspace_id);
