import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Stack,
  Box,
  Group,
  TextInput,
  Button,
  Text,
  Paper,
  ScrollArea,
  Loader,
  Badge,
  ActionIcon,
  Tooltip,
  Image,
} from '@mantine/core';
import Markdown from 'react-markdown';
import { MessageInput } from '../chat/MessageInput';
import { useTheme } from '../../hooks/useTheme';
import type {
  SelectedElement,
  VisualSession,
  VisualRequirementItem,
} from '../../hooks/useVisualIntake';

// ─── Types ─────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  screenshot?: string | null;
  element?: SelectedElement | null;
  requirement?: VisualRequirementItem | null;
  actions?: Array<{ label: string; action: string }>;
}

type ConversationPhase =
  | 'idle'
  | 'launching'
  | 'browsing'
  | 'inspecting'
  | 'element_captured'
  | 'discussing_change'
  | 'generating'
  | 'requirement_generated'
  | 'ask_more_changes'
  | 'ask_repo'
  | 'repo_submitted'
  | 'done';

interface VisualIntakePanelProps {
  session: VisualSession | null;
  selectedElement: SelectedElement | null;
  inspectMode: boolean;
  browserStatus: 'idle' | 'launching' | 'running' | 'inspecting';
  isStarting: boolean;
  isSubmitting: boolean;
  onStartPreview: (url: string) => void;
  onToggleInspect: (enabled: boolean) => void;
  onSubmitChange: (instruction: string) => Promise<VisualRequirementItem | null>;
  onClose: () => void;
  onAnalyzeRepo?: (repoUrl: string) => void;
  requirements?: VisualRequirementItem[];
}

// ─── Copilot messages ──────────────────────────────────
const WELCOME_MSG = `Hey! I'm your Virtual PM. I'll help you capture UI changes visually.

Paste the URL of the app you want to modify, and I'll open it in a real Chrome window. You can browse around, log in, navigate — and when you're ready, we'll start selecting elements to change.`;

const BROWSER_LAUNCHED_MSG = `Chrome is up and running with your app. Take your time to navigate to the page you want to change.

When you're ready, I'll turn on **Inspect Mode** so you can click on any element. Just say **"ready"** or click the button below.`;

const INSPECT_ACTIVE_MSG = `Inspect mode is active! Go to the Chrome window and **click on any element** you'd like to change. I'll capture it here so we can discuss what to do with it.`;

const ASK_CHANGE_MSG = (el: SelectedElement) => {
  const tag = el.selector.split(' > ').pop() || 'element';
  const text = el.textContent ? `\n> "${el.textContent.substring(0, 150)}"` : '';
  return `I captured this element: \`${tag}\`${text}

What would you like to change about it? Be as specific as you can — styling, text, layout, behavior, anything.`;
};

const GENERATING_MSG = `Let me think about that and turn it into a structured requirement...`;

const REQUIREMENT_DONE_MSG = (req: VisualRequirementItem) =>
  `Here's what I captured:

**${req.title}**

${req.summary}

**Change:** ${req.requestedChange}
**Target:** ${req.targetArea}
**Confidence:** ${Math.round(req.confidence * 100)}%

${(req.acceptanceCriteria || []).length > 0 ? `**Acceptance Criteria:**\n${req.acceptanceCriteria.map((c: string) => `- ${c}`).join('\n')}` : ''}

Would you like to **select another element** to change, or are you done with visual changes?`;

const ASK_REPO_MSG = `Great work! We've captured your UI changes.

One more thing — do you have a **GitHub repository** for this project? If you share the URL, I can analyze the codebase and map your visual requirements to actual source files.

Just paste the repo URL, or say **"skip"** if you'd rather do that later.`;

const REPO_SUBMITTED_MSG = `I've kicked off the repository analysis. This will map your UI requirements to source code files so the engineering team knows exactly where to make changes.

Your visual intake session is looking solid! You can switch to the **Chat** tab to continue refining the PRD, or review the generated requirements in the draft panel.`;

