import { query } from '../db/pool.js';
import {
  generateVisualRequirement,
  type VisualChangeIntent,
  type VisualRequirementContext,
} from '../services/claude.js';
import { VisualRequirementSchema } from '@orka/draft-schema';

export interface GeneratedVisualRequirement {
  id: string;
  title: string;
  summary: string;
  userGoal: string;
  targetArea: string;
  requestedChange: string;
  changeCategory: string | null;
  acceptanceCriteria: string[];
  implementationHints: string[];
  openQuestions: string[];
  confidence: number;
  status: string;
}

/**
 * Generate a structured visual requirement from a change intent.
 * 1. Load existing context (draft + prior requirements) for consistency
 * 2. Call Claude with the visual-intake prompt + context
 * 3. Parse and validate
 * 4. Persist to visual_requirements table
 * 5. Return the saved requirement
 */
export async function runVisualRequirementGenerator(
  workspaceId: string,
  selectionId: string,
  intent: VisualChangeIntent,
): Promise<GeneratedVisualRequirement | null> {
  try {
    // 1. Load existing context for enrichment
    const [draftResult, priorResult] = await Promise.all([
      query(
        `SELECT draft_json FROM intake_draft_versions
         WHERE intake_workspace_id = $1 ORDER BY version DESC LIMIT 1`,
        [workspaceId],
      ),
      query<VisualRequirementContext>(
        `SELECT title, target_area as "targetArea", requested_change as "requestedChange"
         FROM visual_requirements
         WHERE intake_workspace_id = $1 AND status != 'ARCHIVED'
         ORDER BY created_at`,
        [workspaceId],
      ),
    ]);

    const existingContext = {
      currentDraft: draftResult.rows[0]?.draft_json ?? {},
      priorRequirements: priorResult.rows,
    };

    // 2. Call Claude with enriched context
    const rawJson = await generateVisualRequirement(intent, existingContext);

    // 2. Parse
    let parsed: unknown;
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Visual requirement JSON parse failed:', parseErr);
      return null;
    }

    // 3. Validate against schema
    let validated;
    try {
      validated = VisualRequirementSchema.parse(parsed);
    } catch (validationErr) {
      console.error('Visual requirement validation failed:', validationErr);
      return null;
    }

    // Extract changeCategory from the parsed response (not in Zod schema, but Claude may return it)
    const changeCategory = (parsed as Record<string, unknown>).changeCategory as string | undefined;

    // 4. Persist
    const result = await query(
      `INSERT INTO visual_requirements
       (intake_workspace_id, selection_id, title, summary, user_goal, target_area,
        requested_change, change_category, acceptance_criteria, implementation_hints,
        open_questions, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, title, summary, user_goal as "userGoal", target_area as "targetArea",
                 requested_change as "requestedChange", change_category as "changeCategory",
                 acceptance_criteria as "acceptanceCriteria",
                 implementation_hints as "implementationHints",
                 open_questions as "openQuestions", confidence, status`,
      [
        workspaceId,
        selectionId,
        validated.title,
        validated.summary,
        validated.userGoal,
        validated.targetArea,
        validated.requestedChange,
        changeCategory || null,
        JSON.stringify(validated.acceptanceCriteria),
        JSON.stringify(validated.implementationHints),
        JSON.stringify(validated.openQuestions),
        validated.confidence,
      ],
    );

    console.info(
      `Visual requirement generated: "${validated.title}" (confidence: ${validated.confidence})`,
    );
    return result.rows[0] as GeneratedVisualRequirement;
  } catch (err) {
    console.error('Visual requirement generator failed:', err);
    return null;
  }
}
