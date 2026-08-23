# Battle Rhythm Drive-First Roadmap

## Purpose

Battle Rhythm remains an unofficial, doctrine-first H2F training planner. FM 7-22, ATP 7-22.01, ATP 7-22.02, Army directives, and the existing doctrine content remain the reference for prescribed training. User-entered results are personal records, not doctrine and not medical advice.

This roadmap adapts the useful parts of openGym—guided execution, portable records, progress feedback, and a deliberate offline experience—without adopting a Battle Rhythm backend, account system, or proprietary user-data store.

## Product boundaries

### Required

- Battle Rhythm is a static frontend deployable to GitHub Pages.
- Google Drive is the only durable cloud record system.
- Records live in a user-visible `Battle Rhythm` Drive folder as documented JSON.
- Users can export all data and import it later without losing data.
- Local browser persistence is an encrypted-token-free cache and offline outbox only; it is never the durable source of truth.
- Existing doctrine-backed content stays local in the application bundle and is never changed by analytics or user records.
- All performance features are optional and provide training summaries, not medical or readiness determinations.

### Prohibited

- No Battle Rhythm backend, user database, account service, data warehouse, ads, or sale/share of user data.
- No Drive files in hidden app storage; users must be able to locate their data.
- No durable guest-mode records. A signed-out visitor may explore the app, but must connect Drive before creating permanent data.
- No silent overwrite of concurrent Drive edits.
- No analytics payload containing identity, Google Drive IDs/tokens, workout content, exercise search text, notes, AFT data, health data, performance results, or custom exercise names.

## Storage contract

### Drive folder

```text
Battle Rhythm/
  manifest.json
  sessions.json
  regiments.json
  groups.json
  workout-history.json
  aft-results.json
  custom-exercises.json
```

The first implementation may preserve existing `tracker.json` data during migration, but new code writes `workout-history.json`. Records are JSON objects with a `schemaVersion`, stable `id`, `createdAt`, and `updatedAt` fields. Object IDs are immutable. All timestamps use ISO 8601 UTC.

`manifest.json` contains the folder data schema version, application version, file list, and update timestamp. It must not contain user identity, OAuth tokens, or analytics consent.

### Browser cache and offline outbox

The browser can cache recently loaded Drive records for rendering and can retain pending operations while offline. It must show a persistent sync state: `synced`, `syncing`, `offline changes pending`, `conflict`, or `error`.

An outbox operation contains an operation ID, collection name, object ID, operation type, local timestamp, and payload. The outbox is cleared only after the corresponding Drive write is verified. Sign-out clears cached Drive identity and access state, but must not silently discard pending changes.

### Concurrency

Use append-oriented records for completed workout and AFT results. For mutable plans, regiments, groups, and custom exercises, retain `updatedAt` and a Drive revision/ETag. On mismatch, reload and merge disjoint object IDs. Same-object conflicts require an explicit user choice: keep Drive version, keep local edit, or duplicate as a new plan. Never use unannounced whole-collection last-write-wins replacement.

## Analytics contract

Plausible is the only approved analytics provider. It is loaded only after opt-in and must be implemented as a no-op without consent or configuration.

The event allowlist is limited to:

- `drive_connected`, `drive_sync_succeeded`, `drive_sync_failed`
- `screen_viewed`
- `session_created`, `regiment_created`, `preset_duplicated`
- `workout_started`, `workout_resumed`, `workout_completed`
- `rest_timer_started`, `interval_timer_started`
- `exercise_guide_opened`, `doctrine_reference_opened`
- `data_exported`, `data_imported`
- `analytics_opt_in_changed`

Events have no free-form properties. `screen_viewed` may carry only a fixed screen name from an allowlist. Analytics consent is device-local and is not synced to Drive.

## Delivery sequence

### PR 1: Drive-first record foundation

**Branch:** `feature/drive-first-records`

Scope:

1. Extract a small data-store module from `js/app.js` that distinguishes Drive-backed records, cache, and offline outbox.
2. Upgrade `js/drive.js` to create/read `manifest.json`, return Drive file metadata/revisions, and verify writes.
3. Replace blind local-first mirroring in `js/cloud.js` with Drive bootstrap, cache hydration, queued writes, visible sync states, and conflict detection.
4. Migrate current `br_sessions`, `br_regiments`, `br_tracker`, and `br_groups` records into versioned Drive collection files without data loss.
5. Add a Settings UI showing Drive ownership, last successful sync, pending change count, errors, and export/import controls.
6. Update README and data-format documentation.

