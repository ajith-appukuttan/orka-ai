Intake MVP: 1-Page Implementation Blueprint
Objective

Build a Claude-powered Intake Copilot that lets users describe an application idea in a fast chat experience, uses MCP tools selectively for context/validation, and produces a structured, reviewable intake artifact that a human can approve.

User Flow
User starts an Intake session.
User chats with Claude about the app idea.
Claude asks clarifying questions and optionally calls MCP tools.
System updates a structured Intake Draft after each turn.
When readiness is high, UI shows Ready for Review.
User reviews, edits if needed, and clicks Approve Intake.
System stores versioned Intake Artifact and marks it APPROVED.
Service Boundaries
1. Intake UI

Tech: Next.js
Responsibilities:

Chat interface
Streaming assistant responses
Draft side panel
Readiness indicator
Review and approval screen
2. Intake API

Tech: Node.js + GraphQL
Responsibilities:

Session lifecycle
Claude orchestration
Prompt routing
Draft extraction
Persistence coordination
Approval action
3. MCP Gateway

Tech: Node.js service
Responsibilities:

Tool registry
Tool permission checks
MCP server invocation
Timeout/retry policy
Response normalization
Audit logs for tool usage
4. Data Layer

Tech: Cloud SQL + Redis + GCS
Responsibilities:

Session metadata in Postgres
Hot session state and cache in Redis
Draft snapshots/artifacts/logs in GCS or Postgres JSONB
Core Runtime Flow
Chat Turn Pipeline
sendIntakeMessage(sessionId, message)
Load recent turns + session summary + current draft
Run Tool Planner
If needed, invoke MCP tools through MCP Gateway
Stream Claude response to UI
In parallel, run Draft Extractor
Save updated draft + readiness score
Publish subscription updates to UI
Approval Pipeline
User clicks approveIntakeDraft
Persist immutable artifact version
Mark session APPROVED
Create project intake record
Emit event: INTAKE_APPROVED
Internal Agent Roles
Intake Copilot

Conversational agent for user-facing responses.

Tool Planner

Determines whether tools are needed for the current turn.

Draft Extractor

Updates machine-readable intake draft and readiness score after each turn.

Draft Schema
{
  "title": "",
  "productIdea": "",
  "businessGoal": "",
  "targetUsers": [],
  "problemStatement": "",
  "inScope": [],
  "outOfScope": [],
  "constraints": [],
  "integrations": [],
  "preferredStack": [],
  "assumptions": [],
  "acceptanceCriteria": [],
  "unresolvedQuestions": [],
  "readinessScore": 0.0,
  "readyForReview": false
}
GraphQL API
Mutations
startIntakeSession(projectId, seedPrompt)
sendIntakeMessage(sessionId, message)
editIntakeDraft(sessionId, patch)
approveIntakeDraft(sessionId)
archiveIntakeSession(sessionId)
Queries
intakeSession(sessionId)
intakeMessages(sessionId)
intakeDraft(sessionId)
Subscriptions
intakeMessageStream(sessionId)
intakeDraftUpdated(sessionId)
intakeReadinessUpdated(sessionId)
MCP Tool Registry Contract

Each tool must declare:

interface RegisteredTool {
  id: string;
  name: string;
  category: "CONTEXT" | "VALIDATION";
  allowedStages: string[];
  timeoutMs: number;
  requiresConfirmation: boolean;
  tenantScopes: string[];
}
MVP Tool Set
Template discovery
Standards lookup
Integration discovery

No action/write tools in MVP.

Prompt Files
intake-copilot.md
conversational
asks 1–2 clarifying questions
keeps momentum high
tool-planner.md
decides whether tools are worth the latency
max 3 read-only tools
draft-extractor.md
updates structured JSON draft
computes readiness score
preserves confirmed info
Data Model
Tables / Collections
intake_sessions
intake_messages
intake_drafts
tool_call_logs
approved_intake_artifacts
Key fields
tenantId
workspaceId
userId
sessionId
version
status
readinessScore
timestamps
GCP Deployment
Frontend: Cloud Run
Intake API: Cloud Run
MCP Gateway: Cloud Run
Postgres: Cloud SQL
Redis: Memorystore
Artifacts: GCS
Secrets: Secret Manager
Logs: Cloud Logging
Milestone Backlog
Milestone 1: Core Chat
start session
send message
stream Claude response
persist chat history
Milestone 2: Draft Extraction
structured draft schema
draft extractor
draft side panel
readiness score
Milestone 3: MCP Integration
MCP Gateway
tool registry
2–3 read-only tools
tool planner
Milestone 4: Approval
review screen
manual draft edit
approve flow
artifact versioning
Milestone 5: Hardening
latency tuning
caching
audit logs
tenant isolation
error handling
MVP Success Criteria
User can complete a full Intake conversation in chat
Draft updates correctly after each turn
MCP tools improve specificity without slowing UX too much
Approved intake artifact is useful and reusable
Median response time stays within acceptable conversational bounds

If you want, I can turn this next into a system architecture diagram + sequence flow or a starter repo structure with folders and interfaces.