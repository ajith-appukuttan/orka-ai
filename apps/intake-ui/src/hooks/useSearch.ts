import { useState, useCallback, useRef } from 'react';
import { useLazyQuery } from '@apollo/client';
import { SEARCH_INTAKE } from '../graphql/queries';

interface SearchResult {
  workspaceId: string;
  workspaceTitle: string;
  sessionId: string | null;
  sessionTitle: string | null;
  matchType: string;
  matchText: string;
  createdAt: string;
}

export function useSearch(tenantId: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [executeSearch, { loading }] = useLazyQuery(SEARCH_INTAKE, {
    fetchPolicy: 'network-only',
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!query.trim()) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        const { data } = await executeSearch({
          variables: { query: query.trim(), tenantId },
        });
        setResults((data?.searchIntake ?? []) as SearchResult[]);
      }, 300);
    },
    [tenantId, executeSearch],
  );

  return {
    results,
    loading,
    search,
  };
}
