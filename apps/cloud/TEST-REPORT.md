# Frame Art Cloud Server -- Test & Security Audit Report

**Date:** 2026-04-11
**Auditor:** Systems test review (Tizen/Samsung TV expert perspective)
**Scope:** `/apps/cloud/src/` -- server.ts, tv-upload.ts, tv-storage.ts, pairing.ts, tv-connections.ts, auth.ts, generation.ts

---

## 1. Test Coverage Summary

**67 unit and integration tests** across 5 test files, all passing.

| File                     | Tests | Coverage Area                                                  |
| ------------------------ | ----- | -------------------------------------------------------------- |
| `pairing.test.ts`        | 16    | Code generation, validation, claiming, expiry, edge cases      |
| `tv-connections.test.ts` | 12    | Registration, removal, message routing, IP lookup              |
| `auth.test.ts`           | 12    | Session creation, middleware (optional/required), security     |
| `tv-storage.test.ts`     | 7     | Capacity math, FIFO deletion, concurrency documentation        |
| `integration.test.ts`    | 20    | Full pairing flow, multi-TV, disconnect recovery, DHCP changes |

---

## 2. Bugs Found and Fixed

### BUG-1: CRITICAL -- `withArtConnection` listens for wrong event (tv-storage.ts:46)

**Impact:** `initTvState` and `makeRoom` never execute their callbacks. The storage management system is completely non-functional against real TVs.

**Root cause:** The code listened for `ms.channel.ready` but Samsung Frame TVs send `ms.channel.connect` on WebSocket connection establishment. This was confirmed in tv-upload.ts which correctly uses `ms.channel.connect`.

**Fix:** Changed `ms.channel.ready` to `ms.channel.connect`.

### BUG-2: HIGH -- `makeRoom` calls `deleteNext()` on every d2d message (tv-storage.ts:199)

**Impact:** Any non-`image_deleted` d2d message (errors, status updates) would advance the deletion index, causing images to be skipped or deletion requests to be sent before the previous one completes.

**Fix:** `deleteNext()` is now called only after `image_deleted` or `error` events, not on every `d2d_service_message`.

### BUG-3: HIGH -- TCP socket errors in `uploadToTv` don't resolve the promise (tv-upload.ts:132)

**Impact:** If the TCP d2d socket connection fails (network issue, TV drops connection), the upload hangs for the full 30-second timeout instead of failing immediately. Worse, since the art mode service crashes on incomplete uploads, the caller has no signal to warn the user.

**Fix:** The TCP `error` handler now calls `clearTimeout`, closes the WebSocket, and resolves with a failure result including the crash warning.

### BUG-4: MEDIUM -- `handleStorageFull` deletion math is compounding (tv-storage.ts:241)

**Impact:** The function intends to delete half the images, but it reduces `maxImages` first, then passes `deleteCount` (half of current images) as the `count` parameter to `makeRoom`. Since `makeRoom` calculates `spaceNeeded = ourImages.length + count - maxImages`, the actual deletions are `ourImages.length/2 + ourImages.length - maxImages`, which is much more than half. Example: 20 images at max 20, reduced to max 14, tries to delete 16 of 20 (80%) instead of 10.

**Fix:** Recalculated `roomCount` so that `makeRoom` produces exactly `ceil(ourImages.length / 2)` deletions.

### BUG-5: MEDIUM -- Path traversal in `loadImage` (generation.ts:184)

**Impact:** A `sceneId` like `../../etc/passwd` resolves to a file outside the data directory. The `/api/images/:sceneId` endpoint could read arbitrary files on the server.

**Fix:** Added UUID format validation (`/^[a-f0-9-]{36}$/`) before constructing the file path.

### BUG-6: MEDIUM -- `/api/upload-file` accepts arbitrary file paths (server.ts:487)

**Impact:** In production, any client could read any file on the server filesystem by sending it to this endpoint (the file contents go to the TV, but error messages leak path information).

**Fix:** Added `NODE_ENV === "production"` guard that returns 403.

---

## 3. Samsung/Tizen Edge Cases Analysis

### 3.1 Phone-as-Bridge Reliability

| Scenario                                           | Risk                                                                         | Mitigation                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone disconnects mid-upload                       | **HIGH** -- art mode service crashes if d2d TCP upload is incomplete         | Must complete or abort d2d transfer atomically. Add TCP socket timeout with explicit close. Consider a "cancel_send_image" if the API supports it (untested).     |
| TV goes to standby during upload                   | **MEDIUM** -- WebSocket closes, TCP socket may hang                          | Upload timeout (30s) handles this. But art mode service state is unknown on wake. Need `initTvState` on reconnect.                                                |
| WiFi network changes (phone roams to different AP) | **HIGH** -- TCP socket to TV drops, WebSocket to cloud drops                 | Phone app needs reconnection logic with exponential backoff. Must re-pair if TV IP changes.                                                                       |
| Phone app backgrounded (iOS Safari)                | **HIGH** -- iOS kills WebSocket connections in ~30 seconds when backgrounded | Cannot rely on persistent phone WebSocket for upload bridge. Need either: (a) complete upload in foreground before backgrounding, or (b) cloud-to-TV direct path. |
| Phone battery saver mode                           | **MEDIUM** -- periodic sync timers may not fire                              | Use push notifications to wake phone when new art is ready, not polling.                                                                                          |

