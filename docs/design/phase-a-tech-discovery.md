# Phase A Tech Discovery — Auth, Tenant Isolation, Redis PubSub

**Status:** Discovery Complete  
**Scope:** 3 changes that must ship together

---

## Discovery Summary

Phase A touches 3 layers: HTTP auth → query layer → subscription transport. After auditing the codebase, here are the exact findings, options, and recommendations for each.

---

## 1. Authentication Middleware

### Current State

- `server.ts:63` — `expressMiddleware(server)` with **no context function**. Every request gets `context = {}`.
- `server.ts:28` — `useServer({ schema }, wsServer)` with **no onConnect/context hook**. WebSocket is fully open.
- `client.ts:6-8` — Apollo Client sends **no headers**. No Authorization, no tenant ID.
- **Impact:** Any HTTP/WS client has unrestricted access to all data.

### Options Evaluated

| Option                  | Pros                                                                                 | Cons                                                     | Verdict                   |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------- |
| **A: Firebase Auth**    | Fast integration (1 npm package), managed users, free tier covers dev, Google-native | Vendor lock-in, requires Firebase project setup          | Good for GCP-native stack |
| **B: Auth0**            | Feature-rich (RBAC, MFA, SSO), good SDKs, M2M tokens                                 | Cost at scale, another vendor dependency                 | Best for enterprise SaaS  |
| **C: Self-issued JWTs** | Zero vendor dependency, full control                                                 | Must build user management, registration, password reset | Too much work             |
| **D: Clerk**            | Modern DX, React components, multi-tenant built-in                                   | Newer vendor, less enterprise adoption                   | Good DX but less proven   |

### Recommendation: **Configurable JWT validation (IdP-agnostic)**

Don't pick an IdP in the middleware layer. Instead:

- Validate JWTs using JWKS (JSON Web Key Sets) — works with any IdP
- Configure the JWKS endpoint via `AUTH_JWKS_URI` env var
- Extract `tenantId` from a configurable JWT claim (default: `org_id` or `tenant_id`)
- Extract `userId` from `sub` claim

This way the deployment decides the IdP, not the code.

### Dependencies Needed

```
jose            — JWT verification + JWKS fetching (lightweight, no native deps)
```

NOT `jsonwebtoken` + `jwks-rsa` (heavier, native crypto bindings, more complex).

### Implementation Plan

**server.ts changes:**

```typescript
// Context factory for HTTP requests
expressMiddleware(server, {
  context: async ({ req }) => {
    return extractAuthContext(req.headers.authorization);
  },
});

// Context factory for WebSocket connections
useServer(
  {
    schema,
    context: async (ctx) => {
      const token = ctx.connectionParams?.authorization as string;
      return extractAuthContext(token);
    },
  },
  wsServer,
);
```

**New file: `middleware/auth.ts`**

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URI = process.env.AUTH_JWKS_URI;
const TENANT_CLAIM = process.env.AUTH_TENANT_CLAIM || 'org_id';
const DEV_BYPASS = process.env.AUTH_DEV_BYPASS === 'true';

interface OrkaContext {
  tenantId: string;
  userId: string;
  authenticated: boolean;
}

