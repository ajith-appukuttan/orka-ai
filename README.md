# Orka — Virtual Product Manager

An AI-powered SDLC intake platform that captures product requirements through conversation, visual UI inspection, and repository analysis. Built with Claude (Vertex AI), React 19, and Apollo GraphQL.

## What It Does

Orka acts as a **Virtual Product Manager** — it guides users through describing what they want to build and produces a structured **Draft PRD** ready for elaboration. It supports three intake modes:

- **Chat Intake** — Conversational requirements capture guided by 5 core prompts
- **Visual Intake** — Inspect live UI elements in a real Chrome browser and describe changes
- **Repository Intake** — Point to a GitHub repo to seed requirements from existing code

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Orka UI (React 19 + Vite)               │
│  ┌──────────┬─────────────────────────┬───────────────────┐  │
│  │ Sidebar  │ Chat / Visual Panel     │ Draft PRD Panel   │  │
│  │          │                         │ (OpenCode theme)  │  │
│  │ Workspace│ Claude streaming chat   │ Live readiness    │  │
│  │ tree     │ or Chrome CDP inspect   │ Memory items      │  │
│  │ + Search │                         │ UI requirements   │  │
│  └──────────┴─────────────────────────┴───────────────────┘  │
└──────────────────────┬────────────────────────┬──────────────┘
                       │ GraphQL + WebSocket    │
              ┌────────▼────────┐      ┌────────▼────────┐
              │  Intake API      │      │ Preview Browser  │
              │  Apollo Server   │      │ Chrome + CDP     │
              │  Claude agents   │      │ Element inspect  │
              │  :4000           │      │ :4002            │
              └───────┬──┬──────┘      └─────────────────┘
                      │  │
              ┌───────▼──▼──────┐
              │  MCP Gateway     │
              │  Tool registry   │
              │  :4001           │
              └─────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    PostgreSQL     Redis     Claude (Vertex AI)
```

## Tech Stack

| Layer     | Technology                                        |
| --------- | ------------------------------------------------- |
| Frontend  | React 19, Vite, Mantine UI, Apollo Client         |
| API       | Node.js 22, Apollo Server, GraphQL, WebSocket     |
| AI        | Claude via Vertex AI (`@anthropic-ai/vertex-sdk`) |
| Database  | PostgreSQL (raw SQL, `pg` driver)                 |
| Cache     | Redis                                             |
| Browser   | Playwright + Chrome CDP for visual intake         |
| Tools     | MCP Gateway with tool registry                    |
| Monorepo  | pnpm workspaces                                   |
| Local Dev | Tilt + Docker Compose                             |

## Repo Structure

```
orka/
├── apps/
│   ├── intake-api/              # GraphQL API + Claude agents
│   │   ├── src/
│   │   │   ├── agents/          # intakeCopilot, draftExtractor, memoryCurator,
│   │   │   │                    # summaryGenerator, toolPlanner, visualRequirementGenerator
│   │   │   ├── services/        # claude, contextAssembler, mcpClient
│   │   │   ├── schema/          # GraphQL typeDefs + resolvers
│   │   │   └── db/              # Pool, migrations (001-010)
│   │   └── Dockerfile
│   │
│   ├── intake-ui/               # React 19 + Vite frontend
│   │   ├── src/
│   │   │   ├── components/      # chat, draft, layout, review, visual
│   │   │   ├── hooks/           # useChat, useDraft, useMemory, useSearch,
│   │   │   │                    # useVisualIntake, useWorkspaces, useExtensionBridge
│   │   │   ├── graphql/         # queries, mutations, subscriptions
│   │   │   └── pages/           # IntakePage, ReviewPage
│   │   └── Dockerfile
│   │
│   ├── mcp-gateway/             # MCP tool registry + invocation service
│   ├── preview-browser/         # Chrome launcher + CDP + Playwright
│   ├── orka-extension/          # Chrome extension for visual inspect
│   └── mock-app/                # Test app for visual intake
│
├── packages/
│   ├── draft-schema/            # IntakeDraft Zod schema + types
│   └── shared-types/            # Shared TypeScript interfaces
│
├── prompts/                     # Claude system prompts
│   ├── intake-copilot.md        # Conversational intake (5 core prompts)
│   ├── draft-extractor.md       # Structured draft extraction
│   ├── memory-curator.md        # Durable fact extraction
│   ├── summary-generator.md     # Rolling workspace summaries
│   ├── tool-planner.md          # MCP tool selection
│   └── visual-intake.md         # UI element → requirement
│
├── tilt/                        # Docker Compose for Postgres + Redis
├── Tiltfile                     # Local dev orchestration
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for Postgres + Redis)
- Tilt (for local dev orchestration)
- Google Cloud credentials (for Claude via Vertex AI)

### Setup

```bash
# Clone
git clone https://github.com/ajith-appukuttan/orka-ai.git
cd orka-ai

# Install dependencies
pnpm install

# Install Playwright browsers (for visual intake)
pnpm --filter @orka/preview-browser exec playwright install chromium

# Build all packages
pnpm -r build
```

### Environment Variables

Set these before running (or configure in your shell profile):

```bash
# Claude via Vertex AI
export ANTHROPIC_VERTEX_PROJECT_ID="your-gcp-project"
export GOOGLE_CLOUD_LOCATION="us-east5"      # or your region
export CLAUDE_MODEL="claude-sonnet-4-20250514"  # or your preferred model

# Application Default Credentials
gcloud auth application-default login
```

