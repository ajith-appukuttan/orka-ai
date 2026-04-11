export type MessageRole = 'user' | 'assistant' | 'system';

export interface IntakeMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallReference[];
  createdAt: Date;
}

export interface ToolCallReference {
  toolCallId: string;
  toolId: string;
  status: 'pending' | 'completed' | 'failed';
}
