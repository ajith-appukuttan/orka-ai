import { generateWithPrompt } from '../../services/claude.js';
import { readWorktreeFile } from '../../services/worktreeManager.js';
import type { BuildTask } from './taskPlanner.js';

export interface FileChange {
  filePath: string;
  action: 'CREATE' | 'MODIFY' | 'DELETE';
  content: string;
}

export interface CodeGenResult {
  changes: FileChange[];
  commitMessage: string;
  summary: string;
}

/**
 * Generate code changes for a single build task.
 */
export async function generateCode(
  task: BuildTask,
  worktreePath: string,
  repoContext: {
    techStack: Array<{ category: string; name: string }>;
  },
  skills: string,
): Promise<CodeGenResult | null> {
  // Read current content of affected files
  const fileContents: Record<string, string | null> = {};
  for (const filePath of task.filesLikelyAffected) {
    fileContents[filePath] = readWorktreeFile(worktreePath, filePath);
  }

  const filesSection = Object.entries(fileContents)
    .map(([fp, content]) => {
      if (content === null) return `### ${fp}\n*File does not exist yet*`;
      return `### ${fp}\n\`\`\`\n${content.substring(0, 8000)}\n\`\`\``;
    })
    .join('\n\n');

  const userContent = `## Task

**Description:** ${task.description}

**Acceptance Criteria:**
${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

## Current File Contents

${filesSection}

## Repository Context

**Tech Stack:** ${repoContext.techStack.map((t) => `${t.name} (${t.category})`).join(', ')}

${skills}

Implement this task. Return JSON with file changes only.`;

  const rawJson = await generateWithPrompt('builder-code-generator.md', userContent, 8192);

  try {
    const cleaned = rawJson
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const result = JSON.parse(cleaned) as CodeGenResult;

    return {
      changes: (result.changes || []).map((c) => ({
        filePath: c.filePath,
        action: c.action || 'MODIFY',
        content: c.content || '',
      })),
      commitMessage: result.commitMessage || `feat: implement ${task.id}`,
      summary: result.summary || '',
    };
  } catch (err) {
    console.error(`[CodeGenerator] Failed to parse response for ${task.id}:`, err);
    return null;
  }
}
