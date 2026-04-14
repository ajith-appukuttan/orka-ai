import { aggregateVisualPRD } from '../services/claude.js';

export interface AggregatedPRD {
  title: string;
  summary: string;
  businessGoals: string[];
  userStories: string[];
  inScope: string[];
  outOfScope: string[];
  uiUxRequirements: Array<{
    title: string;
    targetArea: string;
    requestedChange: string;
    changeCategory: string;
    acceptanceCriteria: string[];
    implementationHints: string[];
    codeTargets?: Array<{
      filePath: string;
      symbolName: string;
      confidence: number;
    }>;
  }>;
  nonFunctionalRequirements: string[];
  dependencies: string[];
  risks: string[];
  openQuestions: string[];
  successMetrics: string[];
  confidence: number;
}

/**
 * Aggregate multiple visual requirements into a coherent PRD.
 * 1. Call Claude with the visual-prd-aggregator prompt
 * 2. Parse and validate the response
 * 3. Return the structured PRD
 */
export async function runVisualPRDAggregator(
  requirements: Array<Record<string, unknown>>,
  existingDraft: Record<string, unknown>,
): Promise<AggregatedPRD | null> {
  try {
    const rawJson = await aggregateVisualPRD(requirements, existingDraft);

    // Parse response
    let parsed: unknown;
    try {
      const cleaned = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Visual PRD aggregation JSON parse failed:', parseErr);
      return null;
    }

    // Extract the prd field if wrapped
    const prdData = (parsed as Record<string, unknown>).prd || parsed;

    // Validate minimal structure
    const prd = prdData as AggregatedPRD;
    if (!prd.title || !prd.summary) {
      console.error('Visual PRD aggregation missing required fields (title, summary)');
      return null;
    }

    // Ensure arrays have defaults
    prd.businessGoals = prd.businessGoals || [];
    prd.userStories = prd.userStories || [];
    prd.inScope = prd.inScope || [];
    prd.outOfScope = prd.outOfScope || [];
    prd.uiUxRequirements = prd.uiUxRequirements || [];
    prd.nonFunctionalRequirements = prd.nonFunctionalRequirements || [];
    prd.dependencies = prd.dependencies || [];
    prd.risks = prd.risks || [];
    prd.openQuestions = prd.openQuestions || [];
    prd.successMetrics = prd.successMetrics || [];
    prd.confidence = prd.confidence || 0.7;

    console.info(
      `Visual PRD aggregated: "${prd.title}" with ${prd.uiUxRequirements.length} requirements (confidence: ${prd.confidence})`,
    );

    return prd;
  } catch (err) {
    console.error('Visual PRD aggregator failed:', err);
    return null;
  }
}
