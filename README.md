# Battle Rhythm

An unofficial Army **H2F (Holistic Health and Fitness)** workout planning and tracking app — built for H2F Instructors and unit leaders to compose training sessions and regiments grounded in **FM 7-22** doctrine, and for Soldiers to track them and copy the plan to their notes app.

Runs entirely client-side on GitHub Pages. No build step, no backend — sessions, regiments, and tracker data persist in your browser's `localStorage`, with an optional Google Drive backup (sign in from Settings and workouts sync to a private "Battle Rhythm" folder in your own Drive).

## Features

- **Exercise Library** — 80 exercises and activities from FM 7-22 / ATP 7-22.02 across all six H2F components, each with a component tag, form cues, programming, safety notes, AFT-event mapping, and doctrine citation. Every exercise has a visual plate: an AI-generated anatomy illustration where approved, otherwise a generated SVG technical card.
- **Session Builder** — compose a training session using the doctrinal **preparation → activity → recovery** structure; add exercises and drills, set sets/reps/rest, target RPE and focus component. Preview any exercise or drill in a guide modal from the builder before adding it.
- **Regiments** — group saved sessions across the training week and tag a periodization phase (base / build / peak / recovery).
- **Tracker** — check off exercises, mark sessions complete, review your training log, and see a **live session summary** (sets / reps / volume) as you log results. Strength results are logged **per set** with an optional **warm-up** mark that keeps them out of volume, 1RM and progression.
- **Screen stays awake** — starting the stopwatch requests the Screen Wake Lock, so the display doesn't sleep mid-session; it's released when you reset the stopwatch.
- **Copy to Notes** — generate a clean text summary of any exercise, session, or regiment and copy it straight into your notes app (Apple Notes, Google Keep, etc.).
- **Doctrine tab** — the Army Fitness Test (AFT) five events, session structure, drills, load/HR zones, periodization, weekly splits, sample templates, training strategies, safety & compliance, and all sources.
- **Personal AFT history** — record dated event results and personal notes in your own Drive-synced data. These records are not official scores or medical readiness determinations.
- **Progress** — a per-exercise estimated 1RM chart (Epley/Brzycki/Lombardi) built from what you log in the Tracker, plus a rep/set/volume history table and all-time best estimate. Exercise cards also show the muscle groups each lift targets.

## Current doctrine

The AFT (**Army Fitness Test**) replaced the historic Army Combat Fitness Test on **1 June 2025** per Army Directive 2025-06. It has **five events** — MDL, HRP, SDC, PLK, 2MR — the Standing Power Throw is not a current AFT event. The Combat Field Test (CFT) is in its initial implementation period for designated combat specialties under AD 2026-07; consult current Army policy for applicability and standards.

## Google Drive backup

Sessions, regiments, tracker logs, and tag groups can be backed up to your own Google Drive (same mechanism as the `openquiz` app). With the keys below configured, the Settings modal gains a **Google Drive backup** section:

- **Continue with Google** signs you in via Google Identity Services (scope limited to `drive.file` — only files this app creates).
- Data is stored as JSON files in a per-user **"Battle Rhythm"** folder: `sessions.json`, `regiments.json`, `tracker.json`, `groups.json`.

### Storage & sync (source of truth, offline-first)

`localStorage` is the **fast device-local cache and the source the UI renders from**; Drive is the **durable sync target**. Records are never silently lost:

- **Guest mode (no keys / not signed in):** fully offline, everything lives in `localStorage`, no sign-in UI — identical behaviour to before. Nothing is written to Drive.
- **Signed in — durable writes:** every save appends a pending op to a small, append-only **outbox** (persisted in `localStorage` under `brsync_outbox`) and schedules a debounced flush. An op is only removed after Drive **confirms** the upload *and* returns the file's new `modifiedTime`; a failed or offline write stays queued with its attempt count bumped and is retried on the next save, the next `online` event, or a manual **Sync now** in Settings.
- **No silent overwrite — reconcile first:** before it overwrites a collection, the cloud layer reads the current Drive `modifiedTime`. If it differs from the last modifiedTime this device wrote, the remote collection is **merged into local** (Drive wins id collisions; local-only rows are kept) before anything is pushed, so a collection changed from another device/browser is reconciled rather than clobbered.
- **Healthy conflict/`modifiedTime` plumbing:** `js/drive.js` reads and writes expose `modifiedTime`; the cloud layer records the last verified base modifiedTime per file (`brsync_mtime_*`) so it can detect a changed remote.
- **Bootstrap restore:** if `localStorage` is cleared or empty but Drive has records, sign-in pulls Drive into local (local-only reconciliation keeps both). Sign-out keeps the outbox device-local so queued changes flush on the next sign-in.
- The master password hash is intentionally **not** synced — it stays local to the device.

Sync state is surfaced in the Settings → *Google Drive backup* section: `syncing`, `pending` (N offline changes queued, + a Sync now button), `ready` (synced), `guest`, and `off`.

To enable it:

