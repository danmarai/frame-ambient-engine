# ADR-006: TV Publisher Abstraction

## Status

Accepted

## Context

The Samsung Frame TV WebSocket API used for art mode publishing is reverse-engineered and undocumented by Samsung. It is not part of any official SDK. Behavior varies by firmware version and model year. The SmartThings cloud API does not support art mode operations. This makes the TV publish path one of the least stable parts of the system. The rest of the application must not be contaminated by this instability.

## Decision

TV publishing is placed behind a dedicated interface and treated as an unreliable, bounded context. The publisher interface defines operations for testing connectivity, publishing an image, and republishing the last-known-good scene. The rest of the application interacts only with this interface, never with TV-specific protocol details.

## Consequences

- The publisher is a bounded context. The scene pipeline, rendering engine, and UI do not depend on TV-specific details.
- Fallback to the last-known-good scene is triggered on publish failure, keeping the TV display current even when the publish path is unreliable.
- Publish attempts, timing, errors, and success/failure states are recorded for health reporting.
- The publisher implementation can be swapped (e.g., if Samsung releases an official API, or if a different TV brand is targeted) without changes to the rest of the system.
- Retry logic is configurable and isolated within the publisher.
- Development and testing can proceed with a mock publisher that simulates success, failure, and timeout scenarios.