### 3.2 Art Mode Service Crashes

| Scenario                                          | Risk                                                                                           | Mitigation                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Incomplete `send_image` (d2d upload not finished) | **CRITICAL** -- art mode service crashes, requires TV restart                                  | FIXED: TCP error handler now resolves immediately. But the root cause (TV firmware bug) cannot be fixed. Must ensure uploads are atomic.         |
| Rapid sequential uploads                          | **HIGH** -- if a second `send_image` arrives before the first completes, the service may crash | Add a per-TV upload mutex. Never allow concurrent uploads to the same TV.                                                                        |
| Service not started (TV never entered Art Mode)   | **MEDIUM** -- all API calls return nothing                                                     | Detect this condition in `initTvState` (timeout with no response) and prompt user to "open Art Mode once from the TV remote."                    |
| Upload to TV with TV app in foreground            | **BLOCKED** -- 2020 firmware ignores `send_image` from foreground Tizen apps                   | Architecture correctly routes uploads through external path (cloud server on LAN or phone bridge). No fix possible for this firmware limitation. |

### 3.3 Token/Auth Lifecycle

| Scenario                  | Risk       | Current Behavior                                                                 | Recommendation                                                                                            |
| ------------------------- | ---------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| TV restarts               | **LOW**    | TV trusts by IP/MAC after initial approval. Old/empty tokens work.               | No action needed. This is well-handled by Samsung firmware.                                               |
| Phone restarts            | **MEDIUM** | Phone WebSocket drops, session is in-memory only, lost on server restart         | Persist pairing sessions to database. Phone app should cache tvId/tvIp locally and re-pair automatically. |
| Server restarts           | **HIGH**   | ALL state lost: pairings, connections, storage tracking, auth sessions, feedback | Move to SQLite or Postgres. At minimum, persist: pairing sessions, TV storage state, user sessions.       |
| Google OAuth token expiry | **LOW**    | Token is verified once at sign-in; session ID is used thereafter                 | Sessions never expire (see issue below). Add TTL-based session expiry.                                    |
| Session ID brute-force    | **LOW**    | Session IDs use `Math.random()` which is not cryptographically secure            | Use `crypto.randomUUID()` for session IDs.                                                                |

### 3.4 Storage Management

| Scenario                                              | Risk                                                                                                                 | Mitigation                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent uploads (two phones, same TV)              | **HIGH** -- race condition in `makeRoom` (both read same state, both skip deletion, both upload, hit storage full)   | Add a per-TV semaphore/mutex for upload operations. Only one upload per TV at a time.                                                        |
| Error -11 recovery loop                               | **MEDIUM** -- `handleStorageFull` reduces maxImages each time; after multiple -11 errors, maxImages bottoms out at 5 | FIXED: deletion math corrected. But still need a "re-scan" mechanism to reset maxImages when the user manually deletes images via TV remote. |
| TV storage consumed by other apps (Samsung Art Store) | **MEDIUM** -- we track only "our" images but the 8GB is shared with Samsung's own art content                        | `initTvState` should also count Samsung Art Store images and factor total storage usage.                                                     |
| Content ID tracking drift                             | **MEDIUM** -- if user deletes images via TV remote, our `ourImages` array is stale                                   | Periodically re-sync with `get_content_list` (e.g., every hour or on each upload).                                                           |
| Flash wear from constant write/delete cycles          | **LOW** -- 8GB flash, writing ~600KB per image                                                                       | At 4 images/hour (15-min interval), that's ~58MB/day. Flash should handle years of this, but worth monitoring.                               |

### 3.5 Router Compatibility

| Router                          | wss://TV:8002      | ws://TV:8001              | sdb (26101) | d2d TCP              |
| ------------------------------- | ------------------ | ------------------------- | ----------- | -------------------- |
| Google Nest/WiFi                | Works              | UNTESTED                  | BLOCKED     | UNTESTED (critical!) |
| Standard consumer routers       | Works              | Works                     | Works       | Works                |
| Mesh networks (Eero, Orbi)      | Likely works (TLS) | Risky (non-standard port) | Risky       | UNKNOWN              |
| AP isolation enabled            | BLOCKED            | BLOCKED                   | BLOCKED     | BLOCKED              |
| Double-NAT (ISP modem + router) | Works (LAN only)   | Works (LAN only)          | N/A         | Works (LAN only)     |

