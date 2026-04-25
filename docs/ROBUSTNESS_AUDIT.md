# Frame Art Robustness Audit

Date: 2026-04-25

## Scope

This audit reviewed the Frame Art repo with emphasis on the TV upload path, cloud/mobile pairing and authentication, SSRF exposure, production readiness, and test gaps. The review was based on `AUDITOR_PROMPT.md` plus the checked-in code under:

- `apps/cloud/src/tv-upload.ts`
- `apps/cloud/src/routes/*.ts`
- `apps/cloud/src/auth.ts`
- `apps/cloud/src/pairing.ts`
- `apps/cloud/src/server.ts`
- `apps/mobile/src/tv-bridge.ts`
- `apps/mobile/src/cloud-sync.ts`
- `apps/mobile/app/index.tsx`
- `apps/web/src/app/api/*`
- `packages/tv/src/*`

Note: `/tmp/frame-art-v2/App.tsx` was not present on this machine, so the mobile review used the checked-in `apps/mobile` implementation.

## Executive Summary

The most important reliability problem is still the phone-to-TV upload flow. The code sends `send_image` before it has a robust local lock, health gate, TCP failure propagation path, or crash recovery policy. Given the known behavior that partial uploads can restart the TV art service, this should be treated as a state-machine and circuit-breaker problem, not just a timeout problem.

The most important security problem is that several cloud endpoints can trigger local network activity without strong authentication, ownership checks, or strict target validation. The current `isValidTvIp` allows loopback and link-local addresses, and `/api/upload` fetches arbitrary `imageUrl`.

The most important architecture problem is that the repo currently contains two overlapping application stacks: the Express cloud prototype and the newer Next monorepo application. They duplicate concepts like settings, scenes, TV publishing, discovery, auth, and database bootstrapping. Hardening one path will not necessarily harden the other.

## Priority Findings

### P0: Make Phone Upload a Serialized State Machine

`apps/mobile/src/tv-bridge.ts` starts upload from `ready_to_use`, but `doTcpUpload` cannot reject the parent upload promise. A TCP error only logs, leaving the caller waiting for timeout while the TV art service may already be wedged.

Required changes:

- Add a per-TV client-side mutex so only one upload can run to a TV from the phone at a time.
- Convert `doTcpUpload` to return a promise with explicit success/failure.
- Track phases: `connecting_ws`, `requesting_send_image`, `waiting_ready_to_use`, `uploading_tcp`, `waiting_image_added`, `activating`, `complete`, `failed`.
- Resolve success only after the TCP socket has closed cleanly and the TV has emitted `image_added`.
- Reject on TCP `error`, premature `close`, invalid `ready_to_use`, invalid `conn_info`, or upload timeout.
- Add socket-level timeouts and cleanup for both WebSocket and TCP sockets.
- Include request ids in logs and results.

Acceptance criteria:

- A TCP error returns a failed upload result immediately.
- A TCP close before all bytes are written returns failure.
- `image_added` before TCP completion does not produce success.
- Concurrent uploads to the same TV are serialized or rejected.
- Concurrent uploads to different TVs still work.

### P0: Gate `send_image` Behind Health, Exclusivity, and Cooldown

Both cloud and mobile upload paths send `send_image` after fixed timers. Given the crash behavior, this is too optimistic.

Required changes:

- Before `send_image`, run a lightweight art service health check.
- Acquire upload lock before sending any Art Mode upload command.
- Add a per-TV circuit breaker after TCP failure, WebSocket timeout, or suspected art service crash.
- During the cooldown, reject new uploads with a clear recoverable status such as `tv_art_service_recovering`.
- Add one controlled retry only for explicitly recoverable errors, such as storage full after cleanup. Do not retry immediately after partial TCP failure.

Acceptance criteria:

- Failed partial uploads block additional attempts for a configured cooldown.
- UI receives a specific recovery message instead of a generic timeout.
- Logs show phase, failure class, cooldown expiration, and whether retry is allowed.

### P0: Lock Down Cloud Upload and TV Control Endpoints

Several cloud routes can trigger TV/network operations without sufficient auth or ownership checks:

- `/api/upload`
- `/api/tv/control`
- `/api/tv/init`
- `/api/set-display`
- `/api/cycle`
- `/api/generate` with `tvIp` or `tvId`

`/api/upload` also fetches arbitrary `imageUrl`.

Required changes:

- Require authentication for TV-control and upload routes in production.
- Verify the requested TV belongs to the authenticated user.
- Do not accept arbitrary `tvIp` from clients unless it is being paired or explicitly verified.
- For image upload, prefer scene ids or signed internal image URLs over arbitrary external URLs.
- If remote image fetch remains, enforce allowlist, content-type checks, byte caps, redirect limits, and request timeout.
- Validate `tvIp` in `/api/generate` before auto-upload.

Acceptance criteria:

- Anonymous requests cannot trigger cloud-side TV upload/control.
- Authenticated users cannot control another user’s TV.
- Arbitrary `imageUrl` fetch cannot reach internal services.
- Tests cover forbidden public IPs, loopback, link-local, ownership failure, and oversized image fetch.

