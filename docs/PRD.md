# Frame Ambient Engine Product Requirements Document

## Document Status

Draft v1.0

## Purpose

This document defines the product requirements for Frame Ambient Engine, a local-first system that generates and publishes ambient, family-safe visual scenes to a Samsung Frame TV. The product combines live environmental signals, tasteful generative visuals, a web control panel, and a publish pipeline intended to make the television feel like a living artwork rather than a dashboard.

The primary audience for this document is implementation engineers, reviewing architects, and any agent or developer responsible for building the first working release.

## Product Summary

Frame Ambient Engine is an ambient display platform for a Samsung Frame TV. It takes a small number of external signals, such as weather and market direction, interprets them into semantic states, and renders a 4K scene that can be published to the television. The scene is intended to be beautiful first and informative second. The system must preserve the aesthetic integrity of the room while still communicating information in subtle, emotionally legible ways.

The product includes a local web control panel that allows the operator to choose themes, select signal inputs, configure weather behavior, preview generated outputs, flip through multiple generation candidates, inspect health and dependency status, and publish a chosen scene to the TV.

Version one is explicitly local-first. It will run on a laptop connected to the same home network as the television. The architecture must, however, be written in a way that preserves a path to a cloud-hosted control plane in a later version.

## Vision

The television should become an intelligent art surface. It should communicate context about the day, the market, and the mood of the outside world without becoming cluttered, literal, or ugly. The result should feel like a premium home object, not a terminal or a finance display.

## Goals

The product must generate high-resolution ambient scenes suitable for display on a Samsung Frame TV. It must allow a single operator to control the generation pipeline through a web interface. It must provide live preview before publish. It must support weather-aware and market-aware visual variation. It must support family-safe AI-generated or AI-assisted backgrounds. It must be operationally transparent, with clear health reporting and visible failure states.

The product should be extensible. New signal adapters, themes, quote sources, and rendering modules should be addable without redesigning the application core.

## Non-Goals

Version one will not attempt to support multiple user accounts, mobile apps, public sharing, enterprise-grade permissions, or a native Tizen app as the main path. It will not optimize for second-by-second updates. It will not try to expose every possible weather or financial metric. It will not treat the TV like a dashboard.

## User Profile

The primary user is a technically capable household administrator who wants direct control over the display system and values both aesthetics and reliability. This user is comfortable with configuration, API keys, and advanced settings, but does not want to spend time manually pushing artwork or debugging invisible failures.

## Core User Problems

Current TV experiences either lack programmability or are too literal and noisy. There is no elegant way to reflect weather and market conditions on a Samsung Frame TV while preserving a refined room aesthetic. Existing smart-home displays tend to look like widgets, dashboards, or signage. The user also needs confidence that the system is healthy and current, especially because scene generation involves multiple providers and an uncertain TV publish path.

## Product Principles

Frame Ambient Engine must be ambient rather than dashboard-like. It must privilege visual quality over information density. It must make health and failure visible instead of hidden. It must be previewable before publish. It must be designed as a modular system, not a one-off script. It must remain family-safe by default. It must degrade gracefully.

## Core Use Cases

The operator should be able to generate an ambient scene that reflects the current weather and a selected market indicator. The operator should be able to choose a theme such as forest, ocean, astro, sky, or cute. The operator should be able to decide whether weather should be reflected directly, inverted for emotional contrast, or disabled as a visual factor. The operator should be able to toggle an optional weather strip along the bottom of the screen and choose whether quotes are included.

The operator should be able to preview the output of those settings before publishing. Preview must support multiple candidates per generation cycle so the operator can review several outputs and choose the most suitable one. The operator should also be able to inspect system health, recent success and failure rates, dependency status, and publish history.

## Functional Requirements

### Scene Generation

The system must generate a 3840 by 2160 scene suitable for television display. It must render a theme-aware background and then optionally layer in market, weather, and quote overlays. It must support both full-resolution publish assets and lower-latency preview artifacts. It must preserve the relationship between a preview candidate and its final publishable artifact so that the operator can trust what is being previewed.

### Market Indicator

The system must support a market indicator module in version one. The operator must be able to switch between at least BTC and SPY. The indicator must support day and week modes. The market state should be represented semantically, such as direction, strength, and volatility, and then mapped into subtle visual language. The visual expression should not resemble a stock chart. It should be encoded through palette shifts, accent bands, glow, compositional tension, or theme-specific motifs.

