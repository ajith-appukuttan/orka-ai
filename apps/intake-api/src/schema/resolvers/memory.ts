import { query } from '../../db/pool.js';
import { pubsub, EVENTS } from '../../pubsub/index.js';

export const memoryResolvers = {
  Query: {
    intakeMemoryItems: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                kind, key, value, source, confidence, status,
                created_at as "createdAt"
         FROM intake_memory_items
         WHERE intake_workspace_id = $1 AND status = 'active'
         ORDER BY created_at`,
        [workspaceId],
      );
      return result.rows;
    },

    searchIntake: async (
      _: unknown,
      { query: searchQuery, tenantId }: { query: string; tenantId: string },
    ) => {
      const pattern = `%${searchQuery}%`;

      // Search across workspaces, sessions, messages, and memory
      const result = await query(
        `SELECT DISTINCT ON (match_key)
           workspace_id as "workspaceId",
           workspace_title as "workspaceTitle",
           session_id as "sessionId",
           session_title as "sessionTitle",
           match_type as "matchType",
           match_text as "matchText",
           created_at as "createdAt"
         FROM (
           -- Workspace title matches
           SELECT w.id as workspace_id, w.title as workspace_title,
                  NULL::uuid as session_id, NULL as session_title,
                  'workspace' as match_type, w.title as match_text,
                  w.created_at, w.id::text as match_key
           FROM intake_workspaces w
           WHERE w.tenant_id = $1 AND w.title ILIKE $2

           UNION ALL

           -- Session title matches
           SELECT s.intake_workspace_id as workspace_id, w.title as workspace_title,
                  s.id as session_id, s.title as session_title,
                  'session' as match_type, s.title as match_text,
                  s.created_at, s.id::text as match_key
           FROM intake_sessions s
           JOIN intake_workspaces w ON w.id = s.intake_workspace_id
           WHERE w.tenant_id = $1 AND s.title ILIKE $2

           UNION ALL

           -- Message content matches
           SELECT s.intake_workspace_id as workspace_id, w.title as workspace_title,
                  s.id as session_id, s.title as session_title,
                  'message' as match_type,
                  SUBSTRING(m.content, 1, 200) as match_text,
                  m.created_at, m.id::text as match_key
           FROM intake_messages m
           JOIN intake_sessions s ON s.id = m.session_id
           JOIN intake_workspaces w ON w.id = s.intake_workspace_id
           WHERE w.tenant_id = $1 AND m.content ILIKE $2

           UNION ALL

           -- Memory item matches
           SELECT mi.intake_workspace_id as workspace_id, w.title as workspace_title,
                  NULL::uuid as session_id, NULL as session_title,
                  'memory' as match_type,
                  mi.key || ': ' || mi.value as match_text,
                  mi.created_at, mi.id::text as match_key
           FROM intake_memory_items mi
           JOIN intake_workspaces w ON w.id = mi.intake_workspace_id
           WHERE w.tenant_id = $1 AND (mi.key ILIKE $2 OR mi.value ILIKE $2)
                 AND mi.status = 'active'
         ) results
         ORDER BY match_key, created_at DESC
         LIMIT 50`,
        [tenantId, pattern],
      );
      return result.rows;
    },
  },

  Mutation: {
    promoteMemoryItem: async (
      _: unknown,
      {
        workspaceId,
        kind,
        key,
        value,
        source,
      }: { workspaceId: string; kind: string; key: string; value: string; source?: string },
    ) => {
      const result = await query(
        `INSERT INTO intake_memory_items (intake_workspace_id, kind, key, value, source, confidence)
         VALUES ($1, $2, $3, $4, $5, 1.0)
         RETURNING id, intake_workspace_id as "intakeWorkspaceId",
                   kind, key, value, source, confidence, status,
                   created_at as "createdAt"`,
        [workspaceId, kind, key, value, source || 'user'],
      );

      const item = result.rows[0];
      pubsub.publish(EVENTS.MEMORY_UPDATED(workspaceId), {
        intakeMemoryUpdated: item,
      });
      return item;
    },

    archiveMemoryItem: async (_: unknown, { itemId }: { itemId: string }) => {
      const result = await query(
        `UPDATE intake_memory_items SET status = 'archived'
         WHERE id = $1
         RETURNING id, intake_workspace_id as "intakeWorkspaceId",
                   kind, key, value, source, confidence, status,
                   created_at as "createdAt"`,
        [itemId],
      );
      return result.rows[0];
    },
  },

  Subscription: {
    intakeMemoryUpdated: {
      subscribe: (_: unknown, { workspaceId }: { workspaceId: string }) => {
        return pubsub.asyncIterator(EVENTS.MEMORY_UPDATED(workspaceId));
      },
    },
  },
};
