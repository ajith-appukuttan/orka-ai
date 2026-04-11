import { query } from '../../db/pool.js';

export const workspaceResolvers = {
  Query: {
    intakeWorkspaces: async (_: unknown, { tenantId }: { tenantId: string }) => {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", title, status,
                latest_draft_id as "latestDraftId",
                latest_summary_id as "latestSummaryId",
                created_by as "createdBy",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM intake_workspaces
         WHERE tenant_id = $1 AND status != 'ARCHIVED'
         ORDER BY updated_at DESC`,
        [tenantId],
      );
      return result.rows;
    },

    intakeWorkspace: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", title, status,
                latest_draft_id as "latestDraftId",
                latest_summary_id as "latestSummaryId",
                created_by as "createdBy",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM intake_workspaces WHERE id = $1`,
        [workspaceId],
      );
      return result.rows[0] || null;
    },
  },

  Mutation: {
    createIntakeWorkspace: async (
      _: unknown,
      { tenantId, title, createdBy }: { tenantId: string; title: string; createdBy: string },
    ) => {
      const result = await query(
        `INSERT INTO intake_workspaces (tenant_id, title, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, tenant_id as "tenantId", title, status,
                   latest_draft_id as "latestDraftId",
                   latest_summary_id as "latestSummaryId",
                   created_by as "createdBy",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [tenantId, title, createdBy],
      );
      return result.rows[0];
    },

    renameIntakeWorkspace: async (
      _: unknown,
      { workspaceId, title }: { workspaceId: string; title: string },
    ) => {
      const result = await query(
        `UPDATE intake_workspaces SET title = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, tenant_id as "tenantId", title, status,
                   latest_draft_id as "latestDraftId",
                   latest_summary_id as "latestSummaryId",
                   created_by as "createdBy",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [title, workspaceId],
      );
      return result.rows[0];
    },

    archiveIntakeWorkspace: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `UPDATE intake_workspaces SET status = 'ARCHIVED', updated_at = NOW()
         WHERE id = $1
         RETURNING id, tenant_id as "tenantId", title, status,
                   latest_draft_id as "latestDraftId",
                   latest_summary_id as "latestSummaryId",
                   created_by as "createdBy",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [workspaceId],
      );
      return result.rows[0];
    },
  },

  // Field resolvers for IntakeWorkspace type
  IntakeWorkspace: {
    sessions: async (workspace: { id: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                user_id as "userId", title, status,
                readiness_score as "readinessScore",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM intake_sessions
         WHERE intake_workspace_id = $1 AND status != 'ARCHIVED'
         ORDER BY updated_at DESC`,
        [workspace.id],
      );
      return result.rows;
    },

    latestDraft: async (workspace: { latestDraftId: string | null }) => {
      if (!workspace.latestDraftId) return null;
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                version, draft_json as "draftJson",
                readiness_score as "readinessScore",
                ready_for_review as "readyForReview",
                created_at as "createdAt"
         FROM intake_draft_versions WHERE id = $1`,
        [workspace.latestDraftId],
      );
      return result.rows[0] || null;
    },

    readinessScore: async (workspace: { latestDraftId: string | null }) => {
      if (!workspace.latestDraftId) return 0;
      const result = await query<{ readiness_score: number }>(
        'SELECT readiness_score FROM intake_draft_versions WHERE id = $1',
        [workspace.latestDraftId],
      );
      return result.rows[0]?.readiness_score ?? 0;
    },
  },
};
