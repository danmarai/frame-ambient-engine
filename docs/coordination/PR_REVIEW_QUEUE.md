# PR Review Queue

## Ready For Review

- None.

## Ready To Merge

- None.

## Completed

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
