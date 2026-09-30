"use strict";
/* Block analytics for regiments (issue #19).
 *
 * The point of these tests is not that the arithmetic is right — it is that the
 * module REFUSES to answer when the data cannot support an answer. Every empty
 * and single-point case must come back null / "insufficient", never 0, never
 * NaN, never Infinity. The last test walks the whole report tree for that.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const A = require("../js/data/regiment-analytics.js");
const WP = require("../js/data/weekly-plan.js");

/* ---- fixtures ---- */

function wk(d, entries) { return { d: d, t: Date.parse(d + "T00:00:00Z"), entries: entries }; }
function entry(id, sets) { return { id: id, sets: sets }; }
/* A completed set: done, not a warm-up row. */
function done(w, r) { return { w: w, r: r, done: true }; }
/* A warm-up row and an unchecked row never count toward anything. */
function warm(w, r) { return { w: w, r: r, done: true, warmup: true }; }
function skipped(w, r) { return { w: w, r: r, done: false }; }

const BUILD_REGIMENT = {
  id: "r1",
  name: "Ruck Program",
  period: "Build",
  days: [
    { name: "Mon", sessions: ["s-lower"] },
    { name: "Wed", sessions: ["s-upper"] },
    { name: "Fri", sessions: [] }
  ]
};

/* Two weeks of Build: volume and e1RM both rising on two tracked exercises. */
function buildingBlock() {
  return [
    wk("2026-03-02", [entry("s1-deadlift", [done(135, 5), done(135, 5)])]),
    wk("2026-03-07", [entry("s1-deadlift", [done(145, 5), done(145, 5)])]),
    wk("2026-03-09", [entry("s2-squat", [done(95, 5)])]),
    wk("2026-03-11", [entry("s1-deadlift", [done(155, 5)]), entry("s2-squat", [done(105, 5)])]),
    wk("2026-03-14", [entry("s1-deadlift", [done(165, 5)]), entry("s2-squat", [done(115, 5)])])
  ];
}

/* ---- percentage / direction primitives ---- */

test("pctChange returns null rather than NaN or Infinity on a zero baseline", () => {
  assert.equal(A.pctChange(0, 10), null);
  assert.equal(A.pctChange(0, 0), null);
  assert.equal(A.pctChange(null, 10), null);
  assert.equal(A.pctChange(10, undefined), null);
  assert.equal(A.pctChange(NaN, 10), null);
  assert.equal(A.pctChange(Infinity, 10), null);
  assert.equal(A.pctChange(100, 110), 10);
  assert.equal(A.pctChange(110, 100), -9.1);
});

test("directionOf judges the pair it is given and names it, never a number", () => {
  assert.equal(A.directionOf(100, 110), "up");
  assert.equal(A.directionOf(110, 100), "down");
  assert.equal(A.directionOf(100, 100), "flat");
  assert.equal(A.directionOf(null, 110), "insufficient");
  assert.equal(A.directionOf(110, undefined), "insufficient");
});

/* ---- phase expectations ---- */

test("every doctrine period carries a volume and load expectation", () => {
  const periods = ["Base", "Build", "Peak 1 (Taper)", "Combat / Peak 2", "Recovery"];
  for (const p of periods) {
    const r = A.phaseFor(p);
    assert.equal(r.known, true, `${p} should resolve to a phase`);
    assert.ok(r.expectation.citation, `${p} has no citation`);
  }
});

test("Build expects volume and load up; a taper expects volume down, load up", () => {
  assert.equal(A.phaseFor("Build").expectation.volume, "up");
  assert.equal(A.phaseFor("Build").expectation.load, "up");
  assert.equal(A.phaseFor("Peak 1 (Taper)").expectation.volume, "down");
  assert.equal(A.phaseFor("Peak 1 (Taper)").expectation.load, "up");
  assert.equal(A.phaseFor("Recovery").expectation.volume, "down");
});

