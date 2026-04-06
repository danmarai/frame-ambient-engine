# ADR-009: SmartThings Cloud API as Future Integration Option

## Status

Proposed

## Context

The current implementation uses the local WebSocket API via samsung-frame-connect (ADR-008) on port 8002 to communicate with the Frame TV. This requires the server and TV to be on the same LAN. The TV publisher abstraction (ADR-006) was designed with exactly this kind of change in mind: the publisher interface isolates TV-specific protocol details so that alternative transports can be introduced without affecting the rest of the system.

Samsung offers a SmartThings cloud API that could enable remote control of the Frame TV. This ADR documents what that integration would look like, its tradeoffs, and a proposed migration path so the option is well-understood if and when it becomes viable.

### What the SmartThings Cloud API Offers

- **Remote access** to TV from anywhere, with no LAN requirement.
- **Official, documented API** with OAuth2 authentication.
- **Device management**, scene control, and some art mode operations.
- **Webhooks** for event-driven updates (power state changes, art mode transitions) instead of polling.
- **Better device discovery** via registered devices in the user's Samsung account, eliminating the need for SSDP.

### Current Limitation

As noted in ADR-008, the SmartThings cloud API currently has no art mode support. The operations required for publishing artwork to the Frame (uploading images, selecting active art, querying the art store) are only available through the local WebSocket protocol. This ADR is forward-looking: if Samsung adds art mode endpoints to the cloud API, the architecture described here would apply.

## Decision

Document SmartThings cloud integration as a future option with a dual-mode architecture. Do not implement it now. The local WebSocket API remains the sole publishing path until the SmartThings API gains art mode support or a compelling use case for remote-only control emerges.

The proposed architecture, if implemented, would be:

### Dual-Mode Operation

- **Local WebSocket** as the primary transport (low latency, no cloud dependency).
- **SmartThings cloud** as a fallback or remote-access mode.
- A settings page toggle allowing the user to choose between "Local" and "Cloud" modes.

### Implementation Shape

- A new `SmartThingsPublisher` class implementing the existing `TvPublisher` interface from ADR-006.
- OAuth2 token storage and refresh logic for SmartThings credentials.
- Webhook listener for event-driven state updates (art mode changes, power state).
- Auto-detection logic that selects the best available connection method.

### Migration Path

| Phase             | Description                                                          | Trigger                            |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Phase 1 (current) | Local WebSocket only via samsung-frame-connect                       | N/A                                |
| Phase 2           | Add SmartThings as optional cloud mode alongside local               | Samsung adds art mode to cloud API |
| Phase 3           | Auto-detect best connection method (local preferred, cloud fallback) | Both paths proven stable           |

## Consequences

### Positive

- **Remote access.** Users could control the Frame TV from outside the home network.
- **No LAN requirement.** Works across networks, enabling hosted deployment scenarios.
- **Official API.** Less likely to break with firmware updates compared to the reverse-engineered WebSocket protocol.
- **Better discovery.** Registered devices in the Samsung account eliminate SSDP discovery and its associated reliability issues.
- **Event-driven updates.** Webhooks replace polling for state changes, reducing unnecessary network traffic.
- **ADR-006 supports this.** The publisher abstraction was designed to allow exactly this kind of swap.

### Negative

- **Cloud dependency.** Requires internet connectivity and Samsung server availability. A Samsung outage would block publishing.
- **Latency.** Cloud round-trip adds latency compared to local WebSocket on the same subnet.
- **Samsung account required.** Users must have and link a Samsung account, adding setup friction.
- **Rate limits.** SmartThings API rate limiting may interfere with scheduled scene changes or rapid republishing.
- **Privacy.** Images would be uploaded through Samsung's servers rather than staying on the local network.
- **Authentication complexity.** OAuth2 flow with token refresh adds implementation and UX complexity (browser redirects, token expiry handling).
- **Feature parity unknown.** Even if Samsung adds art mode endpoints, they may not support all operations available through the local WebSocket protocol (e.g., custom matte settings, specific image format handling).
