import type { ToolHandler } from '../registry/types.js';
import fs from 'node:fs';
import path from 'node:path';

const MAX_RESULTS = 30;
const MAX_FILE_SIZE = 500_000; // 500KB
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.zip',
  '.tar',
  '.gz',
  '.pdf',
  '.lock',
  '.map',
]);
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  'vendor',
  'target',
]);

interface SearchMatch {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  symbolName?: string;
}

/**
 * Recursively search files for a pattern.
 */
function searchDirectory(
  dir: string,
  pattern: RegExp,
  baseDir: string,
  results: SearchMatch[],
  filePattern?: string,
): void {
  if (results.length >= MAX_RESULTS) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (results.length >= MAX_RESULTS) break;
      if (item.name.startsWith('.')) continue;
      if (IGNORED_DIRS.has(item.name)) continue;

      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        searchDirectory(fullPath, pattern, baseDir, results, filePattern);
      } else {
        // Check file extension filter
        if (filePattern) {
          const ext = path.extname(item.name);
          if (!filePattern.split(',').some((p) => item.name.endsWith(p.trim()))) continue;
        }

        // Skip binary files
        const ext = path.extname(item.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= MAX_RESULTS) break;
            if (pattern.test(lines[i])) {
              const relPath = path.relative(baseDir, fullPath);

              // Try to extract symbol name from common patterns
              let symbolName: string | undefined;
              const fnMatch = lines[i].match(
                /(?:export\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/,
              );
              if (fnMatch) symbolName = fnMatch[1];

              results.push({
                filePath: relPath,
                lineNumber: i + 1,
                lineContent: lines[i].trim().substring(0, 200),
                symbolName,
              });
            }
          }
        } catch {
          // unreadable file
        }
      }
    }
  } catch {
    // permission errors
  }
}

export const codeSearchTool: ToolHandler = {
  tool: {
    id: 'code-search',
    name: 'Code Search',
    description:
      'Search a cloned repository for patterns, component names, or symbols. Returns matching file paths, line numbers, and context.',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 30000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    const cloneDir = input.cloneDir as string;
    const query = input.query as string;
    const filePattern = input.filePattern as string | undefined;

    if (!cloneDir || !query) {
      return { error: 'cloneDir and query are required' };
    }

    if (!fs.existsSync(cloneDir)) {
      return { error: `Clone directory not found: ${cloneDir}. Run repo-discovery first.` };
    }

    try {
      const pattern = new RegExp(query, 'i');
      const results: SearchMatch[] = [];

      searchDirectory(cloneDir, pattern, cloneDir, results, filePattern);

      return {
        query,
        filePattern: filePattern || '*',
        matchCount: results.length,
        matches: results,
        truncated: results.length >= MAX_RESULTS,
      };
    } catch (err) {
      return {
        error: `Search failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  },
};
