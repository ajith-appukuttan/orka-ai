import { config } from '../config.js';
import { query } from '../db/pool.js';

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface ToolCallResult {
  toolId: string;
  output: Record<string, unknown>;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  error?: string;
}

/**
 * Fetch available tools from MCP Gateway.
 */
export async function fetchAvailableTools(): Promise<ToolInfo[]> {
  try {
    const response = await fetch(`${config.mcpGateway.url}/tools`);
    if (!response.ok) {
      console.error(`MCP Gateway /tools returned ${response.status}`);
      return [];
    }
    const data = (await response.json()) as { tools: ToolInfo[] };
    return data.tools;
  } catch (err) {
    console.error('Failed to fetch tools from MCP Gateway:', err);
    return [];
  }
}

/**
 * Invoke a tool on the MCP Gateway and return the result.
 */
export async function invokeTool(
  toolId: string,
  input: Record<string, unknown>,
  sessionId: string,
  tenantId: string,
): Promise<ToolCallResult> {
  try {
    const response = await fetch(`${config.mcpGateway.url}/tools/${toolId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({ input, sessionId }),
    });

    if (!response.ok) {
      return {
        toolId,
        output: {},
        durationMs: 0,
        status: 'error',
        error: `MCP Gateway returned ${response.status}`,
      };
    }

    return (await response.json()) as ToolCallResult;
  } catch (err) {
    return {
      toolId,
      output: {},
      durationMs: 0,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Log a tool call to the database.
 */
export async function logToolCall(
  sessionId: string,
  messageId: string | null,
  result: ToolCallResult,
  input: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO tool_call_logs (session_id, message_id, tool_id, input, output, duration_ms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sessionId,
      messageId,
      result.toolId,
      JSON.stringify(input),
      JSON.stringify(result.output),
      result.durationMs,
      result.status,
    ],
  );
}
