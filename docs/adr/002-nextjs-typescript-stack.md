# ADR-002: Next.js 15 with TypeScript and App Router

## Status

Accepted

## Context

The application needs a single codebase that handles UI rendering, API routes, and server-side orchestration. Separate frontend and backend projects would introduce unnecessary coordination overhead for a local-first v1. The stack must support server-side data access (for SQLite and secrets), middleware (for auth), and static/dynamic rendering patterns. TypeScript is required for type safety across the domain model, provider contracts, and API surface.

## Decision

Use Next.js 15 with TypeScript and the App Router as the primary application framework. React powers the control panel UI. Tailwind CSS is used for styling. The App Router provides server components, route handlers, and middleware out of the box.

## Consequences

- Server components enable direct database access without an additional API layer for read paths.
- Middleware handles authentication gating across all protected routes.
- Standalone output mode supports self-hosting without requiring a Node.js hosting platform.
- The team must be comfortable with App Router conventions (server vs client components, route handlers, loading/error boundaries).
- Future deployment to EC2 is straightforward with standalone output.
- One codebase to maintain for both the operator UI and the backend orchestration logic.
