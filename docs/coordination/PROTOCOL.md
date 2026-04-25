# Agent Collaboration Protocol

Date bootstrapped: 2026-04-25

## Purpose

This protocol coordinates work between:

- Codex terminal agent
- Claude Code terminal agent

Both agents share the same repo and local filesystem. The source of truth for coordination is this `docs/coordination/` folder.

Discord is not used for now. A human relay should handle urgent blockers that arise while the other agent is mid-session.

## Coordination Files

- `PROTOCOL.md`: collaboration rules.
- `STATUS.md`: current shared state.
- `TASKS.md`: thin task tracker that references `docs/HARDENING_PLAN.md`.
- `DECISIONS.md`: durable architecture and workflow decisions.
- `HANDOFFS.md`: chronological handoffs, blockers, context-loss notes, and review requests.
- `PR_REVIEW_QUEUE.md`: branches/PRs ready for cross-agent review.
- `DESIGN_QUEUE.md`: design, brainstorming, and spec discussions that need agent input before code.

## Human-Turned Async Model

The human is the crank-turner. Agents do not assume the other agent is polling files in real time.

When the human says "your turn" or "check coordination", the agent should:

1. Read the start-of-session files listed below.
2. Check whether their name appears in `DESIGN_QUEUE.md`, `PR_REVIEW_QUEUE.md`, `HANDOFFS.md`, or `STATUS.md`.
3. Take the highest-priority waiting action assigned to them.
4. Write their response, review, or handoff back into the coordination files.
5. Set the next requested responder where applicable.

The human should not need to summarize context. A sufficient prompt should be:

```text
It is your turn. Check docs/coordination and take the next appropriate action.
```

## Start Of Session Checklist

Before starting work, read:

1. `docs/coordination/PROTOCOL.md`
2. `docs/coordination/STATUS.md`
3. `docs/coordination/HANDOFFS.md`
4. `docs/coordination/PR_REVIEW_QUEUE.md`
5. `docs/coordination/DESIGN_QUEUE.md`
6. `docs/HARDENING_PLAN.md`

Then:

- Confirm no active branch/file ownership conflict.
- Update your own row in `STATUS.md` if starting or resuming work.
- Add a `HANDOFFS.md` entry if taking over from a prior context-lost or blocked state.

## During Work

- Work on one owned branch at a time.
- Use the branch naming convention in this file.
- Keep `TASKS.md` thin; do not duplicate `docs/HARDENING_PLAN.md`.
- Update `STATUS.md` when the branch, status, or files being edited change.
- Each agent owns only their own row in the `STATUS.md` active work table.
- If you need to edit a file listed in the other agent's "Files Being Edited" column, stop and coordinate first.
- Add a `HANDOFFS.md` entry for blockers, cross-track dependencies, or shared upload contract changes.
- Use separate commits for code changes and coordination-file updates where practical.

## End Of Session Checklist

Before stopping, update:

1. `docs/coordination/STATUS.md`
2. `docs/coordination/HANDOFFS.md`

If a branch or PR is ready for review, also update:

3. `docs/coordination/PR_REVIEW_QUEUE.md`

If design input, spec review, or brainstorming is needed, also update:

4. `docs/coordination/DESIGN_QUEUE.md`

If the session is interrupted or context is lost before a clean handoff, add a `context_lost` handoff as soon as possible in the next session.

## Design / Brainstorm / Spec Workflow

Use `DESIGN_QUEUE.md` for technical design work before code changes.

Use this workflow for:

- Brainstorming approaches.
- Specifying an implementation plan.
- Reviewing a proposed contract or state machine.
- Asking for tradeoff analysis.
- Resolving cross-track design dependencies.

Process:

1. The initiating agent adds or updates a design item in `DESIGN_QUEUE.md`.
2. The item includes status, owner, requested responder, question, context, options, recommendation, and response format.
3. The initiating agent updates `STATUS.md` or `HANDOFFS.md` if the design question blocks active work.
4. The human tells the requested responder: "It is your turn. Check docs/coordination."
5. The responder appends their response under the item.
6. If more discussion is needed, the responder sets `Next responder`.
7. When aligned, the final responder records the decision in `DECISIONS.md` or creates an ADR if it is architectural.
8. The design item is marked `accepted`, `rejected`, `superseded`, or `implemented`.