const SKIP_REPO_MSG = `No problem! You can always connect a repository later from the workspace settings.

Your visual requirements are captured and ready. Switch to the **Chat** tab to continue refining the PRD, or review the generated requirements in the draft panel.`;

// ─── Avatar ────────────────────────────────────────────
function Avatar({ role }: { role: string }) {
  const bg = role === 'user' ? '#5436DA' : 'linear-gradient(135deg, #10a37f 0%, #1a7f64 100%)';
  const letter = role === 'user' ? 'U' : 'V';

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
        color: 'white',
        fontSize: 12,
        fontWeight: role === 'user' ? 600 : 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </Box>
  );
}

// ─── Component ─────────────────────────────────────────
export function VisualIntakePanel({
  session,
  selectedElement,
  inspectMode,
  browserStatus,
  isStarting,
  isSubmitting,
  onStartPreview,
  onToggleInspect,
  onSubmitChange,
  onClose,
  onAnalyzeRepo,
  requirements = [],
}: VisualIntakePanelProps) {
  const [url, setUrl] = useState('http://localhost:3001');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME_MSG },
  ]);
  const [phase, setPhase] = useState<ConversationPhase>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevElementRef = useRef<string | null>(null);
  const { themedColor, contentMaxWidth } = useTheme();

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking]);

  // Add a bot message helper
  const addBotMessage = useCallback((content: string, extras?: Partial<ChatMessage>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        ...extras,
      },
    ]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content }]);
  }, []);

  // Phase: browser launched
  useEffect(() => {
    if (session && phase === 'launching') {
      setPhase('browsing');
      addBotMessage(BROWSER_LAUNCHED_MSG, {
        actions: [{ label: 'Ready to inspect', action: 'start_inspect' }],
      });
    }
  }, [session, phase, addBotMessage]);

  // Phase: element captured
  useEffect(() => {
    if (selectedElement && selectedElement.id !== prevElementRef.current) {
      prevElementRef.current = selectedElement.id;
      setPhase('element_captured');

      // Disable inspect mode after capture
      onToggleInspect(false);

      addBotMessage(ASK_CHANGE_MSG(selectedElement), {
        screenshot: selectedElement.elementScreenshot,
        element: selectedElement,
      });
    }
  }, [selectedElement, addBotMessage, onToggleInspect]);

  // Handle user input based on current phase
  const handleSend = useCallback(
    async (text: string) => {
      addUserMessage(text);
      const lower = text.toLowerCase().trim();

      switch (phase) {
        case 'idle': {
          // User provided a URL
          const urlInput = text.startsWith('http') ? text : url;
          setPhase('launching');
          onStartPreview(urlInput);
          break;
        }

        case 'browsing': {
          // User says "ready" or similar
          if (
            lower.includes('ready') ||
            lower.includes('inspect') ||
            lower.includes('start') ||
            lower.includes('go') ||
            lower.includes('yes')
          ) {
            setPhase('inspecting');
            onToggleInspect(true);
            addBotMessage(INSPECT_ACTIVE_MSG);
          } else {
            addBotMessage(
              `Take your time browsing. When you're ready to start selecting elements, just say **"ready"**.`,
            );
          }
          break;
        }

        case 'inspecting': {
          addBotMessage(
            `I'm waiting for you to click an element in the Chrome window. Go ahead and click on what you'd like to change!`,
          );
          break;
        }

        case 'element_captured':
        case 'discussing_change': {
          // User describes the change they want
          setPhase('generating');
          setIsThinking(true);
          addBotMessage(GENERATING_MSG);

          try {
            const req = await onSubmitChange(text);
            setIsThinking(false);
            if (req) {
              setPhase('requirement_generated');
              addBotMessage(REQUIREMENT_DONE_MSG(req), {
                requirement: req,
                actions: [
                  { label: 'Select another element', action: 'more_changes' },
                  { label: 'Done with visual changes', action: 'done_visual' },
                ],
              });
            } else {
              setPhase('element_captured');
              addBotMessage(
                `Hmm, I had trouble generating that requirement. Could you try describing the change differently?`,
              );
            }
          } catch {
            setIsThinking(false);
            setPhase('element_captured');
            addBotMessage(
              `Something went wrong generating the requirement. Let's try again — what would you like to change?`,
            );
          }
          break;
        }

        case 'requirement_generated':
        case 'ask_more_changes': {
          if (
            lower.includes('another') ||
            lower.includes('more') ||
            lower.includes('select') ||
            lower.includes('yes') ||
            lower.includes('next')
          ) {
            setPhase('inspecting');
            onToggleInspect(true);
            addBotMessage(INSPECT_ACTIVE_MSG);
          } else if (
            lower.includes('done') ||
            lower.includes('no') ||
            lower.includes('finish') ||
            lower.includes('stop')
          ) {
            setPhase('ask_repo');
            addBotMessage(ASK_REPO_MSG);
          } else {
            addBotMessage(
              `Would you like to **select another element** to change, or are you **done** with visual changes?`,
              {
                actions: [
                  { label: 'Select another element', action: 'more_changes' },
                  { label: 'Done with visual changes', action: 'done_visual' },
                ],
              },
            );
          }
          break;
        }

        case 'ask_repo': {
          if (lower === 'skip' || lower.includes('later') || lower.includes('no')) {
            setPhase('done');
            addBotMessage(SKIP_REPO_MSG);
          } else if (
            text.includes('github.com') ||
            text.includes('gitlab.com') ||
            text.includes('.git')
          ) {
            setPhase('repo_submitted');
            addBotMessage(REPO_SUBMITTED_MSG);
            onAnalyzeRepo?.(text.trim());
          } else {
            addBotMessage(
              `That doesn't look like a repository URL. Please paste a GitHub URL (e.g., \`https://github.com/org/repo\`) or say **"skip"**.`,
            );
          }
          break;
        }

        case 'done':
        case 'repo_submitted': {
          addBotMessage(
            `Your visual intake is complete! Switch to the **Chat** tab if you want to keep refining the PRD, or review the requirements in the draft panel.`,
          );
          break;
        }

        default:
          break;
      }
    },
    [
      phase,
      url,
      addUserMessage,
      addBotMessage,
      onStartPreview,
      onToggleInspect,
      onSubmitChange,
      onAnalyzeRepo,
    ],
  );

  // Handle action button clicks
  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'start_inspect':
          handleSend('Ready to inspect');
          break;
        case 'more_changes':
          handleSend('Select another element');
          break;
        case 'done_visual':
          handleSend('Done with visual changes');
          break;
        default:
          break;
      }
    },
    [handleSend],
  );

  // ─── Render ────────────────────────────────────────────
  return (
    <Stack h="100%" gap={0}>
      {/* Minimal status bar */}
      {session && (
        <Group
          px="md"
          py={6}
          justify="space-between"
          style={{ borderBottom: `1px solid ${themedColor('borderColor')}`, flexShrink: 0 }}
        >
          <Group gap="sm">
            <Badge
              size="sm"
              variant="dot"
              color={
                browserStatus === 'inspecting'
                  ? 'teal'
                  : browserStatus === 'running'
                    ? 'blue'
                    : 'gray'
              }
            >
              {browserStatus === 'inspecting'
                ? 'Inspecting'
                : browserStatus === 'running'
                  ? 'Chrome Open'
                  : browserStatus === 'launching'
                    ? 'Launching...'
                    : 'Idle'}
            </Badge>
            <Text size="xs" c="dimmed" truncate style={{ maxWidth: 300 }}>
              {session.url}
            </Text>
            {requirements.length > 0 && (
              <Badge size="xs" variant="light" color="teal">
                {requirements.length} requirement{requirements.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </Group>
          <Tooltip label="Close browser">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {/* Chat messages */}
      <Box flex={1} style={{ overflow: 'hidden', minHeight: 0 }}>
        <ScrollArea h="100%" scrollbarSize={8} type="always">
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
                      {msg.role === 'user' ? 'You' : 'Virtual PM'}
                    </Text>

                    {/* Screenshot inline */}
                    {msg.screenshot && (
                      <Box mb="sm">
                        <Image
                          src={`data:image/png;base64,${msg.screenshot}`}
                          alt="Captured element"
                          radius="sm"
                          mah={200}
                          fit="contain"
                          style={{ border: '1px solid var(--mantine-color-gray-3)' }}
                        />
                      </Box>
                    )}

                    {/* Element metadata badge */}
                    {msg.element && (
                      <Group gap="xs" mb="xs">
                        <Badge size="sm" variant="outline" color="teal">
                          {msg.element.selector.split(' > ').pop()}
                        </Badge>
                        {msg.element.ariaRole && (
                          <Badge size="sm" variant="light" color="gray">
                            role={msg.element.ariaRole}
                          </Badge>
                        )}
                      </Group>
                    )}

                    {/* Message content */}
                    <Box className="orka-markdown" style={{ fontSize: 14, lineHeight: 1.7 }}>
                      <Markdown>{msg.content}</Markdown>
                    </Box>

                    {/* Action buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <Group gap="xs" mt="sm" wrap="wrap">
                        {msg.actions.map((action, i) => (
                          <Button
                            key={i}
                            size="xs"
                            radius="xl"
                            variant="outline"
                            color="teal"
                            onClick={() => handleAction(action.action)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </Group>
                    )}
                  </Box>
                </Group>
              </Box>
            ))}

            {/* Thinking indicator */}
            {(isThinking || isSubmitting) && (
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

            <div ref={bottomRef} />
          </Stack>
        </ScrollArea>
      </Box>

      {/* Input bar */}
      <Box px="md" pb="md" pt="xs">
        <Box maw={contentMaxWidth} mx="auto" w="100%">
          {/* URL input for idle phase */}
          {phase === 'idle' && !session ? (
            <Paper radius="xl" p={4} style={{ background: themedColor('inputBg'), border: 'none' }}>
              <Group gap={0} align="flex-end" wrap="nowrap" px="sm" py={6}>
                <TextInput
                  flex={1}
                  placeholder="Paste your app URL (e.g., https://your-app.example.com)"
                  value={url}
                  onChange={(e) => setUrl(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSend(url);
                    }
                  }}
                  variant="unstyled"
                  styles={{
                    input: { fontSize: '0.95rem', padding: '8px 12px' },
                  }}
                />
                <Box pb={4}>
                  <Button
                    size="xs"
                    radius="xl"
                    color="teal"
                    onClick={() => handleSend(url)}
                    loading={isStarting}
                  >
                    Open Browser
                  </Button>
                </Box>
              </Group>
            </Paper>
          ) : (
            <Paper radius="xl" p={4} style={{ background: themedColor('inputBg'), border: 'none' }}>
              <MessageInput
                onSend={handleSend}
                disabled={isThinking || isSubmitting || phase === 'generating'}
                placeholder={
                  phase === 'inspecting'
                    ? 'Click an element in Chrome first...'
                    : phase === 'element_captured'
                      ? 'Describe what you want to change...'
                      : phase === 'ask_repo'
                        ? 'Paste a GitHub repo URL or type "skip"...'
                        : 'Message Virtual PM...'
                }
              />
            </Paper>
          )}

          <Text size="xs" c="dimmed" ta="center" mt={8}>
            Virtual PM can make mistakes. Review the generated requirements carefully.
          </Text>
        </Box>
      </Box>
    </Stack>
  );
}
