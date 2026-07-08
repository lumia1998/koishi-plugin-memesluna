# MemesLuna Semantic Search Simplification Plan

Last updated: 2026-07-07

## Project Background

MemesLuna is a Koishi plugin for managing and serving meme images. It connects three surfaces:

- Local meme collections stored under Koishi data.
- Custom endpoint routes that 302 redirect to external image APIs.
- ChatLuna prompt variables that tell the model how to send images.

The plugin also provides a Koishi Console page for collection management, upload/import, staging review, endpoint management, image metadata editing, and prompt preview.

Before this task, the frontend was concentrated in one very large `client/Dashboard.vue` file. The backend routing, Console RPC, HTTP server routes, ChatLuna variable injection, and commands mostly live in `src/index.ts`. Image storage and database operations live in `src/service.ts`; AI image annotation lives in `src/aiAnnotator.ts`; user-facing config defaults live in `src/config.ts`.

## Work Already Completed In This Session

### Frontend File Split

`client/Dashboard.vue` was reduced from a single large SFC into a thinner component:

- `client/Dashboard.vue`
  - Keeps the template and small component setup.
  - Imports `useDashboard()`.
  - References external scoped CSS.
- `client/composables/useDashboard.ts`
  - Holds the dashboard state, computed values, actions, lifecycle hooks, and watchers.
- `client/styles/dashboard.css`
  - Holds the former scoped CSS from `Dashboard.vue`.

This was intentionally a low-risk extraction: UI structure and behavior were kept as close to the original as possible.

### Shared Console RPC Types

Shared Console RPC types were added:

- `src/console-rpc.ts`
  - Defines `MemesLunaConsoleEvents`.
  - Defines shared payload and result types such as `ConsoleState`, `ConsoleEndpointInput`, `AddStagedImagePayload`, and `ImageMetadataPayload`.
  - Extends `@koishijs/plugin-console` `Events`.

Frontend RPC calls now go through:

- `client/composables/rpc.ts`
  - Exposes `sendMemesLuna()`.
  - Uses `MemesLunaConsoleEvents` to infer parameters and return values.

Backend Console listeners in `src/index.ts` now use the shared payload types for endpoint payloads, staging payloads, and image metadata payloads instead of broad `any`.

### Temporary File Guard

`.gitignore` was updated to ignore `diff.txt`. No actual `diff.txt` was found in the project, and it is not tracked by Git.

## Original Product Issue

The old model-facing API exposed too many concepts:

- `/memesluna/:collection`
- `/memesluna/:collection?q=keyword`
- `/memesluna/:endpoint`
- Optional `/memesluna/:tag` cross-collection tag routes.
- `{tag_routes}` prompt injection.

This made ChatLuna see emotional tags as routes. It also biased AI annotation toward a single emotion tag, even though useful meme retrieval often needs actions, scenes, intent, and visual elements.

The desired direction is to stop exposing standalone tag routes to the model and treat tags as internal search index fields.

## Target Public Routing Model

Reduce the public model to two concepts:

- Exact route: `/memesluna/:name`
  - If `:name` is an endpoint, redirect to its external URL.
  - If `:name` is a collection, return a random image from that collection.
  - If neither exists, return 404.

- Cross-collection semantic search: `/memesluna?q=keyword`
  - Search all indexed images across all collections.
  - Rank by aliases, tags, filename, and synonym expansion.
  - Redirect to a random qualified match.
  - Return 404 if no qualified match exists.

Compatibility behavior:

- `/memesluna/:collection?q=keyword` remains supported as an advanced collection-scoped search path.
- Legacy `/memesluna/:tag` fallback is disabled in this pass and is no longer injected into prompts.
- `enableEmotionTags` remains as a compatibility config field for now, but descriptions now point users toward `/memesluna?q=keyword`.

## Annotation Model

Rename the user-facing concept from "emotion tag" to "semantic annotation" / "semantic search index".

AI-generated `tags` should cover multiple dimensions:

