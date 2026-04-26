# Portable Two-Agent Coordination Protocol

Use this file to bootstrap collaboration between two coding agents working in the same local git repository from separate terminals.

Recommended path in the target repo:

```text
docs/coordination/PROTOCOL.md
```

Then create these companion files:

```text
docs/coordination/
  PROTOCOL.md
  STATUS.md
  TASKS.md
  DECISIONS.md
  HANDOFFS.md
  PR_REVIEW_QUEUE.md
  DESIGN_QUEUE.md
```

## Core Model

The human is the crank-turner. Agents do not assume the other agent is polling files in real time.

When the human says:

```text
It is your turn. Check docs/coordination and take the next appropriate action.
```

the agent should:

1. Read the coordination files.
2. Check whether their name appears in `DESIGN_QUEUE.md`, `PR_REVIEW_QUEUE.md`, `HANDOFFS.md`, or `STATUS.md`.
3. Take the highest-priority waiting action assigned to them.
4. Write their response, review, or handoff back into the coordination files.
5. Set the next requested responder where applicable.

## Coordination Files

### `PROTOCOL.md`

The rules both agents follow.

### `STATUS.md`

Current shared state.

Template:

```md
# Coordination Status

Last updated: YYYY-MM-DD by AGENT

## Release Gate

- Current release status: not_started / in_progress / blocked / ready
- Blocking dependencies:
  - ...

## Active Work

| Agent | Branch | Task | Status | Files Being Edited |
| --- | --- | --- | --- | --- |
| Codex | none | idle | idle | none |
| Claude | none | idle | idle | none |

## Blockers

- None

## Waiting For Review

- None

## Latest Handoff

- None
```

Rules:

- Each agent owns only their own row in the Active Work table.
- If you need to edit a file listed in the other agent's row, stop and coordinate first.
- Global sections may be edited by either agent, but keep them concise.

### `TASKS.md`

Thin tracker only. Do not duplicate the full plan if it exists elsewhere.

Template:

```md
# Coordination Task Tracker

Detailed scope lives in: LINK_TO_PLAN_OR_ISSUE

| Task | Owner | Branch | Status | Notes |
| --- | --- | --- | --- | --- |
| First task | Codex/Claude | `feature/task-slug` | ready_to_start | ... |
```

### `DECISIONS.md`

Durable decisions and rationale.

Template:

```md
# Coordination Decisions

## YYYY-MM-DD - Decision Title

Decision:
...

Rationale:
...

Implications:
...
```

### `HANDOFFS.md`

Chronological agent notes.

Supported handoff types:

- `start`
- `finish`
- `ready_for_review`
- `blocked`
- `context_lost`
- `review_complete`
- `decision_needed`
- `contract_change`

Template:

```md
# Coordination Handoffs

## YYYY-MM-DD HH:mm TZ - AGENT - Short Title

Type: ready_for_review
Branch: branch-name
Status: waiting_review
Contract change: false

Files changed:
- ...

Summary:
- ...

Tests run:
- ...

Needs other agent:
- ...

Known risks:
- ...

Next:
- ...
```

Context-lost template:

```md
## YYYY-MM-DD HH:mm TZ - AGENT - Context Lost

Type: context_lost
Branch: branch-name
Status: partial
Contract change: false

Last completed:
- ...

Remaining:
- ...

Files with uncommitted changes:
- ...

Notes:
- ...
```

### `PR_REVIEW_QUEUE.md`

Code review queue.

Template:

```md
# PR Review Queue

## Ready For Review

### PR or Branch Title

Owner: Codex/Claude
Requested reviewer: Codex/Claude
Status: waiting_review
Branch: `branch-name`
PR: #N or URL, if available

Review focus:
- ...

Tests run:
- ...

Known risks:
- ...

Review result:
- Pending

Next responder:
- Codex/Claude/Human
```

Review outcomes:

- `approved`
- `approved_with_notes`
- `changes_requested`
- `blocked`
- `needs_human`

### `DESIGN_QUEUE.md`

Design, brainstorm, and spec discussions before code.

Template:

