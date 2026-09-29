#!/usr/bin/env node
/**
 * Syntax-check every JS file in js/ and tests/ with `node --check`.
 *
 * Replaces a hand-maintained `&&` chain in package.json that went stale: 12 of
 * the 36 files under js/ were never listed, including all three generated data
 * files. That chain also short-circuited, forcing one fix per run.
 *
 * Reports every failure in a single pass. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['js', 'tests'];

function collect(dir, found = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return found;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      collect(relative, found);
    } else if (entry.name.endsWith('.js')) {
      found.push(relative);
    }
  }
  return found;
}

const files = roots.flatMap(dir => collect(dir)).sort();

if (!files.length) {
  console.error('FAIL: no .js files found under js/ or tests/ — the glob is broken.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.error) {
    failures.push({ file, detail: result.error.message });
  } else if (result.status !== 0) {
    const detail = (result.stderr || '').trim().split('\n').filter(line => /SyntaxError|\^/.test(line)).join('\n');
    failures.push({ file, detail: detail || (result.stderr || '').trim() || 'unknown syntax error' });
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${files.length} files have a syntax error:\n`);
  for (const { file, detail } of failures) {
    console.error(`  ${file}\n    ${detail.replace(/\n/g, '\n    ')}\n`);
  }
  process.exit(1);
}

const counts = roots.map(dir => `${dir}/ ${files.filter(file => file.startsWith(dir + '/')).length}`).join(', ');
console.log(`All files: syntax OK (${files.length} files — ${counts})`);