### P0: Fix SSRF IP Validation

`apps/cloud/src/middleware.ts` accepts `127.0.0.0/8` and `169.254.0.0/16`. For a cloud server, these are unsafe. Loopback can target services on the host. Link-local can expose metadata-style networks or local infrastructure.

Required changes:

- In production, allow only RFC1918 ranges: `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`.
- Consider also requiring that TV IPs come from a persisted paired device record or a phone-discovered candidate.
- Keep loopback available only in explicit local development/test mode.

Acceptance criteria:

- `127.0.0.1` and `169.254.169.254` are rejected in production tests.
- Existing local tests can opt into dev behavior without weakening production behavior.

### P0: Fix Phone WebSocket Authentication Contract

The server production upgrade path expects `/ws/phone?token=...`, but the mobile client connects to `/ws/phone` and sends `{ type: "auth", sessionId }` after open. The server does not handle that message.

Required changes:

- Choose one protocol:
  - Pass the auth session in the WebSocket URL, or
  - Accept a first-message auth handshake before registering the phone connection.
- Bind the WebSocket connection to the authenticated user/session.
- Do not create an unrelated random phone session id for production identity.
- Use that identity when claiming pairing codes and routing upload requests.

Acceptance criteria:

- Production phone WebSocket connects successfully with a valid session.
- Invalid or missing session is rejected.
- Pairing and upload routing are tied to authenticated user/device ownership.

### P1: Persist Pairing and Tie It to Users

Pairing sessions live in a module-level `Map`. Server restart loses active pairings, and claimed codes are tied only to phone session strings, not users.

Required changes:

- Store pairing codes and claimed sessions in SQLite.
- Add `user_id`, `tv_id`, `phone_session_id`, `created_at`, `expires_at`, `claimed_at`, and `revoked_at`.
- Shorten unclaimed pairing code TTL.
- Enforce one active pairing per TV/user where appropriate.
- Persist TV IP changes as last-seen metadata rather than trusting arbitrary client input.

Acceptance criteria:

- Pairing survives server restart.
- Expired codes cannot be claimed.
- A code cannot be claimed twice.
- Claimed pairings are associated with a user.

### P1: Stop Logging and Storing Sensitive Tokens

The upload path logs TV tokens. Auth sessions store Google ID tokens and `getSession` returns them internally.

Required changes:

- Remove TV token logging.
- Do not persist Google ID tokens unless a concrete refresh/use case needs them.
- Split internal auth records from public session user data.
- Redact token-like values in structured logs.

Acceptance criteria:

- No TV token or Google token appears in application logs.
- Session accessors used by routes cannot accidentally return Google ID tokens to clients.

### P1: Track Upload and Activation Separately

The Next publish route marks a scene as `published` after upload, even if setting active art fails.

Required changes:

- Introduce explicit states such as `upload_failed`, `uploaded`, `activation_failed`, and `published`.
- Record upload content id even if activation fails.
- Let the UI retry activation without re-uploading.

Acceptance criteria:

- Failed activation is visible as a distinct state.
- Publish history records both upload and activation outcome.

### P1: Choose the Production Application Surface

The repo contains both the Express cloud prototype and a newer Next monorepo application. They overlap in auth, settings, scene generation, TV publish, discovery, and DB setup.

Required changes:

- Decide whether production traffic should run through Express or Next.
- Mark the other stack as legacy/dev, or remove duplicated endpoints.
- Centralize TV upload/publish policy in one package or service boundary.
- Ensure auth, SSRF validation, logging, and circuit breaker behavior are shared.

Acceptance criteria:

- There is one documented production entry point.
- Security fixes apply to all production routes.
- Tests run against the production path.

### P1: Wire the Mobile WebView Bridge Safely

The checked-in mobile app loads the Studio WebView but does not wire `onMessage`, command validation, or calls into the native upload bridge. It also uses `originWhitelist={["*"]}` and `mixedContentMode="always"`.

Required changes:

- Add an explicit WebView message schema.
- Check origin/source before accepting bridge commands.
- Require request ids and return structured progress/result messages.
- Reject unknown commands and invalid payloads.
- Remove wildcard origin and mixed-content allowance unless strictly needed.

Acceptance criteria:

- Studio can request upload through native bridge.
- Native bridge rejects malformed or cross-origin commands.
- Upload progress and final status are delivered back to the WebView.

### P2: Bound Discovery Concurrency

Next discovery probes 254 IPs concurrently. This is expensive and noisy, especially on cloud-hosted deployments.

Required changes:

- Prefer SSDP and known-IP probe first.
- Add bounded concurrency for subnet scan.
- Add total scan timeout.
- Consider making subnet scan phone-only/local-only.

Acceptance criteria:

- Discovery cannot create 254 simultaneous outbound requests.
- Cloud deployment can disable subnet scanning.

### P2: Expand Tests Around Crash-Class Behavior

Current tests cover happy protocol mocks, serialization, and basic error cases. Missing tests are concentrated around partial TCP failure and auth/security boundaries.

Required test additions:

