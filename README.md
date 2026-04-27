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
cp .env.example apps/cloud/.env
# Edit .env with OPENAI_API_KEY (required for image generation)

# Start the cloud server
cd apps/cloud && pnpm dev
# Server at http://localhost:3847
# Studio: http://localhost:3847/studio
# Gallery: http://localhost:3847/gallery
```

### Android app

```bash
cd apps/android
npm install
npm run prebuild
npm run build:apk
# APK at android/app/build/outputs/apk/release/app-release.apk
```

## Commands

| Command                                | Description                           |
| -------------------------------------- | ------------------------------------- |
| `pnpm --filter @frame/cloud dev`       | Start cloud server (dev, auto-reload) |
| `pnpm --filter @frame/cloud test`      | Run cloud server tests                |
| `pnpm --filter @frame/cloud typecheck` | Type-check cloud server               |
| `cd apps/android && npm run build`     | Build Android APK                     |

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Cloud server**: Express.js, TypeScript, pino logging
- **Android app**: React Native / Expo, react-native-tcp-socket
- **Tizen TV app**: Minimal HTML/JS, Samsung WebSocket API
- **Auth**: Google OAuth + session tokens
- **Database**: SQLite via Drizzle ORM + better-sqlite3
- **TV protocol**: Samsung Frame Art Mode WebSocket + d2d TCP upload
- **Image generation**: OpenAI GPT Image (default), DALL-E 3, Google Gemini
- **Weather**: Open-Meteo (free, no key)
- **Deployment**: EC2, PM2, nginx, Let's Encrypt; Docker available

All providers have mock implementations for local development without API keys.

## Project Status

Production hardening in progress. See `docs/HARDENING_PLAN.md` for the full plan and `docs/coordination/` for Track 1/Track 2 progress.

See `docs/` for the PRD, technical spec, and architecture decision records.

## License

Private. Not yet licensed for distribution.
