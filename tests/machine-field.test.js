"use strict";
/* Drift guard for the Builder machine select (#28).
 *
 * The select has to list each machine exactly once, and the list has to be the
 * one in js/data/session-text.js — that module both prints the label
 * ("machine: Barbell rig") and feeds the dropdown. The bug this pins down was a
 * hardcoded <option> for "none" sitting in front of a vocabulary whose first
 * entry is that same row, which rendered the label twice in an 11-option select
 * for a 10-entry list.
 *
 * machineField lives inside the app.js IIFE and is not importable, so this test
 * takes the function's own source text out of js/app.js, instantiates it with a
 * stub `el`/`document`, calls it, and asserts that the options it builds are the
 * vocabulary, in order, one per entry.
 *
 * What this proves: the option list machineField constructs equals
 * BR_SESSION_TEXT.MACHINE_OPTIONS, so a re-added hardcoded row (or a dropped
 * vocabulary row) fails here instead of shipping.
 *
 * What this does not prove: app.js as a whole is never loaded, and the stub
 * `el` is a stand-in for the real element factory — so this is not a rendering
 * test of the running app, and it would not catch a second machine select built
 * somewhere else in it. The extraction is by text, so renaming or restructuring
 * machineField fails the lookup loudly rather than silently skipping.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const TEXT = require("../js/data/session-text.js");

const APP = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

/* Pull `function <name>(...) {...}` out of the source by brace balance,
 * skipping string literals and comments so their braces and parens do not
 * confuse the count. */
function extractFunction(src, name) {
  const header = "function " + name + "(";
  const at = src.indexOf(header);
  assert.notEqual(at, -1, "js/app.js still defines function " + name);
  assert.equal(src.indexOf(header, at + 1), -1, "exactly one function " + name + " in js/app.js");
  let i = src.indexOf("{", at + header.length);
  assert.notEqual(i, -1, name + " has a body");
  const open = i;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === "\\") i++; i++; }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  assert.fail("unbalanced braces after " + name);
  return src.slice(at, open);
}

/* A stand-in for js/app.js's el(): enough of an element to record what
 * machineField built — tag, attributes, appended children, listeners. */
function el(tag, attrs, children) {
  const node = {
    tag: tag,
    attrs: attrs || {},
    children: [],
    selected: false,
    listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  };
  (children || []).forEach(function (child) { node.children.push(child); });
  return node;
}

const documentStub = { createTextNode: function (text) { return { tag: "#text", text: text }; } };

/* Instantiate the real machineField with its four captured dependencies. */
const machineFieldSrc = extractFunction(APP, "machineField");
const machineField = new Function("el", "document", "MACHINE_OPTIONS", "return (" + machineFieldSrc + ");")(
  el, documentStub, TEXT.MACHINE_OPTIONS
);

function render(item) {
  const label = machineField(item, false);
  const select = label.children.filter(function (c) { return c.tag === "select"; })[0];
  assert.ok(select, "machineField returns a label wrapping a select");
  return select.children.filter(function (c) { return c.tag === "option"; });
}

/* ---------------- the duplicate that #28 reported ---------------- */

test("machineField: one option per vocabulary entry, in order", () => {
  const options = render({ label: "Deadlift", machine: "barbell" });
  assert.deepEqual(
    options.map(function (o) { return { value: o.attrs.value, label: o.attrs.text }; }),
    TEXT.MACHINE_OPTIONS.map(function (o) { return { value: o.value, label: o.label }; }),
    "the select is the vocabulary, one row each"
  );
  assert.equal(options.length, TEXT.MACHINE_OPTIONS.length, "no hardcoded extra row");
  assert.ok(options.length >= 10, "the select should not shrink silently");
});

test("machineField: no option appears twice, including 'none'", () => {
  const options = render({ label: "Deadlift", machine: "none" });
  const values = options.map(function (o) { return o.attrs.value; });
  const labels = options.map(function (o) { return o.attrs.text; });
  assert.deepEqual(values.filter((v, i) => values.indexOf(v) !== i), [], "duplicate option values");
  assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), [], "duplicate option labels");
  assert.equal(labels.filter(function (l) { return l === "No machine (free weight / bodyweight)"; }).length, 1);
});

/* ---------------- the removal must not change behaviour ---------------- */

test("machineField: the item's machine is the selected option", () => {
  const options = render({ label: "Deadlift", machine: "cable" });
  assert.deepEqual(options.filter(function (o) { return o.selected; }).map(function (o) { return o.attrs.value; }), ["cable"]);
  const none = render({ label: "Deadlift", machine: "none" });
  assert.equal(none[0].attrs.value, "none");
  assert.equal(none[0].selected, true, "machine: none selects the vocabulary's first row");
});

test("machineField: change events still write item.machine", () => {
  const item = { label: "Deadlift", machine: "barbell" };
  const label = machineField(item, false);
  const select = label.children.filter(function (c) { return c.tag === "select"; })[0];
  select.value = "erg-rower";
  select.listeners.change.forEach(function (fn) { fn(); });
  assert.equal(item.machine, "erg-rower");
});

/* ---------------- the exported text is untouched ---------------- */

test("removing the hardcoded row leaves the exported label for 'none' empty", () => {
  assert.equal(TEXT.machineLabel("none"), "");
  assert.equal(TEXT.itemText({ sets: "2", machine: "none" }), "2 sets");
});