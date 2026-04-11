import { useParams, useNavigate } from 'react-router-dom';
import { Stack, Loader, Text, Box, Group, Button } from '@mantine/core';
import { ReviewScreen } from '../components/review/ReviewScreen';
import { useDraft } from '../hooks/useDraft';

export function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { draft, loading, approve, isApproving } = useDraft(sessionId);

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
    const artifact = await approve('user-1');
    if (artifact) {
      navigate('/');
    }
  };

  return (
    <Box maw={768} mx="auto" p="lg">
      <Group justify="space-between" mb="lg">
        <Button variant="subtle" color="gray" size="sm" onClick={() => navigate('/')}>
          &larr; Back to chat
        </Button>
      </Group>
      <ReviewScreen draft={draft} onApprove={handleApprove} isApproving={isApproving} />
    </Box>
  );
}
