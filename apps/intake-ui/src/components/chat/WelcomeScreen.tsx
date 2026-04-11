import { useState, useRef } from 'react';
import {
  Stack,
  Title,
  Text,
  Box,
  SimpleGrid,
  Paper,
  Group,
  ActionIcon,
  Tooltip,
  Image,
} from '@mantine/core';
import { MessageInput } from './MessageInput';
import { useTheme } from '../../hooks/useTheme';

type IntakeMethod = 'chat' | 'visual' | 'repo' | 'screenshot';

interface WelcomeScreenProps {
  onStart: (prompt: string, method?: IntakeMethod) => void;
  isLoading: boolean;
}

const INTAKE_METHODS = [
  {
    id: 'chat' as IntakeMethod,
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: 'Chat-based Intake',
    description:
      'Describe your application idea in a conversation. The Virtual PM will guide you through capturing requirements, goals, and constraints.',
    action: 'Start with a description below',
  },
  {
    id: 'repo' as IntakeMethod,
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    ),
    title: 'Git Repo-based Intake',
    description:
      'Point to a GitHub repository. The system will analyze the codebase, README, issues, and existing architecture to pre-fill your intake draft.',
    action: 'Enter a repository URL below',
  },
  {
    id: 'visual' as IntakeMethod,
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: 'Visual Intake',
    description:
      'Open a live application URL, browse to any page, inspect UI elements, and describe desired changes. Requirements are generated automatically.',
    action: 'Switch to Visual mode after starting',
  },
  {
    id: 'screenshot' as IntakeMethod,
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: 'Screenshot Intake',
    description:
      'Upload a screenshot or mockup of an existing UI. Describe what you want to change and the Virtual PM will generate structured requirements.',
    action: 'Upload an image below',
  },
];

export function WelcomeScreen({ onStart, isLoading }: WelcomeScreenProps) {
  const [value, setValue] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<IntakeMethod>('chat');
  const { themedColor, contentMaxWidth } = useTheme();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placeholders: Record<IntakeMethod, string> = {
    chat: 'Describe your app idea...',
    repo: 'https://github.com/org/repo',
    visual: 'https://your-app.staging.example.com',
    screenshot: 'Describe what you want to change in this screenshot...',
  };

  return (
    <Stack h="100vh" justify="center" align="center" px="md" style={{ position: 'relative' }}>
      {/* Center content */}
      <Stack align="center" gap="xl" maw={contentMaxWidth} w="100%" mb={100}>
        <Stack align="center" gap="xs">
          <Box
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10a37f 0%, #1a7f64 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            V
          </Box>
          <Title order={1} fw={600} ta="center">
            How would you like to start?
          </Title>
          <Text c="dimmed" size="md" ta="center" maw={480}>
            Choose how you want to capture your product requirements.
          </Text>
        </Stack>

        {/* Intake method cards */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" w="100%">
          {INTAKE_METHODS.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <Paper
                key={method.id}
                p="md"
                radius="lg"
                withBorder
                style={{
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  borderColor: isSelected ? '#10a37f' : undefined,
                  borderWidth: isSelected ? 2 : 1,
                  background: isSelected ? 'rgba(16, 163, 127, 0.04)' : undefined,
                }}
                onClick={() => setSelectedMethod(method.id)}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '#10a37f80';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = '';
                }}
              >
                <Group gap="sm" mb="xs">
                  <Box style={{ color: isSelected ? '#10a37f' : 'var(--mantine-color-dimmed)' }}>
                    {method.icon}
                  </Box>
                  <Text size="sm" fw={600}>
                    {method.title}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" lh={1.5}>
                  {method.description}
                </Text>
                {isSelected && (
                  <Text size="xs" c="teal" mt="xs" fw={500}>
                    {method.action}
                  </Text>
                )}
              </Paper>
            );
          })}
        </SimpleGrid>
      </Stack>

      {/* Floating input at bottom */}
      <Box
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: contentMaxWidth,
          padding: '0 16px',
        }}
      >
        {/* Screenshot upload preview */}
        {selectedMethod === 'screenshot' && selectedFile && (
          <Paper radius="lg" p="xs" mb="xs" withBorder>
            <Group gap="xs" align="center">
              <Image
                src={URL.createObjectURL(selectedFile)}
                alt="Uploaded screenshot"
                h={60}
                w="auto"
                radius="sm"
                style={{ maxWidth: 120 }}
              />
              <Stack gap={2} flex={1}>
                <Text size="xs" fw={500} truncate>
                  {selectedFile.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </Text>
              </Stack>
              <Tooltip label="Remove">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setSelectedFile(null)}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>
        )}

        <Paper
          radius="xl"
          p={4}
          style={{
            background: themedColor('inputBg'),
          }}
        >
          <Group gap={0} align="flex-end" wrap="nowrap">
            {/* Upload button for screenshot mode */}
            {selectedMethod === 'screenshot' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedFile(file);
                  }}
                />
                <Tooltip label="Upload screenshot">
                  <ActionIcon
                    size="lg"
                    variant="subtle"
                    color="gray"
                    mx={4}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </ActionIcon>
                </Tooltip>
              </>
            )}
            <Box flex={1}>
              <MessageInput
                onSend={(msg) => {
                  setValue('');
                  onStart(msg, selectedMethod);
                }}
                disabled={isLoading || (selectedMethod === 'screenshot' && !selectedFile)}
                placeholder={placeholders[selectedMethod]}
                value={value}
                onChange={setValue}
              />
            </Box>
          </Group>
        </Paper>
        <Text size="xs" c="dimmed" ta="center" mt={8}>
          {selectedMethod === 'chat' &&
            'Describe your idea to start a conversation with the Virtual PM'}
          {selectedMethod === 'repo' && 'Paste a GitHub URL to analyze the repository'}
          {selectedMethod === 'visual' &&
            'Enter a URL, then switch to Visual mode to inspect elements'}
          {selectedMethod === 'screenshot' &&
            (selectedFile
              ? 'Describe what you want to change, then submit'
              : 'Upload a screenshot first, then describe your changes')}
        </Text>
      </Box>
    </Stack>
  );
}
