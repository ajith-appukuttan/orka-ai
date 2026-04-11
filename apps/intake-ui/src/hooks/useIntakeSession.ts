import { useMutation, useQuery } from '@apollo/client';
import { START_SESSION } from '../graphql/mutations';
import { GET_SESSION } from '../graphql/queries';

export function useIntakeSession(sessionId?: string) {
  const { data, loading, error } = useQuery(GET_SESSION, {
    variables: { sessionId },
    skip: !sessionId,
  });

  const [startSession, { loading: starting }] = useMutation(START_SESSION);

  const createSession = async (params: {
    projectId: string;
    tenantId: string;
    workspaceId: string;
    userId: string;
    seedPrompt?: string;
  }) => {
    const result = await startSession({ variables: params });
    return result.data?.startIntakeSession;
  };

  return {
    session: data?.intakeSession ?? null,
    loading,
    error,
    createSession,
    isCreating: starting,
  };
}
