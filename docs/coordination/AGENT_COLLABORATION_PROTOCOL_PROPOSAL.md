# Agent Collaboration Protocol Proposal

Date: 2026-04-25

## Purpose

This document proposes a lightweight coordination protocol for two coding agents working in the same repo:

- Codex terminal agent
- Claude Code terminal agent

Both agents have access to the same local file structure and git repository. The goal is to let the agents work independently while leaving durable notes for technical design, task starts, handoffs, PR review requests, blockers, and fixes.

The protocol should be boring, explicit, and git-friendly. The authoritative coordination record should live in repo files, not chat history.

## Recommendation

Use repo-based coordination files as the source of truth, with optional Discord webhook notifications later.

Discord can be useful for human-visible alerts, but it should not be the primary coordination layer because:

- Repo files are diffable and branch-aware.
- Repo files travel with PRs and commits.
- Repo files are easier for both agents to read before starting work.
- Repo files do not depend on network access or webhook permissions.
- Coordination notes can be reviewed alongside code changes.

Discord notifications can mirror important state changes, such as "PR ready for review" or "P0 blocker found", but the full context should remain in the repo.

## Proposed Files

Create this folder:

```text
docs/coordination/
```

With these files:

```text
docs/coordination/
  PROTOCOL.md
  STATUS.md
  TASKS.md
  DECISIONS.md
  HANDOFFS.md
  PR_REVIEW_QUEUE.md
```

### `PROTOCOL.md`

The rules both agents agree to follow.

This should include:

- Start-of-session checklist.
- End-of-session checklist.
- Branch ownership rules.
- Handoff format.
- Review request format.
- When to ask the human for a decision.
- What counts as release-blocking.

### `STATUS.md`

Current shared state.

This should be short and updated often:

- Current release gate.
- Active branches.
- Current owner per track.
- Blockers.
- Latest handoff pointer.
- PRs waiting for review.

### `TASKS.md`

Task split and acceptance criteria.

This should reference `docs/HARDENING_PLAN.md` and track:

- Track 1 protocol/upload work.
- Track 2 security/persistence work.
- Release-blocking dependencies.
- Definition of done.

### `DECISIONS.md`

Durable architecture and coordination decisions.

Use it for decisions such as:

- Express cloud is production.
- `apps/web` is legacy.
- Phone is production upload bridge.
- Cloud-side TV upload is LAN/self-hosted only.
- Pairing-code bootstrap is the Tizen auth model.
- Arbitrary external image URLs are not supported.
- 30-second crash cooldown.

### `HANDOFFS.md`

Chronological work notes from one agent to the other.

Use it for:

- Start notes.
- Finish notes.
- Blockers.
- Review requests.
- Design questions.
- "I changed this contract, here is what you need to know."

### `PR_REVIEW_QUEUE.md`

Branches or PRs ready for another agent to review.

Use it for:

- PR number or branch name.
- Owner.
- Requested reviewer.
- Review focus.
- Tests run.
- Known risk.
- Status.

## Required Agent Workflow

### Start of Session

Before doing work, an agent should read:

```text
docs/coordination/PROTOCOL.md
docs/coordination/STATUS.md
docs/coordination/HANDOFFS.md
docs/coordination/PR_REVIEW_QUEUE.md
docs/HARDENING_PLAN.md
```

Then the agent should update `STATUS.md` if it is starting a task or taking ownership of a branch.

### During Work

Agents should:

- Work on one owned branch at a time.
- Avoid editing another agent's branch unless explicitly handed off.
- Avoid changing coordination files in noisy ways.
- Add a handoff note when they discover a cross-track dependency.
- Add a decision note when a technical decision is made.
- Keep implementation changes and coordination changes clear in commits.

### End of Session

Before stopping, an agent should update:

```text
docs/coordination/STATUS.md
docs/coordination/HANDOFFS.md
```

If a branch or PR is ready for review, also update:

```text
docs/coordination/PR_REVIEW_QUEUE.md
```

## Branch Ownership Rules

- One active owner per branch.
- Separate branches for separate tracks.
- Do not rewrite or revert another agent's changes without explicit handoff or human approval.
- If reviewing another agent's branch, leave findings first. Patch only when explicitly asked.
- If a branch must be handed off, record the handoff in `HANDOFFS.md`.
- If two tasks touch the same files, agents should coordinate in `STATUS.md` before editing.

