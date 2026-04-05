# Frame Ambient Engine GitHub Setup and Delivery Workflow

## Purpose

This document describes how the project repository should be created, organized, protected, and operated so that implementation can proceed cleanly and survive handoff between human developers and coding agents.

## Repository Strategy

The project should begin as a single private monorepo. The recommended repository name is `frame-ambient-engine`. It should be private from day one because it will contain provider integration code, environment configuration structure, TV publishing logic, and eventually family-specific generation behavior.

The monorepo approach is appropriate for version one because the application is cohesive and the main goal is rapid implementation with strong internal modularity. Splitting into multiple repositories this early would create ceremony without enough benefit.

## Recommended Initial Repository Contents

The repository should include a top-level README, an environment example file, the application package configuration, a docs directory, a scripts directory, and the main app and package structure. Documentation should be committed as real project assets, not left in chat history or issue comments.

The docs directory should include the PRD, tech spec, setup instructions, and a set of architecture decision records. The goal is to make the repository understandable to a new contributor or coding agent without having to reconstruct intent from conversations.

## Branching Strategy

The repository should use a protected `main` branch. A `dev` branch is optional, but useful if multiple feature branches will be active at once. Feature development should happen in named branches such as `feature/preview-studio`, `feature/weather-adapter`, `fix/publish-retry`, or `docs/adr-scene-spec`.

Even if the project is initially developed by one person and one coding agent, pull requests should still be used for merge hygiene and reviewability. The repository should be configured to prevent force pushes to main.

## Branch Protection

At minimum, the repository should protect main against direct force pushes and accidental deletion. It should require pull requests for merge. If lightweight checks are available, they should be required before merge. Once the implementation is underway, basic linting and type checking should become merge requirements.

## GitHub Features to Enable

Issues should be enabled. Projects should be enabled. GitHub Actions should be enabled, even if only used for simple checks at first. Discussions are optional. Secret scanning and dependency alerts should be enabled if available. The project board should be used to track epics and milestone progress rather than relying on ad hoc chat state.

## Labels

A useful starting label set includes frontend, backend, preview, rendering, publish, health, auth, provider, theme, docs, bug, enhancement, blocked, and milestone-specific labels. These labels are enough to create meaningful slices of work without overcomplicating issue management.

## Suggested Milestone Epics

The project board should begin with a small set of epics: bootstrap, preview studio, signal adapters, rendering and themes, TV publishing, health and observability, and hardening and docs. Each epic should break into implementation issues that map to the milestone plan in the tech spec.

## Recommended Folder Structure

The repository should use a structure that is monorepo in delivery but modular in design. The main web app should live under `apps/web`. Shared logic should live under `packages`. Core types and scene logic should live under `packages/core`. Providers should live under `packages/providers`. Rendering should live under `packages/rendering`. TV publishing should live under `packages/tv`. Health computation should live under `packages/health`. Configuration schemas should live under `packages/config`. The docs directory should hold the PRD, tech spec, ADRs, and setup notes. The scripts directory should hold local setup and diagnostic scripts.

## Architecture Decision Records

ADRs should be created early. The initial ADRs should cover the local-first runtime decision, the use of Next.js and TypeScript, the provider adapter pattern, the Scene Spec as the central contract, the choice of local SQLite and filesystem storage, the TV publisher abstraction, and the fallback-first reliability strategy.

These ADRs do not need to be long. They need to exist so future contributors know why choices were made.

## Initial Issues to Create

The repository should be seeded with concrete issues before implementation begins. Initial issues should include app bootstrap, auth and session gate, settings persistence, Scene Spec definition, preview job flow, preview candidate UI, weather adapter integration, market adapter integration, curated quote loading, theme schema, image generation provider adapter, fallback asset strategy, renderer implementation, TV publisher interface, connection test UI, scheduler, health dashboard, and log visibility.

This issue set gives enough structure for human or agent execution without becoming a full project bureaucracy.

## Commit and Review Guidance

Commits should be small enough to review. Implementation agents should be instructed to leave the repository in a runnable state at the end of each meaningful unit of work. Pull requests should include a short summary of the behavior added, any notable architectural decisions, and any open questions or limitations discovered.

## Environment and Secrets

The repository should include a `.env.example` file that documents expected environment variables without exposing real secrets. Secrets must never be committed. The setup documentation should explain where keys are needed, where they are optional, and how the health page should reflect missing provider configuration.

## Delivery Discipline

The key rule for this repository is that build knowledge must be captured inside the repo itself. The PRD, tech spec, setup instructions, and implementation agent prompt should all live in version control. That way, implementation does not depend on fragile external links or expired chat artifacts.
