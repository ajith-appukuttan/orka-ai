import { useEffect, useRef, useCallback } from 'react';
import { ScrollArea, Stack, Group, Text, Box, Loader, Button, Badge } from '@mantine/core';
import Markdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { StreamingMessage } from './StreamingMessage';
import { useTheme } from '../../hooks/useTheme';
import { getBotName, getBotAvatarLetter } from '../../utils/botName';

// ─── Classifier result detection ───────────────────────
function isClassifierMessage(content: string): boolean {
  return content.includes('Intake Readiness:') && content.includes('Build Readiness Score:');
}

interface ParsedClassification {
  label: string;
  score: number;
  confidence: number;
  reasoning: string;
  blockingQuestions: string[];
  nextStages: string;
  runId: string;
  reviewLink: string | null;
}

function parseClassifierMessage(content: string): ParsedClassification | null {
  const labelMatch = content.match(/Intake Readiness:\s*(.+?)(?:\n|$)/);
  const scoreMatch = content.match(/Build Readiness Score:\s*(\d+)%/);
  const confMatch = content.match(/Confidence:\s*(\d+)%/);
  const stagesMatch = content.match(/Next Stages:\s*(.+?)(?:\n|$)/);
  const runMatch = content.match(/Run ID:\s*([\w-]+)/);
  const linkMatch = content.match(/\[Review Approved PRD\]\(([^)]+)\)/);

  if (!labelMatch) return null;

  // Extract reasoning (between confidence line and blocking questions or next stages)
  const lines = content.split('\n');
  const reasoningLines: string[] = [];
  const blockingQuestions: string[] = [];
  let inBlocking = false;
  let pastHeader = false;

  for (const line of lines) {
    if (line.includes('Build Readiness Score:')) {
      pastHeader = true;
      continue;
    }
    if (line.startsWith('**Blocking Questions:**')) {
      inBlocking = true;
      continue;
    }
    if (
      line.startsWith('**Next Stages:**') ||
      line.startsWith('---') ||
      line.startsWith('*Run ID:') ||
      line.startsWith('[Review')
    ) {
      inBlocking = false;
      continue;
    }
    if (inBlocking && line.startsWith('- ')) {
      blockingQuestions.push(line.substring(2));
    } else if (
      pastHeader &&
      !inBlocking &&
      line.trim() &&
      !line.startsWith('##') &&
      !line.startsWith('**')
    ) {
      reasoningLines.push(line);
    }
  }

  return {
    label: labelMatch[1].trim(),
    score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
    confidence: confMatch ? parseInt(confMatch[1]) : 0,
    reasoning: reasoningLines.join(' ').trim(),
    blockingQuestions,
    nextStages: stagesMatch ? stagesMatch[1].trim() : '',
    runId: runMatch ? runMatch[1] : '',
    reviewLink: linkMatch ? linkMatch[1] : null,
  };
}

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
  workspaceStatus?: string;
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

