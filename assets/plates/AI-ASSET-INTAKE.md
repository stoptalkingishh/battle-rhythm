# AI Plate Asset Intake

`scripts/import-ai-plates.mjs` is a local-only import step for original images a project contributor has already generated with DALL-E, Nano Banana, or another provider. It does not call provider APIs, read credentials, submit prompts, or download images.

## Intake Location

Keep generated images outside this repository's deployable `assets/` directory. The default intake directory is the sibling path:

```text
../battle-rhythm-ai-intake/
```

An alternate absolute path is permitted:

```sh
node scripts/import-ai-plates.mjs --input /absolute/path/to/plate-intake
```

The script rejects an input path inside `assets/`, symlinks, subdirectories, unknown files, invalid image signatures, and images larger than 25 MiB.

## Required Files

The intake directory must be flat. It may contain any subset of the 72 IDs from `assets/plates/workout-cards.json` — only approved IDs need to be present at each run. For each supplied ID, provide:

- At least one image named `<id>.webp` and/or `<id>.png`.
- One matching `<id>.webp.json` and/or `<id>.png.json` provenance sidecar for every supplied image.

For example:

```text
../battle-rhythm-ai-intake/
  s1-deadlift.webp
  s1-deadlift.webp.json
  s1-deadlift.png
  s1-deadlift.png.json
  ... all remaining manifest IDs ...
```

Each image sidecar must provide non-empty `generator`, `provider`, `date`, `promptId`, and `licenseAssertion` strings. `date` must be `YYYY-MM-DD`, and `promptId` must exactly equal the image's manifest ID.

```json
{
  "generator": "DALL-E 3",
  "provider": "OpenAI",
  "date": "2026-08-15",
  "promptId": "s1-deadlift",
  "licenseAssertion": "I generated this output in my authorized account, reviewed the provider terms on 2026-08-15, and have the rights required to publish it in this project."
}
```

Additional factual fields such as a generation URL, model version, prompt revision, or reviewer may be retained in the sidecar. Never put API keys, account tokens, private URLs, or personal data in it: selected provenance is published in the browser registry.

## Review And Rights Gate

The sidecar is an assertion, not automated proof of rights or safety. Before import, a responsible reviewer must:

- Confirm the contributor owns or has written permission to publish each exact output and that the applicable provider terms permit the intended public/commercial use.
- Retain the original provider record, prompt, generation date, account authorization evidence, and any required attribution outside deployable assets.
- Check every image for third-party logos, watermarks, recognizable people, copyrighted characters or reference-image copying, unsafe exercise form, anatomy defects, and incorrect exercise/equipment depiction.
- Verify framing, accessibility needs, and that WebP/PNG variants are the reviewed final outputs.
- Record the human reviewer and date in the project review record before release.

Do not import an image when rights, provenance, or visual safety are uncertain. Resolve the issue or regenerate an original replacement first.

## Output

After validation succeeds, the script copies the approved rasters for the supplied IDs to `assets/plates/ai/` and writes `assets/plates/ai/registry.js`, defining `window.BR_AI_PLATES`. The registry includes each imported ID, available WebP/PNG paths, and the required provenance fields by format. IDs without approved images keep their existing fallback (SVG cards). Existing application files are not changed; separately wire the registry into the application only after review.
