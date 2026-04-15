import { Group, Box, Text } from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';

interface PipelineStep {
  id: string;
  label: string;
  status: 'done' | 'current' | 'pending' | 'skipped' | 'failed';
}

interface PipelineStepperProps {
  workspaceStatus: string;
  classification?: string | null;
}

/**
 * Map workspace status + classification to pipeline step states.
 */
function computeSteps(workspaceStatus: string, classification?: string | null): PipelineStep[] {
  const steps: PipelineStep[] = [
    { id: 'intake', label: 'Intake', status: 'pending' },
    { id: 'classify', label: 'Classify', status: 'pending' },
    { id: 'elaborate', label: 'Elaborate', status: 'pending' },
    { id: 'build', label: 'Build', status: 'pending' },
    { id: 'pr', label: 'PR', status: 'pending' },
  ];

  const set = (id: string, status: PipelineStep['status']) => {
    const step = steps.find((s) => s.id === id);
    if (step) step.status = status;
  };

  // Determine if elaboration was skipped
  const elaborationSkipped =
    classification === 'DIRECT_TO_BUILD' || classification === 'NEEDS_PLANNING';

  switch (workspaceStatus) {
    case 'ACTIVE':
      set('intake', 'current');
      break;
    case 'APPROVED':
      set('intake', 'done');
      break;
    case 'CLASSIFYING':
      set('intake', 'done');
      set('classify', 'current');
      break;
    case 'ELABORATING':
      set('intake', 'done');
      set('classify', 'done');
      set('elaborate', 'current');
      break;
    case 'PLANNING':
      set('intake', 'done');
      set('classify', 'done');
      set('elaborate', elaborationSkipped ? 'skipped' : 'done');
      set('build', 'current');
      break;
    case 'BUILDING':
      set('intake', 'done');
      set('classify', 'done');
      set('elaborate', elaborationSkipped ? 'skipped' : 'done');
      set('build', 'current');
      break;
    case 'BUILT':
      set('intake', 'done');
      set('classify', 'done');
      set('elaborate', elaborationSkipped ? 'skipped' : 'done');
      set('build', 'done');
      set('pr', 'current');
      break;
    case 'FAILED':
      set('intake', 'done');
      set('classify', 'done');
      set('elaborate', elaborationSkipped ? 'skipped' : 'done');
      set('build', 'failed');
      break;
    default:
      break;
  }

  return steps;
}

export function PipelineStepper({ workspaceStatus, classification }: PipelineStepperProps) {
  const { themedColor } = useTheme();
  const steps = computeSteps(workspaceStatus, classification);

  // Don't show stepper until intake is at least done
  if (workspaceStatus === 'ACTIVE') return null;

  const statusColor = (status: PipelineStep['status']): string => {
    switch (status) {
      case 'done':
        return themedColor('accentGreen');
      case 'current':
        return themedColor('chatAccent');
      case 'failed':
        return '#f85149';
      case 'skipped':
        return themedColor('cardBorder');
      default:
        return themedColor('textDimmed');
    }
  };

  return (
    <Group gap={0} wrap="nowrap" px="md" py={6}>
      {steps.map((step, i) => (
        <Group key={step.id} gap={0} wrap="nowrap" flex={1} align="center">
          {/* Dot */}
          <Box
            style={{
              width: step.status === 'current' ? 10 : 8,
              height: step.status === 'current' ? 10 : 8,
              borderRadius: '50%',
              background: statusColor(step.status),
              boxShadow: step.status === 'current' ? `0 0 6px ${statusColor(step.status)}` : 'none',
              flexShrink: 0,
              transition: 'all 300ms ease',
            }}
          />
          {/* Label */}
          <Text
            size="xs"
            ff="monospace"
            fw={step.status === 'current' ? 700 : 400}
            ml={4}
            style={{
              color: statusColor(step.status),
              fontSize: 10,
              letterSpacing: '0.05em',
              textDecoration: step.status === 'skipped' ? 'line-through' : 'none',
            }}
          >
            {step.label}
          </Text>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <Box
              flex={1}
              mx={6}
              style={{
                height: 1,
                background:
                  step.status === 'done'
                    ? themedColor('accentGreen')
                    : step.status === 'skipped'
                      ? themedColor('cardBorder')
                      : themedColor('textDimmed'),
                opacity: step.status === 'skipped' ? 0.3 : 0.5,
                borderStyle: step.status === 'skipped' ? 'dashed' : 'solid',
              }}
            />
          )}
        </Group>
      ))}
    </Group>
  );
}
