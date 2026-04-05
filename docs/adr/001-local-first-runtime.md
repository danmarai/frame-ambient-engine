# ADR-001: Local-First Runtime

## Status

Accepted

## Context

Version one of Frame Ambient Engine needs same-network access to the Samsung Frame TV via its local WebSocket API. Cloud hosting was explored but TV publishing requires local network presence. The Samsung Frame TV (2020 model) does not expose its art mode through the SmartThings cloud API, so the publish path must originate from the same subnet as the television. A cloud-hosted control plane would not be able to push artwork to the TV without a local relay component, which adds complexity that is premature for v1.

## Decision

V1 runs entirely on the operator's laptop. The laptop hosts the web control panel, API routes, scheduled jobs, provider integrations, rendering pipeline, SQLite database, and TV publish adapter. The browser connects to localhost.

## Consequences

- Single-machine deployment model. No multi-user support needed in v1.
- The operator must have the laptop on the same network as the TV for publishing to work.
- No cloud infrastructure costs or dependencies for v1.
- Future cloud migration requires either a local relay agent or discovery of a cloud-based art mode API.
- The architecture must still be layered cleanly so that orchestration, rendering, and provider logic can migrate to EC2 later without reworking the domain contracts.
