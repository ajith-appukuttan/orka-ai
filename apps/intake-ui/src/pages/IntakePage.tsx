import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Stack,
  Box,
  Group,
  ScrollArea,
  Text,
  ActionIcon,
  Button,
  Tooltip,
  SegmentedControl,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useMutation, gql } from '@apollo/client';
import { ChatPanel } from '../components/chat/ChatPanel';
import { DraftSidePanel } from '../components/draft/DraftSidePanel';
import { MemoryPanel } from '../components/draft/MemoryPanel';
import { ReadinessIndicator } from '../components/draft/ReadinessIndicator';
import { WelcomeScreen } from '../components/chat/WelcomeScreen';
import { VisualIntakePanel } from '../components/visual/VisualIntakePanel';
import { VisualRequirementsList } from '../components/visual/VisualRequirementsList';
import { Sidebar } from '../components/layout/Sidebar';
import { ResizeHandle } from '../components/layout/ResizeHandle';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useExtensionBridge } from '../hooks/useExtensionBridge';
import { useChat } from '../hooks/useChat';
import { useDraft } from '../hooks/useDraft';
import { useMemory } from '../hooks/useMemory';
import { useSearch } from '../hooks/useSearch';
import { useVisualIntake } from '../hooks/useVisualIntake';
import { useTheme } from '../hooks/useTheme';

const ANALYZE_REPO = gql`
  mutation AnalyzeRepo($workspaceId: ID!, $repoUrl: String!, $branch: String) {
    analyzeRepository(workspaceId: $workspaceId, repoUrl: $repoUrl, branch: $branch) {
      id
      repoUrl
      status
      readmeSummary
      techStack
      keyComponents
    }
  }
`;

type IntakeMode = 'chat' | 'visual';

const MIN_PANEL_WIDTH = 280;
const SIDEBAR_WIDTH = 320;
const TENANT_ID = 'default'; // TODO: from auth context