Acceptance criteria:

- A Drive-connected user can clear site data, return on another browser/device, and restore records from Drive.
- A record mutation is not reported as saved until Drive confirms it or the UI explicitly labels it pending offline sync.
- Current local-only records migrate safely after a user connects Drive.
- User data can be exported and re-imported without duplicate IDs or loss.
- App remains usable when offline, but clearly distinguishes unsynced work.

### PR 2: Guided workout records and timers

**Branch:** `feature/guided-workout-records`

Depends on PR 1.

Scope:

1. Add a normalized workout-result record for planned and actual sets/reps/load, timed holds, distance/pace, rest, optional RPE/RIR, completion state, and notes.
2. Upgrade the tracker from a Boolean checklist into a session runner that saves individual results.
3. Add rest, interval, and timed-set timers; retain the existing stopwatch only where it remains useful.
4. Add active-session resume using the Drive-backed record model.
5. Display prior comparable result without presenting it as doctrine or medical advice.

Acceptance criteria:

- A user can complete, pause, resume, and finish a workout across refreshes.
- Timed movements record actual duration if stopped early.
- Completion records include enough information to render later history without reconstructing a live session.
- All record writes pass through the Drive-first store.

### PR 3: Regiment Today flow and AFT records

**Branch:** `feature/regiment-today-and-aft-history`

Depends on PR 2.

Scope:

1. Resolve today's regiment assignment and surface a direct start/resume card on Home.
2. Allow rescheduling a missed assigned session without mutating the original regiment template.
3. Add distinct AFT-event result records and a history view.
4. Add adherence summaries based on completed workout records.

Acceptance criteria:

- The Home screen can reliably identify today’s assigned session in the user’s timezone.
- A reschedule is recorded as an occurrence rather than rewriting the regimen definition.
- AFT history is user-entered, clearly labeled as informational, and separate from the doctrine standards table.

### PR 4: Doctrine-aligned insights

**Branch:** `feature/h2f-insights`

Depends on PR 3.

Scope:

1. Add simple adherence and training-activity visualization.
2. Add per-event/per-exercise historical trend views where the record type supports it.
3. Add conservative, explainable progression suggestions with an instructor/user override.
4. Keep all generated summaries separate from cited doctrine and avoid health/readiness claims.

Acceptance criteria:

- Every summary is derived locally from the user’s Drive-backed data.
- Every progression suggestion identifies the data and rule that produced it.
- No feature diagnoses fatigue, injury risk, or medical readiness.

### PR 5: Privacy controls and opt-in Plausible analytics

**Branch:** `feature/privacy-analytics-consent`

Can be developed after PR 1; should be merged only after settings/store changes stabilize.

Scope:

1. Add a standalone analytics adapter with a compile-time/public deployment site ID and fixed event allowlist.
2. Add an explicit Settings opt-in with explanatory privacy copy.
3. Emit only allowed product events and only after consent.
4. Add a privacy note in README and in the application settings.

Acceptance criteria:

- No Plausible script or event request occurs before opt-in.
- No event has arbitrary user-controlled payload fields.
- Opt-out immediately prevents future pageviews and events.
- The product works without Plausible configuration or connectivity.

## Implementation rules

- Favor plain JavaScript modules and small pure helpers over a framework rewrite.
- Add automated tests before extracting complex data transformations. Use Node's built-in test runner where possible to avoid a costly dependency/build setup.
- Keep PRs independently reviewable; no PR may include unrelated visual rewrites or doctrine-data changes.
- Cache-bust only changed browser assets deliberately and document the release update.
- Preserve the existing public disclaimer and add feature-specific language where user trends could be mistaken for medical guidance.

## PR and agent workflow

1. The planning branch records this roadmap.
2. Each feature branch begins from the merged prerequisite branch, not from stale `main`.
3. A bounded low-cost subagent owns one isolated implementation area; it must return changed files, tests run, and unresolved risks.
4. The orchestration agent reviews the diff, runs tests/local smoke checks, and owns integration changes.
5. Each branch receives a focused PR description with acceptance criteria and manual test steps.
6. No branch is pushed or PR opened without repository credentials and a read-back verification of the remote branch/PR.
