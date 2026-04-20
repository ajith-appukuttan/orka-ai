# Impact Analysis: Moving from `@anthropic-ai/vertex-sdk` to `@anthropic-ai/claude-agent-sdk`

> **Date:** 2026-04-15
> **Status:** Analysis / RFC
> **Author:** AI-assisted analysis

---

## Current State

The AI layer is centralized in `apps/intake-api/src/services/claude.ts`. It uses `@anthropic-ai/vertex-sdk` (v0.16.0) as a thin wrapper over the Claude Messages API, authenticated via Google Cloud Application Default Credentials (ADC).

### Two invocation patterns

1. **Non-streaming** (`client.messages.create`) — 9 call sites for structured JSON extraction (draft, tools, memory, summaries, visual requirements, repo analysis, classification)
2. **Streaming** (`client.messages.stream`) — 1 call site for the copilot chat

### Tool usage is manual

`toolPlanner.ts` asks Claude to _decide_ which tools to call via plain text, parses the JSON response, then executes tools via HTTP against the MCP Gateway. Claude never directly invokes tools via its native `tool_use` API.

### Configuration

| Variable                      | Purpose                      | Default                   |
| ----------------------------- | ---------------------------- | ------------------------- |
| `ANTHROPIC_VERTEX_PROJECT_ID` | GCP project ID for Vertex AI | —                         |
| `GOOGLE_CLOUD_PROJECT`        | Fallback GCP project ID      | —                         |
| `GOOGLE_CLOUD_LOCATION`       | GCP region                   | `us-east5`                |
| `CLAUDE_MODEL`                | Claude model identifier      | `claude-opus-4-6@default` |

---

## What the Claude Agent SDK Actually Is

The Claude Agent SDK is **not** a drop-in replacement for the Vertex SDK. They serve fundamentally different purposes.

| Aspect                | `@anthropic-ai/vertex-sdk`             | `@anthropic-ai/claude-agent-sdk`                                     |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| **Purpose**           | API client for Claude Messages API     | Autonomous agent runtime (Claude Code as a library)                  |
| **Abstraction level** | Low-level: send prompts, get responses | High-level: give a task, agent loops autonomously                    |
| **Tool execution**    | You implement tools                    | Built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebFetch, etc.) |
| **Control**           | Full control over every API call       | Agent decides what to do; you observe via event stream               |
| **Authentication**    | Vertex AI (GCP ADC)                    | Anthropic API key (with optional Vertex/Bedrock/Azure backend)       |
| **Billing**           | GCP Vertex AI billing                  | Anthropic API billing (or Vertex via `CLAUDE_CODE_USE_VERTEX=1`)     |
| **Agent loop**        | You build it                           | Built-in autonomous loop                                             |
| **MCP support**       | None (manual HTTP)                     | Native (`mcpServers` option, stdio-based)                            |
| **Subagents**         | Manual orchestration                   | Built-in via `Agent` tool                                            |

---

## Impact by Orka Component

### 1. Intake Agents (copilot, draft extractor, memory curator, etc.)

**Impact: HIGH — Likely a bad fit.**

The intake agents are narrow, structured extraction tasks: send a specific system prompt, a formatted user message, parse JSON from the response. The Agent SDK is designed for _autonomous multi-step work_ where Claude decides what files to read, commands to run, etc. Using it for "extract a JSON PRD from this conversation" would be architectural overkill.

**What you would lose:**

- Fine-grained control over `max_tokens` per agent (currently tuned 1024–4096 per function)
- Precise system prompt injection
- Deterministic input formatting
- Streaming deltas for the copilot chat UI (the Agent SDK streams events, not raw text deltas)

**Affected functions in `claude.ts`:**

