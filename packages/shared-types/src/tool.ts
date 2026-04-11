export type ToolCategory = 'CONTEXT' | 'VALIDATION';

export interface RegisteredTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  allowedStages: string[];
  timeoutMs: number;
  requiresConfirmation: boolean;
  tenantScopes: string[];
}

export interface ToolCallLog {
  id: string;
  sessionId: string;
  messageId: string;
  toolId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  createdAt: Date;
}

export interface ToolInvocationRequest {
  toolId: string;
  input: Record<string, unknown>;
  sessionId: string;
  tenantId: string;
}

export interface ToolInvocationResponse {
  toolId: string;
  output: Record<string, unknown>;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  error?: string;
}
