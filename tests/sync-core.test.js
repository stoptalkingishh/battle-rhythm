"use strict";
/* Unit tests for the pure sync core (js/sync-core.js) using only Node built-ins.
 * Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/sync-core.js");

/* ---------------- Merge ---------------- */

test("mergeById: Drive wins collisions, local-only rows kept", () => {
  const remote = [{ id: "a", v: 2 }, { id: "b", v: 1 }];
  const local = [{ id: "a", v: 1 }, { id: "c", v: 1 }];
  const merged = S.mergeById(remote, local);
  assert.equal(merged.length, 3);
  const byId = Object.fromEntries(merged.map((x) => [x.id, x]));
  assert.equal(byId.a.v, 2, "remote wins on id collision");
  assert.equal(byId.c.v, 1, "local-only row kept");
});

test("mergeLogs: unions dates and session ids, no id-level data loss", () => {
  const remote = { "2026-01-01": { sessions: { s1: { reps: 10 }, s2: { reps: 5 } } } };
  const local = { "2026-01-01": { sessions: { s1: { reps: 99 }, s3: { reps: 7 } } }, "2026-01-02": { sessions: { s4: { reps: 3 } } } };
  const merged = S.mergeLogs(remote, local);
  assert.deepEqual(Object.keys(merged).sort(), ["2026-01-01", "2026-01-02"]);
  assert.deepEqual(Object.keys(merged["2026-01-01"].sessions).sort(), ["s1", "s2", "s3"]);
  assert.equal(merged["2026-01-01"].sessions.s1.reps, 10, "remote wins per-session collision");
});

/* ---------------- Outbox queue compaction / retry ---------------- */

function op(key, ts) { return { opId: key + "-" + ts, key, file: S.fileFor(key), ts, attempts: 0 }; }

test("compactOutbox: keeps at most one pending op per collection (latest wins)", () => {
  const box = S.compactOutbox([op("br_sessions", "t1"), op("br_tracker", "t1"), op("br_sessions", "t2")]);
  assert.equal(box.length, 2);
  assert.deepEqual(S.pendingKeys(box).sort(), ["br_sessions", "br_tracker"]);
  const s = box.find((o) => o.key === "br_sessions");
  assert.equal(s.ts, "t2", "later op supersedes earlier for the same key");
});

test("pushOp is append-only modelling: appends then compacts", () => {
  let box = S.pushOp([], op("br_sessions", "t1"));
  box = S.pushOp(box, op("br_sessions", "t2"));
  box = S.pushOp(box, op("br_tracker", "t1"));
  assert.equal(S.pendingCount(box), 2);
  assert.equal(box.find((o) => o.key === "br_sessions").ts, "t2");
});

test("pruneFlushed: only confirmed collections are dropped, rest stay queued", () => {
  const box = [op("br_sessions", "t1"), op("br_tracker", "t1"), op("br_groups", "t1")];
  const res = S.pruneFlushed(box, ["br_sessions"]);
  assert.deepEqual(res.flushed, ["br_sessions"]);
  assert.deepEqual(S.pendingKeys(res.outbox).sort(), ["br_groups", "br_tracker"]);
  assert.equal(S.pendingCount(res.outbox), 2);
});

test("pruneFlushed with no confirmations leaves the queue intact (retry later)", () => {
  const box = [op("br_sessions", "t1")];
  const res = S.pruneFlushed(box, []);
  assert.equal(res.outbox.length, 1);
  assert.equal(res.flushed.length, 0);
});

test("markAttempted increments attempts for one op", () => {
  const box = S.markAttempted([op("br_sessions", "t1")], "br_sessions");
  assert.equal(box[0].attempts, 1);
  const again = S.markAttempted(box, "br_sessions");
  assert.equal(again[0].attempts, 2);
});

test("retryDelay: exponential backoff capped", () => {
  assert.equal(S.retryDelay(0, 800, 30000), 800);
  assert.equal(S.retryDelay(1, 800, 30000), 1600);
  assert.equal(S.retryDelay(2, 800, 30000), 3200);
  assert.equal(S.retryDelay(50, 800, 30000), 30000, "cap applied");
});

