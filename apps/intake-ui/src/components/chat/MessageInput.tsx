import { useState } from 'react';
import { Group, Textarea, ActionIcon, Box } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function MessageInput({
  onSend,
  disabled,
  placeholder = 'Message Virtual PM...',
  value: controlledValue,
  onChange: controlledOnChange,
}: MessageInputProps) {
  const { themedColor } = useTheme();
  const [internalValue, setInternalValue] = useState('');

  const value = controlledValue ?? internalValue;
  const setValue = controlledOnChange ?? setInternalValue;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Group gap={0} align="flex-end" wrap="nowrap" px="sm" py={6}>
      <Textarea
        flex={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autosize
        minRows={1}
        maxRows={6}
        variant="unstyled"
        styles={{
          input: {
            fontSize: '0.95rem',
            lineHeight: 1.5,
            padding: '8px 12px',
            color: themedColor('chatText'),
          },
        }}
      />
      <Box pb={4}>
        <ActionIcon
          size={32}
          radius="xl"
          variant={value.trim() ? 'filled' : 'subtle'}
          color={value.trim() ? 'teal' : 'gray'}
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          style={{
            transition: 'all 150ms ease',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </ActionIcon>
      </Box>
    </Group>
  );
}