- emotion: happy, wronged, angry, speechless, shocked, shy, tired
- action: hug, pat head, wave, thumbs up, eating, lying flat, crying, laughing, sweating
- scene: comfort, apology, urging, refusal, praise, complaint, help, celebration
- intent: encouragement, cuteness, sarcasm, thanks, begging, perfunctory reply
- visual element: question mark, heart, sweat, tears, sign, food, cat ears

`aliases` should be natural-language search phrases that users or ChatLuna might actually type.

## Implemented Semantic Search Changes

### Config And Prompt Defaults

Updated `src/config.ts`:

- Default annotation prompt now describes "semantic indexing" instead of "emotion tagging".
- `tags` are now requested as 3-8 short semantic labels.
- `aliases` are now requested as 8-15 natural-language search phrases.
- `{{allowed_tags}}` is now framed as reference vocabulary, not a hard whitelist.
- Default ChatLuna injected prompt now advertises:
  - exact collection/endpoint routes
  - `/memesluna?q=关键词` cross-collection search
- The prompt no longer advertises `{tag_routes}` or `/memesluna/标签名`.
- `synonymGroups` descriptions now describe semantic search expansion.

### AI Annotation Parsing

Updated `src/aiAnnotator.ts`:

- Removed the old rule that forced tags into exactly one configured candidate.
- Added normalization for annotation arrays:
  - trim
  - dedupe
  - cap item count
  - cap item length
- Tags outside configured synonym groups are now allowed.

### Metadata Save Rules

Updated Console metadata saving in `src/index.ts`:

- Manual tags are no longer filtered to the configured synonym candidate set.
- Manual tags and aliases are normalized, deduped, and capped.
- Multiple tags are allowed.

Updated `client/composables/useDashboard.ts`:

- Manual tag input no longer rejects tags outside `synonymGroups`.
- Tag input now appends multiple semantic tags instead of replacing with one tag.
- Bulk tag editing no longer restricts to one tag.

Updated `client/Dashboard.vue`:

- UI copy now says "semantic annotation", "semantic tags", and "search aliases".
- Removed wording that described tags as cross-collection routes.
- Gallery cards now show up to 6 semantic tags and render a `+N` badge for hidden tags; the editor still shows the full tag list.

### Routing And Prompt Injection

Updated `src/index.ts`:

- Added a shared `findByQuery()` helper for keyword search.
- Added root search handling:
  - `GET /memesluna?q=keyword`
  - `GET /memesluna/?q=keyword`
- Kept `/memesluna/:collection?q=keyword` as compatibility behavior.
- Removed legacy `/memesluna/:tag` fallback from `applyDynamicForward()`.
- `{tag_routes}` is still set/replaced for compatibility, but now resolves to an empty string.
- `{tags}` now resolves to semantic search reference vocabulary from `synonymGroups`.

Updated `src/service.ts`:

- Route inventory wording for optional synonym groups now describes "semantic search reference words" rather than tag routes.

### Documentation

Updated `README.md`:

- Documents `/memesluna?q=关键词` as the recommended cross-collection semantic search path.
- Describes `tags` as semantic index fields covering emotion/action/scene/intent/visual elements.
- Removes "emotion tag routes" as a recommended feature.
- Notes `{tag_routes}` is only a compatibility placeholder.

## Files Changed Or Added

Major files:

- `.gitignore`
- `README.md`
- `client/Dashboard.vue`
- `client/composables/rpc.ts`
- `client/composables/useDashboard.ts`
- `client/styles/dashboard.css`
- `docs/semantic-search-simplification-plan.md`
- `src/aiAnnotator.ts`
- `src/config.ts`
- `src/console-rpc.ts`
- `src/index.ts`
- `src/service.ts`

Ignored build/local artifacts visible in the working tree:

- `dist/`
- `lib/`
- `node_modules/`
- `tsconfig.tsbuildinfo`
- packaged `.tgz` files