## Suggested Status Format

```md
# Coordination Status

Last updated: 2026-04-25 14:30 PT

## Release Gate

- Track 1 protocol hardening: in progress
- Track 2 security/persistence: not started
- Release status: blocked until Track 1 and Track 2 are both complete

## Active Work

| Agent  | Branch                          | Task                                 | Status      |
| ------ | ------------------------------- | ------------------------------------ | ----------- |
| Claude | hardening/android-monorepo-move | Move Android app into monorepo       | in_progress |
| Codex  | none                            | Waiting for canonical Android source | idle        |

## Blockers

- Need real Android app moved into `apps/android/` before protocol review.

## Waiting For Review

- None

## Latest Handoff

- See `HANDOFFS.md` entry: 2026-04-25 14:30 PT - Claude - Android monorepo move started.
```

## Suggested Handoff Format

```md
## 2026-04-25 14:30 PT - Claude - Android Monorepo Move

Branch: hardening/android-monorepo-move
Status: ready_for_review

Files changed:

- apps/android/App.tsx
- apps/android/package.json
- apps/android/app.json
- pnpm-workspace.yaml
- README.md

Summary:

- Moved real Android app from `/tmp/frame-art-v2` into `apps/android`.
- No protocol behavior changes intended.
- Updated workspace and build docs.

Tests run:

- pnpm install
- pnpm --filter apps/android typecheck

Needs Codex review:

- Confirm this is a pure move with no behavior changes.
- Confirm ignored build artifacts are not included.
- Confirm docs point to canonical source.

Known risks:

- Expo native build was not run locally.
```

## Suggested PR Review Queue Format

```md
# PR Review Queue

## Ready For Review

### PR #42 - Android Monorepo Move

Owner: Claude
Requested reviewer: Codex
Status: waiting_review
Branch: hardening/android-monorepo-move

Review focus:

- Pure move only.
- No protocol behavior changes.
- Workspace/build docs correct.
- `/tmp/frame-art-v2` no longer needed after merge.

Tests run:

- pnpm install
- pnpm --filter apps/android typecheck

Known risks:

- Expo native build not verified.
```

## Suggested Decision Format

```md
## 2026-04-25 - Production Upload Bridge

Decision:
Phone is the production upload bridge. Cloud-side direct TV upload remains only for LAN/self-hosted deployments.

Rationale:
Samsung Frame TVs accept uploads only over local WebSocket + TCP. The hosted cloud service cannot reach TVs behind NAT.

Implications:

- Production upload reliability work belongs primarily in the Android app.
- Cloud direct upload routes must be disabled, gated, or clearly scoped to LAN/self-hosted mode.
- Endpoint auth still matters because cloud routes can trigger local-network behavior in self-hosted mode.
```

## Discord Option

Discord webhook integration can be added later as a notification mirror.

Recommended webhook events:

- Branch started.
- PR ready for review.
- Review completed.
- P0 blocker found.
- Release gate changed.

Example Discord message:

```text
[Frame Art] Claude marked PR #42 ready for Codex review.
Focus: Android monorepo move only.
See docs/coordination/PR_REVIEW_QUEUE.md
```

Important: Discord should point back to repo files. It should not contain the only copy of technical context.

## Initial Protocol Bootstrapping Plan

If this proposal is accepted:

1. Create `docs/coordination/PROTOCOL.md`.
2. Create initial `STATUS.md`, `TASKS.md`, `DECISIONS.md`, `HANDOFFS.md`, and `PR_REVIEW_QUEUE.md`.
3. Add the accepted coordination rules to both agents' startup prompt.
4. Start with PR 1: Android app move into `apps/android/`.
5. Require every implementation PR to update `HANDOFFS.md` and `PR_REVIEW_QUEUE.md` when review is requested.

## Requested Feedback From Engineering Team

Please leave feedback below this line.

When responding, use this structure:

```md
## Engineering Team Feedback - 2026-04-25

Decision:

- Accept as written / Accept with changes / Reject and propose alternative

Requested changes:

- ...

Concerns:

- ...

Preferred file names or folder location:

- ...

Discord/webhook preference:

- No Discord for now / Add notification webhook now / Revisit later

Any constraints from Claude Code workflow:

- ...

Ready to bootstrap protocol files:

- Yes / No
```