export function IntakePage() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>();
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('chat');
  const [pendingVisualUrl, setPendingVisualUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [prdWidthPct, setPrdWidthPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { themedColor } = useTheme();

  const {
    workspaces,
    loading: wsLoading,
    refetch: refetchWorkspaces,
    createWorkspace,
    startSession,
  } = useWorkspaces(TENANT_ID);
  const { messages, send, logMessage, isSending, isStreaming, streamingContent } =
    useChat(activeSessionId);
  const { draft, readinessScore } = useDraft(activeSessionId, activeWorkspaceId);
  const { items: memoryItems, archive: archiveMemory } = useMemory(activeWorkspaceId);
  const [analyzeRepoMutation] = useMutation(ANALYZE_REPO);
  const { results: searchResults, loading: searchLoading, search } = useSearch(TENANT_ID);
  const visual = useVisualIntake(activeWorkspaceId);
  const extension = useExtensionBridge();

  // Derive active workspace status and classification for pipeline stepper
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceStatus = activeWorkspace?.status;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeClassification = (activeWorkspace as any)?.latestClassification as
    | { classification: string }
    | null
    | undefined;

  // Analyze repo from visual intake
  const handleAnalyzeRepo = useCallback(
    async (repoUrl: string) => {
      if (!activeWorkspaceId) return;
      try {
        console.info('[IntakePage] Analyzing repo:', repoUrl);
        await analyzeRepoMutation({
          variables: { workspaceId: activeWorkspaceId, repoUrl },
        });
        console.info('[IntakePage] Repo analysis complete');
      } catch (err) {
        console.error('[IntakePage] Repo analysis failed:', err);
      }
    },
    [activeWorkspaceId, analyzeRepoMutation],
  );

  // Handle "Done with visual changes" — switch to chat and prompt for repo
  const handleDoneVisual = useCallback(() => {
    setIntakeMode('chat');
    if (activeSessionId) {
      // Send a system message summarizing visual requirements
      const reqCount = visual.requirements.length;
      logMessage(
        `[Visual Intake Complete] Captured ${reqCount} UI requirement${reqCount !== 1 ? 's' : ''} from visual inspection. You can now continue refining the PRD via chat.\n\nDo you have a **GitHub repository** for this project? Share the URL and I'll analyze the codebase to map your requirements to source files.`,
        'assistant',
        activeSessionId,
      );
    }
  }, [activeSessionId, visual.requirements.length, logMessage]);

  // When workspace ID becomes available and there's a pending visual URL, start the preview
  useEffect(() => {
    if (pendingVisualUrl && activeWorkspaceId && !visual.session) {
      visual.startPreview(pendingVisualUrl);
      setPendingVisualUrl(null);
    }
  }, [pendingVisualUrl, activeWorkspaceId, visual]);

  // Track visual inspections in chat — when an element is inspected
  const lastInspectedRef = useRef(visual.lastInspectedElement);
  useEffect(() => {
    // Only fire when lastInspectedElement actually changes (new selection)
    if (
      visual.lastInspectedElement &&
      visual.lastInspectedElement !== lastInspectedRef.current &&
      activeSessionId
    ) {
      lastInspectedRef.current = visual.lastInspectedElement;
      const el = visual.lastInspectedElement;
      const tag = el.selector.split(' > ').pop() || 'element';
      const text = el.textContent ? `\nText: "${el.textContent.substring(0, 100)}"` : '';
      logMessage(
        `[Visual Inspect] Selected element: \`${tag}\`${text}\nPage: ${el.pageUrl}`,
        'system',
        activeSessionId,
      );
    }
  }, [visual.lastInspectedElement, activeSessionId, logMessage]);

  // Track visual requirements in chat — when a requirement is generated
  const lastReqRef = useRef(visual.lastGeneratedRequirement);
  useEffect(() => {
    if (
      visual.lastGeneratedRequirement &&
      visual.lastGeneratedRequirement !== lastReqRef.current &&
      activeSessionId
    ) {
      lastReqRef.current = visual.lastGeneratedRequirement;
      const { requirement } = visual.lastGeneratedRequirement;
      logMessage(
        `[Visual Requirement] "${requirement.title}"\n\nChange: ${requirement.requestedChange}\n\nAcceptance Criteria:\n${(requirement.acceptanceCriteria || []).map((c: string) => `• ${c}`).join('\n')}\n\nConfidence: ${Math.round(requirement.confidence * 100)}%`,
        'assistant',
        activeSessionId,
      );
      visual.clearLastEvents();
    }
  }, [visual.lastGeneratedRequirement, activeSessionId, logMessage, visual]);

  // Track elements from the browser extension
  useEffect(() => {
    if (extension.lastElement && activeSessionId) {
      const el = extension.lastElement;
      const tag =
        el.tagName +
        (el.id ? '#' + el.id : '') +
        (el.className ? '.' + el.className.split(' ')[0] : '');
      const text = el.textContent ? `\nText: "${el.textContent.substring(0, 120)}"` : '';

      logMessage(
        `[Visual Inspect] Selected: \`${tag}\`${text}\nPage: ${el.pageTitle || el.pageUrl}`,
        'system',
        activeSessionId,
      );

      // Also set as the visual selected element so the user can describe a change
      visual.setSelectedElement({
        id: crypto.randomUUID(),
        selector: el.selector,
        domPath: el.domPath,
        textContent: el.textContent,
        boundingBox: el.boundingBox,
        ariaRole: el.ariaRole,
        elementScreenshot: el.screenshot,
        pageUrl: el.pageUrl,
      });

      // Switch to visual mode if not already
      if (intakeMode !== 'visual') {
        setIntakeMode('visual');
      }

      extension.clearLastElement();
    }
  }, [extension.lastElement]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create workspace + session + send initial prompt
  const handleStart = useCallback(
    async (prompt: string, method?: 'chat' | 'visual' | 'repo' | 'screenshot') => {
      const selectedMethod = method || 'chat';

      // Create workspace titled from prompt
      const wsTitle = prompt.length > 60 ? prompt.substring(0, 57) + '...' : prompt || 'New Intake';
      const ws = await createWorkspace(wsTitle);
      if (!ws?.id) return;

      setActiveWorkspaceId(ws.id);

      // Start a session in the workspace
      const session = await startSession(ws.id, 'Initial Session');
      if (!session?.id) return;

      setActiveSessionId(session.id);

      if (selectedMethod === 'visual') {
        // Switch to visual mode — defer preview start until workspace ID propagates
        setIntakeMode('visual');
        setPendingVisualUrl(prompt);
      } else if (selectedMethod === 'screenshot') {
        // Screenshot mode — send description as first message with screenshot context
        setIntakeMode('chat');
        send(
          `I have uploaded a screenshot of an existing UI. Here is what I want to change: ${prompt}`,
          session.id,
        );
      } else if (selectedMethod === 'repo') {
        // Send repo URL as first message with context
        setIntakeMode('chat');
        send(
          `I want to enhance an existing application. Here is the repository: ${prompt}`,
          session.id,
        );
      } else {
        // Chat mode — send as first message
        setIntakeMode('chat');
        if (prompt) {
          send(prompt, session.id);
        }
      }
    },
    [createWorkspace, startSession, send, visual],
  );

  // Select an existing session from sidebar
  const handleSelectSession = useCallback((workspaceId: string, sessionId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveSessionId(sessionId);
  }, []);

  // Clear current session (go back to welcome screen)
  const handleClearSession = useCallback(() => {
    setActiveWorkspaceId(undefined);
    setActiveSessionId(undefined);
  }, []);

  // Create new workspace from sidebar
  const handleNewWorkspace = useCallback(async () => {
    handleClearSession();
  }, [handleClearSession]);

  // Create new session in existing workspace
  const handleNewSession = useCallback(
    async (workspaceId: string) => {
      const session = await startSession(workspaceId, 'New Session');
      if (session?.id) {
        setActiveWorkspaceId(workspaceId);
        setActiveSessionId(session.id);
      }
    },
    [startSession],
  );

  // Archive a workspace (remove from sidebar)
  const handleArchiveWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation { archiveIntakeWorkspace(workspaceId: "${workspaceId}") { id status } }`,
          }),
        });
        if (workspaceId === activeWorkspaceId) {
          handleClearSession();
        }
        refetchWorkspaces();
      } catch (err) {
        console.error('Failed to archive workspace:', err);
      }
    },
    [activeWorkspaceId, handleClearSession, refetchWorkspaces],
  );

  // Archive a session (remove from sidebar)
  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation { archiveIntakeSession(sessionId: "${sessionId}") { id status } }`,
          }),
        });
        // If we archived the active session, clear it
        if (sessionId === activeSessionId) {
          handleClearSession();
        }
        // Refresh workspace list to remove archived session
        refetchWorkspaces();
      } catch (err) {
        console.error('Failed to archive session:', err);
      }
    },
    [activeSessionId, handleClearSession, refetchWorkspaces],
  );

  const handleReview = useCallback(() => {
    if (activeSessionId) {
      navigate(`/review/${activeWorkspaceId}/${activeSessionId}`);
    }
  }, [activeSessionId, navigate]);

  const handleResize = useCallback((deltaX: number) => {
    if (!containerRef.current) return;
    const totalWidth = containerRef.current.offsetWidth;
    const deltaPct = (deltaX / totalWidth) * 100;
    setPrdWidthPct((prev) => {
      const next = prev - deltaPct;
      const minPct = (MIN_PANEL_WIDTH / totalWidth) * 100;
      const maxPct = 100 - minPct;
      return Math.max(minPct, Math.min(maxPct, next));
    });
  }, []);

  const chatWidthPct = 100 - prdWidthPct;

  return (
    <Group h="100vh" gap={0} align="stretch" wrap="nowrap">
      {/* Sidebar — collapsible, distinct background */}
      <Box
        style={{
          width: sidebarOpen ? SIDEBAR_WIDTH : 44,
          flexShrink: 0,
          borderRight: `1px solid ${themedColor('borderColor')}`,
          background: themedColor('sidebarBg'),
          overflow: 'hidden',
          transition: 'width 200ms ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {sidebarOpen ? (
          <>
            <Sidebar
              workspaces={workspaces}
              loading={wsLoading}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              onSelectSession={handleSelectSession}
              onNewWorkspace={handleNewWorkspace}
              onNewSession={handleNewSession}
              onClearSession={handleClearSession}
              onArchiveSession={handleArchiveSession}
              onArchiveWorkspace={handleArchiveWorkspace}
              searchResults={searchResults}
              searchLoading={searchLoading}
              onSearch={search}
            />
            {/* Collapse button at bottom */}
            <Box
              px="sm"
              py="xs"
              style={{ borderTop: `1px solid ${themedColor('borderColor')}`, flexShrink: 0 }}
            >
              <Tooltip label="Collapse sidebar" position="right">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setSidebarOpen(false)}
                  w="100%"
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
                    <polyline points="11 17 6 12 11 7" />
                    <polyline points="18 17 13 12 18 7" />
                  </svg>
                </ActionIcon>
              </Tooltip>
            </Box>
          </>
        ) : (
          /* Collapsed state */
          <Stack h="100%" align="center" justify="space-between" py="sm">
            <Stack align="center" gap="sm">
              <Tooltip label="Expand sidebar" position="right">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setSidebarOpen(true)}
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
                    <polyline points="13 17 18 12 13 7" />
                    <polyline points="6 17 11 12 6 7" />
                  </svg>
                </ActionIcon>
              </Tooltip>
              {activeSessionId && (
                <Tooltip label="Close chat" position="right">
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={handleClearSession}>
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
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </ActionIcon>
                </Tooltip>
              )}
            </Stack>
            <Tooltip label="New workspace" position="right">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={handleNewWorkspace}>
                +
              </ActionIcon>
            </Tooltip>
          </Stack>
        )}
      </Box>

      {/* Main content area — distinct from sidebar */}
      <Box flex={1} style={{ overflow: 'hidden', background: themedColor('chatBg') }}>
        {!activeSessionId ? (
          <WelcomeScreen onStart={handleStart} isLoading={false} />
        ) : (
          <Stack h="100%" gap={0}>
            {/* Session bar with mode toggle and close button */}
            <Group
              px="md"
              py={6}
              justify="space-between"
              style={{ borderBottom: `1px solid ${themedColor('borderColor')}`, flexShrink: 0 }}
            >
              <Group gap="md">
                <Group gap={6}>
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: themedColor('accentGreen'),
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" fw={600} truncate style={{ maxWidth: 200 }}>
                    {workspaces.find((w) => w.id === activeWorkspaceId)?.title ?? 'Session'}
                  </Text>
                  <Tooltip label={`Session ID: ${activeSessionId}\nClick to copy`} multiline>
                    <Text
                      size="xs"
                      ff="monospace"
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: themedColor('textDimmed'),
                      }}
                      onClick={() => {
                        if (activeSessionId) {
                          navigator.clipboard.writeText(activeSessionId);
                        }
                      }}
                    >
                      #{activeSessionId?.substring(0, 8)}
                    </Text>
                  </Tooltip>
                </Group>
                <SegmentedControl
                  size="xs"
                  value={intakeMode}
                  onChange={(v) => setIntakeMode(v as IntakeMode)}
                  data={[
                    { label: 'Chat', value: 'chat' },
                    { label: 'Visual', value: 'visual' },
                  ]}
                />
              </Group>
              <Button
                size="xs"
                radius="xl"
                variant="subtle"
                color="gray"
                onClick={handleClearSession}
                leftSection={
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
                }
              >
                Close
              </Button>
            </Group>

            {(!workspaceStatus || workspaceStatus === 'ACTIVE') && (
              <ReadinessIndicator
                score={readinessScore}
                readyForReview={readinessScore >= 0.8}
                onReview={handleReview}
                hasVisualRequirements={visual.requirements.length > 0}
              />
            )}

            <Group
              ref={containerRef}
              flex={1}
              gap={0}
              align="stretch"
              wrap="nowrap"
              style={{ overflow: 'hidden' }}
            >
              {/* Chat panel — hidden when in visual mode */}
              <Box
                flex={intakeMode === 'chat' ? 1 : undefined}
                style={{
                  overflow: 'hidden',
                  display: intakeMode === 'chat' ? undefined : 'none',
                }}
              >
                <ChatPanel
                  messages={messages}
                  onSendMessage={send}
                  isLoading={isSending}
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  readinessScore={readinessScore}
                  workspaceStatus={workspaceStatus}
                  classification={activeClassification?.classification}
                />
              </Box>

              {/* Visual panel — hidden when in chat mode, keeps state alive */}
              <Box
                flex={intakeMode === 'visual' ? 1 : undefined}
                style={{
                  overflow: 'hidden',
                  display: intakeMode === 'visual' ? undefined : 'none',
                }}
              >
                <VisualIntakePanel
                  session={visual.session}
                  selectedElement={visual.selectedElement}
                  inspectMode={visual.inspectMode}
                  browserStatus={visual.browserStatus}
                  isStarting={visual.isStarting}
                  isSubmitting={visual.isSubmitting}
                  onStartPreview={visual.startPreview}
                  onToggleInspect={visual.toggleInspect}
                  onSubmitChange={visual.submitChange}
                  onClose={visual.closePreview}
                  onAnalyzeRepo={handleAnalyzeRepo}
                  onDoneVisual={handleDoneVisual}
                  requirements={visual.requirements}
                />
              </Box>
            </Group>
          </Stack>
        )}
      </Box>
    </Group>
  );
}
