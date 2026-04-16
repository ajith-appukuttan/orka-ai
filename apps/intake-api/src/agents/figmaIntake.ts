import { query } from '../db/pool.js';
import { generateWithPrompt } from '../services/claude.js';
import { invokeTool } from '../services/mcpClient.js';

export interface FigmaDesignContext {
  fileKey: string;
  fileName: string;
  pages: Array<{ id: string; name: string }>;
  frames: Array<{
    nodeId: string;
    name: string;
    pageName: string;
    width: number;
    height: number;
    thumbnailUrl?: string;
  }>;
  components: Array<{
    nodeId: string;
    name: string;
    componentSetName?: string;
    description?: string;
    pageName: string;
  }>;
  extractedText: Array<{ nodeId: string; text: string; parentName: string }>;
}

export interface RepoMapping {
  figmaComponentName: string;
  filePath?: string;
  symbolName?: string;
  confidence: number;
  matchReason?: string;
}

/**
 * Parse a Figma URL into its file key and optional node ID.
 *
 * Supports URLs like:
 *   https://www.figma.com/design/ABC123/File-Name?node-id=1-2
 *   https://www.figma.com/file/ABC123/File-Name
 */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  const parsed = new URL(url);
  // Path format: /design/<fileKey>/... or /file/<fileKey>/...
  const segments = parsed.pathname.split('/').filter(Boolean);
  const keyIndex = segments.findIndex((s) => s === 'design' || s === 'file');
  if (keyIndex === -1 || keyIndex + 1 >= segments.length) {
    throw new Error(`Invalid Figma URL: cannot extract file key from "${url}"`);
  }
  const fileKey = segments[keyIndex + 1];

  const nodeId = parsed.searchParams.get('node-id') ?? undefined;

  return { fileKey, nodeId };
}

/**
 * Extract design context from a Figma file via MCP tools.
 *
 * 1. Fetch file metadata (name, pages)
 * 2. Fetch frames with dimensions
 * 3. Fetch component inventory
 */
export async function extractFigmaDesign(
  sessionId: string,
  fileKey: string,
  tenantId: string,
): Promise<FigmaDesignContext> {
  const [fileResult, framesResult, componentsResult] = await Promise.all([
    invokeTool('figma-design', { action: 'getFile', fileKey }, sessionId, tenantId),
    invokeTool('figma-design', { action: 'getFrames', fileKey }, sessionId, tenantId),
    invokeTool('figma-design', { action: 'getComponents', fileKey }, sessionId, tenantId),
  ]);

  if (fileResult.status !== 'success') {
    throw new Error(`Failed to fetch Figma file metadata: ${fileResult.error || 'unknown error'}`);
  }

  const fileMeta = fileResult.output;
  const frames = (framesResult.output.frames as FigmaDesignContext['frames']) ?? [];
  const components = (componentsResult.output.components as FigmaDesignContext['components']) ?? [];

  return {
    fileKey,
    fileName: (fileMeta.name as string) || fileKey,
    pages: (fileMeta.pages as FigmaDesignContext['pages']) ?? [],
    frames,
    components,
    extractedText: (fileMeta.extractedText as FigmaDesignContext['extractedText']) ?? [],
  };
}

/**
 * Generate structured requirements from selected Figma nodes.
 *
 * Sends design context, selected nodes, and existing repo mappings to Claude
 * using the figma-intake-copilot prompt. Returns a JSON string of requirements.
 */
export async function generateFigmaRequirements(
  sessionId: string,
  selectedNodeIds: string[],
  designContext: FigmaDesignContext,
  repoMappings: RepoMapping[],
): Promise<string> {
  const userContent = JSON.stringify(
    {
      selectedNodeIds,
      designContext,
      repoMappings,
    },
    null,
    2,
  );

  return generateWithPrompt('figma-intake-copilot.md', userContent);
}

/**
 * Discover how Figma design components map to code in a repository.
 *
 * 1. Invoke repo-discovery to get repository structure
 * 2. Search for component names in the codebase
 * 3. Ask Claude to produce component-to-code mappings
 */
export async function runFigmaRepoDiscovery(
  sessionId: string,
  designContext: FigmaDesignContext,
  repoUrl: string,
  tenantId: string,
): Promise<string> {
  // 1. Get repo structure
  const repoResult = await invokeTool('repo-discovery', { repoUrl }, sessionId, tenantId);

  if (repoResult.status !== 'success') {
    throw new Error(`Repo discovery failed: ${repoResult.error || 'unknown error'}`);
  }

  // 2. Search for component names in the codebase
  const componentNames = designContext.components.map((c) => c.name);
  const searchResults: Array<{ componentName: string; matches: unknown }> = [];

  for (const name of componentNames) {
    try {
      const searchResult = await invokeTool(
        'code-search',
        { repoUrl, query: name },
        sessionId,
        tenantId,
      );
      searchResults.push({
        componentName: name,
        matches: searchResult.status === 'success' ? searchResult.output.matches : [],
      });
    } catch {
      searchResults.push({ componentName: name, matches: [] });
    }
  }

  // 3. Ask Claude to produce mappings
  const userContent = JSON.stringify(
    {
      designContext,
      repoStructure: repoResult.output,
      codeSearchResults: searchResults,
    },
    null,
    2,
  );

  return generateWithPrompt('figma-repo-discovery.md', userContent);
}

/**
 * Compose a complete PRD from requirements, repo mappings, and design context.
 *
 * Aggregates all gathered data and asks Claude to produce a structured PRD
 * document (returned as a JSON string).
 */
export async function composeFigmaPRD(
  sessionId: string,
  requirements: unknown[],
  repoMappings: unknown[],
  designContext: FigmaDesignContext,
): Promise<string> {
  const userContent = JSON.stringify(
    {
      requirements,
      repoMappings,
      designContext,
    },
    null,
    2,
  );

  return generateWithPrompt('figma-prd-composer.md', userContent);
}