```md
# Design Queue

Use this file for design, brainstorming, and spec discussions before code changes.

## Active Design Items

### DQ-001 - Design Title

Status: needs_codex / needs_claude / needs_human / accepted / rejected / implemented
Owner: Codex/Claude
Requested responder: Codex/Claude/Human
Next responder: Codex/Claude/Human/None
Priority: low / normal / high
Related files:
- ...

Question:
...

Proposal:
- ...

Requested response:
- Accept / accept with changes / reject
- Missing fields or concerns
- Recommendation

Responses:

#### AGENT - YYYY-MM-DD

...

## Completed Design Items

- None
```

## Start Of Session Checklist

Before starting a new task, branch, review, design response, or resumed session, read:

1. `docs/coordination/PROTOCOL.md`
2. `docs/coordination/STATUS.md`
3. `docs/coordination/HANDOFFS.md`
4. `docs/coordination/PR_REVIEW_QUEUE.md`
5. `docs/coordination/DESIGN_QUEUE.md`
6. The project plan/spec/issue for the current task

Then:

- Confirm no active branch/file ownership conflict.
- Update your own row in `STATUS.md`.
- Add a handoff if taking over from a blocked or context-lost state.

## End Of Session Checklist

Before stopping, update:

1. `docs/coordination/STATUS.md`
2. `docs/coordination/HANDOFFS.md`

If code is ready for review, update:

3. `docs/coordination/PR_REVIEW_QUEUE.md`

If design input is needed, update:

4. `docs/coordination/DESIGN_QUEUE.md`

## Design Workflow

Use `DESIGN_QUEUE.md` for:

- Brainstorming approaches.
- Specifying implementation plans.
- Reviewing contracts or state machines.
- Asking for tradeoff analysis.
- Resolving cross-track dependencies.

Process:

1. Initiating agent adds or updates a design item.
2. Human tells requested responder it is their turn.
3. Responder appends their response.
4. If more discussion is needed, responder sets `Next responder`.
5. When aligned, final responder records the result in `DECISIONS.md` or an ADR.
6. Mark design item `accepted`, `rejected`, `superseded`, or `implemented`.

## Code / PR Workflow

Use `PR_REVIEW_QUEUE.md` and `HANDOFFS.md`.

Process:

1. Implementer creates a branch.
2. Implementer updates their `STATUS.md` row.
3. When ready, implementer adds a `ready_for_review` handoff and review queue entry.
4. Human tells requested reviewer it is their turn.
5. Reviewer reads the queue, reviews branch/PR, and records findings.
6. Reviewer marks queue item with outcome.
7. Implementer fixes or merges based on review.

## Branch Naming

Choose a prefix that matches the project. Recommended:

```text
feature/{task-slug}
fix/{task-slug}
design/{topic-slug}
coordination/{topic-slug}
```

If there are parallel tracks:

```text
t1/{task-slug}
t2/{task-slug}
```

## Branch Ownership

- One active owner per branch.
- Separate branches for separate tasks.
- Do not rewrite, revert, or force-push another agent's work without explicit handoff or human approval.
- If reviewing another agent's branch, leave findings first. Patch only when explicitly asked.
- If a branch must be handed off, record it in `HANDOFFS.md`.

## Shared Contract Changes

Set `Contract change: true` in a handoff when changing shared interfaces, schemas, message formats, public APIs, generated artifacts, or cross-agent assumptions.

When `Contract change: true`:

- Explain the old contract.
- Explain the new contract.
- List affected files.
- Set `Next responder` to the other agent for acknowledgement.

## Coordination-Only Changes

Coordination-only file updates may go directly to `main` without a PR when they do not change product code, release behavior, infrastructure behavior, or security posture.

Examples:

- Updating `STATUS.md`.
- Adding a handoff.
- Marking a design item accepted.
- Updating review queue status.

Use a branch and review for coordination changes that materially alter product behavior, infrastructure, security, task ownership, or the release gate.

## Human Escalation

Ask the human before:

- Changing release scope.
- Changing production architecture.
- Editing or reverting another agent's branch without handoff.
- Taking destructive git actions.
- Making security-sensitive changes without review.
- Resolving a design disagreement by assumption.

