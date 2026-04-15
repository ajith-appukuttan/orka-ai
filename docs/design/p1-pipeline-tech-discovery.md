# P1 Tech Discovery — Pipeline State, UI, Elaboration

**Status:** Discovery Complete  
**Scope:** 3 P1 tasks (orka-ka6, orka-phk, orka-ojt)

---

## 1. Core Problem

After approval, the pipeline goes dark. The workspace status stays `APPROVED` forever regardless of what happens next — classification, elaboration, build, PR. There are 9 specific gaps where state tracking breaks.

---

## 2. Current State Transitions

```
Workspace: ACTIVE ───────────────────────────► APPROVED ──► (stuck)
Session:   ACTIVE ───────────────────────────► APPROVED ──► (stuck)
                    ▲                              │
                    │ (re-approval)                 │
                    └──────────────────────────────-┘

Classification:  (fire-and-forget, no status change on workspace)
Build:           (fire-and-forget, updates build_runs only)
Elaboration:     (doesn't exist — dead end)
```

The pipeline has exactly **2 states**: ACTIVE and APPROVED. Everything after approval is invisible to the workspace/session status.

---

## 3. Proposed State Machine

### 3.1 Workspace Lifecycle

```
ACTIVE → APPROVED → CLASSIFYING → [routed]
                                      │
                    ┌─────────────────-┤
                    ▼                  ▼                  ▼
              ELABORATING        PLANNING            BUILDING
                    │                  │                  │
                    ▼                  ▼                  ▼
           (re-approve)         (re-approve)        BUILT ──► DEPLOYED
                                                      │
                                                   (has PR)
```

### 3.2 New Status Values

Replace the current enum:

```sql
-- Before
CHECK (status IN ('ACTIVE', 'REVIEWING', 'APPROVED', 'ARCHIVED'))

-- After
CHECK (status IN (
  'ACTIVE',         -- Intake in progress
  'APPROVED',       -- PRD approved, awaiting classification
  'CLASSIFYING',    -- Classifier running
  'ELABORATING',    -- Needs elaboration, copilot in elab mode
  'PLANNING',       -- Needs planning/decomposition
  'BUILDING',       -- Builder executing
  'BUILT',          -- Build complete (SUCCESS or PARTIAL)
  'FAILED',         -- Build or classification failed
  'ARCHIVED'        -- Soft-deleted
))
```

Drop `REVIEWING` — it was never used.

### 3.3 Who Drives Transitions

| Transition                | Trigger                            | Where                                |
| ------------------------- | ---------------------------------- | ------------------------------------ |
| ACTIVE → APPROVED         | User clicks Approve                | `approval.ts` resolver               |
| APPROVED → CLASSIFYING    | Classifier starts                  | `intakeReadinessClassifier.ts`       |
| CLASSIFYING → ELABORATING | Classification = NEEDS_ELABORATION | Classifier callback in `approval.ts` |
| CLASSIFYING → PLANNING    | Classification = NEEDS_PLANNING    | Same                                 |
| CLASSIFYING → BUILDING    | Classification = DIRECT_TO_BUILD   | Same                                 |
| CLASSIFYING → ACTIVE      | Classification = RETURN_TO_INTAKE  | Same (reopen for more intake)        |
| ELABORATING → APPROVED    | User re-approves after elaboration | `approval.ts`                        |
| PLANNING → APPROVED       | User re-approves after planning    | `approval.ts`                        |
| BUILDING → BUILT          | Build completes successfully       | `orchestrator.ts`                    |
| BUILDING → FAILED         | Build fails                        | `orchestrator.ts`                    |

**Implementation:** These are `UPDATE intake_workspaces SET status = $1` calls at the right points. No state machine library needed. Each transition is a single SQL statement.

---

## 4. Pipeline State Table

### 4.1 Do We Need a Separate Table?

**No.** The workspace already tracks status. What's missing is:

- The **current phase** (derived from status — not a separate concept)
- A **history** of transitions (for audit, not for routing)

Adding a `pipeline_states` table would duplicate what `intake_workspaces.status` already does. Instead:

1. Expand the workspace status enum (as above)
2. Add a `pipeline_history` table for audit:

