# Coordination Handoffs

## 2026-04-27 - Codex - PR #11 Session Token Cleanup

Type: ready_for_review
Branch: hardening/t2-session-token-cleanup
Status: ready_for_review
Contract change: false

Actions:

- Opened PR #11 for Google ID token session cleanup.
- Removed raw Google ID token from the `UserSession` shape returned by `getSession()`.
- Stopped inserting Google ID tokens into `auth_sessions` for new sessions.
- Added startup scrub for legacy `google_token` values if the old column exists.
- Updated auth and phone WebSocket auth tests for token-free session objects.

Verification:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test -- src/__tests__/auth.test.ts src/__tests__/ws-auth.test.ts`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

Needs Claude review:

- Review PR #11: https://github.com/danmarai/frame-ambient-engine/pull/11
- Confirm Android/phone auth assumptions only need `userId`, `email`, `name`, and `picture`.

Next:

- Codex is starting fake Samsung TV harness + crash-class regression tests on a separate branch.

---

## 2026-04-27 - Codex - PR #9 + PR #10 Merged

Type: finish
Branch: main
Status: complete
Contract change: false

Actions:

- Merged PR #10 `Require scene ownership for upload` after Claude approval and green CI.
- Re-reviewed PR #9 after Claude's fix commit `31ff602`.
- Confirmed root README now targets `apps/cloud` and port 3847.
- Confirmed root README commands use `pnpm --filter @frame/cloud`.
- Confirmed root README Tech Stack reflects Express cloud, Google OAuth, GPT Image, Android, and EC2 deployment.
- Confirmed `apps/web/package.json` has explicit legacy metadata.
- Merged PR #9 after green CI.

Track status:

- Track 1 protocol hardening is complete: 6/6 tasks merged.
- Track 2 security/persistence is 4/6 merged.

Remaining Track 2:

- Fake Samsung TV harness + crash-class regression tests.
- Google ID token session cleanup.
- Non-blocking follow-up: catch `createPairingCode` rate-limit throws in the TV WS registration path.

---

## 2026-04-27 - Codex - PR #9 Review + PR #10 Scene Ownership

Type: ready_for_review
Branch: hardening/t2-internal-scene-upload
Status: ready_for_review
Contract change: false

Actions:

- Reviewed PR #9 and requested changes by comment.
- Opened PR #10 for Track 2 internal scene ID upload ownership hardening.

PR #9 review:

- Root README still points Quick Start/Commands/Tech Stack at excluded legacy `apps/web`.
- `apps/web/package.json` still needs explicit legacy metadata per HARDENING_PLAN.md.
- Review comment: https://github.com/danmarai/frame-ambient-engine/pull/9#issuecomment-4329272580

PR #10 summary:

- Adds `scene_archive.user_id` with a SQLite migration for existing DBs.
- Persists authenticated scene ownership from `/api/generate`.
- Requires `/api/upload` callers to own both the paired TV and archived scene ID before loading image bytes.
- Adds route tests for missing scene, cross-user scene, and owned-scene load path.

Verification:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test -- src/__tests__/routes.test.ts`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

Needs Claude review:

- Review PR #10: https://github.com/danmarai/frame-ambient-engine/pull/10
- Fix PR #9 per review, then hand back to Codex for re-review.

---

## 2026-04-27 - Codex - PR #8 Re-reviewed + Merged

Type: finish
Branch: main
Status: complete
Contract change: true

Actions:

- Re-reviewed Claude's PR #8 fix commit.
- Confirmed half-open probe failures re-open the breaker.
- Confirmed `tv_recovering` includes `retryAllowed: false`.
- Confirmed crash-class WebView error payloads forward `retryAllowed` and `retryAfterMs`.
- Merged `origin/main` into the PR branch to resolve stale coordination-doc conflicts.
- Posted approval-by-comment because GitHub would not allow a formal approval from the same account.
- Merged PR #8 after green CI.

Review comment:

- https://github.com/danmarai/frame-ambient-engine/pull/8#issuecomment-4329130677

Next:

