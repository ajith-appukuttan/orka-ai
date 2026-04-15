# P2/P3 Technical Design — Multi-Tenant SaaS Readiness

**Author:** Staff Engineer Review  
**Status:** DRAFT — Awaiting Review  
**Target:** Multi-tenant SaaS deployment

---

## 1. Current State Assessment

The system works as a single-tenant demo. For multi-tenant SaaS, there are **6 blocking issues** and **4 significant gaps**.

### Blocking Issues (Must fix before any customer)

| #   | Issue                      | Severity | Current State                                                                                           |
| --- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| B1  | **No authentication**      | Critical | API is completely open. Any HTTP client has full access.                                                |
| B2  | **No tenant isolation**    | Critical | Queries don't filter by tenant. `buildRun(runId)` returns any tenant's data.                            |
| B3  | **In-memory PubSub**       | Critical | Single-process subscriptions. Cannot scale to 2+ API instances.                                         |
| B4  | **Fire-and-forget builds** | High     | Build pipeline runs in-process. Server restart = lost builds, stuck `INITIALIZING` rows.                |
| B5  | **No rate limiting**       | High     | Single Claude client, no concurrency control. One busy tenant can exhaust Vertex quota for all tenants. |
| B6  | **Legacy table debt**      | Medium   | Dual draft tables, dual artifact tables. Stale data bugs are inevitable.                                |

### Significant Gaps

| #   | Gap                       | Impact                                                                            |
| --- | ------------------------- | --------------------------------------------------------------------------------- |
| G1  | No pipeline state machine | Can't track where a project is in the SDLC flow. Sidebar badge is hardcoded.      |
| G2  | No elaboration flow       | Classifier says NEEDS_ELABORATION but system has no way to do it.                 |
| G3  | No observability          | No structured logging, no metrics, no tracing. Debugging production issues blind. |
| G4  | No resource cleanup       | Worktrees, cloned repos, and tmp files accumulate. Disk fills up.                 |

---

## 2. Design Principles

1. **No new services until the existing ones are solid.** The orchestrator/event bus was premature. Intake-api handles everything today and should continue to — but correctly.

2. **Tenant context must be mandatory, not optional.** Every DB query, every API call, every agent invocation must have a verified tenant context. This is not a feature — it's a security requirement.

3. **Long-running work belongs in a job queue, not in request handlers.** Builds, repo analysis, and classification are multi-minute operations. They must survive process restarts.

4. **Fix the foundation before adding features.** Elaboration phase is P2 but it builds on a broken foundation. Auth and tenant isolation come first.

---

## 3. Proposed Architecture

### 3.1 Authentication & Tenant Context

**Approach:** JWT-based auth middleware on the GraphQL endpoint.

```
Request → JWT validation middleware → Extract tenantId + userId
  → Inject into GraphQL context → Available in every resolver
```

- Accept JWTs from an external IdP (Auth0, Firebase Auth, Cognito — configurable).
- For local dev, accept a `X-Tenant-Id` / `X-User-Id` header (dev-only bypass).
- GraphQL context type becomes:

```typescript
interface OrkaContext {
  tenantId: string;
  userId: string;
  roles: string[];
}
```

**Tenant isolation:** Every query gets `AND tenant_id = $context.tenantId` appended. Not optional. Enforced via a query wrapper:

```typescript
function tenantQuery<T>(sql: string, params: unknown[], ctx: OrkaContext) {
  // Inject tenant filter into WHERE clause
  return query<T>(sql, [...params, ctx.tenantId]);
}
```

**Trade-off:** This is a middleware change, not a stored-procedure/RLS approach. RLS in Postgres would be more robust but adds complexity to migrations and makes local dev harder. The middleware approach is pragmatic for the current scale.

### 3.2 Redis PubSub (Replace In-Memory)

**Change:** Replace `graphql-subscriptions` PubSub with `graphql-redis-subscriptions`.

```typescript
// Before
import { PubSub } from 'graphql-subscriptions';
const pubsub = new PubSub();

// After
import { RedisPubSub } from 'graphql-redis-subscriptions';
const pubsub = new RedisPubSub({
  connection: { host: 'redis', port: 6379 },
});
```

Redis is already running in Docker. This is a one-file change (`pubsub/index.ts`) that unblocks horizontal scaling.

