# Coordination Task Tracker

This is a thin status tracker. Detailed task scope, acceptance criteria, upload phases, error names, and shared contracts live in `docs/HARDENING_PLAN.md`.

## Track 1 - Protocol And Quick Fixes

| Task                                           | Owner  | Branch                               | Status           | Notes                                                                   |
| ---------------------------------------------- | ------ | ------------------------------------ | ---------------- | ----------------------------------------------------------------------- |
| Move Android app into monorepo                 | Claude | `hardening/t1-android-monorepo-move` | ready_for_review | Pure move. Source reconstructed from last known state (tmp was purged). |
| SSRF production IP validation fix              | Claude | `hardening/t1-ssrf-validation`       | pending          | Reject loopback/link-local in production.                               |
| Remove TV token logging                        | Claude | `hardening/t1-token-logging`         | pending          | Google ID token storage moved to Track 2.                               |
| Upload state machine + mutex + TCP propagation | Claude | `hardening/t1-upload-state-machine`  | pending          | Requires canonical `apps/android`.                                      |
| Circuit breaker + 30s cooldown                 | Claude | `hardening/t1-circuit-breaker`       | pending          | No auto-retry after crash-class failures.                               |
| Mark `apps/web` legacy                         | Claude | `hardening/t1-mark-web-legacy`       | pending          | Remove from CI if applicable.                                           |

## Track 2 - Security And Persistence

| Task                                  | Owner                      | Branch                               | Status  | Notes                                 |
| ------------------------------------- | -------------------------- | ------------------------------------ | ------- | ------------------------------------- |
| Endpoint auth + TV ownership          | Codex or assigned engineer | `hardening/t2-endpoint-lockdown`     | pending | Release-blocking with Track 1.        |
| Phone WebSocket auth contract         | Codex or assigned engineer | `hardening/t2-phone-ws-auth`         | pending | Coordinate with Android bridge.       |
| Pairing persistence + user binding    | Codex or assigned engineer | `hardening/t2-pairing-sqlite`        | pending | Include short TTL and rate limiting.  |
| Internal scene ID upload source       | Codex or assigned engineer | `hardening/t2-internal-scene-upload` | pending | Remove arbitrary external `imageUrl`. |
| Fake Samsung TV harness + crash tests | Codex or assigned engineer | `hardening/t2-fake-tv-harness`       | pending | Simulate partial TCP failure.         |
| Google ID token session cleanup       | Codex or assigned engineer | `hardening/t2-session-token-cleanup` | pending | Coordinate with auth changes.         |

## Release-Blocking Rule

Track 1 and Track 2 may be developed in parallel, but production release is blocked until both protocol hardening and security/persistence work are complete.
