# Battle Rhythm

An unofficial Army **H2F (Holistic Health and Fitness)** workout planning and tracking app — built for H2F Instructors and unit leaders to compose training sessions and regiments grounded in **FM 7-22** doctrine, and for Soldiers to track them and copy the plan to their notes app.

Runs entirely client-side on GitHub Pages. No build step, no backend — sessions, regiments, and tracker data persist in your browser's `localStorage`.

## Features

- **Exercise Library** — 46 exercises and activities from FM 7-22 / ATP 7-22.02, each with component tag, form cues, programming, safety notes, AFT-event mapping, and doctrine citation.
- **Session Builder** — compose a training session using the doctrinal **preparation → activity → recovery** structure; add exercises and drills, set sets/reps/rest, target RPE and focus component.
- **Regiments** — group saved sessions across the training week and tag a periodization phase (base / build / peak / recovery).
- **Tracker** — check off exercises, mark sessions complete, and review your training log.
- **Copy to Notes** — generate a clean text summary of any exercise, session, or regiment and copy it straight into your notes app (Apple Notes, Google Keep, etc.).
- **Doctrine tab** — the Army Fitness Test (AFT) five events, session structure, drills, load/HR zones, periodization, weekly splits, sample templates, training strategies, safety & compliance, and all sources.

## Current doctrine

The AFT (**Army Fitness Test**) replaced the historic Army Combat Fitness Test on **1 June 2025** per Army Directive 2025-06. It has **five events** — MDL, HRP, SDC, PLK, 2MR — the Standing Power Throw is not a current AFT event. The Combat Field Test (CFT) is in its initial implementation period for designated combat specialties under AD 2026-07; consult current Army policy for applicability and standards.

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
