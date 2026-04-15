import { query } from '../../db/pool.js';
import { executeBuild } from '../../agents/builder/orchestrator.js';

const BUILD_RUN_FIELDS = `id, run_id as "runId", repo_url as "repoUrl",
  worktree_branch as "worktreeBranch", status, summary,
  pr_url as "prUrl", pr_number as "prNumber",
  total_tasks as "totalTasks", completed_tasks as "completedTasks",
  failed_tasks as "failedTasks",
  started_at as "startedAt", completed_at as "completedAt",
  created_at as "createdAt"`;

const BUILD_TASK_FIELDS = `id, task_index as "taskIndex", description,
  files_affected as "filesAffected", acceptance_criteria as "acceptanceCriteria",
  status, commit_hash as "commitHash", commit_message as "commitMessage",
  error_message as "errorMessage", review_notes as "reviewNotes",
  started_at as "startedAt", completed_at as "completedAt"`;

export const buildResolvers = {
  Query: {
    buildRun: async (_: unknown, { runId }: { runId: string }) => {
      const result = await query(`SELECT ${BUILD_RUN_FIELDS} FROM build_runs WHERE run_id = $1`, [
        runId,
      ]);
      return result.rows[0] || null;
    },

    buildRuns: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT ${BUILD_RUN_FIELDS} FROM build_runs
         WHERE intake_workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },
  },

  Mutation: {
    triggerBuild: async (
      _: unknown,
      { runId, workspaceId, sessionId }: { runId: string; workspaceId: string; sessionId?: string },
    ) => {
      // Load the classification and PRD
      const classResult = await query(
        `SELECT id, approved_artifact_id FROM intake_run_decisions
         WHERE run_id = $1 AND classification = 'DIRECT_TO_BUILD'`,
        [runId],
      );
      if (classResult.rows.length === 0) {
        throw new Error(`No DIRECT_TO_BUILD classification found for run ${runId}`);
      }

      const classification = classResult.rows[0];

      // Load workspace for tenant and repo info
      const wsResult = await query(
        `SELECT tenant_id, repo_url FROM intake_workspaces WHERE id = $1`,
        [workspaceId],
      );
      if (wsResult.rows.length === 0 || !wsResult.rows[0].repo_url) {
        throw new Error('Workspace not found or no repository configured');
      }

      // Load the approved PRD
      const artifactResult = await query(
        `SELECT object_key, bucket_name FROM approved_artifacts_v2 WHERE id = $1`,
        [classification.approved_artifact_id],
      );

      // Load the draft content
      const draftResult = await query(
        `SELECT draft_json FROM intake_draft_versions
         WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
        [workspaceId],
      );

      const prd = draftResult.rows[0]?.draft_json || {};

      // Return initial build run record, execute async
      const buildRunResult = await query(
        `SELECT ${BUILD_RUN_FIELDS} FROM build_runs WHERE run_id = $1`,
        [runId],
      );

      // Execute build asynchronously
      executeBuild(
        runId,
        workspaceId,
        wsResult.rows[0].tenant_id,
        classification.approved_artifact_id,
        classification.id,
        prd,
        wsResult.rows[0].repo_url,
        sessionId,
      ).catch((err) => {
        console.error(`[Builder] Build failed (async): ${err}`);
      });

      // Return the build run (may still be in INITIALIZING)
      if (buildRunResult.rows.length > 0) {
        return buildRunResult.rows[0];
      }

      // If the record was just created by executeBuild, fetch it
      await new Promise((r) => setTimeout(r, 500));
      const freshResult = await query(
        `SELECT ${BUILD_RUN_FIELDS} FROM build_runs WHERE run_id = $1`,
        [runId],
      );
      return freshResult.rows[0];
    },
  },

  // Field resolver: tasks on BuildRun
  BuildRun: {
    tasks: async (buildRun: { id: string }) => {
      const result = await query(
        `SELECT ${BUILD_TASK_FIELDS} FROM build_tasks
         WHERE build_run_id = $1 ORDER BY task_index`,
        [buildRun.id],
      );
      return result.rows;
    },
  },
};
