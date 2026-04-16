import { Modal, Button, Stack, Text, ScrollArea, Loader, Box } from '@mantine/core';
import { useMutation } from '@apollo/client';
import { useState, useCallback } from 'react';
import { GENERATE_CHAT_SUMMARY } from '../../graphql/mutations';
import { useTheme } from '../../hooks/useTheme';
import Markdown from 'react-markdown';

interface ChatSummaryModalProps {
  workspaceId: string | null;
  opened: boolean;
  onClose: () => void;
}

export function ChatSummaryModal({ workspaceId, opened, onClose }: ChatSummaryModalProps) {
  const { themedColor } = useTheme();
  const [summaryMarkdown, setSummaryMarkdown] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [generateSummary, { loading, error }] = useMutation(GENERATE_CHAT_SUMMARY, {
    onCompleted: (data) => {
      setSummaryMarkdown(data.generateChatSummary.summaryMarkdown);
      setGeneratedAt(data.generateChatSummary.generatedAt);
    },
  });

  const handleGenerate = useCallback(() => {
    if (!workspaceId) return;
    setSummaryMarkdown(null);
    setGeneratedAt(null);
    generateSummary({ variables: { workspaceId } });
  }, [workspaceId, generateSummary]);

  const handleClose = useCallback(() => {
    onClose();
    // Keep the summary around so reopening shows it without regenerating
  }, [onClose]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={700} ff="monospace" tt="uppercase" size="sm" style={{ letterSpacing: '0.08em' }}>
          Chat Summary
        </Text>
      }
      size="lg"
      centered
      styles={{
        header: {
          borderBottom: `1px solid ${themedColor('prdBorder')}`,
        },
        body: {
          padding: 0,
        },
      }}
    >
      <Stack gap={0}>
        {/* Action bar */}
        <Box px="md" py="sm" style={{ borderBottom: `1px solid ${themedColor('prdBorder')}` }}>
          <Button
            size="xs"
            radius="xl"
            variant="filled"
            color="teal"
            onClick={handleGenerate}
            loading={loading}
            disabled={!workspaceId}
          >
            {summaryMarkdown ? 'Regenerate Summary' : 'Generate Summary'}
          </Button>
          {generatedAt && (
            <Text size="xs" c="dimmed" ff="monospace" mt={4}>
              Generated {new Date(generatedAt).toLocaleString()}
            </Text>
          )}
        </Box>

        {/* Content area */}
        <ScrollArea h={400} px="md" py="sm">
          {loading && (
            <Stack align="center" justify="center" h={300}>
              <Loader size="sm" type="dots" />
              <Text size="sm" c="dimmed" ff="monospace">
                Summarizing conversation across all personas...
              </Text>
            </Stack>
          )}

          {error && (
            <Text size="sm" c="red" ff="monospace">
              Failed to generate summary: {error.message}
            </Text>
          )}

          {!loading && !error && !summaryMarkdown && (
            <Stack align="center" justify="center" h={300}>
              <Text size="sm" c="dimmed" ta="center" ff="monospace">
                Click "Generate Summary" to create a cross-persona summary of all conversations in
                this workspace.
              </Text>
            </Stack>
          )}

          {!loading && summaryMarkdown && (
            <Box
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: themedColor('chatText'),
              }}
            >
              <Markdown>{summaryMarkdown}</Markdown>
            </Box>
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
