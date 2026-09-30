"use strict";
/* Unit tests for br_tracker -> normalized-workouts adapter (js/data/history-adapter.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../js/data/history-adapter.js");

function logs(overrides) {
  return Object.assign({
    schemaVersion: 3,
    "2026-08-01": {
      sessions: {
        s1: {
          complete: true,
          completedAt: "2026-08-01T10:00:00Z",
          results: {
            i1: {
              done: true,
              actual: { sets: [{ weight: 100, reps: 5, rest: 0 }] }
            }
          }
        }
      }
    }
  }, overrides || {});
}

test("workoutsFromLogs turns logged sessions into normalized entries", () => {
  const ws = A.workoutsFromLogs(logs());
  assert.equal(ws.length, 1);
  assert.equal(ws[0].d, "2026-08-01");
  assert.ok(ws[0].t > 0, "uses completedAt as the sort key");
  assert.equal(ws[0].entries.length, 1);
  assert.equal(ws[0].entries[0].id, "i1");
  assert.deepEqual(ws[0].entries[0].sets[0], { w: 100, r: 5, done: true, warmup: false });
});

test("workoutsFromLogs skips incomplete sessions unless asked to include them", () => {
  const inc = logs({ "2026-08-01": { sessions: { s1: { complete: false, results: { i1: { actual: { sets: [{ weight: 90, reps: 5 }] } } } } } } });
  assert.equal(A.workoutsFromLogs(inc).length, 0);
  const incl = A.workoutsFromLogs(inc, { includeIncomplete: true });
  assert.equal(incl.length, 1);
});

test("workoutsFromLogs sorts chronologically and only for sessions that carry sets", () => {
  const ws = A.workoutsFromLogs({
    "2026-08-10": { sessions: { a: { complete: true, completedAt: "2026-08-10T00:00:00Z", results: { i1: { actual: { sets: [{ weight: 120, reps: 3 }] } } } } } },
    "2026-08-02": { sessions: { b: { complete: true, completedAt: "2026-08-02T00:00:00Z", results: { i1: { actual: { sets: [{ weight: 110, reps: 4 }] } } } } } }
  });
  assert.deepEqual(ws.map((w) => w.d), ["2026-08-02", "2026-08-10"]);
});

test("exercisesWithSets lists ids that have weight+rep sets", () => {
  assert.deepEqual(A.exercisesWithSets(logs()), ["i1"]);
  assert.deepEqual(A.exercisesWithSets({ schemaVersion: 3 }), []);
});

/* Tracker results are keyed by the item uid, which is minted per session, so
 * the raw ids are opaque and unique. Progress needs the exercise ref. */

const REFS = { i1: "s1-deadlift", i2: "s2-squat", i3: "pd" };

test("keyWorkoutsByRef relabels entries with the exercise ref from lookup", () => {
  const ws = A.keyWorkoutsByRef(A.workoutsFromLogs(logs()), (id) => REFS[id]);
  assert.equal(ws.length, 1);
  assert.equal(ws[0].d, "2026-08-01");
  assert.ok(ws[0].t > 0, "preserves the sort key");
  assert.deepEqual(ws[0].entries.map((e) => e.id), ["s1-deadlift"]);
  assert.deepEqual(ws[0].entries[0].sets[0], { w: 100, r: 5, done: true, warmup: false });
});

test("keyWorkoutsByRef makes one exercise id across separate sessions", () => {
  /* Two sessions, two different item uids, one exercise. Unkeyed this is two
   * Progress dropdown rows; keyed it is one. */
  const two = A.workoutsFromLogs({
    "2026-08-01": { sessions: { s1: { complete: true, completedAt: "2026-08-01T10:00:00Z", results: { i1: { actual: { sets: [{ weight: 100, reps: 5 }] } } } } } },
    "2026-08-08": { sessions: { s2: { complete: true, completedAt: "2026-08-08T10:00:00Z", results: { i2: { actual: { sets: [{ weight: 110, reps: 5 }] } } } } } }
  });
  assert.deepEqual(two.map((w) => w.entries[0].id), ["i1", "i2"], "raw ids are per-session uids");
  const keyed = A.keyWorkoutsByRef(two, (id) => (id === "i2" ? "s1-deadlift" : REFS[id]));
  assert.deepEqual(keyed.map((w) => w.entries[0].id), ["s1-deadlift", "s1-deadlift"]);
  assert.deepEqual(A.exercisesWithSetsIn(keyed), ["s1-deadlift"]);
  assert.deepEqual(keyed[0].entries[0].sets[0].w, 100);
  assert.deepEqual(keyed[1].entries[0].sets[0].w, 110, "each session keeps its own load");
});

test("keyWorkoutsByRef merges items sharing a ref inside one session", () => {
  const ws = A.keyWorkoutsByRef(
    A.workoutsFromLogs({
      "2026-08-01": { sessions: { s1: { complete: true, completedAt: "2026-08-01T10:00:00Z", results: {
        i1: { actual: { sets: [{ weight: 100, reps: 5 }] } },
        i2: { actual: { sets: [{ weight: 120, reps: 3 }] } }
      } } } }
    }),
    () => "s1-deadlift"
  );
  assert.equal(ws[0].entries.length, 1);
  assert.equal(ws[0].entries[0].sets.length, 2, "both items' sets are counted, not dropped");
});

test("keyWorkoutsByRef keeps the item id when lookup cannot resolve it", () => {
  const ws = A.keyWorkoutsByRef(A.workoutsFromLogs(logs()), () => "");
  assert.deepEqual(ws[0].entries.map((e) => e.id), ["i1"]);
  const noLookup = A.keyWorkoutsByRef(A.workoutsFromLogs(logs()), null);
  assert.deepEqual(noLookup, [], "a missing lookup yields no workouts rather than throwing");
});

test("exercisesWithSetsIn ignores entries with no estimable weight+rep set", () => {
  const ws = [
    { d: "2026-08-01", t: 1, entries: [
      { id: "s1-deadlift", sets: [{ w: 100, r: 5, done: true }] },
      { id: "timed-only", sets: [{ sec: 30, done: true }] },
      { id: "bodyweight", sets: [{ w: 0, r: 20, done: true }] }
    ] }
  ];
  assert.deepEqual(A.exercisesWithSetsIn(ws), ["s1-deadlift"]);
  assert.deepEqual(A.exercisesWithSetsIn([]), []);
});