import { Box, Text } from '@mantine/core';
import Markdown from 'react-markdown';
import { useTheme } from '../../hooks/useTheme';
import { getBotName } from '../../utils/botName';

interface StreamingMessageProps {
  content: string;
  workspaceStatus?: string;
}

export function StreamingMessage({ content, workspaceStatus }: StreamingMessageProps) {
  const { themedColor } = useTheme();

  return (
    <Box flex={1} pt={2}>
      <Text
        size="xs"
        fw={700}
        mb={4}
        ff="monospace"
        tt="uppercase"
        style={{ color: themedColor('prdText'), letterSpacing: '0.08em' }}
      >
        {getBotName(workspaceStatus)}
      </Text>
      <Box
        className="orka-markdown"
        style={{ fontSize: 14, lineHeight: 1.7, color: themedColor('chatText') }}
      >
        <Markdown>{content}</Markdown>
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
      </Box>

      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </Box>
  );
}
