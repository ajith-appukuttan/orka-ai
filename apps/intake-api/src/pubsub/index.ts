import { Redis as IORedis } from 'ioredis';
import { EventEmitter } from 'node:events';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Redis-backed PubSub that works across processes.
 *
 * The in-memory PubSub from graphql-subscriptions only works within a
 * single process. When the agent-worker publishes a message, the intake-api
 * process (which holds the WebSocket connections) never sees it.
 *
 * This implementation uses Redis pub/sub so any process can publish and
 * any process can receive — enabling the worker pod architecture.
 */
class RedisPubSub {
  private publisher: IORedis;
  private subscriber: IORedis;
  private emitter = new EventEmitter();
  private subscriptions = new Set<string>();

  constructor() {
    this.publisher = new IORedis(REDIS_URL);
    this.subscriber = new IORedis(REDIS_URL);

    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message);
        this.emitter.emit(channel, payload);
      } catch {
        // ignore unparseable messages
      }
    });

    this.publisher.on('error', (err: Error) => {
      console.error('[RedisPubSub] Publisher error:', err.message);
    });
    this.subscriber.on('error', (err: Error) => {
      console.error('[RedisPubSub] Subscriber error:', err.message);
    });

    // Increase max listeners for many concurrent subscriptions
    this.emitter.setMaxListeners(200);
  }

  /**
   * Publish a payload to a channel. Any process subscribed to this
   * channel (via asyncIterator) will receive it.
   */
  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  /**
   * Create an async iterator for a channel. Used by GraphQL subscription
   * resolvers to deliver events to WebSocket clients.
   */
  asyncIterator<T>(channel: string): AsyncIterableIterator<T> {
    // Subscribe to Redis channel if not already subscribed
    if (!this.subscriptions.has(channel)) {
      this.subscriber.subscribe(channel);
      this.subscriptions.add(channel);
    }

    // Create a queue of pending messages for this iterator
    const pullQueue: Array<(value: IteratorResult<T>) => void> = [];
    const pushQueue: T[] = [];
    let done = false;

    const pushValue = (value: T) => {
      if (pullQueue.length > 0) {
        pullQueue.shift()!({ value, done: false });
      } else {
        pushQueue.push(value);
      }
    };

    const listener = (payload: T) => {
      pushValue(payload);
    };

    this.emitter.on(channel, listener);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => {
        if (done) return Promise.resolve({ value: undefined as unknown as T, done: true });
        if (pushQueue.length > 0) {
          return Promise.resolve({ value: pushQueue.shift()!, done: false });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          pullQueue.push(resolve);
        });
      },
      return: () => {
        done = true;
        this.emitter.removeListener(channel, listener);
        // Drain any waiting pulls
        for (const resolve of pullQueue) {
          resolve({ value: undefined as unknown as T, done: true });
        }
        pullQueue.length = 0;
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
      throw: (err: unknown) => {
        done = true;
        this.emitter.removeListener(channel, listener);
        return Promise.reject(err);
      },
    };
  }
}

export const pubsub = new RedisPubSub();

export const EVENTS = {
  // Final persisted messages only (user, assistant, system)
  MESSAGE_STREAM: (sessionId: string) => `MESSAGE_STREAM_${sessionId}`,
  // Streaming chunks (partial assistant response while Claude is generating)
  MESSAGE_STREAMING: (sessionId: string) => `MESSAGE_STREAMING_${sessionId}`,
  DRAFT_UPDATED: (id: string) => `DRAFT_UPDATED_${id}`,
  READINESS_UPDATED: (id: string) => `READINESS_UPDATED_${id}`,
  MEMORY_UPDATED: (workspaceId: string) => `MEMORY_UPDATED_${workspaceId}`,
  // Visual intake events
  VISUAL_REQUIREMENT_GENERATED: (workspaceId: string) =>
    `VISUAL_REQUIREMENT_GENERATED_${workspaceId}`,
  VISUAL_REQUIREMENT_UPDATED: (workspaceId: string) => `VISUAL_REQUIREMENT_UPDATED_${workspaceId}`,
  // Figma intake events
  FIGMA_EXTRACTION_PROGRESS: (sessionId: string) => `FIGMA_EXTRACTION_PROGRESS_${sessionId}`,
};
