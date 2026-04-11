import { Box, Text } from '@mantine/core';

interface StreamingMessageProps {
  content: string;
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <Box flex={1} pt={2}>
      <Text size="xs" fw={600} mb={4}>
        Virtual PM
      </Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {content}
        <Box
          component="span"
          style={{
            display: 'inline-block',
            width: 7,
            height: 18,
            background: 'var(--mantine-color-dimmed)',
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            animation: 'cursorBlink 1s step-end infinite',
          }}
        />
      </Text>

      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </Box>
  );
}
