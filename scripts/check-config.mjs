#!/usr/bin/env node
/**
 * Guard against committing a populated js/config.js.
 *
 * Both BR_GOOGLE_CLIENT_ID and BR_DRIVE_TOKEN_PROXY are public client-side
 * identifiers by design — they ship to every browser and are visible in
 * devtools. This is the same model openquiz uses with its NEXT_PUBLIC_*
 * values, and it is not a secret-rotation control.
 *
 * The point is narrower: js/config.js is tracked, its defaults are empty
 * strings, and the next developer who pastes their own key would commit
 * it by accident. This fails the build instead, and points at the
 * example file. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'js/config.js');
const examplePath = path.join(root, 'js/config.js.example');

if (!fs.existsSync(configPath)) {
  console.error('FAIL: js/config.js is missing. It is tracked and must exist (copy js/config.js.example).');
  process.exit(1);
}

const source = fs.readFileSync(configPath, 'utf8');
const guarded = ['BR_GOOGLE_CLIENT_ID', 'BR_DRIVE_TOKEN_PROXY'];
const populated = [];

for (const name of guarded) {
  const match = source.match(new RegExp(`(?:window\\.)?${name}\\s*=\\s*"([^"]*)"`));
  if (!match) {
    populated.push(`${name}: not assigned at all (expected an empty string)`);
  } else if (match[1].length > 0) {
    // Any non-empty string counts, including whitespace: the app tests
    // truthiness, so "   " would be treated as configured and fail at runtime.
    const shown = match[1].trim() ? 'populated' : 'whitespace only';
    populated.push(`${name}: ${shown} (${match[1].length} character(s))`);
  }
}

if (populated.length) {
  console.error('FAIL: js/config.js contains populated Google credentials:\n');
  for (const problem of populated) console.error(`  ${problem}`);
  console.error('\nThese are public client-side identifiers, so this is not a secret-rotation');
  console.error('control — it only stops them being committed by accident. Move the values out of');
  console.error('the tracked file and supply them another way, or blank them and document the');
  console.error('setup in README.md. See js/config.js.example.');
  process.exit(1);
}

if (!fs.existsSync(examplePath)) {
  console.error('FAIL: js/config.js.example is missing.');
  process.exit(1);
}

console.log(`js/config.js: both ${guarded.join(' and ')} are empty (guest mode).`);
