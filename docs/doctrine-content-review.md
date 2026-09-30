# Doctrine content review: cadence and checklist

The doctrine content in `js/data/` quotes Army publications with paragraph
citations, and none of it moves when a publication is revised. `js/data/doctrine.js`
quotes FM 7-22; `aft-standards.js` holds the AFT scoring grid; the exercise and
figure files carry hundreds of citations against ATP 7-22.02. If FM 7-22 or
ATP 7-22.02 changes, this app keeps quoting the old text with the old paragraph
numbers and nothing in the build complains.

`js/data/doctrine-sources.js` is the record that makes the drift visible: per
source, the edition the app is quoting and whether that edition was verified;
per data file, the date a human last reconciled it with the publisher's
records. This document is the policy that record is maintained under.

## Cadence

| What | How often |
| --- | --- |
| Re-check the provenance registry against armypubs publication records | Every 6 months |
| Re-verify `js/data/doctrine.js` quotes against the current FM 7-22 | Every 6 months |
| Re-verify `js/data/aft-standards.js` against the official AFT Score Tables | Every 6 months, and whenever an Army Fitness Directive is issued |
| Re-verify exercise names, cues and figure numbers against ATP 7-22.02 | Every 12 months |
| Re-check anything marked `editionVerified: false` | Every 6 months until it can be verified or dropped |

Six months is the CI threshold (`POLICY.staleAfterMonths` in the registry). It
is not a claim that a publication revises on that cycle — Army directives
issue on their own schedule. A directive that changes the AFT or the H2F
system triggers an immediate re-check regardless of the calendar.

`npm run check:doctrine` prints the age of every data file and warns once one
passes its threshold. It **warns and does not fail**: a stale date is a prompt
to re-verify, not a broken build, and failing there would block unrelated work
and train maintainers to ignore it. CI runs it on every push and PR. Use
`--strict` to make it exit non-zero when you want a hard stop. It also lists
the sources whose edition is still unverified.

The hard gate is `tests/doctrine-sources.test.js`: a doctrine record that cites
a paragraph, table, chapter, page or drill no source entry covers fails the
build. That is the check that stops a *new* wrong claim. It cannot detect a
paragraph that has silently moved in a revised publication — only a re-verification
pass can do that, which is what the cadence above is for.

## Re-verification checklist

Work through this when a cited publication changes, or on the six-month tick.

**1. Confirm what changed.**

- Open the Army Publishing Directorate record for each cited publication
  (<https://armypubs.army.mil/>) and compare Pub/Form Date, Pub/Form Status
  (ACTIVE / WITHDRAWN / RESCINDED) and the title against
  `js/data/doctrine-sources.js`.
- A publication that is no longer ACTIVE, or whose date has moved, means its
  `edition` string in the registry is wrong. Update it and note what you saw.

**2. Update the registry, honestly.**

- Set `edition` to the string the publisher's own record shows. If you cannot
  read it off the record, leave `edition: null` and `editionVerified: false`.
  Never invent an edition number or a revision date — a wrong edition string is
  worse than an honest "unverified", because it is what a user will trust.
- Set `editionNote` to where the string came from ("APD record PUB_ID=…",
  "the publication's own front matter", "could not confirm — fetch timed out").
- Set `verifiedOn` to today, ISO `YYYY-MM-DD`.
- If a locator set (`covers`) moves, update it. Paragraph numbers are the thing
  most likely to shift; if the publication renumbered, every citation pointing
  at the old number is now wrong.

**3. Re-check the affected data file.**

- Bump that file's `lastVerified` in `DATA_FILES` and rewrite `verifiedScope`
  to state what this pass actually covered. `verifiedScope` is a real claim:
  "source editions checked, quotes not re-read" is useful; a blanket "verified"
  is not.
- Re-read the actual quoted text in the file against the publication. This is
  the step the registry cannot do for you.

**4. Fix citations that the guard will not catch.**

- A publication that renumbered means `js/data/doctrine.js` citations like
  `FM 7-22, para 6-14` may now point somewhere else, and the registry will not
  fail because `6-14` is still a string it covers. Search the data files for
  the affected numbers.
- Check `js/data/atp-figures.js` against the ATP's current pagination.
  Figure ids are cross-checked for internal consistency only; nothing verifies
  them against the publication.

**5. Land it.**

- `npm run bump:bust` — you touched `js/`, so every asset tag moves.
- `npm test && npm run check && npm run check:bust && npm run check:config && npm run check:doctrine`.
- The new consistency test must pass against the data you changed. If it fails
  because a citation is now wrong, fix the citation — do not widen the
  registry's `covers` to make it pass.

## Known unverified items as of 2026-09-30

Recorded here so the next reviewer does not have to rediscover them. All of them
show as "edition unverified" in the Doctrine tab.

- **FM 4-25.11** — no edition or date has been read off an APD record. The repo
  links a third-party archive copy, which is not an authority.
- **AR 385-10** — a Rapid Action Revision issued 14 June 2010 over a 23 August
  2007 base appears on safety.army.mil, but the document could not be fetched to
  confirm either date. Neither is recorded.
- **APHC Performance Triad Guide** — no edition or date is published on the page
  and the govinfo package number does not encode one. The regulation that names
  the Performance Triad content is AR 40-5 (12 May 2020, recorded) and AR 600-9
  (16 July 2019 with a 27 February 2025 administrative revision, recorded); treat
  the guide's own figures as needing confirmation.
- **army.mil AFT page** and the **CFT news article** — web pages, not versioned
  publications. No edition exists to record.

Partially verified, carried as-is:

- **ATP 5-19** — "November 2021" is recorded from a search snippet of the
  APD-hosted PDF, not from the document itself; the fetch timed out. Confirm on
  the next pass.
- **TB MED 508** — "1 April 2005" comes from the bulletin's own header and from
  two other Army publications citing it, but not from an APD publication record.
  A 2005 cold-injury bulletin is worth an explicit currency check.

## Registering an app-authored citation

`APP_AUTHORED` in the registry lists the citation prefixes that are not
quotations from a numbered source — `PAR …`, `QUOTE: AFT event`, and a handful of
programme references. Adding a prefix there is a deliberate claim that the line
is the app's own paraphrase rather than a quote. Anything not on that list and
not naming a registered publication fails `checkCitation()`.