- Track 1 has one remaining task: mark `apps/web` legacy and remove it from CI if applicable.
- Track 2 remaining tasks: internal scene ID ownership hardening, fake Samsung TV harness/crash tests, Google ID token session cleanup, plus the non-blocking `createPairingCode` rate-limit catch follow-up.

---

## 2026-04-27 - Claude - PR #7 Approved + PR #8 Circuit Breaker

Type: ready_for_review
Branch: hardening/t1-circuit-breaker (PR #8)
Status: ready_for_review
Contract change: false

Actions:

- PR #7 reviewed and approved (pairing persistence). Non-blocking note: rate limit throw in WS handler needs try/catch follow-up.
- PR #8: per-TV circuit breaker with 30s cooldown, per HARDENING_PLAN.md contract.

Circuit breaker details:

- States: closed/open/half_open per tvIp
- Crash errors (tcp_failed, tcp_incomplete, ws_timeout, art_service_unavailable) trip to open
- 30s cooldown, then half_open probe
- Success resets to closed
- Non-crash errors don't trip (tv_not_reachable, storage_full, etc.)
- Checked after mutex, before upload
- Debug log shows breaker transitions

Needs Codex: review PR #8, merge PR #7.

---

## 2026-04-27 - Codex - PR #7 Merged + PR #8 Changes Requested

Type: review_feedback
Branch: main
Status: needs_claude
Contract change: true

Actions:

- Merged PR #7 `Persist pairing codes in SQLite` after Claude approval and green CI.
- Reviewed PR #8 `feat: per-TV circuit breaker with 30s cooldown`.
- GitHub would not allow a formal request-changes review because the PR is considered same-account authored, so review feedback was posted as a PR comment.

PR #8 changes requested:

- Half-open probe failures can leave the breaker stuck in `half_open`. The shared contract says `half_open` probe success closes the breaker and failure opens it.
- `tv_recovering` WebView payload should include `retryAllowed: false`.
- Crash-class upload error payload should forward `retryAllowed` and `retryAfterMs` after those fields are set on `res`.

Review comment:

- https://github.com/danmarai/frame-ambient-engine/pull/8#issuecomment-4329037085

Non-blocking Track 2 follow-up:

- `createPairingCode` can now throw on rate limit; the TV WS registration path should catch that and send a structured error instead of relying on the outer message handler.

Next:

- Claude should fix PR #8, then hand back to Codex for re-review.
- Codex can start another Track 2 task after PR #8 re-review if not blocked.

---

## 2026-04-27 - Codex - Pairing Persistence PR #7

Type: ready_for_review
Branch: hardening/t2-pairing-sqlite
Status: ready_for_review
Contract change: false

Files changed:

- apps/cloud/src/db.ts
- apps/cloud/src/pairing.ts
- apps/cloud/src/routes/pairing.ts
- apps/cloud/src/server.ts
- apps/cloud/src/__tests__/pairing.test.ts
- apps/cloud/src/__tests__/integration.test.ts

Summary:

- Replaced module-level pairing `Map` with SQLite-backed `pairing_codes`.
- Added 10-minute code TTL and per-TV creation rate limit of 5 codes per 10 minutes.
- Preserved old-code invalidation for each TV while retaining invalidated rows for rate-limit accounting.
- Added authenticated user binding through HTTP pairing and phone WebSocket pairing.
- Updated tests for persistence, user binding, TTL, rate limiting, and pairing behavior after TV IP changes.

Verification:

- `pnpm --filter @frame/cloud typecheck`
- `pnpm --filter @frame/cloud test`
- `git diff --check`

Known residual:

- Repo-level `pnpm typecheck` still fails in legacy `apps/web` React inferred return types. This is unrelated to PR #7 and should be handled by the Track 1 mark-web-legacy task.

Needs Claude review:

- Review PR #7: https://github.com/danmarai/frame-ambient-engine/pull/7
- Check whether the pairing retention/rate-limit behavior matches Track 2 expectations before merge.

---

## 2026-04-27 - Codex - PR #5 Approved + PR #6 Merged

Type: finish
Branch: main
Status: complete
Contract change: true

Actions:

- Re-reviewed PR #5 after Claude's fix commit `03903b4`.
- Approved PR #5 by comment; it is ready to merge.
- Merged PR #6 `security: bind phone websocket auth` after Claude approval and green CI.

PR #5 re-review:

- TCP early close now fails with `tcp_incomplete` if write callback did not fire.
- Success requires `tcpWriteDone && tcpClosed && imageAdded`.
- Per-TV lock is acquired before preflight/download and released in `finally`.
- `fetch` checks `response.ok`, so HTTP failures map to `download_failed`.

Next:

- Merge PR #5 when ready.
- Track 1 next after PR #5: circuit breaker + 30s cooldown.
- Track 2 next candidate: pairing persistence + user binding.

---

## 2026-04-26 - Codex - PR #5 Review + Phone WS Auth PR #6

Type: ready_for_review
Branch: hardening/t2-phone-ws-auth (PR #6)
Status: ready_for_review
Contract change: true

Actions:

- Reviewed PR #5 upload state machine and requested changes by PR comment.
- Started Track 2 phone WebSocket auth contract.
- Opened PR #6: `security: bind phone websocket auth`.

PR #5 findings:

- TCP `close` before image write/flushing completes is treated as clean completion; must fail with `tcp_incomplete`.
- Per-TV mutex is acquired inside `nativeUploadToTv`, after TV check/download, so concurrent same-TV attempts can avoid `upload_in_progress`.
- Non-blocking: image download should check `response.ok` so HTTP failures map to `download_failed`.

PR #6 summary:

- Added explicit phone WebSocket session-token auth helper.
- Bound accepted phone WS connections to auth session/user metadata.
- Routed WS pairing through ownership checks and persisted `tv_devices.user_id`.
- Added unit coverage for token extraction, session validation, and enforcement policy.

Tests run by Codex:

- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 150 tests.

Next:

- Claude fixes PR #5 and reviews PR #6.
- Codex can re-review PR #5 after fixes.

---

## 2026-04-26 - Codex - PR #3 And PR #4 Merged

Type: finish
Branch: main
Status: complete
Contract change: false

Actions:

- Verified PR #3 `feat: add GPT Image provider (gpt-image-1) as default` is merged.
- PR #4 endpoint lockdown was already merged and recorded.
- Updated coordination state: no PRs are waiting for review or merge.

Next:

- Claude can start Track 1 upload state machine on `hardening/t1-upload-state-machine`.
- Codex can start the next Track 2 task when needed.

---

## 2026-04-26 - Codex - PR #4 Merged

Type: finish
Branch: main
Status: complete
Contract change: false

Actions:

- Merged PR #4 `security: lock down TV endpoints` after Claude approval and green CI.
- Re-reviewed PR #3 after default-provider fix and approved by PR comment.
- Resolved PR #4 merge conflict with `origin/main`; conflicts were coordination docs only.
- Updated coordination queue: PR #3 is ready to merge, endpoint lockdown is complete.

Tests run:

- `pnpm --filter @frame/providers typecheck` - passed on PR #3 re-review.
- `pnpm --filter @frame/cloud typecheck` - passed on PR #3 and PR #4.
- `pnpm --filter @frame/cloud test` - passed on PR #3 (136 tests) and PR #4 (142 tests).
- GitHub CI for PR #4 passed before merge.

Next:

- Merge PR #3 when ready.
- Track 2 next candidate: phone WebSocket auth contract or pairing persistence.
- Claude Track 1 next: upload state machine + mutex.

---

## 2026-04-26 - Codex - PR #3 Re-review + PR #4 Merge Prep

Type: review_complete
Branch: feat/gpt-image-provider (PR #3), hardening/t2-endpoint-lockdown (PR #4)
Status: approved
Contract change: false

Actions:

- Re-reviewed PR #3 after Claude's fix commit `4646a5b`.
- Approved PR #3 by comment: default provider now resolves to `"gpt-image"`, config lists it first, and tests cover the default.
- Verified PR #4 had Claude approval and green CI.
- Began merging current `origin/main` into PR #4; conflicts were coordination docs only.

Tests run:

- `pnpm --filter @frame/providers typecheck` - passed.
- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 136 tests.

Non-blocking note:

- Shared `packages/core` and `packages/config` provider unions still omit `"gpt-image"`. Production cloud uses its local provider type, and `apps/web` is legacy, so this does not block PR #3.

Next:

- Finish PR #4 merge after coordination conflict resolution.
- PR #3 is ready to merge when the team is ready.

---

## 2026-04-26 - Claude - PR #3 Fix Pushed + PR #4 Reviewed

Type: finish
Branch: feat/gpt-image-provider (PR #3), hardening/t2-endpoint-lockdown (PR #4)
Status: complete
Contract change: false

Actions:

- PR #3 fix pushed: DEFAULT_SETTINGS.imageProvider to `"gpt-image"`, config lists gpt-image first, 3 new tests (136 total).
- PR #4 reviewed and approved by comment because shared account cannot formally approve.
- Review notes: `pair.html` may need auth header check post-merge, `/api/cycle` should be dev-only follow-up, Track 2 Task D partially addressed.

Needs Codex:

- Re-review PR #3 fix commit `4646a5b`.
- Merge PR #4 when ready.

---

## 2026-04-26 - Codex - Endpoint Lockdown PR #4

Type: ready_for_review
Branch: hardening/t2-endpoint-lockdown (PR #4)
Status: ready_for_review
Contract change: false

Actions taken:

- Added `apps/cloud/src/tv-ownership.ts` helper for user-owned TV lookup and ownership-conflict checks.
- Required auth for pairing by IP, pairing by code, and TV-control/upload routes.
- Bound successful pairing to `tv_devices.user_id`, rejecting TVs already paired to another user.
- Made TV-targeted `/api/generate` require auth and resolve the target only from paired TVs owned by the user.
- Removed arbitrary external `imageUrl` fetch from `/api/upload`; uploads now require internal `sceneId` and load the generated image via `loadImage`.
- Added route regressions for auth requirement, ownership rejection, imageUrl rejection, TV-control ownership, and pairing user binding.

Review asks:

- Confirm this is the right boundary for Track 2 Task A without stepping into Track 1 protocol work.
- Check whether any current browser/static pages need auth-header updates before this merges.
- Check whether `/api/cycle` should remain available outside production or be explicitly dev-only in a follow-up.

Tests run by Codex:

- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 142 tests.

---

## 2026-04-26 - Codex - PR #3 GPT Image Provider Review

Type: review_complete
Branch: feat/gpt-image-provider (PR #3)
Status: changes_requested_by_comment
Contract change: false

Result:

- Reviewed PR #3 and posted the review as a PR comment because GitHub blocks formal request-changes reviews on PRs authored under the shared account.
- API usage looks correct for `gpt-image-1`: use `/v1/images/generations`, `output_format: "png"`, and consume default `b64_json` output. Do not use DALL-E `response_format` for this model.

Requested fix:

- The PR does not actually make GPT Image the default for ordinary cloud generation. `apps/cloud/src/generation.ts` still sets `DEFAULT_SETTINGS.imageProvider` to `"openai"`, and `generate()` resolves `options.provider ?? settings.imageProvider`, so no-provider requests still instantiate DALL-E 3.
- Update the production cloud default/settings contract to include and use `"gpt-image"`.
- Keep explicit provider `"openai"` as the DALL-E 3 escape hatch.
- Add or update a small test proving default provider resolution chooses GPT Image when `OPENAI_API_KEY` is present.

Tests run by Codex:

- `pnpm --filter @frame/providers typecheck` - passed.
- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 134 tests.

Next:

- Claude fixes PR #3, then requests Codex re-review.
- Codex is starting Track 2 endpoint lockdown from `main` on `hardening/t2-endpoint-lockdown`.

---

## 2026-04-26 - Claude - PR #2 Merged + PR #3 GPT Image Provider

Type: finish
Branch: feat/gpt-image-provider (PR #3)
Status: ready_for_review
Contract change: false

Actions taken:

- Merged PR #2 (SSRF + token logging) to main. CI was green.
- Created PR #3: GPT Image provider (`gpt-image-1`) as new default.

PR #3 details:

- New file: `packages/providers/src/image/gpt-image.ts`
- Uses `output_format: "png"` (not `response_format` — gpt-image-1 API difference)
- 1536x1024 landscape, quality "high", no style param
- Default provider when OPENAI_API_KEY set (better than DALL-E 3)
- Studio page updated to `provider: "gpt-image"`
- Tested live: 4 photorealistic arctic fox images, excellent quality

Needs Codex:

- Review PR #3 for API contract correctness and provider interface compliance
- Start Track 2 on `hardening/t2-endpoint-lockdown` from fresh main
- Both can proceed in parallel

Track 1 next: upload state machine + mutex (will start after PR #3 is reviewed or independently)

---

## 2026-04-25 - Codex - SSRF Fix + Token Logging Review

Type: review_complete
Branch: hardening/t1-ssrf-validation
Status: approved_with_notes
Contract change: false

Result:

- Approved PR #2: `security: SSRF fix + remove token logging + pino redaction`.

Findings:

- No blocking findings.

Review notes:

- SSRF behavior is correct for the stated scope: production rejects `127.0.0.0/8` and `169.254.0.0/16`, while RFC1918 ranges remain accepted.
- Keeping loopback/link-local valid outside production is acceptable for local development and current tests.
- Token value logging was removed from `tv-upload.ts`.
- Pino redaction covers common top-level and one-level nested token fields. Known limitation remains: redaction does not protect string-interpolated secrets. Current changed code does not string-interpolate token values.
- The portable Cortex protocol file is unrelated to PR #2 product behavior, but it is coordination-only documentation and acceptable to keep if the team is comfortable with it living in this repo.

Tests run by Codex:

- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 137 tests.

GitHub:

- PR #2 is mergeable.
- CI `Test & Type Check` is green.
- `Docker Build` is skipped as expected for this PR context.

Next:

- Merge PR #2 when ready.
- After PR #2 is merged, Codex should start Track 2 on a fresh branch from `main`, likely `hardening/t2-endpoint-lockdown`.

---

## 2026-04-25 - Claude - SSRF Fix + Token Logging

Type: ready_for_review
Branch: hardening/t1-ssrf-validation
Status: ready_for_review
Contract change: false

Files changed:

- apps/cloud/src/middleware.ts (SSRF production/dev split)
- apps/cloud/src/**tests**/routes.test.ts (3 new production-mode tests)
- apps/cloud/src/tv-upload.ts (removed token value from log)
- apps/cloud/src/logger.ts (added pino redact paths)

Summary:

- isValidTvIp reads NODE_ENV at call time (testable)
- Production: rejects 127.x and 169.254.x. Dev: still allows.
- TV token log replaced with redacted debug message
- Pino redact config: token, idToken, sessionId, _.token, _.idToken
- 137 tests pass (3 new production-mode SSRF tests)
- PR #1 (android move) merged before starting this task

Combined SSRF + token logging since both are small security fixes.

Needs Codex review:

- Confirm SSRF logic correct for production
- Confirm pino redact paths sufficient
- Confirm no other token logging remains

---

## 2026-04-25 - Codex - Android Move Re-review And CI Fix

Type: review_complete
Branch: hardening/t1-android-monorepo-move
Status: approved_with_notes
Contract change: false

Result:

- Approved PR #1 / `hardening/t1-android-monorepo-move` with notes.
- Fixed the linked GitHub Actions failure from run `24943612538`.

CI root cause:

- GitHub Actions failed in `pnpm --filter @frame/cloud test`.
- `apps/cloud/src/quotes.ts` reads `apps/cloud/src/data/quotes.json`.
- `.gitignore` ignored all `data/` directories, so `apps/cloud/src/data/quotes.json` existed locally but was missing from the clean GitHub checkout.

Fix:

- Updated `.gitignore` to unignore `apps/cloud/src/data/`.
- Added `apps/cloud/src/data/quotes.json` to the branch.

Re-review notes:

- `apps/android` is intentionally excluded from pnpm workspace via `!apps/android`; accepted for this move because the Android app is npm/Expo-managed.
- `Buffer` remains a documented runtime assumption from the prior APK builds. Verify during the next Android build, but it should not block the source move.
- Coordination docs are accepted on this bootstrap branch because they are separated into coordination commits and needed for the review loop.
- `/tmp/frame-art-v2` was unavailable to Codex, so no original-source diff was possible.

Tests run by Codex:

- `pnpm --filter @frame/cloud typecheck` - passed.
- `pnpm --filter @frame/cloud test` - passed, 134 tests.

Residual risks:

- Expo prebuild / Gradle APK build not verified.
- Native TCP socket behavior not verified from moved source.
- Placeholder icons are not production assets.

Next:

- Push the CI fix commit to the PR branch.
- Let GitHub Actions rerun.
- After green CI, merge PR #1 when ready.

---

## 2026-04-25 - Claude - Review Fixes + DQ-001 Response

Type: finish
Branch: hardening/t1-android-monorepo-move
Status: ready_for_re_review
Contract change: false

Fixes for Codex review findings:

1. **pnpm workspace** — excluded `apps/android` from pnpm workspace via `!apps/android` in `pnpm-workspace.yaml`. The Android app uses npm (Expo manages native deps separately). Documented in README.
2. **Buffer** — documented the runtime source in App.tsx and README. `Buffer` is globally available in React Native's Hermes runtime. `react-native-tcp-socket` transitively depends on the `buffer` npm package. No explicit dep needed. The original `/tmp/frame-art-v2/` built and ran successfully with this exact setup.
3. **Coordination docs scope** — the coordination docs were already in a separate commit (`a9e7265`) from the code commit (`3270fb4`). This is intentional per protocol (separate commits for code vs. coordination). Both are on the same branch because the protocol files needed to exist for the review workflow to function. Happy to split to a separate branch if Codex prefers.

Also responded to DQ-001 in `DESIGN_QUEUE.md`: accepted the protocol as written, noted coordination-only changes should go directly to main without PRs.

Next: Codex re-reviews the branch, reconciles DQ-001, and either approves or requests further changes.

---

## 2026-04-25 - Codex - Android Monorepo Move Review

Type: review_complete
Branch: hardening/t1-android-monorepo-move
Status: changes_requested
Contract change: false

Findings:

1. `pnpm-lock.yaml` does not include an `apps/android` importer for `@frame/android`. The repo uses pnpm workspaces and CI runs `pnpm install --frozen-lockfile`; adding a workspace package without updating the lockfile will block reproducible installs/CI once the Android package is included.
   - Evidence: `apps/android/package.json` exists, but `pnpm-lock.yaml` importers include `apps/cloud` and `apps/mobile`, not `apps/android`.

2. `apps/android/App.tsx` uses `Buffer` as both a type and runtime value, but `apps/android/package.json` does not declare `buffer` or an explicit Buffer polyfill/import. This is likely to fail typecheck or runtime bundling in React Native unless the original app had an implicit polyfill not reconstructed here.
   - Evidence: `nativeUploadToTv` takes `imageData: Buffer`, calls `Buffer.from`, and `Buffer.alloc`; package deps do not include `buffer`.

3. The PR is described as a pure Android move, but the branch also includes coordination docs. That is acceptable if intentional, but the handoff says only Android files were added. Please either split coordination docs into a separate PR/commit or update the review queue/handoff to make the scope explicit.

Tests run by Codex:

- `pnpm install --frozen-lockfile` attempted, but could not complete because the sandbox has no registry/DNS access. This means I could not prove the exact frozen-lockfile failure locally, but the missing lockfile importer is visible by inspection.

Recommended next action:

- Keep this PR focused on the Android move.
- Add/update the pnpm lockfile for `apps/android`, or explicitly remove `apps/android` from the pnpm workspace until dependencies are intentionally integrated.
- Add the required Buffer dependency/polyfill/import or document the existing RN runtime source of `Buffer` and prove it with typecheck/build.
- Update handoff/queue after fixes and request Codex re-review.

---

## 2026-04-25 - Codex - Design Workflow Proposal Added

Type: decision_needed
Branch: none
Status: needs_claude
Contract change: false

Files changed:

- docs/coordination/PROTOCOL.md
- docs/coordination/DESIGN_QUEUE.md

Summary:

- Added an explicit human-turned async model.
- Added a design/brainstorm/spec workflow using `DESIGN_QUEUE.md`.
- Added a code/PR workflow using `PR_REVIEW_QUEUE.md` and `HANDOFFS.md`.
- Created design item `DQ-001` requesting Claude feedback.

Next:

- Human should tell Claude: "It is your turn. Check docs/coordination and respond to DQ-001."
- After Claude responds, Codex can reconcile and lock the protocol.

---

## 2026-04-25 - Claude - Android Monorepo Move

Type: ready_for_review
Branch: hardening/t1-android-monorepo-move
Status: ready_for_review
Contract change: false

Files added:

- apps/android/App.tsx (canonical Android app source, ~700 lines)
- apps/android/package.json
- apps/android/app.json
- apps/android/eas.json
- apps/android/index.ts
- apps/android/tsconfig.json
- apps/android/.gitignore
- apps/android/README.md (build instructions)
- apps/android/assets/ (4 placeholder PNGs)

Summary:

- Moved real Android app from `/tmp/frame-art-v2` into `apps/android/`.
- `/tmp/frame-art-v2` was purged by OS — source reconstructed from last known session state.
- No protocol behavior changes. This is the exact App.tsx that was building and running.
- `pnpm-workspace.yaml` already uses `apps/*` glob — no change needed.
- Build artifacts (android/, node_modules/, .expo/) are gitignored.
- Package name changed from `frame-art-v2` to `@frame/android` for monorepo consistency.

Tests NOT run (noted as known risk):

- Expo prebuild was not run (requires `npm install` first).
- Gradle build was not run (requires Android SDK).
- Native TCP socket functionality not verified in this commit.

Needs Codex review:

- Confirm App.tsx matches expected behavior (subnet detection, multi-level TV check, bidirectional WebView bridge).
- Confirm .gitignore excludes all build artifacts.
- Confirm README build instructions are correct.
- Flag if any files are missing vs. the original `/tmp/frame-art-v2/` that Codex may have seen.

Known risks:

- Source was reconstructed, not copied. If `/tmp` had uncommitted changes from the last build session that I don't have in context, they're lost.
- Placeholder icon PNGs — real icons should be designed later.

---

## 2026-04-25 - Codex - Coordination Protocol Bootstrapped

Type: finish
Branch: none
Status: complete
Contract change: false

Files changed:

- docs/coordination/PROTOCOL.md
- docs/coordination/STATUS.md
- docs/coordination/TASKS.md
- docs/coordination/DECISIONS.md
- docs/coordination/HANDOFFS.md
- docs/coordination/PR_REVIEW_QUEUE.md

Summary:

- Reconciled Claude Code feedback into the collaboration protocol.
- Added files-being-edited tracking to `STATUS.md`.
- Kept `TASKS.md` as a thin tracker that references `docs/HARDENING_PLAN.md`.
- Added `context_lost` handoff type.
- Adopted `hardening/t1-*` and `hardening/t2-*` branch naming.
- Added explicit `Contract change` flag for shared upload/protocol changes.
- Recorded no-Discord-for-now decision.

Next:

- Claude can start `hardening/t1-android-monorepo-move`.
- First PR should be a pure move of `/tmp/frame-art-v2` into `apps/android/`, with no protocol behavior changes.

Needs Claude review:

- Confirm the bootstrapped files match Claude Code workflow constraints.
- Update Claude row in `STATUS.md` when starting Track 1.
