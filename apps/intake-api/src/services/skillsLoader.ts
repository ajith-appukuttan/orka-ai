import fs from 'node:fs';
import path from 'node:path';

export interface ClaudeSkill {
  id: string;
  name: string;
  category: string;
  content: string;
  filePath: string;
}

const SKILLS_DIR = '.claude/skills';
const SKILL_CATEGORIES = ['codegen', 'refactor', 'test', 'lint', 'api', 'ui', 'general'];

/**
 * Discover and load Claude skills from a repository.
 * Skills are markdown files in /.claude/skills/{category}/
 */
export function discoverSkills(repoPath: string): ClaudeSkill[] {
  const skillsRoot = path.join(repoPath, SKILLS_DIR);
  if (!fs.existsSync(skillsRoot)) {
    console.info(`[Skills] No skills directory at ${skillsRoot}`);
    return [];
  }

  const skills: ClaudeSkill[] = [];

  // Check for category subdirectories
  for (const category of SKILL_CATEGORIES) {
    const categoryDir = path.join(skillsRoot, category);
    if (fs.existsSync(categoryDir) && fs.statSync(categoryDir).isDirectory()) {
      for (const file of fs.readdirSync(categoryDir)) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(categoryDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const name = file.replace('.md', '');
          skills.push({
            id: `${category}/${name}`,
            name,
            category,
            content,
            filePath: path.join(SKILLS_DIR, category, file),
          });
        } catch {
          /* unreadable */
        }
      }
    }
  }

  // Also check for top-level skill files
  try {
    for (const file of fs.readdirSync(skillsRoot)) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(skillsRoot, file);
      if (fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const name = file.replace('.md', '');
          skills.push({
            id: `general/${name}`,
            name,
            category: 'general',
            content,
            filePath: path.join(SKILLS_DIR, file),
          });
        } catch {
          /* unreadable */
        }
      }
    }
  } catch {
    /* no top-level files */
  }

  console.info(`[Skills] Discovered ${skills.length} skills from ${repoPath}`);
  return skills;
}

/**
 * Select relevant skills for a given PRD based on content analysis.
 */
export function selectSkillsForPRD(
  skills: ClaudeSkill[],
  prd: Record<string, unknown>,
): ClaudeSkill[] {
  if (skills.length === 0) return [];

  const prdText = JSON.stringify(prd).toLowerCase();
  const selected: ClaudeSkill[] = [];

  // Category relevance signals
  const categorySignals: Record<string, string[]> = {
    codegen: ['implement', 'create', 'add', 'build', 'function', 'component', 'class'],
    refactor: ['refactor', 'restructure', 'reorganize', 'extract', 'simplify', 'clean'],
    test: ['test', 'coverage', 'spec', 'assertion', 'mock', 'fixture'],
    lint: ['lint', 'format', 'style', 'convention', 'eslint', 'prettier'],
    api: ['api', 'endpoint', 'rest', 'graphql', 'mutation', 'query', 'route'],
    ui: ['ui', 'component', 'button', 'form', 'page', 'layout', 'style', 'css', 'color'],
  };

  for (const skill of skills) {
    const signals = categorySignals[skill.category] || [];
    const isRelevant = signals.some((s) => prdText.includes(s));

    // Always include 'general' category
    if (skill.category === 'general' || isRelevant) {
      selected.push(skill);
    }
  }

  // Limit to 5 most relevant skills to avoid context overflow
  return selected.slice(0, 5);
}

/**
 * Format selected skills into a context string for Claude.
 */
export function formatSkillsForPrompt(skills: ClaudeSkill[]): string {
  if (skills.length === 0) return '';

  const sections = skills.map((s) => `### Skill: ${s.name} (${s.category})\n\n${s.content}`);

  return `## Repository Skills\n\nThe following coding skills/guidelines are defined in this repository:\n\n${sections.join('\n\n---\n\n')}`;
}