- Mobile bridge unit tests for TCP error, premature close, invalid `conn_info`, timeout, and duplicate events.
- Cloud `tv-upload` tests for malformed nested JSON and invalid d2d fields.
- Fake Samsung TV harness that can:
  - Accept WebSocket.
  - Emit `ready_to_use`.
  - Accept TCP header/data.
  - Close mid-stream.
  - Omit or delay `image_added`.
  - Emit art mode errors.
- Auth/ownership tests for all TV-control endpoints.
- SSRF tests for loopback, link-local, public IP, DNS redirects, and oversized image bodies.

## Recommended Fix Order

1. Harden mobile upload: promise-based TCP, per-TV mutex, health gate, circuit breaker, progress/error reporting.
2. Lock down cloud endpoints: auth, ownership checks, strict TV IP validation, no arbitrary image fetches.
3. Fix phone WebSocket auth and make pairing persistent/user-bound.
4. Decide the production app surface and remove or gate duplicate legacy routes.
5. Add the fake-TV integration harness and regression tests for partial TCP failure.
6. Improve operations: upload attempt records, phase-level logs, circuit-breaker metrics, repeated-failure alerts, dashboard-visible last failure reason.

## Engineer Handoff Prompt

Use this prompt with the implementation engineer:

```text
You are hardening the Frame Art Samsung Frame TV upload path. Read docs/ROBUSTNESS_AUDIT.md, AUDITOR_PROMPT.md, apps/cloud/src/tv-upload.ts, apps/mobile/src/tv-bridge.ts, apps/mobile/src/cloud-sync.ts, apps/mobile/app/index.tsx, apps/cloud/src/routes/tv-control.ts, apps/cloud/src/routes/generation.ts, apps/cloud/src/server.ts, apps/cloud/src/auth.ts, apps/cloud/src/pairing.ts, and apps/cloud/src/middleware.ts before editing.

Primary goal: make the phone-to-TV upload flow robust against partial TCP failure and prevent any route from triggering unsafe unauthenticated local-network activity.

Implement in this order:

1. Mobile upload robustness:
   - Convert apps/mobile/src/tv-bridge.ts into an explicit per-TV upload state machine.
   - Add a per-TV mutex.
   - Make TCP upload return a promise and propagate TCP error/close/timeout to the upload result.
   - Resolve success only after TCP has closed cleanly and image_added is received.
   - Add health check before send_image and a per-TV circuit breaker after crash-class failures.
   - Return structured errors and progress phases.

2. Mobile WebView bridge:
   - Wire apps/mobile/app/index.tsx to call the native upload bridge through a typed onMessage protocol.
   - Validate message origin/payload/command.
   - Send progress and final result back to the WebView with request ids.
   - Remove wildcard/mixed-content allowances unless strictly required and documented.

3. Cloud security hardening:
   - Require auth and TV ownership checks for TV upload/control routes.
   - Fix /ws/phone auth contract so mobile can connect in production and the server binds it to the authenticated user/session.
   - Tighten isValidTvIp so production rejects loopback and link-local addresses.
   - Remove arbitrary imageUrl fetch from /api/upload or restrict it to signed/internal URLs with byte caps, content-type checks, redirect limits, and timeouts.
   - Validate explicit tvIp usage in /api/generate.

4. Pairing/session persistence:
   - Move pairing code/session state from in-memory Map to SQLite.
   - Tie claimed pairings to authenticated users and persisted TV devices.

5. Tests:
   - Add regression tests for TCP error, premature close, invalid ready_to_use/conn_info, image_added before TCP completion, concurrent same-TV upload, circuit breaker cooldown, phone WS auth, route auth/ownership, and SSRF IP rejection.
   - Add or scaffold a fake Samsung TV harness that can simulate WebSocket + d2d TCP flows and partial upload failure.

Constraints:
   - Preserve existing Samsung protocol details unless a test or documented memory file proves a change is safe.
   - Do not immediately retry after partial TCP failure.
   - Do not log TV tokens, Google tokens, or session tokens.
   - Keep changes scoped and add tests for every new failure mode.

Definition of done:
   - Same-TV uploads are serialized client-side and server-side.
   - TCP failures fail fast, trigger cooldown, and do not leave callers waiting for generic timeout.
   - Anonymous or cross-user requests cannot control/upload to TVs.
   - Production IP validation rejects loopback/link-local/public IPs.
   - Phone WebSocket auth works with the mobile client.
   - Tests cover the crash-class upload failures and security boundaries above.
```

## Open Inputs Needed

To finish implementation cleanly, the engineer should confirm:

- Which stack is the production path today: Express cloud, Next web app, or both?
- Where the real Android app source lives now. The prompt referenced `/tmp/frame-art-v2/App.tsx`, but it was not present during audit.
- Whether the phone is intended to be the only production upload bridge, or whether cloud-side direct TV upload should remain enabled for LAN/self-hosted deployments.
- What authentication model should apply to the Tizen TV app: shared `WS_TV_API_KEY`, per-device credential, or pairing-code-only bootstrap?
- Whether arbitrary external image URLs are a product requirement. If not, remove that capability.
- Expected UX after art service crash: cooldown duration, retry copy, and whether the user should be instructed to restart TV art mode or the TV.
