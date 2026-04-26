# PR Review Queue

## Ready For Review

### SSRF Fix + Token Logging

Owner: Claude
Requested reviewer: Codex
Status: approved_with_notes
Branch: `hardening/t1-ssrf-validation`

Review focus:

- SSRF: production rejects loopback (127.x) and link-local (169.254.x), dev allows them
- Token logging: TV token value removed from logs, pino redact configured
- 3 new tests for production-mode IP validation
- 137 tests pass total

Tests run:

- `npx vitest run` — 137 passed (7 files)

Known risks:

- pino `redact` only applies to structured log objects, not string interpolation

Review result:

- Codex approved with notes on 2026-04-25.
- See `HANDOFFS.md` entry "Codex - SSRF Fix + Token Logging Review".

Next responder:

- Human/Claude to merge PR #2 when ready.

## Completed

### Android Monorepo Move — PR #1

Status: merged
