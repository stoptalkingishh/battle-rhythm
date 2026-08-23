"use strict";
/* Unit tests for the pure tracker schema/migration module (js/data/tracker-schema.js)
 * using only Node built-ins. Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const TS = require("../js/data/tracker-schema.js");

const V = TS.SCHEMA_VERSION;   // current schema version (v3)

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
test("newEntry seeds a result for each planned item and applies v3 defaults", () => {
  const e = TS.newEntry(sampleSnapshot());
  assert.equal(e.schema, V);
  assert.equal(e.complete, false);
  assert.deepEqual(Object.keys(e.results).sort(), ["i1", "i2", "i3", "i4"]);
  assert.equal(e.results.i2.done, false);
  assert.deepEqual(e.results.i2.actual.sets, []);
  assert.equal(e.results.i2.actual.weight, "");

  // v3 defaults land on every planned item.
  const i2 = e.snapshot.phases.activity.items.find((i) => i.id === "i2");
  assert.equal(i2.mode, "reps", "reps default for a weighted exercise");
  assert.equal(i2.warmup, false);
  assert.equal(i2.perside, false);
  assert.equal(i2.bodyweight, false);
  assert.equal(i2.superset, "");
  assert.equal(i2.effort, "");
  const i3 = e.snapshot.phases.activity.items.find((i) => i.id === "i3");
  assert.equal(i3.mode, "time", "planned duration implies timed mode");
});

test("defaultItemFields is idempotent and preserves an explicit timed mode", () => {
  const it = { id: "x", mode: "time", duration: "45 sec" };
  TS.defaultItemFields(it);
  assert.equal(it.mode, "time");
  const before = JSON.stringify(it);
  TS.defaultItemFields(it);
  assert.equal(JSON.stringify(it), before, "re-running is a no-op");
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
test("migrateToV2 converts v1 boolean log to current result model without loss", () => {
  const v1 = {
    "2026-08-20": { sessions: { "sidA": { done: { i1: true, i2: true }, complete: false, snapshot: sampleSnapshot() } } },
    "2026-08-21": { sessions: { "sidB": { done: { i4: true }, complete: true, snapshot: sampleSnapshot() } } }
  };
  const migrated = TS.migrateToV2(v1);
  assert.equal(migrated.schemaVersion, V);
  assert.deepEqual(Object.keys(migrated).filter((k) => k !== "schemaVersion").sort(), ["2026-08-20", "2026-08-21"]);
  const a = migrated["2026-08-20"].sessions.sidA;
  assert.equal(a.schema, V);
  assert.equal(a.complete, false);
  assert.equal(a.results.i1.done, true, "v1 done preserved");
  assert.equal(a.results.i2.done, true);
  assert.equal(a.results.i3.done, false, "unchecked stays unchecked");
  assert.equal(a.results.i4.done, false);
  assert.ok(a.snapshot.name, "snapshot preserved");
  assert.equal(a.startedAt, null);
  const b = migrated["2026-08-21"].sessions.sidB;
  assert.equal(b.complete, true, "v1 completion state preserved");
  assert.equal(b.results.i4.done, true);
});

/* ---- v2 -> v3 upgrade keeps logged numbers ---- */
test("v2 -> v3 upgrade carries results forward and only adds item defaults", () => {
  const v2Full = {
    schemaVersion: 2,
    "2026-08-22": { sessions: { "sidC": {
      schema: 2,
      complete: true,
      startedAt: "2026-08-22T06:00:00Z",
      completedAt: "2026-08-22T07:10:00Z",
      rpeActual: "8", durationActual: "70 min", notes: "felt strong",
      snapshot: sampleSnapshot(),
      results: {
        i2: { done: true, actual: { sets: [{ weight: "135", reps: "5", rest: "120s" }, { weight: "185", reps: "3", rest: "120s" }], reps: "", weight: "", duration: "", distance: "", rpe: "9", rir: "", notes: "" } },
        i3: { done: true, actual: { sets: [], reps: "", weight: "", duration: "45 sec", distance: "", rpe: "", rir: "", notes: "" } }
      }
    } } }
  };
  const migrated = TS.migrateToV2(v2Full);
  assert.equal(migrated.schemaVersion, V);
  const s = migrated["2026-08-22"].sessions.sidC;
  assert.equal(s.schema, V);
  // The logged numbers MUST survive the upgrade untouched.
  assert.deepEqual(s.results.i2.actual.sets,
    [{ weight: "135", reps: "5", rest: "120s" }, { weight: "185", reps: "3", rest: "120s" }]);
  assert.equal(s.results.i3.actual.duration, "45 sec");
  assert.equal(s.rpeActual, "8");
  // Snapshot items gained the v3 defaults.
  const i2 = s.snapshot.phases.activity.items.find((i) => i.id === "i2");
  assert.equal(i2.mode, "reps");
  assert.equal(i2.warmup, false);
  // Any planned item missing a results row got one (mirrors newEntry).
  assert.equal(s.results.i1.done, false);
  assert.equal(s.results.i4.done, false);
});

test("migrateToV2 is idempotent on an already-current store and does not mutate input", () => {
  const v1 = { "2026-08-20": { sessions: { sidA: { done: { i1: true }, complete: false, snapshot: sampleSnapshot() } } } };
  const before = JSON.stringify(v1);
  const m1 = TS.migrateToV2(v1);
  assert.equal(JSON.stringify(v1), before, "input never mutated");
  const m2 = TS.migrateToV2(m1);
  assert.equal(m2.schemaVersion, V);
  assert.equal(m2["2026-08-20"].sessions.sidA.results.i1.done, true, "stable through re-migration");
  assert.deepEqual(Object.keys(m1).filter((k) => k !== "schemaVersion").sort(),
                   Object.keys(m2).filter((k) => k !== "schemaVersion").sort());
});

test("migrateToV2 survives malformed and empty stores", () => {
  assert.deepEqual(TS.migrateToV2(null), { schemaVersion: V });
  assert.deepEqual(TS.migrateToV2({}), { schemaVersion: V });
  const junk = TS.migrateToV2({ "2026-08-20": "not-an-object" });
  assert.deepEqual(junk["2026-08-20"].sessions, {});
});

test("needsMigration and version helpers", () => {
  assert.equal(TS.version(null), 1);
  assert.equal(TS.version({}), 1);
  assert.equal(TS.version({ schemaVersion: 2 }), 2);
  assert.equal(TS.needsMigration({}), true);
  assert.equal(TS.needsMigration({ schemaVersion: 2 }), true, "v2 store still needs the v3 upgrade");
  assert.equal(TS.needsMigration({ schemaVersion: V }), false);
  assert.equal(TS.needsMigration(null), false);
});

test("version() reports a stored schemaVersion above the current one as-is", () => {
  assert.equal(TS.version({ schemaVersion: 9 }), 9);
  assert.equal(TS.needsMigration({ schemaVersion: 9 }), false);
});

test("entrySummary formats session-level actuals", () => {
  assert.equal(TS.entrySummary({}), "");
  assert.equal(TS.entrySummary({ rpeActual: "8", durationActual: "42 min", notes: "felt good" }),
               'RPE 8, 42 min elapsed, "felt good"');
});