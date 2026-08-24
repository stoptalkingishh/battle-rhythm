"use strict";
/* Unit tests for the pure weekly-plan module (js/data/weekly-plan.js)
 * using only Node built-ins. Run: node --test tests/weekly-plan.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const WP = require("../js/data/weekly-plan.js");

// A Monday-first reference week: 2026-08-24 is a Monday.
const MON = "2026-08-24";
const TUES = "2026-08-25";
const THU = "2026-08-27";
const SUN = "2026-08-30";
const AUG23 = "2026-08-23"; // Sunday of the prior week

const REFS = [
  { id: "upper", name: "Upper A" },
  { id: "lower", name: "Lower B" }
];

/* ---- Monday-first weekday math ---- */
test("weekdayFor: 0..6 is Monday-first", () => {
  assert.equal(WP.weekdayFor(MON), 0, "Monday = 0");
  assert.equal(WP.weekdayFor(TUES), 1, "Tuesday = 1");
  assert.equal(WP.weekdayFor("2026-08-26"), 2, "Wednesday = 2");
  assert.equal(WP.weekdayFor(THU), 3, "Thursday = 3");
  assert.equal(WP.weekdayFor("2026-08-28"), 4, "Friday = 4");
  assert.equal(WP.weekdayFor("2026-08-29"), 5, "Saturday = 5");
  assert.equal(WP.weekdayFor(SUN), 6, "Sunday = 6");
  assert.equal(WP.weekdayFor(AUG23), 6, "prior Sunday is also 6");
  assert.equal(WP.weekdayFor("2027-01-04"), 0, "Monday across year boundary");
});

/* ---- assign / overwrite / clear ---- */
test("assign sets a weekday and returns a new plan", () => {
  const p = WP.assign({}, 0, "upper");
  assert.deepEqual(p, { 0: "upper" });
  assert.notEqual(p, {}, "does not mutate the input");
});

test("assign overwrites an existing entry", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 0, "lower");
  assert.deepEqual(p, { 0: "lower" });
});

test("assign rejects an invalid weekday", () => {
  assert.throws(() => WP.assign({}, 7, "upper"), RangeError);
  assert.throws(() => WP.assign({}, -1, "upper"), RangeError);
  assert.throws(() => WP.assign({}, "2", "upper"), RangeError);
});

test("clear removes a weekday", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 3, "lower");
  const c = WP.clear(p, 0);
  assert.deepEqual(c, { 3: "lower" });
  assert.deepEqual(p, { 0: "upper", 3: "lower" }, "original untouched");
  assert.throws(() => WP.clear({}, 8), RangeError);
});

/* ---- move: free target and occupied-target rejection ---- */
test("move reschedules to a free target", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 3, "lower");
  const r = WP.move(p, 0, 1);
  assert.equal(r.ok, true);
  assert.equal(r.ref, "upper");
  assert.deepEqual(r.plan, { 1: "upper", 3: "lower" });
  assert.deepEqual(p, { 0: "upper", 3: "lower" }, "original untouched");
});

test("move rejects an occupied target (flag, plan unchanged)", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 3, "lower");
  const r = WP.move(p, 0, 3); // 3 already has "lower"
  assert.equal(r.ok, false);
  assert.equal(r.reason, "occupied");
  assert.deepEqual(r.plan, p, "plan left unchanged when the target is busy");
});

test("move rejects empty source and same-day moves", () => {
  const p = WP.assign({}, 0, "upper");
  assert.equal(WP.move(p, 2, 3).ok, false);      // nothing scheduled on Tue
  assert.equal(WP.move(p, 2, 3).reason, "no-session");
  assert.equal(WP.move(p, 0, 0).ok, false);      // same day
  assert.equal(WP.move(p, 0, 0).reason, "same-day");
  assert.deepEqual(WP.move(p, 2, 3).plan, p);
});

/* ---- sessionsFor: two sessions in a Monday-start week ---- */
test("sessionsFor resolves the planned sessions in a Monday-start week", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 3, "lower");
  const week = WP.sessionsFor(p, MON, REFS);
  assert.equal(week.length, 2);
  assert.deepEqual(week[0], {
    weekday: 0,
    isoDate: "2026-08-24",
    ref: "upper",
    name: "Upper A",
    session: { id: "upper", name: "Upper A" }
  });
  assert.deepEqual(week[1], {
    weekday: 3,
    isoDate: "2026-08-27",
    ref: "lower",
    name: "Lower B",
    session: { id: "lower", name: "Lower B" }
  });
});

test("sessionsFor leaves the slug as name for an unknown ref", () => {
  const p = WP.assign({}, 5, "mystery");
  const week = WP.sessionsFor(p, MON, REFS);
  assert.equal(week.length, 1);
  assert.equal(week[0].name, "mystery");
  assert.equal(week[0].session, null);
});

/* ---- activeFor by weekday ---- */
test("activeFor returns today's session by weekday or null", () => {
  const p = WP.assign(WP.assign({}, 0, "upper"), 3, "lower");
  assert.equal(WP.activeFor(p, MON), "upper");   // Monday
  assert.equal(WP.activeFor(p, TUES), null);     // Tuesday: unscheduled
  assert.equal(WP.activeFor(p, THU), "lower");   // Thursday
  assert.equal(WP.activeFor(p, SUN), null);      // Sunday: unscheduled
  assert.equal(WP.activeFor(p, AUG23), null);    // prior Sunday: unscheduled
  assert.equal(WP.activeFor({}, "2031-06-02"), null); // empty plan
});

/* ---- weekdays convenience ---- */
test("weekdays lists the weekday indices that have a plan, ascending", () => {
  assert.deepEqual(WP.weekdays({}), []);
  const p = WP.assign(WP.assign({}, 5, "lower"), 0, "upper");
  assert.deepEqual(WP.weekdays(p), [0, 5]);
});

test("weekday conventions: Monday-first, names exposed", () => {
  assert.deepEqual(WP.WEEKDAY_NAMES[0], "Monday");
  assert.deepEqual(WP.WEEKDAY_NAMES[6], "Sunday");
  assert.deepEqual(WP.WEEKDAY_SHORT[0], "Mon");
});