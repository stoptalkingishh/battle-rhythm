"use strict";
/* Unit tests for the portable plan share/import (js/data/plan-share.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const PS = require("../js/data/plan-share.js");

function mkSessions() {
  return [
    { name: "Upper A", tags: ["strength", "upper"], phases: [{ name: "activity", items: [{ id: "x", reps: 5 }] }] },
    { name: "Legs B", tags: ["strength", "legs"] }
  ];
}

test("exportPlan keeps plan-only fields and collects tags", () => {
  const doc = PS.exportPlan(mkSessions(), [{ name: "Block 1", period: "base", sessions: ["Upper A"] }]);
  assert.equal(doc.format, PS.FORMAT);
  assert.equal(doc.version, 1);
  assert.equal(doc.sessions.length, 2);
  assert.ok(doc.tags.indexOf("strength") !== -1);
  assert.equal(doc.regiments.length, 1);
  assert.equal(doc.regiments[0].name, "Block 1");
});

test("importPlan merges new sessions/regiments and never overwrites existing", () => {
  const doc = PS.exportPlan(mkSessions(), []);
  const current = {
    sessions: [{ name: "Upper A", tags: [] }], // same name already present
    regiments: [{ name: "Old Regiment", period: "recovery" }]
  };
  const res = PS.importPlan(JSON.stringify(doc), current);
  // Upper A exists -> unchanged; Legs B is new.
  assert.equal(res.sessions.find((s) => s.name === "Upper A").tags.length, 0, "existing plan untouched");
  assert.equal(res.sessions.find((s) => s.name === "Legs B") !== undefined, true);
  assert.equal(res.regiments.find((r) => r.name === "Old Regiment") !== undefined, true);
  assert.equal(res.added, 1);
});

test("importPlan rejects non-plan input and newer-version docs", () => {
  assert.throws(() => PS.importPlan("not json", {}), /JSON/);
  assert.throws(() => PS.importPlan(JSON.stringify({ format: "other" }), {}), /format/);
  assert.throws(() => PS.importPlan(JSON.stringify({ format: PS.FORMAT, version: PS.VERSION + 1, sessions: [] }), {}), /newer version/);
});

test("importPlan tolerates an empty export as a no-op", () => {
  const doc = PS.exportPlan([], []);
  const res = PS.importPlan(JSON.stringify(doc), { sessions: [{ name: "Keep" }], regiments: [] });
  assert.equal(res.sessions.length, 1);
  assert.equal(res.added, 0);
});