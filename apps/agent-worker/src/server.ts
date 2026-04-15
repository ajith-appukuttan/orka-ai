import { Worker } from 'bullmq';
import { processChatTurn } from './processors/chatTurn.js';
import { processClassify } from './processors/classify.js';
import { processBuild } from './processors/build.js';
import { processRepoAnalyze } from './processors/repoAnalyze.js';
import { reconcileStaleRuns } from './reconcile.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

const connection = parseRedisUrl(REDIS_URL);

// ─── Workers ─────────────────────────────────────────────

const chatWorker = new Worker('orka-chat-turn', processChatTurn, {
  connection,
  concurrency: 3, // Max 3 concurrent chat turns
});

const classifyWorker = new Worker('orka-classify', processClassify, {
  connection,
  concurrency: 2,
});

const buildWorker = new Worker('orka-build', processBuild, {
  connection,
  concurrency: 1, // Builds are heavy — one at a time
});

const repoAnalyzeWorker = new Worker('orka-repo-analyze', processRepoAnalyze, {
  connection,
  concurrency: 2,
});

// ─── Event Logging ───────────────────────────────────────

for (const [name, worker] of Object.entries({
  'chat-turn': chatWorker,
  classify: classifyWorker,
  build: buildWorker,
  'repo-analyze': repoAnalyzeWorker,
})) {
  worker.on('completed', (job) => {
    console.info(`[Worker:${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[Worker:${name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error(`[Worker:${name}] Error:`, err.message);
  });
}

console.info('Agent Worker started');
console.info('  Chat turns:    concurrency 3');
console.info('  Classifier:    concurrency 2');
console.info('  Builder:       concurrency 1');
console.info('  Repo analyze:  concurrency 2');
console.info(`  Redis: ${REDIS_URL}`);

// Reconcile any builds left in RUNNING/INITIALIZING state from a prior crash
reconcileStaleRuns().catch((err) => {
  console.error('[Reconcile] Failed to reconcile stale runs:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('Shutting down workers...');
  await Promise.all([
    chatWorker.close(),
    classifyWorker.close(),
    buildWorker.close(),
    repoAnalyzeWorker.close(),
  ]);
  process.exit(0);
});
