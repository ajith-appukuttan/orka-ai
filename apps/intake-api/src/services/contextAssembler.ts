import { query } from '../db/pool.js';
import type { ConversationMessage } from './claude.js';

const MAX_RECENT_MESSAGES = 20;

export interface VisualRequirementContext {
  title: string;
  targetArea: string;
  requestedChange: string;
  changeCategory?: string;
  status: string;
}

export interface RuntimeContext {
  // Session info
  sessionId: string;
  workspaceId: string | null;
  tenantId: string;

  // Conversation history (recent messages only)
  recentMessages: ConversationMessage[];

  // Current structured draft
  currentDraft: Record<string, unknown>;

  // Rolling summary (replaces full transcript for long sessions)
  summary: string | null;

  // Active memory items (durable project facts)
  memoryItems: Array<{ kind: string; key: string; value: string }>;

  // Open questions from the draft
  openQuestions: string[];

  // Visual requirements captured from UI inspection
  visualRequirements: VisualRequirementContext[];
}

/**
 * Load the workspace ID for a session.
 */
async function loadWorkspaceId(sessionId: string): Promise<string | null> {
  const result = await query<{ intake_workspace_id: string | null }>(
    'SELECT intake_workspace_id FROM intake_sessions WHERE id = $1',
    [sessionId],
  );
  return result.rows[0]?.intake_workspace_id ?? null;
}

/**
 * Load tenant ID for a session.
 */
async function loadTenantId(sessionId: string): Promise<string> {
  const result = await query<{ tenant_id: string }>(
    'SELECT tenant_id FROM intake_sessions WHERE id = $1',
    [sessionId],
  );
  return result.rows[0]?.tenant_id ?? 'default';
}

/**
 * Load recent conversation messages for context window.
 */
async function loadRecentMessages(sessionId: string): Promise<ConversationMessage[]> {
  const result = await query<{ role: string; content: string }>(
    `SELECT role, content FROM intake_messages
     WHERE session_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, MAX_RECENT_MESSAGES],
  );
  return result.rows.reverse().map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }));
}

/**
 * Load current draft — tries workspace-scoped first, falls back to legacy session-scoped.
 */
async function loadCurrentDraft(
  sessionId: string,
  workspaceId: string | null,
): Promise<Record<string, unknown>> {
  // Try workspace-scoped draft first
  if (workspaceId) {
    const result = await query<{ draft_json: Record<string, unknown> }>(
      `SELECT draft_json FROM intake_draft_versions
       WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
      [workspaceId],
    );
    if (result.rows[0]?.draft_json) {
      return result.rows[0].draft_json;
    }
  }

  // Fall back to legacy session-scoped draft
  const result = await query<{ draft: Record<string, unknown> }>(
    `SELECT draft FROM intake_drafts
     WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
    [sessionId],
  );
  return result.rows[0]?.draft ?? {};
}

/**
 * Load the latest workspace summary.
 */
async function loadSummary(workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;

  const result = await query<{ summary_text: string }>(
    `SELECT summary_text FROM workspace_summaries
     WHERE intake_workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  );
  return result.rows[0]?.summary_text ?? null;
}

/**
 * Load active memory items for a workspace.
 */
async function loadMemoryItems(
  workspaceId: string | null,
): Promise<Array<{ kind: string; key: string; value: string }>> {
  if (!workspaceId) return [];

  const result = await query<{ kind: string; key: string; value: string }>(
    `SELECT kind, key, value FROM intake_memory_items
     WHERE intake_workspace_id = $1 AND status = 'active'
     ORDER BY created_at`,
    [workspaceId],
  );
  return result.rows;
}

/**
 * Load visual requirements for context awareness.
 */
async function loadVisualRequirements(
  workspaceId: string | null,
): Promise<VisualRequirementContext[]> {
  if (!workspaceId) return [];

  const result = await query<VisualRequirementContext>(
    `SELECT title, target_area as "targetArea", requested_change as "requestedChange",
            change_category as "changeCategory", status
     FROM visual_requirements
     WHERE intake_workspace_id = $1 AND status != 'ARCHIVED'
     ORDER BY created_at`,
    [workspaceId],
  );
  return result.rows;
}

/**
 * Assemble the full runtime context bundle for a chat turn.
 * This replaces ad-hoc context loading in the pipeline.
 */
export async function assembleContext(sessionId: string): Promise<RuntimeContext> {
  const workspaceId = await loadWorkspaceId(sessionId);
  const tenantId = await loadTenantId(sessionId);

  // Load all context in parallel
  const [recentMessages, currentDraft, summary, memoryItems, visualRequirements] =
    await Promise.all([
      loadRecentMessages(sessionId),
      loadCurrentDraft(sessionId, workspaceId),
      loadSummary(workspaceId),
      loadMemoryItems(workspaceId),
      loadVisualRequirements(workspaceId),
    ]);

  // Extract open questions from draft
  const openQuestions: string[] = Array.isArray(currentDraft.openQuestions)
    ? currentDraft.openQuestions
    : Array.isArray(currentDraft.unresolvedQuestions)
      ? currentDraft.unresolvedQuestions
      : [];

  return {
    sessionId,
    workspaceId,
    tenantId,
    recentMessages,
    currentDraft,
    summary,
    memoryItems,
    openQuestions,
    visualRequirements,
  };
}

/**
 * Format the runtime context as additional system prompt content for Claude.
 * This gives Claude awareness of the current state without replaying the full transcript.
 */
export function formatContextForPrompt(ctx: RuntimeContext): string {
  const parts: string[] = [];

  // Summary (if available, replaces transcript replay)
  if (ctx.summary) {
    parts.push(`## Workspace Summary\n\n${ctx.summary}`);
  }

  // Current draft state
  if (Object.keys(ctx.currentDraft).length > 0) {
    parts.push(
      `## Current Draft PRD State\n\nThe following information has already been captured. Do NOT re-ask about fields that are already filled:\n\n\`\`\`json\n${JSON.stringify(ctx.currentDraft, null, 2)}\n\`\`\``,
    );
  }

  // Memory items
  if (ctx.memoryItems.length > 0) {
    const memoryText = ctx.memoryItems
      .map((m) => `- **[${m.kind}] ${m.key}**: ${m.value}`)
      .join('\n');
    parts.push(
      `## Project Memory\n\nThe following facts have been established in prior sessions. Use them without re-asking:\n\n${memoryText}`,
    );
  }

  // Visual requirements
  if (ctx.visualRequirements.length > 0) {
    const reqText = ctx.visualRequirements
      .map(
        (r) =>
          `- **${r.title}** [${r.status}] — ${r.targetArea}: ${r.requestedChange}${r.changeCategory ? ` (${r.changeCategory})` : ''}`,
      )
      .join('\n');
    parts.push(
      `## Visual UI Requirements\n\nThe following UI changes have been captured via visual inspection. Do NOT re-ask about these:\n\n${reqText}`,
    );
  }

  // Open questions
  if (ctx.openQuestions.length > 0) {
    parts.push(
      `## Open Questions\n\nThese questions are still unanswered. Prioritize asking about these if relevant:\n\n${ctx.openQuestions.map((q) => `- ${q}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
}
