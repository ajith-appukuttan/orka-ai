import { Stack, Text, Group, Box } from '@mantine/core';
import type { IntakeDraft } from '@orka/draft-schema';
import { DraftFieldGroup } from './DraftFieldGroup';
import { useTheme } from '../../hooks/useTheme';

interface DraftSidePanelProps {
  draft: IntakeDraft | null;
  readinessScore: number;
}

function SectionDivider({ label }: { label: string }) {
  const { themedColor } = useTheme();
  return (
    <Group gap="sm" align="center" mt="sm">
      <Text
        size="xs"
        ff="monospace"
        fw={700}
        tt="uppercase"
        style={{ color: themedColor('prdAccent'), letterSpacing: '0.08em' }}
      >
        {label}
      </Text>
      <Box flex={1} style={{ height: 1, background: themedColor('prdBorder') }} />
    </Group>
  );
}

function UserStoryItem({
  role,
  action,
  outcome,
  index,
}: {
  role: string;
  action: string;
  outcome: string;
  index: number;
}) {
  const { themedColor } = useTheme();
  const isEmpty = !role && !action && !outcome;
  if (isEmpty) return null;

  return (
    <Box
      p="xs"
      mb={4}
      style={{
        background: themedColor('prdSurfaceBg'),
        borderRadius: 4,
        borderLeft: `2px solid ${themedColor('prdAccent')}`,
      }}
    >
      <Text ff="monospace" size="xs" style={{ color: themedColor('prdTextDimmed') }}>
        US-{index + 1}
      </Text>
      <Text size="sm" style={{ color: themedColor('prdText'), lineHeight: 1.6 }}>
        As a <strong>{role || '...'}</strong>, I want to <strong>{action || '...'}</strong> so that{' '}
        <strong>{outcome || '...'}</strong>
      </Text>
    </Box>
  );
}

export function DraftSidePanel({ draft, readinessScore }: DraftSidePanelProps) {
  const { themedColor } = useTheme();

  if (!draft) {
    return (
      <Stack p="xl" align="center" justify="center" h="100%">
        <Text ff="monospace" size="sm" ta="center" style={{ color: themedColor('prdTextDimmed') }}>
          {'>'} Awaiting intake data...
        </Text>
        <Text
          ff="monospace"
          size="xs"
          ta="center"
          style={{ color: themedColor('prdTextDimmed'), opacity: 0.6 }}
        >
          Fields will populate as the conversation progresses.
        </Text>
      </Stack>
    );
  }

  const pct = Math.round(readinessScore * 100);
  const barWidth = 20;
  const filled = Math.round((pct / 100) * barWidth);
  const progressBar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const isReady = readinessScore >= 0.8;

  return (
    <Stack gap="sm" px="md" py="sm">
      {/* Terminal-style progress */}
      <Box
        p="sm"
        style={{
          background: themedColor('prdSurfaceBg'),
          borderRadius: 6,
          border: `1px solid ${themedColor('prdBorder')}`,
        }}
      >
        <Group justify="space-between" align="center" mb={4}>
          <Text ff="monospace" size="xs" style={{ color: themedColor('prdLabel') }}>
            READINESS
          </Text>
          <Text
            ff="monospace"
            size="xs"
            fw={700}
            style={{ color: isReady ? themedColor('prdGreen') : themedColor('prdAccent') }}
          >
            {pct}%
          </Text>
        </Group>
        <Text
          ff="monospace"
          size="xs"
          style={{
            color: isReady ? themedColor('prdGreen') : themedColor('prdAccent'),
            letterSpacing: '0.05em',
          }}
        >
          {progressBar}
        </Text>
        {isReady && (
          <Text ff="monospace" size="xs" mt={4} style={{ color: themedColor('prdGreen') }}>
            READY FOR STAGE 2 ELABORATION
          </Text>
        )}
      </Box>

      {/* Problem Statement */}
      <SectionDivider label="Problem Statement" />
      <DraftFieldGroup label="Who is affected" value={draft.problemStatement.who} />
      <DraftFieldGroup label="What problem" value={draft.problemStatement.what} />
      <DraftFieldGroup label="Context" value={draft.problemStatement.context} />
      <DraftFieldGroup label="Cost of inaction" value={draft.problemStatement.costOfInaction} />

      {/* Why Now */}
      <SectionDivider label="Trigger" />
      <DraftFieldGroup label="Why now" value={draft.trigger} />

      {/* Goals */}
      <SectionDivider label="Goals" />
      <DraftFieldGroup label="Success looks like" value={draft.goals} />

      {/* Non-Goals */}
      <SectionDivider label="Non-Goals" />
      <DraftFieldGroup label="Explicitly not doing" value={draft.nonGoals} />

      {/* User Stories */}
      <SectionDivider label="User Stories" />
      {draft.userStories.length > 0 ? (
        <Stack gap={4}>
          {draft.userStories.map((story, i) => (
            <UserStoryItem
              key={i}
              role={story.role}
              action={story.action}
              outcome={story.outcome}
              index={i}
            />
          ))}
        </Stack>
      ) : (
        <Text ff="monospace" size="sm" fs="italic" style={{ color: themedColor('prdTextDimmed') }}>
          --
        </Text>
      )}

      {/* Open Questions */}
      <SectionDivider label="Open Questions" />
      <DraftFieldGroup label="Known unknowns" value={draft.openQuestions} />

      {/* Current State */}
      <SectionDivider label="Current State" />
      <DraftFieldGroup label="Description" value={draft.currentState.description} />
      {draft.currentState.artifacts.length > 0 && (
        <DraftFieldGroup label="Artifacts" value={draft.currentState.artifacts} />
      )}

      {/* Constraints */}
      <SectionDivider label="Constraints" />
      <DraftFieldGroup label="Known constraints" value={draft.constraints} />

      {/* Assumptions */}
      <SectionDivider label="Assumptions" />
      <DraftFieldGroup label="Taken for granted" value={draft.assumptions} />
    </Stack>
  );
}
