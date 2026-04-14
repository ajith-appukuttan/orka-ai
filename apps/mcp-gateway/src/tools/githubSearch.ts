import type { ToolHandler } from '../registry/types.js';

const GITHUB_API = 'https://api.github.com';

function getToken(): string | null {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'orka-mcp-gateway',
  };
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

/**
 * Extract owner/repo from a GitHub URL.
 */
function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

interface SearchMatch {
  filePath: string;
  repoFullName: string;
  htmlUrl: string;
  fragment?: string;
}

/**
 * Search code in a GitHub repo via the Search API.
 * Much faster than cloning -- returns results in 1-2 seconds.
 */
async function searchCode(
  owner: string,
  repo: string,
  query: string,
  fileExtensions?: string[],
): Promise<SearchMatch[]> {
  let q = `${query} repo:${owner}/${repo}`;
  if (fileExtensions && fileExtensions.length > 0) {
    // GitHub search supports extension filter
    q += ' ' + fileExtensions.map((ext) => `extension:${ext}`).join(' ');
  }

  const resp = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=10`, {
    headers: authHeaders(),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GitHub Search API returned ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as {
    total_count: number;
    items: Array<{
      path: string;
      repository: { full_name: string };
      html_url: string;
      text_matches?: Array<{ fragment: string }>;
    }>;
  };

  return data.items.map((item) => ({
    filePath: item.path,
    repoFullName: item.repository.full_name,
    htmlUrl: item.html_url,
    fragment: item.text_matches?.[0]?.fragment,
  }));
}

/**
 * Fetch a single file's content via the Contents API.
 */
async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<{ content: string; size: number } | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${ref}` : ''}`;
  const resp = await fetch(url, { headers: authHeaders() });

  if (!resp.ok) return null;

  const data = (await resp.json()) as {
    content: string;
    encoding: string;
    size: number;
  };

  if (data.encoding === 'base64' && data.content) {
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content: decoded, size: data.size };
  }

  return null;
}

/**
 * Extract search terms from a visual element selection.
 * Produces multiple query strings to maximize hit rate.
 */
function buildSearchQueries(element: Record<string, unknown>): string[] {
  const queries: string[] = [];
  const selector = (element.selector as string) || '';
  const textContent = (element.textContent as string) || '';
  const targetArea = (element.targetArea as string) || '';

  // Extract CSS classes from selector (e.g., "button.submit-btn" → "submit-btn")
  const classMatches = selector.match(/\.([a-zA-Z_-][\w-]*)/g);
  if (classMatches) {
    for (const cls of classMatches) {
      const className = cls.substring(1); // remove leading dot
      if (className.length > 2) queries.push(className);
    }
  }

  // Extract IDs from selector (e.g., "#profile-btn" → "profile-btn")
  const idMatches = selector.match(/#([a-zA-Z_-][\w-]*)/g);
  if (idMatches) {
    for (const id of idMatches) {
      queries.push(id.substring(1));
    }
  }

  // Extract data-testid or aria-label patterns
  const dataAttrMatch = selector.match(/\[data-testid=["']?([^"'\]]+)/);
  if (dataAttrMatch) queries.push(dataAttrMatch[1]);

  // Use tag name if it's a custom component (PascalCase or has a dash)
  const tagMatch = selector.match(/^([A-Z][a-zA-Z]+|[a-z]+-[a-z]+)/);
  if (tagMatch) queries.push(tagMatch[1]);

  // Use meaningful text content (button labels, headings)
  if (textContent && textContent.length >= 3 && textContent.length <= 50) {
    queries.push(`"${textContent}"`);
  }

  // Use target area description
  if (targetArea && targetArea.length > 3) {
    // Extract component-like words (PascalCase)
    const componentWords = targetArea.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g);
    if (componentWords) {
      for (const w of componentWords) {
        if (w.length > 3) queries.push(w);
      }
    }
  }

  // Deduplicate
  return [...new Set(queries)].slice(0, 5);
}

export const githubSearchTool: ToolHandler = {
  tool: {
    id: 'github-search',
    name: 'GitHub Code Search',
    description:
      'Search a GitHub repository for UI elements by selector, class name, component name, or text content. Uses the GitHub Search API — no cloning needed. Returns matching file paths and code fragments.',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 15000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    const repoUrl = input.repoUrl as string;
    const element = (input.element as Record<string, unknown>) || {};
    const searchQuery = input.query as string | undefined;

    if (!repoUrl) {
      return { error: 'repoUrl is required' };
    }

    if (!getToken()) {
      return { error: 'GH_TOKEN or GITHUB_TOKEN is required for GitHub API access' };
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return { error: `Could not parse GitHub owner/repo from URL: ${repoUrl}` };
    }

    // Build search queries from the element or use explicit query
    const queries = searchQuery ? [searchQuery] : buildSearchQueries(element);

    if (queries.length === 0) {
      return { error: 'No searchable terms found in the element data' };
    }

    const uiExtensions = ['tsx', 'jsx', 'ts', 'js', 'vue', 'svelte', 'html', 'css', 'scss'];
    const allMatches: Array<SearchMatch & { query: string }> = [];

    // Run searches in parallel (max 5)
    const searchPromises = queries.map(async (q) => {
      try {
        const matches = await searchCode(parsed.owner, parsed.repo, q, uiExtensions);
        return matches.map((m) => ({ ...m, query: q }));
      } catch (err) {
        console.error(`GitHub search failed for query "${q}":`, err);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    for (const batch of results) {
      allMatches.push(...batch);
    }

    // Deduplicate by filePath, keeping highest-relevance
    const byFile = new Map<string, (typeof allMatches)[0]>();
    for (const match of allMatches) {
      if (!byFile.has(match.filePath)) {
        byFile.set(match.filePath, match);
      }
    }

    const uniqueMatches = [...byFile.values()].slice(0, 10);

    // Fetch content for top 3 matches to provide context
    const filesWithContent: Array<{
      filePath: string;
      htmlUrl: string;
      query: string;
      fragment?: string;
      content?: string;
    }> = [];

    for (const match of uniqueMatches.slice(0, 3)) {
      const file = await fetchFileContent(parsed.owner, parsed.repo, match.filePath);
      filesWithContent.push({
        filePath: match.filePath,
        htmlUrl: match.htmlUrl,
        query: match.query,
        fragment: match.fragment,
        content: file?.content?.substring(0, 5000) || undefined,
      });
    }

    // Remaining matches without content
    for (const match of uniqueMatches.slice(3)) {
      filesWithContent.push({
        filePath: match.filePath,
        htmlUrl: match.htmlUrl,
        query: match.query,
        fragment: match.fragment,
      });
    }

    return {
      repoUrl,
      owner: parsed.owner,
      repo: parsed.repo,
      queriesUsed: queries,
      matchCount: uniqueMatches.length,
      matches: filesWithContent,
    };
  },
};
