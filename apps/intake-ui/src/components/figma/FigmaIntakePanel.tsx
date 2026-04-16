import { useState, useCallback } from 'react';
import {
  Stack,
  Box,
  Group,
  Text,
  TextInput,
  Button,
  Card,
  Checkbox,
  Badge,
  Loader,
  SimpleGrid,
  Paper,
} from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';
import type {
  FigmaSession,
  FigmaFrame,
  FigmaComponent,
  FigmaRequirement,
  FigmaRepoMapping,
} from '../../hooks/useFigmaIntake';

// ─── Types ─────────────────────────────────────────────
interface FigmaIntakePanelProps {
  workspaceId: string;
  session: FigmaSession | null;
  isLoading: boolean;
  isExtracting: boolean;
  onStartIntake: (figmaUrl: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  onRunRepoDiscovery: () => void;
  onGenerateRequirements: () => void;
  onGeneratePRD: () => void;
  requirements: FigmaRequirement[];
  repoMappings: FigmaRepoMapping[];
}

// ─── Helpers ───────────────────────────────────────────
function isValidFigmaUrl(url: string): boolean {
  return /^https:\/\/(www\.)?figma\.com\/(file|design)\//.test(url.trim());
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'teal';
  if (confidence >= 0.5) return 'yellow';
  return 'red';
}

// ─── Sub-components ────────────────────────────────────

function UrlInputStage({
  isLoading,
  onStartIntake,
}: {
  isLoading: boolean;
  onStartIntake: (url: string) => void;
}) {
  const [figmaUrl, setFigmaUrl] = useState('');
  const { themedColor } = useTheme();

  const handleSubmit = useCallback(() => {
    const trimmed = figmaUrl.trim();
    if (trimmed && isValidFigmaUrl(trimmed)) {
      onStartIntake(trimmed);
    }
  }, [figmaUrl, onStartIntake]);

  return (
    <Paper
      p="lg"
      radius="md"
      style={{
        background: themedColor('cardBg'),
        border: `1px solid ${themedColor('cardBorder')}`,
      }}
    >
      <Stack gap="md">
        <Text
          size="sm"
          fw={700}
          ff="monospace"
          tt="uppercase"
          style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
        >
          Import from Figma
        </Text>
        <Text size="sm" style={{ color: themedColor('textDimmed') }}>
          Paste a Figma file or frame URL to extract design context, components, and generate
          requirements automatically.
        </Text>
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <TextInput
            flex={1}
            placeholder="https://www.figma.com/design/AbC123/My-Design"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            error={
              figmaUrl.trim() && !isValidFigmaUrl(figmaUrl) ? 'Enter a valid Figma URL' : undefined
            }
            styles={{
              input: {
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                background: themedColor('inputBg'),
                borderColor: themedColor('borderColor'),
                color: themedColor('chatText'),
              },
            }}
          />
          <Button
            color="teal"
            loading={isLoading}
            disabled={!figmaUrl.trim() || !isValidFigmaUrl(figmaUrl)}
            onClick={handleSubmit}
          >
            Load Design
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function ExtractionProgress({ session }: { session: FigmaSession }) {
  const { themedColor } = useTheme();

  return (
    <Paper
      p="lg"
      radius="md"
      style={{
        background: themedColor('cardBg'),
        border: `1px solid ${themedColor('cardBorder')}`,
      }}
    >
      <Group gap="md" align="center">
        <Loader size="sm" color="teal" />
        <Stack gap={4}>
          <Text size="sm" fw={600} style={{ color: themedColor('prdText') }}>
            Extracting design data...
          </Text>
          <Text size="xs" style={{ color: themedColor('textDimmed') }}>
            {session.fileName || 'Processing Figma file'}
          </Text>
        </Stack>
      </Group>
      {session.errorMessage && (
        <Text size="xs" mt="sm" style={{ color: 'var(--mantine-color-red-6)' }}>
          {session.errorMessage}
        </Text>
      )}
    </Paper>
  );
}

function DesignSummary({ session }: { session: FigmaSession }) {
  const { themedColor } = useTheme();

  return (
    <Paper
      p="lg"
      radius="md"
      style={{
        background: themedColor('cardBg'),
        border: `1px solid ${themedColor('cardBorder')}`,
      }}
    >
      <Group justify="space-between" align="flex-start" mb="sm">
        <Stack gap={4}>
          <Text
            size="sm"
            fw={700}
            ff="monospace"
            tt="uppercase"
            style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
          >
            {session.fileName}
          </Text>
          <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
            {session.figmaFileKey}
          </Text>
        </Stack>
        <Badge variant="dot" color={session.status === 'extracted' ? 'teal' : 'yellow'} size="sm">
          {session.status}
        </Badge>
      </Group>
      <Group gap="lg">
        <Group gap={6}>
          <Text size="xs" fw={600} style={{ color: themedColor('textDimmed') }}>
            Frames
          </Text>
          <Badge size="sm" variant="light" color="teal">
            {session.frames.length}
          </Badge>
        </Group>
        <Group gap={6}>
          <Text size="xs" fw={600} style={{ color: themedColor('textDimmed') }}>
            Components
          </Text>
          <Badge size="sm" variant="light" color="violet">
            {session.components.length}
          </Badge>
        </Group>
        <Group gap={6}>
          <Text size="xs" fw={600} style={{ color: themedColor('textDimmed') }}>
            Selected
          </Text>
          <Badge size="sm" variant="light" color="blue">
            {session.selections.length}
          </Badge>
        </Group>
      </Group>
    </Paper>
  );
}

function FrameSelectionGrid({
  frames,
  selectedNodeIds,
  onToggle,
}: {
  frames: FigmaFrame[];
  selectedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
}) {
  const { themedColor } = useTheme();

  if (frames.length === 0) return null;

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text
          size="sm"
          fw={700}
          ff="monospace"
          tt="uppercase"
          style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
        >
          Select Frames
        </Text>
        <Text size="xs" style={{ color: themedColor('textDimmed') }}>
          {selectedNodeIds.size} of {frames.length} selected
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {frames.map((frame) => {
          const isSelected = selectedNodeIds.has(frame.nodeId);
          return (
            <Card
              key={frame.id}
              padding="sm"
              radius="sm"
              style={{
                cursor: 'pointer',
                background: isSelected ? themedColor('userMsgBg') : themedColor('cardBg'),
                border: `1px solid ${isSelected ? 'var(--mantine-color-teal-6)' : themedColor('cardBorder')}`,
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
              onClick={() => onToggle(frame.nodeId)}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <Checkbox
                  checked={isSelected}
                  onChange={() => onToggle(frame.nodeId)}
                  color="teal"
                  size="sm"
                  styles={{ input: { cursor: 'pointer' } }}
                />
                <Stack gap={4} flex={1} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate style={{ color: themedColor('chatText') }}>
                    {frame.name}
                  </Text>
                  <Group gap="xs">
                    <Badge size="xs" variant="light" color="gray">
                      {frame.width} x {frame.height}
                    </Badge>
                    <Badge size="xs" variant="outline" color="gray">
                      {frame.pageName}
                    </Badge>
                  </Group>
                </Stack>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

function ComponentList({ components }: { components: FigmaComponent[] }) {
  const { themedColor } = useTheme();

  if (components.length === 0) return null;

  return (
    <Stack gap="sm">
      <Text
        size="sm"
        fw={700}
        ff="monospace"
        tt="uppercase"
        style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
      >
        Components ({components.length})
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {components.map((comp) => (
          <Paper
            key={comp.id}
            p="sm"
            radius="sm"
            style={{
              background: themedColor('cardBg'),
              border: `1px solid ${themedColor('cardBorder')}`,
            }}
          >
            <Text size="sm" fw={600} truncate style={{ color: themedColor('chatText') }}>
              {comp.name}
            </Text>
            {comp.componentSetName && (
              <Text size="xs" style={{ color: themedColor('textDimmed') }}>
                Set: {comp.componentSetName}
              </Text>
            )}
            {comp.description && (
              <Text size="xs" mt={4} lineClamp={2} style={{ color: themedColor('textDimmed') }}>
                {comp.description}
              </Text>
            )}
            <Badge size="xs" variant="outline" color="gray" mt={6}>
              {comp.pageName}
            </Badge>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function ActionsBar({
  session,
  selectedCount,
  hasRepoMappings,
  hasRequirements,
  onSelectNodes,
  selectedNodeIds,
  onRunRepoDiscovery,
  onGenerateRequirements,
  onGeneratePRD,
  isSelectingNodes,
  isRunningDiscovery,
  isGeneratingReqs,
  isGeneratingPRD,
}: {
  session: FigmaSession;
  selectedCount: number;
  hasRepoMappings: boolean;
  hasRequirements: boolean;
  onSelectNodes: () => void;
  selectedNodeIds: Set<string>;
  onRunRepoDiscovery: () => void;
  onGenerateRequirements: () => void;
  onGeneratePRD: () => void;
  isSelectingNodes?: boolean;
  isRunningDiscovery?: boolean;
  isGeneratingReqs?: boolean;
  isGeneratingPRD?: boolean;
}) {
  const { themedColor } = useTheme();
  const hasSelections = selectedCount > 0 || session.selections.length > 0;

  return (
    <Paper
      p="md"
      radius="md"
      style={{
        background: themedColor('cardBg'),
        border: `1px solid ${themedColor('cardBorder')}`,
      }}
    >
      <Group gap="sm" wrap="wrap">
        {selectedCount > 0 && (
          <Button
            size="sm"
            color="teal"
            variant="filled"
            loading={isSelectingNodes}
            onClick={onSelectNodes}
          >
            Confirm Selection ({selectedCount})
          </Button>
        )}
        <Button
          size="sm"
          color="violet"
          variant="outline"
          loading={isRunningDiscovery}
          disabled={!hasSelections}
          onClick={onRunRepoDiscovery}
        >
          Run Repo Discovery
        </Button>
        <Button
          size="sm"
          color="blue"
          variant="outline"
          loading={isGeneratingReqs}
          disabled={!hasSelections}
          onClick={onGenerateRequirements}
        >
          Generate Requirements
        </Button>
        <Button
          size="sm"
          color="teal"
          variant="outline"
          loading={isGeneratingPRD}
          disabled={!hasRequirements}
          onClick={onGeneratePRD}
        >
          Generate PRD
        </Button>
      </Group>
    </Paper>
  );
}

function RepoMappingsSection({ mappings }: { mappings: FigmaRepoMapping[] }) {
  const { themedColor } = useTheme();

  if (mappings.length === 0) return null;

  return (
    <Stack gap="sm">
      <Text
        size="sm"
        fw={700}
        ff="monospace"
        tt="uppercase"
        style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
      >
        Repo Mappings ({mappings.length})
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {mappings.map((mapping) => (
          <Paper
            key={mapping.id}
            p="sm"
            radius="sm"
            style={{
              background: themedColor('cardBg'),
              border: `1px solid ${themedColor('cardBorder')}`,
            }}
          >
            <Group justify="space-between" align="flex-start" mb={4}>
              <Text size="sm" fw={600} style={{ color: themedColor('chatText') }}>
                {mapping.figmaComponentName}
              </Text>
              <Badge size="xs" color={confidenceColor(mapping.confidence)}>
                {Math.round(mapping.confidence * 100)}%
              </Badge>
            </Group>
            <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
              {mapping.filePath}
            </Text>
            {mapping.symbolName && (
              <Text size="xs" ff="monospace" mt={2} style={{ color: themedColor('textDimmed') }}>
                {mapping.symbolName}
              </Text>
            )}
            <Text
              size="xs"
              mt={4}
              style={{ color: themedColor('textDimmed'), fontStyle: 'italic' }}
            >
              {mapping.matchReason}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function RequirementsSection({ requirements }: { requirements: FigmaRequirement[] }) {
  const { themedColor } = useTheme();

  if (requirements.length === 0) return null;

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text
          size="sm"
          fw={700}
          ff="monospace"
          tt="uppercase"
          style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
        >
          Requirements
        </Text>
        <Badge size="sm" variant="light" color="teal">
          {requirements.length}
        </Badge>
      </Group>
      <Stack gap="sm">
        {requirements.map((req) => (
          <Card
            key={req.id}
            padding="md"
            radius="sm"
            style={{
              background: themedColor('cardBg'),
              border: `1px solid ${themedColor('cardBorder')}`,
            }}
          >
            <Group justify="space-between" align="flex-start" mb="xs">
              <Text size="sm" fw={700} style={{ color: themedColor('chatText') }}>
                {req.title}
              </Text>
              <Group gap={6}>
                <Badge size="xs" variant="light" color={confidenceColor(req.confidence)}>
                  {Math.round(req.confidence * 100)}%
                </Badge>
                <Badge size="xs" variant="outline" color="gray">
                  {req.requirementType}
                </Badge>
                <Badge
                  size="xs"
                  variant="dot"
                  color={
                    req.status === 'approved' ? 'teal' : req.status === 'draft' ? 'yellow' : 'gray'
                  }
                >
                  {req.status}
                </Badge>
              </Group>
            </Group>

            <Text size="sm" mb="sm" style={{ color: themedColor('textDimmed'), lineHeight: 1.6 }}>
              {req.summary}
            </Text>

            {req.acceptanceCriteria.length > 0 && (
              <Box mb="sm">
                <Text size="xs" fw={600} mb={4} style={{ color: themedColor('prdText') }}>
                  Acceptance Criteria
                </Text>
                <Stack gap={2}>
                  {req.acceptanceCriteria.map((ac, i) => (
                    <Text key={i} size="xs" style={{ color: themedColor('textDimmed') }}>
                      - {ac}
                    </Text>
                  ))}
                </Stack>
              </Box>
            )}

            {req.codeTargetHints.length > 0 && (
              <Box mb="sm">
                <Text size="xs" fw={600} mb={4} style={{ color: themedColor('prdText') }}>
                  Code Hints
                </Text>
                <Group gap={4} wrap="wrap">
                  {req.codeTargetHints.map((hint, i) => (
                    <Badge key={i} size="xs" variant="light" color="violet" ff="monospace">
                      {hint}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            {req.openQuestions.length > 0 && (
              <Box>
                <Text size="xs" fw={600} mb={4} style={{ color: themedColor('prdText') }}>
                  Open Questions
                </Text>
                <Stack gap={2}>
                  {req.openQuestions.map((q, i) => (
                    <Text key={i} size="xs" style={{ color: 'var(--mantine-color-yellow-6)' }}>
                      ? {q}
                    </Text>
                  ))}
                </Stack>
              </Box>
            )}
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

// ─── Main Component ────────────────────────────────────
export function FigmaIntakePanel({
  workspaceId,
  session,
  isLoading,
  isExtracting,
  onStartIntake,
  onSelectNodes,
  onRunRepoDiscovery,
  onGenerateRequirements,
  onGeneratePRD,
  requirements,
  repoMappings,
}: FigmaIntakePanelProps) {
  const { themedColor, contentMaxWidth } = useTheme();
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  const handleToggleNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleConfirmSelection = useCallback(() => {
    onSelectNodes(Array.from(selectedNodeIds));
  }, [selectedNodeIds, onSelectNodes]);

  // Determine what to show
  const hasSession = session !== null;
  const isDesignLoaded = hasSession && session.status === 'extracted';
  const hasFrames = isDesignLoaded && session.frames.length > 0;

  return (
    <Box h="100%" style={{ overflow: 'auto' }}>
      <Stack gap="lg" p="md" maw={contentMaxWidth} mx="auto">
        {/* Header */}
        <Box>
          <Text
            size="lg"
            fw={700}
            ff="monospace"
            style={{ color: themedColor('prdText'), letterSpacing: '0.04em' }}
          >
            Figma Design Intake
          </Text>
          <Text size="xs" mt={4} style={{ color: themedColor('textDimmed') }}>
            Extract design context from Figma and generate structured requirements.
          </Text>
        </Box>

        {/* Stage 1: URL Input */}
        {!hasSession && <UrlInputStage isLoading={isLoading} onStartIntake={onStartIntake} />}

        {/* Extracting */}
        {hasSession && isExtracting && <ExtractionProgress session={session} />}

        {/* Stage 2: Design loaded summary */}
        {isDesignLoaded && <DesignSummary session={session} />}

        {/* Stage 3: Frame selection */}
        {hasFrames && (
          <FrameSelectionGrid
            frames={session.frames}
            selectedNodeIds={selectedNodeIds}
            onToggle={handleToggleNode}
          />
        )}

        {/* Component list */}
        {isDesignLoaded && session.components.length > 0 && (
          <ComponentList components={session.components} />
        )}

        {/* Stage 4: Actions bar */}
        {isDesignLoaded && (
          <ActionsBar
            session={session}
            selectedCount={selectedNodeIds.size}
            hasRepoMappings={repoMappings.length > 0}
            hasRequirements={requirements.length > 0}
            onSelectNodes={handleConfirmSelection}
            selectedNodeIds={selectedNodeIds}
            onRunRepoDiscovery={onRunRepoDiscovery}
            onGenerateRequirements={onGenerateRequirements}
            onGeneratePRD={onGeneratePRD}
          />
        )}

        {/* Repo mappings */}
        <RepoMappingsSection mappings={repoMappings} />

        {/* Stage 5: Requirements */}
        <RequirementsSection requirements={requirements} />

        {/* Footer hint */}
        {isDesignLoaded && requirements.length === 0 && (
          <Text
            size="xs"
            ta="center"
            ff="monospace"
            style={{ color: themedColor('chatTextDimmed') }}
          >
            Select frames, then generate requirements to populate this section.
          </Text>
        )}
      </Stack>
    </Box>
  );
}
