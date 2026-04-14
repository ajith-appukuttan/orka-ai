import { useMemo } from 'react';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { EDIT_DRAFT, APPROVE_DRAFT } from '../graphql/mutations';
import { GET_DRAFT, GET_LATEST_DRAFT } from '../graphql/queries';
import { DRAFT_UPDATED, READINESS_UPDATED } from '../graphql/subscriptions';
import type { IntakeDraft } from '@orka/draft-schema';

/**
 * Normalize raw draft JSON from DB into the current IntakeDraft shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDraft(raw: any): IntakeDraft {
  if (!raw || typeof raw !== 'object') {
    return createEmptyDraft();
  }

  const ps = raw.problemStatement;
  const cs = raw.currentState;

  return {
    title: raw.title ?? '',
    problemStatement: {
      who: (typeof ps === 'object' && ps !== null ? ps.who : '') ?? '',
      what:
        (typeof ps === 'object' && ps !== null ? ps.what : typeof ps === 'string' ? ps : '') ?? '',
      context: (typeof ps === 'object' && ps !== null ? ps.context : '') ?? '',
      costOfInaction: (typeof ps === 'object' && ps !== null ? ps.costOfInaction : '') ?? '',
    },
    trigger: raw.trigger ?? '',
    goals: Array.isArray(raw.goals) ? raw.goals : raw.businessGoal ? [raw.businessGoal] : [],
    nonGoals: Array.isArray(raw.nonGoals)
      ? raw.nonGoals
      : Array.isArray(raw.outOfScope)
        ? raw.outOfScope
        : [],
    userStories: Array.isArray(raw.userStories) ? raw.userStories : [],
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    openQuestions: Array.isArray(raw.openQuestions)
      ? raw.openQuestions
      : Array.isArray(raw.unresolvedQuestions)
        ? raw.unresolvedQuestions
        : [],
    currentState: {
      description: (typeof cs === 'object' && cs !== null ? cs.description : '') ?? '',
      artifacts:
        typeof cs === 'object' && cs !== null && Array.isArray(cs.artifacts) ? cs.artifacts : [],
    },
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : [],
    uiRequirements: Array.isArray(raw.uiRequirements) ? raw.uiRequirements : [],
    readinessScore: typeof raw.readinessScore === 'number' ? raw.readinessScore : 0,
    readyForReview: typeof raw.readyForReview === 'boolean' ? raw.readyForReview : false,
  };
}

function createEmptyDraft(): IntakeDraft {
  return {
    title: '',
    problemStatement: { who: '', what: '', context: '', costOfInaction: '' },
    trigger: '',
    goals: [],
    nonGoals: [],
    userStories: [],
    constraints: [],
    openQuestions: [],
    currentState: { description: '', artifacts: [] },
    assumptions: [],
    uiRequirements: [],
    readinessScore: 0,
    readyForReview: false,
  };
}

export function useDraft(sessionId: string | undefined, workspaceId?: string | undefined) {
  // Workspace-scoped draft query (preferred)
  const { data: wsData, loading: wsLoading } = useQuery(GET_LATEST_DRAFT, {
    variables: { workspaceId },
    skip: !workspaceId,
  });

  // Legacy session-scoped draft query (fallback)
  const { data: legacyData, loading: legacyLoading } = useQuery(GET_DRAFT, {
    variables: { sessionId },
    skip: !sessionId || !!workspaceId,
  });

  const loading = workspaceId ? wsLoading : legacyLoading;

  const [editDraft, { loading: editing }] = useMutation(EDIT_DRAFT);
  const [approveDraft, { loading: approving }] = useMutation(APPROVE_DRAFT);

  // Subscribe to workspace-scoped draft updates
  useSubscription(DRAFT_UPDATED, {
    variables: { workspaceId: workspaceId ?? sessionId },
    skip: !workspaceId && !sessionId,
    onData: ({ client, data: subData }) => {
      const updated = subData.data?.intakeDraftUpdated;
      if (!updated) return;

      if (workspaceId) {
        client.writeQuery({
          query: GET_LATEST_DRAFT,
          variables: { workspaceId },
          data: { intakeLatestDraft: updated },
        });
      } else if (sessionId) {
        client.writeQuery({
          query: GET_DRAFT,
          variables: { sessionId },
          data: { intakeDraft: updated },
        });
      }
    },
  });

  useSubscription(READINESS_UPDATED, {
    variables: { workspaceId: workspaceId ?? sessionId },
    skip: !workspaceId && !sessionId,
  });

  const edit = async (patch: Partial<IntakeDraft>) => {
    if (!sessionId) return;
    await editDraft({ variables: { sessionId, patch } });
  };

  const approve = async (approvedBy: string) => {
    if (!sessionId) return;
    const result = await approveDraft({ variables: { sessionId, approvedBy } });
    return result.data?.approveIntakeDraft;
  };

  // Pick workspace-scoped data if available, else legacy
  const rawDraft = workspaceId
    ? wsData?.intakeLatestDraft?.draftJson
    : legacyData?.intakeDraft?.draft;

  const readinessFromServer = workspaceId
    ? wsData?.intakeLatestDraft?.readinessScore
    : legacyData?.intakeDraft?.readinessScore;

  const version = workspaceId
    ? wsData?.intakeLatestDraft?.version
    : legacyData?.intakeDraft?.version;

  const draft = useMemo(() => {
    if (!rawDraft) return null;
    return normalizeDraft(rawDraft);
  }, [rawDraft]);

  return {
    draft,
    version: version ?? 0,
    readinessScore: readinessFromServer ?? 0,
    loading,
    edit,
    isEditing: editing,
    approve,
    isApproving: approving,
  };
}
