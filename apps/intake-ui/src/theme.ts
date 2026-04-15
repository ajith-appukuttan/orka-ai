import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'dark',
  fontFamily:
    'Sohne, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif',
  defaultRadius: 'lg',
  headings: {
    fontFamily:
      'Sohne, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif',
  },
  other: {
    contentMaxWidth: 768,
    // Sidebar / workspace panel
    sidebarBg: { light: '#f0f0f0', dark: '#1a1b1e' },
    sidebarHeaderBg: { light: '#e4e4e7', dark: '#141517' },
    sidebarActiveBg: { light: '#dbeafe', dark: '#1e3a5f' },
    sidebarHoverBg: { light: '#e8e8eb', dark: '#25262b' },
    sidebarText: { light: '#3f3f46', dark: '#a1a1aa' },
    sidebarTextActive: { light: '#1e40af', dark: '#93c5fd' },
    // Chat panel — matches PRD terminal theme
    chatBg: { light: '#1e1e2e', dark: '#0d1117' },
    userMsgBg: { light: '#262637', dark: '#161b22' },
    assistantMsgBg: { light: 'transparent', dark: 'transparent' },
    inputBg: { light: '#313244', dark: '#21262d' },
    surfaceBg: { light: '#262637', dark: '#161b22' },
    borderColor: { light: '#313244', dark: '#21262d' },
    // Chat text colors — light text on dark background
    chatText: { light: '#cdd6f4', dark: '#c9d1d9' },
    chatTextDimmed: { light: '#6c7086', dark: '#484f58' },
    chatAccent: { light: '#89b4fa', dark: '#58a6ff' },
    // Draft PRD panel — OpenCode / terminal theme
    prdBg: { light: '#1e1e2e', dark: '#0d1117' },
    prdSurfaceBg: { light: '#262637', dark: '#161b22' },
    prdText: { light: '#cdd6f4', dark: '#c9d1d9' },
    prdTextDimmed: { light: '#6c7086', dark: '#484f58' },
    prdAccent: { light: '#89b4fa', dark: '#58a6ff' },
    prdGreen: { light: '#a6e3a1', dark: '#3fb950' },
    prdYellow: { light: '#f9e2af', dark: '#d29922' },
    prdBorder: { light: '#313244', dark: '#21262d' },
    prdLabel: { light: '#a6adc8', dark: '#8b949e' },
    prdBadgeBg: { light: '#313244', dark: '#21262d' },
    prdBadgeText: { light: '#cdd6f4', dark: '#c9d1d9' },
    prdProgressBg: { light: '#313244', dark: '#21262d' },
    prdProgressFill: { light: '#89b4fa', dark: '#58a6ff' },
    prdProgressFillReady: { light: '#a6e3a1', dark: '#3fb950' },
    // Shared accent colors (theme-aware)
    accentGreen: { light: '#10a37f', dark: '#3fb950' },
    accentGreenGlow: { light: '#10a37f', dark: '#3fb950' },
    accentGreenGradientFrom: { light: '#10a37f', dark: '#3fb950' },
    accentGreenGradientTo: { light: '#1a7f64', dark: '#2ea043' },
    accentPurple: { light: '#5436DA', dark: '#8b5cf6' },
    avatarText: { light: '#ffffff', dark: '#ffffff' },
    // Borders for cards/screenshots
    cardBorder: { light: '#313244', dark: '#21262d' },
    // Dimmed text (replaces c="dimmed" which doesn't work well on dark bg)
    textDimmed: { light: '#6c7086', dark: '#484f58' },
    // Warning text
    warningText: { light: '#f9e2af', dark: '#d29922' },
  },
});

export const THEME_STORAGE_KEY = 'orka-color-scheme';
