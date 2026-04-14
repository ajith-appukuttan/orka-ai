import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { gql } from '@apollo/client';

const PREVIEW_BROWSER_URL = 'http://localhost:4002';

// ─── GraphQL ───────────────────────────────────────────
const START_VISUAL_SESSION = gql`
  mutation StartVisualSession($workspaceId: ID!, $url: String!) {
    startVisualIntakeSession(workspaceId: $workspaceId, url: $url) {
      id
      url
      status
      browserLaunched
    }
  }
`;

const SUBMIT_CHANGE = gql`
  mutation SubmitChange($sessionId: ID!, $selectionId: ID!, $instruction: String!) {
    submitVisualChange(
      sessionId: $sessionId
      selectionId: $selectionId
      instruction: $instruction
    ) {
      id
      title
      summary
      userGoal
      targetArea
      requestedChange
      acceptanceCriteria
      implementationHints
      openQuestions
      confidence
      status
    }
  }
`;

const GET_VISUAL_REQUIREMENTS = gql`
  query GetVisualRequirements($workspaceId: ID!) {
    visualRequirements(workspaceId: $workspaceId) {
      id
      title
      summary
      targetArea
      requestedChange
      acceptanceCriteria
      confidence
      status
    }
  }
`;

// ─── Types ─────────────────────────────────────────────
export interface VisualSession {
  id: string;
  url: string;
  browserLaunched: boolean;
}

export interface SelectedElement {
  id: string;
  selector: string;
  domPath: string;
  textContent: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  ariaRole: string | null;
  elementScreenshot: string | null;
  pageUrl: string;
}

export interface VisualRequirementItem {
  id: string;
  title: string;
  summary: string;
  targetArea: string;
  requestedChange: string;
  acceptanceCriteria: string[];
  confidence: number;
  status: string;
}

// ─── Hook ──────────────────────────────────────────────
export function useVisualIntake(workspaceId: string | undefined) {
  const [session, setSession] = useState<VisualSession | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<
    'idle' | 'launching' | 'running' | 'inspecting'
  >('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastInspectedElement, setLastInspectedElement] = useState<SelectedElement | null>(null);
  const [lastGeneratedRequirement, setLastGeneratedRequirement] = useState<{
    element: SelectedElement;
    instruction: string;
    requirement: VisualRequirementItem;
  } | null>(null);

  const [startSessionMutation, { loading: starting }] = useMutation(START_VISUAL_SESSION);
  const [submitChangeMutation, { loading: submitting }] = useMutation(SUBMIT_CHANGE);

  const { data: reqsData, refetch: refetchReqs } = useQuery(GET_VISUAL_REQUIREMENTS, {
    variables: { workspaceId },
    skip: !workspaceId,
  });

  // Start: launch a real Chrome window
  const startPreview = useCallback(
    async (url: string) => {
      if (!workspaceId) return null;
      setBrowserStatus('launching');
      try {
        const { data } = await startSessionMutation({ variables: { workspaceId, url } });
        const s = data?.startVisualIntakeSession;
        if (s) {
          setSession(s);
          setSelectedElement(null);
          setBrowserStatus('running');
        }
        return s;
      } catch (err) {
        setBrowserStatus('idle');
        throw err;
      }
    },
    [workspaceId, startSessionMutation],
  );

  // Enable inspect mode — inject overlay into Chrome via CDP
  const enableInspect = useCallback(async () => {
    try {
      const response = await fetch(`${PREVIEW_BROWSER_URL}/chrome/inspect/enable`, {
        method: 'POST',
      });
      if (response.ok) {
        setInspectMode(true);
        setBrowserStatus('inspecting');
      }
    } catch (err) {
      console.error('Failed to enable inspect:', err);
    }
  }, []);

  // Disable inspect mode
  const disableInspect = useCallback(async () => {
    try {
      await fetch(`${PREVIEW_BROWSER_URL}/chrome/inspect/disable`, { method: 'POST' });
      setInspectMode(false);
      setBrowserStatus('running');
    } catch (err) {
      console.error('Failed to disable inspect:', err);
    }
  }, []);

  const toggleInspect = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enableInspect();
      } else {
        await disableInspect();
      }
    },
    [enableInspect, disableInspect],
  );

  // Poll for element selection only while inspect mode is active
  useEffect(() => {
    if (!session || !inspectMode) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${PREVIEW_BROWSER_URL}/chrome/inspect/selection`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.selection) {
          const el: SelectedElement = {
            id: crypto.randomUUID(),
            selector: data.selection.selector || '',
            domPath: data.selection.domPath || '',
            textContent: data.selection.textContent || '',
            boundingBox: data.selection.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
            ariaRole: data.selection.ariaRole || null,
            elementScreenshot: data.screenshot || null,
            pageUrl: data.selection.pageUrl || '',
          };
          setSelectedElement(el);
          setLastInspectedElement(el);
        }
      } catch {
        // polling error — ignore
      }
    }, 500); // Poll every 500ms

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [session, inspectMode]);

  // Submit change instruction
  const submitChange = useCallback(
    async (instruction: string) => {
      if (!session || !selectedElement) return null;
      const capturedElement = { ...selectedElement };
      const { data } = await submitChangeMutation({
        variables: { sessionId: session.id, selectionId: selectedElement.id, instruction },
      });
      const req = data?.submitVisualChange;
      if (req) {
        refetchReqs();
        setLastGeneratedRequirement({ element: capturedElement, instruction, requirement: req });
        setSelectedElement(null);
      }
      return req;
    },
    [session, selectedElement, submitChangeMutation, refetchReqs],
  );

  // Close browser
  const closePreview = useCallback(async () => {
    try {
      await fetch(`${PREVIEW_BROWSER_URL}/chrome/close`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    setSession(null);
    setSelectedElement(null);
    setInspectMode(false);
    setBrowserStatus('idle');
  }, []);

  return {
    session,
    selectedElement,
    setSelectedElement,
    inspectMode,
    browserStatus,
    requirements: (reqsData?.visualRequirements ?? []) as VisualRequirementItem[],
    startPreview,
    isStarting: starting,
    toggleInspect,
    submitChange,
    isSubmitting: submitting,
    closePreview,
    lastInspectedElement,
    lastGeneratedRequirement,
    clearLastEvents: useCallback(() => {
      setLastInspectedElement(null);
      setLastGeneratedRequirement(null);
    }, []),
  };
}
