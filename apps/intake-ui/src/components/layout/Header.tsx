import { Group, Title, Badge } from '@mantine/core';

interface HeaderProps {
  readinessScore?: number;
}

export function Header({ readinessScore }: HeaderProps) {
  return (
    <Group justify="space-between" px="md" h="100%">
      <Title order={3}>Orka - Virtual Product Manager</Title>
      {readinessScore !== undefined && (
        <Badge
          color={readinessScore >= 0.8 ? 'green' : readinessScore >= 0.5 ? 'yellow' : 'gray'}
          size="lg"
          variant="filled"
        >
          Readiness: {Math.round(readinessScore * 100)}%
        </Badge>
      )}
    </Group>
  );
}
