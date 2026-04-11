import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { apolloClient } from './graphql/client';
import { theme, THEME_STORAGE_KEY } from './theme';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <MantineProvider
        theme={theme}
        defaultColorScheme="auto"
        colorSchemeManager={{
          get: () => {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            return (stored as 'light' | 'dark' | 'auto') || 'auto';
          },
          set: (value) => {
            localStorage.setItem(THEME_STORAGE_KEY, value);
          },
          subscribe: (onUpdate) => {
            const handler = (e: StorageEvent) => {
              if (e.key === THEME_STORAGE_KEY) {
                onUpdate((e.newValue as 'light' | 'dark' | 'auto') || 'auto');
              }
            };
            window.addEventListener('storage', handler);
            return () => window.removeEventListener('storage', handler);
          },
          unsubscribe: () => {},
          clear: () => localStorage.removeItem(THEME_STORAGE_KEY),
        }}
      >
        <App />
      </MantineProvider>
    </ApolloProvider>
  </StrictMode>,
);
