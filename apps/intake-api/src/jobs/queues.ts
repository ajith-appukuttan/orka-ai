import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

const connection = parseRedisUrl(REDIS_URL);

/**
 * Job queue for chat turn pipeline (Claude streaming + draft extraction + memory).
 */
export const chatTurnQueue = new Queue('orka:chat-turn', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

/**
 * Job queue for intake readiness classification.
 */
export const classifyQueue = new Queue('orka:classify', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

/**
 * Job queue for builder execution.
 */
export const buildQueue = new Queue('orka:build', {
  connection,
  defaultJobOptions: {
    attempts: 1, // Builds are not safely retryable (worktree state)
    removeOnComplete: 20,
    removeOnFail: 20,
  },
});

/**
 * Job queue for repo analysis.
 */
export const repoAnalyzeQueue = new Queue('orka:repo-analyze', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});
