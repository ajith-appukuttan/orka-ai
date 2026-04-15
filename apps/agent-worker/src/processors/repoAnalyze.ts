import type { Job } from 'bullmq';

import { runRepoAnalyzer } from '../../../intake-api/src/agents/repoAnalyzer.js';

export interface RepoAnalyzeData {
  workspaceId: string;
  repoUrl: string;
  branch?: string;
  sessionId?: string;
}

export async function processRepoAnalyze(job: Job<RepoAnalyzeData>): Promise<void> {
  const { workspaceId, repoUrl, branch, sessionId } = job.data;
  console.info(`[RepoAnalyze] Analyzing ${repoUrl} for workspace ${workspaceId}`);
  await runRepoAnalyzer(workspaceId, repoUrl, branch, sessionId);
}
