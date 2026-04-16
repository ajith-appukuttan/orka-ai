import { useState, useCallback } from 'react';
import { useMutation, useLazyQuery, useSubscription } from '@apollo/client';
import {
  GET_FIGMA_SESSION,
  GET_FIGMA_REPO_MAPPINGS,
  GET_FIGMA_REQUIREMENTS,
} from '../graphql/queries';
import {
  START_FIGMA_INTAKE,
  SELECT_FIGMA_NODES,
  RUN_FIGMA_REPO_DISCOVERY,
  GENERATE_FIGMA_REQUIREMENTS,
  GENERATE_FIGMA_PRD,
} from '../graphql/mutations';
import { FIGMA_EXTRACTION_PROGRESS } from '../graphql/subscriptions';

// ─── Types ─────────────────────────────────────────────
export interface FigmaFrame {
  id: string;
  nodeId: string;
  name: string;
  nodeType: string;
  pageName: string;
  width: number;
  height: number;
  thumbnailUrl: string | null;
}

export interface FigmaComponent {
  id: string;
  nodeId: string;
  name: string;
  componentSetName: string | null;
  description: string | null;
  pageName: string;
}

export interface FigmaSelection {
  id: string;
  nodeId: string;
  nodeType: string;
  selectedAt: string;
}

export interface FigmaSession {
  id: string;
  intakeWorkspaceId: string;
  figmaFileKey: string;
  figmaFileUrl: string;
  fileName: string;
  status: string;
  extractedContext: string | null;
  errorMessage: string | null;
  createdAt: string;
  frames: FigmaFrame[];
  components: FigmaComponent[];
  selections: FigmaSelection[];
}

export interface FigmaRepoMapping {
  id: string;
  figmaComponentName: string;
  filePath: string;
  symbolName: string;
  confidence: number;
  matchReason: string;
}

export interface FigmaRequirement {
  id: string;
  frameNodeId: string | null;
  title: string;
  summary: string;
  requirementType: string;
  acceptanceCriteria: string[];
  codeTargetHints: string[];
  openQuestions: string[];
  confidence: number;
  status: string;
  createdAt: string;
}

