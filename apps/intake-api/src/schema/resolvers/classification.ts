import { query } from '../../db/pool.js';

const CLASSIFICATION_FIELDS = `id, run_id as "runId", approved_artifact_id as "approvedArtifactId",
                classification, build_readiness_score as "buildReadinessScore",
                confidence, reasoning_summary as "reasoningSummary",
                signals, required_next_stages as "requiredNextStages",
                blocking_questions as "blockingQuestions",
                object_key as "objectKey", created_at as "createdAt"`;

export const classificationResolvers = {
  Query: {
    intakeClassification: async (_: unknown, { runId }: { runId: string }) => {
      const result = await query(
        `SELECT ${CLASSIFICATION_FIELDS}
         FROM intake_run_decisions
         WHERE run_id = $1`,
        [runId],
      );
      return result.rows[0] || null;
    },

    intakeClassifications: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT ${CLASSIFICATION_FIELDS}
         FROM intake_run_decisions
         WHERE intake_workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },
  },

  IntakeWorkspace: {
    latestClassification: async (workspace: { id: string }) => {
      const result = await query(
        `SELECT ${CLASSIFICATION_FIELDS}
         FROM intake_run_decisions
         WHERE intake_workspace_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [workspace.id],
      );
      return result.rows[0] || null;
    },
  },
};
