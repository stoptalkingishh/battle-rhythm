"use strict";
/* Unit tests for the pure estimated-1RM module (js/data/onerm.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const O = require("../js/data/onerm.js");

function entry(id, sets) {
  return { id, sets: sets.map((s) => Object.assign({ done: true, warmup: false }, s)) };
}
function workout(d, t, entries) {
  return { d, t, entries };
}

test("estimate1RM: Epley default, single rep is a measurement, cap at 12 reps", () => {
  assert.equal(O.estimate1RM(100, 10), 133.3, "Epley w*(1+r/30), rounded to 1 decimal");
  assert.equal(O.estimate1RM(100, 1), 100, "a 1-rep max returns the weight unchanged");
  assert.equal(O.estimate1RM(100, 13), null, "no estimate above the 12-rep cap");
  assert.equal(O.estimate1RM(0, 10), null);
  assert.equal(O.estimate1RM(100, 0), null);
  assert.equal(O.estimate1RM("abc", 10), null);
});

test("estimate1RM: Brzycki and Lombardi on request, concrete values", () => {
  // w=200, r=6: Epley=200*1.2=240; Brzycki=200*36/31=232.3; Lombardi=200*6^0.1=239.2
  assert.equal(O.estimate1RM(200, 6, "epley"), 240);
  assert.equal(O.estimate1RM(200, 6, "brzycki"), 232.3);
  assert.equal(O.estimate1RM(200, 6, "lombardi"), 239.2);
});

test("bestSetOf: best completed non-warm-up set, ignores ineligible rows", () => {
  const e = entry("ex", [
    { w: 100, r: 10 },               // est 133.3
    { w: 90, r: 10, warmup: true },   // warm-up -> skipped
    { w: 120, r: 13, done: false },   // above cap + not done -> skipped
    { w: 110, r: 9, done: false }     // not done -> skipped
  ]);
  const best = O.bestSetOf(e);
  assert.equal(best.est, 133.3);
  assert.equal(best.w, 100);
});

test("bestSetOf: null when nothing is estimable", () => {
  assert.equal(O.bestSetOf({ id: "ex", sets: [] }), null);
  assert.equal(O.bestSetOf({ id: "ex", sets: [{ w: 120, r: 13 }] }), null, "above cap");
  assert.equal(O.bestSetOf({ id: "ex", sets: [{ w: 0, r: 10 }] }), null, "no load");
  assert.equal(O.bestSetOf(null), null);
});

test("e1rmSeries: one point per workout that produced an estimate, chronological", () => {
  const workouts = [
    workout("2026-08-01", 1, [entry("ex", [{ w: 100, r: 10 }])]),
    workout("2026-08-08", 2, [entry("other", [{ w: 50, r: 10 }])]),   // no 'ex'
    workout("2026-08-15", 3, [entry("ex", [{ w: 200, r: 1 }])])
  ];
  const pts = O.e1rmSeries(workouts, "ex");
  assert.equal(pts.length, 2);
  assert.deepEqual(pts.map((p) => p.y), [133.3, 200]);
  assert.equal(pts[1].w, 200);
  assert.equal(pts[1].r, 1);
});

test("best1RM: returns overall best with its source set and date", () => {
  const workouts = [
    workout("2026-08-01", 1, [entry("ex", [{ w: 100, r: 10 }])]),
    workout("2026-08-15", 3, [entry("ex", [{ w: 200, r: 1 }])])
  ];
  const b = O.best1RM(workouts, "ex");
  assert.equal(b.est, 200);
  assert.equal(b.d, "2026-08-15");
  assert.equal(O.best1RM([], "ex"), null);
});

test("is1RMRecord: true only when this entry beats all history, else null", () => {
  const prior = [workout("2026-08-01", 1, [entry("ex", [{ w: 100, r: 10 }])])]; // 133.3
  const better = entry("ex", [{ w: 110, r: 10 }]);   // 146.7
  const record = O.is1RMRecord(prior, "ex", better);
  assert.equal(record.est, 146.7);
  assert.equal(record.prev, 133.3);

  const worse = entry("ex", [{ w: 90, r: 10 }]);     // 120
  assert.equal(O.is1RMRecord(prior, "ex", worse), null);

  assert.equal(O.is1RMRecord([], "ex", entry("ex", [])), null, "no estimable set");
  const first = O.is1RMRecord([], "ex", entry("ex", [{ w: 100, r: 5 }]));
  assert.equal(first.est, 116.7, "an all-time first estimate is a record");
});