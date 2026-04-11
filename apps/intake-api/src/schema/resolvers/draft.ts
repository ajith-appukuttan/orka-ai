import { query } from '../../db/pool.js';
import { validateDraftPatch } from '@orka/draft-schema';
import { pubsub, EVENTS } from '../../pubsub/index.js';

export const draftResolvers = {
  Query: {
    // Workspace-scoped: latest draft version
    intakeLatestDraft: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, intake_workspace_id as "intakeWorkspaceId",
                version, draft_json as "draftJson",
                readiness_score as "readinessScore",
                ready_for_review as "readyForReview",
                created_at as "createdAt"
         FROM intake_draft_versions
         WHERE intake_workspace_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0] || null;
    },

    // Legacy: session-scoped draft
    intakeDraft: async (_: unknown, { sessionId }: { sessionId: string }) => {
      const result = await query(
        `SELECT id, session_id as "sessionId", version, draft,
                readiness_score as "readinessScore", created_at as "createdAt"
         FROM intake_drafts
         WHERE session_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] || null;
    },
  },

  Mutation: {
    editIntakeDraft: async (
      _: unknown,
      { sessionId, patch }: { sessionId: string; patch: unknown },
    ) => {
      const validPatch = validateDraftPatch(patch);

      const current = await query(
        `SELECT version, draft FROM intake_drafts
         WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
        [sessionId],
      );

      const currentDraft = current.rows[0]?.draft || {};
      const currentVersion = current.rows[0]?.version || 0;
      const newDraft = { ...currentDraft, ...validPatch };
      const newVersion = currentVersion + 1;

      const result = await query(
        `INSERT INTO intake_drafts (session_id, version, draft, readiness_score)
         VALUES ($1, $2, $3, $4)
         RETURNING id, session_id as "sessionId", version, draft,
                   readiness_score as "readinessScore", created_at as "createdAt"`,
        [sessionId, newVersion, JSON.stringify(newDraft), newDraft.readinessScore || 0],
      );

      const updatedDraft = result.rows[0];

      pubsub.publish(EVENTS.DRAFT_UPDATED(sessionId), {
        intakeDraftUpdated: updatedDraft,
      });
      pubsub.publish(EVENTS.READINESS_UPDATED(sessionId), {
        intakeReadinessUpdated: updatedDraft.readinessScore,
      });

      return updatedDraft;
    },
  },

  Subscription: {
    intakeDraftUpdated: {
      subscribe: (_: unknown, { workspaceId }: { workspaceId: string }) => {
        return pubsub.asyncIterator(EVENTS.DRAFT_UPDATED(workspaceId));
      },
    },
    intakeReadinessUpdated: {
      subscribe: (_: unknown, { workspaceId }: { workspaceId: string }) => {
        return pubsub.asyncIterator(EVENTS.READINESS_UPDATED(workspaceId));
      },
    },
  },
};