export async function extractAuthContext(authHeader?: string): Promise<OrkaContext> {
  // Dev bypass: trust X-Tenant-Id header
  if (DEV_BYPASS && !authHeader) {
    return {
      tenantId: /* from header */ 'default',
      userId: 'dev-user',
      authenticated: false,
    };
  }

  // Production: validate JWT
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new AuthenticationError('Missing authorization');

  const JWKS = createRemoteJWKSet(new URL(JWKS_URI));
  const { payload } = await jwtVerify(token, JWKS);

  return {
    tenantId: payload[TENANT_CLAIM] as string,
    userId: payload.sub as string,
    authenticated: true,
  };
}
```

**client.ts changes (frontend):**

```typescript
const httpLink = new HttpLink({
  uri: '/graphql',
  headers: {
    authorization: `Bearer ${getToken()}`, // from IdP SDK
  },
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: `ws://${window.location.host}/graphql`,
    connectionParams: {
      authorization: `Bearer ${getToken()}`,
    },
  }),
);
```

### Dev Mode

For local development with Tilt:

- Set `AUTH_DEV_BYPASS=true` in docker-compose
- Client sends `X-Tenant-Id: default` header (no JWT needed)
- Auth middleware returns `{ tenantId: 'default', userId: 'dev-user', authenticated: false }`

### Risk Assessment

- **Low risk.** JWT validation is a standard middleware pattern. `jose` is maintained by the OpenID Foundation.
- **Migration:** Zero breaking changes to resolvers — context is additive. Resolvers that don't use `context.tenantId` keep working (but shouldn't).

---

## 2. Tenant Isolation

### Current State

- **87 raw `query()` calls** across 11 resolver files.
- `query()` at `pool.ts:21-26` is a thin passthrough — no tenant injection.
- `getClient()` at `pool.ts:28-30` returns raw `PoolClient` for transactions — bypasses any wrapper.
- Tenant ID is a **client-supplied GraphQL argument** in `intakeWorkspaces(tenantId: $tenantId)` — easily spoofed.
- Most resolvers (session, message, draft, visual, build, artifacts, classification, repo) filter only by entity IDs with **no tenant check**.

### Options Evaluated

| Option                                           | Pros                                           | Cons                                                                                                     | Verdict                           |
| ------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **A: Postgres RLS**                              | Enforced at DB level, cannot bypass            | Complex to set up, requires `SET app.tenant_id` per connection, breaks connection pooling, hard to debug | Over-engineered for current scale |
| **B: Query wrapper with mandatory tenant param** | Simple, explicit, greppable                    | Must manually update 87 call sites                                                                       | Pragmatic                         |
| **C: Auto-injecting query proxy**                | Transparent tenant injection via SQL rewriting | Magic is dangerous, hard to debug, can break complex queries                                             | Too clever                        |

### Recommendation: **B — Explicit tenant-scoped query function**

Create a `tenantQuery()` function that requires `OrkaContext`. All resolver queries migrate to it. Raw `query()` is restricted to non-tenant operations (health checks, schema migrations).

### Implementation Plan

**pool.ts changes:**

```typescript
// Existing — keep for non-tenant operations (health, migrations)
export async function query<T>(...) { ... }

// New — mandatory tenant scoping
export async function tenantQuery<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[],
  ctx: OrkaContext,
): Promise<pg.QueryResult<T>> {
  if (!ctx.tenantId) throw new Error('tenantId required');

  // Append tenant filter to WHERE clause
  // Convention: tenant_id is always the LAST parameter
  const scopedText = text.includes('WHERE')
    ? text.replace(/WHERE/i, `WHERE tenant_id = $${params.length + 1} AND`)
    : text;
  // For INSERT/UPDATE, tenant_id must be in the values (not injected)

  return pool.query<T>(scopedText, [...params, ctx.tenantId]);
}

