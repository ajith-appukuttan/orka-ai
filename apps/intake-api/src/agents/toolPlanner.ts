import { planTools, type ConversationMessage } from '../services/claude.js';
import {
  fetchAvailableTools,
  invokeTool,
  logToolCall,
  type ToolCallResult,
} from '../services/mcpClient.js';
import { query } from '../db/pool.js';

export interface ToolPlannerResult {
  shouldCallTools: boolean;
  toolsToCall: Array<{ toolId: string; input: Record<string, unknown> }>;
  reasoning: string;
}

export interface ToolExecutionResult {
  toolContext: string;
  callResults: ToolCallResult[];
}

/**
 * Run the Tool Planner agent:
 * 1. Fetch available tools from MCP Gateway
 * 2. Call Claude with tool-planner prompt to decide if tools are needed
 * 3. Parse the decision
 */
export async function runToolPlanner(
  conversationHistory: ConversationMessage[],
  currentDraft: Record<string, unknown>,
): Promise<ToolPlannerResult> {
  try {
    // 1. Fetch available tools
    const tools = await fetchAvailableTools();
    if (tools.length === 0) {
      return {
        shouldCallTools: false,
        toolsToCall: [],
        reasoning: 'No tools available from MCP Gateway',
      };
    }

    // 2. Ask Claude to decide
    const rawJson = await planTools(conversationHistory, currentDraft, tools);

    // 3. Parse the decision
    const cleaned = rawJson
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const decision = JSON.parse(cleaned) as ToolPlannerResult;

    // Enforce max 3 tools
    if (decision.toolsToCall && decision.toolsToCall.length > 3) {
      decision.toolsToCall = decision.toolsToCall.slice(0, 3);
    }

    return decision;
  } catch (err) {
    console.error('Tool planner failed:', err);
    return {
      shouldCallTools: false,
      toolsToCall: [],
      reasoning: `Tool planner error: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

/**
 * Execute the tools recommended by the tool planner.
 * Returns tool results formatted as context for Claude,
 * and logs all calls to the database.
 */
export async function executeTools(
  plan: ToolPlannerResult,
  sessionId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  if (!plan.shouldCallTools || plan.toolsToCall.length === 0) {
    return { toolContext: '', callResults: [] };
  }

  // Look up tenant from session if not provided
  if (!tenantId) {
    const sessionResult = await query<{ tenant_id: string }>(
      'SELECT tenant_id FROM intake_sessions WHERE id = $1',
      [sessionId],
    );
    tenantId = sessionResult.rows[0]?.tenant_id ?? 'default';
  }

  // Execute all tools in parallel
  const callPromises = plan.toolsToCall.map(async (toolCall) => {
    const result = await invokeTool(toolCall.toolId, toolCall.input, sessionId, tenantId);

    // Log the tool call
    await logToolCall(sessionId, null, result, toolCall.input);

    return { ...result, input: toolCall.input };
  });

  const results = await Promise.allSettled(callPromises);

  const callResults: ToolCallResult[] = [];
  const contextParts: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value;
      callResults.push(r);

      if (r.status === 'success') {
        contextParts.push(
          `### ${r.toolId}\n\n\`\`\`json\n${JSON.stringify(r.output, null, 2)}\n\`\`\``,
        );
      } else {
        contextParts.push(`### ${r.toolId}\n\nTool call failed: ${r.error || r.status}`);
      }
    }
  }

  return {
    toolContext: contextParts.join('\n\n'),
    callResults,
  };
}
