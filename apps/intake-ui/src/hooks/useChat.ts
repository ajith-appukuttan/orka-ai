import { useState, useCallback } from 'react';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { SEND_MESSAGE, LOG_MESSAGE } from '../graphql/mutations';
import { GET_MESSAGES } from '../graphql/queries';
import { MESSAGE_STREAM, STREAMING_CHUNK } from '../graphql/subscriptions';

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export function useChat(sessionId: string | undefined) {
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const { data, loading } = useQuery(GET_MESSAGES, {
    variables: { sessionId, limit: 100 },
    skip: !sessionId,
  });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    update: (cache, { data: mutationData }) => {
      if (!mutationData?.sendIntakeMessage || !sessionId) return;

      const existing = cache.readQuery({
        query: GET_MESSAGES,
        variables: { sessionId, limit: 100 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingMessages: ChatMessage[] = (existing as any)?.intakeMessages ?? [];
      const alreadyExists = existingMessages.some(
        (m) => m.id === mutationData.sendIntakeMessage.id,
      );

      if (!alreadyExists) {
        cache.writeQuery({
          query: GET_MESSAGES,
          variables: { sessionId, limit: 100 },
          data: {
            intakeMessages: [...existingMessages, mutationData.sendIntakeMessage],
          },
        });
      }
    },
  });

  // Subscribe to streaming chunks (partial responses while Claude generates)
  useSubscription(STREAMING_CHUNK, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ data: subData }) => {
      const chunk = subData.data?.intakeStreamingChunk;
      if (!chunk) return;

      if (chunk.done) {
        // Streaming finished — clear streaming state
        // The final message will arrive via MESSAGE_STREAM subscription
        setStreamingContent(null);
        setIsStreaming(false);
      } else {
        setStreamingContent(chunk.content);
        setIsStreaming(true);
      }
    },
  });

  // Subscribe to final persisted messages (only fires once per assistant response)
  useSubscription(MESSAGE_STREAM, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ client, data: subData }) => {
      const newMessage = subData.data?.intakeMessageStream;
      if (!newMessage) return;

      // Skip user messages — already added via mutation update
      if (newMessage.role === 'user') return;

      // Clear any remaining streaming state
      setStreamingContent(null);
      setIsStreaming(false);

      const existing = client.readQuery({
        query: GET_MESSAGES,
        variables: { sessionId, limit: 100 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingMessages: ChatMessage[] = (existing as any)?.intakeMessages ?? [];
      const alreadyExists = existingMessages.some((m) => m.id === newMessage.id);

      if (!alreadyExists) {
        client.writeQuery({
          query: GET_MESSAGES,
          variables: { sessionId, limit: 100 },
          data: {
            intakeMessages: [...existingMessages, newMessage],
          },
        });
      }
    },
  });

  const [logMessageMutation] = useMutation(LOG_MESSAGE);

  const send = useCallback(
    async (message: string, targetSessionId?: string) => {
      const sid = targetSessionId ?? sessionId;
      if (!sid) return;
      setIsStreaming(true);
      await sendMessage({ variables: { sessionId: sid, message } });
    },
    [sessionId, sendMessage],
  );

  // Log a message without triggering Claude (for visual inspect events, system notes)
  const logMessage = useCallback(
    async (content: string, role: string = 'system', targetSessionId?: string) => {
      const sid = targetSessionId ?? sessionId;
      if (!sid) return;
      await logMessageMutation({ variables: { sessionId: sid, role, content } });
    },
    [sessionId, logMessageMutation],
  );

  return {
    messages: (data?.intakeMessages ?? []) as ChatMessage[],
    loading,
    send,
    logMessage,
    isSending: sending,
    isStreaming,
    streamingContent,
  };
}
