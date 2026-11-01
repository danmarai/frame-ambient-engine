# Creation studio

The authenticated home pilot now has Create, Library and Labs views. The creation workflow intentionally uses Codex subscription image generation; the website contains no provider API-generation endpoint.

1. Choose a nature category, season, lighting, region, and scene details.
2. Use **Build from settings** to compose a prompt, then edit it freely. Rebuilding asks before replacing prompt edits.
3. **Save draft** persists settings and a version on Tuscany. Concurrent stale edits are rejected instead of silently overwriting a newer draft.
4. **Prepare for Codex** saves an immutable snapshot of the current draft. **Copy request** provides the prompt and request/draft identifiers to paste into Codex. This does not run generation automatically.
5. Generate with the Codex subscription image tool. **Import result** attaches a saved image to the selected prepared request's prompt version, even if the draft has since changed. Codex can also attach the result using the authenticated import endpoint.
6. Preview the image and its saved prompt. **Display on Frame** explicitly queues a TV operation. Optional approved-art rotation is separately gated in Labs. **Use this prompt** starts a new draft for variations; it does not edit the existing image.

Library supports category filtering, previews, and explicit display. Unassociated uploads and existing gallery images remain available. Small images are enlarged to the 4K TV canvas and marked as such.

## Storage and security

Studio state is `studio.json` under the private `FRAME_PILOT_DATA` directory. Drafts, prepared request snapshots, and artwork metadata persist through service restarts. Writes are serialized and use atomic replacement. Limits: 100 drafts, 200 prepared requests, and the existing 200-image gallery limit. Original inputs use the existing 20 MB / 40-megapixel validation and JPEG conversion.

All studio routes use the existing browser session and same-origin mutation checks. Bridge credentials cannot read or modify studio drafts. Importing never queues a TV command. No subscription credentials are embedded in the site or generation request. The prepared text is a user-reviewed handoff, not an automatic Codex task or recurring automation.

For an assistant attaching a generated file: read the intended request from authenticated `GET /api/studio`, then `POST /api/studio/import/{draftId}` with the raw image bytes, the browser session, exact Origin, and `X-Frame-Request-Id` set to that saved request ID. Read back the artwork/request association. Do not call `/api/display` unless the user asks to display it.

Validation on Tuscany:

```sh
source tools/studio-env.sh
node --check tools/pilot/ui.js
node --test tools/pilot/auth.test.mjs tools/pilot/studio.test.mjs tools/pilot/studio-http.test.mjs
```

The HTTP test uses an isolated temporary directory, ephemeral loopback port, fake credentials, and synthetic image. It verifies authentication, origin checks, draft/prepare/import, private image access, and that imports never display automatically. No model API or real TV is contacted.

## Later iterations

- Android phone as local TV bridge: [issue #20](https://github.com/danmarai/frame-ambient-engine/issues/20). Deferred until after creation-studio work; no Android bridge implementation in this change.
- Artwork review and approved-only rotation are now available behind off-by-default flags; see [Labs](LABS.md). Named playlists, shuffle and quiet hours remain queued.
- Optional API-backed generation only after explicit user opt-in and credential/credit setup. The current user preference is Codex subscription generation.