Design queue status values:

- `open`
- `needs_codex`
- `needs_claude`
- `needs_human`
- `accepted`
- `rejected`
- `superseded`
- `implemented`

Design items should be concise. Long design docs may live under `docs/` or `docs/adr/`, with `DESIGN_QUEUE.md` linking to them.

## Code / PR Workflow

Use `PR_REVIEW_QUEUE.md` and `HANDOFFS.md` for implementation handoffs.

Process:

1. Implementing agent creates or updates a branch using the branch naming convention.
2. Implementing agent updates their `STATUS.md` row with branch, task, status, and files being edited.
3. When ready, implementing agent adds:
   - A `ready_for_review` entry in `HANDOFFS.md`.
   - A waiting review entry in `PR_REVIEW_QUEUE.md`.
4. The human tells the requested reviewer: "It is your turn. Check docs/coordination."
5. Reviewer reads the queue, checks out/reviews the branch or PR, and records findings.
6. Reviewer updates `HANDOFFS.md` with `review_complete`.
7. If changes are required, reviewer marks the queue item `changes_requested` and sets next responder to the implementer.
8. If accepted, reviewer marks the queue item `approved` and updates task status where appropriate.

Review outcomes:

- `approved`
- `approved_with_notes`
- `changes_requested`
- `blocked`
- `needs_human`

Review findings should lead with correctness, robustness, security, and missing tests. Summaries come after findings.

## Branch Naming

- Track 1 branches: `hardening/t1-{task-slug}`
- Track 2 branches: `hardening/t2-{task-slug}`
- Coordination-only branches, if needed: `coordination/{task-slug}`

Examples:

- `hardening/t1-android-monorepo-move`
- `hardening/t1-upload-state-machine`
- `hardening/t2-endpoint-lockdown`
- `hardening/t2-pairing-sqlite`

## Branch Ownership

- One active owner per branch.
- Separate branches for separate tracks.
- Do not rewrite, revert, or force-push another agent's work without explicit handoff or human approval.
- If reviewing another agent's branch, leave findings first. Patch only when explicitly asked.
- If a branch must be handed off, record the handoff in `HANDOFFS.md`.

## Status Ownership

`STATUS.md` is shared and may conflict. To reduce conflicts:

- Each agent edits only their own row in the Active Work table.
- Either agent may update global sections only when needed: Release Gate, Blockers, Waiting For Review, Latest Handoff.
- Prefer concise updates.
- If simultaneous edits conflict, preserve both agents' rows and latest handoff references.

## Handoff Types

Use one of these values in handoff entries:

- `start`
- `finish`
- `ready_for_review`
- `blocked`
- `context_lost`
- `review_complete`
- `decision_needed`
- `contract_change`

Set `Contract change: true` when a handoff changes shared upload phases, error names, result schemas, WebView message contracts, or cloud/phone protocol assumptions.

## Context Lost Format

Use this when a session was compacted, interrupted, or resumed with partial state:

```md
## 2026-04-25 16:00 PT - Claude - Context Compaction

Type: context_lost
Branch: hardening/t1-upload-state-machine
Status: partial
Contract change: false

Last completed:
- TCP promise propagation

Remaining:
- Mutex
- Circuit breaker integration

Files with uncommitted changes:
- apps/android/App.tsx

Notes:
- ...
```

## Shared Contract Changes

The upload status/error contract in `docs/HARDENING_PLAN.md` is shared by both tracks.

If either agent adds or changes any of these, the handoff must set `Contract change: true`:

- Upload phase names.
- Upload error names.
- `UploadResult` fields.
- Circuit breaker states.
- WebView bridge message shape.
- Phone/cloud WebSocket message shape.
- Pairing/session fields required by upload flow.

## Human Escalation

Ask the human before:

- Changing the production stack decision.
- Changing the release gate.
- Re-enabling arbitrary external image URLs.
- Changing crash cooldown policy.
- Editing or reverting another agent's branch without explicit handoff.
- Taking destructive git actions.
