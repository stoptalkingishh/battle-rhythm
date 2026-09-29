"use strict";
/* Unit tests for the pure DOM-attribute rules (js/data/dom-attrs.js)
 * using only Node built-ins. Run: node --test tests/dom-attrs.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const DA = require("../js/data/dom-attrs.js");

/* Minimal stand-in for a DOM node: property writes land in `props`, and
 * setAttribute calls are recorded (stringified) in `attrs`. */
function fakeNode() {
  const attrs = {};
  const props = {};
  const node = { attrs, props, setAttribute(name, value) { attrs[name] = String(value); } };
  DA.BOOLEAN_ATTRS.forEach((name) => {
    Object.defineProperty(node, name, {
      get() { return props[name]; },
      set(v) { props[name] = v; }
    });
  });
  return node;
}

function applyTo(node, attrObj) {
  Object.keys(attrObj).forEach((k) => DA.apply(node, k, attrObj[k]));
  return node;
}

test("apply: writes boolean attributes as properties, not attributes", () => {
  const node = fakeNode();
  assert.equal(DA.apply(node, "disabled", false), true);
  assert.equal(node.props.disabled, false, "false is stored as boolean false");
  assert.equal(node.attrs.disabled, undefined, "never stringified into an attribute");
});

test("apply: truthy and non-boolean values on a boolean attribute", () => {
  const node = fakeNode();
  DA.apply(node, "checked", true);
  DA.apply(node, "selected", "selected");
  DA.apply(node, "readonly", 0);
  assert.equal(node.props.checked, true);
  assert.equal(node.props.selected, true, '"selected" string means true');
  assert.equal(node.props.readonly, false);
  assert.deepEqual(node.attrs, {});
});

test("apply: omits null and undefined attributes entirely", () => {
  const node = fakeNode();
  assert.equal(DA.apply(node, "selected", null), false);
  assert.equal(DA.apply(node, "data-x", undefined), false);
  assert.equal(node.props.selected, undefined, 'no selected="null" on the option');
  assert.deepEqual(node.attrs, {});
});

test("apply: null is skipped for boolean attributes too (no false-y default)", () => {
  const node = fakeNode();
  applyTo(node, { type: "checkbox", checked: null });
  assert.equal("checked" in node.props, false);
  assert.deepEqual(node.attrs, { type: "checkbox" });
});

test("apply: non-boolean attributes still go through setAttribute", () => {
  const node = fakeNode();
  applyTo(node, { class: "input", type: "number", value: "", "aria-label": "Sets" });
  assert.deepEqual(node.attrs, {
    class: "input", type: "number", value: "", "aria-label": "Sets"
  });
  assert.deepEqual(node.props, {});
});

test("apply: every boolean attribute in the session builder is covered", () => {
  ["disabled", "checked", "selected", "readonly", "required", "hidden", "multiple"].forEach((name) => {
    assert.equal(DA.isBoolean(name), true, name + " is a boolean attribute");
  });
  assert.deepEqual(DA.BOOLEAN_ATTRS.slice().sort(), [
    "checked", "disabled", "hidden", "multiple", "readonly", "required", "selected"
  ]);
});

test("apply: non-boolean names are not treated as boolean", () => {
  ["class", "type", "value", "onclick", "selectedIndex", "disable", "check"].forEach((name) => {
    assert.equal(DA.isBoolean(name), false, name + " is not a boolean attribute");
  });
});

test("isEmpty: null and undefined only", () => {
  assert.equal(DA.isEmpty(null), true);
  assert.equal(DA.isEmpty(undefined), true);
  [0, "", false, NaN].forEach((v) => assert.equal(DA.isEmpty(v), false, String(v) + " is present"));
});

test("apply: a read-only/false pair on one node, mirroring itemField()", () => {
  const editable = applyTo(fakeNode(), { type: "text", value: "3", disabled: false });
  assert.equal(editable.props.disabled, false, "editable when readOnly is false");
  assert.equal("disabled" in editable.attrs, false, 'no disabled="false" attribute written');

  const locked = applyTo(fakeNode(), { type: "text", value: "3", disabled: true });
  assert.equal(locked.props.disabled, true, "disabled when readOnly is true");
});

test("apply: selected option marks exactly one option", () => {
  const node = fakeNode();
  ["lb", "kg"].forEach((u) => DA.apply(node, "selected", u === "kg" ? "selected" : null));
  assert.equal(node.props.selected, true);
});
