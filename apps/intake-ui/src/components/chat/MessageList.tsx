import { useEffect, useRef } from 'react';
import { ScrollArea, Stack, Group, Text, Box, Loader } from '@mantine/core';
import { StreamingMessage } from './StreamingMessage';
import { useTheme } from '../../hooks/useTheme';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string | null;
}

function Avatar({ role }: { role: string }) {
  if (role === 'user') {
    return (
      <Box
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#5436DA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        U
      </Box>
    );
  }

  return (
    <Box
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #10a37f 0%, #1a7f64 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      V
    </Box>
  );
}

export function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { contentMaxWidth, themedColor } = useTheme();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, streamingContent]);

  return (
    <ScrollArea flex={1} viewportRef={scrollRef}>
      <Stack gap={0} py="md">
        {messages.map((msg) => (
          <Box
            key={msg.id}
            py="md"
            px="md"
            style={{
              background: msg.role === 'user' ? themedColor('userMsgBg') : 'transparent',
            }}
          >
            <Group
              align="flex-start"
              gap="md"
              wrap="nowrap"
              maw={contentMaxWidth}
              mx="auto"
              w="100%"
            >
              <Avatar role={msg.role} />
              <Box flex={1} pt={2}>
                <Text size="xs" fw={600} mb={4}>
                  {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'Virtual PM'}
                </Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {msg.content}
                </Text>
              </Box>
            </Group>
          </Box>
        ))}

        {isStreaming && streamingContent && (
          <Box py="md" px="md">
            <Group
              align="flex-start"
              gap="md"
              wrap="nowrap"
              maw={contentMaxWidth}
              mx="auto"
              w="100%"
            >
              <Avatar role="assistant" />
              <StreamingMessage content={streamingContent} />
            </Group>
          </Box>
        )}

        {isLoading && !isStreaming && (
          <Box py="md" px="md">
            <Group
              align="flex-start"
              gap="md"
              wrap="nowrap"
              maw={contentMaxWidth}
              mx="auto"
              w="100%"
            >
              <Avatar role="assistant" />
              <Group gap="xs" pt={2}>
                <Loader size="xs" type="dots" />
              </Group>
            </Group>
          </Box>
        )}
      </Stack>
    </ScrollArea>
  );
}
