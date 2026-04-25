# Coordination Decisions

## 2026-04-25 - Coordination Source Of Truth

Decision:
Use repo files under `docs/coordination/` as the source of truth. Do not use Discord for now.

Rationale:
Repo files are diffable, branch-aware, and available to both agents without network dependency.

## 2026-04-25 - Production Stack

Decision:
`apps/cloud/` Express cloud is the production server. `apps/web/` is legacy.

Implications:
Hardening work should prioritize `apps/cloud/`. `apps/web/` should be marked legacy and removed from CI where applicable.

## 2026-04-25 - Production Upload Bridge

Decision:
The Android phone app is the production upload bridge. Cloud-side direct TV upload remains only for LAN/self-hosted deployments.

Rationale:
Samsung Frame TVs accept image uploads only over local WebSocket + TCP. Hosted cloud cannot reach TVs behind NAT.

## 2026-04-25 - Android Source Location

Decision:
Move the real Android app from `/tmp/frame-art-v2` into `apps/android/` before protocol hardening work.

Rationale:
Review and tests must run against canonical repo source.

## 2026-04-25 - Tizen Auth Model

Decision:
Use pairing-code bootstrap. TV shows a 6-character code, user enters it on phone, and cloud binds TV to user.

Implications:
No shared TV API key for production auth. Pairing must include user binding, short TTL, and rate limiting.

## 2026-04-25 - Image Upload Source

Decision:
Arbitrary external image URLs are not a product requirement.

Implications:
Restrict upload to internal scene IDs or signed/internal image references. Remove arbitrary `imageUrl` fetch where possible.

## 2026-04-25 - Crash Cooldown

Decision:
Use a 30-second cooldown after crash-class failures.

User-facing message:
"TV is recovering - wait 30 seconds before trying again."

Implications:
No auto-retry after partial TCP failure. One controlled retry is allowed only for storage-full `-11` after cleanup.

