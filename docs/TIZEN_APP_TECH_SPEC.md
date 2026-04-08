# Frame Ambient Engine — Tizen App & Cloud Service Tech Spec

## Overview

A Samsung Tizen Smart TV app that turns the Frame TV into a personalized, AI-driven ambient art display. The app is a thin client that handles authentication, image delivery, and Art Mode integration. All intelligence (generation, personalization, scheduling) lives on the cloud service.

## Architecture

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Samsung Frame   │       │  Cloud Service    │       │  Web Portal     │
│  (Tizen App)     │◄─WSS─►│  (API + Workers)  │◄─────►│  (Dashboard)    │
│                  │       │                   │       │                 │
│ • Auth/pairing   │       │ • User accounts   │       │ • Settings      │
│ • Art Mode API   │       │ • Image generation │       │ • Theme/style   │
│ • Image cache    │       │ • Scheduling      │       │ • Billing       │
│ • Keep-alive     │       │ • CDN delivery    │       │ • History       │
└─────────────────┘       └──────────────────┘       └─────────────────┘
```

### Why This Architecture

- **Thin client**: Tizen app is ~1000 lines of JS. Easy to build, easy to review, rarely needs updating.
- **Server-side intelligence**: Theme logic, prompt composition, AI calls, feedback learning — all server-side. Updates happen instantly without app store re-review.
- **Web portal for control**: Users never need to open the TV app after initial setup. Everything is controlled from phone/laptop via the web dashboard.
- **Payment decoupling**: Free app on Samsung store, subscriptions managed through our web portal. Samsung takes no revenue share on web subscriptions.

## Tizen App — Detailed Design

### App Responsibilities

| Responsibility            | How                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------- |
| **One-time pairing**      | Show 6-digit code on TV → user enters code on web portal → server links TV to account |
| **Persistent connection** | WebSocket to cloud service, auto-reconnect with exponential backoff                   |
| **Receive images**        | Cloud pushes image URL via WebSocket → app downloads from CDN → stores locally        |
| **Art Mode display**      | Uses Samsung Tizen `webapis.artmode` API to set downloaded image as active art        |
| **Prevent screensaver**   | Registers as Art Mode content provider so TV stays in art display mode                |
| **Image cache**           | Stores last 20 images on TV local storage for instant switching and offline display   |
| **Status heartbeat**      | Reports TV status (on/off, art mode, screen state) to cloud every 60s                 |

### Art Mode Integration — The Key Piece

The Tizen `webapis.artmode` API allows apps to:

- Register as an art content provider
- Set the currently displayed artwork
- Detect art mode on/off state
- Respond to motion sensor events (dim when no one is present)
- **Prevent the screensaver** by being the active art content source

This is the critical difference between DLNA (which just pushes an image to the media player, subject to screensaver timeout) and a Tizen app (which IS the art mode provider).

```javascript
// Tizen Art Mode API (conceptual)
webapis.artmode.registerContentProvider({
  onArtModeEnter: () => {
    /* Display current image */
  },
  onArtModeExit: () => {
    /* Pause, reduce activity */
  },
  onMotionDetected: () => {
    /* Brighten display */
  },
  onNoMotion: () => {
    /* Dim or show ambient mode */
  },
});

webapis.artmode.setCurrentImage(localImagePath);
```

### Screensaver Problem (Current DLNA Approach)

**Why it happens now:** DLNA pushes to the TV's media player (AVTransport). The TV treats this as "media playback" not "art mode content." After the media playback idle timeout (usually 5-15 minutes), the TV transitions to its screensaver because no app has claimed art mode ownership.

**How the Tizen app solves it:** The app registers as an Art Mode content provider via `webapis.artmode`. Samsung's OS recognizes the app as the active art source and keeps the display in art mode indefinitely — same as Samsung's own Art Store app does. No screensaver, proper brightness/motion sensor integration, and the physical matte frame effect works correctly.

### User Flow

```
FIRST TIME (takes ~2 minutes):
1. User downloads free "Frame Ambient" app from Samsung App Store
2. App opens, shows: "Welcome! Your pairing code is: 847291"
3. User goes to frame-ambient.com/pair on their phone
4. Enters code 847291 → creates account (or links to existing)
5. TV shows "Connected!" → app minimizes into Art Mode
6. User never needs to open the app again

ONGOING (fully automatic):
- Cloud generates new art based on schedule + preferences
- Pushes image URL to TV via WebSocket
- App downloads image, caches it, sets as Art Mode display
- User controls everything from web portal (theme, style, schedule)
- If WebSocket disconnects, app shows cached images in rotation
```

### Offline Resilience

The app caches the last 20 images locally. If the internet drops:

- App continues displaying cached images in rotation
- Reconnects to cloud when internet returns
- Syncs any missed images

## Cloud Service — Detailed Design

### Components

| Component                    | Technology                    | Purpose                                 |
| ---------------------------- | ----------------------------- | --------------------------------------- |
| **API Server**               | Next.js or Fastify on Node.js | REST + WebSocket endpoints              |
| **Image Generation Workers** | Bull/BullMQ + Redis           | Async job queue for AI image generation |
| **CDN**                      | Cloudflare R2 + CDN           | Image storage and delivery              |
| **Database**                 | PostgreSQL (Supabase or Neon) | Users, TVs, settings, history           |
| **WebSocket Relay**          | ws library on API server      | Real-time push to connected TVs         |
| **Auth**                     | Lucia or NextAuth             | Email/password + OAuth                  |
| **Billing**                  | Stripe                        | Subscription management                 |

### API Endpoints (TV-facing)

```
POST   /api/tv/pair          — Validate pairing code, link TV to account
WS     /api/tv/connect       — Persistent WebSocket for image push + status
GET    /api/tv/images/:id    — Download image by ID (CDN-backed)
POST   /api/tv/heartbeat     — TV status report (art mode, screen state)
```

### API Endpoints (Web Portal)

```
GET    /api/settings          — User's current settings
PUT    /api/settings          — Update settings
POST   /api/generate          — Trigger manual generation
GET    /api/scenes            — History with pagination
POST   /api/scenes/:id/rate   — Thumbs up/down
GET    /api/tv/status         — TV connection status
POST   /api/billing/subscribe — Create Stripe subscription
```

### WebSocket Protocol (TV ↔ Cloud)

```json
// Cloud → TV: New image available
{
  "type": "new_image",
  "imageId": "abc123",
  "imageUrl": "https://cdn.frame-ambient.com/images/abc123.jpg",
  "metadata": {
    "theme": "natgeo",
    "style": "photorealistic",
    "context": { "weather": {...}, "quote": {...} }
  }
}

