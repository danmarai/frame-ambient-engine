# Review and rotation experiments

Open **Labs** in the authenticated Frame studio. All features default off; preferences and artwork decisions persist privately in `labs.json`.

1. Enable **Artwork review**. In Library, use each image's review selector to mark it Approved for rotation, Rejected or Unreviewed. Filter by category and review status. None of these actions displays art.
2. Enable **Approved-art rotation**. This reveals its controls; it does not start the TV.
3. Choose 5–1440 minutes per image and press **Start rotation**. The first approved image is queued on the next five-second scheduler tick. Use **Stop rotation** to stop.

Rotation includes all approved artwork across categories, in stable image-ID order. The dwell interval starts after successful TV confirmation. Unapproved or rejected images are excluded. Only one job can be in flight; no catch-up burst is sent after offline periods. The laptop bridge must remain on the TV's network and connected, and Tuscany must remain online. Offline bridge periods defer the next image. A failed command or a five-minute job timeout pauses rotation. A server restart always pauses it and requires Start again. A manual Display pauses automatic rotation.

Disabling rotation cancels pending automatic work. Disabling review also disables rotation, preserving review decisions. An operation already handed to the bridge may still finish. Authentication and same-origin checks apply to Labs reads/mutations; bridge credentials cannot change flags. Queued/unimplemented flags are rejected server-side.

## Improvement queue

[Issue #21](https://github.com/danmarai/frame-ambient-engine/issues/21) tracks priorities, acceptance checks and rollout requirements:

| Priority | Flag | Improvement | Status |
|---|---|---|---|
| Now | `review` | Persist approvals and rejection decisions; filter review backlog | Ready to test, off |
| Now | `rotation` | Approved-only timed cycling with explicit Start/Stop | Ready to test, off |
| Next | `compare` | Equal-scale side-by-side comparison, zoom and preference | Queued, unavailable |
| Next | `crop` | Non-destructive focal-point crop, matte and room preview | Queued, unavailable |
| Next | `variations` | Convert review notes to a versioned Codex request; preserve parent-image lineage | Queued, unavailable |
| Later | `seasonal` | Named playlists, category balance, shuffle and quiet hours | Queued, unavailable |
| Later | `androidBridge` | Paired outbound-only phone TV bridge, [issue #20](https://github.com/danmarai/frame-ambient-engine/issues/20) | Deferred, unavailable |

Additional backlog: resumable/idempotent imports, per-file progress, private thumbnails and source-resolution/provenance metadata. Add an off-by-default flag before implementing each. Optional API generation requires separate explicit opt-in; current generation remains in Codex using the subscription.

## Validation

`node --test tools/pilot/auth.test.mjs tools/pilot/studio.test.mjs tools/pilot/studio-http.test.mjs tools/pilot/labs.test.mjs`

The HTTP test launches a separate loopback server with fake credentials and a synthetic image, acts as a signed simulated bridge, and checks rotation dispatch, confirmation and interval timing. No real TV is contacted. Live scheduled cycling should be tested after selecting and approving artwork; feature flags remain off until that review.

## Image collections

The review collection contains five new original images in each of the original eight categories (40 images). The additional Winter ski collection contains 20 original winter-ski photographs generated through the built-in Codex image tool, with editable prompts. These are AI-generated artwork, not actual National Geographic photographs. The studio prepares 3840×2160 JPEGs for the TV and labels enlargement where the generated original is smaller. Runtime images and private state are not committed to Git.
