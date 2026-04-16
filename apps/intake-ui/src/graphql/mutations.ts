import { gql } from '@apollo/client';

// ─── Workspace Mutations ───────────────────────────────
export const CREATE_WORKSPACE = gql`
  mutation CreateWorkspace($tenantId: String!, $title: String!, $createdBy: String!) {
    createIntakeWorkspace(tenantId: $tenantId, title: $title, createdBy: $createdBy) {
      id
      tenantId
      title
      status
      createdAt
    }
  }
`;

export const RENAME_WORKSPACE = gql`
  mutation RenameWorkspace($workspaceId: ID!, $title: String!) {
    renameIntakeWorkspace(workspaceId: $workspaceId, title: $title) {
      id
      title
    }
  }
`;

// ─── Session Mutations ─────────────────────────────────
export const START_SESSION = gql`
  mutation StartSession($workspaceId: ID!, $userId: String!, $title: String) {
    startIntakeSession(workspaceId: $workspaceId, userId: $userId, title: $title) {
      id
      intakeWorkspaceId
      title
      status
      createdAt
    }
  }
`;

// ─── Message Mutations ─────────────────────────────────
export const SEND_MESSAGE = gql`
  mutation SendMessage($sessionId: ID!, $message: String!) {
    sendIntakeMessage(sessionId: $sessionId, message: $message) {
      id
      sessionId
      role
      content
      createdAt
    }
  }
`;

export const LOG_MESSAGE = gql`
  mutation LogMessage($sessionId: ID!, $role: String!, $content: String!) {
    logIntakeMessage(sessionId: $sessionId, role: $role, content: $content) {
      id
      sessionId
      role
      content
      createdAt
    }
  }
`;

// ─── Draft Mutations ───────────────────────────────────
export const EDIT_DRAFT = gql`
  mutation EditDraft($sessionId: ID!, $patch: JSON!) {
    editIntakeDraft(sessionId: $sessionId, patch: $patch) {
      id
      version
      draft
      readinessScore
    }
  }
`;

// ─── Chat Summary ──────────────────────────────────────
export const GENERATE_CHAT_SUMMARY = gql`
  mutation GenerateChatSummary($workspaceId: ID!) {
    generateChatSummary(workspaceId: $workspaceId) {
      workspaceId
      summaryMarkdown
      generatedAt
    }
  }
`;

// ─── Figma Intake ──────────────────────────────────────
export const START_FIGMA_INTAKE = gql`
  mutation StartFigmaIntake($workspaceId: ID!, $figmaUrl: String!) {
    startFigmaIntake(workspaceId: $workspaceId, figmaUrl: $figmaUrl) {
      id
      figmaFileKey
      figmaFileUrl
      fileName
      status
    }
  }
`;

export const SELECT_FIGMA_NODES = gql`
  mutation SelectFigmaNodes($sessionId: ID!, $nodeIds: [String!]!) {
    selectFigmaNodes(sessionId: $sessionId, nodeIds: $nodeIds) {
      id
      nodeId
      nodeType
    }
  }
`;

export const RUN_FIGMA_REPO_DISCOVERY = gql`
  mutation RunFigmaRepoDiscovery($sessionId: ID!) {
    runFigmaRepoDiscovery(sessionId: $sessionId) {
      id
      figmaComponentName
      filePath
      symbolName
      confidence
      matchReason
    }
  }
`;

export const GENERATE_FIGMA_REQUIREMENTS = gql`
  mutation GenerateFigmaRequirements($sessionId: ID!) {
    generateFigmaRequirements(sessionId: $sessionId) {
      id
      title
      summary
      requirementType
      acceptanceCriteria
      codeTargetHints
      confidence
      status
    }
  }
`;

export const GENERATE_FIGMA_PRD = gql`
  mutation GenerateFigmaPRD($sessionId: ID!) {
    generateFigmaPRD(sessionId: $sessionId) {
      id
      intakeWorkspaceId
      version
      draftJson
      readinessScore
      readyForReview
    }
  }
`;

// ─── Approval ──────────────────────────────────────────
export const APPROVE_DRAFT = gql`
  mutation ApproveDraft($sessionId: ID!, $approvedBy: String!) {
    approveIntakeDraft(sessionId: $sessionId, approvedBy: $approvedBy) {
      id
      runId
      stage
      artifactType
      version
      objectKey
      checksum
      approvedBy
      approvedAt
      status
    }
  }
`;
