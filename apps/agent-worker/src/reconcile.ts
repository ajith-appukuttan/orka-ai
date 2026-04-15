import { query } from '../../intake-api/src/db/pool.js';
import { transitionWorkspace } from '../../intake-api/src/services/pipelineTransition.js';

/**
 * On worker startup, mark any builds stuck in RUNNING or INITIALIZING as FAILED.
 *
 * When the agent-worker crashes or restarts mid-build, the build_runs and
 * build_tasks rows stay in RUNNING/INITIALIZING state forever because no
 * process is alive to finalize them. This reconciler detects those orphaned
 * rows and marks them as FAILED so the system can retry or surface the failure.
 */
export async function reconcileStaleRuns(): Promise<void> {
  // Find orphaned build runs
  const staleRuns = await query<{
    id: string;
    run_id: string;
    intake_workspace_id: string;
    status: string;
    started_at: string | null;
  }>(
    `SELECT id, run_id, intake_workspace_id, status, started_at
     FROM build_runs
     WHERE status IN ('RUNNING', 'INITIALIZING')`,
  );

  if (staleRuns.rows.length === 0) {
    console.info('[Reconcile] No stale builds found');
    return;
  }

  console.warn(
    `[Reconcile] Found ${staleRuns.rows.length} stale build(s): ${staleRuns.rows.map((r: { run_id: string }) => r.run_id).join(', ')}`,
  );

  for (const run of staleRuns.rows) {
    const summary = `Build failed: worker restarted while build was ${run.status}`;

    // Mark any RUNNING tasks as FAILED
    await query(
      `UPDATE build_tasks
       SET status = 'FAILED',
           error_message = 'Worker restarted — task was in progress',
           completed_at = NOW()
       WHERE build_run_id = $1
         AND status IN ('RUNNING', 'PENDING')`,
      [run.id],
    );

    // Recount completed/failed tasks
    const counts = await query<{ completed: string; failed: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'SUCCESS') AS completed,
         COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
       FROM build_tasks
       WHERE build_run_id = $1`,
      [run.id],
    );

    const completed = parseInt(counts.rows[0]?.completed || '0', 10);
    const failed = parseInt(counts.rows[0]?.failed || '0', 10);

    // Finalize the build run
    await query(
      `UPDATE build_runs
       SET status = 'FAILED',
           summary = $1,
           completed_tasks = $2,
           failed_tasks = $3,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [summary, completed, failed, run.id],
    );

    // Transition workspace back to FAILED so the UI reflects the correct state
    try {
      await transitionWorkspace(run.intake_workspace_id, 'FAILED', 'reconciler', run.run_id, {
        reason: 'worker_restart',
      });
    } catch (err) {
      // Transition may fail if workspace is already in a terminal state — non-fatal
      console.warn(
        `[Reconcile] Could not transition workspace for ${run.run_id}:`,
        err instanceof Error ? err.message : err,
      );
    }

    console.info(`[Reconcile] Marked ${run.run_id} as FAILED (was ${run.status})`);
  }

  console.info(`[Reconcile] Reconciliation complete — ${staleRuns.rows.length} run(s) cleaned up`);
}
