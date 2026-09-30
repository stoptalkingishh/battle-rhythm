/**
 * Shared cache-buster parsing for the two tools in scripts/ that read
 * index.html: check-cache-buster.mjs (CI guard) and bump-cache-buster.mjs
 * (the rewrite tool).
 *
 * These two files must agree on what a "local reference" is and on what a
 * valid tag looks like. If they disagree, the bump tool can write a file the
 * guard still rejects — or, worse, the guard accepts a shape the bump tool
 * cannot rewrite, and the manual discipline it exists to remove comes back.
 * So the regexes and the reference-scanning loop live here, once.
 *
 * No dependencies.
 */
import fs from 'node:fs';

export const VERSION_PREFIX = '?v=battle-rhythm-';

/** Match a whole opening tag so the attribute we read is unambiguous. */
const TAG = /<(script|link)\b[^>]*>/gi;

/** A version query on a local reference, terminated by the attribute end. */
export const VERSION = /\?v=battle-rhythm-(\d+)(?=&|\s|"|'|$)/;

export function isLocal(reference) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference);
}

/**
 * Every local `<script src>` / `<link href>` in the document, in source order.
 *
 * Returns `{ line, value, version, start, end }`:
 *   - `version` is the digit string of the tag, or null when untagged
 *   - `start`/`end` are offsets of the attribute value in `html`, so callers
 *     can splice a replacement without re-parsing the document
 *
 * Remote, protocol-relative and data: URIs are skipped: they are not served
 * from the repository and cannot carry this cache-buster.
 */
export function readReferences(html) {
  const references = [];

  for (const match of html.matchAll(TAG)) {
    const tag = match[0];
    const attribute = /^<script\b/i.test(tag) ? /\ssrc\s*=\s*"([^"]*)"/i : /\shref\s*=\s*"([^"]*)"/i;
    const value = tag.match(attribute);
    if (!value || !value[1]) continue;
    if (!isLocal(value[1])) continue;

    // The value ends one character (the closing quote) before the attribute match ends.
    const start = match.index + tag.indexOf(value[0]) + value[0].length - value[1].length - 1;
    const version = value[1].match(VERSION);

    references.push({
      line: html.slice(0, match.index).split('\n').length,
      value: value[1],
      version: version ? version[1] : null,
      start,
      end: start + value[1].length,
    });
  }

  return references;
}

/** Distinct version digits in use, ascending. Empty when nothing is tagged. */
export function distinctVersions(references) {
  return [...new Set(references.map(ref => ref.version).filter(version => version !== null))]
    .sort((a, b) => Number(a) - Number(b));
}
