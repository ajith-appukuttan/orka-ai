import { registry } from '../registry/index.js';
import { config } from '../config.js';
import type { ToolInvocationRequest, ToolInvocationResponse } from '../registry/types.js';

export async function invokeTool(request: ToolInvocationRequest): Promise<ToolInvocationResponse> {
  const handler = registry.get(request.toolId);
  if (!handler) {
    return {
      toolId: request.toolId,
      output: {},
      durationMs: 0,
      status: 'error',
      error: `Tool ${request.toolId} not found`,
    };
  }

  const timeoutMs = handler.tool.timeoutMs || config.defaultTimeoutMs;
  const start = Date.now();

  try {
    const output = await Promise.race([
      handler.execute(request.input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timed out')), timeoutMs),
      ),
    ]);

    return {
      toolId: request.toolId,
      output,
      durationMs: Date.now() - start,
      status: 'success',
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      toolId: request.toolId,
      output: {},
      durationMs: Date.now() - start,
      status: isTimeout ? 'timeout' : 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
