import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new AnthropicVertex({
  projectId: config.vertex.projectId,
  region: config.vertex.region,
});

function loadPrompt(filename: string): string {
  const promptPath = path.resolve(__dirname, '../../../../prompts', filename);
  return fs.readFileSync(promptPath, 'utf-8');
}

const intakeCopilotPrompt = loadPrompt('intake-copilot.md');
const draftExtractorPrompt = loadPrompt('draft-extractor.md');
const toolPlannerPrompt = loadPrompt('tool-planner.md');
const summaryGeneratorPrompt = loadPrompt('summary-generator.md');
const memoryCuratorPrompt = loadPrompt('memory-curator.md');
const visualIntakePrompt = loadPrompt('visual-intake.md');
const repoAnalyzerPrompt = loadPrompt('repo-analyzer.md');
const intakeClassifierPrompt = loadPrompt('intake-readiness-classifier.md');

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a Claude response for the Virtual Product Manager conversation.
 * Accepts optional additional context (runtime context bundle, tool results)
 * that gets appended to the system prompt.
 */
export async function* streamCopilotResponse(
  conversationHistory: ConversationMessage[],
  additionalContext?: string,
): AsyncGenerator<string, string, undefined> {
  let systemPrompt = intakeCopilotPrompt;
  if (additionalContext) {
    systemPrompt += '\n\n' + additionalContext;
  }

  const stream = client.messages.stream({
    model: config.vertex.model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  });

  let fullText = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      yield event.delta.text;
    }
  }

  return fullText;
}

/**
 * Non-streaming Claude call for the Draft Extractor.
 */
export async function extractDraft(
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
): Promise<string> {
  const userContent = `## Current Draft

\`\`\`json
${JSON.stringify(currentDraft, null, 2)}
\`\`\`

## Conversation History

${conversationHistory
  .map((msg) => `**${msg.role === 'user' ? 'User' : 'Virtual PM'}**: ${msg.content}`)
  .join('\n\n')}

Based on the conversation above, return the updated draft as a JSON object.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 4096,
    system: draftExtractorPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '{}';
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
}

/**
 * Non-streaming Claude call for the Tool Planner.
 */
export async function planTools(
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
  availableTools: ToolInfo[],
): Promise<string> {
  const userContent = `## Available Tools

${availableTools.map((t) => `- **${t.id}**: ${t.name} — ${t.description}`).join('\n')}

## Current Draft State

\`\`\`json
${JSON.stringify(currentDraft, null, 2)}
\`\`\`

## Recent Conversation

${conversationHistory
  .slice(-6)
  .map((msg) => `**${msg.role === 'user' ? 'User' : 'Virtual PM'}**: ${msg.content}`)
  .join('\n\n')}

Based on the conversation context and available tools, decide whether any tools should be called. Return your decision as a JSON object.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 1024,
    system: toolPlannerPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (
    (textBlock && 'text' in textBlock ? textBlock.text : undefined) ??
    '{"shouldCallTools": false, "toolsToCall": [], "reasoning": ""}'
  );
}

/**
 * Generate a rolling workspace summary.
 */
export async function generateSummary(
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
  previousSummary: string | null,
): Promise<string> {
  const parts: string[] = [];

  if (previousSummary) {
    parts.push(`## Previous Summary\n\n${previousSummary}`);
  }

  parts.push(
    `## Current Draft PRD\n\n\`\`\`json\n${JSON.stringify(currentDraft, null, 2)}\n\`\`\``,
  );

  parts.push(
    `## Recent Conversation\n\n${conversationHistory
      .slice(-10)
      .map((msg) => `**${msg.role === 'user' ? 'User' : 'Virtual PM'}**: ${msg.content}`)
      .join('\n\n')}`,
  );

  parts.push('Generate an updated workspace summary based on the above.');

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 1024,
    system: summaryGeneratorPrompt,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '';
}

/**
 * Extract durable project facts for memory.
 */
