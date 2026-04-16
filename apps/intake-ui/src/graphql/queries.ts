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

// ─── Figma Intake Queries ──────────────────────────────
export const GET_FIGMA_SESSION = gql`
  query GetFigmaSession($sessionId: ID!) {
    figmaDesignSession(sessionId: $sessionId) {
      id
      intakeWorkspaceId
      figmaFileKey
      figmaFileUrl
      fileName
      status
      extractedContext
      errorMessage
      createdAt
      frames {
        id
        nodeId
        name
        nodeType
        pageName
        width
        height
        thumbnailUrl
      }
      components {
        id
        nodeId
        name
        componentSetName
        description
        pageName
      }
      selections {
        id
        nodeId
        nodeType
        selectedAt
      }
    }
  }
`;

export const GET_FIGMA_REPO_MAPPINGS = gql`
  query GetFigmaRepoMappings($sessionId: ID!) {
    figmaRepoMappings(sessionId: $sessionId) {
      id
      figmaComponentName
      filePath
      symbolName
      confidence
      matchReason
    }
  }
`;

export const GET_FIGMA_REQUIREMENTS = gql`
  query GetFigmaRequirements($workspaceId: ID!) {
    figmaRequirements(workspaceId: $workspaceId) {
      id
      frameNodeId
      title
      summary
      requirementType
      acceptanceCriteria
      codeTargetHints
      openQuestions
      confidence
      status
      createdAt
    }
  }
`;
