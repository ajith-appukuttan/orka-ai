import { query } from '../db/pool.js';
import { generateSummary, type ConversationMessage } from '../services/claude.js';

/**
 * Summary refresh rules:
 * - Every 5 turns
 * - When readiness changes by >= 0.15
 * - When session is closed
 */

const TURNS_BETWEEN_SUMMARIES = 5;
const READINESS_CHANGE_THRESHOLD = 0.15;

interface SummaryRefreshContext {
  workspaceId: string;
  sessionId: string;
  conversationHistory: ConversationMessage[];
  currentDraft: Record<string, unknown>;
  currentReadiness: number;
}

/**
 * Check whether a summary refresh is needed and generate one if so.
 */
export async function maybeSummarize(ctx: SummaryRefreshContext): Promise<void> {
  const { workspaceId, sessionId } = ctx;

  try {
    const shouldRefresh = await checkShouldRefresh(workspaceId, sessionId, ctx.currentReadiness);
    if (!shouldRefresh) return;

    // Load previous summary
    const prevResult = await query<{ summary_text: string }>(
      `SELECT summary_text FROM workspace_summaries
       WHERE intake_workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    );
    const previousSummary = prevResult.rows[0]?.summary_text ?? null;

    // Generate new summary
    const summaryText = await generateSummary(
      ctx.conversationHistory,
      ctx.currentDraft,
      previousSummary,
    );

    if (!summaryText.trim()) return;

    // Get the latest message ID to mark what the summary was generated from
    const latestMsgResult = await query<{ id: string }>(
      `SELECT id FROM intake_messages
       WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sessionId],
    );
    const latestMsgId = latestMsgResult.rows[0]?.id ?? null;

    // Persist summary
    const summaryResult = await query(
      `INSERT INTO workspace_summaries (intake_workspace_id, summary_text, generated_from_message_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [workspaceId, summaryText, latestMsgId],
    );

    // Update workspace latest_summary_id
    await query(
      'UPDATE intake_workspaces SET latest_summary_id = $1, updated_at = NOW() WHERE id = $2',
      [summaryResult.rows[0].id, workspaceId],
    );

    console.info(`Summary generated for workspace ${workspaceId}`);
  } catch (err) {
    console.error(`Summary generation failed for workspace ${workspaceId}:`, err);
    // Non-fatal — conversation continues fine without updated summary
  }
}

/**
 * Determine if a summary refresh is needed.
 */
async function checkShouldRefresh(
  workspaceId: string,
  sessionId: string,
  currentReadiness: number,
): Promise<boolean> {
  // Count messages since last summary
  const lastSummary = await query<{ generated_from_message_id: string | null; created_at: string }>(
    `SELECT generated_from_message_id, created_at FROM workspace_summaries
     WHERE intake_workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );

  if (lastSummary.rows.length === 0) {
    // No summary yet — check if we have enough turns
    const msgCount = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM intake_messages
       WHERE session_id = $1 AND role IN ('user', 'assistant')`,
      [sessionId],
    );
    return parseInt(msgCount.rows[0].count) >= TURNS_BETWEEN_SUMMARIES;
  }

  const lastSummaryTime = new Date(lastSummary.rows[0].created_at);

  // Count messages since last summary
  const msgsSinceSummary = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM intake_messages
     WHERE session_id = $1 AND role IN ('user', 'assistant')
     AND created_at > $2`,
    [sessionId, lastSummaryTime.toISOString()],
  );

  const turnsSince = parseInt(msgsSinceSummary.rows[0].count);
  if (turnsSince >= TURNS_BETWEEN_SUMMARIES * 2) {
    // Every 5 turns (user + assistant = 2 messages per turn)
    return true;
  }

  // Check readiness change — get readiness at time of last summary
  const prevDraft = await query<{ readiness_score: number }>(
    `SELECT readiness_score FROM intake_draft_versions
     WHERE intake_workspace_id = $1 AND created_at <= $2
     ORDER BY version DESC LIMIT 1`,
    [workspaceId, lastSummaryTime.toISOString()],
  );

  const prevReadiness = prevDraft.rows[0]?.readiness_score ?? 0;
  if (Math.abs(currentReadiness - prevReadiness) >= READINESS_CHANGE_THRESHOLD) {
    return true;
  }

  return false;
}
