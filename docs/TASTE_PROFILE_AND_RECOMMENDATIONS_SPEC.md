# Curateur Taste Profile And Recommendation Engine Spec

Status: Accepted for implementation
Owner: Codex
Last updated: 2026-05-04

Design decision: Accepted by Claude for implementation. PR A should start on
`feat/taste-profile-core`.

## Summary

The next product-critical build should be the taste loop: authenticated ratings, a persistent user taste profile, recommendation APIs, and Studio UI surfaces that make Curateur feel personalized instead of just a better upload tool.

PRs #13-#15 add the art library, controls, QR pairing, and rebrand. The missing product loop is learning. The GTM plan claims Curateur learns taste; the cloud app currently only records raw feedback rows and does not use them to choose, rank, or generate art. This spec defines the first useful version of that system.

## Goals

- Let signed-in users rate generated art and library art with thumbs up/down.
- Persist ratings against user, TV, source type, content identifiers, and metadata.
- Compute a user taste profile from ratings and recent pushes.
- Use the profile to rank library recommendations and influence AI generation prompts.
- Add Studio UI for rating current/previous art and browsing "Recommended for you".
- Keep all TV upload/push endpoints behind existing auth and TV ownership checks.
- Keep the first implementation deterministic and SQLite-local, with no new worker queue or vector database.

## Non-Goals

- No paid-tier enforcement yet.
- No collaborative filtering across users in v1.
- No embeddings or external recommendation service in v1.
- No fully autonomous scheduler in this task.
- No personalized model training.

## Why This Is Next

The current stack can pair a TV, push generated art, browse a library, batch upload, and pause Curateur. That is enough distribution surface. The next differentiator is personalization.

The GTM plan positions Curateur as "an AI with impeccable taste, trained on yours." Without a taste profile, the product is still mostly a library plus generator. Ratings and recommendations are the smallest build that changes the product category.

## Existing State

Relevant files:

- `apps/cloud/src/routes/feedback.ts`
- `apps/cloud/src/db.ts`
- `apps/cloud/src/generation.ts`
- `apps/cloud/src/routes/generation.ts`
- `apps/cloud/src/routes/library.ts`
- `apps/cloud/src/public/studio.html`

Current behavior:

- `POST /api/feedback` uses `optionalAuth`.
- Feedback stores `tv_id`, `content_id`, `rating`, nullable `user_id`, and timestamp.
- Feedback does not validate rating values.
- Feedback does not verify TV ownership.
- Feedback does not distinguish generated scenes from library images.
- Generation does not consume feedback.
- Library random/browse does not consume feedback.
- Studio does not expose a first-class rating/recommendation workflow.

## Data Model

Add or migrate to structured rating tables while preserving existing feedback rows.

### `art_ratings`

Columns:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `user_id TEXT NOT NULL REFERENCES users(id)`
- `tv_id TEXT REFERENCES tv_devices(id)`
- `source_type TEXT NOT NULL`
  - allowed: `generated`, `library`
- `source_id TEXT NOT NULL`
  - generated: `scene_archive.id`
  - library: stable key `${category}/${filename}`
- `rating TEXT NOT NULL`
  - allowed: `up`, `down`
- `category TEXT`
- `filename TEXT`
- `prompt TEXT`
- `provider TEXT`
- `context_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Constraints and indexes:

- unique `(user_id, source_type, source_id)`
- index `(user_id, rating)`
- index `(user_id, source_type)`
- index `(user_id, category)`
- index `(tv_id, created_at)`

### `taste_profiles`

Columns:

- `user_id TEXT PRIMARY KEY REFERENCES users(id)`
- `profile_json TEXT NOT NULL`
- `ratings_count INTEGER NOT NULL DEFAULT 0`
- `positive_count INTEGER NOT NULL DEFAULT 0`
- `negative_count INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

`profile_json` shape:

```json
{
  "version": 1,
  "topCategories": [{ "id": "Impressionist Landscapes", "score": 0.82 }],
  "avoidedCategories": [{ "id": "Minimal Abstract", "score": -0.44 }],
  "styleHints": ["soft impressionist brushwork", "warm coastal light"],
  "avoidHints": ["high-contrast monochrome", "text-heavy compositions"],
  "sourceWeights": { "generated": 0.6, "library": 0.4 },
  "confidence": "cold_start|learning|useful",
  "lastRatingAt": "2026-05-04T00:00:00.000Z"
}
```

Confidence rules:

- `cold_start`: fewer than 5 ratings
- `learning`: 5-19 ratings
- `useful`: 20+ ratings

## API Contract

