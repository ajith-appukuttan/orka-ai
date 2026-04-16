import { gql } from '@apollo/client';

export const MESSAGE_STREAM = gql`
  subscription MessageStream($sessionId: ID!) {
    intakeMessageStream(sessionId: $sessionId) {
      id
      sessionId
      role
      content
      persona
      createdAt
    }
  }
`;

export const STREAMING_CHUNK = gql`
  subscription StreamingChunk($sessionId: ID!) {
    intakeStreamingChunk(sessionId: $sessionId) {
      sessionId
      content
      done
    }
  }
`;

export const DRAFT_UPDATED = gql`
  subscription DraftUpdated($workspaceId: ID!) {
    intakeDraftUpdated(workspaceId: $workspaceId) {
      id
      intakeWorkspaceId
      version
      draftJson
      readinessScore
      readyForReview
    }
  }
`;

export const READINESS_UPDATED = gql`
  subscription ReadinessUpdated($workspaceId: ID!) {
    intakeReadinessUpdated(workspaceId: $workspaceId)
  }
`;

// ─── Figma Intake ──────────────────────────────────────
export const FIGMA_EXTRACTION_PROGRESS = gql`
  subscription FigmaExtractionProgress($sessionId: ID!) {
    figmaExtractionProgress(sessionId: $sessionId) {
      id
      status
      fileName
      extractedContext
      errorMessage
    }
  }
`;