test("shouldRetry: infinite by default, bounded when maxAttempts set", () => {
  assert.equal(S.shouldRetry(99), true);
  assert.equal(S.shouldRetry(99, 0), true);
  assert.equal(S.shouldRetry(0, 3), true);
  assert.equal(S.shouldRetry(2, 3), true);
  assert.equal(S.shouldRetry(3, 3), false);
});

/* ---------------- Reconcile via modifiedTime ---------------- */

test("doesRemoteMatch: no remote -> base is local", () => {
  assert.equal(S.doesRemoteMatch("", ""), true);
  assert.equal(S.doesRemoteMatch("m1", ""), true);
});

test("doesRemoteMatch: unknown base with remote present -> changed", () => {
  assert.equal(S.doesRemoteMatch("", "2026-01-01T00:00:00.000Z"), false);
});

test("doesRemoteMatch: matching base -> unchanged", () => {
  assert.equal(S.doesRemoteMatch("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"), true);
  assert.equal(S.doesRemoteMatch("m1", "m2"), false);
});

test("reconcile: remote unchanged -> overwrite with local (safe last-write-wins)", () => {
  const r = S.reconcile("m1", "m1", [{ id: "a", v: 1 }], [{ id: "b", v: 2 }], "br_sessions");
  assert.equal(r.remoteChanged, false);
  assert.deepEqual(r.data, [{ id: "b", v: 2 }]);
});

test("reconcile: no remote file -> local wins untouched", () => {
  const r = S.reconcile("", "", null, [{ id: "a", v: 1 }], "br_sessions");
  assert.equal(r.remoteChanged, false);
  assert.deepEqual(r.data, [{ id: "a", v: 1 }]);
});

test("shouldWriteRemote: deletion clears an existing Drive collection", () => {
  assert.equal(S.shouldWriteRemote("br_sessions", [], [{ id: "s1" }]), true);
  assert.equal(S.shouldWriteRemote("br_tracker", {}, { "2026-01-01": { sessions: {} } }), true);
});

test("shouldWriteRemote: an empty collection without a Drive file does not create one", () => {
  assert.equal(S.shouldWriteRemote("br_sessions", [], null), false);
  assert.equal(S.shouldWriteRemote("br_tracker", {}, null), false);
});

test("reconcile: remote changed externally -> merged before overwrite, nothing dropped", () => {
  const remote = [{ id: "a", v: 9 }, { id: "c", v: 3 }];
  const local = [{ id: "a", v: 1 }, { id: "b", v: 2 }];
  const r = S.reconcile("m1", "m2", remote, local, "br_sessions");
  assert.equal(r.remoteChanged, true);
  const byId = Object.fromEntries(r.data.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(byId).sort(), ["a", "b", "c"]);
  assert.equal(byId.a.v, 9, "remote wins on collision after reconcile");
  assert.equal(byId.b.v, 2, "local-only kept after reconcile");
});

test("reconcile: local empty, remote known base -> pull Drive into local (restore)", () => {
  const remote = [{ id: "x", v: 5 }];
  const r = S.reconcile("m1", "m2", remote, [], "br_sessions");
  assert.equal(r.remoteChanged, true);
  assert.deepEqual(r.data, [{ id: "x", v: 5 }]);
});

test("reconcile: tracker merge applies via mergeFor", () => {
  const remote = { "2026-01-01": { sessions: { s1: { reps: 8 } } } };
  const local = {};
  const r = S.reconcile("m1", "m2", remote, local, "br_tracker");
  assert.equal(r.remoteChanged, true);
  assert.deepEqual(r.data["2026-01-01"].sessions.s1.reps, 8);
});

test("FILE_MAP is the existing compatible mapping", () => {
  assert.deepEqual(S.FILE_MAP, {
    br_sessions: "sessions.json",
    br_regiments: "regiments.json",
    br_tracker: "tracker.json",
    br_groups: "groups.json"
  });
});