**Subscription channels must be tenant-scoped:**

```
DRAFT_UPDATED_{tenantId}_{workspaceId}
```

Not just `DRAFT_UPDATED_{workspaceId}` — because workspace IDs are UUIDs and theoretically guessable.

### 3.3 Durable Job Queue for Long-Running Work

**Problem:** Build execution, repo analysis, and classification run as fire-and-forget promises inside request handlers. If the process crashes, work is lost.

**Approach:** Use BullMQ (Redis-backed job queue). Already have Redis.

```
Approval resolver → enqueue "classify" job
Classifier result → if DIRECT_TO_BUILD → enqueue "build" job
Build completion → update DB, publish to chat via PubSub
```

**Job types:**

- `classify`: Run intake readiness classifier
- `build`: Execute full build pipeline
- `repo-analyze`: Clone and analyze repository

**Benefits:**

- Jobs survive process restarts (persisted in Redis)
- Built-in retry with exponential backoff
- Concurrency control per job type (e.g., max 2 concurrent builds per tenant)
- Job status visible in the UI ("Build queued", "Building task 3/5")

**Trade-off:** BullMQ adds a dependency and slightly more complexity than fire-and-forget. But for multi-tenant SaaS, losing customer builds on process restart is unacceptable.

### 3.4 Pipeline State Machine

**Not a separate service.** A module in intake-api with a dedicated table.

