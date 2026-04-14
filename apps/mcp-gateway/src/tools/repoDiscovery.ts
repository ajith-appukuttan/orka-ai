import type { ToolHandler } from '../registry/types.js';
import { simpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLONE_BASE = path.join(os.tmpdir(), 'orka-repos');
const MAX_FILE_TREE_DEPTH = 4;
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
  '.idea',
  '.vscode',
  'target',
]);

/**
 * Build a file tree from a directory, limited by depth.
 */
function buildFileTree(dir: string, depth: number, relativeTo: string): string[] {
  if (depth <= 0) return [];
  const entries: string[] = [];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.') && item.name !== '.env.example') continue;
      if (IGNORED_DIRS.has(item.name)) continue;

      const relPath = path.relative(relativeTo, path.join(dir, item.name));
      if (item.isDirectory()) {
        entries.push(relPath + '/');
        entries.push(...buildFileTree(path.join(dir, item.name), depth - 1, relativeTo));
      } else {
        entries.push(relPath);
      }
    }
  } catch {
    // permission errors, etc.
  }
  return entries;
}

/**
 * Read a file safely, returning null if it doesn't exist or is too large.
 */
function readFileSafe(filePath: string, maxBytes = 50_000): string | null {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxBytes) return `[file too large: ${stats.size} bytes]`;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Detect package manifests and extract tech stack signals.
 */
function detectManifests(repoDir: string): Record<string, unknown>[] {
  const manifests: Record<string, unknown>[] = [];
  const candidates = [
    'package.json',
    'requirements.txt',
    'Pipfile',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'Gemfile',
    'composer.json',
    'pubspec.yaml',
  ];

  for (const name of candidates) {
    const content = readFileSafe(path.join(repoDir, name));
    if (content && content !== null) {
      manifests.push({ file: name, content: content.substring(0, 5000) });
    }
  }

  // Check for monorepo patterns
  const workspaceFiles = ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json'];
  for (const name of workspaceFiles) {
    const content = readFileSafe(path.join(repoDir, name));
    if (content) {
      manifests.push({ file: name, content: content.substring(0, 2000) });
    }
  }

  return manifests;
}

/**
 * Find config and entry point files.
 */
function findEntryPoints(repoDir: string): string[] {
  const candidates = [
    'src/index.ts',
    'src/index.tsx',
    'src/main.ts',
    'src/main.tsx',
    'src/app.ts',
    'src/app.tsx',
    'src/server.ts',
    'src/App.tsx',
    'index.ts',
    'index.js',
    'main.ts',
    'main.js',
    'server.ts',
    'server.js',
    'app.ts',
    'app.js',
    'app/page.tsx',
    'pages/index.tsx',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
  ];

  return candidates.filter((c) => fs.existsSync(path.join(repoDir, c)));
}

/**
 * Inject a GitHub token into an HTTPS clone URL for private repo access.
 * https://github.com/org/repo.git → https://x-access-token:TOKEN@github.com/org/repo.git
 */
function injectToken(url: string): string {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username) {
      parsed.username = 'x-access-token';
      parsed.password = token;
      return parsed.toString();
    }
  } catch {
    // Not a valid URL (e.g. SSH), return as-is
  }
  return url;
}

export const repoDiscoveryTool: ToolHandler = {
  tool: {
    id: 'repo-discovery',
    name: 'Repository Discovery',
    description:
      'Clone a GitHub repository and extract its structure, tech stack, README, and key components for requirements intake context.',
    category: 'CONTEXT',
    allowedStages: ['ACTIVE'],
    timeoutMs: 60000,
    requiresConfirmation: false,
    tenantScopes: ['*'],
  },
  execute: async (input) => {
    const repoUrl = input.repoUrl as string;
    let branch = (input.branch as string) || '';

    if (!repoUrl) {
      return { error: 'repoUrl is required' };
    }

    // Auto-detect default branch via GitHub API if not specified
    if (!branch) {
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      try {
        // Extract owner/repo from URL
        const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (match && token) {
          const resp = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
          });
          if (resp.ok) {
            const data = (await resp.json()) as { default_branch: string };
            branch = data.default_branch;
          }
        }
      } catch {
        // fall through to default
      }
      if (!branch) branch = 'main';
    }

    // Normalize the URL
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Inject auth token for private repos
    const authenticatedUrl = injectToken(normalizedUrl);

    // Create a unique clone directory
    const repoName = repoUrl.split('/').slice(-2).join('_').replace('.git', '');
    const cloneDir = path.join(CLONE_BASE, `${repoName}_${Date.now()}`);

    try {
      // Ensure base directory exists
      fs.mkdirSync(CLONE_BASE, { recursive: true });

      // Shallow clone (depth=1) for speed
      const git = simpleGit();
      await git.clone(authenticatedUrl, cloneDir, [
        '--depth',
        '1',
        '--branch',
        branch,
        '--single-branch',
      ]);

      // Extract data
      const readme =
        readFileSafe(path.join(cloneDir, 'README.md')) ||
        readFileSafe(path.join(cloneDir, 'readme.md')) ||
        readFileSafe(path.join(cloneDir, 'Readme.md'));

      const fileTree = buildFileTree(cloneDir, MAX_FILE_TREE_DEPTH, cloneDir);
      const manifests = detectManifests(cloneDir);
      const entryPoints = findEntryPoints(cloneDir);

      // Read entry point files for context (limited content)
      const entryPointContents: Record<string, string> = {};
      for (const ep of entryPoints.slice(0, 10)) {
        const content = readFileSafe(path.join(cloneDir, ep), 10_000);
        if (content) {
          entryPointContents[ep] = content;
        }
      }

      return {
        repoUrl,
        branch,
        cloneDir,
        readme: readme?.substring(0, 10_000) || null,
        fileTree: fileTree.slice(0, 500), // limit tree size
        manifests,
        entryPoints,
        entryPointContents,
        fileCount: fileTree.filter((f) => !f.endsWith('/')).length,
        directoryCount: fileTree.filter((f) => f.endsWith('/')).length,
      };
    } catch (err) {
      return {
        error: `Failed to clone repository: ${err instanceof Error ? err.message : 'unknown'}`,
        repoUrl,
      };
    }
  },
};