1. In the [Google Cloud Console](https://console.cloud.google.com), create/select a project, enable the **Google Drive API**.
2. Create an **OAuth 2.0 Client ID** of type *Web application* and add this site's origin (e.g. `https://stoptalkingishh.github.io`) under **Authorized JavaScript origins**.
3. Create an **API key**.
4. Fill both into `js/config.js` (`BR_GOOGLE_CLIENT_ID`, `BR_GOOGLE_API_KEY`) and deploy. Both are public client-side identifiers, the same way `openquiz` bakes `NEXT_PUBLIC_GOOGLE_*` into its static build.

## Repository layout

```text
index.html                        App shell, nav, modals; cache-busted script tags
css/styles.css                    All styles
js/app.js                         Views, state, localStorage, builder/tracker logic
js/config.js                      Google client ID + API key for Drive backup (blank = guest mode)
js/drive.js                       Google Identity Services auth + Drive v3 storage layer (reads/writes expose modifiedTime)
js/cloud.js                       Hybrid sync: durable outbox, retry/online replay, reconcile-before-overwrite
js/sync-core.js                   Pure merge/outbox/reconcile logic (window.BRSync); unit-tested in Node
js/exercise-coach.js              Inline muscle-map coach figure renderer
js/run-visual.js                  Run-track visualization for run events
js/data/exercises.js              80 exercise schema entries
js/data/exercises-atp.js          163 exercise schema entries from ATP 7-22.02
js/data/doctrine.js               Doctrine content (components, drills, AFT, programming)
js/data/movement-guides.js        Coach-figure pose/pattern definitions
js/data/muscle-maps.js            Muscle map geometry used by the coach figure
js/data/workout-cards.js          Generated 80-entry card manifest (do not hand-edit)
js/data/aft-standards.js          AFT standards tables
assets/plates/ai/*.webp           Approved AI anatomy plates (60 registered)
assets/plates/ai/registry.js      Browser registry for approved AI plates
assets/plates/svg/*.svg           Generated SVG fallback cards for every exercise
assets/plates/atp/*.webp          Official public-domain ATP 7-22.02 figures
assets/plates/ai-image-prompts.json  Master prompt store (80 prompts, source of truth)
assets/plates/workout-cards.json  Manifest for card generation + plate intake
scripts/generate-workout-cards.mjs  Regenerates SVG cards + js/data/workout-cards.js
scripts/import-ai-plates.mjs      Local AI-plate import/validation tool
scripts/extract-atp-figures.py    Extracts public-domain figures from the ATP PDF
scripts/generate-atp-exercises.py Regenerates js/data/exercises-atp.js
blender/                          Source-only MakeHuman/Blender render pipeline (kept for reference)
research/                         Web-reference research docs behind the exercise data
```

## Visual plates

- **AI plates** (`assets/plates/ai/*.webp`): original AI-generated anatomy illustrations, registered in `registry.js` (`window.BR_AI_PLATES`) with per-image provenance (generator, provider, date, prompt ID, license assertion). 60 of 80 exercises currently have an approved AI plate.
- **SVG cards** (`assets/plates/svg/*.svg`): generated fallbacks for every exercise, rendered when no AI plate is registered.

The exercise guide modal shows the AI plate first, falling back to the SVG card or the inline coach figure. The library tiles always show a compact card; the plate renders inside the guide modal. See `assets/plates/README.md` and `assets/plates/AI-ASSET-INTAKE.md` for the plate pipeline and intake workflow.

## Development workflow

- **Cache busting:** every script/link tag in `index.html` carries `?v=battle-rhythm-N`. Bump N on any change so GitHub Pages serves fresh assets.
- **Tests (pure sync logic):** the queue/merge/reconcile math lives in `js/sync-core.js` (no browser deps) and is unit-tested with Node's built-in `node:test` — no installs, no build step:

  ```bash
  npm test          # runs tests/sync-core.test.js
  npm run check     # node --check syntax pass over the core JS files
  ```
- **Exercise data:** edit `js/data/exercises.js`, `js/data/movement-guides.js`, and add a manifest entry to `assets/plates/workout-cards.json`, then regenerate the SVG cards and `js/data/workout-cards.js`:

  ```bash
  node scripts/generate-workout-cards.mjs
  ```

- **AI plates:** generate images from `assets/plates/REMAINING-PROMPTS.md`, save as `<id>.webp` under `assets/plates/ai/`, and run `node scripts/import-ai-plates.mjs` (see `AI-ASSET-INTAKE.md`).

## Run locally

```bash
python3 -m http.server 8123
# open http://localhost:8123
```

## Disclaimer

This is an unofficial product and **not** an official Department of the Army publication. It is not medical advice. Soldiers should train per their current profile (DA Form 3349 / DD Form 689) and unit policy; leaders apply risk management per ATP 5-19.

## Sources

- FM 7-22, Holistic Health and Fitness (2020, INC C2 2025)
- ATP 7-22.01 / ATP 7-22.02
- Army Directive 2025-06 (AFT) and AD 2026-07 (CFT)
- TB MED 507 / 508, AR 350-1, AR 40-501, AR 600-9, AR 40-5, ATP 5-19, AR 385-10
