import { query } from '../../intake-api/src/db/pool.js';
import { transitionWorkspace } from '../../intake-api/src/services/pipelineTransition.js';

/**
 * Time threshold before a build is considered stale.
 * Must be longer than the BullMQ lockDuration (10 min) to avoid
 * racing with stalled job detection.
 */
const STALE_THRESHOLD_MINUTES = 15;

/**
 * Detect and clean up orphaned builds stuck in RUNNING or INITIALIZING.
 *
 * When the agent-worker crashes or restarts mid-build, the build_runs and
 * build_tasks rows stay in RUNNING/INITIALIZING forever because no process
 * is alive to finalize them. This reconciler detects those orphaned rows
 * and marks them as FAILED so the system can retry or surface the failure.
 *
 * When called at startup (isStartup=true), ALL stuck runs are cleaned up
 * regardless of age, since no build can legitimately be running before
 * workers have started processing.
 *
 * When called periodically, only runs older than STALE_THRESHOLD_MINUTES
 * are cleaned up to avoid killing builds that are legitimately in progress.
 */
export async function reconcileStaleRuns(isStartup = false): Promise<void> {
  const staleRuns = await query<{
    id: string;
    run_id: string;
    intake_workspace_id: string;
    status: string;
    started_at: string | null;
  }>(
    isStartup
      ? `SELECT id, run_id, intake_workspace_id, status, started_at
         FROM build_runs
         WHERE status IN ('RUNNING', 'INITIALIZING')`
      : `SELECT id, run_id, intake_workspace_id, status, started_at
         FROM build_runs
         WHERE status IN ('RUNNING', 'INITIALIZING')
           AND (started_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'
                OR (started_at IS NULL AND created_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'))`,
  );

  if (staleRuns.rows.length === 0) {
    if (isStartup) console.info('[Reconcile] No stale builds found');
    return;
  }

  console.warn(
    `[Reconcile] Found ${staleRuns.rows.length} stale build(s): ${staleRuns.rows.map((r: { run_id: string }) => r.run_id).join(', ')}`,
  );

  for (const run of staleRuns.rows) {
    const summary = `Build failed: worker restarted while build was ${run.status}`;

    // Mark any RUNNING/PENDING tasks as FAILED
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

    // Transition workspace to FAILED so the UI reflects reality
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
