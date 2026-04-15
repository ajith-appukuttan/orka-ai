import { generateWithPrompt } from '../../services/claude.js';

export interface BuildTask {
  id: string;
  description: string;
  filesLikelyAffected: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
}

/**
 * Decompose a PRD into executable build tasks.
 */
export async function planBuildTasks(
  prd: Record<string, unknown>,
  repoContext: {
    fileTree: string[];
    keyComponents: Array<{
      filePath: string;
      symbolName: string;
      type: string;
      description: string;
    }>;
    codeTargets: Array<{ filePath: string; symbolName: string; confidence: number }>;
    techStack: Array<{ category: string; name: string }>;
  },
  skills: string,
): Promise<BuildTask[]> {
  const userContent = `## Approved PRD

\`\`\`json
${JSON.stringify(prd, null, 2)}
\`\`\`

## Repository Context

**Tech Stack:** ${repoContext.techStack.map((t) => `${t.name} (${t.category})`).join(', ')}

**Code Targets (from analysis):**
${repoContext.codeTargets.map((t) => `- \`${t.filePath}\` — ${t.symbolName} (confidence: ${t.confidence})`).join('\n') || 'None identified'}

**Key Components:**
${
  repoContext.keyComponents
    .slice(0, 15)
    .map((c) => `- \`${c.filePath}\` — ${c.symbolName} [${c.type}]: ${c.description}`)
    .join('\n') || 'None'
}

**File Tree (excerpt):**
\`\`\`
${repoContext.fileTree.slice(0, 100).join('\n')}
\`\`\`

${skills}

Decompose this PRD into executable build tasks. Return JSON array only.`;

  const rawJson = await generateWithPrompt('builder-task-planner.md', userContent, 4096);

  try {
    const cleaned = rawJson
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const tasks = JSON.parse(cleaned) as BuildTask[];

    // Validate and normalize
    return tasks.map((t, i) => ({
      id: t.id || `task-${i + 1}`,
      description: t.description || '',
      filesLikelyAffected: t.filesLikelyAffected || [],
      acceptanceCriteria: t.acceptanceCriteria || [],
      dependencies: t.dependencies || [],
    }));
  } catch (err) {
    console.error('[TaskPlanner] Failed to parse tasks:', err);
    return [];
  }
}