```sql
CREATE TABLE pipeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES intake_workspaces(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  trigger VARCHAR(50) NOT NULL,  -- 'approval', 'classifier', 'builder', 'user'
  run_id VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This gives full traceability without a separate state machine.

### 4.2 Helper Function

```typescript
async function transitionWorkspace(
  workspaceId: string,
  toStatus: string,
  trigger: string,
  runId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const current = await query('SELECT status FROM intake_workspaces WHERE id = $1', [workspaceId]);
  const fromStatus = current.rows[0]?.status;

  await query('UPDATE intake_workspaces SET status = $1, updated_at = NOW() WHERE id = $2', [
    toStatus,
    workspaceId,
  ]);

  await query(
    `INSERT INTO pipeline_history (workspace_id, from_status, to_status, trigger, run_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [workspaceId, fromStatus, toStatus, trigger, runId, JSON.stringify(metadata || {})],
  );
}
```

---

## 5. Integration Points

### 5.1 Where to Add Status Transitions

| File                    | Current Code                         | Add                                                                                         |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `approval.ts:161-173`   | Sets workspace/session to `APPROVED` | Keep — this is correct                                                                      |
| `approval.ts:185-188`   | Fires classifier (no status change)  | Add `transitionWorkspace(wsId, 'CLASSIFYING', 'approval', runId)` before classifier call    |
| `approval.ts:242`       | Classifier posts chat message        | Add transition based on classification: `ELABORATING`, `PLANNING`, `BUILDING`, or `ACTIVE`  |
| `approval.ts:253-278`   | Auto-triggers build                  | Change `transitionWorkspace(wsId, 'BUILDING', 'classifier', runId)` before `executeBuild()` |
| `orchestrator.ts` (end) | Updates `build_runs` status          | Add `transitionWorkspace(wsId, 'BUILT', 'builder', runId)` on success, `FAILED` on failure  |

**Total: 5 transition points across 2 files.**

### 5.2 What the Sidebar Needs

Currently `GET_WORKSPACES` fetches `status`, `readinessScore`, and `latestClassification`. With expanded statuses, the sidebar can show:

| Status      | Badge            | Color             |
| ----------- | ---------------- | ----------------- |
| ACTIVE      | Readiness %      | blue              |
| APPROVED    | "Approved"       | gray              |
| CLASSIFYING | "Classifying..." | yellow (animated) |
| ELABORATING | "Elaboration"    | yellow            |
| PLANNING    | "Planning"       | blue              |
| BUILDING    | "Building..."    | teal (animated)   |
| BUILT       | "PR Ready"       | teal              |
| FAILED      | "Failed"         | red               |

The sidebar already reads `workspace.status` — it just needs the badge rendering updated. No new query fields needed.

---

## 6. Pipeline Progress UI

### 6.1 Where

A horizontal stepper at the top of the chat panel, below the readiness bar.

```
● Intake  ─── ○ Classify  ─── ○ Elaborate  ─── ○ Build  ─── ○ PR
  (done)       (current)        (skipped)       (pending)    (pending)
```

### 6.2 Phase Mapping from Workspace Status

| Status      | Intake  | Classify | Elaborate | Build   | PR      |
| ----------- | ------- | -------- | --------- | ------- | ------- |
| ACTIVE      | current | —        | —         | —       | —       |
| APPROVED    | done    | pending  | —         | —       | —       |
| CLASSIFYING | done    | current  | —         | —       | —       |
| ELABORATING | done    | done     | current   | —       | —       |
| PLANNING    | done    | done     | —         | current | —       |
| BUILDING    | done    | done     | skip/done | current | —       |
| BUILT       | done    | done     | skip/done | done    | current |
| FAILED      | done    | done     | skip/done | failed  | —       |

Skipped phases (from classifier routing) show as a dashed line.

### 6.3 Component

```typescript
interface PipelineStepperProps {
  workspaceStatus: string;
  classification?: string; // to know which phases were skipped
}
```

Simple component — no server state, just maps workspace status to step indicators. Lives in `intake-ui/src/components/pipeline/PipelineStepper.tsx`.

### 6.4 Placement

In `ChatPanel.tsx`, below the readiness bar:

```
┌────────────────────────────────────────┐
│ ● PRD READINESS ████████████████  83%  │  ← existing
│ ● Intake ── ● Classify ── ○ Build ──  │  ← new stepper
├────────────────────────────────────────┤
│ [chat messages]                        │
```

---

## 7. Elaboration Phase

### 7.1 What It Is

NOT a separate service. An alternate copilot mode that activates when the classifier says `NEEDS_ELABORATION`.

### 7.2 Trigger

In the classifier callback (`approval.ts`), when classification is `NEEDS_ELABORATION`:

```typescript
if (decision.classification === 'NEEDS_ELABORATION') {
  await transitionWorkspace(wsId, 'ELABORATING', 'classifier', runId);
  // The copilot will check workspace.status on next message
  // and load the elaboration persona
}
```

### 7.3 Copilot Persona Switch

In the chat pipeline (`intakeCopilot` agent), at the start of each turn:

```typescript
const workspace = await loadWorkspace(workspaceId);
const persona = workspace.status === 'ELABORATING' ? 'elaboration-copilot.md' : 'intake-copilot.md';
```

The elaboration copilot:

- Loads the **approved PRD** as context (not just the conversation)
- Loads the **classifier blocking questions** as the agenda
- Has a different system prompt focused on resolving ambiguity
- Tracks which blocking questions have been resolved
- When all are resolved, prompts the user to re-approve

### 7.4 Elaboration Prompt Design

```markdown
# Elaboration Copilot

You are the Technical Elaboration Specialist. The PRD has been approved
but the classifier identified blocking questions that must be resolved
before build.

## Your Agenda

[blocking questions loaded dynamically]

## Rules

1. Work through blocking questions one at a time
2. For each question, propose a concrete answer and ask the user to confirm
3. Update the draft with each resolution
4. When all questions are resolved, tell the user to re-approve
5. Do NOT re-ask intake questions — the PRD is approved, you're refining it
```

### 7.5 What Changes in the Draft

Elaboration writes new draft versions with `change_source = 'elaboration'`. This is already supported — the `intake_draft_versions` table has a `change_source` column.

### 7.6 Re-Approval Flow

User clicks "Re-Approve" → same `approveIntakeDraft` mutation → new run ID → new classification. If blocking questions are resolved, classifier should return `DIRECT_TO_BUILD` this time.

The re-approval path already works (`APPROVED` is an allowed source state).

---

## 8. What NOT to Build

| Idea                                 | Why Not                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Separate `pipeline_states` table     | Workspace status already serves this purpose. Duplicating it creates sync issues.                                                |
| State machine library (xstate, etc.) | 5 transition points across 2 files. A library is overhead for a linear pipeline.                                                 |
| Planning phase agent                 | The task planner in the builder already does this. A separate planning phase is redundant until the builder proves insufficient. |
| Phase contracts package              | One service, one consumer. Types go in the code that uses them.                                                                  |

---

## 9. Files Changed (Estimated)

### Backend (intake-api)

| File                                         | Change                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `migrations/016_expand_workspace_status.sql` | **New.** Expand CHECK, add `pipeline_history` table     |
| `services/pipelineTransition.ts`             | **New.** `transitionWorkspace()` helper function        |
| `resolvers/approval.ts`                      | Add 3 transition calls (classifying, routing, building) |
| `agents/builder/orchestrator.ts`             | Add 2 transition calls (built, failed)                  |
| `agents/intakeCopilot.ts`                    | Check workspace status, switch persona                  |
| `services/claude.ts`                         | Add prompt loader for `elaboration-copilot.md`          |
| `prompts/elaboration-copilot.md`             | **New.** Elaboration persona prompt                     |

### Frontend (intake-ui)

| File                                      | Change                                              |
| ----------------------------------------- | --------------------------------------------------- |
| `components/pipeline/PipelineStepper.tsx` | **New.** Horizontal step indicator                  |
| `components/chat/ChatPanel.tsx`           | Add PipelineStepper below readiness bar             |
| `components/layout/Sidebar.tsx`           | Update badge rendering for new statuses             |
| `graphql/queries.ts`                      | GET_WORKSPACES already fetches `status` — no change |

**Total: ~11 files, 4 new files, 7 modified.**

---

## 10. Execution Order

```
Step 1: Migration + transition helper        (backend foundation)
Step 2: Wire transitions into approval/build  (pipeline works)
Step 3: Elaboration persona + copilot switch  (dead ends unblocked)
Step 4: Pipeline stepper UI + sidebar badges  (users can see it)
```

Steps 1-2 can be tested with existing UI (status changes visible in DB).  
Steps 3-4 are user-facing and can ship independently.

---

## 11. Risks

| Risk                                               | Probability | Mitigation                                                                                                         |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Expanding workspace status breaks existing queries | Low         | Only 2 files query `workspace.status`: sidebar badge + approval resolver. Both handle unknown statuses gracefully. |
| Elaboration persona gives bad advice               | Medium      | Load the approved PRD + blocking questions as hard context. Persona can't deviate from the agenda.                 |
| Re-approval loop never converges                   | Low         | Cap at 3 re-approvals per run. After 3, force DIRECT_TO_BUILD or manual override.                                  |
| Pipeline stepper overcomplicates the UI            | Low         | It's a single-row horizontal indicator. If it's noisy, hide it behind a click.                                     |
