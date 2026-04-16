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