export async function curateMemory(
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
  existingMemory: Array<{ kind: string; key: string; value: string }>,
): Promise<string> {
  const userContent = `## Current Draft PRD

\`\`\`json
${JSON.stringify(currentDraft, null, 2)}
\`\`\`

## Existing Memory Items

${existingMemory.length > 0 ? existingMemory.map((m) => `- [${m.kind}] ${m.key}: ${m.value}`).join('\n') : '(none)'}

## Recent Conversation

${conversationHistory
  .slice(-6)
  .map((msg) => `**${msg.role === 'user' ? 'User' : 'Virtual PM'}**: ${msg.content}`)
  .join('\n\n')}

Extract any new durable facts from the conversation. Return a JSON array.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 1024,
    system: memoryCuratorPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '[]';
}

export interface VisualChangeIntent {
  pageUrl: string;
  selectedElement: {
    selector: string;
    domPath?: string;
    textContent?: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    ariaRole?: string | null;
    tagName?: string;
  };
  userInstruction: string;
}

export interface VisualRequirementContext {
  title: string;
  targetArea: string;
  requestedChange: string;
}

/**
 * Convert a visual change intent into a structured requirement.
 * Optionally enriched with existing draft and prior requirements for consistency.
 */
export async function generateVisualRequirement(
  intent: VisualChangeIntent,
  existingContext?: {
    currentDraft?: Record<string, unknown>;
    priorRequirements?: VisualRequirementContext[];
  },
): Promise<string> {
  const el = intent.selectedElement;

  let contextSection = '';
  if (existingContext?.currentDraft && Object.keys(existingContext.currentDraft).length > 0) {
    contextSection += `\n## Current Draft PRD State\n\`\`\`json\n${JSON.stringify(existingContext.currentDraft, null, 2)}\n\`\`\`\n`;
  }
  if (existingContext?.priorRequirements && existingContext.priorRequirements.length > 0) {
    contextSection += `\n## Previously Generated Requirements\n${existingContext.priorRequirements.map((r) => `- **${r.title}**: ${r.targetArea} — ${r.requestedChange}`).join('\n')}\n`;
  }

  const userContent = `## Page URL
${intent.pageUrl}

## Selected Element
- **Selector**: \`${el.selector}\`
- **Tag**: \`${el.tagName || 'unknown'}\`
- **DOM Path**: \`${el.domPath || 'N/A'}\`
- **Text Content**: "${(el.textContent || '').substring(0, 300)}"
- **ARIA Role**: ${el.ariaRole || 'none'}
- **Position**: x=${el.boundingBox.x}, y=${el.boundingBox.y}, ${el.boundingBox.width}x${el.boundingBox.height}
${contextSection}
## User Instruction
${intent.userInstruction}

Convert this into a structured visual requirement. Include a "changeCategory" field with one of: STYLE, LAYOUT, CONTENT, INTERACTION, VALIDATION, ACCESSIBILITY, DATA_DISPLAY. Return JSON only.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 2048,
    system: visualIntakePrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '{}';
}

/**
 * Aggregate multiple visual requirements into a coherent PRD.
 */
export async function aggregateVisualPRD(
  requirements: Array<Record<string, unknown>>,
  existingDraft: Record<string, unknown>,
): Promise<string> {
  const prdAggregatorPrompt = loadPrompt('visual-prd-aggregator.md');

  const userContent = `## Visual Requirements (${requirements.length} total)

\`\`\`json
${JSON.stringify(requirements, null, 2)}
\`\`\`

## Existing Draft Context

\`\`\`json
${JSON.stringify(existingDraft, null, 2)}
\`\`\`

Aggregate these visual requirements into a single coherent PRD. Deduplicate overlapping requirements, group by target area, identify cross-cutting concerns, and produce the complete PRD JSON structure. Return JSON only.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 4096,
    system: prdAggregatorPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '{}';
}

export interface RepoAnalysisInput {
  readme: string | null;
  fileTree: string[];
  manifests: Array<Record<string, unknown>>;
  entryPoints: string[];
  entryPointContents: Record<string, string>;
}

/**
 * Analyze a repository's structure and extract key metadata.
 */
export async function analyzeRepository(input: RepoAnalysisInput): Promise<string> {
  const manifestSection = input.manifests
    .map((m) => `### ${m.file}\n\`\`\`\n${m.content}\n\`\`\``)
    .join('\n\n');

  const entryPointSection = Object.entries(input.entryPointContents)
    .map(([file, content]) => `### ${file}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  const userContent = `## README
${input.readme || 'No README found.'}

## File Tree (${input.fileTree.length} entries)
\`\`\`
${input.fileTree.slice(0, 300).join('\n')}
\`\`\`

## Package Manifests
${manifestSection || 'None found.'}

## Entry Points
${input.entryPoints.join(', ') || 'None detected.'}

${entryPointSection ? `## Entry Point Contents\n${entryPointSection}` : ''}

Analyze this repository and return the structured JSON. Focus on identifying UI components, pages, and services that would be relevant for mapping visual UI requirements to code.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 4096,
    system: repoAnalyzerPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '{}';
}

/**
 * Classify an approved PRD for build readiness.
 */
export async function classifyIntakeReadiness(
  prd: Record<string, unknown>,
  precheck: {
    minClassification: string | null;
    signals: Record<string, unknown>;
    blockingQuestions: string[];
  },
): Promise<string> {
  const userContent = `## Approved PRD

\`\`\`json
${JSON.stringify(prd, null, 2)}
\`\`\`

## Rule-Based Precheck Results

${precheck.minClassification ? `**Minimum classification from rules:** ${precheck.minClassification}` : 'No rule-based minimum set.'}

${precheck.blockingQuestions.length > 0 ? `**Blocking questions identified:**\n${precheck.blockingQuestions.map((q) => `- ${q}`).join('\n')}` : 'No blocking questions from rules.'}

${Object.keys(precheck.signals).length > 0 ? `**Rule signals:**\n\`\`\`json\n${JSON.stringify(precheck.signals, null, 2)}\n\`\`\`` : ''}

Evaluate this PRD and return the classification JSON. Consider the precheck results but make your own independent assessment. Be conservative when uncertain.`;

  const response = await client.messages.create({
    model: config.vertex.model,
    max_tokens: 2048,
    system: intakeClassifierPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === 'text');
  return (textBlock && 'text' in textBlock ? textBlock.text : undefined) ?? '{}';
}
