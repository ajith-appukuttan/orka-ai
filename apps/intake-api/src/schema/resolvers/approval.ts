import { query, getClient } from '../../db/pool.js';

export const approvalResolvers = {
  Mutation: {
    approveIntakeDraft: async (
      _: unknown,
      { sessionId, approvedBy }: { sessionId: string; approvedBy: string },
    ) => {
      const client = await getClient();

      try {
        await client.query('BEGIN');

        // Verify session is in REVIEWING state
        const sessionResult = await client.query(
          'SELECT status FROM intake_sessions WHERE id = $1 FOR UPDATE',
          [sessionId],
        );

        const session = sessionResult.rows[0];
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== 'REVIEWING' && session.status !== 'ACTIVE') {
          throw new Error(`Session must be in REVIEWING or ACTIVE state, got ${session.status}`);
        }

        // Get latest draft
        const draftResult = await client.query(
          `SELECT draft, version FROM intake_drafts
           WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
          [sessionId],
        );

        const latestDraft = draftResult.rows[0];
        if (!latestDraft) {
          throw new Error('No draft found for session');
        }

        // Get next artifact version
        const artifactVersionResult = await client.query(
          `SELECT COALESCE(MAX(version), 0) + 1 as next_version
           FROM approved_intake_artifacts WHERE session_id = $1`,
          [sessionId],
        );
        const nextVersion = artifactVersionResult.rows[0].next_version;

        // Create immutable artifact
        const artifactResult = await client.query(
          `INSERT INTO approved_intake_artifacts (session_id, version, artifact, approved_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, session_id as "sessionId", version, artifact,
                     approved_by as "approvedBy", approved_at as "approvedAt"`,
          [sessionId, nextVersion, JSON.stringify(latestDraft.draft), approvedBy],
        );

        // Update session status
        await client.query(
          `UPDATE intake_sessions SET status = 'APPROVED', updated_at = NOW()
           WHERE id = $1`,
          [sessionId],
        );

        await client.query('COMMIT');

        // TODO: Emit INTAKE_APPROVED event for pipeline orchestration

        return artifactResult.rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  },
};
