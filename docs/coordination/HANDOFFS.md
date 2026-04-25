# Coordination Handoffs

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
