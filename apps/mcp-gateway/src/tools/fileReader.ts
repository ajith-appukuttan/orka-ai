import type { ToolHandler } from '../registry/types.js';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_SIZE = 100_000; // 100KB

export const fileReaderTool: ToolHandler = {
  tool: {
    id: 'file-reader',
    name: 'File Reader',
    description:
      'Read the contents of specific files from a cloned repository. Useful for examining component implementations, configs, or entry points.',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 10000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    const cloneDir = input.cloneDir as string;
    const filePaths = input.filePaths as string[];

    if (!cloneDir || !filePaths || !Array.isArray(filePaths)) {
      return { error: 'cloneDir and filePaths (array) are required' };
    }

    if (!fs.existsSync(cloneDir)) {
      return { error: `Clone directory not found: ${cloneDir}. Run repo-discovery first.` };
    }

    // Limit to 10 files per request
    const limitedPaths = filePaths.slice(0, 10);

    const files: Record<string, { content: string | null; size: number; error?: string }> = {};

    for (const filePath of limitedPaths) {
      const fullPath = path.join(cloneDir, filePath);

      // Security: prevent path traversal
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(cloneDir))) {
        files[filePath] = { content: null, size: 0, error: 'Path traversal not allowed' };
        continue;
      }

      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > MAX_FILE_SIZE) {
          files[filePath] = {
            content: null,
            size: stats.size,
            error: `File too large (${stats.size} bytes, max ${MAX_FILE_SIZE})`,
          };
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        files[filePath] = { content, size: stats.size };
      } catch (err) {
        files[filePath] = {
          content: null,
          size: 0,
          error: err instanceof Error ? err.message : 'Failed to read file',
        };
      }
    }

    return {
      cloneDir,
      requestedFiles: limitedPaths.length,
      files,
    };
  },
};