| Function                      | Purpose                            | Max Tokens |
| ----------------------------- | ---------------------------------- | ---------- |
| `generateWithPrompt()`        | Builder agent generic generation   | 4096       |
| `streamCopilotResponse()`     | Streaming copilot chat             | 2048       |
| `extractDraft()`              | Structured PRD extraction          | 4096       |
| `planTools()`                 | Tool selection decisions           | 1024       |
| `generateSummary()`           | Rolling workspace summaries        | 1024       |
| `curateMemory()`              | Durable fact extraction            | 1024       |
| `generateVisualRequirement()` | Visual UI requirement conversion   | 2048       |
| `aggregateVisualPRD()`        | Visual requirement aggregation     | 4096       |
| `analyzeRepository()`         | Repository structure analysis      | 4096       |
| `classifyIntakeReadiness()`   | PRD build readiness classification | 2048       |

### 2. Tool Planner (`toolPlanner.ts`)

**Impact: MEDIUM — Possible improvement, but architectural mismatch.**

Today the tool planner manually orchestrates tool selection: Claude decides via text, you execute via MCP Gateway HTTP. The Agent SDK has native MCP support and native tool use. In theory, you could let the agent call tools directly.

**Complications:**

- The MCP Gateway is a custom HTTP service with its own tool registry, permissions, and audit logging. The Agent SDK's MCP integration expects **stdio-based** MCP servers, not HTTP APIs.
- Migration would require either:
  - Rewriting the MCP Gateway as a stdio MCP server, or
  - Writing an adapter layer
- You would lose the audit trail, permission checks, and per-session tool logging currently in `mcpClient.ts`.

### 3. Builder Pipeline (`builder/orchestrator.ts`)

**Impact: HIGHEST POTENTIAL VALUE — But requires full rewrite.**

This is where the Agent SDK _could_ deliver significant value. The current builder does:

1. Plan tasks (Claude call → JSON)
2. Generate code (Claude call → parse file changes → write to worktree)
3. Review code (Claude call → approve/reject)
4. Generate tests (Claude call → parse test files → write to worktree)
5. Commit and create PR

The Agent SDK could replace steps 2–4 with an autonomous agent that reads the codebase, edits files, runs tests, and iterates — giving you Claude Code's editing capabilities.

**Complications:**

| Concern                 | Detail                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker architecture** | Builder runs in BullMQ with concurrency limits. The Agent SDK spawns subprocesses (Claude Code under the hood), conflicting with the worker model.                         |
| **Git worktrees**       | Builder writes to worktrees via `simple-git`. Agent SDK writes directly to filesystem. Would need `workingDirectory` pointed at the worktree.                              |
| **Observability**       | Current builder has task-level DB tracking, per-commit review scores, and persisted execution logs. Agent SDK provides an event stream but not granular DB-level tracking. |
| **Determinism**         | Current builder has a clear linear pipeline with checkpoints. Agent SDK is autonomous and non-deterministic.                                                               |
| **Concurrency**         | Builder worker runs at concurrency 1. Agent SDK may spawn multiple subprocesses internally.                                                                                |

### 4. Authentication & Billing

**Impact: MEDIUM.**

| Concern                    | Detail                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Auth method change**     | Current: GCP ADC → Vertex AI. Agent SDK: Anthropic API key by default, Vertex via `CLAUDE_CODE_USE_VERTEX=1` env var.   |
| **Model selection**        | Currently configurable via `CLAUDE_MODEL` env var (`claude-opus-4-6@default`). Agent SDK may constrain model selection. |
| **Billing channel**        | Would shift from GCP Vertex billing to Anthropic API billing (unless Vertex backend is used).                           |
| **Credentials management** | Would need to manage Anthropic API keys in addition to (or instead of) GCP credentials.                                 |

### 5. Deployment & Infrastructure

**Impact: HIGH.**

- The Agent SDK is essentially Claude Code running as a library. It expects filesystem access and can run bash commands / spawn subprocesses. This significantly changes the container security profile.
- Current setup is clean: Claude is called as an HTTP API, no filesystem access needed for AI calls. With the Agent SDK, containers would need broader permissions.
- **Cloud Run** (planned production target) has an ephemeral filesystem and execution model that may conflict with the Agent SDK's assumptions about persistent working directories and subprocess execution.
- Container images would need additional tooling (git, node, etc.) available for the Agent SDK's built-in tools.

---

## Migration Effort Estimate

