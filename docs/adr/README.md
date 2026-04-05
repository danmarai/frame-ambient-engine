# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Frame Ambient Engine project.

## What is an ADR?

An Architecture Decision Record captures a significant architectural decision along with its context and consequences. ADRs are numbered sequentially and are intended to be immutable once accepted. If a decision is reversed or superseded, a new ADR is created that references the original.

ADRs exist so that future contributors and agents can understand why choices were made without having to reconstruct intent from code, chat history, or tribal knowledge.

## Current ADRs

| ADR                                         | Title                                           | Status   |
| ------------------------------------------- | ----------------------------------------------- | -------- |
| [001](001-local-first-runtime.md)           | Local-First Runtime                             | Accepted |
| [002](002-nextjs-typescript-stack.md)       | Next.js 15 with TypeScript and App Router       | Accepted |
| [003](003-provider-adapter-pattern.md)      | Provider Adapter Pattern                        | Accepted |
| [004](004-scene-spec-central-contract.md)   | Scene Spec as Central Contract                  | Accepted |
| [005](005-sqlite-local-storage.md)          | SQLite via Drizzle ORM for Local Persistence    | Accepted |
| [006](006-tv-publisher-abstraction.md)      | TV Publisher Abstraction                        | Accepted |
| [007](007-fallback-first-reliability.md)    | Fallback-First Reliability                      | Accepted |
| [008](008-samsung-frame-connect-library.md) | Samsung Frame Connect Library for TV Publishing | Accepted |

## How to Add a New ADR

1. Determine the next number in the sequence (e.g., 009).
2. Create a new file named `NNN-short-title.md` in this directory.
3. Use the following template:

```markdown
# ADR-NNN: Title

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Context

[Why this decision was needed. What problem or question prompted it.]

## Decision

[What we decided. Be specific and concrete.]

## Consequences

[What follows from this decision. Include both positive and negative consequences.]
```

4. Set the status to "Proposed" initially.
5. After review and agreement, update the status to "Accepted".
6. Add the ADR to the table in this README.

## Principles

- ADRs should be short and focused. One decision per record.
- Context should explain the problem, not just the solution.
- Consequences should be honest about tradeoffs.
- Once accepted, ADRs are not edited. If a decision changes, create a new ADR that supersedes the old one.
- ADRs are project documentation, not approval gates. They capture decisions that have already been made.
