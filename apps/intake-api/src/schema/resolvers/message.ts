import { query } from '../../db/pool.js';
import { pubsub, EVENTS } from '../../pubsub/index.js';
import { runChatTurnPipeline } from '../../agents/intakeCopilot.js';

export const messageResolvers = {
  Query: {
    intakeMessages: async (
      _: unknown,
      { sessionId, limit = 50, offset = 0 }: { sessionId: string; limit?: number; offset?: number },
    ) => {
      const result = await query(
        `SELECT id, session_id as "sessionId", role, content,
                tool_calls as "toolCalls", created_at as "createdAt"
         FROM intake_messages
         WHERE session_id = $1
         ORDER BY created_at ASC
         LIMIT $2 OFFSET $3`,
        [sessionId, limit, offset],
      );
      return result.rows;
    },
  },

  Mutation: {
    sendIntakeMessage: async (
      _: unknown,
      { sessionId, message }: { sessionId: string; message: string },
    ) => {
      // Persist user message
      const userMsg = await query(
        `INSERT INTO intake_messages (session_id, role, content)
         VALUES ($1, 'user', $2)
         RETURNING id, session_id as "sessionId", role, content,
                   tool_calls as "toolCalls", created_at as "createdAt"`,
        [sessionId, message],
      );

      const userMessage = userMsg.rows[0];

      // Note: We do NOT publish the user message via subscription here.
      // The mutation response already returns it to the caller, and the
      // Apollo Client cache handles adding it to the message list.
      // Publishing it would cause a duplicate in the UI.

      // Run the full chat turn pipeline asynchronously:
      // Claude streaming response → persist → draft extraction
      // The response comes back via the intakeMessageStream subscription.
      runChatTurnPipeline(sessionId).catch((err) => {
        console.error(`Chat turn pipeline failed for session ${sessionId}:`, err);

        // Publish an error message so the UI knows something went wrong
        pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
          intakeMessageStream: {
            id: `error-${Date.now()}`,
            sessionId,
            role: 'system',
            content: 'Sorry, something went wrong processing your message. Please try again.',
            createdAt: new Date().toISOString(),
          },
        });
      });

      // Return the user message immediately — assistant response arrives via subscription
      return userMessage;
    },

    // Log a message without triggering Claude pipeline (for visual inspect events, etc.)
    logIntakeMessage: async (
      _: unknown,
      { sessionId, role, content }: { sessionId: string; role: string; content: string },
    ) => {
      const result = await query(
        `INSERT INTO intake_messages (session_id, role, content)
         VALUES ($1, $2, $3)
         RETURNING id, session_id as "sessionId", role, content,
                   tool_calls as "toolCalls", created_at as "createdAt"`,
        [sessionId, role, content],
      );

      const savedMessage = result.rows[0];

      // Publish so subscribers see it in real-time
      pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
        intakeMessageStream: savedMessage,
      });

      return savedMessage;
    },
  },

  Subscription: {
    intakeMessageStream: {
      subscribe: (_: unknown, { sessionId }: { sessionId: string }) => {
        return pubsub.asyncIterator(EVENTS.MESSAGE_STREAM(sessionId));
      },
    },
    intakeStreamingChunk: {
      subscribe: (_: unknown, { sessionId }: { sessionId: string }) => {
        return pubsub.asyncIterator(EVENTS.MESSAGE_STREAMING(sessionId));
      },
    },
  },
};
