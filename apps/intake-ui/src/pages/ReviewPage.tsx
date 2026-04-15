import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stack, Loader, Text, Box, Group, Button, Badge, Alert } from '@mantine/core';
import { useQuery, gql } from '@apollo/client';
import { ReviewScreen } from '../components/review/ReviewScreen';
import { useDraft } from '../hooks/useDraft';
import { useTheme } from '../hooks/useTheme';

const GET_WORKSPACE_STATUS = gql`
  query GetWorkspaceStatus($workspaceId: ID!) {
    intakeWorkspace(workspaceId: $workspaceId) {
      id
      status
      latestClassification {
        classification
        buildReadinessScore
        runId
        reasoningSummary
      }
    }
  }
`;

export function ReviewPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { themedColor } = useTheme();
  const { draft, loading, approve, isApproving } = useDraft(sessionId, workspaceId);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wsData } = useQuery(GET_WORKSPACE_STATUS, {
    variables: { workspaceId },
    skip: !workspaceId,
  });

  const wsStatus = wsData?.intakeWorkspace?.status;
  const classification = wsData?.intakeWorkspace?.latestClassification;
  const isAlreadyApproved = wsStatus === 'APPROVED' && classification && !approved;

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
        <Text style={{ color: themedColor('textDimmed') }}>No draft found for this session.</Text>
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

  // Classification badge color
  const classColorMap: Record<string, string> = {
    DIRECT_TO_BUILD: 'teal',
    NEEDS_ELABORATION: 'yellow',
    NEEDS_PLANNING: 'blue',
    NEEDS_ELABORATION_AND_PLANNING: 'orange',
    RETURN_TO_INTAKE: 'red',
  };
  const classLabelMap: Record<string, string> = {
    DIRECT_TO_BUILD: 'Ready for Build',
    NEEDS_ELABORATION: 'Needs Elaboration',
    NEEDS_PLANNING: 'Needs Planning',
    NEEDS_ELABORATION_AND_PLANNING: 'Needs Elaboration & Planning',
    RETURN_TO_INTAKE: 'Return to Intake',
  };

  return (
    <Box
      maw={768}
      mx="auto"
      p="lg"
      style={{ background: themedColor('chatBg'), minHeight: '100vh' }}
    >
      <Group justify="space-between" mb="lg">
        <Button variant="subtle" color="gray" size="sm" onClick={() => navigate('/')}>
          &larr; Back to chat
        </Button>
      </Group>

      {/* Already approved — show classification result */}
      {isAlreadyApproved && (
        <Alert
          color={classColorMap[classification.classification] || 'gray'}
          mb="md"
          radius="md"
          variant="outline"
        >
          <Group gap="sm" mb="xs">
            <Badge
              color={classColorMap[classification.classification] || 'gray'}
              variant="filled"
              size="lg"
            >
              {classLabelMap[classification.classification] || classification.classification}
            </Badge>
            <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
              {classification.runId}
            </Text>
          </Group>
          {classification.reasoningSummary && (
            <Text size="sm" style={{ color: themedColor('chatText') }}>
              {classification.reasoningSummary}
            </Text>
          )}
          <Group gap="xs" mt="sm">
            <Text size="xs" ff="monospace" style={{ color: themedColor('textDimmed') }}>
              READINESS {Math.round(classification.buildReadinessScore * 100)}%
            </Text>
          </Group>
        </Alert>
      )}

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
        onApprove={isAlreadyApproved || approved ? undefined : handleApprove}
        isApproving={isApproving}
      />
    </Box>
  );
}
