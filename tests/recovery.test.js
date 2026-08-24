"use strict";
/* Unit tests for the muscle recovery / balance module (js/data/recovery.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/data/recovery.js");

const DAY = 86400000;
const NOW = Date.parse("2026-08-30T12:00:00Z");

function wk(daysAgo, entries) {
  return { t: NOW - daysAgo * DAY, d: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10), entries: entries };
}

const workouts = [
  wk(0, [{ id: "bench", muscleGroups: ["chest", "triceps"], sets: [
    { w: 100, r: 5, done: true }, { w: 60, r: 5, done: true, warmup: true } // warm-up excluded
  ] }]),
  wk(10, [{ id: "row", muscleGroups: ["back"], sets: [{ w: 100, r: 10, done: true }] }]),
  wk(10, [{ id: "bench", muscleGroups: ["chest"], sets: [{ w: 100, r: 5, done: true }] }])
];

test("setLoad/setCount skip warm-up and undone rows", () => {
  const e = { sets: [{ w: 100, r: 5, done: true }, { w: 60, r: 5, done: true, warmup: true }, { w: 90, r: 5, done: false }] };
  assert.equal(R.setLoad(e), 500);
  assert.equal(R.setCount(e), 1);
});

test("muscleRecovery: fresh when old/light, tired when recent/heavy", () => {
  const rec = R.muscleRecovery(workouts, NOW);
  // back: last trained 10 days ago, load 1000
  assert.equal(rec.back.fresh, true);
  // chest: trained today across two entries, load 1000, tired
  assert.equal(rec.chest.tired, true);
  assert.ok(rec.chest.fatigue > rec.back.fatigue, "chest is less recovered than back");
  assert.ok(rec.chest.days < 1);
  assert.ok(rec.back.days >= 9);
});

test("balanceOf reports trailing-window load and share", () => {
  const bal = R.balanceOf(workouts, 28 * DAY, NOW);
  assert.equal(bal.chest.load, 1000);   // 500 today + 500 ten days ago
  assert.equal(bal.back.load, 1000);
  assert.equal(bal.triceps.load, 500);
  assert.ok(Math.abs(bal.chest.share - 0.4) < 1e-9, "chest is 40% of 2500 total load");
});

test("empty history yields empty recovery and balance", () => {
  assert.deepEqual(R.muscleRecovery([], NOW), {});
  assert.deepEqual(R.balanceOf([], 28 * DAY, NOW), {});
});