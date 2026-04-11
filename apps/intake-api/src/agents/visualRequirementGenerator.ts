import { query } from '../db/pool.js';
import { generateVisualRequirement, type VisualChangeIntent } from '../services/claude.js';
import { VisualRequirementSchema } from '@orka/draft-schema';

export interface GeneratedVisualRequirement {
  id: string;
  title: string;
  summary: string;
  userGoal: string;
  targetArea: string;
  requestedChange: string;
  acceptanceCriteria: string[];
  implementationHints: string[];
  openQuestions: string[];
  confidence: number;
}

/**
 * Generate a structured visual requirement from a change intent.
 * 1. Call Claude with the visual-intake prompt
 * 2. Parse and validate
 * 3. Persist to visual_requirements table
 * 4. Return the saved requirement
 */
export async function runVisualRequirementGenerator(
  workspaceId: string,
  selectionId: string,
  intent: VisualChangeIntent,
): Promise<GeneratedVisualRequirement | null> {
  try {
    // 1. Call Claude
    const rawJson = await generateVisualRequirement(intent);

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

    // 4. Persist
    const result = await query(
      `INSERT INTO visual_requirements
       (intake_workspace_id, selection_id, title, summary, user_goal, target_area,
        requested_change, acceptance_criteria, implementation_hints, open_questions, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, summary, user_goal as "userGoal", target_area as "targetArea",
                 requested_change as "requestedChange",
                 acceptance_criteria as "acceptanceCriteria",
                 implementation_hints as "implementationHints",
                 open_questions as "openQuestions", confidence`,
      [
        workspaceId,
        selectionId,
        validated.title,
        validated.summary,
        validated.userGoal,
        validated.targetArea,
        validated.requestedChange,
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
