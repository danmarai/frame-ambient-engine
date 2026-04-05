# ADR-005: SQLite via Drizzle ORM for Local Persistence

## Status

Accepted

## Context

The local-first application needs an embedded database for persisting settings, scene records, job runs, publish history, and health snapshots. The database must run in-process without requiring a separate server. Two ORM options were evaluated:

- **Prisma**: Mature ecosystem but requires a 2MB+ query engine binary, uses code generation, and has an async-only API that adds complexity for simple local operations.
- **Drizzle ORM**: Approximately 7KB, no code generation step, supports a synchronous API via better-sqlite3, and defines schemas directly in TypeScript.

## Decision

Use SQLite via Drizzle ORM with better-sqlite3 as the driver for all local persistence. The database file lives in the project's data directory.

## Consequences

- WAL (Write-Ahead Logging) mode is enabled for concurrent read access during scene generation and UI queries.
- better-sqlite3 must be added to Next.js `serverExternalPackages` configuration since it is a native Node.js addon.
- Schema is defined in TypeScript alongside the application code, with no separate code generation step.
- Migrations are managed through Drizzle Kit.
- The synchronous API simplifies server-side data access in route handlers and server components.
- SQLite is single-writer, which is acceptable for a single-user local application but would need revisiting for a multi-user cloud deployment.
- Lightweight footprint keeps the application lean and fast to start.
