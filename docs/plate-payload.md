# Plate payload decision

**Status:** decided. **Date:** 2026-09-30. **Issue:** #12.

## The problem

`assets/plates/` is the largest thing in the repository: 20.07 MiB across 402
files, against a total worktree of 21.28 MiB. The plates are committed binaries
served straight from the repo with no build step, so they are also the reason a
fresh clone is directly deployable. That guarantee is not negotiable.

## What was measured

| | before | after |
|---|---|---|
| `assets/plates/atp/` | 254 files, 15.55 MiB | 191 files, 12.73 MiB |
| `assets/` total | 20.07 MiB | 17.25 MiB |
| worktree, excluding `.git` | 21.28 MiB | 18.46 MiB |
| first-load payload (index.html + css + js/) | 0.76 MiB | 0.76 MiB |
| git history size | unchanged | unchanged |

## Decision

Drop the 63 ATP figures that no exercise maps to, and change nothing else.

## The tradeoff, stated honestly

**This does not shrink a clone.** The dropped blobs remain in git history
forever; `git clone` still transfers them. What it does reduce is the deployed
site (what GitHub Pages serves and what a user downloads) and a fresh checkout.
The 2.83 MiB is real for the site's weight and for disk, and irrelevant to the
clone cost the issue was framed around. Reducing the clone cost requires
rewriting history, which was rejected: it invalidates every existing clone and
commit hash, and the project has no need to force that on contributors.

**Metadata stripping saves nothing.** All 254 figures are a bare `VP8 ` chunk:
no EXIF, no XMP, no ICC profile (verified by walking the RIFF container of every
file). There is nothing to strip, and no bytes to win. The proposal assumed
committed binaries carry embedded metadata; these had already been written clean.

**First load is unaffected, and was never the problem.** The home view does not
request plates: library tiles use the generated SVG cards and plates load on
demand in the exercise guide. The 0.76 MiB figure is unchanged, which is the
correct result rather than a disappointing one.

## What was rejected, and why

- **Git LFS for `assets/plates/**`.** Largest long-run win, but it makes LFS a
  clone prerequisite, breaks the "clone and deploy" guarantee for anyone without
  LFS configured, and needs an LFS-aware step in the Pages deploy job.
- **CDN offload.** Stops repo growth, but adds a runtime dependency and works
  directly against the offline-first, guest-mode design. A CDN that is unreachable
  leaves a user with empty tiles.

Both stay open as options if the payload grows past a threshold worth another
decision. The two metrics above are the ones to watch.

## Keeping it honest

`tests/plate-assets.test.js` now asserts three things, so the payload cannot
quietly regrow and the extraction record cannot drift from what ships:

1. no committed ATP figure is unreachable from `BR_ATP_FIGURES`
2. every figure `BR_ATP_FIGURES` maps to exists on disk
3. every catalogued figure is either shipped or explicitly listed under
   `notShipped` in `atp-catalog.json`

The catalog is deliberately kept complete. It records what
`scripts/extract-atp-figures.py` pulled from the public-domain source, which is
provenance, not payload. What is not shipped is recorded in the same file rather
than deleted from the record, so the extraction stays reproducible.
