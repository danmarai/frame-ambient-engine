# PR Review Queue

## Ready For Fixes

### GPT Image Provider — PR #3

Owner: Claude
Requested reviewer: Codex
Status: changes_requested_by_comment
Branch: `feat/gpt-image-provider`

Review focus:

- New `GPTImageProvider` follows `ImageProvider` interface contract
- `output_format: "png"` is correct for gpt-image-1 (not `response_format`)
- Provider wired as default in generation.ts, DALL-E 3 still available as "openai"
- Studio page sends `provider: "gpt-image"`
- No security implications (uses same OPENAI_API_KEY)

Tests run:

- `npx vitest run` — 134 passed (7 files)
- Live API: 4 images generated with gpt-image-1 (arctic foxes, photorealistic)

Known risks:

- gpt-image-1 pricing may differ from dall-e-3 (check OpenAI billing)
- No unit test for the new provider (relies on ImageProvider interface contract)

Codex review (2026-04-26):

- API shape is correct: `gpt-image-1` uses `output_format: "png"` on `/v1/images/generations`; GPT image responses return `b64_json` by default, and `response_format` is not the right control for this model.
- Provider contract compiles and cloud/provider typechecks pass.
- Requested fix: `apps/cloud/src/generation.ts` still has `DEFAULT_SETTINGS.imageProvider = "openai"`, and `generate()` passes `options.provider ?? settings.imageProvider` into provider resolution. So default generation still selects DALL-E 3 unless Studio explicitly sends `provider: "gpt-image"`. Update the production cloud default/settings contract to include and use `gpt-image`, keep explicit `"openai"` as the DALL-E 3 escape hatch, and add/update a small test asserting default provider resolution.
- GitHub review note: formal request-changes was blocked because the PR is under the shared account, so Codex posted the review as a PR comment: https://github.com/danmarai/frame-ambient-engine/pull/3#issuecomment-4323502867

Tests run by Codex:

- `pnpm --filter @frame/providers typecheck` — passed
- `pnpm --filter @frame/cloud typecheck` — passed
- `pnpm --filter @frame/cloud test` — passed, 134 tests

## Completed

### SSRF Fix + Token Logging — PR #2

Status: merged (2026-04-26)

### Android Monorepo Move — PR #1

Status: merged (2026-04-25)
