import { Box, Button, Group, Progress, Text } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

interface ReadinessIndicatorProps {
  score: number;
  readyForReview: boolean;
  onReview: () => void;
  hasVisualRequirements?: boolean;
}

export function ReadinessIndicator({
  score,
  readyForReview,
  onReview,
  hasVisualRequirements = false,
}: ReadinessIndicatorProps) {
  const { themedColor } = useTheme();

  // Ready for review (score >= 0.8)
  if (readyForReview) {
    return (
      <Box px="md" py="xs">
        <Group justify="center" gap="md">
          <Group gap="xs">
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: themedColor('accentGreen'),
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

  // Has visual requirements but score not high enough — allow early send
  if (hasVisualRequirements) {
    return (
      <Box px="md" py="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs" flex={1}>
            <Progress
              value={score * 100}
              size={3}
              color="teal"
              radius={0}
              style={{ opacity: 0.6, flex: 1 }}
            />
            <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
              {Math.round(score * 100)}%
            </Text>
          </Group>
          <Button size="xs" radius="xl" variant="outline" color="teal" onClick={onReview} ml="md">
            Send to Elaboration
          </Button>
        </Group>
      </Box>
    );
  }

  // Score > 0 but no visual requirements — just show progress bar
  if (score > 0) {
    return (
      <Box px="md" pt={4}>
        <Progress value={score * 100} size={3} color="teal" radius={0} style={{ opacity: 0.6 }} />
      </Box>
    );
  }

  return null;
}
