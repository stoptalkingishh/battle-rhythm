# First-load performance

The measurement for issue #18. Everything below came from
`npm run measure:first-load`, which drives a real Chrome against a real HTTP/2
server. Nothing here is estimated.

## How to reproduce

```sh
npm run measure:first-load                              # Fast 3G, 3 runs, median
node scripts/measure-first-load.mjs --profile=slow4g   # a slower link
node scripts/measure-first-load.mjs --profile=cable    # unthrottled
node scripts/measure-first-load.mjs --json=out.json    # machine-readable
node scripts/measure-first-load.mjs --open-plate=deadlift   # price a plate
```

The script needs Chrome and `openssl` (both present on a normal dev machine);
it finds Chrome automatically or takes `CHROME_PATH`. It has **no npm
dependencies** and is not part of the app — the shipped tree still deploys by
copying files.

Two details matter for the numbers to mean anything:

- **It serves HTTP/2 over TLS.** GitHub Pages serves the app over HTTP/2, which
  multiplexes all 42 scripts onto one connection. An HTTP/1.1 test server
  serialises them into seven queueing rounds and manufactures a latency
  staircase the real deployment does not have — a measurement that reports a
  problem users never hit, and then "fixes" it. The script uses a throwaway
  self-signed cert and launches Chrome with `--ignore-certificate-errors`.
- **It takes a median of 3 cold loads.** A single run on a throttled link is
  noisy enough to invent an effect that isn't there. `--runs` controls the
  count; every raw sample lands in the JSON.

## Baseline and result

Fast 3G (1.6 Mbps down, 562 ms RTT), mobile viewport 390×844 @2x, cold cache,
HTTP/2. Median of 3.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| First contentful paint | 4312 ms | 3008 ms | **−30.2%** |
| First paint | 4312 ms | 3008 ms | **−30.2%** |
| DOMContentLoaded | 4332 ms | 3571 ms | **−17.6%** |
| Load event | 6072 ms | 4973 ms | **−18.1%** |
| Transferred bytes | 207.3 kB | 207.3 kB | unchanged |
| Requests | 45 | 45 | unchanged |

## What the first load actually fetches

**Zero images.** Not "few" — the measurement counts `img` initiators and gets
`0`. `assets/plates/` holds ~20 MiB across 392 files (17 MiB of ATP figures,
4.4 MiB of AI plates) and first load touches none of it. `js/exercise-coach.js`
only builds an `<img>` inside `openExerciseModal`, which nothing calls until a
user clicks an exercise. The plate payload is a **repository** cost, not a
**first-load** cost, and the two should not be conflated.

The whole first load is 207 kB gzipped over 45 requests: `index.html` (7 kB),
one stylesheet (7 kB), 42 scripts, and 117 kB of Google Fonts from a
third party.

### Largest contributors, with numbers

| Asset | Transferred | Share |
| --- | --- | --- |
| `js/app.js` | 31.3 kB | 15.1% |
| `js/data/exercises-atp.js` | 10.7 kB | 5.2% |
| `js/data/doctrine.js` | 9.8 kB | 4.7% |
| `js/data/exercises.js` | 9.3 kB | 4.5% |
| `js/exercise-coach.js` | 8.7 kB | 4.2% |
| `js/data/data-export.js` | 8.5 kB | 4.1% |
| `css/styles.css` | 7.4 kB | 3.6% |
| Google Fonts (4 files + 1 CSS) | 116.8 kB | **36% of bytes, on another origin** |

## The change that was made

Google Fonts were loaded with `@import` at the top of `css/styles.css`. An
`@import` is only discovered **after** the stylesheet that contains it has
downloaded and been parsed, so it put a serial round trip to
`fonts.googleapis.com` in front of the first paint. The font CSS then pointed
at `fonts.gstatic.com`, which cost a second handshake.

Moving the font declaration into `<head>` in `index.html` lets the browser
fetch it **in parallel** with `styles.css` instead of behind it, and the two
`preconnect` hints pay the TLS handshakes up front.

Measured cost of the chain: deleting the webfonts outright took FCP from
4312 ms to 3148 ms. The change shipped here captures 3008 ms of that while
keeping the fonts — i.e. it recovers essentially the whole win without
touching the typography.

This is the only change. It adds no dependency, no build step, and no runtime.

## Things that were tried and rejected

Reported because "we tried it and it did not work" is the useful part.

**`defer` on all 42 scripts — a regression, not an optimisation.** Measured
median of 3:

| Metric | Baseline | With `defer` |
| --- | --- | --- |
| First contentful paint | 4312 ms | 3732 ms (−13%) |
| DOMContentLoaded | 4332 ms | 10734 ms (**+148%**) |

FCP improves and DCL more than doubles. `defer` moves all 42 scripts off the
parser, so every one of them becomes eligible to run only after the document
is parsed; on a throttled link that defers the actual work rather than
overlapping it. The per-file improvement is real and small, and the aggregate
is a large regression. **Not shipped.**

**`loading="lazy"` / `decoding="async"` on plate images — no measurable
effect, so not shipped.** Measured on the interaction that actually fetches a
plate (`--open-plate=deadlift`), median of 3:

| Variant | Plate bytes | Wall time |
| --- | --- | --- |
| Unchanged | 30624 | 2380 ms |
| `decoding="async"` | 30624 | 2391 ms |
| `+ loading="lazy"` | 30624 | 2386 ms |

All three are within noise. The plate is the modal's primary content and the
user just asked for it; `loading="lazy"` would at best do nothing and at worst
delay the thing the user opened the modal to see. Adding it would be
performing an optimisation rather than making one.

**`preconnect` alone, without moving the font link out of the `@import`** —
FCP 4108 ms versus 4312 ms baseline. Within noise on its own; it only pays
off once the request is issued from `<head>` rather than after
`styles.css` arrives.

## Remaining cost, and whether it is fixable without a build step

**First load is now in decent shape.** 207 kB, no images, FCP ~3 s on Fast
3G. The single remaining lever inside the current architecture is the 117 kB
of third-party fonts — a self-hosted subset with only the weights actually
used, which would remove a cross-origin round trip and a render-blocking
dependency entirely. That is a design decision about typography and offline
behaviour, not a mechanical performance fix, so it is not taken unilaterally
here. Note it currently also means the app is not fully functional offline
until fonts resolve, which is worth a decision.

**The 42 request count is the real remaining cost**, and the honest answer is
that fixing it properly needs a bundler. 42 requests is 42 things that can
fail, 42 cache entries, and 42 lines of `index.html` to keep in sync. A
bundler is not recommended: it would introduce `node_modules`, a lockfile and
a build step to save roughly 40 requests over ~200 kB on a connection that
already delivers it in about 3 seconds. The no-build rule buys something real
here and the measurement does not justify trading it.

**The committed payload is a separate, larger problem.** `assets/plates/` is
~20 MiB in git. It does not affect first load at all (0 image requests), so
it is out of scope for this issue, but it makes every `git clone` slow and it
is the thing that would eventually justify reconsidering how plates ship —
e.g. self-hosting them as a separately-fetched asset bundle, or on-demand
per-figure fetch. Worth its own issue.
