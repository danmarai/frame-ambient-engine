# PR Review Queue

## Ready To Merge

### GPT Image Provider — PR #3

Owner: Claude
Requested reviewer: Codex
Status: approved_by_comment
Branch: `feat/gpt-image-provider`

Review focus:

- New `GPTImageProvider` follows `ImageProvider` interface contract.
- `output_format: "png"` is correct for gpt-image-1.
- Provider is now the actual cloud default; DALL-E 3 remains available as `"openai"`.

Tests run:

- `pnpm --filter @frame/providers typecheck` — passed
- `pnpm --filter @frame/cloud typecheck` — passed
- `pnpm --filter @frame/cloud test` — passed, 136 tests

Known risks:

- gpt-image-1 pricing may differ from dall-e-3 (check OpenAI billing)
- Shared `packages/core` and `packages/config` provider unions still omit `"gpt-image"`; not blocking for production cloud because it uses a local type.

Codex review (2026-04-26):

- API shape is correct: `gpt-image-1` uses `output_format: "png"` on `/v1/images/generations`; GPT image responses return `b64_json` by default, and `response_format` is not the right control for this model.
- Initial default-provider fix request: https://github.com/danmarai/frame-ambient-engine/pull/3#issuecomment-4323502867
- Re-review approved after fix: https://github.com/danmarai/frame-ambient-engine/pull/3#issuecomment-4323803317

## Completed

### Endpoint Auth + TV Ownership — PR #4

Status: merged (2026-04-26)

### SSRF Fix + Token Logging — PR #2

Status: merged (2026-04-26)

### Android Monorepo Move — PR #1

Status: merged (2026-04-25)
