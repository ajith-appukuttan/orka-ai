import { useEffect, useRef } from 'react';
import { ScrollArea, Stack, Group, Text, Box, Loader, Button } from '@mantine/core';
import Markdown from 'react-markdown';
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
  onQuickReply?: (text: string) => void;
}

/**
 * Extract clickable options from an assistant message.
 * Matches patterns like:
 *   1. **Option text** — description
 *   - **Option text** — description
 *   1. Option text
 *   - Option text
 */
function extractOptions(content: string): string[] {
  const lines = content.split('\n');
  const options: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: 1. **bold text** or 1. text or - **bold text** or - text
    const match = trimmed.match(
      /^(?:\d+[\.\)]\s*|[-•]\s+)\*{0,2}([^*\n]+?)\*{0,2}(?:\s*[-—:]\s*.*)?$/,
    );

    if (match && match[1]) {
      const optionText = match[1].trim();
      // Filter out non-option lines (too long = paragraph, too short = noise)
      if (optionText.length >= 3 && optionText.length <= 120 && !optionText.endsWith('?')) {
        options.push(optionText);
      }
    }
  }

  // Only return if we found 2-6 options (looks like a real list of choices)
  if (options.length >= 2 && options.length <= 6) {
    return options;
  }
  return [];
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
  onQuickReply,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { contentMaxWidth, themedColor } = useTheme();

  // Auto-scroll to bottom on new messages, streaming, and loading changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent, isLoading, isStreaming]);

  // Find the last assistant message to show quick reply buttons
  const lastAssistantIdx = messages.reduce(
    (last, msg, idx) => (msg.role === 'assistant' ? idx : last),
    -1,
  );

  return (
    <ScrollArea h="100%" viewportRef={scrollRef} scrollbarSize={8} type="always">
      <Stack gap={0} py="md">
        {messages.map((msg, idx) => {
          const isLastAssistant = idx === lastAssistantIdx && !isStreaming;
          const options = isLastAssistant ? extractOptions(msg.content) : [];

          return (
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
                  <Box className="orka-markdown" style={{ fontSize: 14, lineHeight: 1.7 }}>
                    <Markdown>{msg.content}</Markdown>
                  </Box>

                  {/* Quick reply buttons for options */}
                  {options.length > 0 && onQuickReply && (
                    <Group gap="xs" mt="sm" wrap="wrap">
                      {options.map((option, i) => (
                        <Button
                          key={i}
                          size="xs"
                          radius="xl"
                          variant="outline"
                          color="teal"
                          onClick={() => onQuickReply(option)}
                          styles={{
                            root: {
                              fontWeight: 500,
                              transition: 'all 150ms ease',
                            },
                          }}
                        >
                          {option}
                        </Button>
                      ))}
                    </Group>
                  )}
                </Box>
              </Group>
            </Box>
          );
        })}

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

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </Stack>
    </ScrollArea>
  );
}