### Run

```bash
# Start everything with Tilt
tilt up

# Or start services individually:
# Terminal 1: Infrastructure
docker compose -f tilt/docker-compose.yml up

# Terminal 2: API
pnpm --filter @orka/intake-api dev

# Terminal 3: MCP Gateway
pnpm --filter @orka/mcp-gateway dev

# Terminal 4: Preview Browser
pnpm --filter @orka/preview-browser dev

# Terminal 5: UI
pnpm --filter @orka/intake-ui dev
```

### Access

| Service         | URL                           |
| --------------- | ----------------------------- |
| Orka UI         | http://localhost:5173         |
| GraphQL API     | http://localhost:4000/graphql |
| MCP Gateway     | http://localhost:4001         |
| Preview Browser | http://localhost:4002         |
| Mock App        | http://localhost:3001         |
| Tilt Dashboard  | http://localhost:10350        |

## Features

### Chat-Based Intake

Conversational requirements capture guided by the **5 Core Prompts**:

1. What problem are we solving, and for whom?
2. What does success look like?
3. What are we explicitly not doing?
4. What do we know we don't know?
5. What does the current state look like?

Claude streams responses, and a **Draft Extractor** agent runs in parallel to extract structured data into the Draft PRD.

### Draft PRD (Live Panel)

The right panel shows a live-updating structured draft with:

- Problem Statement (who, what, context, cost of inaction)
- Trigger (why now)
- Goals, Non-Goals
- User Stories (As a... I want... So that...)
- Constraints, Assumptions
- Open Questions (named uncertainty)
- Current State
- UI Requirements (from visual intake)
- Readiness score with weighted scoring across the 5 core prompts

### Visual Intake

Three approaches for visual requirements capture:

1. **Chrome CDP** — Orka launches a real Chrome window. Enable inspect mode, click elements, describe changes. Claude generates structured requirements.

2. **Browser Extension** — Chrome extension with content script inspector. Hover highlight, click-to-select, captures element metadata + screenshots.

3. **Screenshot Upload** — Upload a mockup or screenshot, describe changes.

### Session Persistence

- **Workspaces** — Long-lived containers grouping sessions, drafts, memory
- **Session Restore** — Reopen prior sessions with full message history
- **Rolling Summaries** — Generated every 5 turns for efficient context
- **Project Memory** — Durable facts persist across sessions (constraints, preferences, standards)

### Search

Search across workspace titles, session content, message text, and memory items.

### Theme

- Light/dark mode toggle
- Draft PRD panel uses OpenCode/terminal theme (monospace, dark background, green accents)

## Agent Pipeline

On every chat message:

```
user message → save
  → assembleContext() [messages, draft, summary, memory, open questions]
  → runToolPlanner() → (optional) MCP tool calls
  → streamCopilotResponse() via Claude Vertex AI
  → save assistant message
  → [parallel]
      → runDraftExtractor()     — update structured draft
      → runMemoryCurator()      — extract durable facts
      → maybeSummarize()        — refresh summary if needed
```

## Database Schema

10 migrations covering:

- `intake_sessions`, `intake_messages` — conversation storage
- `intake_drafts` — legacy session-scoped drafts
- `intake_workspaces` — workspace model
- `intake_draft_versions` — workspace-scoped versioned drafts
- `workspace_summaries` — rolling summaries
- `intake_memory_items` — project memory (facts, constraints, preferences)
- `tool_call_logs` — MCP tool call audit trail
- `approved_intake_artifacts` — immutable approved PRDs
- `visual_preview_sessions`, `visual_selections`, `visual_requirements` — visual intake

## GraphQL API

### Key Operations

**Queries**: `intakeWorkspaces`, `intakeSession`, `intakeMessages`, `intakeLatestDraft`, `intakeMemoryItems`, `visualRequirements`, `searchIntake`

**Mutations**: `createIntakeWorkspace`, `startIntakeSession`, `sendIntakeMessage`, `logIntakeMessage`, `editIntakeDraft`, `approveIntakeDraft`, `startVisualIntakeSession`, `submitVisualChange`, `promoteMemoryItem`

**Subscriptions**: `intakeMessageStream`, `intakeStreamingChunk`, `intakeDraftUpdated`, `intakeMemoryUpdated`

## Roadmap

### Built

- [x] Chat-based intake with Claude streaming
- [x] Structured draft extraction with Zod validation
- [x] Visual intake (Chrome CDP + extension + screenshot)
- [x] Session persistence with workspace model
- [x] Project memory and rolling summaries
- [x] Runtime context bundle (replaces transcript replay)
- [x] MCP Gateway with tool registry
- [x] Search across all intake data
- [x] Dark mode + OpenCode-themed PRD panel
- [x] Draggable resize between panels

### Planned

- [ ] Elaboration phase (Stage 2 — user stories → technical specs)
- [ ] SDLC Pipeline Orchestrator (phase state machine, artifact handoff)
- [ ] Git repo analysis intake mode
- [ ] Redis caching for session state
- [ ] GCP Cloud Run deployment (Terraform/Pulumi)
- [ ] Tenant isolation and audit logging
- [ ] Semantic search with embeddings

## License

[MIT](LICENSE)
