"use strict";
/* Unit tests for the pure progression module (js/data/progression.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/data/progression.js");
const SH = require("../js/data/set-history.js");

function entry(exId, sets) {
  return { id: exId, sets: sets };
}
function aWorkout(d, entry) {
  return { d: d, t: Date.parse(d + "T12:00:00Z") || 0, entries: [entry] };
}
function doneSet(w, r) { return { w: w, r: r, done: true, warmup: false }; }

test("policyFor: reps defaults to linear; overrides win; time is off by default", () => {
  assert.equal(P.policyFor({ id: "x" }, {}, "reps"), "linear");
  assert.equal(P.policyFor({ id: "x", prog: "double" }, {}, "reps"), "double");
  assert.equal(P.policyFor({ id: "x" }, { prog: "greyskull" }, "reps"), "greyskull");
  assert.equal(P.policyFor({ id: "x" }, {}, "time"), "off");
});

test("linear: all reps hit -> weight up one increment", () => {
  const cfg = { id: "x", sets: 3, reps: 5, weight: 100, inc: 5 };
  const workouts = [aWorkout("2026-07-01", entry("x", [doneSet(100, 5), doneSet(100, 5), doneSet(100, 5)]))];
  const p = P.nextPrescription(workouts, cfg, {}, "lb");
  assert.equal(p.kind, "up");
  assert.equal(p.weight, 105);
  assert.ok(p.why[0].indexOf("more") !== -1);
});

test("greyskull: double the target on the last (AMRAP) set -> double jump", () => {
  const cfg = { id: "x", prog: "greyskull", sets: 3, reps: 5, weight: 100, inc: 5 };
  const workouts = [aWorkout("2026-07-01", entry("x", [doneSet(100, 5), doneSet(100, 5), doneSet(100, 11)]))];
  const p = P.nextPrescription(workouts, cfg, {}, "lb");
  assert.equal(p.kind, "up");
  assert.equal(p.weight, 110, "amrap >= 2x target earns a double jump");
});

test("linear: repeat misses trigger a deload", () => {
  const cfg = { id: "x", sets: 3, reps: 5, weight: 100, inc: 5 };
  const workouts = ["2026-07-01", "2026-07-03", "2026-07-05"].map((d) =>
    aWorkout(d, entry("x", [doneSet(100, 4), doneSet(100, 4), doneSet(100, 4)])));
  const p = P.nextPrescription(workouts, cfg, {}, "lb");
  assert.equal(p.kind, "deload");
  assert.ok(p.weight < 100, "deload drops the load");
});

test("bodyweight (w<=0) progresses in reps, not weight", () => {
  const cfg = { id: "x", prog: "linear", sets: 3, reps: 15, weight: 0 };
  const workouts = [aWorkout("2026-07-01", entry("x", [doneSet(0, 15), doneSet(0, 15), doneSet(0, 15)]))];
  const p = P.nextPrescription(workouts, cfg, {});
  assert.equal(p.kind, "up");
  assert.equal(p.weight, 0);
  assert.equal(p.reps, 15 + SH.repStep(cfg));
});

test("bodyweight: past the rep ceiling adds a set instead of a rep", () => {
  const cfg = { id: "x", prog: "linear", sets: 3, reps: 10, weight: 0, repsMax: 10 };
  const workouts = [aWorkout("2026-07-01", entry("x", [doneSet(0, 10), doneSet(0, 10), doneSet(0, 10)]))];
  const p = P.nextPrescription(workouts, cfg, {});
  assert.equal(p.kind, "up");
  assert.equal(p.sets, 4, "one more set, back to the bottom of the range");
  assert.equal(p.reps, 10);
});

test("time: held every set -> target up by the seconds increment", () => {
  const cfg = { id: "x", mode: "time", prog: "time", sets: 3, sec: 30 };
  const tEntry = { id: "x", sets: [ { sec: 32, done: true }, { sec: 31, done: true }, { sec: 35, done: true } ] };
  const p = P.nextPrescription([aWorkout("2026-07-01", tEntry)], cfg, {});
  assert.equal(p.kind, "up");
  assert.equal(p.sec, 35);
});

test("applyPrescription rewrites only undone non-warmup rows", () => {
  const p = { weight: 105, reps: 5 };
  const sets = [
    { w: 100, r: 5, done: false },
    { w: 100, r: 5, done: true },
    { w: 100, r: 5, done: false, warmup: true }
  ];
  const out = P.applyPrescription(sets, p);
  assert.equal(out[0].w, 105);
  assert.equal(out[1].w, 100, "logged set untouched");
  assert.equal(out[2].w, 100, "warm-up row untouched");
});

test("applyPrescription grows a set-count increase by copying a work row", () => {
  const p = { sets: 4, reps: 8, weight: 0 };
  const sets = [{ w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }];
  const out = P.applyPrescription(sets, p);
  assert.equal(out.length, 4);
  assert.equal(out[2].r, 8);
  assert.equal(out[2].done, false);
});