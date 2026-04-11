import { Box, Button, Group, Progress, Text } from '@mantine/core';

interface ReadinessIndicatorProps {
  score: number;
  readyForReview: boolean;
  onReview: () => void;
}

export function ReadinessIndicator({ score, readyForReview, onReview }: ReadinessIndicatorProps) {
  if (!readyForReview) {
    if (score > 0) {
      return (
        <Box px="md" pt={4}>
          <Progress value={score * 100} size={3} color="teal" radius={0} style={{ opacity: 0.6 }} />
        </Box>
      );
    }
    return null;
  }

  return (
    <Box px="md" py="xs">
      <Group justify="center" gap="md">
        <Group gap="xs">
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10a37f',
            }}
          />
          <Text size="sm" fw={500}>
            Intake is ready for review
          </Text>
        </Group>
        <Button size="xs" radius="xl" variant="filled" color="teal" onClick={onReview}>
          Review & Approve
        </Button>
      </Group>
    </Box>
  );
}