// ─── Hook ──────────────────────────────────────────────
export function useFigmaIntake(workspaceId: string | undefined) {
  const [figmaSession, setFigmaSession] = useState<FigmaSession | null>(null);
  const [repoMappings, setRepoMappings] = useState<FigmaRepoMapping[]>([]);
  const [requirements, setRequirements] = useState<FigmaRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // ─── Mutations ─────────────────────────────────────────
  const [startIntakeMutation, { loading: startingIntake }] = useMutation(START_FIGMA_INTAKE);
  const [selectNodesMutation, { loading: selectingNodes }] = useMutation(SELECT_FIGMA_NODES);
  const [runRepoDiscoveryMutation, { loading: runningDiscovery }] =
    useMutation(RUN_FIGMA_REPO_DISCOVERY);
  const [generateRequirementsMutation, { loading: generatingReqs }] = useMutation(
    GENERATE_FIGMA_REQUIREMENTS,
  );
  const [generatePRDMutation, { loading: generatingPRD }] = useMutation(GENERATE_FIGMA_PRD);

  // ─── Lazy Queries ──────────────────────────────────────
  const [fetchSession] = useLazyQuery(GET_FIGMA_SESSION, {
    fetchPolicy: 'network-only',
  });
  const [fetchRepoMappings] = useLazyQuery(GET_FIGMA_REPO_MAPPINGS, {
    fetchPolicy: 'network-only',
  });
  const [fetchRequirements] = useLazyQuery(GET_FIGMA_REQUIREMENTS, {
    fetchPolicy: 'network-only',
  });

  // ─── Subscription ──────────────────────────────────────
  useSubscription(FIGMA_EXTRACTION_PROGRESS, {
    variables: { sessionId: figmaSession?.id },
    skip: !figmaSession?.id || !isExtracting,
    onData: ({ data: subData }) => {
      const progress = subData?.data?.figmaExtractionProgress;
      if (!progress) return;

      if (progress.status === 'extracted' || progress.status === 'error') {
        setIsExtracting(false);
        // Refetch full session to get frames/components
        if (progress.status === 'extracted') {
          refreshSession(figmaSession!.id);
        }
      }

      setFigmaSession((prev) =>
        prev
          ? {
              ...prev,
              status: progress.status,
              fileName: progress.fileName || prev.fileName,
              extractedContext: progress.extractedContext || prev.extractedContext,
              errorMessage: progress.errorMessage || prev.errorMessage,
            }
          : prev,
      );
    },
  });

  // ─── Helpers ───────────────────────────────────────────
  const refreshSession = useCallback(
    async (sessionId: string) => {
      try {
        const { data } = await fetchSession({ variables: { sessionId } });
        const s = data?.figmaDesignSession;
        if (s) setFigmaSession(s);
      } catch (err) {
        console.error('[FigmaIntake] Failed to refresh session:', err);
      }
    },
    [fetchSession],
  );

  // ─── Actions ───────────────────────────────────────────
  const startIntake = useCallback(
    async (figmaUrl: string) => {
      if (!workspaceId) return null;
      setIsLoading(true);
      try {
        const { data } = await startIntakeMutation({
          variables: { workspaceId, figmaUrl },
        });
        const session = data?.startFigmaIntake;
        if (session) {
          setFigmaSession({
            ...session,
            intakeWorkspaceId: workspaceId,
            extractedContext: null,
            errorMessage: null,
            createdAt: new Date().toISOString(),
            frames: [],
            components: [],
            selections: [],
          });
          setIsExtracting(true);
        }
        return session;
      } catch (err) {
        console.error('[FigmaIntake] Failed to start intake:', err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId, startIntakeMutation],
  );

  const selectNodes = useCallback(
    async (nodeIds: string[]) => {
      if (!figmaSession) return null;
      try {
        const { data } = await selectNodesMutation({
          variables: { sessionId: figmaSession.id, nodeIds },
        });
        const selections = data?.selectFigmaNodes;
        if (selections) {
          setFigmaSession((prev) => (prev ? { ...prev, selections } : prev));
        }
        return selections;
      } catch (err) {
        console.error('[FigmaIntake] Failed to select nodes:', err);
        throw err;
      }
    },
    [figmaSession, selectNodesMutation],
  );

  const runRepoDiscovery = useCallback(async () => {
    if (!figmaSession) return null;
    try {
      const { data } = await runRepoDiscoveryMutation({
        variables: { sessionId: figmaSession.id },
      });
      const mappings = data?.runFigmaRepoDiscovery;
      if (mappings) setRepoMappings(mappings);
      return mappings;
    } catch (err) {
      console.error('[FigmaIntake] Failed to run repo discovery:', err);
      throw err;
    }
  }, [figmaSession, runRepoDiscoveryMutation]);

  const generateRequirements = useCallback(async () => {
    if (!figmaSession) return null;
    try {
      const { data } = await generateRequirementsMutation({
        variables: { sessionId: figmaSession.id },
      });
      const reqs = data?.generateFigmaRequirements;
      if (reqs) setRequirements(reqs);
      return reqs;
    } catch (err) {
      console.error('[FigmaIntake] Failed to generate requirements:', err);
      throw err;
    }
  }, [figmaSession, generateRequirementsMutation]);

  const generatePRD = useCallback(async () => {
    if (!figmaSession) return null;
    try {
      const { data } = await generatePRDMutation({
        variables: { sessionId: figmaSession.id },
      });
      return data?.generateFigmaPRD;
    } catch (err) {
      console.error('[FigmaIntake] Failed to generate PRD:', err);
      throw err;
    }
  }, [figmaSession, generatePRDMutation]);

  // Refresh requirements from server
  const refreshRequirements = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { data } = await fetchRequirements({ variables: { workspaceId } });
      const reqs = data?.figmaRequirements;
      if (reqs) setRequirements(reqs);
    } catch (err) {
      console.error('[FigmaIntake] Failed to fetch requirements:', err);
    }
  }, [workspaceId, fetchRequirements]);

  // Refresh repo mappings from server
  const refreshRepoMappings = useCallback(async () => {
    if (!figmaSession) return;
    try {
      const { data } = await fetchRepoMappings({ variables: { sessionId: figmaSession.id } });
      const mappings = data?.figmaRepoMappings;
      if (mappings) setRepoMappings(mappings);
    } catch (err) {
      console.error('[FigmaIntake] Failed to fetch repo mappings:', err);
    }
  }, [figmaSession, fetchRepoMappings]);

  return {
    session: figmaSession,
    frames: figmaSession?.frames ?? [],
    components: figmaSession?.components ?? [],
    selections: figmaSession?.selections ?? [],
    repoMappings,
    requirements,
    startIntake,
    selectNodes,
    runRepoDiscovery,
    generateRequirements,
    generatePRD,
    refreshSession,
    refreshRequirements,
    refreshRepoMappings,
    isLoading: isLoading || startingIntake,
    isExtracting,
    isSelectingNodes: selectingNodes,
    isRunningDiscovery: runningDiscovery,
    isGeneratingRequirements: generatingReqs,
    isGeneratingPRD: generatingPRD,
  };
}
