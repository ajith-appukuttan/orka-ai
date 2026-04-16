import { query } from '../../db/pool.js';
import { generateChatSummary, type ChatSummaryMessage } from '../../services/claude.js';

/**
 * Load ALL messages across ALL sessions in a workspace, with persona and session metadata.
 * Messages are ordered chronologically across sessions.
 */
async function loadWorkspaceMessages(workspaceId: string): Promise<ChatSummaryMessage[]> {
  const result = await query<{
    role: string;
    content: string;
    persona: string | null;
    session_title: string;
    created_at: string;
  }>(
    `SELECT m.role, m.content, m.persona, s.title as session_title, m.created_at
     FROM intake_messages m
     JOIN intake_sessions s ON s.id = m.session_id
     WHERE s.intake_workspace_id = $1
       AND m.role IN ('user', 'assistant')
     ORDER BY m.created_at ASC`,
    [workspaceId],
  );

  return result.rows.map((row) => ({
    role: row.role,
    content: row.content,
    persona: row.persona,
    sessionTitle: row.session_title,
    createdAt: row.created_at,
  }));
}

/**
 * Load workspace metadata for the summary context.
 */
async function loadWorkspaceContext(workspaceId: string) {
  const wsResult = await query<{ status: string }>(
    'SELECT status FROM intake_workspaces WHERE id = $1',
    [workspaceId],
  );

  const draftResult = await query<{ draft_json: Record<string, unknown>; readiness_score: number }>(
    `SELECT draft_json, readiness_score FROM intake_draft_versions
     WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
    [workspaceId],
  );

  return {
    status: wsResult.rows[0]?.status ?? 'ACTIVE',
    currentDraft: draftResult.rows[0]?.draft_json ?? {},
    readinessScore: draftResult.rows[0]?.readiness_score ?? 0,
  };
}

export const summaryResolvers = {
  Mutation: {
    generateChatSummary: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      // Load all messages across all sessions + workspace context in parallel
      const [messages, context] = await Promise.all([
        loadWorkspaceMessages(workspaceId),
        loadWorkspaceContext(workspaceId),
      ]);

      if (messages.length === 0) {
        return {
          workspaceId,
          summaryMarkdown: 'No conversation history found for this workspace.',
          generatedAt: new Date().toISOString(),
        };
      }

      const summaryMarkdown = await generateChatSummary(
        messages,
        context.currentDraft,
        context.status,
        context.readinessScore,
      );

      return {
        workspaceId,
        summaryMarkdown,
        generatedAt: new Date().toISOString(),
      };
    },
  },
};