| Component                       | Effort | Risk                                        | Value                               |
| ------------------------------- | ------ | ------------------------------------------- | ----------------------------------- |
| Intake agents (all 9 functions) | Large  | High — regression risk on structured output | Low — current approach works well   |
| Streaming copilot               | Large  | High — different streaming model            | Low — current streaming works       |
| Tool planner                    | Medium | Medium — adapter needed for MCP Gateway     | Medium — native tool use is cleaner |
| Builder code generation         | Large  | Medium — isolated in worktrees              | High — autonomous coding capability |
| Builder review + tests          | Medium | Medium                                      | Medium — iterative improvement      |
| Auth/billing reconfiguration    | Small  | Low                                         | Neutral                             |
| Container security updates      | Medium | Medium — expanded attack surface            | Negative — more permissions needed  |

**Total estimated effort:** 4–6 weeks for a full migration, 1–2 weeks for builder-only.

---

## Recommendation

**Do not migrate wholesale.** The two SDKs serve different purposes.

### Keep `@anthropic-ai/vertex-sdk` for:

- All intake agents (structured extraction)
- Streaming copilot chat
- Tool planning decisions
- Draft extraction, memory curation
- Readiness classification
- Visual requirement processing
- Repository analysis

### Consider `@anthropic-ai/claude-agent-sdk` for:

- Builder code generation (autonomous coding in worktrees)
- Future autonomous code review
- CI/CD pipeline agents
- Complex multi-step tasks where Claude needs filesystem access

### Quick wins without the Agent SDK:

1. **Add native `tool_use` API** to the tool planner — the Vertex SDK already supports Claude's native tool calling. Replace the text-based JSON parsing in `toolPlanner.ts` with structured tool definitions. No new dependencies needed.
2. **Add retry/fallback logic** to `claude.ts` — the Agent SDK has built-in retries, but you can add this to the Vertex SDK calls trivially.

### If you proceed with the builder integration:

1. Install `@anthropic-ai/claude-agent-sdk` **alongside** the Vertex SDK (not replacing it)
2. Configure it with `CLAUDE_CODE_USE_VERTEX=1` to keep GCP billing
3. Use it specifically in `builder/codeGenerator.ts` and `builder/testGenerator.ts`
4. Run the agent with `workingDirectory` pointed at the git worktree path
5. Restrict tools via `allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"]` (no Bash for safety)
6. Capture events from the agent stream for task-level DB logging
7. Keep the existing `orchestrator.ts` pipeline structure, only replacing the code-gen inner loop

---

## Architecture Diagram (Proposed Hybrid)

```
┌─────────────────────────────────────────────────────┐
│                   Orka Platform                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Intake Pipeline (keep @anthropic-ai/vertex-sdk)     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │ Copilot  │ │  Draft   │ │ Memory / Summary │    │
│  │ (stream) │ │ Extractor│ │    Curators      │    │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘    │
│       │             │                │               │
│       └─────────────┴────────────────┘               │
│                     │                                │
│           ┌─────────▼──────────┐                     │
│           │  AnthropicVertex   │                     │
│           │  (Messages API)    │                     │
│           └─────────┬──────────┘                     │
│                     │                                │
├─────────────────────┼────────────────────────────────┤
│                     │                                │
│  Builder Pipeline (add @anthropic-ai/claude-agent-sdk)│
│  ┌──────────┐ ┌─────▼─────┐ ┌──────────────────┐   │
│  │  Task    │ │   Code    │ │   Test           │   │
│  │ Planner  │ │ Generator │ │   Generator      │   │
│  │ (vertex) │ │ (agent-sdk│ │   (agent-sdk)    │   │
│  └──────────┘ └───────────┘ └──────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## References

- [Claude Agent SDK docs](https://docs.claude.com/en/api/agent-sdk/overview)
- [Claude Agent SDK TypeScript repo](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Anthropic Vertex SDK](https://www.npmjs.com/package/@anthropic-ai/vertex-sdk)
- Current Orka AI service: `apps/intake-api/src/services/claude.ts`
- Current Orka builder: `apps/intake-api/src/agents/builder/orchestrator.ts`
- Current Orka tool planner: `apps/intake-api/src/agents/toolPlanner.ts`
