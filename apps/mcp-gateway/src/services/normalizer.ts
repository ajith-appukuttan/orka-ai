import type { ToolInvocationResponse } from '../registry/types.js';

/**
 * Normalizes tool responses to a consistent format.
 * Ensures all responses follow the same structure regardless of
 * which tool produced them.
 */
export function normalizeResponse(response: ToolInvocationResponse): ToolInvocationResponse {
  return {
    toolId: response.toolId,
    output: response.output ?? {},
    durationMs: response.durationMs,
    status: response.status,
    ...(response.error ? { error: response.error } : {}),
  };
}
