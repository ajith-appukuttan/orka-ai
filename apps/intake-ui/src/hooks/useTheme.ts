import { useMantineColorScheme, useComputedColorScheme, useMantineTheme } from '@mantine/core';

export function useTheme() {
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme('light');
  const theme = useMantineTheme();

  const isDark = computedScheme === 'dark';

  const toggleColorScheme = () => {
    setColorScheme(isDark ? 'light' : 'dark');
  };

  function themed<T>(light: T, dark: T): T {
    return isDark ? dark : light;
  }

  function themedColor(key: string): string {
    const config = theme.other?.[key];
    if (config && typeof config === 'object' && 'light' in config && 'dark' in config) {
      return isDark ? config.dark : config.light;
    }
    return '';
  }

  return {
    isDark,
    colorScheme: computedScheme,
    toggleColorScheme,
    setColorScheme,
    themed,
    themedColor,
    contentMaxWidth: (theme.other?.contentMaxWidth as number) ?? 768,
  };
}