test("phaseFor is case- and whitespace-insensitive and resolves near-misses", () => {
  assert.equal(A.phaseFor("build").known, true);
  assert.equal(A.phaseFor("  Build  ").known, true);
  assert.equal(A.phaseFor("Build Phase").known, true);
});

test("an unknown period is unknown, not silently Base", () => {
  const r = A.phaseFor("Microcycle");
  assert.equal(r.known, false);
  assert.equal(r.expectation.volume, null);
  assert.equal(r.expectation.load, null);
  assert.equal(A.phaseFor(null).known, false);
  assert.equal(A.phaseFor(undefined).known, false);
  assert.equal(A.phaseFor("").known, false);
});

/* ---- week bucketing ---- */

test("weekStartOf returns the Monday of the containing week, UTC-stable", () => {
  assert.equal(A.weekStartOf("2026-03-02"), "2026-03-02"); // Monday
  assert.equal(A.weekStartOf("2026-03-08"), "2026-03-02"); // Sunday -> same week
  assert.equal(A.weekStartOf("2026-03-09"), "2026-03-09"); // next Monday
  assert.equal(A.weekStartOf("2026-03-15"), "2026-03-09");
});

test("weekStartOf rejects junk rather than returning Invalid Date", () => {
  assert.equal(A.weekStartOf(""), null);
  assert.equal(A.weekStartOf("not-a-date"), null);
  assert.equal(A.weekStartOf(null), null);
  assert.equal(A.weekStartOf(undefined), null);
  assert.equal(A.weekStartOf(12345), null);
});

test("spanWeeks counts whole weeks inclusive, and is never zero or negative", () => {
  assert.equal(A.spanWeeks("2026-03-02", "2026-03-02"), 1);
  assert.equal(A.spanWeeks("2026-03-02", "2026-03-09"), 2);
  assert.equal(A.spanWeeks("2026-03-02", "2026-03-15"), 3);
  assert.equal(A.spanWeeks("2026-03-09", "2026-03-02"), 1);
  assert.equal(A.spanWeeks(null, null, null), null);
});

test("weeklyBuckets sums volume per week and ignores warm-ups and unchecked sets", () => {
  const b = A.weeklyBuckets([
    wk("2026-03-02", [entry("x", [done(100, 5), done(100, 5), warm(45, 5), skipped(225, 5)])]),
    wk("2026-03-03", [entry("x", [done(50, 2)])]),
    wk("2026-03-09", [entry("x", [done(100, 5)])])
  ]);
  assert.deepEqual(Array.from(b).map((x) => x.weekStart), ["2026-03-02", "2026-03-09"]);
  assert.equal(b[0].volume, 1100); // 100*5*2 + 50*2
  assert.equal(b[0].sets, 3);
  assert.equal(b[0].sessions, 2);
  assert.equal(b[1].volume, 500);
});

test("weeklyBuckets on no workouts is an empty list, not a zero bucket", () => {
  assert.deepEqual(Array.from(A.weeklyBuckets([])), []);
  assert.deepEqual(Array.from(A.weeklyBuckets(null)), []);
  assert.deepEqual(Array.from(A.weeklyBuckets(undefined)), []);
  assert.deepEqual(Array.from(A.weeklyBuckets([{ d: "junk" }])), []);
});

/* ---- volume trend ---- */

test("a single logged week is a baseline, not a volume trend", () => {
  const t = A.volumeTrend([wk("2026-03-02", [entry("x", [done(100, 5)])])]);
  assert.equal(t.direction, "insufficient");
  assert.equal(t.first, null);
  assert.equal(t.last, null);
  assert.equal(t.deltaPct, null);
});

test("two weeks of rising volume read as an up trend", () => {
  const t = A.volumeTrend(buildingBlock());
  assert.equal(t.direction, "up");
  assert.ok(t.deltaPct > 0);
  assert.ok(t.first > 0 && t.last > t.first);
});

