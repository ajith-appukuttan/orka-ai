import { Stack, Text, Group, Box, ActionIcon, Tooltip } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

interface MemoryItem {
  id: string;
  kind: string;
  key: string;
  value: string;
  confidence: number;
}

interface MemoryPanelProps {
  items: MemoryItem[];
  onArchive?: (itemId: string) => void;
}

const KIND_ICONS: Record<string, string> = {
  fact: '\u25cf',
  constraint: '\u25b2',
  preference: '\u2605',
  standard: '\u25a0',
  integration: '\u2194',
};

export function MemoryPanel({ items, onArchive }: MemoryPanelProps) {
  const { themedColor } = useTheme();

  if (items.length === 0) {
    return (
      <Text ff="monospace" size="xs" style={{ color: themedColor('prdTextDimmed') }}>
        No memory items yet. Facts will be extracted as the conversation progresses.
      </Text>
    );
  }

  return (
    <Stack gap={6}>
      {items.map((item) => (
        <Group
          key={item.id}
          gap="xs"
          wrap="nowrap"
          align="flex-start"
          p={6}
          style={{
            background: themedColor('prdSurfaceBg'),
            borderRadius: 4,
            borderLeft: `2px solid ${themedColor('prdAccent')}`,
          }}
        >
          <Text ff="monospace" size="xs" style={{ color: themedColor('prdAccent'), flexShrink: 0 }}>
            {KIND_ICONS[item.kind] || '\u25cf'}
          </Text>
          <Box flex={1} style={{ minWidth: 0 }}>
            <Group gap={4} wrap="nowrap">
              <Text
                ff="monospace"
                size="xs"
                fw={600}
                style={{ color: themedColor('prdLabel') }}
                truncate
              >
                {item.key}
              </Text>
              <Text
                ff="monospace"
                size="xs"
                style={{ color: themedColor('prdTextDimmed'), fontSize: 10 }}
              >
                [{item.kind}]
              </Text>
            </Group>
            <Text
              ff="monospace"
              size="xs"
              style={{ color: themedColor('prdText'), lineHeight: 1.5 }}
            >
              {item.value}
            </Text>
          </Box>
          {onArchive && (
            <Tooltip label="Remove">
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => onArchive(item.id)}
                style={{ color: themedColor('prdTextDimmed'), flexShrink: 0 }}
              >
                x
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ))}
    </Stack>
  );
}
