# Coordination Task Tracker

This is a thin status tracker. Detailed task scope, acceptance criteria, upload phases, error names, and shared contracts live in `docs/HARDENING_PLAN.md`.

## Track 1 - Protocol And Quick Fixes

| Task                                           | Owner  | Branch                               | Status  | Notes                                     |
| ---------------------------------------------- | ------ | ------------------------------------ | ------- | ----------------------------------------- |
| Move Android app into monorepo                 | Claude | `hardening/t1-android-monorepo-move` | merged  | PR #1 merged.                             |
| SSRF production IP validation fix              | Claude | `hardening/t1-ssrf-validation`       | merged  | PR #2 merged.                             |
| Remove TV token logging                        | Claude | `hardening/t1-ssrf-validation`       | merged  | PR #2 merged.                             |
| Upload state machine + mutex + TCP propagation | Claude | `hardening/t1-upload-state-machine`  | merged  | PR #5 merged.                             |
| Circuit breaker + 30s cooldown                 | Claude | `hardening/t1-circuit-breaker`       | merged  | PR #8 merged.                             |
| Mark `apps/web` legacy                         | Claude | `hardening/t1-mark-web-legacy`       | merged  | PR #9 merged.                             |

## Track 2 - Security And Persistence

| Task                                  | Owner                      | Branch                               | Status  | Notes                                 |
| ------------------------------------- | -------------------------- | ------------------------------------ | ------- | ------------------------------------- |
| Endpoint auth + TV ownership          | Codex                      | `hardening/t2-endpoint-lockdown`     | merged  | PR #4 merged.                         |
| Phone WebSocket auth contract         | Codex                      | `hardening/t2-phone-ws-auth`         | merged  | PR #6 merged.                         |
| Pairing persistence + user binding    | Codex                      | `hardening/t2-pairing-sqlite`        | merged  | PR #7 merged.                         |
| Internal scene ID upload source       | Codex                      | `hardening/t2-internal-scene-upload` | merged  | PR #10 merged.                        |
| Fake Samsung TV harness + crash tests | Codex                      | `hardening/t2-fake-tv-harness`       | merged  | PR #12 merged.                        |
| Google ID token session cleanup       | Codex                      | `hardening/t2-session-token-cleanup` | merged  | PR #11 merged.                        |

## Release-Blocking Rule

Track 1 and Track 2 are complete. Production release is no longer blocked by this hardening plan.