test("volume per week is normalised by the span, so a gap week is visible", () => {
  /* 2026-03-02 week: 5000. Week of 03-09: 4000 over a two-week span = 2000/wk. */
  const t = A.volumeTrend([
    wk("2026-03-02", [entry("x", [done(100, 50)])]),
    wk("2026-03-11", [entry("x", [done(100, 40)])])
  ], "2026-03-02", "2026-03-15");
  assert.equal(t.spanWeeks, 2);
  assert.deepEqual(Array.from(t.weeks), [2500, 2000]);
  assert.equal(t.direction, "down");
});

test("identical volume across two weeks is flat, not up", () => {
  const t = A.volumeTrend([
    wk("2026-03-02", [entry("x", [done(100, 5)])]),
    wk("2026-03-09", [entry("x", [done(100, 5)])])
  ]);
  assert.equal(t.direction, "flat");
  assert.equal(t.deltaPct, 0);
});

test("all-time-zero volume across two weeks yields insufficient, not a division by zero", () => {
  const t = A.volumeTrend([
    wk("2026-03-02", [entry("x", [warm(45, 5)])]),
    wk("2026-03-09", [entry("x", [skipped(225, 5)])])
  ]);
  assert.equal(t.direction, "insufficient");
  assert.equal(t.deltaPct, null);
  /* the two weekly figures are real (nothing was logged) — what is withheld
   * is the CHANGE, because a percentage off a zero baseline is meaningless */
  assert.deepEqual(Array.from(t.weeks), [0, 0]);
  assert.equal(t.first, 0);
  assert.equal(t.last, 0);
});

/* ---- per-exercise e1RM across the block ---- */

test("per-exercise e1RM progression spans the block, reusing onerm's estimator", () => {
  const p = A.exerciseProgression(buildingBlock());
  const dl = p.find((x) => x.id === "s1-deadlift");
  const sq = p.find((x) => x.id === "s2-squat");
  assert.equal(dl.points, 4);
  assert.equal(dl.first, 157.5);   // epley 135x5
  assert.equal(dl.last, 192.5);    // epley 165x5
  assert.equal(dl.direction, "up");
  assert.ok(dl.deltaPct > 0);
  assert.equal(dl.from.w, 135);
  assert.equal(dl.to.w, 165);
  assert.equal(sq.points, 3);
  assert.equal(sq.direction, "up");
});

test("per-exercise progression carries the sets the numbers came from", () => {
  const p = A.exerciseProgression(buildingBlock());
  const dl = p.find((x) => x.id === "s1-deadlift");
  assert.deepEqual(JSON.parse(JSON.stringify(dl.from)), { d: "2026-03-02", w: 135, r: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(dl.to)), { d: "2026-03-14", w: 165, r: 5 });
  assert.ok(dl.best >= dl.last);
});

test("progression is scoped to the block's dates", () => {
  const p = A.exerciseProgression(buildingBlock(), "2026-03-09", "2026-03-15");
  const dl = p.find((x) => x.id === "s1-deadlift");
  assert.equal(dl.points, 2);
  assert.equal(dl.from.d, "2026-03-11");
  assert.equal(dl.to.d, "2026-03-14");
});

test("one logged session for an exercise is insufficient, not a trend", () => {
  const p = A.exerciseProgression([wk("2026-03-02", [entry("x", [done(100, 5)])])]);
  assert.equal(p.length, 1);
  assert.equal(p[0].direction, "insufficient");
  assert.equal(p[0].deltaPct, null);
  assert.equal(p[0].first, 116.7);   // epley 100x5 — onerm.js owns the formula
  assert.equal(p[0].last, 116.7);
});

test("an exercise logged only as cardio/timed has no e1RM and is excluded", () => {
  const p = A.exerciseProgression([wk("2026-03-02", [entry("run", [{ w: 0, r: 0, done: true }])])]);
  assert.deepEqual(Array.from(p), []);
});

test("progression output is sorted by delta then id, and is stable", () => {
  const p = A.exerciseProgression([
    wk("2026-03-02", [entry("b", [done(100, 5)]), entry("a", [done(100, 5)])]),
    wk("2026-03-09", [entry("b", [done(100, 5)]), entry("a", [done(200, 5)])])
  ]);
  assert.deepEqual(Array.from(p).map((x) => x.id), ["a", "b"]);
});

