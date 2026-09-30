"use strict";
/* Does the Pages artifact actually contain everything the app and the service
 * worker need?
 *
 * The Pages deploy copies an EXPLICIT whitelist (`index.html assets css js`,
 * plus sw.js) and then fails if `blender research docs tests scripts` leaked
 * in. That check catches publishing too much. It cannot catch publishing too
 * little: a file referenced by index.html, the manifest or the worker that is
 * not in the whitelist 404s in production while working perfectly in dev.
 *
 * That is the failure this file exists for. Issue #5 put sw.js at the artifact
 * root — a deliberate exception, because a worker under js/ can only claim
 * scope /js/ and offline would not start (see the comment in sw.js). The
 * exception is only safe if something enforces it, so this test parses the
 * staging step out of .github/workflows/ci.yml rather than hardcoding a list,
 * and asserts every referenced file is published.
 *
 * Run: node --test tests/deploy-whitelist.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CACHE = require("../js/data/pwa-cache.js");

const root = path.join(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const baseHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shipSw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "manifest.webmanifest"), "utf8"));

/** Everything the staging step copies, read from the workflow itself. */
function stagedEntries() {
  const staged = [];

  // `for entry in index.html assets css js; do cp -R "$entry" _site/`
  const loop = workflow.match(/for entry in ([^;]+); do\s*\n\s*cp -R "\$entry" _site\//);
  assert.ok(loop, "the `cp -R` staging loop is gone from ci.yml — this test cannot verify it");
  loop[1].trim().split(/\s+/).forEach(entry => staged.push(entry));

  // Single-file copies, e.g. `cp sw.js _site/`
  const single = workflow.matchAll(/^\s*cp (\S+) _site\/$/gm);
  for (const match of single) staged.push(match[1]);

  return staged;
}

/** Would a repo-relative path survive staging into the artifact? */
function isPublished(relPath) {
  if (relPath.startsWith("/")) return false; // absolute: not a repo file
  return stagedEntries().some(entry => relPath === entry || relPath.startsWith(entry + "/"));
}

const staged = stagedEntries();

test("the staging step still copies the site, and no source-only directories", () => {
  // Guards against this test passing because the list became empty.
  assert.ok(staged.length >= 5, "expected the site entries, got: " + staged.join(", "));
  ["index.html", "assets", "css", "js"].forEach(entry => {
    assert.ok(staged.includes(entry), entry + " must be staged");
  });
  for (const forbidden of ["blender", "research", "docs", "tests", "scripts", "node_modules"]) {
    assert.equal(isPublished(forbidden + "/anything"), false, forbidden + " must not be published");
  }
});

test("sw.js is published at the artifact root, which is what gives it scope", () => {
  // js/sw.js would be published but scoped to /js/ only: the navigation to
  // index.html would escape it and offline would not start. A worker that
  // stops being staged at the root is a silent production-only outage.
  assert.ok(staged.includes("sw.js"), "sw.js must be staged at the root for its scope to cover the site");
  assert.ok(fs.existsSync(path.join(root, "sw.js")), "sw.js must exist in the repo");
});

test("every local asset index.html references is published", () => {
  const refs = CACHE.parseShell(baseHtml).urls
    .map(url => url.split("?")[0])
    .concat(["index.html"]);
  const missing = [...new Set(refs)].filter(rel => !isPublished(rel));
  assert.deepEqual(missing, [], "referenced by index.html but not staged: " + (missing.join(", ") || "none"));
});

test("every file the service worker fetches at install is published", () => {
  // The worker precaches these; an unstaged one means a broken offline start.
  const fetched = [...shipSw.matchAll(/(?:add|importScripts)\(\s*new Request\(\s*"([^"]+)"/g)].map(m => m[1]);
  const imported = [...shipSw.matchAll(/importScripts\("([^"]+)"\)/g)].map(m => m[1]);
  const shellDoc = [...shipSw.matchAll(/fetch\("([^"]+)"/g)].map(m => m[1]);
  const all = [...new Set([...fetched, ...imported, ...shellDoc])];
  assert.ok(all.length > 0, "no worker fetch targets found — the extraction is broken");
  const missing = all.filter(rel => !isPublished(rel));
  assert.deepEqual(missing, [], "service worker fetch target not deployed: " + (missing.join(", ") || "none"));
});

test("every manifest icon and shortcut icon is published", () => {
  const icons = manifest.icons.concat(...manifest.shortcuts.map(s => s.icons || []));
  assert.ok(icons.length >= 3, "expected at least the three PWA icons");
  // Icon srcs are relative to the manifest, which lives in assets/.
  // Icon srcs are relative to the manifest, which lives in assets/. Resolve to
  // a repo-relative path first: posix.join normalises "../" away, which would
  // otherwise hide the fact that the icon escaped the assets/ prefix.
  const resolved = icons.map(icon => "assets/" + icon.src);
  const missing = resolved.filter(rel => !isPublished(path.posix.normalize(rel)));
  // Name every offending path: a bare "not deployed" sends the next person
  // hunting through the workflow instead of straight to the icon.
  assert.deepEqual(missing, [], "manifest icon not deployed: " + (missing.join(", ") || "none"));
  for (const rel of resolved) {
    assert.ok(fs.existsSync(path.join(root, rel)), "manifest icon file missing: " + rel);
  }
});

test("the manifest itself is linked from index.html and is published", () => {
  assert.ok(isPublished("assets/manifest.webmanifest"));
  assert.match(baseHtml, /<link rel="manifest" href="assets\/manifest\.webmanifest\?v=battle-rhythm-\d+"/);
});

test("the worker script referenced by js/pwa.js is the published root worker", () => {
  const pwa = fs.readFileSync(path.join(root, "js", "pwa.js"), "utf8");
  const url = pwa.match(/SW_URL\s*=\s*"([^"]+)"/)[1];
  assert.equal(url, "sw.js", "the worker must be registered at the root, where its scope covers the site");
  assert.ok(isPublished(url), "the registered worker is not published");
});

test("a file placed outside the whitelist fails this check rather than production", () => {
  // The mutation that motivated this test: a new script tag under a
  // non-whitelisted directory, which works in dev and 404s on Pages.
  const rogue = baseHtml.replace("js/pwa.js", "scripts/pwa.js");
  assert.notEqual(rogue, baseHtml, "fixture edit must apply");
  const missing = CACHE.parseShell(rogue).urls
    .map(url => url.split("?")[0])
    .filter(rel => !isPublished(rel));
  assert.deepEqual(missing, ["scripts/pwa.js"], "a reference under scripts/ must be reported as unpublished");
});
