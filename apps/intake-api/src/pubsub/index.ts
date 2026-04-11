import { PubSub } from 'graphql-subscriptions';

// In-memory PubSub for MVP. Replace with Redis PubSub for production.
export const pubsub = new PubSub();

export const EVENTS = {
  // Final persisted messages only (user, assistant, system)
  MESSAGE_STREAM: (sessionId: string) => `MESSAGE_STREAM_${sessionId}`,
  // Streaming chunks (partial assistant response while Claude is generating)
  MESSAGE_STREAMING: (sessionId: string) => `MESSAGE_STREAMING_${sessionId}`,
  DRAFT_UPDATED: (id: string) => `DRAFT_UPDATED_${id}`,
  READINESS_UPDATED: (id: string) => `READINESS_UPDATED_${id}`,
  MEMORY_UPDATED: (workspaceId: string) => `MEMORY_UPDATED_${workspaceId}`,
};