/* ---- block-wide strength ---- */

test("strength trend averages only exercises with two or more points", () => {
  const s = A.strengthTrend(A.exerciseProgression(buildingBlock()));
  assert.equal(s.exercises, 2);
  assert.equal(s.direction, "up");
  assert.ok(s.deltaPct > 0);
});

test("a block of single sessions has no block strength at all", () => {
  const s = A.strengthTrend(A.exerciseProgression([
    wk("2026-03-02", [entry("a", [done(100, 5)])]),
    wk("2026-03-09", [entry("b", [done(200, 5)])])
  ]));
  assert.equal(s.exercises, 0);
  assert.equal(s.first, null);
  assert.equal(s.last, null);
  assert.equal(s.deltaPct, null);
  assert.equal(s.direction, "insufficient");
});

test("strengthTrend on nothing is nulls, not NaN", () => {
  const s = A.strengthTrend([]);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), {
    exercises: 0, first: null, last: null, deltaPct: null, direction: "insufficient"
  });
});

/* ---- adherence ---- */

test("adherence reports the rate only when a schedule exists", () => {
  const a = A.adherence(BUILD_REGIMENT, ["2026-03-02", "2026-03-04", "2026-03-09"], "2026-03-02", "2026-03-15");
  assert.equal(a.perWeek, 2);
  assert.equal(a.expected, 4);       // 2/wk over 2 weeks
  assert.equal(a.logged, 3);         // Mon 03-02, Wed 03-04, Mon 03-09
  assert.equal(a.rate, 75);
});

test("a regiment with no assigned sessions has no adherence rate", () => {
  const a = A.adherence({ days: [{ name: "Mon", sessions: [] }] }, ["2026-03-02"]);
  assert.equal(a.perWeek, 0);
  assert.equal(a.expected, null);
  assert.equal(a.rate, null);
  assert.equal(a.logged, null);
});

test("a missing regiment is no schedule, not 0%", () => {
  const a = A.adherence(null, ["2026-03-02"]);
  assert.equal(a.rate, null);
  assert.equal(A.adherence(undefined, undefined).rate, null);
});

test("a schedule with no logged dates and no block bounds has no rate", () => {
  /* perWeek > 0 but the span is unknown, so `expected` is null. A 0% here
   * would claim the user did nothing on a week that was never measured. */
  const a = A.adherence(BUILD_REGIMENT, []);
  assert.equal(a.perWeek, 2);
  assert.equal(a.expected, null);
  assert.equal(a.rate, null);
});

test("adherence counts only sessions on the regiment's own weekdays", () => {
  const a = A.adherence(BUILD_REGIMENT, ["2026-03-03"], "2026-03-02", "2026-03-15");
  assert.equal(a.logged, 0);   // Tuesday is not a regiment day
  assert.equal(a.rate, 0);
});

/* ---- RPE ---- */

test("rpeSummary averages only values the user actually recorded", () => {
  const r = A.rpeSummary(["7", "  8 ", 9, ""]);
  assert.equal(r.n, 3);
  assert.equal(r.avg, 8);
  assert.equal(r.min, 7);
  assert.equal(r.max, 9);
  assert.equal(r.unrecorded, 1);
});

test("rpeSummary counts junk and out-of-range as unrecorded, never as data", () => {
  const r = A.rpeSummary(["abc", "0", "11", "-3", null, {}]);
  assert.equal(r.n, 0);
  assert.equal(r.avg, null);
  assert.equal(r.unrecorded, 6);
  assert.equal(r.direction, "insufficient");
});

test("one recorded RPE is a reading, not a trend", () => {
  const r = A.rpeSummary(["7"]);
  assert.equal(r.avg, 7);
  assert.equal(r.direction, "insufficient");
  assert.equal(r.deltaPct, null);
});

test("rpeSummary on nothing is nulls", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(A.rpeSummary([]))), {
    n: 0, avg: null, min: null, max: null, first: null, last: null,
    deltaPct: null, direction: "insufficient", unrecorded: 0
  });
});

