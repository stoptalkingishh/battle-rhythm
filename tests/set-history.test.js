"use strict";
/* Unit tests for the pure set/rep-history helpers (js/data/set-history.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SH = require("../js/data/set-history.js");

test("modeOf: explicit mode wins, duration implies time, else reps", () => {
  assert.equal(SH.modeOf({ mode: "cardio" }), "cardio");
  assert.equal(SH.modeOf({ mode: "time" }), "time");
  assert.equal(SH.modeOf({ duration: "45 sec" }), "time");
  assert.equal(SH.modeOf({ reps: "5", weight: "135" }), "reps");
  assert.equal(SH.modeOf({}), "reps");
  assert.equal(SH.modeOf(null), "reps");
});

test("fmtSec renders mm:ss", () => {
  assert.equal(SH.fmtSec(0), "0:00");
  assert.equal(SH.fmtSec(45), "0:45");
  assert.equal(SH.fmtSec(90), "1:30");
  assert.equal(SH.fmtSec(600), "10:00");
});

test("rep stepping honors per-side split", () => {
  assert.equal(SH.isPerSide({ side: true }), true);
  assert.equal(SH.repStep({ side: true }), 2, "per-side targets step in twos");
  assert.equal(SH.repStep({}), 1);
  assert.equal(SH.sideReps(16), 8);
});

test("setLabel describes bodyweight and added load clearly", () => {
  const bw = SH.setLabel("x", { w: 0, r: 12 }, { id: "x", bodyweight: true, mode: "reps" });
  assert.equal(bw, "12");
  const belt = SH.setLabel("x", { w: 10, r: 8 }, { id: "x", bodyweight: true, mode: "reps" });
  assert.equal(belt, "+10 × 8");
  const w = SH.setLabel("x", { w: 135, r: 5 }, { id: "x", mode: "reps" });
  assert.equal(w, "135x5");
  const timed = SH.setLabel("x", { sec: 90, w: 20 }, { id: "x", mode: "time" });
  assert.equal(timed, "1:30 · 20");
  const cardio = SH.setLabel("x", { min: 12, speed: 9 }, { id: "x", mode: "cardio" });
  assert.equal(cardio, "12 min @ 9 km/h");
});

test("workoutVolume and setsDone count only completed sets", () => {
  const w = { entries: [
    { id: "a", sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: false }, { w: 100, r: 2, done: true }] },
    { id: "b", sets: [{ w: 40, r: 10, done: true }] }
  ] };
  assert.equal(SH.workoutVolume(w), 500 + 200 + 400);
  assert.equal(SH.setsDone(w), 3);
});

test("workSetsDone excludes warm-up rows", () => {
  const w = { entries: [
    { id: "a", sets: [{ w: 100, r: 5, done: true }, { w: 60, r: 5, done: true, warmup: true }] }
  ] };
  assert.equal(SH.workSetsDone(w), 1);
  assert.equal(SH.isWarmupRow({ phase: "warmup" }), true);
  assert.equal(SH.isWarmupRow({}), false);
});

test("lastEntryFor returns most recent completed entry with its target", () => {
  const workouts = [
    { d: "2026-08-01", entries: [{ id: "ex", sets: [{ w: 100, r: 5, done: true }] }] },
    { d: "2026-08-10", entries: [{ id: "ex", setUp: true, sets: [{ w: 50, r: 5, done: false }] }] },
    { d: "2026-08-15", entries: [{ id: "ex", target: "3x5", sets: [{ w: 110, r: 5, done: true }] }] }
  ];
  const last = SH.lastEntryFor(workouts, "ex");
  assert.equal(last.d, "2026-08-15");
  assert.equal(last.target, "3x5");
  assert.equal(last.sets.length, 1);
  assert.equal(SH.lastEntryFor([], "ex"), null);
});

test("bestWeightFor and bestWeightForEntry ignore warm-up and undone rows", () => {
  const workouts = [
    { entries: [{ id: "ex", sets: [{ w: 100, r: 5, done: true }, { w: 120, r: 5, done: false }, { w: 150, r: 5, done: true, warmup: true }] }] }
  ];
  assert.equal(SH.bestWeightFor(workouts, "ex"), 100);
  assert.equal(SH.bestWeightFor([], "ex"), 0);
});

test("setsFromActual adapts stored Battle Rhythm actuals into normalized sets", () => {
  const strength = SH.setsFromActual({ sets: [{ weight: "135", reps: "5" }, { weight: "185", reps: "3" }] });
  assert.deepEqual(strength, [{ w: 135, r: 5, done: true, warmup: false }, { w: 185, r: 3, done: true, warmup: false }]);
  const scalar = SH.setsFromActual({ sets: [], reps: "8", weight: "100" });
  assert.deepEqual(scalar, [{ w: 100, r: 8, done: true }]);
  const timed = SH.setsFromActual({ sets: [], duration: "90" });
  assert.deepEqual(timed, [{ sec: 90, done: true }]);
  assert.deepEqual(SH.setsFromActual(null), []);
});