// ─── Classifier Result Card ────────────────────────────
function ClassifierCard({
  parsed,
  onNavigate,
}: {
  parsed: ParsedClassification;
  onNavigate: (href: string) => void;
}) {
  const { themedColor } = useTheme();

  const colorMap: Record<string, string> = {
    'Ready for Build': 'teal',
    'Needs Elaboration': 'yellow',
    'Needs Planning': 'blue',
    'Needs Elaboration & Planning': 'orange',
    'Return to Intake': 'red',
  };
  const badgeColor = colorMap[parsed.label] || 'gray';

  const borderColorMap: Record<string, string> = {
    'Ready for Build': '#3fb950',
    'Needs Elaboration': '#d29922',
    'Needs Planning': '#58a6ff',
    'Needs Elaboration & Planning': '#db6d28',
    'Return to Intake': '#f85149',
  };
  const borderColor = borderColorMap[parsed.label] || themedColor('cardBorder');

  return (
    <Box
      style={{
        border: `1px solid ${borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 8,
        padding: '16px 20px',
        background: themedColor('surfaceBg'),
        marginTop: 4,
      }}
    >
      {/* Header */}
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="sm">
          <Badge size="lg" variant="filled" color={badgeColor} radius="sm">
            {parsed.label}
          </Badge>
          <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
            {parsed.runId}
          </Text>
        </Group>
      </Group>

      {/* Scores */}
      <Group gap="lg" mb="sm">
        <Group gap={6}>
          <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
            READINESS
          </Text>
          <Text size="sm" fw={700} ff="monospace" style={{ color: themedColor('chatText') }}>
            {parsed.score}%
          </Text>
        </Group>
        <Group gap={6}>
          <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
            CONFIDENCE
          </Text>
          <Text size="sm" fw={700} ff="monospace" style={{ color: themedColor('chatText') }}>
            {parsed.confidence}%
          </Text>
        </Group>
        {parsed.nextStages && (
          <Group gap={6}>
            <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
              NEXT
            </Text>
            <Text size="sm" fw={600} ff="monospace" style={{ color: themedColor('chatAccent') }}>
              {parsed.nextStages}
            </Text>
          </Group>
        )}
      </Group>

      {/* Reasoning */}
      {parsed.reasoning && (
        <Text size="sm" mb="sm" style={{ color: themedColor('chatText'), lineHeight: 1.6 }}>
          {parsed.reasoning}
        </Text>
      )}

      {/* Blocking Questions */}
      {parsed.blockingQuestions.length > 0 && (
        <Box
          mt="sm"
          p="sm"
          style={{
            background: themedColor('chatBg'),
            borderRadius: 6,
            border: `1px solid ${themedColor('cardBorder')}`,
          }}
        >
          <Text
            size="xs"
            fw={700}
            ff="monospace"
            tt="uppercase"
            mb={6}
            style={{ color: themedColor('warningText'), letterSpacing: '0.08em' }}
          >
            Blocking Questions
          </Text>
          {parsed.blockingQuestions.map((q, i) => (
            <Group key={i} gap={6} align="flex-start" mb={4}>
              <Text size="xs" style={{ color: themedColor('warningText') }}>
                •
              </Text>
              <Text size="xs" style={{ color: themedColor('chatText'), lineHeight: 1.5 }}>
                {q}
              </Text>
            </Group>
          ))}
        </Box>
      )}

      {/* Review link */}
      {parsed.reviewLink && (
        <Box mt="sm">
          <Button
            size="xs"
            radius="xl"
            variant="outline"
            color={badgeColor}
            onClick={() => onNavigate(parsed.reviewLink!)}
          >
            Review Approved PRD
          </Button>
        </Box>
      )}
    </Box>
  );
}

function Avatar({ role, workspaceStatus }: { role: string; workspaceStatus?: string }) {
  const { themedColor: tc } = useTheme();
  const bg =
    role === 'user'
      ? tc('accentPurple')
      : `linear-gradient(135deg, ${tc('accentGreenGradientFrom')} 0%, ${tc('accentGreenGradientTo')} 100%)`;

  return (
    <Box
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tc('avatarText'),
        fontSize: 12,
        fontWeight: role === 'user' ? 600 : 700,
        flexShrink: 0,
      }}
    >
      {role === 'user' ? 'U' : getBotAvatarLetter(workspaceStatus)}
    </Box>
  );
}

export function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
  onQuickReply,
  workspaceStatus,
}: MessageListProps) {
  const botName = getBotName(workspaceStatus);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { contentMaxWidth, themedColor } = useTheme();
  const navigate = useNavigate();

  // Custom link renderer: internal links use React Router, external open in new tab
  const linkRenderer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const { href, children } = props;
      if (href && href.startsWith('/')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              navigate(href);
            }}
            style={{
              color: themedColor('chatAccent'),
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: themedColor('chatAccent') }}
        >
          {children}
        </a>
      );
    },
    [navigate, themedColor],
  );

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
                <Avatar role={msg.role} workspaceStatus={workspaceStatus} />
                <Box flex={1} pt={2}>
                  <Text
                    size="xs"
                    fw={700}
                    mb={4}
                    ff="monospace"
                    tt="uppercase"
                    style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
                  >
                    {msg.role === 'user'
                      ? 'You'
                      : msg.role === 'system'
                        ? 'System'
                        : (msg as any).persona || botName}
                  </Text>
                  {isClassifierMessage(msg.content) ? (
                    (() => {
                      const parsed = parseClassifierMessage(msg.content);
                      return parsed ? (
                        <ClassifierCard parsed={parsed} onNavigate={navigate} />
                      ) : (
                        <Box
                          className="orka-markdown"
                          style={{ fontSize: 14, lineHeight: 1.7, color: themedColor('chatText') }}
                        >
                          <Markdown components={{ a: linkRenderer }}>{msg.content}</Markdown>
                        </Box>
                      );
                    })()
                  ) : (
                    <Box
                      className="orka-markdown"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: themedColor('chatText'),
                      }}
                    >
                      <Markdown components={{ a: linkRenderer }}>{msg.content}</Markdown>
                    </Box>
                  )}

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
              <StreamingMessage content={streamingContent} workspaceStatus={workspaceStatus} />
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
