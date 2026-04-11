import { gql } from '@apollo/client';

export const MESSAGE_STREAM = gql`
  subscription MessageStream($sessionId: ID!) {
    intakeMessageStream(sessionId: $sessionId) {
      id
      sessionId
      role
      content
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
  subscription DraftUpdated($sessionId: ID!) {
    intakeDraftUpdated(sessionId: $sessionId) {
      id
      version
      draft
      readinessScore
    }
  }
`;

export const READINESS_UPDATED = gql`
  subscription ReadinessUpdated($sessionId: ID!) {
    intakeReadinessUpdated(sessionId: $sessionId)
  }
`;
