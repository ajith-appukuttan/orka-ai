import type { Job } from 'bullmq';

import { executeBuild } from '../../../intake-api/src/agents/builder/orchestrator.js';
import { query } from '../../../intake-api/src/db/pool.js';
import { pubsub, EVENTS } from '../../../intake-api/src/pubsub/index.js';

export interface BuildData {
  runId: string;
  workspaceId: string;
  tenantId: string;
  approvedArtifactId: string;
  classificationId: string;
  prd: Record<string, unknown>;
  repoUrl: string;
  sessionId: string;
}

export async function processBuild(job: Job<BuildData>): Promise<void> {
  const {
    runId,
    workspaceId,
    tenantId,
    approvedArtifactId,
    classificationId,
    prd,
    repoUrl,
    sessionId,
  } = job.data;

  console.info(`[Build] Starting for run ${runId}`);

  // Post "build in progress" message
  const startMsg = await query(
    `INSERT INTO intake_messages (session_id, role, content, persona)
     VALUES ($1, 'assistant', $2, 'Virtual Builder')
     RETURNING id, session_id as "sessionId", role, content, persona,
               tool_calls as "toolCalls", created_at as "createdAt"`,
    [sessionId, `Build is now in progress. You'll be notified here when it's complete.`],
  );
  if (startMsg.rows[0]) {
    pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
      intakeMessageStream: startMsg.rows[0],
    });
  }

  // Run the build (pass job for lock extension via updateProgress)
  await executeBuild(
    runId,
    workspaceId,
    tenantId,
    approvedArtifactId,
    classificationId,
    prd,
    repoUrl,
    sessionId,
    job,
  );
}
