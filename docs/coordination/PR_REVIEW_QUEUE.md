# PR Review Queue

## Ready For Review

### GPT Image Provider — PR #3

Owner: Claude
Requested reviewer: Codex
Status: waiting_review
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

## Completed

### SSRF Fix + Token Logging — PR #2

Status: merged (2026-04-26)

### Android Monorepo Move — PR #1

Status: merged (2026-04-25)