```sql
CREATE TABLE pipeline_states (
  workspace_id UUID PRIMARY KEY REFERENCES intake_workspaces(id),
  tenant_id VARCHAR(255) NOT NULL,
  current_phase VARCHAR(20) NOT NULL DEFAULT 'INTAKE',
  phases JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Phase statuses: `NOT_STARTED | IN_PROGRESS | APPROVED | SKIPPED | FAILED`

Transitions are enforced by a function, not a separate service:

```typescript
function advancePhase(state: PipelineState, toPhase: PhaseId): PipelineState {
  // Validate prerequisites
  // Update phase status
  // Return new state
}
```

The classifier output directly drives the routing:

- `DIRECT_TO_BUILD` → skip ELABORATION + PLANNING, go to BUILD
- `NEEDS_ELABORATION` → go to ELABORATION
- `NEEDS_PLANNING` → go to PLANNING

### 3.5 Elaboration Phase

**Not a separate service.** An alternate copilot persona loaded when `currentPhase === 'ELABORATION'`.

The elaboration copilot:

- Loads the approved PRD + classifier blocking questions as context
- Uses a different system prompt (`elaboration-copilot.md`) focused on resolving technical ambiguity
- Writes to the same draft table (new version with `change_source = 'elaboration'`)
- When blocking questions are resolved, allows re-approval → re-classification

**This is 2 files:** one prompt markdown, one persona-switching block in the copilot router.

### 3.6 Legacy Table Cleanup

**Remove:**

- `intake_drafts` (replaced by `intake_draft_versions`)
- `approved_intake_artifacts` (replaced by `approved_artifacts_v2`)
- `workspace_id VARCHAR(255)` column on `intake_sessions` (keep only `intake_workspace_id UUID`)

**Migration:** Create migration 016 that drops these tables/columns. Update all resolvers that reference them. Remove the dual-write in the approval resolver.

### 3.7 Resource Management

**Claude rate limiting:**

```typescript
const claudeLimiter = new Bottleneck({
  maxConcurrent: 5, // max 5 concurrent Claude calls
  minTime: 200, // 200ms between calls
  reservoir: 100, // 100 calls per minute
  reservoirRefreshInterval: 60000,
  reservoirRefreshAmount: 100,
});
```

Per-tenant limits enforced at the job queue level (BullMQ rate limiter).

**Worktree cleanup:** Background job that runs every hour, removes worktrees older than 24 hours. Also clean up on build completion.

**Connection pool:** Increase from 20 to 50 for production. Add per-query timeouts (30s for normal queries, 5min for long-running build operations).

### 3.8 Health Checks & Observability

**Health endpoints:** `/health` on every service checking DB, Redis, and dependent service connectivity.

**Structured logging:** Replace `console.info/error` with a structured logger (pino) that outputs JSON with `tenantId`, `workspaceId`, `runId`, `phase`, `duration`.

**Metrics:** Add OpenTelemetry spans around:

- Chat turn pipeline (end-to-end latency)
- Claude API calls (latency, token usage)
- Build pipeline steps (per-task timing)
- MCP tool invocations

---

## 4. Implementation Order

Ordered by risk reduction, not feature value:

### Phase A: Security Foundation (must ship together)

1. **Auth middleware** — JWT validation + dev bypass
2. **Tenant context injection** — Every resolver gets tenant filter
3. **Redis PubSub** — Replace in-memory pubsub

**Why together:** Without auth, tenant isolation is unenforceable. Without tenant isolation, Redis PubSub leaks cross-tenant data. All three must ship as one unit.

### Phase B: Durability

4. **BullMQ job queue** — Move classify/build/repo-analyze off request handlers
5. **Legacy table cleanup** — Remove dual tables, simplify data model

**Why this order:** Job queue prevents lost builds. Legacy cleanup prevents stale data bugs. Both reduce the surface area for multi-tenant bugs.

### Phase C: Pipeline & Elaboration

6. **Pipeline state table + transitions** — Track phase per workspace
7. **Pipeline progress UI** — Stepper in chat header
8. **Elaboration copilot persona** — Alternate prompt for elaboration mode

**Why last:** These are features, not fixes. They build on the secure, durable foundation from A and B.

### Phase D: Operational Readiness

9. **Structured logging (pino)**
10. **Health checks**
11. **Claude rate limiting**
12. **Worktree cleanup job**

---

## 5. What I'm NOT Proposing

| Idea                              | Why Not                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate orchestrator service     | The system has 1 API, 1 gateway, 1 browser preview. Adding a 4th service for state management is premature. A module in intake-api is sufficient until there's evidence of scaling pressure. |
| Event bus / message broker        | Redis PubSub for subscriptions + BullMQ for jobs covers the use cases. A formal event bus (Kafka, Cloud Pub/Sub) is warranted at 100+ concurrent tenants, not now.                           |
| Phase contracts package           | TypeScript interfaces in a shared package add value when multiple services consume them. With one API service, they're just indirection. Define types where they're used.                    |
| Separate Elaboration API          | Same runtime, different prompt. Not a different service.                                                                                                                                     |
| Kubernetes / Cloud Run deployment | Not in scope for P2/P3. Current Docker Compose + Tilt is sufficient for development and early production.                                                                                    |

---

## 6. Risks & Mitigations

| Risk                                            | Probability | Impact | Mitigation                                                                            |
| ----------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------- |
| JWT integration blocks on IdP choice            | Medium      | High   | Ship with configurable IdP. Default to Firebase Auth for speed. Dev bypass for local. |
| BullMQ adds operational complexity              | Low         | Medium | Redis is already running. BullMQ dashboard (Bull Board) gives visibility.             |
| Legacy table migration breaks existing data     | Medium      | High   | Run migration in transaction. Test against a DB dump before production.               |
| Claude rate limits hit during concurrent builds | High        | Medium | Per-tenant concurrency limits via BullMQ. Queue excess work instead of dropping it.   |

---

## 7. Open Questions

1. **Which IdP?** Firebase Auth is fastest to integrate. Auth0 is more feature-rich. Cognito if deploying on AWS. Need a decision.
2. **Tenant provisioning:** How are new tenants created? Self-service signup or admin-provisioned?
3. **Data residency:** Do tenants need data stored in specific regions? Affects GCS bucket strategy.
4. **Billing model:** Per-seat? Per-build? Per-PRD? Affects metering and rate limiting design.

---

## 8. Estimated Effort

| Phase         | Tasks                               | Estimated Days | Dependencies        |
| ------------- | ----------------------------------- | -------------- | ------------------- |
| A: Security   | Auth + Tenant + Redis PubSub        | 3-4 days       | IdP decision        |
| B: Durability | Job queue + Legacy cleanup          | 2-3 days       | Phase A             |
| C: Pipeline   | State machine + UI + Elaboration    | 3-4 days       | Phase B             |
| D: Operations | Logging + Health + Limits + Cleanup | 2-3 days       | Can parallel with C |
| **Total**     | **12 tasks**                        | **10-14 days** |                     |

---

_This design prioritizes making the system safe for multi-tenant use over adding new features. Features built on a broken foundation will need to be rebuilt. Features built on a solid foundation will last._
