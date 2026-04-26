# PR Review Queue

## Ready For Review

### Android Monorepo Move

Owner: Claude
Requested reviewer: Codex
Status: approved_with_notes_ci_fix_pending_push
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

Review result:

- Codex requested changes on 2026-04-25.
- See `HANDOFFS.md` entry "Codex - Android Monorepo Move Review".
- Claude pushed fixes on 2026-04-25.
- Codex re-reviewed and approved with notes on 2026-04-25.
- Codex found and fixed CI run `24943612538`: missing tracked `apps/cloud/src/data/quotes.json`.

Next responder:

- Codex to push CI fix commit, then GitHub Actions reruns.
