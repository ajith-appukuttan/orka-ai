import crypto from 'node:crypto';
import { query, getClient } from '../../db/pool.js';
import { generateRunId } from '../../services/runId.js';
import { createStorageClient, getArtifactBucket, buildArtifactKey } from '@orka/object-storage';
import { runIntakeReadinessClassifier } from '../../agents/intakeReadinessClassifier.js';
import { pubsub, EVENTS } from '../../pubsub/index.js';

const storageClient = createStorageClient();

export const approvalResolvers = {
  Mutation: {
    approveIntakeDraft: async (
      _: unknown,
      { sessionId, approvedBy }: { sessionId: string; approvedBy: string },
    ) => {
      const client = await getClient();

      try {
        await client.query('BEGIN');

        // 1. Load session with workspace context
        const sessionResult = await client.query(
          `SELECT s.id, s.status, s.tenant_id, s.project_id,
                  s.intake_workspace_id as workspace_id
           FROM intake_sessions s
           WHERE s.id = $1 FOR UPDATE`,
          [sessionId],
        );

        const session = sessionResult.rows[0];
        if (!session) throw new Error(`Session ${sessionId} not found`);
        if (session.status !== 'REVIEWING' && session.status !== 'ACTIVE') {
          throw new Error(`Session must be in REVIEWING or ACTIVE state, got ${session.status}`);
        }

        // 2. Get latest draft (workspace-scoped first, legacy fallback)
        let draftPayload: Record<string, unknown> | null = null;
        let draftVersion = 1;

        if (session.workspace_id) {
          const wsDraft = await client.query(
            `SELECT draft_json, version FROM intake_draft_versions
             WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
            [session.workspace_id],
          );
          if (wsDraft.rows[0]) {
            draftPayload = wsDraft.rows[0].draft_json;
            draftVersion = wsDraft.rows[0].version;
          }
        }

        if (!draftPayload) {
          const legacyDraft = await client.query(
            `SELECT draft, version FROM intake_drafts
             WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
            [sessionId],
          );
          if (legacyDraft.rows[0]) {
            draftPayload = legacyDraft.rows[0].draft;
            draftVersion = legacyDraft.rows[0].version;
          }
        }

        if (!draftPayload) throw new Error('No draft found for session');

        // 3. Generate run ID
        const runId = await generateRunId();

        // 4. Freeze artifact payload
        const artifactJson = JSON.stringify(draftPayload, null, 2);
        const checksum = crypto.createHash('sha256').update(artifactJson).digest('hex');

        // 5. Build object key and write to object storage
        const tenantId = session.tenant_id || 'default';
        const workspaceId = session.workspace_id || sessionId;
        const projectId = session.project_id || workspaceId;
        const bucket = getArtifactBucket();

        const objectKey = buildArtifactKey({
          tenantId,
          workspaceId,
          projectId,
          stage: 'INTAKE',
          runId,
          artifactType: 'PRD',
          version: draftVersion,
        });

        const metadata: Record<string, string> = {
          tenantId,
          workspaceId,
          projectId,
          sessionId,
          runId,
          stage: 'INTAKE',
          artifactType: 'PRD',
          version: String(draftVersion),
          approvedBy,
          approvedAt: new Date().toISOString(),
        };

        await storageClient.putObject({
          bucket,
          key: objectKey,
          body: artifactJson,
          contentType: 'application/json',
          metadata,
        });

        console.info(
          `Artifact stored: ${bucket}/${objectKey} (checksum: ${checksum.substring(0, 12)}...)`,
        );

        // 6. Create approved_artifacts_v2 record
        const artifactResult = await client.query(
          `INSERT INTO approved_artifacts_v2
           (tenant_id, workspace_id, project_id, session_id, run_id,
            stage, artifact_type, version, bucket_name, object_key,
            checksum, content_type, approved_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, tenant_id as "tenantId", workspace_id as "workspaceId",
                     run_id as "runId", stage, artifact_type as "artifactType",
                     version, bucket_name as "bucketName", object_key as "objectKey",
                     checksum, approved_by as "approvedBy", approved_at as "approvedAt",
                     status`,
          [
            tenantId,
            session.workspace_id,
            projectId,
            sessionId,
            runId,
            'INTAKE',
            'PRD',
            draftVersion,
            bucket,
            objectKey,
            checksum,
            'application/json',
            approvedBy,
          ],
        );

        // 7. Also keep legacy record for backward compat
        await client
          .query(
            `INSERT INTO approved_intake_artifacts (session_id, version, artifact, approved_by)
           VALUES ($1, $2, $3, $4)`,
            [sessionId, draftVersion, artifactJson, approvedBy],
          )
          .catch(() => {
            /* ignore if table doesn't exist */
          });

        // 8. Update session and workspace status
        await client.query(
          `UPDATE intake_sessions SET status = 'APPROVED', run_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [runId, sessionId],
        );

        if (session.workspace_id) {
          await client.query(
            `UPDATE intake_workspaces SET status = 'APPROVED', updated_at = NOW()
             WHERE id = $1`,
            [session.workspace_id],
          );
        }

        await client.query('COMMIT');

        console.info(`PRD approved: session=${sessionId}, run=${runId}, key=${objectKey}`);

        // Auto-trigger intake readiness classifier (non-blocking)
        const artifactRow = artifactResult.rows[0];
        const classifierTenantId = session.tenant_id || 'default';
        const classifierWorkspaceId = session.workspace_id;
        if (classifierWorkspaceId) {
          runIntakeReadinessClassifier(
            runId,
            artifactRow.id,
            classifierWorkspaceId,
            classifierTenantId,
            draftPayload as Record<string, unknown>,
          )
            .then(async (decision) => {
              if (!decision) return;

              // Build a human-readable classification message
              const classLabel: Record<string, string> = {
                DIRECT_TO_BUILD: 'Ready for Build',
                NEEDS_ELABORATION: 'Needs Elaboration',
                NEEDS_PLANNING: 'Needs Planning',
                NEEDS_ELABORATION_AND_PLANNING: 'Needs Elaboration & Planning',
                RETURN_TO_INTAKE: 'Return to Intake',
              };

              const emoji: Record<string, string> = {
                DIRECT_TO_BUILD: '',
                NEEDS_ELABORATION: '',
                NEEDS_PLANNING: '',
                NEEDS_ELABORATION_AND_PLANNING: '',
                RETURN_TO_INTAKE: '',
              };

              const label = classLabel[decision.classification] || decision.classification;
              const icon = emoji[decision.classification] || '';

              let content = `## ${icon} Intake Readiness: ${label}\n\n`;
              content += `**Build Readiness Score:** ${Math.round(decision.buildReadinessScore * 100)}% | **Confidence:** ${Math.round(decision.confidence * 100)}%\n\n`;
              content += `${decision.reasoningSummary}\n\n`;

              if (decision.blockingQuestions.length > 0) {
                content += `**Blocking Questions:**\n${decision.blockingQuestions.map((q) => `- ${q}`).join('\n')}\n\n`;
              }

              content += `**Next Stages:** ${decision.requiredNextStages.join(' → ')}\n`;
              content += `\n*Run ID: ${decision.runId}*`;

              // Persist as a system message in the chat
              const msgResult = await query(
                `INSERT INTO intake_messages (session_id, role, content)
               VALUES ($1, 'assistant', $2)
               RETURNING id, session_id as "sessionId", role, content,
                         tool_calls as "toolCalls", created_at as "createdAt"`,
                [sessionId, content],
              );

              // Publish via subscription so the UI picks it up
              if (msgResult.rows[0]) {
                pubsub.publish(EVENTS.MESSAGE_STREAM(sessionId), {
                  intakeMessageStream: msgResult.rows[0],
                });
              }
            })
            .catch((err) => {
              console.error('Intake classifier failed (non-blocking):', err);
            });
        }

        return artifactRow;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  },
};
