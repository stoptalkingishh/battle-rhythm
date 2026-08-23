"use strict";
/* Unit tests for the pure countdown helpers (js/data/timer-core.js)
 * using only Node built-ins. Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/data/timer-core.js");

/* ---- parseDuration ---- */
test("parseDuration: plain seconds value", () => {
  assert.equal(C.parseDuration("45"), 45);
  assert.equal(C.parseDuration("0"), 0);
  assert.equal(C.parseDuration(" 90 "), 90);
});

test("parseDuration: seconds units (s/sec/secs/second/seconds)", () => {
  assert.equal(C.parseDuration("45s"), 45);
  assert.equal(C.parseDuration("45 sec"), 45);
  assert.equal(C.parseDuration("45 secs"), 45);
  assert.equal(C.parseDuration("45 seconds"), 45);
  assert.equal(C.parseDuration("30 second"), 30);
  assert.equal(C.parseDuration("90 S"), 90);
});

test("parseDuration: minutes units", () => {
  assert.equal(C.parseDuration("2 min"), 120);
  assert.equal(C.parseDuration("1 minute"), 60);
  assert.equal(C.parseDuration("1.5 minutes"), 90);
});

test("parseDuration: mm:ss and h:mm:ss colon forms", () => {
  assert.equal(C.parseDuration("1:30"), 90);
  assert.equal(C.parseDuration("0:45"), 45);
  assert.equal(C.parseDuration("02:05"), 125);
  assert.equal(C.parseDuration("1:02:05"), 3725);
  assert.equal(C.parseDuration("0:60"), 0, "seconds >= 60 in mm:ss rejected");
});

test("parseDuration: junk and empty strings are 0", () => {
  assert.equal(C.parseDuration(""), 0);
  assert.equal(C.parseDuration("   "), 0);
  assert.equal(C.parseDuration("as fast as you can"), 0);
  assert.equal(C.parseDuration("forty five"), 0);
  assert.equal(C.parseDuration(null), 0);
  assert.equal(C.parseDuration(undefined), 0);
  assert.equal(C.parseDuration(""), 0);
});

/* ---- bounded clamping ---- */
test("clampToMax caps at MAX_SECONDS and floors negatives/Junk", () => {
  assert.equal(C.MAX_SECONDS, 3600);
  assert.equal(C.clampToMax(10), 10);
  assert.equal(C.clampToMax(3599), 3599);
  assert.equal(C.clampToMax(3600), 3600);
  assert.equal(C.clampToMax(7200), 3600);
  assert.equal(C.clampToMax(-5), 0);
  assert.equal(C.clampToMax(NaN), 0);
  assert.equal(C.clampToMax(3.9), 3, "floors fractional seconds");
});

test("fromDurationStr parses then bounds a planned rest/timed-set value", () => {
  assert.equal(C.fromDurationStr("45 sec"), 45);
  assert.equal(C.fromDurationStr("120s"), 120);
  assert.equal(C.fromDurationStr("2 hours"), 3600, "over-cap clamped to MAX");
  assert.equal(C.fromDurationStr("10 min"), 600);
  assert.equal(C.fromDurationStr(""), 0);
  assert.equal(C.fromDurationStr("garbage"), 0);
});

/* ---- drift-free remaining math ---- */
test("remaining recomputes from the deadline, not tick deltas", () => {
  assert.equal(C.remaining(1000, 0), 1000);
  assert.equal(C.remaining(1000, 500), 500);
  assert.equal(C.remaining(1000, 1000), 0);
  assert.equal(C.remaining(1000, 1500), 0, "never negative");
  assert.equal(C.remaining(0, 0), 0);
});

test("remaining survives a hidden/sleeping tab: deadline is absolute", () => {
  // Even if the caller only ticks back up after a 30s gap, the value is exact.
  assert.equal(C.remaining(10 + 30, 30), 10);
});

/* ---- formatting ---- */
test("format renders MM:SS with padded zeroes and ceiled seconds", () => {
  assert.equal(C.format(45 * 1000), "00:45");
  assert.equal(C.format(90 * 1000), "01:30");
  assert.equal(C.format(125 * 1000), "02:05");
  assert.equal(C.format(0), "00:00");
  assert.equal(C.format(1), "00:01", "fractional milis rounds up");
  assert.equal(C.format(59999), "01:00");
});

test("format switches to H:MM:SS at or above one hour", () => {
  assert.equal(C.format(3600 * 1000), "1:00:00");
  assert.equal(C.format(3725 * 1000), "1:02:05");
  assert.equal(C.format(7200 * 1000), "2:00:00");
});

test("format never shows negatives", () => {
  assert.equal(C.format(-12000), "00:00");
});