# Which exercises actually lack a visual, and why

**Issue:** #1. **Date:** 2026-09-30.

## The counting was wrong in a way that mattered

`BR_AI_PLATES` registers 60 plates and the README said "60 of 80 exercises have
an approved AI plate". Both are true and neither is the number a user sees.

`workoutCard()` in `js/exercise-coach.js` resolves an exercise's visual in this
order, first match wins:

1. official ATP figure
2. SVG technical card
3. AI plate

An official figure outranks an AI plate. Counting what is actually displayed:

| tier | core exercises |
|---|---|
| official ATP figure | 28 |
| AI plate | 37 |
| SVG card | 15 |
| **nothing** | **0** |

So of the 20 exercises counted as "missing an AI plate", **5 already display an
official figure** (`p4-8-count-t-push-up`, `n4-shuttle-sprint`,
`m8-bent-leg-body-twist`, `mb2-rear-lunge`, `mb3-high-jumper`). The real
number needing generated art is **15**, not 20.

Separately, 23 of the 60 registered AI plates are never displayed, because an
official figure wins for those exercises. They are still shipped and still serve
as the fallback if an official figure is unavailable, so this is a cost note for
#12 rather than dead weight to delete.

**No exercise renders an empty tile.** All 80 have a visual, and the 15 fall
back to the inline coach figure in the guide modal.

## The 15 that need art

Ten AFT / organisational runs:

`a1-unit-formation-run`, `a2-ability-group-run`, `a3-release-run`,
`a5-2-mile-run`, `a6-sustained-run`, `n1-30-60s`, `n2-60-120s`,
`n3-300-meter-shuttle-run`, `n7-sprint-intervals`, and (with
`mb9-pmcs-drill`) the PMCS composite.

Five stability and recovery drills: `m2-hand-release-push-up`,
`mb6-shoulder-stability-drill`, `mb7-hip-stability-drill`,
`mb8-recovery-drill-stretches`, `r7-band-chest-stretch`.

## Why the official figures cannot cover them

Checked against all 254 figures extracted from ATP 7-22.02, including the 63
that #12 dropped as unreachable:

- **No figure depicts an AFT event.** AFT events are *administered and depicted*
  in **ATP 7-22.01, Holistic Health and Fitness Testing** — a different
  publication. `atp-catalog.json` records its source as "ATP 7-22.02 (public
  domain)" only, so 7-22.01 was never extracted.
- **The PMCS and shuttle-sprint figures that do exist are already bound.** ATP
  7-22.02 has 15 individual PMCS figures (spine, ankle, knee, hip, shoulder,
  arm, elbow/wrist) and six MMD figures. All are mapped to the more specific
  `atp-*` roster exercises (`atp-pmcs-spine-neck`, `n4-shuttle-sprint`, and
  so on). Re-pointing them at the composite core exercises would take the
  authoritative figure away from the exercise that names it, for a partial
  depiction.

An earlier name-similarity pass suggested mapping the *modified* drill variants
onto the standard drills. That was wrong and was not done: `mb2-rear-lunge`
already maps to the correct standard figure `3-2` ("PD2 Rear Lunge"), and the
orphan `3-3` is a second rear-lunge plate, not a missing one. Substituting
modified variants for standard movements would have been a doctrinal error.

## The two real paths, both needing a human

**1. Extract ATP 7-22.01 figures.** Concrete, licensable, and the publication
is already cited as a source in `CONTRIBUTING.md` and `js/data/doctrine.js`.
`scripts/extract-atp-figures.py` takes a source document and a catalog path, so
this is a matter of pointing it at 7-22.01 and mapping the new ids. This is the
only path that would cover the 10 AFT events with authoritative public-domain
art. It does not cover the 5 stability drills, which are FM 7-22 preparatory
drills rather than test events.

**2. The Blender / MakeHuman pipeline.** `blender/` is built for exactly this
and is **human-gated by construction**: `blender/README.md` requires a manually
reviewed MakeHuman character, one manually reviewed action per manifest id, and
five review gates (provenance, rig, pose, frame, delivery) before a plate may be
shipped. The source `.blend` is deliberately kept out of the repo. It also
cannot currently run at all — the reviewed rig and pose library do not exist
yet. This is the designed path and it is not automatable, by intent.

## Recommendation

Do path 1 for the AFT events; leave the 5 stability drills on their generated SVG
cards, which are uniform, validated, and already render. Neither path should be
closed by generating AI art for a movement the doctrine depicts with an official
figure — the official figure is the better asset and already wins in the
resolver.
