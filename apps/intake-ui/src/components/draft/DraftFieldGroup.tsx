import { Text, Group, Stack, Box } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

interface DraftFieldGroupProps {
  label: string;
  value: string | string[];
}

export function DraftFieldGroup({ label, value }: DraftFieldGroupProps) {
  const { themedColor } = useTheme();
  const isEmpty = Array.isArray(value) ? value.length === 0 : !value;

  return (
    <Stack gap={4}>
      <Text
        size="xs"
        ff="monospace"
        fw={600}
        tt="uppercase"
        style={{ color: themedColor('prdLabel'), letterSpacing: '0.05em' }}
      >
        {label}
      </Text>
      {isEmpty ? (
        <Text size="sm" ff="monospace" fs="italic" style={{ color: themedColor('prdTextDimmed') }}>
          --
        </Text>
      ) : Array.isArray(value) ? (
        <Group gap={6}>
          {value.map((item, i) => (
            <Box
              key={i}
              px={8}
              py={2}
              style={{
                background: themedColor('prdBadgeBg'),
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'monospace',
                color: themedColor('prdBadgeText'),
              }}
            >
              {item}
            </Box>
          ))}
        </Group>
      ) : (
        <Text size="sm" style={{ color: themedColor('prdText'), lineHeight: 1.6 }}>
          {value}
        </Text>
      )}
    </Stack>
  );
}
