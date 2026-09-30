"use strict";
/* Unit tests for the sync-conflict panel (js/app.js renderConflictSection)
 * against a minimal DOM shim - the repo's precedent for DOM code without a
 * browser is tests/timer-recovery.test.js.
 *
 * What this proves, and what it cannot:
 *   - the panel renders in GUEST MODE: with no BRDrive at all (the module
 *     absent, so isDriveConfigured does not exist) and no signed-in user, a
 *     stashed conflict still appears with working buttons. This is issue #3's
 *     "conflict UI exists and is reachable in guest mode too".
 *   - a stash that survives sign-out is still shown and resolvable.
 *   - each of the three choices calls resolveConflictById with that choice.
 *   - the empty state is shown when nothing is stashed.
 *   - a BRCloud that throws (or is absent) does not break the panel.
 *
 * It does NOT prove layout or styling - the maintainer should open Settings in
 * a browser to confirm that. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* ---- Extract renderConflictSection + its helpers from js/app.js ----
   app.js is a 2,700-line IIFE that cannot be loaded in Node, so we slice out
   just the conflict-panel code by its unique function anchors and run that. */
const appSrc = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const eol = /\r\n/.test(appSrc) ? "\r\n" : "\n";

/* Slice by line structure, not by a guessed trailing anchor: from the
   CONFLICT_LABEL declaration to the line that closes renderConflictSection
   (the first line after its start that is exactly "  }"). */
function panelSlice() {
  const src = appSrc.split(/\r?\n/);
  const start = src.findIndex((l) => l.trim() === "var CONFLICT_LABEL = {");
  if (start === -1) throw new Error("CONFLICT_LABEL not found in js/app.js");
  const fnStart = src.findIndex((l, i) => i > start && l.trim() === "function renderConflictSection() {");
  if (fnStart === -1) throw new Error("renderConflictSection not found in js/app.js");
  let end = -1;
  for (let i = fnStart + 1; i < src.length; i++) {
    if (src[i] === "  }") { end = i; break; }
  }
  if (end === -1) throw new Error("renderConflictSection closing brace not found");
  const body = src.slice(start, end + 1).join("\n");
  if (/function (renderDriveSection|openSettings|bindEvents)\b/.test(body)) {
    throw new Error("panel slice leaked another function");
  }
  return body;
}

const panelSource = panelSlice() + eol;

/* ---- Minimal DOM shim (see tests/timer-recovery.test.js) ---- */
function makeEl(tag) {
  const node = {
    tagName: tag,
    className: "",
    _text: "",
    children: [],
    style: {},
    listeners: {},
    set textContent(v) { this._text = v == null ? "" : String(v); this.children = []; },
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; },
    set innerHTML(v) { this.children = []; this._text = v === "" ? "" : String(v); },
    get innerHTML() { return this._text; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); },
    setAttribute(k, v) { this[k] = v; },
    /* Depth-first text, so assertions can read the rendered panel. */
    text() {
      const mine = this.children.length ? "" : this._text;
      return [mine].concat(this.children.map((c) => c.text())).join("\n");
    }
  };
  return node;
}

function loadPanel(areaEl, cloud) {
  const document = { createElement: makeEl };
  const sandbox = {
    window: { BRCloud: cloud },
    document: document,
    console: console,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String
  };
  sandbox.window.document = document;
  /* app.js helpers the panel calls. */
  /* app.js defines these at the top of its IIFE; the panel finds its container
   * through $. Only #conflict-area is wired, which is all the panel touches. */
  const $ = (sel) => (sel === "#conflict-area" ? areaEl : null);
  const $$ = () => [];
  const el = function (tag, attrs, children) {
    const node = makeEl(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] == null) return;
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { node.appendChild(typeof c === "string" ? makeEl("span") : c); });
    return node;
  };
  const noModal = function () { return true; };
  const refreshView = function () {};
  const renderDriveSection = function () {};
  const fn = vm.runInNewContext(
    "(function(){" + panelSource + "\nreturn renderConflictSection;})()",
    Object.assign(sandbox, { el: el, $: $, $$: $$, hasOpenModal: noModal, refreshView: refreshView, renderDriveSection: renderDriveSection })
  );
  return fn;
}

