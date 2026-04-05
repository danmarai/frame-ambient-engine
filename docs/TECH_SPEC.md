# Frame Ambient Engine Technical Specification

## Document Status

Draft v1.0

## Technical Intent

This document describes the recommended architecture, subsystem boundaries, data contracts, runtime model, storage strategy, implementation milestones, and repository structure for Frame Ambient Engine. It is written to support implementation by a coding agent or engineering team and to survive review by other architects.

The system should be built as a local-first web application using Next.js and TypeScript. It must keep scene logic, provider logic, rendering, and TV publishing decoupled. Local-first is a runtime constraint, not an excuse for a monolithic design.

## Architecture Overview

Version one runs on a laptop connected to the same home network as the Samsung Frame TV. The laptop hosts the web control panel, settings store, preview engine, scheduling logic, provider integrations, rendering pipeline, and TV publish adapter. This keeps the first version practical while avoiding premature dependence on a cloud-only model that may not work for this television.

The architecture must still be layered so that a future EC2-hosted control plane can reuse the same scene orchestration, rendering, and provider contracts.

The recommended top-level architecture has five major layers. The presentation layer consists of the authenticated web control panel. The application layer consists of API routes, settings management, job orchestration, and health reporting. The domain layer consists of scene spec construction, theme logic, semantic mapping, and fallback policy. The integration layer consists of provider adapters and the TV publisher. The persistence layer consists of SQLite and local artifact storage.

## Runtime and Deployment Model

The application should run locally as a Node-based Next.js service. The browser connects to the local web server. Scheduled jobs run within the same process initially, provided the design prevents overlapping generation and publish runs. Assets and metadata are stored on the laptop filesystem and in a local SQLite database.

The future migration path should allow the control panel and orchestration logic to move to EC2. That future path should not require reworking the scene contracts. The main uncertainty is TV publishing. The v2 design should consider three models: a cloud control plane with local publisher, a cloud control plane with possible direct Samsung cloud publishing if feasible, and a manual remote operator model. None of those future models should be assumed in the version one implementation.

## Recommended Stack

The core stack should be Next.js with TypeScript. React should power the control panel UI. Tailwind may be used for fast UI construction. SQLite should be used for local persistence. Local filesystem storage should be used for generated artifacts, logs, fallback assets, and last-known-good scene assets. Docker support is optional but useful.

The choice of Next.js and TypeScript is deliberate. It gives one primary codebase for UI, server-side orchestration, API routes, and future deployment flexibility. It also makes it easier to add a future live pseudo-ambient renderer if the product evolves in that direction.

## Domain Model

The system revolves around the Scene Spec. This is the core internal contract. Every generated preview or publishable output should correspond to a Scene Spec instance that records the effective settings, semantic source data, selected theme, background source, overlays, degradation state, and artifact paths. The implementation should treat the Scene Spec as the system of record for what was intended to be shown.

Settings should be persisted separately from generated scenes. Job runs should also be persisted so that health, history, and debugging can be reconstructed after the fact.

## Scene Pipeline

The generation pipeline should start by loading the current saved settings and merging any preview-specific overrides from the UI. The system should then resolve the effective location. Manual location takes precedence. If no manual location is defined, the application may use a saved browser geolocation. If none is available, an approximate IP-based fallback may be used. The final effective location should be visible in the UI.

After location resolution, the application fetches source data. In version one this includes weather, market state, and optionally a quote. Each provider adapter should return a normalized semantic form rather than raw provider payloads leaking upward into the system. Weather should resolve into concepts like sky condition, precipitation state, temperature band, and wind band. Market should resolve into direction, strength, and volatility. Quotes should resolve into a short approved display string with source metadata.

Once semantic data is available, the theme engine maps those states into a visual context. The theme decides palette drift, background prompt framing, overlay treatment, and typography rules. The background generation provider receives a structured request derived from that context. It returns a candidate image and metadata. If generation fails, the system should retry according to configuration. If it still fails, it should choose a vetted fallback background for the theme. If the render pipeline fails after that, the system should fall back to a last-known-good complete scene when available.

The render engine then produces preview and full-resolution artifacts from the Scene Spec. The preview artifact should be fast enough for interactive use. The full artifact should be publishable and should faithfully represent the selected candidate.

## Provider Adapter Model

All external dependencies must be isolated behind adapters. The weather provider should be replaceable without altering the scene logic. The market provider should be replaceable. Image generation providers must be replaceable. The quote provider must be replaceable. The TV publisher must be replaceable.

This means the system should define internal interfaces and semantic response types before implementing concrete integrations. The initial recommended weather provider is a public simple provider such as Open-Meteo. The initial market provider should also be a public or low-friction source suitable for development. Curated local quotes should be used first. Gemini and OpenAI should be supported as optional image providers behind configuration.

## Rendering Model

The render engine should be deterministic with respect to a Scene Spec. Given a Scene Spec and its associated chosen background, the renderer should consistently produce the same output. The renderer should support the base background, market overlay, weather overlay, optional weather bar, optional quote overlay, and any theme-specific accents.

The output should preserve a premium ambient aesthetic. This means the renderer should avoid dashboard cliches, harsh borders, noisy chart geometry, and excessive text. Overlays should remain subtle. The weather bar, when enabled, should feel like a restrained informational strip rather than a ticker.

