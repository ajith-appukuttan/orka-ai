import { z } from 'zod';

/**
 * User Story in the format: As a [role], I want to [action] so that [outcome].
 */
/**
 * Visual requirement generated from UI element inspection.
 */
export const VisualRequirementSchema = z.object({
  title: z.string().default(''),
  summary: z.string().default(''),
  userGoal: z.string().default(''),
  targetArea: z.string().default(''),
  requestedChange: z.string().default(''),
  acceptanceCriteria: z.array(z.string()).default([]),
  implementationHints: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

/**
 * User Story in the format: As a [role], I want to [action] so that [outcome].
 */
export const UserStorySchema = z.object({
  role: z.string().default(''),
  action: z.string().default(''),
  outcome: z.string().default(''),
});

/**
 * IntakeDraft — Draft PRD schema aligned with Stage 1: Requirements Intake.
 *
 * Designed to answer five core prompts:
 * 1. What problem are we solving, and for whom?
 * 2. What does success look like?
 * 3. What are we explicitly not doing?
 * 4. What do we know we don't know?
 * 5. What does the current state look like?
 */
export const IntakeDraftSchema = z.object({
  // --- Identity ---
  title: z.string().default(''),

  // --- Problem Statement ---
  // Who is experiencing what problem, in what context, and what is the cost of not solving it?
  problemStatement: z
    .object({
      who: z.string().default(''), // Who is affected
      what: z.string().default(''), // What problem they face
      context: z.string().default(''), // In what context / situation
      costOfInaction: z.string().default(''), // What happens if we don't solve it
    })
    .default({}),

  // --- Why Now ---
  // What triggered this requirement (user feedback, incident, strategic initiative)
  trigger: z.string().default(''),

  // --- Goals ---
  // Measurable outcomes that indicate success (even rough proxy metrics)
  goals: z.array(z.string()).default([]),

  // --- Non-Goals ---
  // What we are explicitly not solving in this increment
  nonGoals: z.array(z.string()).default([]),

  // --- User Stories ---
  // As a [role], I want to [action] so that [outcome]. 3-5 is enough for a draft.
  userStories: z.array(UserStorySchema).default([]),

  // --- Known Constraints ---
  // Technical, legal, timeline, or resource constraints already known
  constraints: z.array(z.string()).default([]),

  // --- Open Questions ---
  // Everything the author knows they don't know.
  // Named uncertainty is the most valuable thing at this stage.
  openQuestions: z.array(z.string()).default([]),

  // --- Current State / Relevant Artifacts ---
  // Existing UX flows, APIs, data models, or prior decisions in scope
  currentState: z
    .object({
      description: z.string().default(''), // Summary of current state
      artifacts: z.array(z.string()).default([]), // Links/references to existing flows, APIs, etc.
    })
    .default({}),

  // --- Assumptions ---
  // Things being taken for granted
  assumptions: z.array(z.string()).default([]),

  // --- UI Requirements ---
  // Visual requirements captured from UI element inspection
  uiRequirements: z.array(VisualRequirementSchema).default([]),

  // --- Computed ---
  readinessScore: z.number().min(0).max(1).default(0),
  readyForReview: z.boolean().default(false),
});

export const IntakeDraftPatchSchema = IntakeDraftSchema.partial();

export type VisualRequirement = z.infer<typeof VisualRequirementSchema>;
export type UserStory = z.infer<typeof UserStorySchema>;
export type IntakeDraft = z.infer<typeof IntakeDraftSchema>;
export type IntakeDraftPatch = z.infer<typeof IntakeDraftPatchSchema>;

export function createEmptyDraft(): IntakeDraft {
  return IntakeDraftSchema.parse({});
}

export function validateDraft(data: unknown): IntakeDraft {
  return IntakeDraftSchema.parse(data);
}

export function validateDraftPatch(data: unknown): IntakeDraftPatch {
  return IntakeDraftPatchSchema.parse(data);
}

/**
 * Computes readiness score based on the five core prompts.
 *
 * Weighted by importance:
 * - Problem Statement (who + what): critical
 * - Goals: critical
 * - Non-Goals: important
 * - Open Questions: important (named uncertainty is valuable)
 * - Current State: useful
 * - User Stories, Constraints, Trigger, Assumptions: supplementary
 *
 * A requirement is ready for Stage 2 when it can answer 3 of 5 core prompts.
 */
export function computeReadinessScore(draft: IntakeDraft): number {
  const corePrompts = [
    {
      // Prompt 1: What problem are we solving, and for whom?
      filled: draft.problemStatement.who.length > 0 && draft.problemStatement.what.length > 0,
      weight: 2,
    },
    {
      // Prompt 2: What does success look like?
      filled: draft.goals.length > 0,
      weight: 2,
    },
    {
      // Prompt 3: What are we explicitly not doing?
      filled: draft.nonGoals.length > 0,
      weight: 1.5,
    },
    {
      // Prompt 4: What do we know we don't know?
      filled: draft.openQuestions.length > 0,
      weight: 1.5,
    },
    {
      // Prompt 5: What does the current state look like?
      filled: draft.currentState.description.length > 0,
      weight: 1,
    },
  ];

  const supplementary = [
    { filled: draft.title.length > 0, weight: 0.5 },
    { filled: draft.userStories.length > 0, weight: 1 },
    { filled: draft.constraints.length > 0, weight: 0.5 },
    { filled: draft.trigger.length > 0, weight: 0.5 },
    { filled: draft.assumptions.length > 0, weight: 0.5 },
    { filled: draft.uiRequirements.length > 0, weight: 1 },
  ];

  const allFields = [...corePrompts, ...supplementary];
  const totalWeight = allFields.reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = allFields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);

  return Math.round((filledWeight / totalWeight) * 100) / 100;
}