// New — tenant-scoped client for transactions
export async function getTenantClient(ctx: OrkaContext) {
  const client = await pool.connect();
  // Set session variable for any RLS-style checks
  await client.query('SET app.current_tenant = $1', [ctx.tenantId]);
  return client;
}
```

**Wait — the auto-injection approach is fragile.** SQL rewriting breaks on JOINs, subqueries, CTEs, and INSERT statements. A better approach:

### Revised Recommendation: **Explicit per-query audit**

Don't auto-inject. Instead:

1. Add `ctx: OrkaContext` as the last parameter to every resolver function
2. Each query explicitly includes `AND tenant_id = $N` where appropriate
3. For workspace/session queries: validate ownership first (`SELECT tenant_id FROM intake_workspaces WHERE id = $1`)
4. Add a lint rule: `query()` calls without `tenant_id` in resolver files trigger a warning

This is more work but zero magic, zero surprise breakage.

### Migration Strategy

Not all 87 queries need tenant filtering:

| Category                                                   | Count | Needs tenant filter?                                       |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------------- |
| Direct tenant-scoped (workspace listing)                   | 7     | Already has it (but from client arg, needs to use context) |
| Entity-by-ID (get workspace by ID, get session by ID)      | ~20   | Needs ownership validation                                 |
| Child-of-entity (messages by session, drafts by workspace) | ~30   | Parent already validated = safe                            |
| Write operations (INSERT/UPDATE)                           | ~20   | Must include tenant_id in row                              |
| Internal operations (run ID gen, health)                   | ~10   | No tenant needed                                           |

**Phased approach:**

1. **Pass context through:** Wire `OrkaContext` from server.ts through resolver signatures. ~2 hours.
2. **Secure entry points:** Add tenant validation to workspace/session lookups (the roots). If the workspace is verified, child queries are safe. ~4 hours.
3. **Audit writes:** Ensure every INSERT includes `tenant_id`. ~2 hours.
4. **Remove client-supplied tenantId:** Stop accepting `tenantId` as a GraphQL argument. Always use server context. ~1 hour.

### Risk Assessment

- **Medium risk.** Touching 87 query call sites is error-prone. Must test each resolver after migration.
- **Regression plan:** Add integration tests that verify tenant A cannot access tenant B's data. Run these on every PR.

---

## 3. Redis PubSub

### Current State

- `pubsub/index.ts:4` — `new PubSub()` from `graphql-subscriptions` (in-memory)
- 7 event channel patterns, all keyed by entity ID (not tenant-scoped)
- Redis is running in Docker (`redis:7-alpine` on port 6379)
- `config.ts:14-16` has `redis.url` but nothing uses it
- `ioredis` is not installed

### Options Evaluated

| Option                                     | Pros                                                             | Cons                                                   | Verdict                              |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| **A: `graphql-redis-subscriptions`**       | Drop-in replacement for `graphql-subscriptions` PubSub, same API | Unmaintained (last update 2022), uses `ioredis` v4 API | Risky                                |
| **B: Custom Redis PubSub using `ioredis`** | Full control, uses latest ioredis, no stale dependencies         | More code to write                                     | Better                               |
| **C: `@graphql-yoga/redis-event-target`**  | Modern, maintained                                               | Requires switching from Apollo to Yoga                 | Wrong time for a framework migration |

### Recommendation: **B — Custom implementation using ioredis directly**

It's ~40 lines of code. The `graphql-subscriptions` `PubSub` interface is simple (publish, asyncIterator). Implementing it against `ioredis` avoids pulling in a stale adapter.

### Implementation Plan

**Install:**

```
pnpm --filter @orka/intake-api add ioredis
```

**New `pubsub/index.ts`:**

```typescript
import Redis from 'ioredis';
import { EventEmitter } from 'node:events';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;
  private emitter = new EventEmitter();

  constructor() {
    this.publisher = new Redis(REDIS_URL);
    this.subscriber = new Redis(REDIS_URL);

    this.subscriber.on('message', (channel: string, message: string) => {
      this.emitter.emit(channel, JSON.parse(message));
    });
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  asyncIterator<T>(channel: string): AsyncIterableIterator<T> {
    // Subscribe to Redis channel
    this.subscriber.subscribe(channel);

    // Bridge Redis messages to async iterator
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () =>
        new Promise<IteratorResult<T>>((resolve) => {
          this.emitter.once(channel, (data: T) => {
            resolve({ value: data, done: false });
          });
        }),
      return: () => {
        this.subscriber.unsubscribe(channel);
        return Promise.resolve({ value: undefined, done: true });
      },
      throw: (err) => Promise.reject(err),
    };
  }
}

export const pubsub = new RedisPubSub();

