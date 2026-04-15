import type { Job } from 'bullmq';

// Import the existing agent code directly from intake-api
// The worker shares the same monorepo — no code duplication
import { runChatTurnPipeline } from '../../../intake-api/src/agents/intakeCopilot.js';

export interface ChatTurnData {
  sessionId: string;
}

export async function processChatTurn(job: Job<ChatTurnData>): Promise<void> {
  const { sessionId } = job.data;
  console.info(`[ChatTurn] Processing for session ${sessionId}`);
  await runChatTurnPipeline(sessionId);
}
