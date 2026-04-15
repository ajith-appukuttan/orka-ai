import { Stack, Title, Text, Paper, Divider, Box, Group } from '@mantine/core';
import type { IntakeDraft } from '@orka/draft-schema';
import { DraftFieldGroup } from '../draft/DraftFieldGroup';
import { ApprovalButton } from './ApprovalButton';

interface ReviewScreenProps {
  draft: IntakeDraft;
  onApprove?: () => void;
  isApproving: boolean;
}

export function ReviewScreen({ draft, onApprove, isApproving }: ReviewScreenProps) {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2} fw={600}>
          Review Draft PRD
        </Title>
        <Text c="dimmed" size="sm" mt={4}>
          Review all captured information before sending to Stage 2 elaboration.
        </Text>
      </div>

      <Paper p="xl" radius="lg" withBorder>
        <Stack gap="lg">
          <Text fw={600}>Problem Statement</Text>
          <DraftFieldGroup label="Who is affected" value={draft.problemStatement.who} />
          <DraftFieldGroup label="What problem" value={draft.problemStatement.what} />
          <DraftFieldGroup label="Context" value={draft.problemStatement.context} />
          <DraftFieldGroup label="Cost of inaction" value={draft.problemStatement.costOfInaction} />

          <Divider />
          <DraftFieldGroup label="Trigger (why now)" value={draft.trigger} />

          <Divider />
          <Text fw={600}>Goals</Text>
          <DraftFieldGroup label="Success criteria" value={draft.goals} />

          <Divider />
          <Text fw={600}>Non-Goals</Text>
          <DraftFieldGroup label="Explicitly excluded" value={draft.nonGoals} />

          <Divider />
          <Text fw={600}>User Stories</Text>
          {draft.userStories.length > 0 ? (
            <Stack gap="xs">
              {draft.userStories.map((story, i) => (
                <Box
                  key={i}
                  p="sm"
                  style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8 }}
                >
                  <Text size="sm">
                    As a <strong>{story.role || '...'}</strong>, I want to{' '}
                    <strong>{story.action || '...'}</strong> so that{' '}
                    <strong>{story.outcome || '...'}</strong>
                  </Text>
                </Box>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              Not yet captured
            </Text>
          )}

          <Divider />
          <Text fw={600}>Open Questions</Text>
          <DraftFieldGroup label="Known unknowns" value={draft.openQuestions} />

          <Divider />
          <Text fw={600}>Current State</Text>
          <DraftFieldGroup label="Description" value={draft.currentState.description} />
          <DraftFieldGroup label="Artifacts" value={draft.currentState.artifacts} />

          <Divider />
          <DraftFieldGroup label="Constraints" value={draft.constraints} />
          <DraftFieldGroup label="Assumptions" value={draft.assumptions} />
        </Stack>
      </Paper>

      <ApprovalButton
        onApprove={onApprove}
        isApproving={isApproving}
        readyForReview={draft.readyForReview}
      />
    </Stack>
  );
}