// Event channel keys — MUST include tenantId for multi-tenant safety
export const EVENTS = {
  MESSAGE_STREAM: (tenantId: string, sessionId: string) =>
    `${tenantId}:MESSAGE_STREAM:${sessionId}`,
  // ... etc
};
```

### Channel Key Migration

**Before (tenant-unsafe):**

```
MESSAGE_STREAM_{sessionId}
DRAFT_UPDATED_{workspaceId}
```

**After (tenant-scoped):**

```
{tenantId}:MESSAGE_STREAM:{sessionId}
{tenantId}:DRAFT_UPDATED:{workspaceId}
```

This means every `pubsub.publish()` and `pubsub.asyncIterator()` call needs the tenant prefix. Since we're already passing `OrkaContext` through resolvers (from the auth change), this is natural:

```typescript
// Subscription resolver
subscribe: (_: unknown, { sessionId }: { sessionId: string }, ctx: OrkaContext) => {
  return pubsub.asyncIterator(EVENTS.MESSAGE_STREAM(ctx.tenantId, sessionId));
};
```

### Subscriber Pattern Issue

**Critical finding:** The `graphql-subscriptions` `PubSub` uses one `EventEmitter` per process. Its `asyncIterator` creates a listener on a channel name. Multiple subscriptions to the same channel share the same Redis subscription.

But Redis `SUBSCRIBE` is per-connection. If we have 100 clients subscribed to 100 different channels, we need 100 `SUBSCRIBE` calls on the subscriber connection. This is fine — Redis handles this efficiently. But the `asyncIterator` bridge needs to handle the fan-out correctly (one Redis message → multiple async iterators waiting on that channel).

**Solution:** Use one Redis subscriber connection. On each `message` event, emit to a Node.js EventEmitter keyed by channel. Each `asyncIterator` listens on its channel key. This is exactly what `graphql-redis-subscriptions` does internally.

### Risk Assessment

- **Low risk** for the PubSub swap — it's a single file with a clear interface.
- **Medium risk** for channel key migration — every publish and subscribe call site must add `tenantId`. There are ~15 `pubsub.publish()` calls and ~7 subscription resolvers.
- **Testing:** Spin up 2 API instances behind a load balancer. Verify that a subscription on instance 1 receives events published by instance 2.

---

## 4. Dependency Impact

### New Dependencies

| Package   | Size  | Why                                                           |
| --------- | ----- | ------------------------------------------------------------- |
| `jose`    | 45KB  | JWT verification + JWKS (lightweight, zero native deps)       |
| `ioredis` | 280KB | Redis client for PubSub (well-maintained, TypeScript support) |

### Removed Dependencies

| Package                 | Why                             |
| ----------------------- | ------------------------------- |
| `graphql-subscriptions` | Replaced by custom Redis PubSub |

### No New Services

All changes are within `intake-api`. No new Docker containers. No new ports. Redis is already running.

---

## 5. Files Changed (Estimated)

| File                   | Change                               |
| ---------------------- | ------------------------------------ |
| `server.ts`            | Add context factory for HTTP + WS    |
| `middleware/auth.ts`   | **New.** JWT validation + dev bypass |
| `pubsub/index.ts`      | Rewrite: in-memory → Redis           |
| `pool.ts`              | Add `tenantQuery()` helper           |
| `config.ts`            | Add auth config block                |
| 11 resolver files      | Wire `ctx.tenantId` through queries  |
| `client.ts` (frontend) | Add `Authorization` header           |
| `docker-compose.yml`   | Add `AUTH_DEV_BYPASS=true` env var   |
| **Total**              | ~16 files                            |

---

## 6. Execution Order (within Phase A)

```
Day 1: Auth middleware + dev bypass + frontend header
       (system works identically in dev, but context object exists)

Day 2: Redis PubSub swap + channel key migration
       (subscriptions work cross-instance, tenant-scoped)

Day 3: Tenant isolation — wire ctx through resolvers,
       secure entry points, audit writes

Day 4: Integration tests — verify tenant A can't see tenant B
```

---

## 7. Open Decisions Needed

| Decision                | Options                                        | Default if no input                                           |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| JWT claim for tenant ID | `org_id`, `tenant_id`, `custom:tenant`         | `org_id` (Auth0/Firebase convention)                          |
| Dev bypass mechanism    | Header-based vs. static token vs. no auth      | `X-Tenant-Id` header when `AUTH_DEV_BYPASS=true`              |
| PubSub implementation   | Custom ioredis vs. graphql-redis-subscriptions | Custom ioredis (40 lines, no stale deps)                      |
| Tenant validation depth | Root-only vs. every query                      | Root-only (validate workspace ownership, trust child queries) |
