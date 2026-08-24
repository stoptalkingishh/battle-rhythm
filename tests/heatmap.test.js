"use strict";
/* Unit tests for the activity heatmap grid (js/data/heatmap.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("../js/data/heatmap.js");

test("levelFor buckets session counts into 0..4", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 30].map(H.levelFor), [0, 1, 2, 2, 3, 3, 4, 4, 4]);
});

test("countsByDay tallies sessions per calendar date", () => {
  const counts = H.countsByDay([
    { d: "2026-08-01" }, { d: "2026-08-01" }, { d: "2026-08-02" }
  ]);
  assert.equal(counts["2026-08-01"], 2);
  assert.equal(counts["2026-08-02"], 1);
  assert.equal(counts["2026-08-03"], undefined);
});

test("buildYearGrid returns ~53 weeks of 7 cells with correct levels", () => {
  const weeks = H.buildYearGrid(
    [{ d: "2026-08-01" }, { d: "2026-08-01" }, { d: "2026-08-02" }],
    "2026-08-30"
  );
  assert.ok(weeks.length >= 52 && weeks.length <= 54, "one year of weeks");
  weeks.forEach((week) => assert.equal(week.length, 7, "7 days per week"));

  const cells = weeks.flat();
  const aug1 = cells.find((c) => c.iso === "2026-08-01");
  const aug2 = cells.find((c) => c.iso === "2026-08-02");
  assert.equal(aug1.level, 2, "two sessions -> shade 2");
  assert.equal(aug2.level, 1, "one session -> shade 1");

  // Every real cell has a 0..4 level; past-end cells are blank.
  cells.forEach((c) => {
    if (c.iso) assert.ok(c.level >= 0 && c.level <= 4);
  });
});

test("empty history yields a blank grid, never throws", () => {
  const weeks = H.buildYearGrid([], "2026-08-30");
  assert.ok(weeks.length >= 52 && weeks.length <= 54);
  assert.equal(H.buildYearGrid(undefined, "bad-date").length >= 52, true);
});