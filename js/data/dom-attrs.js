"use strict";
/* Pure attribute-application rules shared by the browser app (loads as
 * window.BR_DOM_ATTRS) and the Node test suite (node:test).
 *
 * el() in app.js builds every node in the UI. HTML boolean attributes are true
 * by *presence*, so handing them to setAttribute stringifies the value:
 * disabled: false becomes disabled="false", which the DOM reads as TRUE. The
 * same happens to a null/undefined value (selected: null -> selected="null").
 *
 * This module owns that decision so it is testable without a DOM:
 *   - null / undefined attributes are omitted entirely;
 *   - known boolean attributes are written as DOM properties (id -> boolean);
 *   - everything else falls through to setAttribute.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_DOM_ATTRS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Attributes whose value is the presence of the attribute itself. */
  var BOOLEAN_ATTRS = [
    "checked", "disabled", "hidden", "multiple", "readonly", "required", "selected"
  ];

  function isBoolean(name) { return BOOLEAN_ATTRS.indexOf(String(name)) !== -1; }

  function isEmpty(value) { return value == null; }

  /* Apply one attribute to a node. Returns true when the node was written to.
   * `node` only needs setAttribute and (for booleans) a writable property. */
  function apply(node, name, value) {
    if (!node || isEmpty(value)) return false;
    if (isBoolean(name)) {
      node[name] = !!value;
      return true;
    }
    node.setAttribute(name, value);
    return true;
  }

  return {
    BOOLEAN_ATTRS: BOOLEAN_ATTRS,
    isBoolean: isBoolean,
    isEmpty: isEmpty,
    apply: apply
  };
});
