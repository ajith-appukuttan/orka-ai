import { useMemo } from 'react';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { EDIT_DRAFT, APPROVE_DRAFT } from '../graphql/mutations';
import { GET_DRAFT } from '../graphql/queries';
import { DRAFT_UPDATED, READINESS_UPDATED } from '../graphql/subscriptions';
import type { IntakeDraft } from '@orka/draft-schema';

/**
 * Normalize raw draft JSON from DB into the current IntakeDraft shape.
 * Handles old schema (flat fields) gracefully.
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

export function useDraft(sessionId: string | undefined) {
  const { data, loading } = useQuery(GET_DRAFT, {
    variables: { sessionId },
    skip: !sessionId,
  });

  const [editDraft, { loading: editing }] = useMutation(EDIT_DRAFT);
  const [approveDraft, { loading: approving }] = useMutation(APPROVE_DRAFT);

  useSubscription(DRAFT_UPDATED, {
    variables: { sessionId },
    skip: !sessionId,
    onData: ({ client, data: subData }) => {
      const updated = subData.data?.intakeDraftUpdated;
      if (!updated) return;
      client.writeQuery({
        query: GET_DRAFT,
        variables: { sessionId },
        data: { intakeDraft: updated },
      });
    },
  });

  useSubscription(READINESS_UPDATED, {
    variables: { sessionId },
    skip: !sessionId,
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

  const draftData = data?.intakeDraft;
  const rawDraft = draftData?.draft;

  // Normalize: handle old schema format and missing fields
  const draft = useMemo(() => {
    if (!rawDraft) return null;
    return normalizeDraft(rawDraft);
  }, [rawDraft]);

  return {
    draft,
    version: draftData?.version ?? 0,
    readinessScore: draftData?.readinessScore ?? 0,
    loading,
    edit,
    isEditing: editing,
    approve,
    isApproving: approving,
  };
}