---

## Engineering Team Feedback — 2026-04-25 (Claude Code)

**Decision:** Accept with changes

**Requested changes:**

1. **Add "files being edited" to STATUS.md active work table.** This is the most likely source of merge conflicts. If I'm editing `App.tsx` and `middleware.ts`, Codex should see that before touching either file. Proposed column addition:

   ```
   | Agent | Branch | Task | Status | Files Being Edited |
   ```

2. **TASKS.md should reference HARDENING_PLAN.md, not duplicate it.** The plan already has task descriptions, acceptance criteria, and the shared upload contract. TASKS.md should be a thin status tracker (task ID, owner, status, branch) that points to the plan for details. Otherwise we'll have two sources of truth that drift.

3. **Add a "context lost" handoff type.** Claude Code sessions get compacted or interrupted when context fills up. When this happens, I lose in-flight state. A handoff note like "session interrupted, was mid-way through Task 1, branch has partial changes, here's what's done and what's left" helps me (or Codex) pick up cleanly. Proposed format:

   ```md
   ## 2026-04-25 16:00 PT — Claude — Context Compaction

   Type: context_lost
   Branch: hardening/upload-state-machine
   Last completed: TCP promise propagation
   Remaining: mutex, circuit breaker integration
   Files with uncommitted changes: apps/android/App.tsx
   ```

4. **Agree on branch naming convention.** Proposal:
   - Track 1: `hardening/t1-{task-slug}` (e.g., `hardening/t1-android-monorepo-move`)
   - Track 2: `hardening/t2-{task-slug}` (e.g., `hardening/t2-endpoint-lockdown`)
   - This makes it obvious which track owns which branch in `git branch` output.

5. **Add a "shared contract changes" section to HANDOFFS.md.** The upload status/error contract in HARDENING_PLAN.md is shared. If either agent needs to add a phase or error name, the handoff note should flag it explicitly so the other agent updates their code. Proposed tag: `contract_change: true`.

**Concerns:**

1. **I cannot poll files.** I read coordination files when I start a session or when told to check them. If Codex writes a blocker to STATUS.md while I'm mid-session, I won't see it until my next read. This is fine as long as the human can relay urgent blockers. File-based coordination is still the right approach — just noting the latency.

2. **Merge conflicts on coordination files.** Both agents will update STATUS.md, HANDOFFS.md, and PR_REVIEW_QUEUE.md. These should be append-only where possible (HANDOFFS.md, PR_REVIEW_QUEUE.md) and small/structured where not (STATUS.md). The current formats handle this well. Just flagging that simultaneous edits to STATUS.md could conflict — we should agree that each agent owns their row in the active work table and only edits their own.

3. **Commit hygiene for coordination vs. code changes.** The proposal says "keep implementation changes and coordination changes clear in commits" — I agree and will use separate commits: one for code, one for coordination file updates. This makes review cleaner.

**Preferred file names or folder location:**

`docs/coordination/` is good. No changes. The six files proposed are the right set.

**Discord/webhook preference:**

No Discord for now. File-based coordination is sufficient for two agents with a human relay. Revisit if we add a third agent or need faster interrupt signaling.

**Any constraints from Claude Code workflow:**

1. **Session boundaries are not predictable.** Claude Code sessions can end due to context limits, user switching tasks, or network interruption. The start/end-of-session checklists are important but I may not always get to run the end-of-session checklist cleanly. The "context lost" handoff type (requested change #3) handles this.

2. **I work in foreground with the user.** Unlike Codex which can run background tasks, my work is conversational. The user sees everything I do. This means my coordination file updates happen inline with my work, not as background jobs. This is fine — just a workflow difference to note.

3. **I can create branches and PRs.** I have full git access. The branch ownership model works. I'll create branches, push, and can use `gh pr create` for PRs.

4. **File reads are cheap, writes are visible.** Every file I write gets shown to the user for approval. This is actually good for coordination — the user sees all STATUS.md and HANDOFFS.md updates in real time.

**Ready to bootstrap protocol files:** Yes. I can start working as soon as the protocol files are created and the Android monorepo move branch is the first task.
