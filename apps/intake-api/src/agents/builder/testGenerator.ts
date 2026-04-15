import { generateWithPrompt } from '../../services/claude.js';
import { readWorktreeFile, listWorktreeFiles } from '../../services/worktreeManager.js';
import type { BuildTask } from './taskPlanner.js';
import type { FileChange } from './codeGenerator.js';

export interface TestGenResult {
  testChanges: FileChange[];
  summary: string;
}

/**
 * Detect the test framework used in the repo.
 */
function detectTestFramework(worktreePath: string): string {
  const files = listWorktreeFiles(worktreePath, '.');
  const fileNames = files.map((f) => f.split('/').pop() || '');

  if (fileNames.includes('vitest.config.ts') || fileNames.includes('vitest.config.js'))
    return 'vitest';
  if (
    fileNames.includes('jest.config.ts') ||
    fileNames.includes('jest.config.js') ||
    fileNames.includes('jest.config.cjs')
  )
    return 'jest';
  if (fileNames.includes('pytest.ini') || fileNames.includes('conftest.py')) return 'pytest';
  if (fileNames.includes('.mocharc.yml') || fileNames.includes('.mocharc.json')) return 'mocha';

  // Check package.json for test deps
  const pkg = readWorktreeFile(worktreePath, 'package.json');
  if (pkg) {
    if (pkg.includes('"vitest"')) return 'vitest';
    if (pkg.includes('"jest"')) return 'jest';
    if (pkg.includes('"mocha"')) return 'mocha';
  }

  return 'unknown';
}

/**
 * Find existing test files related to modified files.
 */
function findRelatedTests(
  worktreePath: string,
  modifiedFiles: string[],
): Record<string, string | null> {
  const tests: Record<string, string | null> = {};

  for (const filePath of modifiedFiles) {
    const dir = filePath.split('/').slice(0, -1).join('/');
    const baseName =
      filePath
        .split('/')
        .pop()
        ?.replace(/\.(tsx?|jsx?)$/, '') || '';

    // Common test file patterns
    const candidates = [
      `${dir}/__tests__/${baseName}.test.tsx`,
      `${dir}/__tests__/${baseName}.test.ts`,
      `${dir}/__tests__/${baseName}.spec.tsx`,
      `${dir}/__tests__/${baseName}.spec.ts`,
      `${dir}/${baseName}.test.tsx`,
      `${dir}/${baseName}.test.ts`,
      `${dir}/${baseName}.spec.tsx`,
      `${dir}/${baseName}.spec.ts`,
      `tests/${dir}/${baseName}.test.ts`,
    ];

    for (const candidate of candidates) {
      const content = readWorktreeFile(worktreePath, candidate);
      if (content !== null) {
        tests[candidate] = content;
        break;
      }
    }
  }

  return tests;
}

/**
 * Generate tests for a completed build task.
 */
export async function generateTests(
  task: BuildTask,
  changes: FileChange[],
  worktreePath: string,
): Promise<TestGenResult | null> {
  const framework = detectTestFramework(worktreePath);
  const existingTests = findRelatedTests(
    worktreePath,
    changes.map((c) => c.filePath),
  );

  const changesSection = changes
    .map((c) => `### ${c.filePath}\n\`\`\`\n${c.content.substring(0, 5000)}\n\`\`\``)
    .join('\n\n');

  const existingTestsSection = Object.entries(existingTests)
    .filter(([, content]) => content !== null)
    .map(([fp, content]) => `### ${fp} (existing)\n\`\`\`\n${content!.substring(0, 3000)}\n\`\`\``)
    .join('\n\n');

  const userContent = `## Task

**Description:** ${task.description}

**Acceptance Criteria:**
${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

## Test Framework: ${framework}

## Modified Files

${changesSection}

${existingTestsSection ? `## Existing Tests\n\n${existingTestsSection}` : '## No existing tests found for these files'}

Generate or update tests for these changes. Return JSON only.`;

  const rawJson = await generateWithPrompt('builder-test-generator.md', userContent, 4096);

  try {
    const cleaned = rawJson
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const result = JSON.parse(cleaned) as TestGenResult;

    return {
      testChanges: (result.testChanges || []).map((c) => ({
        filePath: c.filePath,
        action: c.action || 'CREATE',
        content: c.content || '',
      })),
      summary: result.summary || '',
    };
  } catch (err) {
    console.error(`[TestGenerator] Failed to parse response for ${task.id}:`, err);
    return null;
  }
}
