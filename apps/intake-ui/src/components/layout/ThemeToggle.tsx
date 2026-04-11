import { ActionIcon, Tooltip } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

export function ThemeToggle() {
  const { isDark, toggleColorScheme } = useTheme();

  return (
    <Tooltip label={isDark ? 'Light mode' : 'Dark mode'} position="bottom">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        onClick={toggleColorScheme}
        aria-label="Toggle color scheme"
      >
        {isDark ? '\u2600\ufe0f' : '\u{1F319}'}
      </ActionIcon>
    </Tooltip>
  );
}
