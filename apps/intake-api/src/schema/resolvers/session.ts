import { query } from '../../db/pool.js';

export const sessionResolvers = {
  Query: {
    intakeSessions: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                user_id as "userId", title, status,
                readiness_score as "readinessScore",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM intake_sessions
         WHERE intake_workspace_id = $1
         ORDER BY updated_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },

    intakeSession: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                project_id as "projectId",
                tenant_id as "tenantId",
                user_id as "userId", title, status,
                readiness_score as "readinessScore",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM intake_sessions WHERE id = $1`,
        [sessionId],
      );
      return result.rows[0] || null;
    },
  },

  Mutation: {
    // New workspace-based session creation
    startIntakeSession: async (
      _: unknown,
      { workspaceId, userId, title }: { workspaceId: string; userId: string; title?: string },
    ) => {
      // Get workspace tenant for the session
      const ws = await query<{ tenant_id: string }>(
        'SELECT tenant_id FROM intake_workspaces WHERE id = $1',
        [workspaceId],
      );
      const tenantId = ws.rows[0]?.tenant_id ?? 'default';

      const sessionTitle = title || 'New Session';
      const result = await query(
        `INSERT INTO intake_sessions (intake_workspace_id, tenant_id, workspace_id, user_id, title, project_id)
         VALUES ($1, $2, $2, $3, $4, gen_random_uuid())
         RETURNING id, intake_workspace_id as "intakeWorkspaceId",
                   user_id as "userId", title, status,
                   readiness_score as "readinessScore",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [workspaceId, tenantId, userId, sessionTitle],
      );

      const session = result.rows[0];

      // Update workspace updated_at
      await query('UPDATE intake_workspaces SET updated_at = NOW() WHERE id = $1', [workspaceId]);

      // Initialize empty draft version for this workspace if none exists
      const existingDraft = await query(
        'SELECT id FROM intake_draft_versions WHERE intake_workspace_id = $1 LIMIT 1',
        [workspaceId],
      );
      if (existingDraft.rows.length === 0) {
        const draftResult = await query(
          `INSERT INTO intake_draft_versions (intake_workspace_id, version, draft_json, readiness_score)
           VALUES ($1, 1, '{}', 0)
           RETURNING id`,
          [workspaceId],
        );
        await query('UPDATE intake_workspaces SET latest_draft_id = $1 WHERE id = $2', [
          draftResult.rows[0].id,
          workspaceId,
        ]);
      }

      return session;
    },

    // Legacy session creation (backward compat)
    startLegacyIntakeSession: async (
      _: unknown,
      args: { projectId: string; tenantId: string; workspaceId: string; userId: string },
    ) => {
      const result = await query(
        `INSERT INTO intake_sessions (project_id, tenant_id, workspace_id, user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, project_id as "projectId", tenant_id as "tenantId",
                   workspace_id as "workspaceId", user_id as "userId",
                   status, readiness_score as "readinessScore",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [args.projectId, args.tenantId, args.workspaceId, args.userId],
      );
      return result.rows[0];
    },

    archiveIntakeSession: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `UPDATE intake_sessions SET status = 'ARCHIVED', updated_at = NOW()
         WHERE id = $1
         RETURNING id, intake_workspace_id as "intakeWorkspaceId",
                   user_id as "userId", title, status,
                   readiness_score as "readinessScore",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [sessionId],
      );
      return result.rows[0];
    },
  },

  // Field resolvers for IntakeSession type
  IntakeSession: {
    messages: async (session: { id: string }) => {
      const result = await query(
        `SELECT id, session_id as "sessionId", role, content,
                tool_calls as "toolCalls", created_at as "createdAt"
         FROM intake_messages
         WHERE session_id = $1
         ORDER BY created_at ASC`,
        [session.id],
      );
      return result.rows;
    },
  },
};
