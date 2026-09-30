#!/usr/bin/env node
/**
 * Rewrite every local `?v=battle-rhythm-N` tag in index.html to one new N.
 *
 * Why this exists: check-cache-buster.mjs (CI) catches a partial bump, but it
 * catches it *afterwards* — the human step is still "find every tag and
 * replace the number, in one commit, and don't miss any". CONTRIBUTING
 * documents the cost of getting that wrong: six version numbers live at once
 * and four commits spent chasing the fallout. This makes the safe action the
 * one-command action.
 *
 * Usage:
 *   npm run bump:bust                 # advance to current + 1
 *   npm run bump:bust -- 40           # go to an explicit N
 *   npm run bump:bust -- --dry-run    # report, write nothing
 *
 * Exit codes: 0 written / already at target, 1 refused or failed.
 * No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReferences, distinctVersions } from './lib/cache-buster.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const explicit = args.find(arg => !arg.startsWith('-'));

if (args.some(arg => arg.startsWith('-') && arg !== '--dry-run')) {
  console.error(`FAIL: unknown flag. Usage: bump-cache-buster.mjs [N] [--dry-run]`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const references = readReferences(html);

if (!references.length) {
  console.error('FAIL: no local <script src> or <link href> references found in index.html.');
  console.error('      The tag regex is broken — refusing to rewrite a file it did not understand.');
  process.exit(1);
}

const distinct = distinctVersions(references);
const current = distinct.length ? Number(distinct[distinct.length - 1]) : null;
const target = explicit === undefined ? (current ?? 0) + 1 : Number(explicit);

if (!Number.isInteger(target) || target <= 0) {
  console.error(`FAIL: target version must be a positive integer (got: ${explicit}).`);
  process.exit(1);
}

// A local reference carrying a query string this tool does not own cannot be
// tagged safely: appending `&v=` would not match the guard's VERSION pattern,
// which requires the tag to open with `?`. Refuse rather than write a file CI
// will reject.
const untaggable = references.filter(ref => ref.version === null && ref.value.includes('?'));
if (untaggable.length) {
  console.error(`FAIL: ${untaggable.length} local reference(s) have a query string but no cache-buster tag:\n`);
  for (const { line, value } of untaggable) console.error(`  index.html:${line}  ${value}`);
  console.error('\nGive each one a ?v=battle-rhythm-N tag by hand, then re-run. This tool only');
  console.error('rewrites existing tags and adds a tag to a reference with no query string.');
  process.exit(1);
}

if (distinct.length === 1 && current === target) {
  console.log(`index.html: already at v${target} across ${references.length} local references — nothing to write.`);
  process.exit(0);
}

if (current !== null && target < current) {
  console.warn(`WARNING: going backwards, v${current} -> v${target}. A browser with v${current} warm`);
  console.warn('         in cache will keep serving it; only the tag changes, not the file contents.');
}

const untagged = references.filter(ref => ref.version === null);
const suffix = `?v=battle-rhythm-${target}`;

// Splice from the end so earlier offsets stay valid.
let next = html;
for (const ref of [...references].sort((a, b) => b.start - a.start)) {
  const replacement = ref.version === null ? ref.value + suffix : ref.value.replace(/\?v=battle-rhythm-\d+/, suffix);
  next = next.slice(0, ref.start) + replacement + next.slice(ref.end);
}

// Prove the rewrite before it reaches disk: re-parse what we are about to write
// and require it to be uniform at the target. The guard in CI is the backstop;
// this is the front one.
const rewritten = readReferences(next);
const rewrittenDistinct = distinctVersions(rewritten);
if (rewritten.length !== references.length || rewrittenDistinct.length !== 1 || rewrittenDistinct[0] !== String(target)) {
  console.error('FAIL: refusing to write — the rewritten index.html does not parse back as uniform.');
  console.error(`      ${rewritten.length} reference(s), versions: ${rewrittenDistinct.map(v => `v${v}`).join(', ') || 'none'}`);
  process.exit(1);
}

if (dryRun) {
  console.log(`index.html: would rewrite ${references.length} local references to v${target} (dry run, nothing written).`);
  process.exit(0);
}

fs.writeFileSync(indexPath, next, 'utf8');

const change = current === null ? 'from untagged' : `from v${distinct.map(v => v).join('/v')}`;
console.log(`index.html: ${references.length} local references bumped ${change} to v${target}.`);
if (untagged.length) console.log(`             ${untagged.length} previously untagged reference(s) tagged.`);
console.log('Run: node scripts/check-cache-buster.mjs');
