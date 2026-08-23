# openGym Feature Adoption Plan (Battle Rhythm)

Target repo: `github.com/stoptalkingishh/battle-rhythm`
Reference code: `gitea.com/DuarteSantos/openGym` (cloned to `/opt/data/workspaces/opengym2`)
Status: **planning** · Branch to develop on: `feature/opengym-adoption`

This document explains **what** we adopt, **why**, and **exactly how** (file-by-file) we
port each feature into Battle Rhythm's architecture. It is grounded in the real openGym
source, not its README marketing copy.

---

## 0. Licence & strategy (read first)

- openGym is **AGPL-3.0**. Battle Rhythm has **no `LICENSE` file**.
- AGPL's network clause means a derivative work must offer its source under AGPL to users
  over a network. Blindly copying openGym source into an unlicensed app is a legal hazard.
- **Strategy: clean-room reimplementation.** Treat openGym as a specification. The pure
  *logic* we want (1RM math, progression rules, set aggregation) is standard public math;
  we write it fresh in Battle Rhythm's style + Node tests. The *creative assets* (muscle-map
  SVG figures, exercise photos/GIFs) are **not** copied — Battle Rhythm already has its own
  AI-plate pipeline (`assets/plates/ai/*.webp`, `registry.js` provenance), which we extend.
- What is copyable safely: algorithm facts (Epley/Brzycki/Lombardi formulas, wake-lock
  browser API pattern), the feature *behaviour* descriptions. What is not: code text, images, SVG paths.
- If you ever want to vendor openGym source verbatim, stop and decide AGPL adoption first.

---

## 1. Architecture adaptation strategy

Battle Rhythm is no-build vanilla JS + HTML/CSS; openGym is React 19 + Redux + Vite. They do
not merge — **we port behaviour**, mapping openGym modules into Battle Rhythm's layered layout:

| openGym | Battle Rhythm port |
|---|---|
| `lib/*.js` pure logic (CommonJS?/ESM) | `js/data/*.js` UMD module (`window.BR_*`) + `tests/*.test.js` (node:test) |
| React views (`views/*.jsx`) | `render*()` functions in `js/app.js` + sections in `index.html` |
| React components (charts, body map) | vanilla `js/chart.js` (SVG) + existing `js/data/muscle-maps.js` |
| Redux `store/useStore.js` | `localStorage` via `load()/store()`; Drive sync via `BRSync.FILE_MAP` (`js/sync-core.js`) |
| guided workout flow | existing tracker (`js/data/tracker-schema.js`, `js/timer.js`) extended |

Port rule: **every new pure module ships with a `tests/*.test.js`**, added to `npm run check`
and `node --test`. Follow the `aft-results.js` precedent exactly (UMD wrapper, pure funcs, node:test).

---

## 2. Data-model additions

openGym keeps a set-like model (`{ w, r, sec, done, warmup }`, superset `group` ids, cardio
`{min,speed}`, effort `RIR/RPE`). Battle Rhythm already logs *actual results* per set
(feature branch `a443345`... `cc7f54a`). Extend the tracker item model.

New/updated item fields (`js/data/tracker-schema.js` v3):
- `mode`: `"reps"` | `"time"` (default `reps`) — enables timed exercises (planks, hangs, carries).
- `done`: per-set completion (existing).
- `value` captured as `{ reps?, sec?, w?, min?, speed? }` depending on `mode`.
- `warmup`: `bool` on a set — excluded from 1RM/progression (openGym `isWarmupRow`).
- `superset`: `groupId` — pair exercises; rest once per round (`supersetFlow.js`).
- `perside`: `bool` — log total, display "8 per side", target steps in twos.
- `effort`: `{ scale:'RIR'|'RPE', val:number }` per set, off by default, never affects progression.
- `bodyweight`: `bool` on an exercise — no weight column; reps-only stepper; weight means *added* load (dip belt).

New sync keys (`js/sync-core.js` `FILE_MAP` additions, Drive-synced like `br_aft_results`):
- `br_bodyweight` → `bodyweight.json` (dated weigh-ins)
- `br_routines` → `routines.json` (weekly plan + progression policies)
- `br_personal_exercises` → `personal-exercises.json` (custom exercises)
- `br_settings` → `settings.json` (unit, wake-lock toggle, effort scale, formula)
- `br_personal_estimates` → `personal-estimates.json` (optional explicit 1RM overrides)

