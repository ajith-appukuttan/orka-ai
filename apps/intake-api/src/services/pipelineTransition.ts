import { query } from '../db/pool.js';

/**
 * Transition a workspace to a new pipeline status with audit logging.
 *
 * Every transition is:
 * 1. Recorded in pipeline_history (immutable audit trail)
 * 2. Applied to intake_workspaces.status
 *
 * No state machine library — this is a linear pipeline with 5 transition
 * points across 2 files. A function is sufficient.
 */
export async function transitionWorkspace(
  workspaceId: string,
  toStatus: string,
  trigger: string,
  runId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Read current status
  const current = await query<{ status: string }>(
    'SELECT status FROM intake_workspaces WHERE id = $1',
    [workspaceId],
  );
  const fromStatus = current.rows[0]?.status;

  if (!fromStatus) {
    console.warn(`[Pipeline] Cannot transition workspace ${workspaceId} — not found`);
    return;
  }

  // Skip no-op transitions
  if (fromStatus === toStatus) {
    return;
  }

  // Apply transition
  await query('UPDATE intake_workspaces SET status = $1, updated_at = NOW() WHERE id = $2', [
    toStatus,
    workspaceId,
  ]);

  // Record in audit trail
  await query(
    `INSERT INTO pipeline_history (workspace_id, from_status, to_status, trigger, run_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [workspaceId, fromStatus, toStatus, trigger, runId || null, JSON.stringify(metadata || {})],
  );

  console.info(
    `[Pipeline] ${workspaceId}: ${fromStatus} → ${toStatus} (trigger: ${trigger}${runId ? `, run: ${runId}` : ''})`,
  );
}
