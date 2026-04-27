# Frame Ambient Engine

A local-first ambient display system that generates AI-powered wallpapers and pushes them to a Samsung Frame TV. Includes a web control panel for monitoring and adjusting generation parameters.

## Architecture

```
apps/
  cloud/            Express.js cloud server (PRODUCTION) — EC2, PM2, nginx
  android/          React Native / Expo companion app (npm, not pnpm)
  tizen/            Samsung Tizen TV app (thin client)
  web/              LEGACY — Next.js prototype (not deployed, excluded from CI)

packages/
  core/             Shared types, interfaces, and defaults
  config/           Settings validation, env loading
  db/               Drizzle ORM + SQLite persistence
  providers/        Weather, market, image (GPT Image + DALL-E), quote providers
  tv/               Samsung Frame TV publisher
  health/           System health monitoring
  rendering/        Image composition pipeline
```

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+
pnpm install
cp .env.example apps/web/.env.local
# Edit .env.local with your SESSION_SECRET and APP_PASSWORD_HASH

pnpm dev
# Open http://localhost:3000
```

### Generate a password hash

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (_, h) => console.log(h))"
```

## Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Start dev server with Turbopack    |
| `pnpm build`     | Build all packages and the web app |
| `pnpm typecheck` | Type-check all packages            |
| `pnpm lint`      | Lint all packages                  |
| `pnpm clean`     | Remove build artifacts             |

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js 15, Tailwind CSS, TypeScript
- **Auth**: iron-session (encrypted stateless cookies)
- **Database**: SQLite via Drizzle ORM + better-sqlite3
- **TV**: Samsung Frame TV local WebSocket API
- **Providers**: OpenAI (DALL-E), Google Gemini (Imagen), Open-Meteo weather

All providers have mock implementations for local development without API keys.

## Project Status

**Milestone 0** (Bootstrap) - Complete. App boots, auth works, settings persist, all providers mocked.

See `docs/` for the full PRD, technical spec, and architecture decision records.

## License

Private. Not yet licensed for distribution.
