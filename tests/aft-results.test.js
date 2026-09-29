"use strict";
/* Tests for the pure AFT results collection (js/data/aft-results.js).
 * Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const AR = require("../js/data/aft-results.js");

/* ---------------- Validation / normalisation ---------------- */

test("make rejects missing event, date, or value", () => {
  assert.equal(AR.make({ event: "MDL", date: "2026-01-01", value: "285" }).value, "285", "valid entry passes");
  assert.equal(AR.make({ event: "NOTREAL", date: "2026-01-01", value: "1" }), null, "unknown event rejected");
  assert.equal(AR.make({ event: "MDL", date: "2026-01-01" }), null, "missing value rejected");
  assert.equal(AR.make({ event: "MDL", value: "285" }), null, "missing date rejected");
  assert.equal(AR.make({ event: "MDL", date: "2026-13-01", value: "1" }), null, "invalid month rejected");
  assert.equal(AR.make(null), null, "null rejected");
  assert.equal(AR.make("nope"), null, "non-object rejected");
});

test("make fills default unit and optional note", () => {
  const e = AR.make({ event: "MDL", date: "2026-02-01", value: "300", note: "  PR  " });
  assert.equal(e.unit, "lb", "defaults to the event unit");
  assert.equal(e.note, "PR", "note trimmed");
  const h = AR.make({ event: "HRP", date: "2026-02-01", value: "48" });
  assert.equal(h.unit, "reps");
});

test("make preserves caller-supplied unit and id", () => {
  const e = AR.make({ id: "keepme", event: "2MR", date: "2026-03-01", value: "16:30", unit: "mm:ss" });
  assert.equal(e.id, "keepme");
  assert.equal(e.unit, "mm:ss");
});

test("todayISO returns YYYY-MM-DD", () => {
  assert.match(AR.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ---------------- Upsert / remove ---------------- */

test("upsert appends new entries and returns changed flag", () => {
  const r = AR.upsert([], { event: "PLK", date: "2026-01-01", value: "2:05" });
  assert.equal(r.changed, true);
  assert.ok(r.entry && r.entry.id);
  assert.equal(r.list.length, 1);
});

test("upsert replaces an existing entry by id", () => {
  const first = AR.upsert([], { event: "MDL", date: "2026-01-01", value: "285" });
  const id = first.entry.id;
  const second = AR.upsert(first.list, { id, event: "MDL", date: "2026-01-01", value: "295" });
  assert.equal(second.list.length, 1, "no duplicate row");
  assert.equal(second.list[0].value, "295");
});

test("upsert of an invalid record leaves the list unchanged", () => {
  const start = AR.upsert([], { event: "MDL", date: "2026-01-01", value: "285" }).list;
  const r = AR.upsert(start, { event: "MDL", date: "2026-01-02" });
  assert.equal(r.changed, false);
  assert.equal(r.entry, null);
  assert.equal(r.list.length, 1);
});

test("remove drops only the matching id", () => {
  const a = AR.upsert([], { event: "MDL", date: "2026-01-01", value: "285" });
  const b = AR.upsert(a.list, { event: "2MR", date: "2026-01-01", value: "16:00" });
  const r = AR.remove(b.list, a.entry.id);
  assert.equal(r.changed, true);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].id, b.entry.id);
});

/* remove() and upsert() return a { list, changed } wrapper, but the store
 * layer persists a bare array (js/app.js saveAftResults -> store(KEYS.aft)).
 * Persisting the wrapper instead of `.list` was a live data-loss bug: the
 * object survived the JSON round-trip, getAftResults()'s Array.isArray guard
 * then returned [] , and the Drive merge threw in mergeById. These tests pin
 * the contract so a call site cannot regress to storing the wrapper. */
test("the value a delete persists is a bare array, not the {list,changed} wrapper", () => {
  const a = AR.upsert([], { event: "MDL", date: "2026-01-01", value: "285" });
  const b = AR.upsert(a.list, { event: "2MR", date: "2026-01-01", value: "16:00" });
  const c = AR.upsert(b.list, { event: "SDC", date: "2026-01-02", value: "210" });

  const stored = AR.remove(c.list, b.entry.id).list;

  assert.ok(Array.isArray(stored), "what gets stored must be an array");
  assert.equal(stored.length, 2, "only the deleted record is dropped");
  assert.equal(stored.some((r) => r.id === b.entry.id), false, "deleted id is gone");

  // Replay the localStorage round-trip plus getAftResults()'s guards.
  const roundTripped = JSON.parse(JSON.stringify({ v: stored })).v;
  const readBack = Array.isArray(roundTripped)
    ? roundTripped.map((r) => AR.make(r)).filter(Boolean)
    : [];
  assert.equal(readBack.length, 2, "survivors still read back after a reload");
});

test("a delete leaves the store mergeable by the Drive sync layer", () => {
  const S = require("../js/sync-core.js");
  const a = AR.upsert([], { event: "MDL", date: "2026-01-01", value: "285" });
  const b = AR.upsert(a.list, { event: "SDC", date: "2026-01-02", value: "210" });
  const stored = AR.remove(b.list, b.entry.id).list;

  const merged = S.mergeFor("br_aft_results", stored, a.list);
  assert.ok(Array.isArray(merged), "merge must not throw on the stored shape");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, a.entry.id);
});

