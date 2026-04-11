import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { GET_MEMORY_ITEMS } from '../graphql/queries';
import { gql } from '@apollo/client';

const ARCHIVE_MEMORY_ITEM = gql`
  mutation ArchiveMemoryItem($itemId: ID!) {
    archiveMemoryItem(itemId: $itemId) {
      id
      status
    }
  }
`;

const MEMORY_UPDATED = gql`
  subscription MemoryUpdated($workspaceId: ID!) {
    intakeMemoryUpdated(workspaceId: $workspaceId) {
      id
      kind
      key
      value
      source
      confidence
      status
      createdAt
    }
  }
`;

interface MemoryItem {
  id: string;
  kind: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  status: string;
  createdAt: string;
}

export function useMemory(workspaceId: string | undefined) {
  const { data, loading, refetch } = useQuery(GET_MEMORY_ITEMS, {
    variables: { workspaceId },
    skip: !workspaceId,
  });

  const [archiveMutation] = useMutation(ARCHIVE_MEMORY_ITEM);

  useSubscription(MEMORY_UPDATED, {
    variables: { workspaceId },
    skip: !workspaceId,
    onData: () => {
      // Refetch on new memory items
      if (workspaceId) refetch();
    },
  });

  const archive = async (itemId: string) => {
    await archiveMutation({ variables: { itemId } });
    refetch();
  };

  return {
    items: (data?.intakeMemoryItems ?? []) as MemoryItem[],
    loading,
    archive,
  };
}
