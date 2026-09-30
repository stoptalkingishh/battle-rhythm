"use strict";
/* Unit tests for the module capability list (js/data/capabilities.js) using
 * only Node built-ins. Run: node --test tests/
 *
 * Two kinds of assertion live here, and the second is the one that earns the
 * file: the pure report (present / missing, by name, with severity), and the
 * cross-check that the list still matches the script tags in index.html. There
 * is no bundler to notice a renamed global, so a rename that nobody also made
 * here would otherwise be caught only by a user staring at a broken view.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CAP = require("../js/data/capabilities.js");

const ROOT = path.join(__dirname, "..");

/* Module globals are the BR family (BR_EXERCISES, BRTrackerSchema, BRChart,
 * ...); the filter also drops the odd incidental assignment the scan would
 * otherwise pick up (cloud.js sets window.__brOnlineBound, and
 * exercise-coach.js assigns .className on a local `root`, not on window). */
const GLOBAL_PATTERN = /\b(?:window|root|self|globalThis)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
const MODULE_GLOBAL = /^BR(?:_|[A-Z])/;

function publishedGlobals(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const found = new Set();
  let match;
  GLOBAL_PATTERN.lastIndex = 0;
  while ((match = GLOBAL_PATTERN.exec(text))) {
    if (MODULE_GLOBAL.test(match[1])) found.add(match[1]);
  }
  return found;
}

function localScripts() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [];
  const re = /<script src="([^"?]+)(?:\?[^"]*)?"/g;
  let match;
  while ((match = re.exec(html))) srcs.push(match[1]);
  return srcs;
}

function presentMap(absent) {
  const gone = absent || [];
  const map = {};
  CAP.names().forEach(name => { if (gone.indexOf(name) === -1) map[name] = {}; });
  return map;
}

test("every capability's declared module exists and publishes that global", () => {
  for (const cap of CAP.CAPABILITIES) {
    const file = path.join(ROOT, cap.module);
    assert.ok(fs.existsSync(file), `${cap.global}: module file missing: ${cap.module}`);
    assert.ok(
      publishedGlobals(cap.module).has(cap.global),
      `${cap.global} is not assigned by ${cap.module} - the global was renamed or moved`
    );
  }
});

test("every module global loaded by index.html is in the capability list", () => {
  /* config.js is credentials and feature flags, not a module (check-config.mjs
   * owns it); app.js publishes nothing; capabilities.js is this list and cannot
   * list itself. Everything else that index.html loads must be accounted for,
   * so adding a script tag without listing it fails. */
  const known = new Set(CAP.names());
  const unlisted = [];
  for (const src of localScripts()) {
    if (src.endsWith("js/config.js") || src.endsWith("js/app.js") ||
        src.endsWith("js/data/capabilities.js")) continue;
    for (const name of publishedGlobals(src)) {
      if (!known.has(name)) unlisted.push(`${name} (${src})`);
    }
  }
  assert.deepEqual(unlisted, [], "module globals loaded but missing from CAPABILITIES");
});

test("nothing missing: report is empty and no message is produced", () => {
  const report = CAP.inspect(presentMap());
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.missingRequired, []);
  assert.deepEqual(report.missingOptional, []);
  assert.equal(report.ok, true);
  assert.equal(CAP.message(report), null);
  assert.equal(report.present.length, CAP.names().length);
});

test("an empty globals object reports every module by name", () => {
  const report = CAP.inspect({});
  assert.deepEqual(report.present, []);
  assert.deepEqual(report.missing.map(m => m.name), CAP.names());
  assert.deepEqual(report.missingRequired, CAP.CAPABILITIES.filter(c => c.required).map(c => c.global));
  assert.equal(report.ok, false);
});

test("a missing module is reported by name, with its file and severity", () => {
  const report = CAP.inspect(presentMap(["BR_HEATMAP"]));
  assert.deepEqual(report.missing, [
    { name: "BR_HEATMAP", module: "js/data/heatmap.js", required: false }
  ]);
  assert.deepEqual(report.missingOptional, ["BR_HEATMAP"]);
  assert.equal(report.present.indexOf("BR_HEATMAP"), -1, "a miss is not also counted present");
  const msg = CAP.message(report);
  assert.ok(msg.indexOf("BR_HEATMAP") !== -1, "notice names the missing module");
  assert.ok(msg.indexOf("js/data/heatmap.js") === -1, "notice stays readable: names, not paths");
});

test("a missing optional module leaves the app usable, a required one does not", () => {
  const optional = CAP.inspect(presentMap(["BR_PLAN_SHARE"]));
  assert.deepEqual(optional.missingOptional, ["BR_PLAN_SHARE"]);
  assert.deepEqual(optional.missingRequired, []);
  assert.equal(optional.ok, true, "optional loss degrades a feature, not the app");
  assert.ok(CAP.message(optional).indexOf("BR_PLAN_SHARE") !== -1);

  const required = CAP.inspect({});
  assert.equal(required.ok, false);
  assert.ok(CAP.message(required).indexOf("(required)") !== -1, "fatal misses are marked");
});

test("several missing modules are all named in one message", () => {
  const report = CAP.inspect(presentMap(["BR_HEATMAP", "BR_PLAN_SHARE"]));
  const msg = CAP.message(report);
  ["BR_HEATMAP", "BR_PLAN_SHARE"].forEach(name => {
    assert.ok(msg.indexOf(name) !== -1, `${name} named`);
  });
  assert.equal(msg.indexOf("BR_BODYWEIGHT"), -1, "a present module is not named");
  assert.deepEqual(report.missingOptional, ["BR_HEATMAP", "BR_PLAN_SHARE"]);
  assert.equal(report.ok, true, "all three are optional, so the app still works");
});

test("a loaded-but-empty module counts as present, not missing", () => {
  /* {} and [] mean the file loaded and published nothing; treating that as a
   * failed script would send the maintainer after a 404 that is not there. */
  const only = CAP.inspect({ BR_DOCTRINE: {}, BR_FILTERS: [] });
  assert.equal(only.present.indexOf("BR_DOCTRINE") !== -1, true, "empty object is present");
  assert.equal(only.present.indexOf("BR_FILTERS") !== -1, true, "empty array is present");
  assert.equal(only.present.indexOf("BR_HEATMAP"), -1, "an absent name is still absent");
  assert.equal(CAP.isPresent(0), true, "a falsy-but-real value loaded");
  assert.equal(CAP.isPresent(null), false);
  assert.equal(CAP.isPresent(undefined), false);
});

test("message tolerates a null or absent report", () => {
  assert.equal(CAP.message(null), null);
  assert.equal(CAP.message(undefined), null);
});