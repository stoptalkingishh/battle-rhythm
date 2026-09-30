#!/usr/bin/env node
/**
 * Warn when the doctrine provenance registry has gone stale.
 *
 * Why this exists: the doctrine content in js/data/ is static. When a cited
 * publication is revised, nothing in the tree notices — the quotes and the
 * paragraph citations silently drift out of date. js/data/doctrine-sources.js
 * records when a human last reconciled each data file with the publisher's
 * records; this script reads that registry and warns once the recorded date
 * passes POLICY.staleAfterMonths.
 *
 * It WARNS, it does not fail. A stale date is a prompt to re-verify, not a
 * broken build: failing here would block unrelated work and teach maintainers
 * to ignore the signal. Pass --strict in a scheduled (not per-PR) run to make
 * it exit non-zero. tests/doctrine-sources.test.js is the hard gate: it fails
 * the build when a citation claims a paragraph no source entry covers.
 *
 * Usage: node scripts/check-doctrine-freshness.mjs [--strict] [--now YYYY-MM-DD]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const REG = require(path.join(root, 'js/data/doctrine-sources.js'));

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const nowArg = argv.indexOf('--now');
const today = nowArg !== -1 && argv[nowArg + 1]
  ? argv[nowArg + 1]
  : new Date().toISOString().slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error(`check-doctrine-freshness: --now must be YYYY-MM-DD, got "${today}"`);
  process.exit(2);
}

/* Structural problems are real errors even in warn mode: a registry whose
 * source ids dangle would make the age report meaningless. */
const structural = REG.checkDataFileRefs();
if (structural.length) {
  console.error('check-doctrine-freshness: broken provenance registry:');
  structural.forEach(line => console.error('  - ' + line));
  process.exit(1);
}

const rows = REG.reviewStatus(today);
const overdue = rows.filter(r => r.overdue);

console.log(`Doctrine provenance registry (reviewed ${REG.POLICY.registryReviewed}), checked ${today}`);
console.log(`Stale threshold: ${REG.POLICY.staleAfterMonths} months. ${rows.length} doctrine data files tracked.`);

for (const row of rows) {
  const age = row.ageDays === null ? 'never verified' : `${row.ageDays}d old`;
  const state = row.overdue ? 'OVERDUE' : 'ok';
  console.log(`  [${state.padEnd(7)}] ${row.file.padEnd(30)} last verified ${row.lastVerified || '—'} (${age})`);
}

const unverifiedEditions = REG.SOURCES.filter(s => !s.editionVerified).map(s => s.id);
if (unverifiedEditions.length) {
  console.log('');
  console.log('Sources whose edition is NOT verified (the app shows "edition unverified" for these):');
  unverifiedEditions.forEach(id => console.log('  - ' + id));
}

if (overdue.length) {
  console.log('');
  console.log(`WARNING: ${overdue.length} doctrine data file(s) are past the review threshold:`);
  overdue.forEach(r => {
    console.log(`  - ${r.file}: last verified ${r.lastVerified || 'never'} ` +
      `(${(r.ageMonths ?? 0)} months, cadence ${r.cadenceMonths} months)`);
  });
  console.log('');
  console.log('Re-verify per docs/doctrine-content-review.md, then bump the file\'s');
  console.log('lastVerified date in js/data/doctrine-sources.js and bump the cache-buster.');
  /* GitHub Actions annotation so this shows in the PR checks summary. */
  overdue.forEach(r => console.log(`::warning title=Doctrine content stale::${r.file} last verified ${r.lastVerified || 'never'} — re-verify against the source publication`));
  if (strict) process.exit(1);
} else {
  console.log('');
  console.log('All doctrine data files are within their review window.');
}
