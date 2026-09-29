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
  const box = fakeContainer();
  C.lineChart(box, { points: [] });
  assert.match(box.innerHTML, /chart-empty/);
  assert.equal(C.lineChart(null, { points: [] }), null);
});

/* js/chart.js builds SVG by string concatenation, so the security-relevant
 * contract is the exact string it hands to innerHTML. The fake container below
 * records that string, which is all lineChart needs (no DOM dependency). */
function fakeContainer() {
  return { innerHTML: "", set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; } };
}

const PTS = [{ t: 0, y: 100, d: "2024-01-05" }, { t: 5000, y: 160, d: "2024-03-09" }];
const BREAKOUT = 'x"><img src=x onerror=alert(document.domain)>';

function render(opts) {
  const box = fakeContainer();
  C.lineChart(box, Object.assign({ points: PTS, h: 150 }, opts));
  return box.innerHTML;
}

test("lineChart escapes a hostile ariaLabel instead of breaking out of the attribute", () => {
  const html = render({ ariaLabel: "squat " + BREAKOUT });
  assert.ok(!html.includes('"><img'), 'raw "><img must not reach innerHTML');
  assert.ok(!html.includes("<img"), "no img element is opened by the label");
  assert.ok(!/<[a-z]/i.test(html.split("aria-label=")[1].split(">")[0]), "no tag inside the attribute value");
  assert.ok(html.includes("&quot;&gt;&lt;img src=x onerror=alert(document.domain)&gt;"), "payload is entity-encoded");
  assert.ok(html.includes('aria-label="squat x&quot;&gt;&lt;img src=x onerror=alert(document.domain)&gt;"'));
  assert.equal((html.match(/aria-label=/g) || []).length, 1, "no attribute-injected second label");
});

test("lineChart escapes opts.unit in the y-axis tick text", () => {
  const html = render({ unit: BREAKOUT });
  const benign = render({ unit: "lb" });
  const count = (s) => (s.match(/<\/?text/g) || []).length;
  assert.ok(!html.includes("<img"), "no raw tag from unit");
  assert.equal(count(html), count(benign), "unit adds no text elements and closes none early");
  assert.ok(html.includes("&lt;img src=x onerror=alert(document.domain)&gt;"), "unit is entity-encoded");
  assert.ok(/<text[^>]*>[\d.]+ x&quot;&gt;&lt;img/.test(html), "unit follows the numeric tick value");
});

test("lineChart escapes opts.emptyLabel in the empty state", () => {
  const html = render({ points: [], emptyLabel: BREAKOUT });
  assert.ok(!html.includes("<img"), "no raw tag from emptyLabel");
  assert.equal((html.match(/<div/g) || []).length, 1, "emptyLabel cannot open a second div");
  assert.equal((html.match(/<\/div>/g) || []).length, 1, "emptyLabel cannot close the wrapper early");
  assert.ok(html.includes("&quot;&gt;&lt;img src=x onerror=alert(document.domain)&gt;"));
});

test("lineChart escapes opts.color in fill and stroke attributes", () => {
  const html = render({ color: 'red" onload="alert(1)' });
  assert.ok(!html.includes('onload="'), "color cannot inject a new attribute");
  assert.ok(html.includes('fill="red&quot; onload=&quot;alert(1)"'));
});

test("lineChart escapes point date labels on the x-axis", () => {
  /* xLabels slices the date to 7 chars, so the payload is placed in the
   * surviving prefix -- that is what actually reaches innerHTML. */
  const box = fakeContainer();
  C.lineChart(box, { points: [{ t: 0, y: 100, d: '"><img src=x onerror=alert(1)>' }, { t: 5000, y: 160, d: "2024-03" }], h: 150 });
  const html = box.innerHTML;
  const count = (s) => (s.match(/<\/?text/g) || []).length;
  assert.ok(!html.includes("<img"), "no raw tag from a point date");
  assert.equal(count(html), count(render({ points: PTS })), "date adds no text elements");
  assert.ok(html.includes("&quot;&gt;&lt;img"), "date is entity-encoded");
});

test("lineChart leaves ordinary labels untouched (no double-escaping)", () => {
  const html = render({ ariaLabel: "bench press estimated 1RM", unit: "lb", color: "var(--gold)" });
  assert.ok(html.includes('aria-label="bench press estimated 1RM"'));
  assert.ok(/<text[^>]*>[\d.]+ lb<\/text>/.test(html), "unit renders literally on each tick");
  assert.ok(html.includes('stroke="var(--gold)"'));
  assert.ok(!html.includes("&amp;"), "nothing is escaped twice");
  assert.ok(html.includes(">2024-01</text>"), "date label renders literally");

  const empty = render({ points: [], emptyLabel: "No progress logged yet." });
  assert.equal(empty, '<div class="chart-empty">No progress logged yet.</div>');
});

test("lineChart drops a non-finite goal instead of emitting NaN", () => {
  for (const bad of [NaN, Infinity, -Infinity, "nope", null, undefined]) {
    const html = render({ goal: bad });
    assert.ok(!html.includes("NaN"), `goal ${String(bad)} must not leak NaN into the SVG`);
    assert.ok(!html.includes("Infinity"), `goal ${String(bad)} must not leak Infinity into the SVG`);
    assert.ok(!html.includes('stroke-dasharray'), `goal ${String(bad)} must not draw a goal line`);
  }
  const good = render({ goal: 200 });
  assert.ok(good.includes('stroke-dasharray="4 4"'), "a finite goal still draws its line");
});