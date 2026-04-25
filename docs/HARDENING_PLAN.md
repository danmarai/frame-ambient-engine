# Frame Art Hardening Plan

Date: 2026-04-25
Based on: `docs/ROBUSTNESS_AUDIT.md`
Status: **APPROVED WITH AMENDMENTS** (2026-04-25)

## Context

The robustness audit identified 11 findings (4 P0, 5 P1, 2 P2). This plan covers the work I'll execute. A separate scope (endpoint lockdown, pairing persistence, test harness) is proposed for the auditor/engineering team.

**Important note:** The audit reviewed `apps/mobile/` (unused Next.js scaffold), not our actual Android app at `/tmp/frame-art-v2/App.tsx`. Findings about the mobile WebView bridge being "unwired" don't apply — but the underlying principles (mutex, circuit breaker, message validation) do.

## Open Questions Answered

| Question             | Answer                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| Production stack     | Express cloud (`apps/cloud/`) only. `apps/web/` is legacy.                              |
| Android app source   | `/tmp/frame-art-v2/App.tsx` — will be moved to `apps/android/` in the monorepo.         |
| Upload bridge model  | Phone-only is production. Cloud-side direct upload is LAN/self-hosted only.             |
| Tizen auth model     | Pairing-code bootstrap (TV shows code → user enters on phone → cloud binds TV to user). |
| Arbitrary image URLs | No. Restrict to internal scene IDs.                                                     |
| Crash UX             | 30-second cooldown. Message: "TV is recovering — wait 30s." No auto-retry.              |

---

## My Scope (Upload Hardening & Quick Fixes)

### Task 1: Upload State Machine + Per-TV Mutex

**Files:** `/tmp/frame-art-v2/App.tsx`
**Audit ref:** P0 — "Make Phone Upload a Serialized State Machine"

Changes:

- Add explicit upload phases: `idle` → `checking_tv` → `downloading_image` → `connecting_ws` → `requesting_send` → `waiting_ready` → `uploading_tcp` → `waiting_image_added` → `selecting` → `activating` → `complete` / `failed`
- Per-TV mutex: reject or queue concurrent uploads to the same TV
- TCP promise: `doTcpUpload` returns explicit success/failure (currently fire-and-forget on error)
- Resolve success only after TCP socket closes cleanly AND `image_added` received
- TCP error/close/timeout immediately reject (no waiting for 45s generic timeout)

Acceptance criteria:

- TCP error → immediate failure result, not timeout
- TCP close before all bytes written → failure
- `image_added` before TCP complete → does not produce success
- Second upload to same TV while first is running → rejected with "Upload in progress"
- Different TVs → concurrent uploads allowed

### Task 2: Circuit Breaker + Cooldown

**Files:** `/tmp/frame-art-v2/App.tsx`
**Audit ref:** P0 — "Gate send_image Behind Health, Exclusivity, and Cooldown"

Changes:

- Per-TV circuit breaker: after TCP failure, WebSocket timeout, or suspected art service crash, block uploads for 30 seconds
- During cooldown: reject with `{ error: "tv_recovering", retryAfterMs: N }` and show user message
- Health check already exists (multi-level `checkTvState`) — wire circuit breaker into it
- No auto-retry after partial TCP failure
- One controlled retry only for storage-full (-11) after cleanup

Acceptance criteria:

- After a crash-class failure, next upload attempt within 30s returns "TV is recovering"
- After 30s, upload is allowed again
- Cooldown timer visible in debug panel
- Storage-full triggers cleanup + single retry

### Task 3: SSRF Fix

**Files:** `apps/cloud/src/middleware.ts`
**Audit ref:** P0 — "Fix SSRF IP Validation"

Changes:

- Production mode: allow only RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Remove `127.0.0.0/8` and `169.254.0.0/16` from production allowlist
- Keep loopback allowed only when `NODE_ENV !== 'production'`

Acceptance criteria:

- `127.0.0.1` rejected in production
- `169.254.169.254` (AWS metadata) rejected in production
- `192.168.254.31` (real TV) still allowed
- Existing tests updated

### Task 4: Remove Token Logging