/* ---- bodyweight ---- */

test("bodyweight reports a delta only with two weigh-ins", () => {
  assert.equal(A.bodyweightSummary([{ date: "2026-03-02", weight: 200 }]).direction, "insufficient");
  const b = A.bodyweightSummary([{ date: "2026-03-02", weight: 200 }, { date: "2026-03-16", weight: 195 }]);
  assert.equal(b.delta, -5);
  assert.equal(b.direction, "down");
  assert.equal(b.n, 2);
});

test("bodyweight sorts by date and ignores zero / negative / junk weights", () => {
  const b = A.bodyweightSummary([
    { date: "2026-03-16", weight: 195 },
    { date: "2026-03-02", weight: 200 },
    { date: "2026-03-09", weight: 0 },
    { date: "2026-03-10", weight: -5 },
    { date: "2026-03-11", weight: "heavy" },
    "junk"
  ]);
  assert.equal(b.n, 2);
  assert.equal(b.first, 200);
  assert.equal(b.last, 195);
  assert.equal(b.firstDate, "2026-03-02");
});

test("bodyweight with nothing is nulls", () => {
  const b = A.bodyweightSummary([]);
  assert.equal(b.n, 0);
  assert.equal(b.delta, null);
  assert.equal(b.direction, "insufficient");
  assert.equal(A.bodyweightSummary(null).n, 0);
});

/* ---- phase verdict ---- */

test("a Build block whose volume and load rose matches the phase", () => {
  const v = A.phaseVerdict(A.phaseFor("Build"), "up", "up");
  assert.equal(v.verdict, "matches");
  assert.deepEqual(Array.from(v.offOn), []);
});

test("a Build block whose volume fell is off-phase, and says which half", () => {
  const v = A.phaseVerdict(A.phaseFor("Build"), "down", "up");
  assert.equal(v.verdict, "off-phase");
  assert.deepEqual(Array.from(v.offOn), ["volume"]);
});

test("a taper with volume down and load up matches", () => {
  const v = A.phaseVerdict(A.phaseFor("Peak 1 (Taper)"), "down", "up");
  assert.equal(v.verdict, "matches");
});

test("flat is judged as no-direction, not as a mismatch", () => {
  const v = A.phaseVerdict(A.phaseFor("Build"), "flat", "up");
  assert.equal(v.verdict, "matches");
  assert.equal(v.checks[0].neutral, true);
});

test("an unknown phase yields no verdict at all", () => {
  assert.equal(A.phaseVerdict(A.phaseFor("Microcycle"), "up", "up"), null);
  assert.equal(A.phaseVerdict(A.phaseFor(null), "up", "up"), null);
  assert.equal(A.phaseVerdict(null, "up", "up"), null);
});

test("a phase expecting neither volume nor load is never judged", () => {
  const v = A.phaseVerdict(A.phaseFor("Combat / Peak 2"), "down", "down");
  assert.equal(v.verdict, "off-phase");
  assert.deepEqual(Array.from(v.offOn), ["load"]);
  assert.equal(v.checks.length, 1);   // volume expectation is null -> not checked
});

/* ---- blockAnalytics ---- */

test("blockAnalytics with no logged session says so and returns empties", () => {
  const r = A.blockAnalytics({ regiment: BUILD_REGIMENT, workouts: [], loggedDates: [], rpes: [], bodyweight: [] });
  assert.equal(r.hasData, false);
  assert.equal(r.reason, "no-sessions");
  assert.equal(r.sessionCount, 0);
  assert.equal(r.verdict, null);
  assert.deepEqual(Array.from(r.volume.buckets), []);
  assert.deepEqual(Array.from(r.load), []);
  assert.equal(r.rpe.avg, null);
  assert.equal(r.bodyweight.n, 0);
});

test("blockAnalytics with no argument at all does not throw", () => {
  const r = A.blockAnalytics();
  assert.equal(r.hasData, false);
  assert.equal(r.reason, "no-sessions");
  assert.equal(A.blockAnalytics(null).hasData, false);
  assert.equal(A.blockAnalytics("junk").hasData, false);
});

