import type { ToolHandler } from '../registry/types.js';

/**
 * Figma Design tool — proxies requests to an external Figma MCP server.
 *
 * The Figma MCP server (e.g. @anthropic/figma-mcp or a custom one) runs
 * as a separate service and exposes design extraction capabilities.
 * This tool acts as a gateway proxy, translating MCP gateway calls into
 * Figma MCP server calls.
 *
 * Supported actions:
 *   - getFile: fetch file metadata (name, pages, components)
 *   - getFrames: extract frames/screens from a file
 *   - getComponents: list components in a file
 *   - getNodeDetails: get details for specific node IDs
 *   - getImages: get rendered images/thumbnails for nodes
 */

const FIGMA_MCP_URL = process.env.FIGMA_MCP_URL || 'http://localhost:4003';

interface FigmaToolInput {
  action: 'getFile' | 'getFrames' | 'getComponents' | 'getNodeDetails' | 'getImages';
  fileKey: string;
  nodeIds?: string[];
  depth?: number;
}

async function callFigmaMcp(
  action: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${FIGMA_MCP_URL}/figma/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Figma MCP error (${response.status}): ${text}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export const figmaDesignTool: ToolHandler = {
  tool: {
    id: 'figma-design',
    name: 'Figma Design Extractor',
    description:
      'Extract design data from Figma files including frames, components, text content, layout structure, and design tokens via the Figma MCP server.',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 30000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    const { action, fileKey, nodeIds, depth } = input as unknown as FigmaToolInput;

    if (!fileKey) {
      return { error: 'fileKey is required' };
    }

    if (!action) {
      return {
        error:
          'action is required. One of: getFile, getFrames, getComponents, getNodeDetails, getImages',
      };
    }

    try {
      switch (action) {
        case 'getFile':
          return await callFigmaMcp('getFile', { fileKey, depth: depth ?? 2 });

        case 'getFrames':
          return await callFigmaMcp('getFrames', { fileKey });

        case 'getComponents':
          return await callFigmaMcp('getComponents', { fileKey });

        case 'getNodeDetails':
          if (!nodeIds || nodeIds.length === 0) {
            return { error: 'nodeIds is required for getNodeDetails' };
          }
          return await callFigmaMcp('getNodeDetails', { fileKey, nodeIds });

        case 'getImages':
          if (!nodeIds || nodeIds.length === 0) {
            return { error: 'nodeIds is required for getImages' };
          }
          return await callFigmaMcp('getImages', { fileKey, nodeIds });

        default:
          return { error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return {
        error: `Figma MCP call failed: ${err instanceof Error ? err.message : 'unknown'}`,
        action,
        fileKey,
      };
    }
  },
};