**Files:** `apps/cloud/src/tv-upload.ts`, `apps/cloud/src/auth.ts`
**Audit ref:** P1 — "Stop Logging and Storing Sensitive Tokens"

Changes:

- Remove `console.log(`TV token: ${msg.data.token}`)` from tv-upload.ts
- Remove Google ID token from session storage (keep only user profile fields)
- Add `redact` config to pino logger for token-like fields

Acceptance criteria:

- `grep -r "token" apps/cloud/src/ --include="*.ts"` shows no logging of actual token values
- Session accessor returns `{ userId, email, name }`, not the raw Google token

### Task 5: Mark Legacy Stack

**Files:** `apps/web/package.json`, root `README.md`
**Audit ref:** P1 — "Choose the Production Application Surface"

Changes:

- Add `"private": true, "legacy": true` note to `apps/web/package.json`
- Add `## ⚠️ Legacy` header to `apps/web/README.md` (if exists) or create one
- Document in root README that `apps/cloud/` is the production server
- Remove `apps/web` from any CI build/test pipelines

Acceptance criteria:

- Clear documentation that `apps/cloud/` is production
- `apps/web/` not built or tested in CI

### Task 6: Move Android App into Monorepo

**Files:** `/tmp/frame-art-v2/` → `apps/android/`
**Audit ref:** Auditor noted app source missing from repo

Changes:

- Copy App.tsx, app.json, eas.json, package.json, tsconfig.json, index.ts, assets/ into `apps/android/`
- Add to pnpm-workspace.yaml
- Update `.gitignore` for android build artifacts
- Add build instructions to README

Acceptance criteria:

- `apps/android/App.tsx` is the canonical Android app source
- Build instructions documented
- `/tmp/frame-art-v2/` no longer needed

---

## Auditor/Engineering Team Scope (Proposed)

These items require systematic security review or DB schema work that benefits from the auditor's perspective:

### A: Lock Down Cloud Endpoints

- Require auth on all TV-control and upload routes
- Add TV ownership verification (user can only control their paired TVs)
- Replace arbitrary `imageUrl` fetch with internal scene ID lookup
- Validate `tvIp` in `/api/generate` against paired device records

### B: Fix Phone WebSocket Auth Contract

- Decide: URL token vs. first-message handshake
- Bind WebSocket connection to authenticated user/session
- Route pairing and upload commands through authenticated identity

### C: Persist Pairing to SQLite

- Move pairing codes from in-memory Map to SQLite
- Schema: `user_id`, `tv_id`, `code`, `created_at`, `expires_at`, `claimed_at`
- Enforce one active pairing per TV/user
- Survive server restarts

### D: Fake TV Test Harness

- WebSocket server that mimics Samsung Art Mode protocol
- Can emit `ready_to_use`, accept TCP upload, emit `image_added`
- Can simulate: mid-stream TCP close, delayed/missing `image_added`, error codes (-11, -7), timeout
- Integration tests for all crash-class failures from the audit

### E: Restrict Image Fetch (if kept)

- Allowlist origins
- Content-type check (image/jpeg, image/png only)
- Byte cap (20MB)
- Redirect limit (0 or 1)
- Request timeout (10s)

---

## Estimated Effort

| Task                            | Estimate | Risk                                       |
| ------------------------------- | -------- | ------------------------------------------ |
| 1. Upload state machine + mutex | Medium   | Low — well-understood protocol             |
| 2. Circuit breaker              | Small    | Low                                        |
| 3. SSRF fix                     | Small    | Low                                        |
| 4. Token logging                | Small    | Low                                        |
| 5. Mark legacy stack            | Small    | Low                                        |
| 6. Move Android to monorepo     | Small    | Low                                        |
| **A. Endpoint lockdown**        | Medium   | Medium — auth ownership model needs design |
| **B. WS auth contract**         | Medium   | Medium — mobile + server coordination      |
| **C. Persist pairing**          | Medium   | Low — schema is straightforward            |
| **D. Fake TV harness**          | Large    | Medium — protocol simulation complexity    |
| **E. Image fetch restriction**  | Small    | Low                                        |

## Proposed Order

My work (Tasks 1–6) can start immediately and run in parallel with the engineering team's scope (A–E).

