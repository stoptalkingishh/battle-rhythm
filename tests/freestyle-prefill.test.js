"use strict";
/* Unit tests for the pure freestyle-session prefill helpers
 * (js/data/freestyle-prefill.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const FP = require("../js/data/freestyle-prefill.js");

const WORKOUTS = [
  { d: "2026-08-01", entries: [{ id: "sq", sets: [{ w: 100, r: 5, done: true }] }] },
  { d: "2026-08-10", entries: [{ id: "sq", sets: [{ w: 100, r: 5, done: false }] }] },
  { d: "2026-08-05", entries: [{ id: "pu", sets: [{ w: 0, r: 12, done: true }, { w: 0, r: 10, done: true, warmup: true }] }] },
  { d: "2026-08-07", entries: [{ id: "plank", sets: [{ sec: 90, done: true }] }] },
  { d: "2026-08-09", entries: [{ id: "run", sets: [{ min: 12, speed: 9, done: true }] }] },
  { d: "2026-08-11", entries: [{ id: "bwpush", sets: [{ w: 0, r: 10, done: true }, { w: 0, r: 10, done: true }, { w: 0, r: 10, done: true }] }] }
];

test("mode inference", () => {
  assert.equal(FP.modeOf({ mode: "cardio" }), "cardio");
  assert.equal(FP.modeOf({ mode: "time" }), "time");
  assert.equal(FP.modeOf({}), "reps");
  assert.equal(FP.modeOf(null), "reps");
  assert.equal(FP.isTimed({ mode: "time" }), true);
  assert.equal(FP.isTimed({ mode: "reps" }), false);
  assert.equal(FP.isCardio({ mode: "cardio" }), true);
});

test("lastValues returns most recent completed working values, minus warmups", () => {
  const lv = FP.lastValues(WORKOUTS, "pu");
  assert.deepEqual(lv, { weight: 0, reps: 12, sec: 0, min: 0, speed: 0, count: 1, d: "2026-08-05" });
  /* Insert a newer *unfinished* session for the same exercise and confirm the
   * completed one still wins. */
  const newer = WORKOUTS.concat([{ d: "2026-08-20", entries: [{ id: "pu", sets: [{ w: 0, r: 20, done: false }] }] }]);
  assert.equal(FP.lastValues(newer, "pu").reps, 12);
});

test("lastValues is null with no history or only warmup/undone rows", () => {
  assert.equal(FP.lastValues([], "sq"), null);
  assert.equal(FP.lastValues(WORKOUTS, "nope"), null);
  assert.equal(FP.lastValues([{ d: "x", entries: [{ id: "a", sets: [{ w: 50, r: 5 }] }] }], "a"), null);
  assert.equal(FP.lastValues([{ d: "x", entries: [{ id: "a", sets: [{ w: 50, r: 5, done: true, warmup: true }] }] }], "a"), null);
});

test("progression rule carries the load forward when a rule is in force", () => {
  /* linear, one completed set at 100x5 hit against the 5-rep target -> +5. */
  const t = FP.prefillTarget({ id: "sq", mode: "reps", prog: "linear", reps: 5 }, WORKOUTS, null, "lb");
  assert.equal(t.source, "progression");
  assert.equal(t.weight, 105);
  assert.equal(t.reps, 5);
  assert.equal(t.setCount, 1);
});

test("bodyweight progression advances reps, never a fabricated load", () => {
  /* three clean sets of 10 -> aim for 11 this time, no invented weight. */
  const t = FP.prefillTarget({ id: "bwpush", mode: "reps", bodyweight: true, prog: "linear", sets: 3, reps: 10 }, WORKOUTS, null, "lb");
  assert.equal(t.source, "progression");
  assert.equal(t.weight, 0);
  assert.equal(t.reps, 11);
  assert.equal(t.setCount, 3);
});

test("with progression off, prefill reuses the last logged values", () => {
  const t = FP.prefillTarget({ id: "sq", mode: "reps", prog: "off" }, WORKOUTS, null, "lb");
  assert.equal(t.source, "last");
  assert.equal(t.weight, 100);
  assert.equal(t.reps, 5);
  assert.equal(t.setCount, 1);
});

test("timed-mode prefill carries the last hold duration", () => {
  const t = FP.prefillTarget({ id: "plank", mode: "time" }, WORKOUTS, null, null);
  assert.equal(t.source, "last");
  assert.equal(t.sec, 90);
});

test("cardio prefill carries distance and pace", () => {
  const t = FP.prefillTarget({ id: "run", mode: "cardio" }, WORKOUTS, null, null);
  assert.equal(t.source, "last");
  assert.equal(t.min, 12);
  assert.equal(t.speed, 9);
});

test("with no history the expressed plan target is used", () => {
  const t = FP.prefillTarget({ id: "cur", mode: "reps", sets: 3, reps: 10, weight: 25, prog: "off" }, [], null, "lb");
  assert.equal(t.source, "plan");
  assert.equal(t.weight, 25);
  assert.equal(t.reps, 10);
  assert.equal(t.setCount, 3);
});

test("an explicit weight in the item wins over history", () => {
  const t = FP.prefillTarget({ id: "sq", mode: "reps", prog: "off", weight: 135 }, WORKOUTS, null, "lb");
  assert.equal(t.source, "last");
  assert.equal(t.weight, 135, "plan-spelled weight overrides the logged 100");
});

test("buildRows expands a target into unfilled working rows", () => {
  const rows = FP.buildRows({ setCount: 3, weight: 105, reps: 5 });
  assert.equal(rows.length, 3);
  rows.forEach((row) => assert.deepEqual(row, { w: 105, r: 5, done: false, warmup: false }));
});

test("buildRows keeps a single row for a bodyweight target (reps only)", () => {
  const rows = FP.buildRows({ setCount: 1, reps: 12 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].r, 12);
  assert.equal("w" in rows[0], false);
});

test("prefillList maps a whole freestyle session, preserving order", () => {
  const out = FP.prefillList([
    { id: "sq", mode: "reps", prog: "linear", reps: 5 },
    { id: "cur", mode: "reps", sets: 3, reps: 10, weight: 25, prog: "off" }
  ], WORKOUTS, null, "lb");
  assert.equal(out.length, 2);
  assert.equal(out[0].source, "progression");
  assert.equal(out[0].rows[0].w, 105);
  assert.equal(out[1].source, "plan");
  assert.equal(out[1].rows.length, 3);
  assert.equal(out[1].item.id, "cur");
});

test("prefillList tolerates empty and null inputs", () => {
  assert.deepEqual(FP.prefillList([], WORKOUTS, null, "lb"), []);
  assert.deepEqual(FP.prefillList(null, WORKOUTS, null, "lb"), []);
});