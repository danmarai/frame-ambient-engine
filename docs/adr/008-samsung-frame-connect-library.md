# ADR-008: Samsung Frame Connect Library for TV Publishing

## Status

Accepted

## Context

Research into Samsung Frame TV integration revealed that the SmartThings cloud API has NO art mode support. Publishing artwork to the Frame TV's art mode requires the local WebSocket API, which is reverse-engineered and not officially documented by Samsung.

Available libraries were evaluated:

- **samsung-frame-connect** v0.9.1 (Node.js, published ~Oct 2025): The only Node.js library with art mode support. Provides WebSocket-based communication for uploading images to art mode. Explicitly supports 2024 models including QN32LS03CBF.
- **samsung-tv-ws-api** (Python): The canonical reference implementation for the Samsung TV WebSocket protocol. More mature but requires Python runtime.
- **SmartThings API**: Official but lacks art mode endpoints entirely.

The option to port the WebSocket protocol directly was also considered as a future fallback if the library becomes unmaintained.

## Decision

Use samsung-frame-connect v0.9.1 (Node.js) as the primary TV publishing library, with the option to port the WebSocket protocol directly if needed. This keeps the entire application in a single Node.js runtime without requiring a Python sidecar. Our target device is the QN65LS03TAFXZA (2024 LS03T "The Frame").

## Consequences

- Native Node.js integration. No Python runtime or subprocess management required.
- The TV and the application must be on the same subnet for WebSocket communication.
- Token-based authentication is required. On first connection, the TV displays an approval popup that the user must accept. The token is stored automatically at `~/.samsung-frame-connect-*-token` for subsequent connections.
- Image requirements: 3840x2160 JPEG at quality 92, progressive encoding. Max ~20MB file size.
- The library depends on a reverse-engineered protocol, so firmware updates could break compatibility. This risk is mitigated by ADR-006 (publisher abstraction) which isolates the TV-specific code behind an interface.
- If samsung-frame-connect becomes unmaintained, the Python samsung-tv-ws-api can serve as a reference for porting the protocol or building a direct WebSocket implementation.

## Protocol Details

Confirmed through implementation and testing against the target TV (firmware T-NKMAKUC-2700.6):

- **WebSocket endpoint**: Port 8002 WSS (secure WebSocket over TLS)
- **Art mode channel**: `com.samsung.art-app` — used for all art mode commands (upload, list, set active, delete)
- **Token storage**: Automatically persisted at `~/.samsung-frame-connect-*-token` after initial TV approval
- **Binary upload flow**: JSON metadata is sent first over the WebSocket, followed by binary image data transmitted over a TLS socket
- **Supported models**: Library explicitly supports 2024 models (e.g., QN32LS03CBF). Our target QN65LS03TAFXZA (2024 LS03T) is confirmed working.

## Implementation Notes

- The library is wrapped in a `SamsungFramePublisher` class that implements the `TvPublisher` interface (see ADR-006).
- A factory function in `providers.ts` selects the real `SamsungFramePublisher` or a mock publisher based on configuration, enabling local development and testing without a physical TV.
- Target TV firmware: T-NKMAKUC-2700.6.