test("blockAnalytics on a single session cannot judge the block", () => {
  const r = A.blockAnalytics({
    regiment: BUILD_REGIMENT,
    workouts: [wk("2026-03-02", [entry("s1-deadlift", [done(135, 5)])])],
    loggedDates: ["2026-03-02"],
    rpes: ["7"],
    bodyweight: [{ date: "2026-03-02", weight: 200 }]
  });
  assert.equal(r.hasData, true);
  assert.equal(r.sessionCount, 1);
  assert.equal(r.volume.direction, "insufficient");
  assert.equal(r.strength.direction, "insufficient");
  assert.equal(r.verdict.verdict, "insufficient");
  assert.equal(r.canJudge, true);          // the phase is known, so a verdict object exists
  assert.equal(r.rpe.avg, 7);
  assert.equal(r.bodyweight.delta, null);  // one weigh-in is not a delta
  assert.equal(r.bodyweight.direction, "insufficient");
});

test("blockAnalytics on a real two-week Build block answers the question", () => {
  const r = A.blockAnalytics({
    regiment: BUILD_REGIMENT,
    workouts: buildingBlock(),
    loggedDates: ["2026-03-02", "2026-03-07", "2026-03-09", "2026-03-11", "2026-03-14"],
    rpes: ["6", "7", "8"],
    bodyweight: [{ date: "2026-03-02", weight: 200 }, { date: "2026-03-14", weight: 198 }]
  });
  assert.equal(r.hasData, true);
  assert.equal(r.sessionCount, 5);
  assert.equal(r.volume.direction, "up");
  assert.equal(r.strength.direction, "up");
  assert.equal(r.verdict.verdict, "matches");
  assert.equal(r.adherence.rate, 75);   // 3 of 4 regiment-day sessions logged
  assert.equal(r.rpe.avg, 7);
  assert.equal(r.bodyweight.delta, -2);
  assert.equal(r.period.name, "Build");
});

test("blockAnalytics scopes every series to the block bounds", () => {
  const all = buildingBlock().concat([wk("2026-05-01", [entry("s1-deadlift", [done(315, 5)])])]);
  const r = A.blockAnalytics({
    regiment: BUILD_REGIMENT,
    workouts: all,
    loggedDates: ["2026-03-02", "2026-03-07", "2026-03-09", "2026-03-11", "2026-03-14", "2026-05-01"],
    from: "2026-03-01", to: "2026-03-31"
  });
  assert.equal(r.sessionCount, 5);
  assert.equal(r.load.find((x) => x.id === "s1-deadlift").last, 192.5);
});

test("blockAnalytics survives a regiment-less block", () => {
  const r = A.blockAnalytics({ workouts: buildingBlock() });
  assert.equal(r.hasData, true);
  assert.equal(r.period.known, false);
  assert.equal(r.verdict, null);
  assert.equal(r.adherence.rate, null);
  assert.ok(r.volume.direction === "up");
});

/* The guard that matters: walk every number the module can emit and prove none
 * of them is NaN or +/-Infinity, on the empty input where a division by zero
 * is one refactor away. */
function walkNumbers(node, path, seen) {
  if (typeof node === "number") {
    seen.push([path, node]);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNumbers(v, `${path}[${i}]`, seen));
    return;
  }
  if (node && typeof node === "object") {
    Object.keys(node).forEach((k) => walkNumbers(node[k], `${path}.${k}`, seen));
  }
}

