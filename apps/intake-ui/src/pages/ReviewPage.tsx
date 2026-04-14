import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stack, Loader, Text, Box, Group, Button, Badge, Alert } from '@mantine/core';
import { ReviewScreen } from '../components/review/ReviewScreen';
import { useDraft } from '../hooks/useDraft';

export function ReviewPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { draft, loading, approve, isApproving } = useDraft(sessionId, workspaceId);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <Stack align="center" justify="center" h="80vh">
        <Loader type="dots" />
      </Stack>
    );
  }

  if (!draft) {
    return (
      <Stack align="center" justify="center" h="80vh">
        <Text c="dimmed">No draft found for this session.</Text>
        <Button variant="subtle" onClick={() => navigate('/')}>
          Back to chat
        </Button>
      </Stack>
    );
  }

  const handleApprove = async () => {
    setError(null);
    try {
      const artifact = await approve('user-1');
      if (artifact) {
        setApproved(true);
        // Navigate back after a brief delay so user sees the success state
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('APPROVED')) {
        setApproved(true);
        setError(null);
      } else {
        setError(msg);
      }
    }
  };

  return (
    <Box maw={768} mx="auto" p="lg">
      <Group justify="space-between" mb="lg">
        <Button variant="subtle" color="gray" size="sm" onClick={() => navigate('/')}>
          &larr; Back to chat
        </Button>
      </Group>

      {approved && (
        <Alert color="teal" mb="md" radius="md">
          <Group gap="sm">
            <Badge color="teal" variant="filled" size="lg">
              Approved
            </Badge>
            <Text size="sm">
              PRD has been approved and sent to the Intake Readiness Classifier. Redirecting to
              chat...
            </Text>
          </Group>
        </Alert>
      )}

      {error && (
        <Alert color="red" mb="md" radius="md">
          <Text size="sm">{error}</Text>
        </Alert>
      )}

      <ReviewScreen
        draft={draft}
        onApprove={approved ? undefined : handleApprove}
        isApproving={isApproving}
      />
    </Box>
  );
}
