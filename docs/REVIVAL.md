# Frame revival — October 31, 2026

## Development and builds

Tuscany (Mac Studio) is the primary checkout and build host. Run `source tools/studio-env.sh` before project commands. The project uses its own Node 22.23.4 and pnpm 9.15.4 toolchain; it does not depend on the machine's broken global Node installation. Android uses JDK 17 and the existing Android SDK. Tizen Studio is already installed.

The revival branch combines main, taste generation, and the Curateur controls/rebranding work. Pre-existing Tuscany changes were backed up and stashed before reconciliation; preserve those backups and stash. The USB recovery remains untouched.

Commands on Tuscany:

```sh
source tools/studio-env.sh
pnpm --filter @frame/cloud typecheck
pnpm --filter @frame/cloud test
node --test tools/pilot/auth.test.mjs
tools/build-android.sh
tools/build-tizen.sh
```

The Android release APK is a pilot build using the existing debug signing setup, not a production store release. Tizen packaging requires the existing `TV-test-3` author certificate to be unlocked in Certificate Manager. Preserve its author identity. The test TV's developer-host IP also needs updating before a new app installation. Art upload works independently of a signed Tizen install.

## Personal hosted pilot

`https://frame.marantz.net` serves `tools/pilot/server.mjs` on Tuscany through a dedicated, remotely managed Cloudflare Tunnel in the personal account owning marantz.net. It does not publish the legacy Express server. The origin binds to loopback port 3848 only. Cloudflared's metrics also bind to loopback.

The pilot supports login, uploading existing PNG/JPEG/WebP artwork, a private gallery, and sending an image to the TV. It does not call paid generation APIs. Images are cropped to 16:9 and prepared as 3840×2160 JPEGs; smaller images are upscaled, which does not add native detail.

Runtime data on Tuscany is in `~/Library/Application Support/FramePilot`, outside Git. `config.json` contains separate browser and bridge keys and must remain mode 600 inside a private directory. The tunnel credential is stored in `tunnel.token`, also mode 600. Do not paste these files into chat or logs.

Browser sessions use random tokens, eight-hour expiry, and Secure/HttpOnly/SameSite=Strict cookies. Mutating browser requests require the exact HTTPS Origin. Login attempts are rate limited. The gallery and image endpoints require authentication. Uploaded content has byte and decoded-pixel limits and is decoded/re-encoded before storage. The pilot limits the gallery to 200 images.

Bridge requests use HMAC-SHA256 over the method, path, timestamp, nonce, and body digest. Requests outside a 60-second window, altered requests, and nonce replays are rejected. The bridge has a fixed local TV address in its private configuration; the remote service cannot choose arbitrary LAN targets. TV authorization tokens stay on the laptop. The Samsung LAN WebSocket uses the TV's self-signed certificate, so certificate validation is disabled only for that local TV connection.

The laptop bridge connects outward and opens no listening socket. Its runtime is in `~/Library/Application Support/FrameBridge/runtime`; its configuration, cache, and logs are in the adjacent `private` directory. Tuscany builds remain separate. It must be awake on the TV's network to change artwork. The TV retains the current image while the bridge is offline.

The service allows one TV job at a time. It does not automatically repeat failed uploads. The bridge caches TV content IDs so selecting an existing image does not upload duplicates. It verifies the TV's current artwork and Art Mode before reporting success. Interrupted operations need inspection before manual retry. Pending jobs and browser sessions are in memory and are discarded on an origin restart; artwork and bridge mappings persist. This is a personal pilot, not a multi-user production service.

## Operations

User launch agents:

- Tuscany: `net.marantz.frame-pilot`, `net.marantz.frame-tunnel`.
- TV-side laptop: `net.marantz.frame-bridge`.

Use `launchctl list LABEL` to inspect status. Restart only the intended service with `launchctl kickstart -k gui/$(id -u)/LABEL`. Logs are in each service's private Application Support directory. These are user agents: the user's login session must be available after reboot.

Rotate the browser key by replacing it with a fresh cryptographically random 32-byte key in the private origin configuration and restarting the origin, which invalidates sessions. Rotate the bridge key on both the origin and bridge, then restart both. Never use either credential as the Cloudflare token.

Rollback public hosting by removing the Frame-specific DNS record and stopping its tunnel agent. Stop a service with `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/LABEL.plist`; preserve data and credentials for recovery. No router inbound forwarding is needed. The inspected old Frame port-forward rule was disabled; an upstream router was not audited.

## Art generation

The initial late-October river artwork was generated through the Codex subscription image tool. That tool did not expose a model identifier. Its original image was smaller than 4K and was upscaled for the TV.

Paid API generation is disabled by default. `FRAME_ENABLE_API_GENERATION=true` is an explicit opt-in, and the requested provider must have a valid API key. The OpenAI provider's current configured model is `gpt-image-2.5-sunburst`, configurable with `OPENAI_IMAGE_MODEL`, with high quality and a native 2560×1440 request. Verify official model documentation before changing this again. Subscription generation and API billing are separate paths.

The native Android/Tizen clients still require a dedicated authenticated integration before they can use the new pilot server. Do not change their legacy endpoint to this hostname and assume protocol compatibility. The pilot web interface is the supported hosted control surface for now.