test("empty input emits no NaN, Infinity or -Infinity anywhere in the report", () => {
  const cases = [
    ["nothing at all", A.blockAnalytics()],
    ["empty regiment only", A.blockAnalytics({ regiment: BUILD_REGIMENT })],
    ["one session, no rpe/bw/dates", A.blockAnalytics({ regiment: BUILD_REGIMENT, workouts: [wk("2026-03-02", [entry("x", [done(100, 5)])])] })],
    ["all-zero volume weeks", A.blockAnalytics({ regiment: BUILD_REGIMENT, workouts: [wk("2026-03-02", [entry("x", [warm(45, 5)])]), wk("2026-03-09", [entry("x", [warm(45, 5)])])], loggedDates: ["2026-03-02", "2026-03-09"] })],
    ["bad bodyweight and rpe only", A.blockAnalytics({ regiment: BUILD_REGIMENT, workouts: buildingBlock(), rpes: ["x", "", null], bodyweight: [{ date: "2026-03-02", weight: 0 }, "junk"] })]
  ];
  for (const [label, report] of cases) {
    const seen = [];
    walkNumbers(JSON.parse(JSON.stringify(report)), label, seen);
    for (const [where, n] of seen) {
      assert.ok(Number.isFinite(n), `${where} produced ${n}`);
    }
  }
});

/* ---- the weekly-plan seam this issue also asks for ---- */

test("weekdayFromName resolves long and short names, and rejects junk", () => {
  assert.equal(WP.weekdayFromName("Mon"), 0);
  assert.equal(WP.weekdayFromName("monday"), 0);
  assert.equal(WP.weekdayFromName("SUN"), 6);
  assert.equal(WP.weekdayFromName("Sunday"), 6);
  assert.equal(WP.weekdayFromName("Funday"), null);
  assert.equal(WP.weekdayFromName(""), null);
  assert.equal(WP.weekdayFromName(null), null);
});

test("planFromRegiment builds a weekly plan from the regiment's schedule", () => {
  const r = WP.planFromRegiment(BUILD_REGIMENT);
  assert.deepEqual(JSON.parse(JSON.stringify(r.plan)), { 0: "s-lower", 2: "s-upper" });
  assert.deepEqual(Array.from(r.assigned).map((a) => a.weekday), [0, 2]);
  assert.equal(r.unassigned.length, 0);
});

test("planFromRegiment reports extra sessions and unknown days instead of dropping them", () => {
  const r = WP.planFromRegiment({
    days: [
      { name: "Mon", sessions: ["a", "b"] },
      { name: "Funday", sessions: ["c"] }
    ]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(r.plan)), { 0: "a" });
  assert.deepEqual(Array.from(r.unassigned).map((u) => u.reason), ["extra-session", "unknown-day"]);
  assert.equal(r.unassigned[0].ref, "b");
});

test("planFromRegiment never mutates the base plan or the regiment", () => {
  const base = { 0: "keep", 5: "sat" };
  const before = JSON.stringify(base);
  const reg = { days: [{ name: "Mon", sessions: ["new"] }] };
  const regBefore = JSON.stringify(reg);
  const r = WP.planFromRegiment(reg, base);
  assert.deepEqual(JSON.parse(JSON.stringify(base)), JSON.parse(before));
  assert.equal(JSON.stringify(reg), regBefore);
  assert.equal(r.plan[5], "sat");          // untouched day keeps its session
  assert.equal(r.plan[0], "new");
});

test("planFromRegiment on an empty or absent regiment is an empty plan, not a throw", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(WP.planFromRegiment(null).plan)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(WP.planFromRegiment({}).plan)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(WP.planFromRegiment({ days: [] }).plan)), {});
  assert.equal(WP.planFromRegiment({ days: [{ name: "Mon", sessions: [] }] }).assigned.length, 0);
});

test("a generated plan round-trips through the existing weekly-plan helpers", () => {
  const { plan } = WP.planFromRegiment(BUILD_REGIMENT);
  assert.equal(WP.activeFor(plan, "2026-03-04"), "s-upper");  // a Wednesday
  assert.equal(WP.activeFor(plan, "2026-03-07"), null);     // a Saturday
  assert.deepEqual(Array.from(WP.weekdays(plan)), [0, 2]);
  const moved = WP.move(plan, 2, 4);
  assert.equal(moved.ok, true);
  assert.equal(moved.plan[4], "s-upper");
  assert.equal(moved.plan[2], undefined);
});