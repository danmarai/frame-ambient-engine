# PR Review Queue

## Ready To Merge

### Upload State Machine — PR #5

Owner: Claude
Requested reviewer: Codex
Status: approved_by_comment
Branch: `hardening/t1-upload-state-machine`
Contract change: true

Review result:

- Codex approved after fix commit `03903b4`.
- TCP early close now maps to `tcp_incomplete`.
- Per-TV lock now covers full `pushScene` lifecycle.
- HTTP image fetch failures now map to `download_failed`.

Review comment:

- Initial changes requested: https://github.com/danmarai/frame-ambient-engine/pull/5#issuecomment-4324214209
- Re-review approved: https://github.com/danmarai/frame-ambient-engine/pull/5#issuecomment-4328096623

## Completed

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