All new write/read endpoints require auth.

### `POST /api/ratings`

Request:

```json
{
  "tvId": "frame-tv-abc",
  "sourceType": "library",
  "sourceId": "Coastal/blue-horizon.jpg",
  "rating": "up",
  "category": "Coastal",
  "filename": "blue-horizon.jpg"
}
```

Generated scene request:

```json
{
  "tvId": "frame-tv-abc",
  "sourceType": "generated",
  "sourceId": "scene-uuid",
  "rating": "down"
}
```

Behavior:

- Require valid session.
- Validate `rating` is `up` or `down`.
- Validate `sourceType` is `generated` or `library`.
- If `tvId` is present, require that TV to belong to the user.
- For generated scenes, require `scene_archive.user_id = userId`.
- For library items, validate category/filename via the library path resolver.
- Upsert rating by `(user_id, source_type, source_id)`.
- Recompute `taste_profiles` synchronously for v1.
- Return updated rating and compact profile summary.

### `GET /api/taste/profile`

Returns the current user's profile summary.

Cold start response:

```json
{
  "confidence": "cold_start",
  "ratingsCount": 0,
  "message": "Rate 5 pieces to start personalizing recommendations.",
  "topCategories": [],
  "styleHints": [],
  "avoidHints": []
}
```

### `GET /api/recommendations/library?limit=24`

Returns ranked library images.

Behavior:

- Require auth.
- If cold start, return a diverse mix across categories.
- If useful profile, score category affinity, recent rating history, and repeat avoidance.
- Exclude items rated down by the user.
- Prefer unrated items over already liked items unless `includeRated=true`.
- Return same image response shape as browse plus `score` and `reason`.

Example:

```json
{
  "confidence": "learning",
  "items": [
    {
      "category": "Coastal",
      "filename": "blue-horizon.jpg",
      "url": "/api/library/image/Coastal/blue-horizon.jpg",
      "label": "blue-horizon",
      "score": 0.74,
      "reason": "Similar to coastal landscapes you liked"
    }
  ]
}
```

### `POST /api/generate`

Extend existing generation behavior:

- When authenticated, load taste profile.
- Add taste-derived prompt hints to generation options.
- For `cold_start`, do not add strong taste hints.
- For `learning` and `useful`, add `styleHints` and `avoidHints`.
- Include `tasteProfileUsed: true|false` and `tasteConfidence` in the response.

## Recommendation Algorithm V1

Keep the first scoring model transparent:

```text
score =
  categoryAffinity
  + sourceDiversityBoost
  + unratedBoost
  - downratedCategoryPenalty
  - recentRepeatPenalty
```

Inputs:

- Category score: likes minus dislikes, normalized by category count.
- Source diversity: avoid showing all recommendations from one category.
- Unrated boost: recommend new items before repeats.
- Recent repeat penalty: use recent ratings and, if available, recent upload history.

No embeddings. No LLM calls. No external services.

## Prompt Personalization V1

Add a helper in `apps/cloud/src/taste-profile.ts`:

- `getTasteProfile(userId): TasteProfile`
- `recordRating(input): RatingResult`
- `getLibraryRecommendations(userId, limit): RecommendedImage[]`
- `buildTastePromptHints(profile): { positive: string; negative: string }`

Generation prompt hints should be short, composable text, for example:

```text
User taste: prefers warm coastal light, painterly landscapes, muted natural palettes.
Avoid: high-contrast monochrome, text-heavy compositions, harsh neon colors.
```

The rendering package should receive these as settings or generation options. Do not hardcode the hints into provider-specific code.

## Studio UI

Add a compact taste panel to `apps/cloud/src/public/studio.html`.

Required controls:

- Thumbs up/down buttons on the current preview.
- Thumbs up/down buttons for selected library item before push.
- A "Recommended" tab or category option in Library mode.
- Taste status text:
  - `Rate 5 pieces to start personalization`
  - `Learning your taste`
  - `Personalized recommendations active`

Behavior:

- Rating updates should be optimistic but revert on API failure.
- Users without a session should be prompted to sign in.
- Rated state should persist when browsing recommendations.
- Downrated recommendations should disappear from the visible recommendation grid after successful rating.

## Android And Tizen Scope

V1 can be web Studio first.

Do not block on native Android/Tizen rating UI. The TV can keep receiving `new_art` notifications as it does today. A later task can add remote-control thumbs up/down on TV.

## Security And Privacy Requirements

- Ratings require auth.
- User can only rate generated scenes they own.
- User can only attach ratings to TVs they own.
- Do not expose one user's ratings or profile to another user.
- Do not store raw Google tokens.
- Profile JSON must not include email or personal identity fields.

