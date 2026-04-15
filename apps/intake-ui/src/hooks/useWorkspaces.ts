import { useMutation, useQuery } from '@apollo/client';
import { GET_WORKSPACES } from '../graphql/queries';
import { CREATE_WORKSPACE, START_SESSION } from '../graphql/mutations';

interface WorkspaceSession {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Workspace {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  readinessScore: number | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
  sessions: WorkspaceSession[];
}

export function useWorkspaces(tenantId: string) {
  const { data, loading, refetch } = useQuery(GET_WORKSPACES, {
    variables: { tenantId },
    pollInterval: 10000, // Refresh every 10s
  });

  const [createWorkspaceMutation, { loading: creating }] = useMutation(CREATE_WORKSPACE, {
    refetchQueries: [{ query: GET_WORKSPACES, variables: { tenantId } }],
  });

  const [startSessionMutation, { loading: startingSession }] = useMutation(START_SESSION, {
    refetchQueries: [{ query: GET_WORKSPACES, variables: { tenantId } }],
  });

  const createWorkspace = async (title: string) => {
    const result = await createWorkspaceMutation({
      variables: { tenantId, title, createdBy: 'user-1' },
    });
    return result.data?.createIntakeWorkspace;
  };

  const startSession = async (workspaceId: string, title?: string) => {
    const result = await startSessionMutation({
      variables: { workspaceId, userId: 'user-1', title },
    });
    return result.data?.startIntakeSession;
  };

  return {
    workspaces: (data?.intakeWorkspaces ?? []) as Workspace[],
    loading,
    refetch,
    createWorkspace,
    isCreating: creating,
    startSession,
    isStartingSession: startingSession,
  };
}
