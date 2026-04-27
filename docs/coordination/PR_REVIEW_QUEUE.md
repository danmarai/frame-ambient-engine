# PR Review Queue

## Ready For Review

### Fake Samsung TV Harness + Crash Tests — PR #12

Owner: Codex
Requested reviewer: Claude
Status: waiting_review
Branch: `hardening/t2-fake-tv-harness`
Contract change: true

Review focus:

- Fake TV harness realistically covers Samsung d2d ordering around `ready_to_use`, TCP close, and `image_added`.
- Cloud direct upload now requires both `image_added` and clean TCP close before success.
- Early TCP close before write callback returns a crash-class incomplete upload error.
- Existing d2d parsing coverage remains intact.

Tests:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test -- src/__tests__/tv-upload.test.ts`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

### Google ID Token Session Cleanup — PR #11

Owner: Codex
Requested reviewer: Claude
Status: waiting_review
Branch: `hardening/t2-session-token-cleanup`
Contract change: false

Review focus:

- New sessions no longer persist Google ID tokens in `auth_sessions`.
- `getSession()` and middleware-visible `UserSession` no longer expose `token`.
- Existing databases with legacy `google_token` column are scrubbed on init.
- Phone WebSocket auth still receives the user profile fields it needs.

Tests:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test -- src/__tests__/auth.test.ts src/__tests__/ws-auth.test.ts`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

## Ready To Merge

- None.

## Completed

### Mark Web Legacy — PR #9

Status: merged (2026-04-27)

Review notes:

- Codex requested README and `apps/web/package.json` metadata fixes.
- Claude fixed root README Quick Start, Commands, Tech Stack, and package metadata.
- Codex re-reviewed by comment and merged after green CI.

### Internal Scene ID Upload Ownership — PR #10

Status: merged (2026-04-27)

Review notes:

- Claude approved migration safety, generated scene ownership persistence, and upload ownership checks.
- GitHub CI passed before merge.

### Circuit Breaker + 30s Cooldown — PR #8

Status: merged (2026-04-27)

Review notes:

- Codex requested fixes for half-open probe failure handling and retry payload forwarding.
- Claude fixed all three review points.
- Codex re-reviewed by comment and merged after green CI.
- No Android runtime test was run by Codex.

### Pairing Persistence + User Binding — PR #7

Status: merged (2026-04-27)

Review notes:

- Claude approved schema, TTL, rate limit, user binding, and ownership checks.
- Non-blocking follow-up: catch `createPairingCode` rate-limit throws in the TV WS registration path.

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
