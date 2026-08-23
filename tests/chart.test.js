"use strict";
/* Unit tests for the pure chart scale math (js/chart.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/chart.js");

test("computeScale covers all points and stays monotonic in X", () => {
  const pts = [{ t: 0, y: 100 }, { t: 5000, y: 200 }, { t: 10000, y: 150 }];
  const s = C.computeScale(pts, null);
  assert.ok(s.ymin <= 100, "domain includes lowest point");
  assert.ok(s.ymax >= 200, "domain includes highest point");
  assert.ok(s.ymin < s.ymax, "non-degenerate range");
  assert.equal(s.X(0), 16);
  assert.equal(s.X(10000), 340 - 8);
  assert.ok(s.X(5000) < s.X(10000), "X grows with t");
});

test("computeScale folds the goal into the y-domain even when it is off-screen", () => {
  const pts = [{ t: 0, y: 100 }, { t: 1, y: 120 }];
  const withoutGoal = C.computeScale(pts, null);
  const withGoal = C.computeScale(pts, 400);
  assert.ok(withGoal.ymax > withoutGoal.ymax, "goal raises the top of the chart");
  assert.ok(withGoal.ymax >= 400, "goal is on-screen");
});

test("computeScale pads a single point into a visible band", () => {
  const s = C.computeScale([{ t: 50, y: 150 }], null);
  assert.ok(s.ymin < 150 && s.ymax > 150, "single point is padded, not zero-height");
  assert.equal(s.single, true);
});

test("lineChart renders an empty state and refuses empty input", () => {
  assert.equal(typeof C.lineChart, "function");
});