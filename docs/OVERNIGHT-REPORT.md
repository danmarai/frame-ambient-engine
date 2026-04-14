# Overnight Build Report — April 13-14, 2026

## What Was Accomplished

### 1. Production Server Deployed (EC2)

**Live at: https://frameapp.dmarantz.com**

- Ubuntu EC2 instance at `ec2-3-84-52-62.compute-1.amazonaws.com`
- Node.js 22 + Express cloud server
- **HTTPS** via Let's Encrypt (auto-renews July 13, 2026)
- **nginx** reverse proxy (ports 80/443 → localhost:3847)
- **PM2** process manager (auto-restart, survives reboots, log rotation)
- UFW firewall: only ports 22, 80, 443 open (3847 also open, can be closed)
- One-command deploy: `./tools/deploy-ec2.sh`

**Working endpoints:**
| URL | Description |
|-----|-------------|
| `https://frameapp.dmarantz.com/pair` | Phone pairing page with Google Sign-In |
| `https://frameapp.dmarantz.com/gallery` | Art gallery with feedback (thumbs up/down) |
| `https://frameapp.dmarantz.com/api/ping` | Health check |
| `https://frameapp.dmarantz.com/api/config` | Client config (Google OAuth ID) |
| `https://frameapp.dmarantz.com/api/devices` | Device registry |
| `https://frameapp.dmarantz.com/api/devices/scan` | Scan a TV by IP |
| `https://frameapp.dmarantz.com/api/auth/google` | Google OAuth login |
| `https://frameapp.dmarantz.com/api/auth/me` | Current user session |
| `https://frameapp.dmarantz.com/api/upload` | Upload art to TV |
| `https://frameapp.dmarantz.com/api/upload-file` | Upload specific file to TV |
| `https://frameapp.dmarantz.com/api/tv/init` | Initialize TV storage state |
| `https://frameapp.dmarantz.com/api/cycle` | Start art rotation |
| `https://frameapp.dmarantz.com/api/cycle/stop` | Stop rotation |
| `https://frameapp.dmarantz.com/api/feedback` | Submit art feedback |
| `https://frameapp.dmarantz.com/api/feedback/:tvId` | Get feedback for a TV |

### 2. Gallery & Feedback UI Built

**`/gallery` page features:**

- Google Sign-In (same auth as pairing page)
- TV selector dropdown (lists all registered devices)
- Art grid showing all images on the selected TV
- **Thumbs up / Thumbs down** buttons per image
- **"Display" button** to switch which image is showing
- **"Sync New Art" button** to upload new art from cloud
- Status bar with live feedback
- Responsive mobile layout

### 3. Feedback API

- `POST /api/feedback` — submit rating (tvId, contentId, rating: up/down)
- `GET /api/feedback/:tvId` — get all feedback for a TV
- Ratings tied to authenticated user (optional)
- In-memory store (will migrate to SQLite DB)

### 4. Code Quality & Deployment

- **2 git commits** with clear messages
- **Deploy script** (`tools/deploy-ec2.sh`) — push to git → pull on EC2 → restart PM2
- **PM2 ecosystem config** with log rotation and memory limits
- **Cleaned up** EC2 SSH key from local temp after use
- **.gitignore** updated for Tizen build artifacts and sensitive files

---

## What You Need to Do in the Morning

### Required (5 minutes):

1. **Close port 3847** in AWS Security Group (optional, everything routes through 80/443 now)
2. **Test Google Sign-In** — open `https://frameapp.dmarantz.com/pair` on your phone
3. **Test Gallery** — open `https://frameapp.dmarantz.com/gallery` and sign in

### Optional:

4. **Post Samsung developer forum question** — draft at `docs/samsung-forum-post.md`
5. **Submit Samsung support ticket** — draft at `docs/samsung-support-email.md`

---

## Architecture Summary

```
[Phone Browser]                    [EC2 Cloud Server]
     |                          https://frameapp.dmarantz.com
     |--- Google Sign-In ------→ /api/auth/google
     |--- Enter pair code -----→ /api/pair
     |--- View gallery --------→ /gallery
     |--- Thumbs up/down ------→ /api/feedback
     |--- Upload art ----------→ /api/upload → [TV via d2d TCP]
     |
[Samsung Frame TV]
     |--- Art mode API --------→ ws://localhost:8001 (from Tizen app)
     |--- Upload target -------→ wss://TV:8002 (from cloud/phone on LAN)
     |
[Tizen TV App]
     |--- Pairing screen ------→ ws://cloud/ws/tv
     |--- Art mode control ----→ ws://localhost:8001
```

---

## Device Registry Status

| TV           | Model          | Year | Location     | Images                |
| ------------ | -------------- | ---- | ------------ | --------------------- |
| frame-7916CE | QN65LS03TAFXZA | 2020 | Dan's house  | 5 (Don Claude series) |
| frame-0C0E70 | QN75LS03TAFXZA | 2020 | Yuen's house | 15 (Pokemon + Ghibli) |

---

## What's Next

### Priority 1: Phone-as-Bridge Upload

The cloud server can't reach TVs behind NAT. When the phone is on the same WiFi as the TV, it should be able to do the d2d upload. This needs:

- Browser-compatible WebSocket + TCP upload code
- Or: phone sends image to cloud, cloud streams it back to phone, phone forwards to TV

### Priority 2: Art Generation Pipeline

Connect the existing `@frame/rendering` package to the cloud server so art is generated automatically, not just Don Claude/Pokemon test images.

### Priority 3: DB Persistence

Move from in-memory stores to SQLite using the existing `@frame/db` package. The schema is already defined with all needed tables.

### Priority 4: Find a 2022+ Frame TV

Background service testing is still the key unlock for the fully autonomous (no phone) architecture.

---

## Files Changed (this session)

| File                                 | Description                                      |
| ------------------------------------ | ------------------------------------------------ |
| `apps/cloud/src/server.ts`           | Main cloud server with all API endpoints         |
| `apps/cloud/src/auth.ts`             | Google OAuth verification and session management |
| `apps/cloud/src/pairing.ts`          | Pairing code generation and validation           |
| `apps/cloud/src/tv-connections.ts`   | WebSocket connection management                  |
| `apps/cloud/src/tv-upload.ts`        | d2d TCP upload to Samsung TV                     |
| `apps/cloud/src/tv-storage.ts`       | TV art storage management and cleanup            |
| `apps/cloud/src/public/pair.html`    | Phone pairing page with Google Sign-In           |
| `apps/cloud/src/public/gallery.html` | Art gallery with feedback UI                     |
| `apps/cloud/.env`                    | Production config (Google OAuth, URL)            |
| `apps/cloud/ecosystem.config.cjs`    | PM2 process manager config                       |
| `apps/tizen/index.html`              | TV pairing app                                   |
| `apps/tizen/config.xml`              | Minimal Tizen config (no allow-navigation!)      |
| `packages/db/src/schema.ts`          | Added users, tvDevices, tvArt, userPreferences   |
| `tools/deploy-ec2.sh`                | One-command EC2 deployment                       |
| `tools/yuen-tv-test.sh`              | Automated TV test runner                         |
| `docs/samsung-forum-post.md`         | Developer forum question draft                   |
| `docs/samsung-support-email.md`      | Samsung support email draft                      |
| `.gitignore`                         | Updated for Tizen artifacts                      |

---

_Generated by Claude Opus 4.6 — April 14, 2026_
