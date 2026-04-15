import { Stack, Box, Paper, Text, Group } from '@mantine/core';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useTheme } from '../../hooks/useTheme';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string | null;
  readinessScore?: number;
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  isStreaming,
  streamingContent,
  readinessScore = 0,
}: ChatPanelProps) {
  const { themedColor, contentMaxWidth } = useTheme();

  const pct = Math.round(readinessScore * 100);
  const isReady = readinessScore >= 0.8;

  return (
    <Stack h="100%" gap={0}>
      {/* Readiness bar */}
      {readinessScore > 0 && (
        <Box
          px="md"
          py={8}
          style={{
            borderBottom: `1px solid ${themedColor('prdBorder')}`,
            flexShrink: 0,
          }}
        >
          <Group gap="sm" align="center" maw={contentMaxWidth} mx="auto" w="100%">
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isReady ? themedColor('prdGreen') : themedColor('prdProgressFill'),
                boxShadow: isReady ? `0 0 6px ${themedColor('prdGreen')}` : 'none',
                transition: 'all 300ms ease',
              }}
            />
            <Text
              size="xs"
              fw={700}
              ff="monospace"
              tt="uppercase"
              style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
            >
              PRD Readiness
            </Text>
            <Box
              flex={1}
              style={{
                height: 4,
                borderRadius: 2,
                background: themedColor('prdProgressBg'),
                overflow: 'hidden',
              }}
            >
              <Box
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 2,
                  background: isReady
                    ? themedColor('prdProgressFillReady')
                    : themedColor('prdProgressFill'),
                  transition: 'width 500ms ease, background 300ms ease',
                }}
              />
            </Box>
            <Text
              size="xs"
              fw={700}
              ff="monospace"
              style={{
                color: isReady ? themedColor('prdGreen') : themedColor('prdAccent'),
              }}
            >
              {pct}%
            </Text>
          </Group>
        </Box>
      )}

      {/* Messages — minHeight:0 is required for flex child scrolling */}
      <Box flex={1} style={{ overflow: 'hidden', minHeight: 0 }}>
        <MessageList
          messages={messages}
          isLoading={isLoading && !isStreaming}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          onQuickReply={onSendMessage}
        />
      </Box>

      {/* Floating input bar at bottom */}
      <Box px="md" pb="md" pt="xs">
        <Box maw={contentMaxWidth} mx="auto" w="100%">
          <Paper
            radius="xl"
            p={4}
            style={{
              background: themedColor('inputBg'),
              border: 'none',
            }}
          >
            <MessageInput onSend={onSendMessage} disabled={isLoading || isStreaming} />
          </Paper>

          <Text
            size="xs"
            ta="center"
            mt={8}
            ff="monospace"
            style={{ color: themedColor('chatTextDimmed') }}
          >
            Virtual PM can make mistakes. Review the intake draft carefully.
          </Text>
        </Box>
      </Box>
    </Stack>
  );
}
