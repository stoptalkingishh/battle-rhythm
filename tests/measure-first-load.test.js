"use strict";
/* Tests for scripts/measure-first-load.mjs (issue #18).
 *
 * These do NOT run Chrome — a browser in CI is not something this repo can
 * assume, and a test that needs one silently stops being run. They check the
 * parts that can silently lie: that the harness is wired to the real shipped
 * tree, that the measurement contract in the docs still holds, and that the
 * claims made about first load are still true of the tree as it stands.
 *
 * Anything that genuinely needs a browser stays in the script itself, run by
 * hand via `npm run measure:first-load`.
 *
 * Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const indexHtml = read("index.html");
const stylesCss = read("css/styles.css");

/* ---------------- The harness exists and has no dependencies ---------------- */

test("measure-first-load.mjs exists and imports nothing outside node:", () => {
  const src = read("scripts/measure-first-load.mjs");
  const imports = [...src.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  const dynamic = [...src.matchAll(/await import\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  const all = [...imports, ...dynamic];
  assert.ok(all.length > 0, "the script imports something; the scan is not vacuous");
  for (const spec of all) {
    assert.ok(
      spec.startsWith("node:"),
      `${spec} is not a node: builtin — the no-build rule means no npm packages here`
    );
  }
});

test("measure-first-load.mjs is wired to an npm script so it is runnable", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["measure:first-load"], /measure-first-load\.mjs/);
});

/* ---------------- Protocol fidelity ---------------- */

test("the harness serves HTTP/2, because GitHub Pages does", () => {
  const src = read("scripts/measure-first-load.mjs");
  assert.match(src, /createSecureServer/, "must be a TLS server; Chrome will not speak h2c over cleartext");
  assert.match(src, /createServer\(\)/, "there must be a fallback path for when no cert can be made");
  assert.match(src, /serving HTTP\/1\.1/,
    "the HTTP/1.1 fallback must warn that timings are then a worst case");
  assert.match(src, /--ignore-certificate-errors/,
    "a self-signed cert needs the browser flag or every request fails");
});

test("the harness handles only 'stream', not 'request', on the http2 server", () => {
  // A 'request' listener puts node:http2 into HTTP/1 compatibility mode, which
  // answers the HTTP/2 preface with a response Chrome rejects outright. This
  // is a silent, total failure that only shows up as ERR_INVALID_HTTP_RESPONSE.
  const src = read("scripts/measure-first-load.mjs");
  assert.match(src, /server\.on\('stream'/, "the stream handler must exist");
  assert.doesNotMatch(src, /server\.on\('request'/,
    "remove this if you have read the node:http2 docs; it breaks h2c compat mode");
});

test("the harness reports an HTTP/1.1 fallback instead of hiding it", () => {
  const src = read("scripts/measure-first-load.mjs");
  // A silent fallback would quietly reinstate the queueing artefact the
  // server exists to remove, producing flattering but false numbers.
  assert.match(src, /NOT HTTP\/2/, "protocol must be visible in the human-readable report");
});

/* ---------------- Honesty guards ---------------- */

test("the harness fails loudly when a request failed", () => {
  const src = read("scripts/measure-first-load.mjs");
  // A failed request still reports an encodedDataLength, so a broken server
  // otherwise reads as a very fast, very complete load.
  assert.match(src, /the numbers would be fiction/,
    "a run with failed requests must abort rather than report timings");
});

test("the harness takes a median of repeated runs by default", () => {
  const src = read("scripts/measure-first-load.mjs");
  assert.match(src, /median/, "single throttled runs are too noisy to compare");
  assert.match(src, /rawTiming/, "raw per-run samples must be kept for inspection");
});

/* ---------------- Claims in docs/first-load-performance.md ---------------- */

test("docs record a before and an after for every headline metric", () => {
  const doc = read("docs/first-load-performance.md");
  for (const metric of ["First contentful paint", "DOMContentLoaded", "Load event", "Transferred bytes", "Requests"]) {
    assert.ok(doc.includes(metric), `the results table is missing "${metric}"`);
  }
});

test("docs name the rejected optimisations, not only the shipped one", () => {
  const doc = read("docs/first-load-performance.md");
  assert.match(doc, /rejected/i, "rejected options must be recorded");
  // The defer result is a regression; hiding that would misrepresent the work.
  assert.match(doc, /defer/, "the defer experiment and its result must be documented");
  assert.match(doc, /lazy/, "the lazy-loading experiment must be documented");
});

test("docs state the bundler position explicitly, as the issue requires", () => {
  const doc = read("docs/first-load-performance.md");
  assert.match(doc, /bundler/i);
  assert.ok(
    /not recommended|not proposed/i.test(doc),
    "the issue only allows a bundler with an explicit argument; the conclusion must be stated"
  );
});

/* ---------------- The tree still matches what the docs claim ---------------- */

test("webfonts are declared in <head>, not via @import in the stylesheet", () => {
  assert.doesNotMatch(stylesCss, /@import\s+url\(\s*['"]?https:\/\/fonts/,
    "an @import is discovered only after styles.css parses, putting a serial round trip before first paint");
  assert.match(indexHtml, /<link[^>]+rel=["']stylesheet["'][^>]+fonts\.googleapis\.com/,
    "the font stylesheet must be declared in index.html");
  assert.match(indexHtml, /rel=["']preconnect["'][^>]+fonts\.gstatic\.com/,
    "fonts.gstatic.com must be preconnected; it is a second origin on the critical path");
});

test("first load still declares no <img> in the markup", () => {
  // The whole first-load argument is that plates are fetched on interaction,
  // not on load. An <img> in index.html would break that silently.
  assert.equal((indexHtml.match(/<img\b/g) || []).length, 0,
    "index.html must not contain <img>; plates are built by exercise-coach.js at open time");
});

test("the plate directory is still far larger than the first load", () => {
  // Guards the framing: plates are a repository cost, not a first-load cost.
  const plates = path.join(root, "assets", "plates");
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  })(plates);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  assert.ok(bytes > 10 * 1024 * 1024,
    `assets/plates was expected to be >10 MiB, found ${(bytes / 1024 / 1024).toFixed(1)} MiB — docs need updating`);
});
