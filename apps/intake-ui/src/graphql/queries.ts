import { gql } from '@apollo/client';

// ─── Workspace Queries ─────────────────────────────────
export const GET_WORKSPACES = gql`
  query GetWorkspaces($tenantId: String!) {
    intakeWorkspaces(tenantId: $tenantId) {
      id
      tenantId
      title
      status
      readinessScore
      statusChangedAt
      createdAt
      updatedAt
      sessions {
        id
        title
        status
        createdAt
        updatedAt
      }
      latestClassification {
        classification
        buildReadinessScore
        runId
      }
    }
  }
`;

export const GET_WORKSPACE = gql`
  query GetWorkspace($workspaceId: ID!) {
    intakeWorkspace(workspaceId: $workspaceId) {
      id
      tenantId
      title
      status
      readinessScore
      latestDraft {
        id
        version
        draftJson
        readinessScore
        readyForReview
      }
    }
  }
`;

// ─── Session Queries ───────────────────────────────────
export const GET_SESSION = gql`
  query GetSession($sessionId: ID!) {
    intakeSession(sessionId: $sessionId) {
      id
      intakeWorkspaceId
      title
      status
      readinessScore
      createdAt
      messages {
        id
        sessionId
        role
        content
        createdAt
      }
    }
  }
`;

export const GET_MESSAGES = gql`
  query GetMessages($sessionId: ID!, $limit: Int, $offset: Int) {
    intakeMessages(sessionId: $sessionId, limit: $limit, offset: $offset) {
      id
      sessionId
      role
      content
      persona
      createdAt
    }
  }
`;

// ─── Draft Queries ─────────────────────────────────────
export const GET_LATEST_DRAFT = gql`
  query GetLatestDraft($workspaceId: ID!) {
    intakeLatestDraft(workspaceId: $workspaceId) {
      id
      intakeWorkspaceId
      version
      draftJson
      readinessScore
      readyForReview
    }
  }
`;

// Legacy draft query (backward compat)
export const GET_DRAFT = gql`
  query GetDraft($sessionId: ID!) {
    intakeDraft(sessionId: $sessionId) {
      id
      sessionId
      version
      draft
      readinessScore
    }
  }
`;

// ─── Memory Queries ────────────────────────────────────
export const GET_MEMORY_ITEMS = gql`
  query GetMemoryItems($workspaceId: ID!) {
    intakeMemoryItems(workspaceId: $workspaceId) {
      id
      kind
      key
      value
      source
      confidence
      status
      createdAt
    }
  }
`;

// ─── Search ────────────────────────────────────────────
export const SEARCH_INTAKE = gql`
  query SearchIntake($query: String!, $tenantId: String!) {
    searchIntake(query: $query, tenantId: $tenantId) {
      workspaceId
      workspaceTitle
      sessionId
      sessionTitle
      matchType
      matchText
      createdAt
    }
  }
`;
