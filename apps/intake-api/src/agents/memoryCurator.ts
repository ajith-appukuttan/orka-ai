import { query } from '../db/pool.js';
import { curateMemory, type ConversationMessage } from '../services/claude.js';
import { pubsub, EVENTS } from '../pubsub/index.js';

interface MemoryItem {
  kind: string;
  key: string;
  value: string;
  confidence: number;
}

interface MemoryCuratorContext {
  workspaceId: string;
  conversationHistory: ConversationMessage[];
  currentDraft: Record<string, unknown>;
}

/**
 * Run the Memory Curator:
 * 1. Load existing memory items
 * 2. Call Claude to extract new durable facts
 * 3. Parse and deduplicate
 * 4. Persist new items
 * 5. Publish updates
 */
export async function runMemoryCurator(ctx: MemoryCuratorContext): Promise<void> {
  const { workspaceId } = ctx;

  try {
    // 1. Load existing memory
    const existingResult = await query<{ kind: string; key: string; value: string }>(
      `SELECT kind, key, value FROM intake_memory_items
       WHERE intake_workspace_id = $1 AND status = 'active'`,
      [workspaceId],
    );
    const existingMemory = existingResult.rows;

    // 2. Call Claude to extract new facts
    const rawJson = await curateMemory(ctx.conversationHistory, ctx.currentDraft, existingMemory);

    // 3. Parse
    let newItems: MemoryItem[];
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      newItems = JSON.parse(cleaned);
    } catch {
      console.error(`Memory curator JSON parse failed for workspace ${workspaceId}`);
      return;
    }

    if (!Array.isArray(newItems) || newItems.length === 0) return;

    // 4. Deduplicate against existing items
    const existingKeys = new Set(existingMemory.map((m) => `${m.kind}:${m.key}`));
    const uniqueItems = newItems.filter(
      (item) =>
        item.kind && item.key && item.value && !existingKeys.has(`${item.kind}:${item.key}`),
    );

    if (uniqueItems.length === 0) return;

    // 5. Persist new items
    for (const item of uniqueItems) {
      const result = await query(
        `INSERT INTO intake_memory_items (intake_workspace_id, kind, key, value, source, confidence)
         VALUES ($1, $2, $3, $4, 'conversation', $5)
         RETURNING id, intake_workspace_id as "intakeWorkspaceId",
                   kind, key, value, source, confidence, status,
                   created_at as "createdAt"`,
        [workspaceId, item.kind, item.key, item.value, item.confidence ?? 0.8],
      );

      // 6. Publish each new memory item
      pubsub.publish(EVENTS.MEMORY_UPDATED(workspaceId), {
        intakeMemoryUpdated: result.rows[0],
      });
    }

    console.info(`Memory curator for workspace ${workspaceId}: added ${uniqueItems.length} items`);
  } catch (err) {
    console.error(`Memory curator failed for workspace ${workspaceId}:`, err);
    // Non-fatal
  }
}
