<!--
  Two rules from docs/architecture/open-gym-port-plan.md:42 are enforced in CI
  rather than requested here, but stating them keeps a PR from bouncing:
    1. every new pure module ships with a tests/*.test.js
    2. the cache-buster is bumped
-->

## What does this change?

<!-- One or two sentences. What behaviour is different after this PR? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Doctrine / exercise content
- [ ] Refactor or internal cleanup
- [ ] Docs, CI or tooling only
- [ ] Visual plate assets

## Checklist

- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `node scripts/check-cache-buster.mjs` passes
- [ ] `node scripts/check-config.mjs` passes
- [ ] **If this adds a new pure module under `js/`, I added a matching
      `tests/<name>.test.js` in this same PR.**
- [ ] **If this changes anything under `js/`, `css/` or `assets/`, I bumped
      `?v=battle-rhythm-N` in `index.html` and the PR says the new number
      here.** (Bump *every* tag, not just the ones I touched — CI fails
      otherwise.)
- [ ] I did not vendor openGym source. Logic was reimplemented; no code text,
      images or SVG paths were copied. *(AGPL-3.0 clean-room rule — see
      `CONTRIBUTING.md`.)*
- [ ] Any new or changed plate went through the intake gate in
      `assets/plates/AI-ASSET-INTAKE.md` and has recorded provenance.
- [ ] This PR is one concern. No unrelated visual rewrites or doctrine-data
      changes bundled in.
- [ ] No Google client id or API key is in `js/config.js`.

## New cache-buster version

<!-- Required if you touched js/, css/ or assets/. Write "n/a" otherwise. -->

`?v=battle-rhythm-___`

## Doctrine / content changes

<!-- If you changed exercise data, name the source (FM 7-22, ATP 7-22.02, etc.) -->

## Screenshots

<!-- For visual changes only. -->