### Weather Indicator

The system must support a configurable weather module. The operator must be able to set a manual location, while the application should also offer a sensible default based on browser geolocation or a coarse IP-based fallback. The weather target behavior must support showing today's forecast before noon and tomorrow's forecast after noon, with overrides for always-today and always-tomorrow modes.

The operator must be able to enable a bottom weather bar with compact, large, or horizontally scrolling styles. The system must support precipitation visibility and a more visual weather mode that affects the image itself rather than relying only on text or icons.

### Background Themes

Version one must ship with a set of major themes, at minimum forest, ocean, astro, sky, and cute. Each theme must define its own visual language, style constraints, overlay mapping rules, and generation prompts. Themes are not just category labels. They are behavior packages that determine how the system translates semantic weather and market state into an image.

### AI Background Generation

The system should use AI-generated family-safe backgrounds as the primary path when configured, but it must not assume generation will always succeed. It must support retries, because the publishing cadence is ambient rather than real-time critical. It must also support fallback generic backgrounds for each theme and maintain a last-known-good rendered scene that can be republished if generation or publishing fails repeatedly.

The product must support provider adapters so image generation can be backed by Gemini, OpenAI, or future providers without polluting the application core. The system must preserve generation metadata and health status so operators know which provider was used and whether degradation occurred.

### Integrated Weather Modes

The system must support weather integration modes. In reflect mode, the scene should visually echo the real weather. In invert mode, the scene should deliberately contrast the real weather, such as showing a sunny visual motif during a cloudy day. In accent-only mode, the scene should stay mostly generic while allowing small weather-driven accents. In off mode, weather should only appear in the informational layer if enabled.

### Motivational Quotes

The system must support optional motivational quotes for children and family use. Quotes must be short, safe, and readable. Curated quotes should be supported from local content in version one. Generated quotes may be supported behind a provider adapter, but moderation and style constraints are required. The operator must be able to disable quotes entirely.

### Preview Studio

Preview is a first-class feature. The web control panel must allow the operator to generate and inspect multiple candidate scenes before publish. Preview must update when settings are changed. The operator must be able to request multiple candidate generations using the same settings and then flip through the results. The preview UI must clearly show timestamps, theme, source data summary, and whether any fallback or degraded path was used.

### Publishing

The system must support manual and scheduled publishing. Version one assumes local publishing from a laptop on the same home network as the Samsung Frame TV. The operator must be able to publish a selected candidate, republish the last-known-good scene, or fall back to a generic scene if needed. Publish actions must surface success, failure, and retry state visibly.

### Control Panel

The control panel must include a main dashboard, a preview studio, a health page, a settings page, and a history or logs page. Settings must be editable through the interface. Secrets must remain server-side. The UI must feel like an operator console for a premium ambient system, not a debugging page stitched together from raw logs.

### Health and Observability

The system must provide explicit visibility into health. The operator must be able to see overall system status, last successful generation time, last successful publish time, provider health, current queue or job state, recent failures, and whether the system is operating in fallback or stale mode. This is a core product feature, not an implementation detail.

### Scheduler

Version one should default to an Active cadence. The intended default is a scene refresh every fifteen minutes, subject to retry logic. The operator must be able to trigger manual refresh or manual publish outside the scheduler.

## Non-Functional Requirements

The application should be maintainable, modular, and explicit in its contracts. It should be fast enough to generate previews interactively. It should degrade gracefully when providers fail. It should be safe for family use. It should be structured to allow migration from local-first execution to a later cloud-oriented architecture.

## Risks

The biggest technical risk is the TV publish path. Samsung Frame behavior may vary by model year and firmware. Therefore the publish mechanism must be encapsulated behind a dedicated adapter and treated as a replaceable integration. Another major risk is inconsistent visual quality from image generation providers. That risk should be reduced with prompt templates, multiple candidate generation, and fallback assets.

## Future Direction

A later version may host the control plane on EC2 while preserving a local publish path. Another later track may investigate whether true cloud-only publishing is feasible without a home-network relay. Additional future signals may include AQI, calendar data, moon phase, sports, holidays, and world-event awareness. A future version may also introduce a pseudo-ambient live mode rendered as a web app.

## Acceptance Criteria

The first working version will be considered successful when the operator can configure weather and market behavior, preview multiple candidates, choose a final scene, publish it to the TV from a local laptop, observe health status across providers and jobs, and recover gracefully when failures occur.
