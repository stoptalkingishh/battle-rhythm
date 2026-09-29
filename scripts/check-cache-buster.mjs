#!/usr/bin/env node
/**
 * Verify that every local asset reference in index.html carries the same
 * `?v=battle-rhythm-N` cache-buster tag.
 *
 * Why this exists: index.html tags each local script/link with a version
 * query, but nothing enforced that the versions agreed. Six different N
 * values drifted live in the tree at once, which is how a warm browser cache
 * can end up pairing a new js/app.js with an old js/sync-core.js — a partial
 * deploy that breaks at runtime, not at build time. Four separate commits
 * existed purely to chase this.
 *
 * Bumping every tag is a one-line-per-file convention that is easy to apply
 * partially. This makes it a build failure instead. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

// Match the whole opening tag so the attribute we check is unambiguous.
const TAG = /<(script|link)\b[^>]*>/gi;
const VERSION = /\?v=battle-rhythm-(\d+)(?=&|\s|"|'|$)/;

function isLocal(reference) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference);
}

const references = [];
for (const match of html.matchAll(TAG)) {
  const tag = match[0];
  const attribute = /^<script\b/i.test(tag) ? /\ssrc\s*=\s*"([^"]*)"/i : /\shref\s*=\s*"([^"]*)"/i;
  const value = tag.match(attribute);
  if (!value || !value[1]) continue;
  if (!isLocal(value[1])) continue; // Skip CDN, protocol-relative and data: URLs.
  references.push({ line: html.slice(0, match.index).split('\n').length, value: value[1] });
}

if (!references.length) {
  console.error('FAIL: no local <script src> or <link href> references found in index.html.');
  console.error('      The tag regex is broken — refusing to pass a check that verified nothing.');
  process.exit(1);
}

const versions = references.map(({ value }) => {
  const match = value.match(VERSION);
  return match ? match[1] : null;
});
const untagged = references.filter((_, index) => versions[index] === null);
const distinct = [...new Set(versions.filter(version => version !== null))].sort((a, b) => a - b);

if (untagged.length || distinct.length > 1) {
  console.error(`FAIL: index.html cache-buster tags are not uniform (${references.length} local references).\n`);

  if (untagged.length) {
    console.error(`  ${untagged.length} reference(s) with no ?v=battle-rhythm-N tag:`);
    for (const { line, value } of untagged) console.error(`    index.html:${line}  ${value}`);
    console.error('');
  }

  if (distinct.length > 1) {
    console.error(`  ${distinct.length} distinct versions in use: ${distinct.map(v => `v${v}`).join(', ')}`);
    const current = distinct[distinct.length - 1];
    console.error(`  Bump EVERY tag to a single N (suggested: ${Number(current) + 1}). These disagree:\n`);
    for (const [index, { line, value }] of references.entries()) {
      const version = versions[index];
      if (version !== current) console.error(`    index.html:${line}  v${version ?? 'NONE'}  ${value}`);
    }
  }

  process.exit(1);
}

console.log(`index.html: ${references.length} local references, all cache-busted at v${distinct[0]}.`);