The implementation may use HTML and CSS rendered to image, a canvas-based composition pipeline, or a hybrid approach. The important constraint is that preview and full assets should come from the same rendering model.

## Preview Studio Design

The preview studio is a core operator workflow. It should allow the operator to submit current settings for preview generation and receive one or more candidates. Each candidate should be stored with metadata, including generation time, theme, provider usage, source summary, and degradation status.

The preview studio should allow the operator to switch between candidates, compare them visually, and promote one to publish. It should also allow regeneration with the same settings to obtain a fresh set of candidates. If the rendering provider generated multiple backgrounds but only one passed validation, the UI should surface that the candidate set was reduced.

The preview UI should also allow the operator to compare the current live scene, the selected preview candidate, and the last-known-good scene.

## Publishing Subsystem

The TV publisher should be implemented behind an explicit interface. The interface should support testing connectivity, publishing an image, and republishing the last-known-good scene. The implementation should record publish attempts, elapsed time, errors, and success or failure state. Retry logic should be configurable.

The TV publisher is one of the least certain parts of the system, so the rest of the application must not depend on provider-specific details from that integration. Publishing should be its own bounded context.

## Health and Observability

Health must be modeled, not improvised. The application should compute overall health from subsystem health. Subsystems include providers, scheduler, generation pipeline, preview pipeline, storage, and TV publishing. Each dependency should have a latest known status, a last checked timestamp, latency where applicable, and a human-readable message.

The system should classify itself as healthy, degraded, failed, or stale. Stale means the latest successful generation or publish is too old relative to the configured cadence. Degraded means some dependency or operation is impaired but the system can still operate, usually via fallback. Failed means critical functionality is not currently working.

Job runs should be persisted. Recent failures should be visible in the UI. The operator should be able to see whether the current displayed scene was produced under degraded conditions.

## Persistence Strategy

SQLite should persist settings, generated scene records, job runs, publish history, dependency health snapshots, and optionally audit-style event rows. The filesystem should persist images, previews, logs, and generic fallback assets. Generated assets should be organized by type and date for easy cleanup and debugging.

A practical local structure includes a data directory with a database subdirectory, an artifacts directory for preview and full images, a fallbacks directory for generic safe images, a logs directory, and an exports directory for optional backups.

## Authentication and Secrets

Version one only needs single-user auth. A simple password gate backed by a secure session cookie is sufficient. The password must be stored as a hash. Secrets such as provider keys must remain server-side. The browser should never receive raw provider credentials.

## API Surface

The implementation should expose clear route families. Authentication routes should support login and logout. Settings routes should support reading and updating settings. Preview routes should support creating preview jobs and retrieving preview results. Publish routes should support publishing a selected scene, republishing last-known-good, and testing TV connectivity. Health routes should return overall status, dependency health, and job status. History routes should return scenes, publishes, and errors.

## Repository Structure

The repository should be a single private monorepo. It should contain one main web app, shared packages for core types and scene logic, packages for providers, rendering, TV publishing, health, and configuration schemas, and a docs directory for the PRD, tech spec, architecture decisions, setup notes, and milestone records.

A recommended structure is:

- apps/web for the Next.js application
- packages/core for Scene Spec types, themes, and utilities
- packages/providers for weather, market, image, and quote integrations
- packages/rendering for composition logic and templates
- packages/tv for the publisher interface and concrete adapters
- packages/health for health computation and dependency checks
- packages/config for schema and validation
- docs for architecture and setup materials
- scripts for setup, provider testing, and seeding fallback assets

## Milestones

Milestone zero should establish the repository, local app shell, auth, settings persistence, and documentation structure.

Milestone one should define the Scene Spec contract, theme definitions, and the preview studio skeleton with mocked providers.

Milestone two should integrate real weather and market adapters, manual and auto location handling, and quote loading.

Milestone three should build the image generation adapter, fallback logic, and render engine sufficient to produce previews and full-resolution scenes.

Milestone four should integrate the TV publisher, publish workflows, and publish history.

Milestone five should add the scheduler, health dashboard, dependency checks, stale and degraded state logic, and log visibility.

Milestone six should focus on hardening, documentation, backup and restore affordances, cleanup of failure handling, and end-to-end acceptance testing.

## Implementation Guidance

The coding agent should build strict contracts first. It should define settings schemas, Scene Spec types, semantic source types, job types, and provider interfaces before rushing into provider code. It should treat fallback and degradation as first-order concerns rather than late cleanup.

The UI should expose timestamps, provider identity, and degradation state. The renderer should not hide failures under silent retries. The TV publisher should be treated as unreliable until proven otherwise. The code should remain provider-agnostic wherever possible.

## Cloud Evolution Notes

A future cloud-hosted version should not assume direct TV publishing will work without a home-network participant. However, the current architecture should make it easy to move orchestration and preview generation to EC2. The publisher interface should remain portable so that later investigation can determine whether Samsung cloud-linked flows can support remote publishing on the 2020 Frame model. This uncertainty should be documented, not hand-waved away.

## Acceptance Conditions

The technical architecture will be considered sound when a clean local environment can boot the app, authenticate, save settings, generate multiple preview candidates with real signal data, render a publishable scene, publish it to the TV from the local laptop, and expose health and failure states in the operator UI.
