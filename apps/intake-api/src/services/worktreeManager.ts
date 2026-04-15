import { simpleGit, SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WORKTREE_BASE = process.env.WORKTREE_BASE || path.join(os.tmpdir(), 'orka-worktrees');

export interface WorktreeInfo {
  runId: string;
  repoUrl: string;
  baseBranch: string;
  worktreeBranch: string;
  worktreePath: string;
  repoPath: string;
}

/**
 * Inject GitHub token into HTTPS clone URL for private repos.
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
    /* not a valid URL */
  }
  return url;
}

/**
 * Auto-detect the default branch of a GitHub repo.
 */
async function detectDefaultBranch(repoUrl: string): Promise<string> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match && token) {
      const resp = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { default_branch: string };
        return data.default_branch;
      }
    }
  } catch {
    /* fall through */
  }
  return 'main';
}

/**
 * Initialize a run workspace: clone the repo and create an isolated worktree.
 */
export async function createWorktree(
  runId: string,
  repoUrl: string,
  baseBranch?: string,
): Promise<WorktreeInfo> {
  const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;
  const authenticatedUrl = injectToken(normalizedUrl);
  const branch = baseBranch || (await detectDefaultBranch(repoUrl));

  // Repo name for directory
  const repoName = repoUrl.split('/').slice(-2).join('_').replace('.git', '');
  const repoPath = path.join(WORKTREE_BASE, repoName);
  const worktreeBranch = `run/${runId}`;
  const worktreePath = path.join(WORKTREE_BASE, '.worktrees', `run-${runId}`);

  // Ensure base directory exists
  fs.mkdirSync(WORKTREE_BASE, { recursive: true });
  fs.mkdirSync(path.join(WORKTREE_BASE, '.worktrees'), { recursive: true });

  // Clone repo if not already cloned (shallow for speed)
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    console.info(`[Worktree] Cloning ${repoUrl} (branch: ${branch})...`);
    const git = simpleGit();
    await git.clone(authenticatedUrl, repoPath, ['--branch', branch, '--single-branch']);
  } else {
    // Pull latest
    console.info(`[Worktree] Pulling latest for ${repoUrl}...`);
    const git = simpleGit(repoPath);
    await git.pull('origin', branch);
  }

  // Create worktree with a new branch
  const repoGit = simpleGit(repoPath);

  // Remove existing worktree if it exists (re-run scenario)
  if (fs.existsSync(worktreePath)) {
    console.info(`[Worktree] Removing existing worktree at ${worktreePath}`);
    await repoGit.raw(['worktree', 'remove', '--force', worktreePath]).catch(() => {
      // Force remove directory if git worktree remove fails
      fs.rmSync(worktreePath, { recursive: true, force: true });
    });
    // Delete branch if it exists
    await repoGit.raw(['branch', '-D', worktreeBranch]).catch(() => {});
  }

  console.info(`[Worktree] Creating worktree: ${worktreePath} (branch: ${worktreeBranch})`);
  await repoGit.raw(['worktree', 'add', worktreePath, '-b', worktreeBranch]);

  return {
    runId,
    repoUrl,
    baseBranch: branch,
    worktreeBranch,
    worktreePath,
    repoPath,
  };
}

/**
 * Get a SimpleGit instance bound to a worktree.
 */
export function getWorktreeGit(worktreePath: string): SimpleGit {
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree not found: ${worktreePath}`);
  }
  return simpleGit(worktreePath);
}

/**
 * Commit changes in a worktree with a structured message.
 */
export async function commitInWorktree(
  worktreePath: string,
  runId: string,
  message: string,
): Promise<string> {
  const git = getWorktreeGit(worktreePath);
  await git.add('.');
  const result = await git.commit(`[run:${runId}] ${message}`);
  return result.commit || '';
}

/**
 * Push the worktree branch to remote.
 */
export async function pushWorktree(worktreePath: string, branch: string): Promise<void> {
  const git = getWorktreeGit(worktreePath);
  await git.push('origin', branch, ['--set-upstream']);
}

/**
 * Create a PR using the GitHub API.
 */
export async function createPullRequest(
  repoUrl: string,
  branch: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<{ url: string; number: number } | null> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('[Worktree] No GH_TOKEN — cannot create PR');
    return null;
  }

  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;

  const resp = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      head: branch,
      base: baseBranch,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[Worktree] PR creation failed: ${resp.status} ${err}`);
    return null;
  }

  const data = (await resp.json()) as { html_url: string; number: number };
  return { url: data.html_url, number: data.number };
}

/**
 * Clean up a worktree after completion.
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  try {
    const git = simpleGit(repoPath);
    await git.raw(['worktree', 'remove', '--force', worktreePath]);
    await git.raw(['branch', '-D', branch]).catch(() => {});
    console.info(`[Worktree] Cleaned up: ${worktreePath}`);
  } catch (err) {
    console.warn(`[Worktree] Cleanup failed (non-fatal):`, err);
  }
}

/**
 * Read a file from the worktree.
 */
export function readWorktreeFile(worktreePath: string, filePath: string): string | null {
  const fullPath = path.join(worktreePath, filePath);
  // Security: prevent path traversal
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(worktreePath))) return null;
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write a file to the worktree.
 */
export function writeWorktreeFile(worktreePath: string, filePath: string, content: string): void {
  const fullPath = path.join(worktreePath, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(worktreePath))) {
    throw new Error('Path traversal not allowed');
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

/**
 * List files in the worktree matching a pattern.
 */
export function listWorktreeFiles(worktreePath: string, dir: string = '.'): string[] {
  const fullDir = path.join(worktreePath, dir);
  const resolved = path.resolve(fullDir);
  if (!resolved.startsWith(path.resolve(worktreePath))) return [];

  const IGNORED = new Set([
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

  function walk(d: string, rel: string): string[] {
    const entries: string[] = [];
    try {
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        if (item.name.startsWith('.') && item.name !== '.env.example') continue;
        if (IGNORED.has(item.name)) continue;
        const relPath = path.join(rel, item.name);
        if (item.isDirectory()) {
          entries.push(...walk(path.join(d, item.name), relPath));
        } else {
          entries.push(relPath);
        }
      }
    } catch {
      /* permission */
    }
    return entries;
  }

  return walk(fullDir, dir === '.' ? '' : dir);
}
