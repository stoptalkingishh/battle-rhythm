# Plate Delivery

Exercise plates live in two layers:

- **AI plates** — `assets/plates/ai/<id>.webp`, original AI-generated anatomy illustrations. Each approved plate is registered in `assets/plates/ai/registry.js` as `window.BR_AI_PLATES` with per-format provenance (generator, provider, date, prompt ID, license assertion). WebP is the only delivered format.
- **SVG cards** — `assets/plates/svg/<id>.svg`, generated technical fallbacks for every exercise. These render whenever no AI plate is registered, so the library never shows an empty tile.

The application shows the AI plate in the exercise guide modal when one exists; otherwise it falls back to the SVG card. Library tiles show a compact card and do not preload plates.

## Authoritative sources

- `assets/plates/workout-cards.json` — the card/plate manifest (80 entries). Used by `scripts/generate-workout-cards.mjs` and `scripts/import-ai-plates.mjs` for parity checks.
- `assets/plates/ai-image-prompts.json` — the master prompt store (80 prompts, `prompt`, `negativePrompt`, `sourceStatus`). Source of truth for generated plate prompts.
- `assets/plates/REMAINING-PROMPTS.md` — copy-paste list of prompts for exercises that still lack an AI plate.

## Asset pipeline

- `scripts/generate-workout-cards.mjs` regenerates the SVG cards and `js/data/workout-cards.js` from the manifest. Do not hand-edit `js/data/workout-cards.js`.
- `scripts/import-ai-plates.mjs` imports locally generated, reviewed AI plates from an intake directory (see `AI-ASSET-INTAKE.md`).

## Source tooling

`blender/` is a source-only MakeHuman/Blender render pipeline, kept for reference. It was not used to produce the shipped plates (all 60 are AI-generated per the registry). Never deploy source `.blend` files, MakeHuman exports, MPFB data, pose libraries, working textures, or render caches.