const CONFLICT = {
  id: "br_sessions|s1",
  key: "br_sessions",
  path: null,
  recordId: "s1",
  forkId: "s1~conflict-deadbeef",
  kind: "edit-vs-edit",
  fields: ["name"],
  base: { id: "s1", name: "Legs" },
  local: { id: "s1", name: "Legs + Run" },
  remote: { id: "s1", name: "Legs heavy" },
  detectedAt: "2026-01-01T00:00:00.000Z"
};

function fakeCloud(conflicts, calls) {
  return {
    getConflicts: () => conflicts,
    resolveConflictById: (id, choice) => { calls.push([id, choice]); return true; }
  };
}

/* ---- Tests ---- */

test("guest mode with no Drive at all still renders a stashed conflict", () => {
  const area = makeEl("div");
  const calls = [];
  /* No BRDrive: guest mode is simply "Drive is not configured or not signed in".
   * The panel must not depend on it - that is the issue-#3 criterion. */
  const render = loadPanel(area, fakeCloud([CONFLICT], calls));
  render();

  const text = area.text();
  assert.match(text, /s1/, "the conflicting record is named");
  assert.match(text, /edited on two devices/, "the kind is described in words");
  assert.match(text, /Legs \+ Run/, "this device's version is shown");
  assert.match(text, /Legs heavy/, "the other device's version is shown");
  assert.match(text, /both versions were kept/);

  const labels = area.children
    .reduce((acc, c) => acc.concat(c.children), [])
    .filter((c) => c.tagName === "div")
    .flatMap((row) => row.children || [])
    .map((b) => b.textContent);
  ["Keep this device", "Keep other device", "Keep both"].forEach((want) => {
    assert.ok(labels.includes(want), "offers the '" + want + "' choice");
  });
});

test("the tracker conflict names the date it lives under", () => {
  const area = makeEl("div");
  const render = loadPanel(area, fakeCloud([
    Object.assign({}, CONFLICT, { key: "br_tracker", path: "2026-01-01", recordId: "s7" })
  ], []));
  render();
  assert.match(area.text(), /2026-01-01 \/ s7/, "date and session id are both shown");
});

test("each choice calls resolveConflictById with that choice", () => {
  const area = makeEl("div");
  const calls = [];
  const render = loadPanel(area, fakeCloud([CONFLICT], calls));
  render();

  const buttons = area.children
    .reduce((acc, c) => acc.concat(c.children), [])
    .filter((c) => c.tagName === "div")
    .flatMap((row) => row.children || [])
    .filter((b) => b.tagName === "button");

  assert.equal(buttons.length, 3, "exactly three choices offered");
  buttons.forEach((b) => b.listeners.click.forEach((fn) => fn()));

  assert.deepEqual(calls.map((c) => c[1]).sort(), ["both", "local", "remote"]);
  calls.forEach((c) => assert.equal(c[0], CONFLICT.id, "the right conflict id is passed"));
});

test("a delete-vs-edit conflict is labelled as such and shows (deleted)", () => {
  const area = makeEl("div");
  const render = loadPanel(area, fakeCloud([
    Object.assign({}, CONFLICT, {
      kind: "delete-local-vs-edit-remote",
      forkId: null,
      local: undefined,
      remote: { id: "s1", name: "Legs heavy" }
    })
  ], []));
  render();
  const text = area.text();
  assert.match(text, /deleted here, edited on the other device/);
  assert.match(text, /\(deleted\)/, "an absent version is shown as (deleted), not as 'undefined'");
});

test("an empty stash shows the explanatory empty state, not a blank box", () => {
  const area = makeEl("div");
  loadPanel(area, fakeCloud([], []))();
  const text = area.text();
  assert.match(text, /No conflicts/);
  assert.match(text, /nothing is overwritten/);
});

test("a BRCloud that throws is survived - the panel still renders", () => {
  const area = makeEl("div");
  const render = loadPanel(area, {
    getConflicts: () => { throw new Error("storage unavailable"); }
  });
  render();
  assert.match(area.text(), /No conflicts/, "a storage failure degrades to the empty state");
});

test("an absent BRCloud (script not loaded) does not throw", () => {
  const area = makeEl("div");
  loadPanel(area, null)();
  assert.match(area.text(), /No conflicts/);
});