All are id-keyed arrays → merge with existing `mergeById` (remote-wins), no new merge code.

---

## 3. Feature → source mapping & action plan

Priorities P1 (user-requested, do first) … P3 (full list, later). "Pull from" = openGym source
path; "Port to" = Battle Rhythm file.

### P1-A · Charts for gym weight-lifting increases ⚖️
- **Pull from:** openGym `lib/onerm.js` (Epley/Brzycki/Lombardi, `REP_CAP=12`,
  `estimate1RM`, `bestSetOf`, `e1rmSeries`, `best1RM`, `is1RMRecord`, `PREC`); chart component `components/LineChart.jsx` (SVG, goal line, axes, invert for RIR).
- **Port to:**
  - `js/data/onerm.js` (UMD) — same function names, reimplemented clean + tests `tests/onerm.test.js`.
  - `js/chart.js` — vanilla SVG line chart renderer (goal line, colored gains/losses, hover), ports LineChart's *behaviour*.
  - New **Progress** view: pick an exercise → 1RM trend (from best eligible set per workout) and working-weight trend with a settable goal line.
  - Data: read completed sets from `br_tracker` via a new `js/data/set-history.js` aggregate (port of `history.js` `workoutVolume`, `setsDone`, `setsDoneActive`, `bestWeightFor`).
- **Accept:** a Deadlift/Squat etc. shows a rising 1RM curve + goal line; warmup sets excluded; no estimate above 12 reps.

### P1-B · Body-part images for targeted workouts 💪
- **Pull from:** openGym `lib/body-paths.js` + `lib/muscles.js` (MUSCLES, `loadOf`, `levelsOf`, `rankOf`,
  `musclesOf`, `normalizeMuscleGroups`) as *behaviour spec*.
- **Port to:**
  - Reuse Battle Rhythm's existing per-pose figure library `js/data/muscle-maps.js` and AI plates `assets/plates/ai/*.webp` (already registered per-exercise).
  - `js/data/muscle-groups.js` (UMD) mapping each exercise → primary/secondary muscle targets + component (chest, back…), ported from openGym's muscle taxonomy.
  - On an exercise card / tracker detail: highlight the targeted muscle groups on the existing figure; show figure image next to each phase item.
- **Accept:** every exercise point shows a figure with the muscle groups it targets highlighted.

### P1-C · Reps completed during a workout ➕
- **Pull from:** openGym `lib/history.js` (`modeOf`, `setLabel`, `format`, `workoutVolume`, `setsDone`),
  `lib/finish-workout.js`.
- **Port to:**
  - `js/data/set-history.js` (UMD): per-exercise sets (reps vs timed), total reps, volume, %done.
  - Extend tracker render (`js/app.js` `renderTracker`) to show live "X/Y reps done" and a per-set reps stepper; extend the session history item to show recorded + target reps, and a "today's total reps/volume".
- **Accept:** completing sets shows running rep totals; history shows reps per exercise per date.

### P2 · Guided "today" session & advanced set logging
- **Pull from:** `lib/starter.js`, `lib/finish-workout.js`, `lib/workout-model.js` (timed mode,
  per-side, effort), `lib/progression.js` (policies: off/linear/greyskull/double/time, deload, stalls).
- **Port to:** `js/data/timer-core.js` + `js/data/tracker-schema.js` v3 (add `mode`/`perside`/`effort`/
  `warmup`/`superset` fields), `js/data/progression.js` + `tests/progression.test.js`, `js/data/effort.js`.
  Tracker opens today's plan, prompts body weight first, prefills last weights, shows PR toast,
  offers timed sets, warm-up set toggles, reps-per-side.
- **Accept:** per-feature flags behave exactly as spec'd (deload on stall, warmups out of 1RM, etc.).