**Critical untested scenario:** The d2d TCP upload uses a random high port chosen by the TV. On Google Nest routers, if non-standard TCP connections between LAN devices are blocked (as confirmed with sdb), the d2d TCP upload may also be blocked. This would mean **uploads are impossible on Google Nest routers even from the cloud server**, because the cloud server connects to the TV's WebSocket but the TCP data transfer happens on a different port.

**Recommendation:** Test d2d TCP upload from a device on a Google Nest network immediately. If blocked, the fallback is DLNA (which was confirmed working on 2020 models in earlier testing).

### 3.6 Multi-TV Scenarios

| Scenario                                             | Current Behavior                                              | Issue                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| User has 2 TVs, same model                           | Each gets its own tvId (based on MAC), own pairing code       | Works correctly                                                                 |
| User has 2 TVs, different models (e.g., 2020 + 2022) | Different capabilities (background service on 2022)           | Need per-TV capability detection in `initTvState`                               |
| One phone controlling 2 TVs                          | Phone can only be paired to one TV at a time (pairing is 1:1) | Need to support multiple pairings per phone session                             |
| Same art on multiple TVs                             | Must upload separately to each TV                             | Add "broadcast to all TVs" option in the API                                    |
| TVs on different networks (vacation home)            | Cannot upload -- d2d TCP requires same LAN                    | Need a cloud-mediated upload path (TV pulls from cloud URL instead of d2d push) |

---

## 4. Additional Security Issues

1. **CORS is wide open** (`app.use(cors())`) -- should restrict to known origins in production.
2. **No rate limiting** on any endpoint -- `/api/generate` calls OpenAI which costs money; an attacker could run up the bill.
3. **No input validation** on device scan IP (`/api/devices/scan`) -- could be used for SSRF (server fetches from attacker-controlled URL via `fetch(http://${tvIp}:8001/...)`).
4. **Feedback store grows unbounded** in memory -- no pagination, no cleanup.
5. **Device registry is unauthenticated** -- anyone can scan and register devices.
6. **WebSocket connections are unauthenticated** -- any client can connect to `/ws/tv` and register as any tvId, intercepting messages.

---

## 5. Recommended Priority Fixes

### P0 (Before any real users)

- [x] Fix `withArtConnection` event name (BUG-1) -- **DONE**
- [x] Fix TCP error handling in upload (BUG-3) -- **DONE**
- [x] Fix path traversal in loadImage (BUG-5) -- **DONE**
- [ ] Add per-TV upload mutex to prevent concurrent uploads crashing art mode service
- [ ] Test d2d TCP upload through Google Nest router

### P1 (Before GA)

- [x] Fix `makeRoom` deletion logic (BUG-2) -- **DONE**
- [x] Fix `handleStorageFull` math (BUG-4) -- **DONE**
- [x] Disable `/api/upload-file` in production (BUG-6) -- **DONE**
- [ ] Persist critical state to database (pairings, storage state, sessions)
- [ ] Add session expiry (TTL)
- [ ] Use `crypto.randomUUID()` for session IDs instead of `Math.random()`
- [ ] Periodic storage re-sync with `get_content_list`
- [ ] Restrict CORS origins
- [ ] Add rate limiting to `/api/generate`
- [ ] Validate tvIp format in `/api/devices/scan` to prevent SSRF

### P2 (Quality of life)

- [ ] Add WebSocket authentication (token in connection URL or first message)
- [ ] Support multi-TV per phone session
- [ ] Add "broadcast to all TVs" upload option
- [ ] Implement WebSocket reconnection with exponential backoff in TV/phone clients
- [ ] Add health check endpoint that verifies TV connectivity
- [ ] Paginate and limit feedback store

---

## 6. Manual Test Plan (requires real TV)

These scenarios cannot be automated and must be tested manually with a Samsung Frame TV:

1. **Happy path upload:** Generate image -> upload -> verify on TV screen
2. **Storage full recovery:** Fill TV storage -> verify error -11 -> verify cleanup and retry works
3. **TV standby during upload:** Start upload, put TV to standby mid-transfer -> verify timeout and error message
4. **Art mode service crash recovery:** Intentionally cause incomplete upload -> verify server detects failure -> verify TV restart recovers
5. **DHCP lease renewal:** Change TV IP via router -> verify reconnection and new pairing code
6. **Pairing code expiry:** Wait 1 hour -> verify code is rejected -> verify new code works
7. **Google Nest d2d TCP:** Test full upload flow from a machine on Google Nest network -> verify d2d TCP socket works (or document failure)
8. **Multi-TV:** Pair two TVs -> upload to each -> verify independent operation
9. **Server restart:** Restart cloud server -> verify TV and phone reconnect and re-pair
10. **Art mode not started:** Cold boot TV (never opened Art Mode) -> attempt upload -> verify graceful error message
