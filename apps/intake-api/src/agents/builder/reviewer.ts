import { generateWithPrompt } from '../../services/claude.js';
import type { BuildTask } from './taskPlanner.js';
import type { FileChange } from './codeGenerator.js';

export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  criteriaResults: Array<{ criterion: string; met: boolean; notes: string }>;
}

/**
 * Review code changes against task acceptance criteria.
 */
export async function reviewChanges(
  task: BuildTask,
  changes: FileChange[],
  originalContents: Record<string, string | null>,
): Promise<ReviewResult> {
  const changesSection = changes
    .map((c) => {
      const original = originalContents[c.filePath];
      if (c.action === 'CREATE') {
        return `### ${c.filePath} (NEW)\n\`\`\`\n${c.content.substring(0, 5000)}\n\`\`\``;
      }
      return `### ${c.filePath} (MODIFIED)\n**Before:**\n\`\`\`\n${(original || '').substring(0, 3000)}\n\`\`\`\n**After:**\n\`\`\`\n${c.content.substring(0, 5000)}\n\`\`\``;
    })
    .join('\n\n');

  const userContent = `## Task

**Description:** ${task.description}

**Acceptance Criteria:**
${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

## Code Changes

${changesSection}

Review these changes against the acceptance criteria. Return JSON only.`;

  const rawJson = await generateWithPrompt('builder-reviewer.md', userContent, 2048);

  try {
    const cleaned = rawJson
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const result = JSON.parse(cleaned) as ReviewResult;

    return {
      approved: result.approved ?? false,
      score: result.score ?? 0.5,
      issues: result.issues || [],
      suggestions: result.suggestions || [],
      criteriaResults: result.criteriaResults || [],
    };
  } catch (err) {
    console.error(`[Reviewer] Failed to parse review for ${task.id}:`, err);
    return {
      approved: false,
      score: 0,
      issues: ['Failed to parse review response'],
      suggestions: [],
      criteriaResults: [],
    };
  }
}
