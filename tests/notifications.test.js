"use strict";
/* Unit tests for push-notification helpers (js/data/notifications.js):
 * rest-timer alerts (fire-once-per-expiration) and missed-session reminders.
 * Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/data/notifications.js");

/* ---- ISO / weekday helpers ---- */
test("weekdayFor uses Monday-first indexing (Mon=0..Sun=6)", () => {
  assert.equal(N.weekdayFor("2026-08-23"), 6, "2026-08-23 is a Sunday");
  assert.equal(N.weekdayFor("2026-08-24"), 0, "2026-08-24 is a Monday");
  assert.equal(N.weekdayFor("2026-08-25"), 1, "Tuesday");
  assert.equal(N.weekdayFor("2026-08-29"), 5, "Saturday");
});

/* ---- REST-TIMER ALERTS ---- */
test("isRestOver flips only once the deadline has passed", () => {
  assert.equal(N.isRestOver(1000, 0), false);
  assert.equal(N.isRestOver(1000, 999), false);
  assert.equal(N.isRestOver(1000, 1000), true);
  assert.equal(N.isRestOver(1000, 2000), true);
  assert.equal(N.isRestOver(0, 0), true, "zero deadline is already over");
});

test("delayUntil is never negative and is the exact remaining time", () => {
  assert.equal(N.delayUntil(1000, 0), 1000);
  assert.equal(N.delayUntil(1000, 750), 250);
  assert.equal(N.delayUntil(1000, 1500), 0);
  assert.equal(N.delayUntil(0, 500), 0);
});

test("restAlert fires exactly once per expiration", () => {
  const deadline = 10_000;
  // still resting → nothing
  assert.deepEqual(N.restAlert(deadline, 9_999, 0), { fired: false, reason: "resting" });
  // the transition tick fires
  const fired = N.restAlert(deadline, 10_000, 0);
  assert.equal(fired.fired, true);
  assert.equal(fired.elapsed, true);
  assert.equal(fired.secondsOver, 0);
  // caller stores lastFiredMs = 10_000; subsequent ticks must NOT refire
  assert.equal(N.restAlert(deadline, 10_001, 10_000).fired, false);
  assert.equal(N.restAlert(deadline, 10_001, 10_000).reason, "already-fired");
  assert.equal(N.restAlert(deadline, 60_000, 10_000).fired, false, "still no refire later");
});

test("restAlert counts seconds over without re-firing", () => {
  const deadline = 5_000;
  const r = N.restAlert(deadline, 7_500, 0);
  assert.equal(r.fired, true);
  assert.equal(r.secondsOver, 2);
});

test("restAlert honors a grace buffer before firing", () => {
  const deadline = 10_000;
  assert.equal(N.restAlert(deadline, 10_000, 0, 3_000).fired, false, "still inside grace");
  assert.equal(N.restAlert(deadline, 10_000, 0, 3_000).reason, "resting");
  assert.equal(N.restAlert(deadline, 13_000, 0, 3_000).fired, true, "fires once grace elapses");
  assert.equal(N.restAlert(deadline, 13_001, 13_000, 3_000).fired, false, "no refire after firing");
});

test("restAlert handles a fresh timer that was never fired", () => {
  assert.equal(N.restAlert(0, 100, 0).fired, true, "zero deadline with no lastFired fires");
});

/* ---- REST-TIMER PAYLOAD ---- */
test("buildRestAlert composes a readable rest-over payload", () => {
  const p = N.buildRestAlert({ restSeconds: 45, nextLabel: "Round 2" });
  assert.equal(p.kind, "rest-over");
  assert.equal(p.title, "Rest over");
  assert.match(p.body, /45s rest is done/);
  assert.match(p.body, /Round 2/);
});

test("buildRestAlert formats minute-scale rests and drops the duration for 0", () => {
  assert.match(N.buildRestAlert({ restSeconds: 90 }).body, /1 min 30s rest is done/);
  const zero = N.buildRestAlert({ restSeconds: 0, nextLabel: "the next set" });
  assert.equal(zero.body, "Time for the next set.");
});

test("buildRestAlert is defensive against junk inputs", () => {
  assert.equal(N.buildRestAlert({ restSeconds: -40 }).restSeconds, 0);
  assert.equal(N.buildRestAlert({}).restSeconds, 0);
  assert.equal(N.buildRestAlert({ restSeconds: "60" }).restSeconds, 60);
});

