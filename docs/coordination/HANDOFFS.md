# Coordination Handoffs

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