**My sequence:** 6 → 3 → 4 → 1 → 2 → 5 (Android into monorepo FIRST, then quick fixes, then state machine)

**Team sequence:** A → B → C → D → E (security first, then persistence, then testing)

**Both tracks are release-blocking.** Neither ships without the other.

---

## Amendments (from architect review, 2026-04-25)

1. **Android monorepo move is Task 1, not last.** All subsequent work and review happens against canonical repo source.
2. **Both tracks release-blocking together.** Protocol hardening without endpoint auth is not shippable, and vice versa.
3. **"Remove Google ID token from session storage" moved to Track 2** (or coordinated tightly) — it touches auth/session semantics that Track 2 owns.
4. **Pairing-code bootstrap needs rate limiting and short TTL** — added to Track 2 Task C scope.
5. **Shared upload status/error contract defined below** — both tracks must use these names in UI, WebSocket messages, test assertions, and error responses.
6. **Audit record correction:** The `apps/mobile` WebView-bridge-unwired finding is marked non-applicable to the real Android app. Protocol-level findings (mutex, circuit breaker, TCP propagation) still stand.

---

## Shared Upload Status & Error Contract

Both tracks MUST use these exact status/error names across the phone app, cloud API responses, WebSocket messages, telemetry, and test harness.

### Upload Phases (progress reporting)

```
checking_tv         → Probing TV via HTTP 8001 and WS 8002
activating_art_mode → Sending set_artmode_status:on
downloading_image   → Fetching image from cloud
connecting_ws       → Opening WebSocket to TV port 8002
requesting_send     → Sent send_image command
waiting_ready       → Waiting for ready_to_use + conn_info
uploading_tcp       → TCP socket open, writing bytes
tcp_flushing        → write() complete, waiting for socket drain
waiting_image_added → TCP done, waiting for TV confirmation
selecting_image     → Sent select_image command
activating_display  → Sent set_artmode_status:on
complete            → Upload and activation succeeded
failed              → Terminal failure (see error field)
```

### Error Names (failure classification)

```
tv_not_reachable        → HTTP 8001 did not respond (TV off or wrong network)
art_service_unavailable → WS 8002 failed to connect or handshake
pairing_required        → WS connected but no channel handshake (TV showing approval popup)
tv_recovering           → Circuit breaker active, cooldown not expired
upload_in_progress      → Per-TV mutex held by another upload
tcp_failed              → TCP socket error during upload
tcp_incomplete          → TCP socket closed before all bytes written
ws_failed               → WebSocket error during upload flow
ws_timeout              → No expected d2d event within timeout
image_rejected          → TV returned d2d error (see error_code)
storage_full            → TV error code -11
unsupported_operation   → TV error code -7
activation_failed       → select_image or set_artmode_status did not succeed
invalid_image           → Image failed JPEG validation before upload
download_failed         → Could not fetch image from cloud
```

### Result Shape

All upload results (native → WebView, cloud API responses, test assertions) use:

```typescript
interface UploadResult {
  success: boolean;
  phase: string; // Last phase reached
  error?: string; // Error name from list above
  errorDetail?: string; // Human-readable detail
  contentId?: string; // TV content ID (on success)
  durationMs: number; // Total elapsed time
  requestId: string; // Unique per upload attempt
  tvIp: string; // Target TV
  retryAllowed: boolean; // false during cooldown
  retryAfterMs?: number; // ms until retry allowed (if cooldown active)
}
```

### Circuit Breaker States

```
closed   → Normal operation, uploads allowed
open     → Crash-class failure detected, uploads blocked for COOLDOWN_MS
half_open → Cooldown expired, next upload is a probe (success → closed, failure → open)
```

`COOLDOWN_MS = 30000` (30 seconds)

Crash-class failures that trip the breaker: `tcp_failed`, `tcp_incomplete`, `ws_timeout`, `art_service_unavailable` after a `send_image` was already sent.

Non-crash failures that do NOT trip the breaker: `tv_not_reachable`, `storage_full`, `invalid_image`, `download_failed`, `upload_in_progress`.

---

## Approval Status

**Approved by architect with amendments above.** Implementation begins with Task 6 (Android monorepo move), followed by SSRF fix and token scrub, then state machine + circuit breaker.
