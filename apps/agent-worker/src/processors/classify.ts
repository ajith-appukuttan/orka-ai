import type { Job } from 'bullmq';

import { runIntakeReadinessClassifier } from '../../../intake-api/src/agents/intakeReadinessClassifier.js';
import { transitionWorkspace } from '../../../intake-api/src/services/pipelineTransition.js';
import { query } from '../../../intake-api/src/db/pool.js';
import { pubsub, EVENTS } from '../../../intake-api/src/pubsub/index.js';
import { buildQueue } from '../../../intake-api/src/jobs/queues.js';

export interface ClassifyData {
  runId: string;
  approvedArtifactId: string;
  workspaceId: string;
  tenantId: string;
  sessionId: string;
  prd: Record<string, unknown>;
}

export async function processClassify(job: Job<ClassifyData>): Promise<void> {
  const { runId, approvedArtifactId, workspaceId, tenantId, sessionId, prd } = job.data;

  console.info(`[Classify] Processing run ${runId}`);

  const decision = await runIntakeReadinessClassifier(
    runId,
    approvedArtifactId,
    workspaceId,
    tenantId,
    prd,
  );

  if (!decision) {
    console.error(`[Classify] Failed for run ${runId}`);
    return;
  }

  // Post classifier message to chat
  const classLabel: Record<string, string> = {
    DIRECT_TO_BUILD: 'Ready for Build',
    NEEDS_ELABORATION: 'Needs Elaboration',
    NEEDS_PLANNING: 'Needs Planning',
    NEEDS_ELABORATION_AND_PLANNING: 'Needs Elaboration & Planning',
    RETURN_TO_INTAKE: 'Return to Intake',
  };
  const label = classLabel[decision.classification] || decision.classification;

  let content = `## Intake Readiness: ${label}\n\n`;
  content += `**Build Readiness Score:** ${Math.round(decision.buildReadinessScore * 100)}% | **Confidence:** ${Math.round(decision.confidence * 100)}%\n\n`;
  content += `${decision.reasoningSummary}\n\n`;
  if (decision.blockingQuestions.length > 0) {
    content += `**Blocking Questions:**\n${decision.blockingQuestions.map((q) => `- ${q}`).join('\n')}\n\n`;
  }
  content += `**Next Stages:** ${decision.requiredNextStages.join(' → ')}\n\n`;
  content += `---\n\n[Review Approved PRD](/review/${workspaceId}/${sessionId})\n\n`;
  content += `*Run ID: ${decision.runId}*`;

  const msgResult = await query(
    `INSERT INTO intake_messages (session_id, role, content, persona)
     VALUES ($1, 'assistant', $2, 'Virtual Classifier')
     RETURNING id, session_id as "sessionId", role, content, persona,
               tool_calls as "toolCalls", created_at as "createdAt"`,
    [sessionId, content],
  );
  if (msgResult.rows[0]) {
    pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
      intakeMessageStream: msgResult.rows[0],
    });
  }

  // Route based on classification
  const routeMap: Record<string, string> = {
    DIRECT_TO_BUILD: 'BUILDING',
    NEEDS_ELABORATION: 'ELABORATING',
    NEEDS_PLANNING: 'PLANNING',
    NEEDS_ELABORATION_AND_PLANNING: 'ELABORATING',
    RETURN_TO_INTAKE: 'ACTIVE',
  };
  const nextStatus = routeMap[decision.classification] || 'APPROVED';
  await transitionWorkspace(workspaceId, nextStatus, 'classifier', runId, {
    classification: decision.classification,
  });

  // If DIRECT_TO_BUILD, enqueue build job
  if (decision.classification === 'DIRECT_TO_BUILD') {
    const wsResult = await query(`SELECT repo_url FROM intake_workspaces WHERE id = $1`, [
      workspaceId,
    ]);
    const repoUrl = wsResult.rows[0]?.repo_url;
    if (repoUrl) {
      await buildQueue.add('build', {
        runId,
        workspaceId,
        tenantId,
        approvedArtifactId,
        classificationId: decision.id,
        prd,
        repoUrl,
        sessionId,
      });
      console.info(`[Classify] Enqueued build for run ${runId}`);
    }
  }
}
