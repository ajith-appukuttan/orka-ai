import { useState } from 'react';
import {
  Stack,
  Box,
  Group,
  TextInput,
  Button,
  Text,
  Paper,
  Textarea,
  ActionIcon,
  Tooltip,
  Badge,
  Loader,
  Image,
} from '@mantine/core';
import type { SelectedElement, VisualSession } from '../../hooks/useVisualIntake';

interface VisualIntakePanelProps {
  session: VisualSession | null;
  selectedElement: SelectedElement | null;
  inspectMode: boolean;
  browserStatus: 'idle' | 'launching' | 'running' | 'inspecting';
  isStarting: boolean;
  isSubmitting: boolean;
  onStartPreview: (url: string) => void;
  onToggleInspect: (enabled: boolean) => void;
  onSubmitChange: (instruction: string) => void;
  onClose: () => void;
}

export function VisualIntakePanel({
  session,
  selectedElement,
  inspectMode,
  browserStatus,
  isStarting,
  isSubmitting,
  onStartPreview,
  onToggleInspect,
  onSubmitChange,
  onClose,
}: VisualIntakePanelProps) {
  const [url, setUrl] = useState('http://localhost:3001');
  const [instruction, setInstruction] = useState('');

  const handleSubmit = () => {
    if (!instruction.trim()) return;
    onSubmitChange(instruction.trim());
    setInstruction('');
  };

  // No session — URL input to launch browser
  if (!session) {
    return (
      <Stack h="100%" align="center" justify="center" gap="lg" p="xl">
        <Box
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10a37f 0%, #1a7f64 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </Box>
        <Text size="lg" fw={600}>
          Visual Intake
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={450}>
          A real Chrome window will open with your URL. Browse naturally, log in via SSO, navigate
          to any page. When ready, click <strong>Inspect</strong> to start selecting elements.
        </Text>
        <Group w="100%" maw={500}>
          <TextInput
            flex={1}
            placeholder="https://your-app.example.com"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onStartPreview(url);
            }}
          />
          <Button onClick={() => onStartPreview(url)} loading={isStarting} color="teal">
            Open Browser
          </Button>
        </Group>
      </Stack>
    );
  }

  // Browser launched — show status and controls
  return (
    <Stack h="100%" gap={0}>
      {/* Status bar */}
      <Group
        px="md"
        py="sm"
        justify="space-between"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
      >
        <Group gap="sm">
          <Badge
            size="sm"
            variant="dot"
            color={
              browserStatus === 'inspecting'
                ? 'teal'
                : browserStatus === 'running'
                  ? 'blue'
                  : 'gray'
            }
          >
            {browserStatus === 'launching'
              ? 'Launching...'
              : browserStatus === 'inspecting'
                ? 'Inspecting'
                : browserStatus === 'running'
                  ? 'Browser Open'
                  : 'Idle'}
          </Badge>
          <Text size="xs" c="dimmed" truncate style={{ maxWidth: 300 }}>
            {session.url}
          </Text>
        </Group>
        <Group gap="xs">
          <Button
            size="xs"
            radius="xl"
            variant={inspectMode ? 'filled' : 'outline'}
            color={inspectMode ? 'teal' : 'gray'}
            onClick={() => onToggleInspect(!inspectMode)}
          >
            {inspectMode ? 'Stop Inspect' : 'Inspect'}
          </Button>
          <Tooltip label="Close browser">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Instructions / waiting state */}
      <Box flex={1} style={{ overflow: 'auto' }}>
        {!selectedElement && !inspectMode && (
          <Stack align="center" justify="center" h="100%" gap="md" p="xl">
            <Text size="md" fw={500} ta="center">
              Chrome is open with your application
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Navigate to the page you want to change, then click <strong>Inspect</strong> above.
              You'll be able to click any element to capture it.
            </Text>
          </Stack>
        )}

        {!selectedElement && inspectMode && (
          <Stack align="center" justify="center" h="100%" gap="md" p="xl">
            <Loader type="dots" size="sm" />
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Inspect mode is active in Chrome. Click any element in the browser window to select
              it.
            </Text>
            <Text size="xs" c="dimmed">
              Waiting for selection...
            </Text>
          </Stack>
        )}

        {/* Selected element detail */}
        {selectedElement && (
          <Stack p="md" gap="md">
            <Paper p="md" radius="md" withBorder>
              <Group gap="xs" mb="sm">
                <Badge size="sm" variant="outline" color="teal">
                  {selectedElement.selector.split(' > ').pop()}
                </Badge>
                {selectedElement.ariaRole && (
                  <Badge size="sm" variant="light" color="gray">
                    role={selectedElement.ariaRole}
                  </Badge>
                )}
              </Group>

              {selectedElement.textContent && (
                <Text size="sm" c="dimmed" mb="sm" lineClamp={3}>
                  "{selectedElement.textContent}"
                </Text>
              )}

              <Text size="xs" c="dimmed" ff="monospace">
                {selectedElement.selector}
              </Text>

              {/* Element screenshot */}
              {selectedElement.elementScreenshot && (
                <Box mt="sm">
                  <Image
                    src={`data:image/png;base64,${selectedElement.elementScreenshot}`}
                    alt="Selected element"
                    radius="sm"
                    mah={200}
                    fit="contain"
                    style={{ border: '1px solid var(--mantine-color-gray-3)' }}
                  />
                </Box>
              )}
            </Paper>

            {/* Change instruction */}
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" fw={500} mb="xs">
                What do you want to change?
              </Text>
              <Textarea
                placeholder="e.g., Change the button text to 'Save & Continue' and make it green..."
                value={instruction}
                onChange={(e) => setInstruction(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                autosize
                minRows={2}
                maxRows={5}
                mb="sm"
              />
              <Group justify="flex-end">
                <Button
                  onClick={handleSubmit}
                  loading={isSubmitting}
                  disabled={!instruction.trim()}
                  color="teal"
                >
                  Generate Requirement
                </Button>
              </Group>
            </Paper>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