These are ignored and should not be included in commits unless intentionally publishing package artifacts.

## Review Focus

Reviewers should pay special attention to:

- Whether disabling `/memesluna/:tag` fallback is acceptable for existing users.
- Whether `/memesluna?q=keyword` should return 404 or fallback to a random image when no candidate matches.
- Whether the score threshold `>= 6` is still appropriate for cross-collection search.
- Whether prompt wording gives ChatLuna enough guidance without reintroducing tag routes.
- Whether allowing free-form tags creates too much tag drift in Console metadata.
- Whether `enableEmotionTags` should be renamed or deprecated in a future breaking release.

## Follow-up Fixes On 2026-07-07

### Decisions

- Management HTTP endpoints were not changed in this pass. Deployment assumes Koishi Console login and the configured Koishi account/password protect normal management access.
- Endpoint names and collection names now share one public route namespace and must not conflict.
- Chinese endpoint/collection names remain supported, but generated URLs and prompt-visible route paths should use encoded path segments.

### Issues Fixed

- Single semantic tag or synonym hits could fail the `>= 6` search threshold because term hits on `tags` only scored `+4`.
- Synonym expansion compared raw strings, which was weaker than the normalized matching used by actual search fields.
- Route inventory and Console preview links emitted raw Chinese path segments, which could fail in downstream clients or model-generated image URLs.
- Endpoint and collection creation allowed duplicate names even though `/memesluna/:name` can only resolve one target.
- The frontend endpoint-name hint implied Chinese names were unsupported.
- The default ChatLuna prompt hard-coded `/memesluna`, so custom `backendPath` values could render inaccurate examples.

### Implementation

- `src/index.ts`
  - Normalized synonym-group matching during query expansion.
  - Increased term/synonym tag hit score from `+4` to `+6`, so one clear semantic tag hit qualifies.
  - Added safe route-parameter decoding for HTTP routes.
  - Passed configured synonym groups into route inventory rendering.
  - Added `{backend_path}` rendering for prompt templates.
- `src/service.ts`
  - Rejected collection creation when an endpoint with the same name exists.
  - Rejected endpoint creation when a collection with the same name exists.
  - Encoded endpoint and collection names in generated route inventory paths.
- `client/composables/useDashboard.ts`
  - Encoded collection/endpoint names in preview URLs and copied route URLs.
  - Added a shared route display helper for encoded public paths.
- `client/Dashboard.vue`
  - Updated endpoint-name help text to say Chinese names are supported and names cannot collide with collections.
- `README.md`
  - Documented the shared route namespace and encoded Chinese route behavior.
  - Updated the scoring table for tag term/synonym hits.
  - Documented the `{backend_path}` prompt placeholder.

### File Tracking Note

The frontend split added required source files under `client/composables/`, `client/styles/`, and `src/console-rpc.ts`. They must be included in the next commit together with the reduced `client/Dashboard.vue`; otherwise the package will not rebuild from source.

## QA Checklist

Automated checks already run during this session:

- `npm run typecheck`
- `npx yakumo build`
- `git diff --check`

Manual QA still recommended:

- Confirm `/memesluna/:collection` still returns collection images.
- Confirm `/memesluna/:endpoint` still redirects endpoint URLs.
- Confirm `/memesluna?q=keyword` searches across collections.
- Confirm `/memesluna/?q=keyword` also works.
- Confirm `/memesluna/:collection?q=keyword` still works as compatibility behavior.
- Confirm `/memesluna/:unknown` returns 404 instead of acting as a tag route.
- Confirm generated prompt no longer instructs ChatLuna to use `/memesluna/:tag`.
- Confirm AI annotation can store multiple tags including action/scene/intent terms.
- Confirm manual Console tag editing accepts free-form semantic tags and multiple tags.
- Confirm gallery cards show up to 6 tags plus a `+N` overflow badge, while the edit dialog still shows all tags.
- Confirm the prompt preview page renders `{tag_routes}` as empty and shows the new global search guidance.
