import { query } from '../db/pool.js';
import { extractDraft, type ConversationMessage } from '../services/claude.js';
import { validateDraft, computeReadinessScore } from '@orka/draft-schema';
import { pubsub, EVENTS } from '../pubsub/index.js';

/**
 * Run the Draft Extractor agent:
 * 1. Call Claude with the draft-extractor prompt + conversation + current draft
 * 2. Parse and validate the JSON response
 * 3. Compute readiness score
 * 4. Persist new draft version (workspace-scoped if available, legacy fallback)
 * 5. Publish subscription updates
 *
 * On failure, keeps the previous draft intact.
 */
export async function runDraftExtractor(
  sessionId: string,
  workspaceId: string | null,
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
): Promise<void> {
  try {
    // 1. Call Claude to extract structured draft
    const rawJson = await extractDraft(conversationHistory, currentDraft);

    // 2. Parse JSON
    let parsed: unknown;
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error(`Draft extraction JSON parse failed for session ${sessionId}:`, parseErr);
      console.error('Raw response:', rawJson.substring(0, 500));
      return;
    }

    // 3. Validate against Zod schema
    let validatedDraft;
    try {
      validatedDraft = validateDraft(parsed);
    } catch (validationErr) {
      console.error(`Draft validation failed for session ${sessionId}:`, validationErr);
      return;
    }

    // 4. Compute readiness score
    const readinessScore = computeReadinessScore(validatedDraft);
    validatedDraft.readinessScore = readinessScore;
    validatedDraft.readyForReview = readinessScore >= 0.8;

    // 5. Persist — workspace-scoped or legacy
    if (workspaceId) {
      await persistWorkspaceDraft(workspaceId, sessionId, validatedDraft, readinessScore);
    } else {
      await persistLegacyDraft(sessionId, validatedDraft, readinessScore);
    }

    console.info(`Draft extracted for session ${sessionId}: readiness=${readinessScore}`);
  } catch (err) {
    console.error(`Draft extractor pipeline failed for session ${sessionId}:`, err);
  }
}

/**
 * Save draft to workspace-scoped intake_draft_versions table.
 */
async function persistWorkspaceDraft(
  workspaceId: string,
  sessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: any,
  readinessScore: number,
): Promise<void> {
  // Get next version
  const versionResult = await query<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0) as version FROM intake_draft_versions
     WHERE intake_workspace_id = $1`,
    [workspaceId],
  );
  const newVersion = versionResult.rows[0].version + 1;

  // Insert new draft version
  const draftResult = await query(
    `INSERT INTO intake_draft_versions (intake_workspace_id, version, draft_json, readiness_score, ready_for_review)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, intake_workspace_id as "intakeWorkspaceId", version,
               draft_json as "draftJson", readiness_score as "readinessScore",
               ready_for_review as "readyForReview", created_at as "createdAt"`,
    [workspaceId, newVersion, JSON.stringify(draft), readinessScore, readinessScore >= 0.8],
  );

  const savedDraft = draftResult.rows[0];

  // Update workspace latest_draft_id and title when PRD is ready
  const prdTitle = (draft as Record<string, unknown>).title as string | undefined;
  if (readinessScore >= 0.8 && prdTitle && prdTitle.length > 0) {
    await query(
      `UPDATE intake_workspaces SET latest_draft_id = $1, title = $2, updated_at = NOW() WHERE id = $3`,
      [savedDraft.id, prdTitle, workspaceId],
    );
  } else {
    await query(
      `UPDATE intake_workspaces SET latest_draft_id = $1, updated_at = NOW() WHERE id = $2`,
      [savedDraft.id, workspaceId],
    );
  }

  // Update session readiness
  await query(`UPDATE intake_sessions SET readiness_score = $1, updated_at = NOW() WHERE id = $2`, [
    readinessScore,
    sessionId,
  ]);

  // Publish on workspace-scoped channels
  pubsub.publish(EVENTS.DRAFT_UPDATED(workspaceId), {
    intakeDraftUpdated: savedDraft,
  });

  pubsub.publish(EVENTS.READINESS_UPDATED(workspaceId), {
    intakeReadinessUpdated: readinessScore,
  });

  // Also publish on legacy session-scoped channel for backward compat
  pubsub.publish(EVENTS.DRAFT_UPDATED(sessionId), {
    intakeDraftUpdated: {
      id: savedDraft.id,
      sessionId,
      version: newVersion,
      draft: draft,
      readinessScore,
      createdAt: savedDraft.createdAt,
    },
  });
}

/**
 * Legacy: save draft to session-scoped intake_drafts table.
 */
async function persistLegacyDraft(
  sessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: any,
  readinessScore: number,
): Promise<void> {
  const versionResult = await query<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0) as version FROM intake_drafts WHERE session_id = $1`,
    [sessionId],
  );
  const newVersion = versionResult.rows[0].version + 1;

  const draftResult = await query(
    `INSERT INTO intake_drafts (session_id, version, draft, readiness_score)
     VALUES ($1, $2, $3, $4)
     RETURNING id, session_id as "sessionId", version, draft,
               readiness_score as "readinessScore", created_at as "createdAt"`,
    [sessionId, newVersion, JSON.stringify(draft), readinessScore],
  );

  const savedDraft = draftResult.rows[0];

  await query(`UPDATE intake_sessions SET readiness_score = $1, updated_at = NOW() WHERE id = $2`, [
    readinessScore,
    sessionId,
  ]);

  pubsub.publish(EVENTS.DRAFT_UPDATED(sessionId), {
    intakeDraftUpdated: savedDraft,
  });

  pubsub.publish(EVENTS.READINESS_UPDATED(sessionId), {
    intakeReadinessUpdated: readinessScore,
  });
}