## Migration Plan

1. Add new tables idempotently in `initDatabase()`.
2. Keep existing `feedback` table for backward compatibility.
3. Migrate current callers from `/api/feedback` to `/api/ratings`.
4. Change `/api/feedback` and `GET /api/feedback/:tvId` to require auth and TV ownership. No known anonymous client depends on these endpoints.
5. Optionally backfill authenticated rows from `feedback` where possible:
   - map `content_id` to generated scene if it matches `scene_archive.id`
   - otherwise keep only as raw historical feedback
6. New UI should use `/api/ratings`, not `/api/feedback`.

## Testing Plan

Cloud route tests:

- unauthenticated rating returns 401
- invalid rating/source type returns 400
- cross-user generated scene rating returns 403
- cross-user TV rating returns 403
- library item traversal/invalid filename rating returns 404 or 400
- rating upsert changes prior rating instead of duplicating
- taste profile confidence transitions at 5 and 20 ratings
- recommendations exclude downrated items
- recommendations return diverse cold-start results
- generation response includes taste metadata for authenticated users
- legacy `/api/feedback` write/read endpoints require auth and do not leak another user's TV ratings

Unit tests:

- category scoring
- profile JSON construction
- prompt hint construction
- recommendation sorting and repeat penalties

Manual QA:

- Sign in, pair TV, generate art, thumbs up/down preview.
- Browse library, rate items, open Recommended and confirm ranking changes.
- Downrate a recommended item and confirm it disappears.
- Generate after 5+ ratings and confirm debug payload indicates taste hints were used.

## Acceptance Criteria

- Authenticated user can rate generated and library art.
- Ratings are persisted, upserted, and scoped to the user.
- Legacy feedback endpoints are authenticated, validate rating values, and enforce TV ownership.
- A profile endpoint returns confidence, top categories, style hints, and avoid hints.
- Library recommendations respond to ratings and exclude downrated items.
- Authenticated generation uses taste hints when enough ratings exist.
- Studio exposes rating controls and a recommendation view.
- Existing generate, upload, library browse, and batch push flows continue to pass tests.
- `pnpm --filter @frame/cloud typecheck` passes.
- `pnpm --filter @frame/cloud test` passes.

## Suggested PR Breakdown

### PR A - Ratings And Taste Profile Core

Branch: `feat/taste-profile-core`

Scope:

- DB tables and indexes.
- `taste-profile.ts` service.
- `POST /api/ratings`.
- `GET /api/taste/profile`.
- Route/unit tests.

### PR B - Recommendations

Branch: `feat/taste-recommendations`

Scope:

- `GET /api/recommendations/library`.
- Recommendation scoring.
- Recommendation tests.
- Studio "Recommended" library view.

### PR C - Prompt Personalization

Branch: `feat/taste-generation-hints`

Scope:

- Feed taste hints into `generate()`.
- Include taste metadata in generation response.
- Studio taste status.
- Tests around authenticated generation metadata and prompt hint construction.

## Open Questions For Claude

Resolved by Claude:

1. Migrate callers to `/api/ratings`, and switch `/api/feedback` plus `GET /api/feedback/:tvId` to authenticated ownership-checked endpoints now.
2. Use `${category}/${filename}` for library IDs. This is simple and sufficient for v1.
3. Recommendations should primarily return unrated items, with up to 3 liked favorites mixed in at the end.
4. Start conservative prompt hints at 5 ratings; use full hints at 20 ratings.
5. Studio-only is enough for v1. Android WebView receives the Studio UI for free; no native Android/Tizen rating controls in this release.

## PR A Implementation Handoff

Claude should start with `feat/taste-profile-core`.

Primary files:

- `apps/cloud/src/db.ts`
- `apps/cloud/src/taste-profile.ts`
- `apps/cloud/src/routes/feedback.ts`
- new or existing route file for `/api/ratings` and `/api/taste/profile`
- `apps/cloud/src/__tests__/routes.test.ts` or a focused taste profile route test file

Required PR A scope:

- Add `art_ratings` and `taste_profiles` tables/indexes idempotently.
- Implement the taste profile service with rating upsert and profile recomputation.
- Add `POST /api/ratings`.
- Add `GET /api/taste/profile`.
- Migrate/harden `/api/feedback` and `GET /api/feedback/:tvId` to `requireAuth`, valid ratings, and TV ownership checks.
- Tests for auth, ownership, cross-user scene/TV rejection, rating upsert, profile confidence thresholds, and feedback endpoint migration.
