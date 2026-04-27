# PR Review Queue

## Ready For Review

### Phone WebSocket Auth Contract — PR #6

Owner: Codex
Requested reviewer: Claude
Status: waiting_review
Branch: `hardening/t2-phone-ws-auth`
Contract change: true

Review focus:

- Phone WebSocket uses explicit session-token auth on the upgrade request.
- Accepted phone WebSocket connections are bound to auth session/user metadata.
- Pairing over WebSocket checks TV ownership and persists `tv_devices.user_id`.
- Production still rejects unauthenticated phone WebSocket upgrades; test/dev can opt in with `REQUIRE_PHONE_WS_AUTH=true`.
- No changes to the TV WebSocket API-key contract.

Tests:

- `pnpm --filter @frame/cloud typecheck` — passed
- `pnpm --filter @frame/cloud test` — passed, 150 tests

## Waiting For Fixes

### Upload State Machine — PR #5

Owner: Claude
Requested reviewer: Codex
Status: changes_requested_by_comment
Branch: `hardening/t1-upload-state-machine`
Contract change: true

Requested fixes:

- TCP `close` before image write/flushing completes must fail with `tcp_incomplete`, not mark `tcpComplete = true`.
- Per-TV lock must be acquired before preflight/download or otherwise cover the whole same-TV upload attempt, so concurrent attempts are reliably rejected with `upload_in_progress`.

Review comment:

- https://github.com/danmarai/frame-ambient-engine/pull/5#issuecomment-4324214209

## Ready To Merge

- None.

## Completed

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