// Cloud → TV: Display specific image (from cache)
{
  "type": "set_active",
  "imageId": "abc123"
}

// TV → Cloud: Status heartbeat
{
  "type": "heartbeat",
  "artMode": true,
  "screenOn": true,
  "cachedImages": 15,
  "currentImage": "abc123"
}

// TV → Cloud: Pairing request
{
  "type": "pair",
  "code": "847291"
}
```

## Business Model

### Free Tier

- 3 themes (forest, ocean, sky)
- Photorealistic style only
- 1 generation per day
- No overlays
- No scheduling (manual only)
- "Powered by Frame Ambient" watermark (subtle, bottom-right)

### Pro Tier ($4.99/month)

- All themes (10+) including NatGeo, Famous Women, Science, Landmarks
- All styles (photorealistic, fine art, artistic, illustration, random)
- Unlimited generations
- Quote, weather, market overlays
- Automatic scheduling (configurable interval)
- Holiday mode
- Taste learning (feedback influences future art)
- No watermark
- Priority image generation

### Competitive Positioning

| Feature         | Samsung Art Store ($5.99/mo) | Frame Ambient ($4.99/mo)                          |
| --------------- | ---------------------------- | ------------------------------------------------- |
| Content         | Curated static gallery       | AI-generated, personalized                        |
| Personalization | Pick from catalog            | Learns your taste over time                       |
| Dynamic         | Static images                | Responds to weather, market, time                 |
| Overlays        | None                         | Quote, weather, market data                       |
| Themes          | Art categories               | NatGeo, Science, Famous Women, Landmarks, Holiday |
| Scheduling      | Manual browse                | Auto-refresh on schedule                          |
| Style           | Fixed                        | Photorealistic, Fine Art, Illustration, etc.      |

## Development Milestones

### Milestone A: Tizen App Shell (1 week)

- [ ] Set up Tizen development environment
- [ ] Build minimal app that displays a static image in Art Mode
- [ ] Verify `webapis.artmode` prevents screensaver
- [ ] Test on developer-mode TV
- **Gate:** Art Mode works, no screensaver

### Milestone B: Local Pairing + Image Push (1 week)

- [ ] Pairing code display on TV
- [ ] WebSocket connection to local server (existing codebase)
- [ ] Image download and Art Mode display
- [ ] Image cache (local storage)
- **Gate:** Can push generated images from local server to TV via app

### Milestone C: Cloud Service MVP (2 weeks)

- [ ] User accounts (email/password)
- [ ] PostgreSQL schema (migrate from SQLite)
- [ ] Image generation worker queue
- [ ] CDN image storage (Cloudflare R2)
- [ ] WebSocket relay for TV connections
- [ ] Web portal (port existing dashboard to multi-tenant)
- **Gate:** End-to-end flow: sign up → pair TV → generate → display

### Milestone D: Billing + Free/Pro Tiers (1 week)

- [ ] Stripe integration
- [ ] Feature gating (free vs pro)
- [ ] Subscription management in web portal
- [ ] Watermark for free tier
- **Gate:** Can accept payments, features gated correctly

### Milestone E: Samsung App Store Submission (1-2 weeks)

- [ ] App store listing (screenshots, description, privacy policy)
- [ ] Samsung certification testing
- [ ] Store submission and review
- **Gate:** App approved and live on Samsung App Store

### Milestone F: Polish + Launch (1 week)

- [ ] Landing page (frame-ambient.com)
- [ ] Onboarding flow optimization
- [ ] Error handling and edge cases
- [ ] Performance testing (multiple concurrent TVs)
- **Gate:** Ready for public launch

## Open Questions

1. **Multi-TV support**: Should one account support multiple TVs? (Yes, Pro tier should allow 3+ TVs)
2. **Family sharing**: Can multiple people control the same TV? (Yes, via shared account or invite)
3. **TV model support**: Only Samsung Frame, or also LG Gallery Mode / other art TVs?
4. **Image rights**: AI-generated images — any licensing concerns for commercial display?
5. **Data privacy**: Weather/market data implies location — GDPR/privacy policy needs
6. **Offline duration**: How long should cached images last without internet? (Current plan: indefinitely, rotate through cache)

## Technical Risks

| Risk                               | Mitigation                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Samsung changes Tizen Art Mode API | Keep app thin; isolate API calls behind an abstraction                                     |
| App store rejection                | Follow Samsung guidelines strictly; test on multiple TV models                             |
| WebSocket reliability at scale     | Use Redis pub/sub for horizontal scaling; client-side reconnect                            |
| AI generation costs at scale       | Rate limit free tier; batch generation during off-peak; cache popular themes               |
| Image quality inconsistency        | Quality directive in prompts; automated quality scoring; human review for featured content |