### P3 · Remaining features (roadmap)
- **Supersets** — `supersetFlow.js` → `js/data/superset.js`; pair/unpair, rest at round end.
- **Mid-session add/remove exercise** — `Workout.jsx` → `renderTracker` edit controls.
- **Freestyle sessions with prefill** — `freestyleConfig`/`buildSets` → "Start freestyle" button, prefill last values.
- **Screen wake lock** — `lib/wakelock.js` → `js/wakelock.js` (vanilla, re-acquire on visibilitychange), toggle in settings.
- **Cardio (time+speed)** — extend `mode:"time"` with `{min,speed}`; `History.jsx` readout.
- **Weekly plan + reschedule day** — `Plan.jsx`, `RoutineEdit.jsx` → `js/data/week.js` + routine view; reschedule moves an entry.
- **Equipment filter** — openGym `eq` taxonomy → add `equipment` filtering on Home (adapt existing `"aft"` filter).
- **Share/export plan** — `lib/plan-share.js` → `downloadPlan()`/`importPlan()` (no workouts/weigh-ins).
- **Custom exercises** — `EXDB`+`id` convention → `br_personal_exercises` array, behaves like built-ins.
- **Activity heatmap** — `components/Heatmap.jsx` → `js/heatmap.js` SVG year grid from `br_tracker`.
- **Muscle map (Balance/Fatigue/Strength) 3-way** — `lib/recovery.js`, `lib/recovery-view.js`,
  `components/BodyMap.jsx` → extend `js/data/muscle-groups.js` + front/back static figure.
- **Push notifications** — `lib/push.js` → `js/push.js` (rest-timer alert + planned-day reminder; opt-in per profile).
- **Effort (RIR/RPE) column** — part of P2 data model; UI is an optional third column in tracker.

---

## 4. Phased build order

| Phase | Scope | Exit criteria |
|---|---|---|
| **0** | Schema v3 (`mode`,`warmup`,`superset`,`perside`,`effort`,`bodyweight`), new sync keys, port `onerm`/`set-history`/`muscle-groups` pure libs + tests | `npm test` + `npm run check` green |
| **1** | Progress charts (1RM+goal), body-part highlights, live rep tracking | P1-A/B/C acceptance |
| **2** | Guided session: prefill, PR toast, timed/warmup/perside/effort, progression rules | P2 acceptance |
| **3** | Supersets, freestyle, mid-session edits, wake lock, cardio | P3 basic subset |
| **4** | Weekly plan+reschedule, equipment filter, share/export, custom exercises | P3 feature set |
| **5** | Heatmap, 3-way muscle map, push notifications | P3 complete |

Each phase ends with a **commit on `feature/opengym-adoption`** (per-feature commits), `npm test`
green, and a manual browser pass of the affected view.

---

## 5. Sync & privacy posture

- Everything stays **privacy-local + Drive-synced on opt-in**, matching the `br_aft_results`
  precedent: `localStorage` primary, `BRSync.FILE_MAP` mirror only when signed in.
- New collection = one line in `FILE_MAP` + `tests/sync-core.test.js` mapping update (same as the
  AFT PR did for `br_aft_results`). No merge-algorithm change (all id-keyed arrays).
- No telemetry. No external exercise images pulled at runtime — assets ship in the repo.

---

## 6. Risks & open questions

1. **Licence** — clean-room confirmed for logic; assets regenerated via existing AI pipeline. If we
   vendor any openGym source verbatim, that file becomes AGPL.
2. **Schema migration** — `tracker-schema.js` already has a v1→v2 migration precedent; add v2→v3
   (default new fields) preserving existing history. Test idempotency.
3. **Scope** — "all of openGym" is large. Recommended: land Phases 0–1 first (your P1 priorities),
   review, then continue. Confirm the ordering before code starts.
4. **`br_tracker` history** — 1RM/trend curves need structured set data; older sessions without
   `{w,r}` per set simply don't produce a point (matches openGym `bestSetOf` returning null).

---

## 7. Immediate next step (recommended)

Land **Phase 0** as the first PR:
1. `tracker-schema.js` v3 + migration (adds `mode`, `warmup`, `perside`, `effort`, `bodyweight`, `superset`).
2. New pure modules `onerm.js`, `set-history.js`, `muscle-groups.js` + their `tests/*.test.js`.
3. New sync keys in `sync-core.js` `FILE_MAP` + mapping test.
4. `npm run check`/`node --test` green, commit on `feature/opengym-adoption`.

Then Phase 1 delivers your visible wins (charts, body map, rep totals) on top of a tested foundation.