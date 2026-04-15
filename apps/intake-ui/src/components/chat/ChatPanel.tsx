import { Stack, Box, Paper, Text } from '@mantine/core';
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
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  isStreaming,
  streamingContent,
}: ChatPanelProps) {
  const { themedColor, contentMaxWidth } = useTheme();

  return (
    <Stack h="100%" gap={0}>
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
