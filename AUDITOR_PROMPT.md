# Frame Art — Auditor Onboarding & Review Prompt

## What This Project Is

Frame Art is a product that generates AI art and pushes it to Samsung Frame TVs. The system has three components:

1. **Cloud Server** (Express.js on EC2) — generates images via OpenAI DALL-E, manages TV pairing, handles uploads, serves the Studio UI, and provides a telemetry dashboard
2. **Android Phone App** (React Native / Expo) — scans for TVs on the local network, connects via WebSocket, uploads images to the TV over the d2d TCP protocol, and embeds the Studio UI in a WebView
3. **Tizen TV App** (Samsung) — thin client that displays a pairing code and maintains a WebSocket connection to the cloud server

The key technical constraint: Samsung Frame TVs only accept image uploads over a **local network** WebSocket + TCP protocol. The cloud server cannot push images directly — the phone app acts as the bridge.

## What We Already Did

### Completed

- Full d2d TCP upload protocol implementation (WebSocket handshake → send_image → TCP binary transfer → select_image → set_artmode_status)
- Cloud server with: image generation pipeline, overlay compositing (weather/market/quotes), Google OAuth, pairing system, art gallery, telemetry collection
- Server hardening: SQLite persistence, structured logging (pino), rate limiting, CORS, SSRF protection, upload mutex, async error handlers, route modularization
- Android app: network scanning with auto-subnet detection, multi-level TV state checking, WebView hybrid architecture with bidirectional JS bridge
- Tizen TV app: minimal config.xml (the breakthrough — `tizen:allow-navigation` causes black screen)
- 134 passing tests across 7 test files
- EC2 deployment with PM2, nginx, Let's Encrypt HTTPS
- Dockerfile and GitHub Actions CI/CD

### Known Issues

- TV crashes if a `send_image` request is sent but the TCP upload doesn't fully complete (art mode service restarts)
- Upload from phone to TV has been inconsistent — we've been iterating on the health check flow
- No SSDP/UPnP discovery yet (subnet scan works but is brute-force)
- Session persistence is in-memory (SQLite tables exist but auth sessions aren't migrated yet)
- Android app is at `/tmp/frame-art-v2/` (not in the monorepo yet)

## Where We Are Now

**Phase: Late prototype / Early production hardening.** The e2e pipeline works (cloud generates → phone downloads → phone uploads to TV → TV displays art), but reliability of the phone-to-TV upload needs improvement. The recent hardening pass added security, logging, and error handling. We're now focused on making the upload flow bulletproof and the UX smooth.

## How to Navigate the Codebase

### Start Here

| What                   | Where                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| Product requirements   | `PRD.md`                                                                     |
| Technical spec         | `TECH_SPEC.md`, `docs/TIZEN_APP_TECH_SPEC.md`                                |
| Architecture decisions | `docs/adr/` (9 ADRs)                                                         |
| Project learnings      | `.claude/projects/-Users-dmarantz-ClaudeCode-FrameHomepage/memory/MEMORY.md` |

### Cloud Server (the heart of the system)

| What                                | Where                           |
| ----------------------------------- | ------------------------------- |
| Server entry point                  | `apps/cloud/src/server.ts`      |
| Route handlers                      | `apps/cloud/src/routes/*.ts`    |
| TV upload protocol                  | `apps/cloud/src/tv-upload.ts`   |
| Image generation                    | `apps/cloud/src/generation.ts`  |
| Middleware (CORS, rate limit, auth) | `apps/cloud/src/middleware.ts`  |
| Database schema & init              | `apps/cloud/src/db.ts`          |
| All tests                           | `apps/cloud/src/__tests__/*.ts` |
| Static UI pages                     | `apps/cloud/src/public/*.html`  |
| Environment config                  | `.env.example`                  |

### Android App (phone companion)

| What            | Where                                                      |
| --------------- | ---------------------------------------------------------- |
| Full app source | `/tmp/frame-art-v2/App.tsx` (single file)                  |
| Build output    | `/tmp/frame-art-v2/android/app/build/outputs/apk/release/` |
| Expo config     | `/tmp/frame-art-v2/app.json`                               |

### Shared Packages

| Package              | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `packages/core`      | Shared types, interfaces, defaults               |
| `packages/db`        | Drizzle ORM + SQLite (schema in `src/schema.ts`) |
| `packages/rendering` | Image composition, overlay pipeline              |
| `packages/providers` | Weather, market, image, quote provider adapters  |
| `packages/tv`        | Samsung Frame TV publisher abstraction           |

### Tizen TV App

| What              | Where                     |
| ----------------- | ------------------------- |
| App source        | `apps/tizen/index.html`   |
| Config (critical) | `apps/tizen/config.xml`   |
| Compiled package  | `apps/tizen/FrameArt.wgt` |

### Key Memory Files (project learnings)

These capture hard-won knowledge not derivable from code alone:

- `memory/project_art_api_validated.md` — Full Art Mode API capabilities and error codes
- `memory/project_tizen_breakthrough.md` — Why `tizen:allow-navigation` kills the app
- `memory/project_upload_challenge.md` — 9 failed approaches to upload from Tizen
- `memory/feedback_tv_pairing.md` — Samsung WebSocket pairing quirks

## What We'd Like You to Do

Please perform a thorough review of the codebase with focus on:

### 1. Robustness & Reliability

- Is the TV upload protocol (`tv-upload.ts` + App.tsx `nativeUploadToTv`) implemented safely? What happens on partial failure?
- Are there race conditions in the WebSocket/TCP handshake flow?
- Is the upload mutex in the server sufficient, or do we need client-side protection too?
- How robust is the error recovery? If the TV's art service crashes mid-upload, what should the app do?

### 2. Security

- Review the auth flow (Google OAuth → session → middleware)
- WebSocket authentication for TV and phone connections
- SSRF protection on TV IP validation
- Rate limiting adequacy
- Any exposed secrets or unsafe defaults?

### 3. Architecture

- Is the monorepo structure sound? Are package boundaries clean?
- The Android app is a single 800-line file — should it be split?
- The Studio UI is server-rendered HTML loaded in a WebView — is this the right pattern?
- Is the bidirectional WebView ↔ native bridge (`postMessage` + `injectJavaScript`) reliable?

### 4. Testing

- Are the 134 tests covering the right things? What's missing?
- The TV upload protocol has no integration test against a real TV — how would you approach this?
- Are there edge cases in the pairing flow that aren't tested?

### 5. Production Readiness

- Is the PM2 + nginx deployment sustainable, or should we go full Docker?
- Logging: is pino configured correctly for production debugging?
- Database: SQLite tables exist but some features still use in-memory state — what should be migrated?
- What monitoring/alerting would you add?

### 6. Code Quality

- Identify any dead code, unused dependencies, or inconsistencies
- Are there TypeScript `any` types that should be tightened?
- Is error handling consistent across routes?

Please propose specific changes with rationale. Prioritize by impact — what would you fix first to make this production-ready?
