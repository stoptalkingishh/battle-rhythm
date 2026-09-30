"use strict";
/* Unit tests for the offline cache rules (js/data/pwa-cache.js) using only
 * Node built-ins. Run: node --test tests/pwa-cache.test.js
 *
 * These rules are the ones that keep the service worker from reintroducing the
 * stale-asset hazard the cache-buster guard exists to prevent, so the tests
 * are written against the *shipped* index.html rather than a hand-written
 * fixture wherever a real document is the thing under test.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CACHE = require("../js/data/pwa-cache.js");

const root = path.join(__dirname, "..");
const shipSw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const baseHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shell = CACHE.parseShell(baseHtml);

/** Retag every reference in a document to one version, to build drift cases. */
function withVersion(html, to) {
  return html.replace(/\?v=battle-rhythm-\d+/g, "?v=battle-rhythm-" + to);
}

test("parseShell: the shipped index.html is uniform and yields a version", () => {
  assert.equal(shell.drifted, false, "shipped index.html must not have drifted tags");
  assert.equal(typeof shell.version, "string");
  assert.ok(shell.urls.length > 40, "expected the full script set, got " + shell.urls.length);
});

test("parseShell: every precached URL carries the shared version tag", () => {
  // The anti-stale guarantee: a versioned URL is a distinct cache key, so a
  // bump can never be served from the previous version's entry.
  const untagged = shell.urls.filter(url => !url.includes(CACHE.VERSION_TAG + shell.version));
  assert.deepEqual(untagged, [], "every shell entry must carry the shared tag");
});

test("parseShell: every precached URL resolves to a real file in the repo", () => {
  // A typo in a src would precache a 404 and silently break offline. The
  // failure message names the offending path.
  const missing = shell.urls
    .map(url => url.split("?")[0])
    .filter(rel => !fs.existsSync(path.join(root, rel)));
  assert.deepEqual(missing, [], "index.html references files that do not exist");
});

test("parseShell: skips remote, protocol-relative and data: references", () => {
  const html = [
    '<link rel="stylesheet" href="https://cdn.example.com/a.css?v=battle-rhythm-1">',
    '<link rel="stylesheet" href="//cdn.example.com/b.css?v=battle-rhythm-1">',
    '<link rel="icon" href="data:image/svg+xml,%3Csvg%3E?v=battle-rhythm-1">',
    '<script src="js/app.js?v=battle-rhythm-1"></script>'
  ].join("\n");
  const parsed = CACHE.parseShell(html);
  assert.deepEqual(parsed.urls, ["js/app.js?v=battle-rhythm-1"]);
});

test("parseShell: reports drift instead of building a mixed cache", () => {
  // The state that historically paired a new app.js with an old sync-core.js.
  // The worker must refuse to install, and the test proves the signal exists.
  const drifted = CACHE.parseShell(withVersion(baseHtml, 41).replace("js/sync-core.js?v=battle-rhythm-41", "js/sync-core.js?v=battle-rhythm-40"));
  assert.equal(drifted.drifted, true);
  assert.equal(drifted.version, null, "no single version may be reported when tags disagree");
});

test("parseShell: reports an untagged document rather than guessing", () => {
  const untagged = CACHE.parseShell('<script src="js/app.js"></script>');
  assert.equal(untagged.version, null);
  assert.equal(untagged.drifted, false);
  assert.deepEqual(untagged.urls, [], "an untagged reference is not a cache key");
});

test("shellCacheName: a bump produces a different cache, so activate() can purge", () => {
  const at40 = CACHE.shellCacheName("40");
  const at41 = CACHE.shellCacheName("41");
  assert.notEqual(at40, at41);
  assert.match(at40, /^battle-rhythm-shell-v40$/);
  // The unversioned name is distinct too: a shell built from an untagged
  // document must never be mistaken for a versioned one.
  assert.notEqual(CACHE.shellCacheName(null), at40);
});

test("classify: routes each request kind to the right strategy", () => {
  assert.equal(CACHE.classify("/battle-rhythm/", true), "navigate", "navigations are network-first");
  assert.equal(CACHE.classify("/battle-rhythm/css/styles.css?v=battle-rhythm-40", false), "versioned");
  assert.equal(CACHE.classify("/battle-rhythm/assets/plates/atp/a1.webp", false), "plate");
  assert.equal(CACHE.classify("/battle-rhythm/api/whatever", false), "passthrough");
});

test("classify: a navigation wins over its untagged path", () => {
  // "/" has no ?v= tag. Without the navigation check first it would fall
  // through to passthrough and offline would fail to start the app.
  assert.equal(CACHE.classify("/", true), "navigate");
  assert.equal(CACHE.classify("/index.html", true), "navigate");
});