/* ---- MISSED-SESSION REMINDERS ----
 * 2026-08-24 is a Monday (0). A Mon/Wed/Fri plan across the lookback window.
 */
const MON_WED_FRI = { 0: "sessA", 2: "sessB", 4: "sessC" };
const REFS = [
  { id: "sessA", name: "Strength Circuit" },
  { id: "sessB", name: "Run Intervals" },
  { id: "sessC", name: "Mobility Day" }
];

test("missedSessions finds scheduled weekdays that passed unlogged, oldest first", () => {
  const missed = N.missedSessions(MON_WED_FRI, "2026-08-24", [], REFS);
  // 14-day lookback (Mon 24 back to Mon 10) catches TWO full Mon/Wed/Fri cycles:
  // Mon 10/17, Wed 12/19, Fri 14/21.
  const refs = missed.map((m) => m.ref);
  assert.ok(refs.includes("sessA") && refs.includes("sessB") && refs.includes("sessC"));
  assert.equal(missed.length, 6, "six scheduled days in the lookback window");
  assert.equal(missed[0].daysMissed > missed[missed.length - 1].daysMissed,
    true, "sorted oldest (largest daysMissed) first");
  assert.equal(missed[0].isoDate, "2026-08-10", "oldest missed is the first Monday in the window");
});

test("missedSessions excludes dates already logged and today's plan", () => {
  const missed = N.missedSessions(MON_WED_FRI, "2026-08-24", ["2026-08-21"]);
  const dates = missed.map((m) => m.isoDate);
  assert.ok(!dates.includes("2026-08-21"), "logged Friday excluded");
  assert.ok(!dates.includes("2026-08-24"), "today (Mon) is never 'missed'");
});

test("missedSessions fills real names from references and falls back to the ref", () => {
  const one = N.missedSessions({ 2: "sessB" }, "2026-08-24", [], REFS);
  assert.equal(one[0].name, "Run Intervals");
  assert.equal(one[0].weekdayName, "Wednesday");
  const noRefs = N.missedSessions({ 2: "sessB" }, "2026-08-24", []);
  assert.equal(noRefs[0].name, "sessB", "falls back to ref when no reference list");
});

test("missedSessions returns empty when every planned day was logged", () => {
  const all = N.missedSessions(MON_WED_FRI, "2026-08-24",
    ["2026-08-10", "2026-08-12", "2026-08-14", "2026-08-17", "2026-08-19", "2026-08-21"]);
  assert.deepEqual(all, []);
  assert.deepEqual(N.missedSessions({}, "2026-08-24", []), [], "empty plan → nothing missed");
});

test("dueToday returns today's planned session if not yet logged", () => {
  const due = N.dueToday(MON_WED_FRI, "2026-08-24", [], REFS);
  assert.ok(due);
  assert.equal(due.ref, "sessA");
  assert.equal(due.name, "Strength Circuit");
  assert.equal(due.daysMissed, 0);
});

test("dueToday returns null when logged, unplanned, or no plan", () => {
  assert.equal(N.dueToday(MON_WED_FRI, "2026-08-24", ["2026-08-24"], REFS), null, "already logged");
  assert.equal(N.dueToday(MON_WED_FRI, "2026-08-25", [], REFS), null, "Tuesday is rest day");
  assert.equal(N.dueToday({}, "2026-08-24", [], REFS), null, "no plan");
});

/* ---- MISSED-SESSION PAYLOAD ---- */
test("buildMissedReminder builds a due-today vs missed payload", () => {
  const today = N.buildMissedReminder(N.dueToday(MON_WED_FRI, "2026-08-24", [], REFS));
  assert.equal(today.kind, "missed-session");
  assert.equal(today.title, "Session on today");
  assert.match(today.body, /Strength Circuit/);
  assert.match(today.body, /on your plan today/);

  const missed = N.buildMissedReminder(N.missedSessions({ 4: "sessC" }, "2026-08-24", [], REFS)[0]);
  assert.equal(missed.title, "Skipped a session");
  assert.match(missed.body, /Mobility Day/);
});

test("buildMissedReminder declines junk input", () => {
  assert.equal(N.buildMissedReminder(null), null);
  assert.equal(N.buildMissedReminder({}), null);
});