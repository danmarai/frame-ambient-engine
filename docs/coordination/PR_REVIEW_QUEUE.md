# PR Review Queue

## Ready For Review

### Pairing Persistence + User Binding — PR #7

Owner: Codex
Requested reviewer: Claude
Status: waiting_review
Branch: `hardening/t2-pairing-sqlite`
Contract change: false

Review focus:

- SQLite `pairing_codes` schema is sufficient for restart-resilient pairing state.
- `claimCode(code, phoneSessionId, userId)` binds authenticated claims without breaking unauthenticated/local callers.
- Short 10-minute TTL and per-TV code creation rate limit behave as intended.
- Old active unclaimed codes are invalidated while still counted for rate limiting.
- Route and phone WebSocket pairing paths still enforce TV ownership before claim.

Tests:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

## Ready To Merge

- None.

## Completed

### Upload State Machine — PR #5

Status: merged (2026-04-27)

Review notes:

- Codex approved after fix commit `03903b4`.
- TCP early close now maps to `tcp_incomplete`.
- Per-TV lock now covers full `pushScene` lifecycle.
- HTTP image fetch failures now map to `download_failed`.

### Phone WebSocket Auth Contract — PR #6

Status: merged (2026-04-27)

Review notes:

- Claude approved PR #6 by comment.
- GitHub CI passed before merge.

### GPT Image Provider — PR #3

Status: merged (2026-04-26)

Review notes:

- Codex confirmed `gpt-image-1` API shape and approved the default-provider fix.
- Non-blocking follow-up: shared `packages/core` and `packages/config` provider unions still omit `"gpt-image"`, but production cloud uses a local type.

### Endpoint Auth + TV Ownership — PR #4

Status: merged (2026-04-26)

### SSRF Fix + Token Logging — PR #2

Status: merged (2026-04-26)

### Android Monorepo Move — PR #1

Status: merged (2026-04-25)