test("classify: only assets/plates/ is the plate cache, not sibling paths", () => {
  assert.equal(CACHE.classify("/battle-rhythm/assets/icons/icon-192.png", false), "passthrough");
  assert.equal(CACHE.classify("/battle-rhythm/assets/plates/ai/a1.webp", false), "plate");
  // A directory merely *containing* "plates" must not be swept in.
  assert.equal(CACHE.classify("/battle-rhythm/docs/plates/x.png", false), "passthrough");
});

test("isServiceWorkerScript: the worker is never served from cache", () => {
  // Otherwise a deploy cannot install the worker that would have replaced it.
  assert.equal(CACHE.isServiceWorkerScript("/battle-rhythm/sw.js"), true);
  // Any worker script is excluded, wherever it is served from: a cached
  // worker is a worker that can never be replaced by a deploy.
  assert.equal(CACHE.isServiceWorkerScript("/battle-rhythm/js/sw.js"), true);
  assert.equal(CACHE.isServiceWorkerScript("/battle-rhythm/js/app.js"), false);
  // A lookalike that merely contains "sw.js" is a normal asset.
  assert.equal(CACHE.isServiceWorkerScript("/battle-rhythm/js/sw.js.map"), false);
  assert.equal(CACHE.isServiceWorkerScript("/battle-rhythm/js/app.js"), false);
});

test("isCrossOrigin: Drive and the FM 7-22 PDF are never intercepted", () => {
  const origin = "https://stoptalkingishh.github.io";
  assert.equal(CACHE.isCrossOrigin("https://stoptalkingishh.github.io/battle-rhythm/js/app.js", origin), false);
  assert.equal(CACHE.isCrossOrigin("https://www.googleapis.com/drive/v3/files", origin), true);
  assert.equal(CACHE.isCrossOrigin("https://armypubs.army.mil/epubs/DR_pubs/fm-7-22.pdf", origin), true);
  // Unparseable input must be treated as foreign, not cached by accident.
  assert.equal(CACHE.isCrossOrigin("http://[bad", origin), true);
});

test("shouldDeleteCache: purge old shells, keep the current shell and the plates", () => {
  const shell41 = CACHE.shellCacheName("41");
  const plates = CACHE.plateCacheName();
  assert.equal(CACHE.shouldDeleteCache("battle-rhythm-shell-v40", shell41, plates), true, "a superseded shell must go");
  assert.equal(CACHE.shouldDeleteCache(shell41, shell41, plates), false);
  // Plates are content-stable and deliberately survive a deploy.
  assert.equal(CACHE.shouldDeleteCache(plates, shell41, plates), false);
});

test("classify: the cache-buster tag is read from the query, not the pathname", () => {
  // Regression: classify() was called with new URL(href).pathname, which drops
  // the search. Every versioned shell asset then classified as "passthrough",
  // so cache-first never applied to the shell and offline served nothing.
  // The versioned branch is only reachable if the search is passed through.
  const real = new URL("https://stoptalkingishh.github.io/battle-rhythm/css/styles.css?v=battle-rhythm-40");
  assert.equal(CACHE.classify(real.pathname, false), "passthrough", "pathname alone carries no tag");
  assert.equal(CACHE.classify(real.pathname + real.search, false), "versioned");
  // sw.js must pass the search through at the call site.
  assert.match(shipSw, /CACHE\.classify\(url\.pathname \+ url\.search/);
});

test("sw.js does not leave a cache-miss fetch unhandled", () => {
  // Regression: cacheFirst() had no .catch(), so a plate not yet cached while
  // offline rejected respondWith() and failed the whole page load instead of
  // degrading to one broken <img>.
  const cacheFirst = shipSw.slice(shipSw.indexOf("function cacheFirst"));
  const body = cacheFirst.slice(0, cacheFirst.indexOf("\n}\n"));
  assert.match(body, /\.catch\(/, "cacheFirst must handle a failed fetch");
  assert.match(body, /Response\.error\(\)/, "and return a response, not a rejection");
  // networkFirst must never cache a non-ok response over a good shell.
  assert.match(shipSw, /response && response\.ok/);
});

test("sw.js precaches the manifest, and the manifest link is versioned", () => {
  // Both halves of the offline story need each other: the manifest must be in
  // the cache or the installed app is not installable offline.
  assert.match(shipSw, /assets\/manifest\.webmanifest/);
  assert.match(baseHtml, /<link rel="manifest" href="assets\/manifest\.webmanifest\?v=battle-rhythm-\d+"/);
});

test("sw.js uses importScripts on the deployed path, not an absolute one", () => {
  // An absolute /js/... would resolve against the origin root rather than the
  // deployed subpath, and throw on a project Pages site.
  assert.match(shipSw, /importScripts\("js\/data\/pwa-cache\.js"\)/);
  assert.equal(/importScripts\("\//.test(shipSw), false, "importScripts must be relative");
});
