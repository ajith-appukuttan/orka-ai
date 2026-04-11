import { Stack, Text, Group, Box, Badge } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';
import type { VisualRequirementItem } from '../../hooks/useVisualIntake';

interface VisualRequirementsListProps {
  requirements: VisualRequirementItem[];
}

export function VisualRequirementsList({ requirements }: VisualRequirementsListProps) {
  const { themedColor } = useTheme();

  if (requirements.length === 0) return null;

  return (
    <Stack gap={6}>
      {requirements.map((req) => (
        <Box
          key={req.id}
          p="xs"
          style={{
            background: themedColor('prdSurfaceBg'),
            borderRadius: 4,
            borderLeft: `2px solid ${req.confidence >= 0.8 ? themedColor('prdGreen') : themedColor('prdYellow')}`,
          }}
        >
          <Group gap="xs" mb={4} justify="space-between">
            <Text
              ff="monospace"
              size="xs"
              fw={600}
              style={{ color: themedColor('prdText') }}
              lineClamp={1}
            >
              {req.title}
            </Text>
            <Badge
              size="xs"
              variant="filled"
              style={{
                background:
                  req.confidence >= 0.8 ? themedColor('prdGreen') : themedColor('prdYellow'),
                color: '#000',
                flexShrink: 0,
              }}
            >
              {Math.round(req.confidence * 100)}%
            </Badge>
          </Group>
          <Text
            ff="monospace"
            size="xs"
            style={{ color: themedColor('prdTextDimmed') }}
            lineClamp={2}
          >
            {req.requestedChange}
          </Text>
          {req.acceptanceCriteria && req.acceptanceCriteria.length > 0 && (
            <Text
              ff="monospace"
              size="xs"
              mt={4}
              style={{ color: themedColor('prdLabel'), fontSize: 10 }}
            >
              {req.acceptanceCriteria.length} acceptance criteria
            </Text>
          )}
        </Box>
      ))}
    </Stack>
  );
}
