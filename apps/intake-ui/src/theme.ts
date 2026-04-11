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
    // Chat panel
    chatBg: { light: '#ffffff', dark: '#25262b' },
    userMsgBg: { light: '#eff6ff', dark: '#1e3a5f' },
    assistantMsgBg: { light: 'transparent', dark: 'transparent' },
    inputBg: { light: '#f4f4f4', dark: 'var(--mantine-color-dark-6)' },
    surfaceBg: { light: '#ffffff', dark: 'var(--mantine-color-dark-7)' },
    borderColor: {
      light: 'var(--mantine-color-gray-2)',
      dark: 'var(--mantine-color-dark-4)',
    },
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
  },
});

export const THEME_STORAGE_KEY = 'orka-color-scheme';
