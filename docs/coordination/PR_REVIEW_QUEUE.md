# PR Review Queue

## Ready For Review

### Circuit Breaker + 30s Cooldown — PR #8

Owner: Claude
Requested reviewer: Codex
Status: changes_requested_by_comment
Branch: `hardening/t1-circuit-breaker`
Contract change: false

Review focus:

- Half-open probe failures must not leave the breaker stuck in `half_open`.
- Cooldown WebView payload should include `retryAllowed: false`.
- Crash-class upload error payload should forward `retryAllowed` and `retryAfterMs` when set.

Tests:

- GitHub CI is green.
- No Android runtime test was run by Codex.

## Ready To Merge

- None.

## Completed

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
