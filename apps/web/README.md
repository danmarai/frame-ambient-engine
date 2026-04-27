# @frame/web — LEGACY

> **This application is legacy and not part of the production stack.**
> The production server is `apps/cloud/` (Express.js on EC2).
> This Next.js app was the original prototype and is retained for reference only.

## Status

- **Not deployed** to production
- **Not included** in CI (`.github/workflows/ci.yml` filters to `@frame/cloud` only)
- **Known issues**: TypeScript inferred return types fail typecheck on newer TS versions
- **Do not** add new features to this app — use `apps/cloud/` instead

## History

This was the original Next.js 15 web control panel for Frame Art. It was superseded by the Express cloud server (`apps/cloud/`) which serves the Studio, Gallery, and Pair pages as static HTML with a REST API backend. The decision to use Express was driven by:

1. Simpler deployment (single process, PM2, no SSR)
2. Better compatibility with the Samsung WebSocket protocol
3. Easier integration with the Android companion app's WebView

See `docs/coordination/DECISIONS.md` for the full rationale.
