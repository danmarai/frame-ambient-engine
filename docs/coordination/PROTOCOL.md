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

## Start Of Session Checklist

Before starting work, read:

1. `docs/coordination/PROTOCOL.md`
2. `docs/coordination/STATUS.md`
3. `docs/coordination/HANDOFFS.md`
4. `docs/coordination/PR_REVIEW_QUEUE.md`
5. `docs/HARDENING_PLAN.md`

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

If the session is interrupted or context is lost before a clean handoff, add a `context_lost` handoff as soon as possible in the next session.

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

