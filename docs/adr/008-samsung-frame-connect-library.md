# ADR-008: Samsung Frame Connect Library for TV Publishing

## Status

Accepted

## Context

Research into Samsung Frame TV integration revealed that the SmartThings cloud API has NO art mode support. Publishing artwork to the Frame TV's art mode requires the local WebSocket API, which is reverse-engineered and not officially documented by Samsung.

Available libraries were evaluated:

- **samsung-frame-connect** (Node.js): The only Node.js library with art mode support. Provides WebSocket-based communication for uploading images to art mode.
- **samsung-tv-ws-api** (Python): The canonical reference implementation for the Samsung TV WebSocket protocol. More mature but requires Python runtime.
- **SmartThings API**: Official but lacks art mode endpoints entirely.

The option to port the WebSocket protocol directly was also considered as a future fallback if the library becomes unmaintained.

## Decision

Use samsung-frame-connect (Node.js) as the primary TV publishing library, with the option to port the WebSocket protocol directly if needed. This keeps the entire application in a single Node.js runtime without requiring a Python sidecar.

## Consequences

- Native Node.js integration. No Python runtime or subprocess management required.
- The TV and the application must be on the same subnet for WebSocket communication.
- Token-based authentication is required. On first connection, the TV displays an approval popup that the user must accept. The token is then stored for subsequent connections.
- The 2020 Samsung Frame model supports JPEG and PNG formats only, at 3840x2160 resolution, with a maximum file size of 20MB.
- The library depends on a reverse-engineered protocol, so firmware updates could break compatibility. This risk is mitigated by ADR-006 (publisher abstraction) which isolates the TV-specific code behind an interface.
- If samsung-frame-connect becomes unmaintained, the Python samsung-tv-ws-api can serve as a reference for porting the protocol or building a direct WebSocket implementation.
