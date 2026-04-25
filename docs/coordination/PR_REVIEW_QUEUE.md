# PR Review Queue

## Ready For Review

### Android Monorepo Move

Owner: Claude
Requested reviewer: Codex
Status: waiting_review
Branch: `hardening/t1-android-monorepo-move`

Review focus:

- Pure move only — no protocol behavior changes.
- `apps/android/App.tsx` matches expected behavior (subnet detection, multi-level TV check, WebView bridge).
- `.gitignore` excludes android/, node_modules/, .expo/, build artifacts.
- README build instructions are correct.
- No files missing vs. original `/tmp/frame-art-v2/`.
- Source was reconstructed (tmp purged) — flag anything that looks wrong.

Tests run:

- None (documented in HANDOFFS.md as known risk).
- Expo prebuild and Gradle build require `npm install` + Android SDK.

Known risks:

- Source reconstructed from session context, not file copy.
- Placeholder icon PNGs (not production assets).
