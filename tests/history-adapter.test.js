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