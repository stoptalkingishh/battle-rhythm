"use strict";
/* Unit tests for the pure tracker schema/migration module (js/data/tracker-schema.js)
 * using only Node built-ins. Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const TS = require("../js/data/tracker-schema.js");

function sampleSnapshot() {
  return {
    id: "s1",
    name: "Morning PT",
    duration: 60,
    focus: "muscular-strength",
    rpe: "7",
    phases: {
      prep: { items: [
        { id: "i1", type: "drill", label: "Shoulder Prep", reps: "", sets: "", duration: "5-10 reps", rest: "" }
      ] },
      activity: { items: [
        { id: "i2", type: "exercise", label: "Deadlift", sets: "3", reps: "5", duration: "", rest: "120s", machine: "none" },
        { id: "i3", type: "drill", label: "Plank Hold", sets: "", reps: "", duration: "45 sec", rest: "" }
      ] },
      recovery: { items: [
        { id: "i4", type: "drill", label: "Walkout", sets: "", reps: "", duration: "", rest: "" }
      ] }
    }
  };
}

/* ---- result kind detection ---- */
test("resultKind: strength for reps, timed for duration-only, generic otherwise", () => {
  assert.equal(TS.resultKind({ sets: "3", reps: "5" }), "strength");
  assert.equal(TS.resultKind({ duration: "45 sec" }), "timed");
  assert.equal(TS.resultKind({ label: "Walkout", sets: "", reps: "", duration: "" }), "generic");
  assert.equal(TS.resultKind(null), "generic");
});

/* ---- newEntry builds results for every snapshot item ---- */
test("newEntry seeds a result for each planned item", () => {
  const e = TS.newEntry(sampleSnapshot());
  assert.equal(e.schema, 2);
  assert.equal(e.complete, false);
  assert.deepEqual(Object.keys(e.results).sort(), ["i1", "i2", "i3", "i4"]);
  assert.equal(e.results.i2.done, false);
  assert.deepEqual(e.results.i2.actual.sets, []);
  assert.equal(e.results.i2.actual.weight, "");
});

/* ---- actual summary formatting ---- */
test("actualSummary: strength and timed formatting", () => {
  assert.equal(TS.actualSummary({ actual: { reps: "5", weight: "135", rpe: "8", rir: "-1r" } }), "5 reps, 135, RPE 8, RIR -1r");
  assert.equal(TS.actualSummary({ actual: { duration: "30 sec" } }), "30 sec");
  assert.equal(TS.actualSummary({ actual: { distance: "400m" } }), "400m");
  assert.equal(TS.actualSummary({ actual: { sets: [{ reps: "5", weight: "135" }, { reps: "5", weight: "145" }] } }), "5 reps x 135, 5 reps x 145");
  assert.equal(TS.actualSummary({ actual: {} }), "");
  assert.equal(TS.actualSummary({}), "");
});

/* ---- done count ---- */
test("doneCount counts only completed results", () => {
  const e = TS.newEntry(sampleSnapshot());
  e.results.i2.done = true;
  assert.equal(TS.doneCount(e), 1);
});

/* ---- migration preserves v1 history ---- */
test("migrateToV2 converts v1 boolean log to v2 result model without loss", () => {
  const v1 = {
    "2026-08-20": { sessions: { "sidA": { done: { i1: true, i2: true }, complete: false, snapshot: sampleSnapshot() } } },
    "2026-08-21": { sessions: { "sidB": { done: { i4: true }, complete: true, snapshot: sampleSnapshot() } } }
  };
  const v2 = TS.migrateToV2(v1);
  assert.equal(v2.schemaVersion, 2);
  assert.deepEqual(Object.keys(v2).filter((k) => k !== "schemaVersion").sort(), ["2026-08-20", "2026-08-21"]);
  const a = v2["2026-08-20"].sessions.sidA;
  assert.equal(a.schema, 2);
  assert.equal(a.complete, false);
  assert.equal(a.results.i1.done, true, "v1 done preserved");
  assert.equal(a.results.i2.done, true);
  assert.equal(a.results.i3.done, false, "unchecked stays unchecked");
  assert.equal(a.results.i4.done, false);
  assert.ok(a.snapshot.name, "snapshot preserved");
  assert.equal(a.startedAt, null);
  const b = v2["2026-08-21"].sessions.sidB;
  assert.equal(b.complete, true, "v1 completion state preserved");
  assert.equal(b.results.i4.done, true);
});

test("migrateToV2 is idempotent on an already-v2 store and does not mutate input", () => {
  const v1 = { "2026-08-20": { sessions: { sidA: { done: { i1: true }, complete: false, snapshot: sampleSnapshot() } } } };
  const before = JSON.stringify(v1);
  const m1 = TS.migrateToV2(v1);
  assert.equal(JSON.stringify(v1), before, "input never mutated");
  const m2 = TS.migrateToV2(m1);
  assert.equal(m2.schemaVersion, 2);
  assert.equal(m2["2026-08-20"].sessions.sidA.results.i1.done, true, "stable through re-migration");
  assert.deepEqual(Object.keys(m1).filter((k) => k !== "schemaVersion").sort(),
                   Object.keys(m2).filter((k) => k !== "schemaVersion").sort());
});

test("migrateToV2 survives malformed and empty stores", () => {
  assert.deepEqual(TS.migrateToV2(null), { schemaVersion: 2 });
  assert.deepEqual(TS.migrateToV2({}), { schemaVersion: 2 });
  const junk = TS.migrateToV2({ "2026-08-20": "not-an-object" });
  assert.deepEqual(junk["2026-08-20"].sessions, {});
});

test("needsMigration and version helpers", () => {
  assert.equal(TS.version(null), 1);
  assert.equal(TS.version({}), 1);
  assert.equal(TS.version({ schemaVersion: 2 }), 2);
  assert.equal(TS.needsMigration({}), true);
  assert.equal(TS.needsMigration({ schemaVersion: 2 }), false);
  assert.equal(TS.needsMigration(null), false);
});

test("entrySummary formats session-level actuals", () => {
  assert.equal(TS.entrySummary({}), "");
  assert.equal(TS.entrySummary({ rpeActual: "8", durationActual: "42 min", notes: "felt good" }),
               'RPE 8, 42 min elapsed, "felt good"');
});