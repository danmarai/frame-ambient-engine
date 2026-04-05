# Starter Prompt for an Implementation Agent

You are the lead implementation engineer for a project called Frame Ambient Engine. Your job is to build the first working version of a local-first ambient image generation and publishing system for a Samsung Frame TV.

You are not building a dashboard. You are building a premium ambient art system that subtly reflects weather and market context and is controlled through a local web operator console.

Before you begin coding, read the repository documentation, especially the PRD and the Tech Spec. Treat those documents as authoritative. If implementation details are missing, make reasonable choices that preserve the architecture rather than inventing a conflicting design.

## Product Summary

The product is a local-first web application that runs on a laptop on the same network as a 2020 Samsung Frame TV. It generates family-safe, theme-driven 4K ambient scenes using live weather and market inputs. It supports previewing multiple candidates, selecting one, and publishing it to the TV. It also exposes a health and status console so the operator can understand whether generation and publishing are healthy, stale, degraded, or failed.

## Stack Requirements

Use Next.js and TypeScript as the primary stack. Keep the code strongly typed. Use SQLite for local persistence. Use local filesystem storage for preview and full image artifacts, generic fallback assets, and logs. Keep secrets on the server side.

## Architectural Rules

Treat the Scene Spec as the central domain contract. Do not let provider-specific response shapes leak into the UI or core scene logic. Put all external integrations behind adapters. Keep rendering logic isolated from provider logic. Keep TV publishing behind a publisher interface. Treat health and fallback as first-class concerns.

Do not hardcode assumptions about one image generation provider or one TV publish mechanism into the app core. Assume that parts of the system may fail and design around that visibly.

## Functional Scope for Version One

The app must support a password-gated local control panel, weather configuration including manual location and a reasonable auto-detected default, market indicator selection with at least BTC and SPY, theme selection with at least forest, ocean, astro, sky, and cute, optional quotes, preview generation with multiple candidate outputs, TV publishing, a health dashboard, and scheduled refresh at an active cadence.

## Reliability Rules

If generation fails, retry according to configuration. If retries fail, use a generic fallback background. If rendering or publishing fails beyond that, use the last-known-good scene where possible. Never fail silently. Surface degraded operation in the UI.

## UI Rules

Make the UI operator-friendly and explicit. The preview studio must show candidate outputs and relevant metadata. The health page must show provider status, last generation time, last publish time, recent errors, and stale or degraded state. The settings page must allow operator control without exposing secrets to the browser.

## Build Order

Start by scaffolding the app, auth gate, settings persistence, and documentation visibility. Then define core types and schemas, especially the Scene Spec and settings schema. Next, build preview generation using mocked providers so the UI and orchestration path can be exercised before external dependencies are added. Then integrate weather and market providers, followed by the rendering and image generation path, then TV publishing, then health and scheduling.

## Delivery Expectations

Work iteratively. Leave the repository in a runnable state at each meaningful checkpoint. Add concise documentation where behavior or tradeoffs are non-obvious. If you hit uncertainty in the TV publisher path, isolate the uncertainty behind an adapter rather than contaminating the rest of the codebase.

Your first task is to inspect the repository structure, confirm the core docs are present, and then implement Milestone Zero from the technical specification.
