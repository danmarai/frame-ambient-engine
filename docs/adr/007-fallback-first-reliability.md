# ADR-007: Fallback-First Reliability

## Status

Accepted

## Context

The system depends on multiple external providers (weather API, market API, image generation API, TV publishing), each of which can fail independently and without warning. In an ambient display system, silent failure is worse than visible degradation. The operator needs to know when something is wrong, and the TV should continue displaying reasonable content even when parts of the pipeline are broken.

## Decision

Fallback and degradation are first-class concerns, not afterthoughts. Every provider has a mock or fallback implementation. The system classifies its overall state as healthy, degraded, failed, or stale. The UI surfaces degradation state explicitly.

## Consequences

- Every provider adapter must have a corresponding fallback or mock that can be activated when the primary provider fails.
- The scene pipeline uses a tiered fallback strategy: retry the provider, then use a fallback provider, then use a generic theme-specific fallback background, then republish the last-known-good scene.
- The system health model computes an aggregate status from all subsystem statuses. Degraded means some functionality is impaired but the system is still operational via fallbacks.
- Stale means the latest successful output is older than the configured refresh cadence.
- The UI shows whether the current scene was produced under degraded conditions, including which providers were unavailable.
- More upfront implementation work to build fallback paths for each provider, but significantly better operational reliability and operator confidence.
