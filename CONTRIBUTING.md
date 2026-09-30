# Contributing to Battle Rhythm

Unofficial Army H2F workout planning and tracking app. No build step, no
framework, **zero npm dependencies** — browser scripts are served straight
from the repository to GitHub Pages. Please keep it that way: the whole point
of the architecture is that a clone is a deployable site.

## Run the checks

```bash
npm test          # node:test, runs everything under tests/
npm run check     # node --check over every file in js/ and tests/
```

There is nothing to install. Both commands work on a fresh clone.

CI (`.github/workflows/ci.yml`) runs the same two commands plus two guard
scripts, and both must pass:

```bash
node scripts/check-cache-buster.mjs   # all index.html asset versions match
node scripts/check-config.mjs         # js/config.js has no Google credentials
```

## The two rules CI will fail you on

### 1. Cache-buster — bump *all* tags, not some of them

Every local `<script src>` and `<link href>` in `index.html` carries
`?v=battle-rhythm-N`. **If you change anything under `js/`, `css/` or
`assets/`, bump N — and bump it on every single tag, in one commit.**

This is not cosmetic. GitHub Pages serves these files with long cache
headers, and browsers key the cache on the full URL including the query
string. Bump some tags and not others and a returning visitor with a warm
cache can load a new `js/app.js` against an old `js/sync-core.js` whose
`FILE_MAP` does not know about the newest data. That is a partial deploy,
and it breaks at runtime with no build error anywhere.

This has happened repeatedly: six different version numbers were live in
`index.html` at once, and four separate commits existed only to chase the
aftermath. `scripts/check-cache-buster.mjs` now fails the build if the
versions disagree, if a local reference has no tag, or if it cannot find
the tags at all.

The safe sequence — one command, run after editing anything under `js/`,
`css/` or `assets/`:

```bash
npm run bump:bust          # rewrites every tag in index.html to one new N
```

That is the whole step. `scripts/bump-cache-buster.mjs` re-parses the file it
is about to write and refuses to write it unless every reference comes back
uniform, so a partial bump cannot leave the working tree. `--dry-run` reports
without writing, and `npm run bump:bust -- 40` sets an explicit N.

If a local reference has a query string but no tag, the tool refuses and tells
you which line — appending `&v=...` would not match the guard's pattern, so
that one is a hand fix. Then finish with the guard:

```bash
node scripts/check-cache-buster.mjs
```

### 2. Every new pure module ships with a test

Any new pure logic module under `js/` must arrive with a matching
`tests/<name>.test.js` in the **same commit**. Follow the existing
precedent exactly:

- UMD wrapper assigning to a `window.BR_*` global, no browser dependencies
- pure functions, no DOM
- tested with `node:test` + `node:assert/strict` only
- if the module is a declarative data blob, test its **cross-references**
  (ids resolve, no collisions, referenced files exist) rather than
  asserting on the literal content — see `tests/data-integrity.test.js`

`npm run check` no longer needs updating when you add a file; it globs
`js/**/*.js` and `tests/**/*.js`. (It used to be a hand-maintained list
that had silently fallen behind by twelve files.)

## Adding a language (i18n)

Strings go through the plain lookup in `js/data/i18n.js` (`window.BR_I18N`).
There is no framework and no build step; the full decision record, including
what is deliberately out of scope, is in
[`docs/architecture/localization.md`](docs/architecture/localization.md).

```js
t("weekly.today", { name: "Upper A" })   // "Today: Upper A"
```

`t()` **never returns `""`**. It falls back active locale -> English catalog ->
the call site's `{ default }` -> the key string itself, so a missing
translation shows up as a greppable key rather than a blank button. Preserve
that when you add keys, and preserve it in tests: there is a mutation check in
`tests/i18n.test.js` that deletes the English fallback and expects a failure.

To add a language: create `js/data/locale-xx.js` publishing a flat
`{ key: "text" }` map on `window.BR_LOCALE_XX`, add its `<script>` tag above
`js/app.js`, add `["xx", "BR_LOCALE_XX"]` to the `CATALOGS` manifest in
`js/app.js`, add the global to `js/data/capabilities.js` (the cross-check in
`tests/capabilities.test.js` will fail otherwise), then `npm run bump:bust`.

Do not machine-translate the app. A large unreviewed catalog is worse than a
small honest one — only add strings you can stand behind.

## Adding visual plates

`assets/plates/svg/` (generated cards), `assets/plates/ai/` (AI plates) and
`assets/plates/atp/` (public-domain ATP figures) are **committed to the
repository on purpose** and must never be gitignored. There is no build
step, so if they are not tracked, every exercise tile 404s in production.

Adding a plate is a provenance-gated operation, not a file copy. Read
`assets/plates/AI-ASSET-INTAKE.md` first:

- generated SVGs: add the manifest entry to `assets/plates/workout-cards.json`,
  then `node scripts/generate-workout-cards.mjs`
- AI plates: record the prompt in `assets/plates/ai-image-prompts.json`, save
  the image as `<id>.webp`, then `node scripts/import-ai-plates.mjs` to write
  `registry.js` with full provenance (generator, provider, date, prompt id,
  licence assertion)
- never commit an image whose licence or provenance you cannot state

## openGym / AGPL clean-room rule

Parts of this app were adopted from **openGym**, which is **AGPL-3.0**. AGPL's
network clause means a derivative work must offer its source to users over a
network, so copying openGym source into this repository would be a legal
hazard.

The agreed mitigation is **clean-room reimplementation**: treat openGym as a
specification, not a source tree.

- **Do:** reimplement logic yourself, in this codebase's style; use public
  algorithm facts (Epley/Brzycki/Lombardi, the wake-lock browser API pattern);
  implement feature *behaviour* from its description.
- **Do not:** vendor openGym source text, copy its SVG paths, or copy its
  images. Do not paste its files into ours "as a starting point".
- Every ported module here is a pure-logic UMD file with its own test, written
  from scratch. Keep it that way.
- If you ever want to vendor openGym source verbatim, **stop** and settle the
  AGPL question before writing the code, not after.

## Keep PRs independently reviewable

One concern per PR. No PR should mix an unrelated visual rewrite with
doctrine-data changes or a sync change — reviewers cannot tell which
behaviour moved. Split the work, and say so in the description.

If your change touches browser assets, the PR description must state the new
cache-buster N.

## Doctrine content

Exercise and doctrine content is sourced from FM 7-22, ATP 7-22.01/.02 and
Army directives. Keep the citation with the content. If you add an exercise,
it needs a component tag, cues, programming, safety notes, a source, and a
plate (AI plate or generated SVG) — `tests/data-integrity.test.js` enforces
most of that.
