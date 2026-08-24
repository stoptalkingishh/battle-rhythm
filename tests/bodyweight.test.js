"use strict";
/* Unit tests for the pure body-weight helpers (js/data/bodyweight.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const BW = require("../js/data/bodyweight.js");

test("make: valid entry normalizes, defaults unit to lb, keeps supplied id", () => {
  const e = BW.make({ date: "2026-08-01", weight: 180 });
  assert.ok(e);
  assert.equal(e.date, "2026-08-01");
  assert.equal(e.weight, 180);
  assert.equal(e.unit, "lb");
  assert.equal(e.note, "");
  assert.ok(e.id, "id is generated");
  assert.ok(e.createdAt, "createdAt is stamped");
});

test("make: accepts unit kg and lowercase/casey unit, trims note, preserves id", () => {
  const e = BW.make({ id: "x1", date: "2026-08-02", weight: "82.5", unit: "KG", note: "  morning  " });
  assert.equal(e.id, "x1");
  assert.equal(e.weight, 82.5);
  assert.equal(e.unit, "kg");
  assert.equal(e.note, "morning");
});

test("make: rejects bad dates", () => {
  assert.equal(BW.make({ date: "08/01/2026", weight: 180 }), null, "non ISO format");
  assert.equal(BW.make({ date: "2026-13-01", weight: 180 }), null, "month 13");
  assert.equal(BW.make({ date: "2026-02-30", weight: 180 }), null, "leap-invalid day");
  assert.equal(BW.make({ date: "", weight: 180 }), null, "empty date");
  assert.equal(BW.make({ weight: 180 }), null, "missing date");
  assert.ok(BW.make({ date: "2024-02-29", weight: 180 }), "real leap day is accepted");
});

test("make: rejects zero, negative, non-finite and non-numeric weight", () => {
  assert.equal(BW.make({ date: "2026-08-01", weight: 0 }), null, "zero");
  assert.equal(BW.make({ date: "2026-08-01", weight: -5 }), null, "negative");
  assert.equal(BW.make({ date: "2026-08-01", weight: NaN }), null, "NaN");
  assert.equal(BW.make({ date: "2026-08-01", weight: Infinity }), null, "Infinity");
  assert.equal(BW.make({ date: "2026-08-01", weight: "abc" }), null, "non-numeric string");
  assert.equal(BW.make({ date: "2026-08-01" }), null, "missing weight");
  assert.equal(BW.make({ date: "2026-08-01", weight: "" }), null, "blank string weight");
});

test("make: rejects unknown unit", () => {
  assert.equal(BW.make({ date: "2026-08-01", weight: 180, unit: "stones" }), null);
});

test("make: rejects non-object input", () => {
  assert.equal(BW.make(null), null);
  assert.equal(BW.make(undefined), null);
  assert.equal(BW.make("180"), null);
  assert.equal(BW.make({}), null);
});

test("upsert: appends a new valid entry", () => {
  const { list, changed, entry } = BW.upsert([], { date: "2026-08-01", weight: 180 });
  assert.equal(changed, true);
  assert.equal(list.length, 1);
  assert.equal(list[0].weight, 180);
  assert.equal(entry.weight, 180);
});

test("upsert: replaces an existing entry by id", () => {
  const base = [{ id: "a1", date: "2026-08-01", weight: 180, unit: "lb", note: "", createdAt: "t1" }];
  const { list, changed } = BW.upsert(base, { id: "a1", date: "2026-08-01", weight: 179.5 });
  assert.equal(changed, true);
  assert.equal(list.length, 1, "same id replaces, no duplicate");
  assert.equal(list[0].weight, 179.5);
  assert.equal(list[0].note, "");
  assert.equal(BW.upsert(base, { id: "a1", date: "2026-08-01", weight: 179.5 }).list[0].note, "", "replacement is a fresh normalized object");
});

test("upsert: invalid record is a no-op", () => {
  const base = [{ id: "a1", date: "2026-08-01", weight: 180, unit: "lb", note: "", createdAt: "t1" }];
  const res = BW.upsert(base, { date: "not-a-date", weight: 180 });
  assert.equal(res.changed, false);
  assert.equal(res.entry, null);
  assert.deepEqual(res.list, base);
});

test("remove: drops matching id, reports change; missing id is a no-op", () => {
  const base = [
    { id: "a1", date: "2026-08-01", weight: 180, unit: "lb", note: "", createdAt: "t1" },
    { id: "a2", date: "2026-08-05", weight: 179, unit: "lb", note: "", createdAt: "t2" }
  ];
  const gone = BW.remove(base, "a1");
  assert.equal(gone.changed, true);
  assert.equal(gone.list.length, 1);
  assert.equal(gone.list[0].id, "a2");
  const miss = BW.remove(base, "nope");
  assert.equal(miss.changed, false);
  assert.equal(miss.list.length, 2);
  assert.equal(BW.remove([], "x").changed, false);
});

test("sortByDate: newest first, ties broken by newest createdAt", () => {
  const base = [
    { id: "a1", date: "2026-08-01", createdAt: "t1" },
    { id: "a3", date: "2026-08-10", createdAt: "t3" },
    { id: "a2", date: "2026-08-05", createdAt: "t2" },
    { id: "a1b", date: "2026-08-01", createdAt: "t9" }
  ];
  const s = BW.sortByDate(base);
  assert.deepEqual(s.map(e => e.id), ["a3", "a2", "a1b", "a1"], "desc date, then desc createdAt");
  assert.equal(base.length, 4, "input not mutated");
  assert.deepEqual(BW.sortByDate([]), []);
});

test("latest: max date (then max createdAt), order-independent; empty returns null", () => {
  const base = [
    { id: "a1", date: "2026-08-01", createdAt: "t1" },
    { id: "a3", date: "2026-08-10", createdAt: "t3" },
    { id: "a4", date: "2026-08-10", createdAt: "t8" }
  ];
  const last = BW.latest(base);
  assert.equal(last.id, "a4", "tie goes to newest createdAt");
  assert.equal(BW.latest([]), null);
});

test("withDeltas: chronological deltas flagged as toward/away from goal", () => {
  const base = [
    { id: "a1", date: "2026-08-01", weight: 180, createdAt: "t1" },
    { id: "a2", date: "2026-08-05", weight: 178, createdAt: "t2" },
    { id: "a3", date: "2026-08-10", weight: 181, createdAt: "t3" }
  ];

  // Goal 170: we want to lose. Loss is toward; gain is away.
  const lose = BW.withDeltas(base, { weight: 170, unit: "lb" });
  assert.equal(lose.length, 3);
  assert.equal(lose[0].change, 0, "first entry has no previous");
  assert.equal(lose[0].towardGoal, false);
  assert.equal(lose[1].change, -2, "178 - 180");
  assert.equal(lose[1].towardGoal, true, "losing toward 170 is toward");
  assert.equal(lose[2].change, 3, "181 - 178");
  assert.equal(lose[2].towardGoal, false, "gaining moves away from 170");

  // Goal 190: we want to gain. Gain is toward; loss is away.
  const gain = BW.withDeltas(base, { weight: 190, unit: "lb" });
  assert.equal(gain[1].change, -2);
  assert.equal(gain[1].towardGoal, false, "loss moves away from 190");
  assert.equal(gain[2].change, 3);
  assert.equal(gain[2].towardGoal, true, "gain moves toward 190");

  assert.equal(base.length, 3, "input not mutated");
});

test("towardGoal: edge cases never count as toward", () => {
  assert.equal(BW.towardGoal(null, 180, -2), false, "no goal");
  assert.equal(BW.towardGoal({ weight: 190 }, 180, 0), false, "zero change");
  assert.equal(BW.towardGoal({ weight: 190 }, 180, 2), true, "gain toward higher goal");
  assert.equal(BW.towardGoal({ weight: 170 }, 180, -2), true, "loss toward lower goal");
  assert.equal(BW.towardGoal({ weight: 180 }, 180, 2), false, "already at goal: any move away initially");
  assert.equal(BW.towardGoal({ weight: NaN }, 180, 2), false, "invalid goal weight");
});

test("series: correct shape [{t,y,d,change}] ascending, deltas re-baseline", () => {
  const base = [
    { id: "a1", date: "2026-08-01", weight: 180, createdAt: "t1" },
    { id: "a2", date: "2026-08-05", weight: 178, createdAt: "t2" },
    { id: "a3", date: "2026-08-10", weight: 181, createdAt: "t3" }
  ];
  const s = BW.series(base);
  assert.equal(s.length, 3);
  assert.equal(s[0].t, Date.parse("2026-08-01T00:00:00Z"));
  assert.equal(s[0].y, 180);
  assert.equal(s[0].d, "2026-08-01");
  assert.equal(s[0].change, 0);
  assert.equal(s[1].y, 178);
  assert.equal(s[1].change, -2);
  assert.equal(s[2].y, 181);
  assert.equal(s[2].change, 3);
  assert.ok(s[0].t < s[1].t && s[1].t < s[2].t, "ascending by t");
  assert.deepEqual(s[1], { t: s[1].t, y: 178, d: "2026-08-05", change: -2 }, "exact point shape");
});

test("series: days window filters and re-baselines first survivor", () => {
  const now = Date.now();
  const base = [
    { id: "old", date: "2020-01-01", weight: 200, createdAt: "t0" },
    { id: "a1", date: new Date(now - 3 * 86400000).toISOString().slice(0, 10), weight: 180, createdAt: "t1" },
    { id: "a2", date: new Date(now - 1 * 86400000).toISOString().slice(0, 10), weight: 178, createdAt: "t2" }
  ];
  const s = BW.series(base, { days: 30 });
  assert.equal(s.length, 2, "old entry outside window dropped");
  assert.equal(s[0].d, base[1].date);
  assert.equal(s[0].change, 0, "first survivor re-baselines to 0");
  assert.equal(s[1].change, -2);
});

test("withDeltas/series/latest/sortByDate tolerate empty and unordered input", () => {
  assert.deepEqual(BW.withDeltas([], { weight: 170 }), []);
  assert.deepEqual(BW.series([]), []);
  assert.equal(BW.latest([]), null);
  assert.deepEqual(BW.sortByDate([]), []);
  assert.deepEqual(BW.withDeltas(null, null), []);
  assert.deepEqual(BW.series(null), []);
});

test("normalizeGoal: accepts object or bare number, defaults unit lb", () => {
  assert.deepEqual(BW.normalizeGoal({ weight: 170, unit: "lb" }), { weight: 170, unit: "lb" });
  assert.deepEqual(BW.normalizeGoal(170), { weight: 170, unit: "lb" });
  assert.deepEqual(BW.normalizeGoal({ weight: "82", unit: "kg" }), { weight: 82, unit: "kg" });
  assert.equal(BW.normalizeGoal({ weight: 0 }), null, "zero goal");
  assert.equal(BW.normalizeGoal({ weight: -5 }), null, "negative goal");
  assert.equal(BW.normalizeGoal({ weight: "abc" }), null, "non-numeric goal");
  assert.equal(BW.normalizeGoal(null), null);
});