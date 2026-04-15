import { Button, Group, Text } from '@mantine/core';

interface ApprovalButtonProps {
  onApprove?: () => void;
  isApproving: boolean;
  readyForReview: boolean;
}

export function ApprovalButton({ onApprove, isApproving, readyForReview }: ApprovalButtonProps) {
  if (!onApprove) {
    return (
      <Group justify="flex-end">
        <Text size="sm" c="teal" fw={500}>
          Already approved
        </Text>
      </Group>
    );
  }

  return (
    <Group justify="flex-end" gap="md">
      {!readyForReview && (
        <Text size="sm" c="yellow.6">
          Some fields may still be incomplete.
        </Text>
      )}
      <Button size="md" radius="xl" color="teal" onClick={onApprove} loading={isApproving}>
        Approve Intake
      </Button>
    </Group>
  );
}
