import { useState } from 'react';
import { Stack, Box, Paper, Text, Group, Tooltip, ActionIcon } from '@mantine/core';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ChatSummaryModal } from './ChatSummaryModal';
import { PipelineStepper } from '../pipeline/PipelineStepper';
import { useTheme } from '../../hooks/useTheme';
import { getBotName } from '../../utils/botName';

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
  workspaceStatus?: string;
  classification?: string | null;
  runId?: string | null;
  statusChangedAt?: string;
  workspaceId?: string | null;
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  isStreaming,
  streamingContent,
  readinessScore = 0,
  workspaceStatus,
  classification,
  runId,
  statusChangedAt,
  workspaceId,
}: ChatPanelProps) {
  const { themedColor, contentMaxWidth } = useTheme();
  const [summaryOpen, setSummaryOpen] = useState(false);

  const pct = Math.round(readinessScore * 100);
  const isReady = readinessScore >= 0.8;

  const botName = getBotName(workspaceStatus);

  return (
    <Stack h="100%" gap={0}>
      {/* Chat header */}
      <Box
        px="md"
        py={10}
        style={{
          borderBottom: `1px solid ${themedColor('prdBorder')}`,
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center" maw={contentMaxWidth} mx="auto" w="100%">
          <Group gap={8}>
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: themedColor('accentGreen'),
                boxShadow: `0 0 6px ${themedColor('accentGreen')}`,
              }}
            />
            <Text
              size="sm"
              fw={800}
              ff="monospace"
              tt="uppercase"
              style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
            >
              {botName}
            </Text>
          </Group>
          <Group gap={8}>
            {runId && (
              <Text size="xs" fw={600} ff="monospace" style={{ color: themedColor('chatAccent') }}>
                {runId}
              </Text>
            )}
            <Tooltip label="Summarize conversation">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => setSummaryOpen(true)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="17" y1="10" x2="3" y2="10" />
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="14" x2="3" y2="14" />
                  <line x1="17" y1="18" x2="3" y2="18" />
                </svg>
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      {/* Readiness bar */}
      {readinessScore > 0 && (!workspaceStatus || workspaceStatus === 'ACTIVE') && (
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

      {/* Pipeline stepper */}
      {workspaceStatus && (
        <Box style={{ borderBottom: `1px solid ${themedColor('prdBorder')}`, flexShrink: 0 }}>
          <Box maw={contentMaxWidth} mx="auto" w="100%">
            <PipelineStepper
              workspaceStatus={workspaceStatus}
              classification={classification}
              statusChangedAt={statusChangedAt}
            />
          </Box>
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
          workspaceStatus={workspaceStatus}
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

      <ChatSummaryModal
        workspaceId={workspaceId ?? null}
        opened={summaryOpen}
        onClose={() => setSummaryOpen(false)}
      />
    </Stack>
  );
}
