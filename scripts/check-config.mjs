#!/usr/bin/env node
/**
 * Guard against committing a populated js/config.js.
 *
 * Both BR_GOOGLE_CLIENT_ID and BR_GOOGLE_API_KEY are public client-side
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
const guarded = ['BR_GOOGLE_CLIENT_ID', 'BR_GOOGLE_API_KEY'];
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

/* Second sweep: since the app now also reads credentials the user pastes into
 * Settings (stored in localStorage by js/credentials.js), a developer can
 * hard-code their own key anywhere in the source rather than only in
 * js/config.js. The committed file check above is not enough to catch that, so
 * scan every tracked js/ and tests/ file for the two credential shapes.
 *
 * Deliberately narrow, to avoid failing on the code that *describes* these
 * values:
 *   - a populated BR_GOOGLE_* assignment to a non-empty string literal;
 *   - a literal that is a real-shaped API key (AIza + 35 URL-safe chars).
 *     js/data/drive-setup.js holds the validation regex, and its own test file
 *     builds a fixture by concatenation for exactly this reason. */
const API_KEY_LITERAL = /["']AIza[0-9A-Za-z_-]{35}["']/;
const scanRoots = ['js', 'tests'];
const scanFiles = [];

function collect(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) collect(relative);
    else if (entry.name.endsWith('.js')) scanFiles.push(relative);
  }
}
for (const dir of scanRoots) collect(dir);

const leaks = [];
for (const file of scanFiles) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const name of guarded) {
      const match = line.match(new RegExp(`(?:window\\.)?${name}\\s*=\\s*"([^"]+)"`));
      if (match) leaks.push(`${file}:${index + 1}  ${name} assigned a non-empty value`);
    }
    if (API_KEY_LITERAL.test(line)) {
      leaks.push(`${file}:${index + 1}  literal Google API key`);
    }
  });
}

if (leaks.length) {
  console.error('FAIL: Google credentials are hard-coded in tracked source:\n');
  for (const leak of leaks) console.error(`  ${leak}`);
  console.error('\nCredentials belong in localStorage via the Settings setup form (see');
  console.error('js/credentials.js and docs/google-drive-setup.md), never in a tracked file.');
  process.exit(1);
}

console.log(`js/config.js: both ${guarded.join(' and ')} are empty (guest mode).`);
console.log(`scanned ${scanFiles.length} js/ and tests/ files: no hard-coded credentials.`);
