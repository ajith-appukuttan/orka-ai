import type {
  RegisteredTool,
  ToolInvocationRequest,
  ToolInvocationResponse,
} from '@orka/shared-types';

export type { RegisteredTool, ToolInvocationRequest, ToolInvocationResponse };

export interface ToolHandler {
  tool: RegisteredTool;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}