/* The two tests above exercise the module contract, which is what makes the
 * bug invisible from here: they pass whether or not app.js unwraps `.list`.
 * This one reads the call site itself, so deleting `.list` in app.js fails the
 * suite rather than silently shipping. upsert/remove return {list, changed};
 * store() persists a bare array. */
test("app.js unwraps .list at every AFT mutate-then-store call site", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  // Whole statement, so a nested `.list` is not cut off by the first `)`.
  const statements = src.split(/;\s*\n/).filter((s) => /\.(upsert|remove)\s*\(/.test(s));
  const callSites = statements.filter((s) =>
    /(?:saveAftResults|saveBW|saveCustom)\s*\(/.test(s)
  );

  assert.ok(callSites.length > 0, "found at least one mutate-then-store call site");

  const offenders = callSites.filter((s) => !/\.(list|entries)\s*\)?\s*\)?\s*;?\s*$/.test(s.trim()));
  assert.deepEqual(
    offenders,
    [],
    "persisting the {list, changed} wrapper loses every record on read. Unwrap `.list`:\n  " +
      offenders.join("\n  ")
  );
});

/* ---------------- Ordering / insights ---------------- */

test("sortByDate orders newest first, ties by createdAt", () => {
  const mk = (date, id, created) => ({ id, date, event: "MDL", value: "1", unit: "lb", createdAt: created });
  const sorted = AR.sortByDate([mk("2026-03-01", "early", "t1"), mk("2026-05-01", "latest", "t3"), mk("2026-03-01", "later", "t2")]);
  assert.deepEqual(sorted.map((x) => x.id), ["latest", "later", "early"]);
});

test("latestByEvent returns the most recent entry per event", () => {
  const list = [
    { id: "a", event: "MDL", date: "2026-01-01", value: "270", createdAt: "t1" },
    { id: "b", event: "MDL", date: "2026-03-01", value: "285", createdAt: "t2" },
    { id: "c", event: "2MR", date: "2026-02-01", value: "17:30", createdAt: "t3" }
  ];
  const latest = AR.latestByEvent(list);
  assert.equal(latest.MDL.value, "285");
  assert.equal(latest["2MR"].value, "17:30");
  assert.equal(Object.keys(latest).length, 2);
});

test("count and events helpers", () => {
  assert.equal(AR.count([]), 0);
  assert.equal(AR.events().length, 5);
  assert.equal(AR.eventFor("HRP").name.includes("Push-Up"), true);
  assert.equal(AR.defaultUnit("PLK"), "min:sec");
  assert.equal(AR.defaultUnit("NOPE"), "");
});