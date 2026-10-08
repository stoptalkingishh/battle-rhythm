"use strict";
/* Coverage for snapshotItemRef's saved-session fallback (issue #51).
 *
 * The function resolves a tracker item id to its exercise/drill ref by scanning
 * each logged session's snapshot:
 *
 *     var snap = entry && entry.snapshot
 *       || sessions.filter(function (x) { return x.id === sids[j]; })[0];
 *
 * The second branch is the ONLY way a log written before snapshots existed can
 * resolve to an exercise name. It had no test at all: removing it left the whole
 * suite green, so a refactor could have deleted working code invisibly.
 *
 * The function lives inside js/app.js's IIFE and is not exported, so these tests
 * slice the real source out and evaluate it - the same approach as
 * tests/timer-recovery.test.js. The code under
 * test is the shipped code, not a copy.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

/* Slice snapshotItemRef out of the real app.js and return it as a function. */
function loadSnapshotItemRef() {
  const src = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const start = src.indexOf("function snapshotItemRef");
  assert.ok(start > -1, "snapshotItemRef is no longer present in js/app.js");

  // Walk braces from the function's opening brace to its true end.
  const open = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > -1, "could not find the end of snapshotItemRef");

  const body = src.slice(start, end);
  const context = {};
  vm.runInNewContext(`(${body})`, context, { filename: "js/app.js#snapshotItemRef" });
  assert.equal(typeof context.eval === "undefined", true);
  return vm.runInNewContext(`(${body})`);
}

/* A session in the shape the app stores, with one item in its activity phase. */
function sessionWithItem(sessionId, itemId, ref) {
  return {
    id: sessionId,
    name: "Test session",
    phases: {
      prep: { items: [] },
      activity: { items: [{ id: itemId, label: "Deadlift", ref: ref }] },
      recovery: { items: [] }
    }
  };
}

/* A log entry that carries a snapshot: written by a current build. */
function logWithSnapshot(date, sessionId, itemId, ref) {
  return {
    [date]: { sessions: { [sessionId]: { complete: true, snapshot: sessionWithItem(sessionId, itemId, ref) } } }
  };
}

/* A log entry with NO snapshot: written before snapshots existed. This is the
 * case the fallback exists for. */
function logWithoutSnapshot(date, sessionId) {
  return { [date]: { sessions: { [sessionId]: { complete: true } } } };
}

const ITEM = "item-abc123";
const REF = "s1-deadlift";
const SESSION = "sess-1";

test("a log entry WITH a snapshot resolves through the snapshot", () => {
  const f = loadSnapshotItemRef();
  const logs = logWithSnapshot("2026-09-01", SESSION, ITEM, REF);
  const got = f(logs, [], ITEM);
  assert.equal(got, REF, "the snapshot should have supplied the ref");
});

test("a log entry WITHOUT a snapshot still resolves via the saved session", () => {
  // This is the fallback the issue is about: the log predates snapshots, so the
  // only remaining source of an exercise ref is the session as it is saved now.
  const f = loadSnapshotItemRef();
  const logs = logWithoutSnapshot("2026-09-01", SESSION);
  const sessions = [sessionWithItem(SESSION, ITEM, REF)];
  const got = f(logs, sessions, ITEM);
  assert.equal(got, REF, "the saved-session fallback should have supplied the ref");
});

test("a snapshot is preferred over the saved session when both exist", () => {
  // The fallback must be a fallback, not an override: a snapshot is the record
  // of what was actually logged, so it wins even if the session has since been
  // edited to a different exercise.
  const f = loadSnapshotItemRef();
  const logs = logWithSnapshot("2026-09-01", SESSION, ITEM, "s2-squat");
  const sessions = [sessionWithItem(SESSION, ITEM, "s3-bench")];
  const got = f(logs, sessions, ITEM);
  assert.equal(got, "s2-squat", "the snapshot must win over the edited session");
});

test("removing the fallback breaks the legacy case (mutation guard)", () => {
  // Proves the previous test is load-bearing: with the fallback deleted, a
  // snapshot-less log can no longer resolve. If this ever stops failing, the
  // fallback is gone and issue #51 has reopened.
  const src = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(
    src,
    /entry\s*&&\s*entry\.snapshot\s*\|\|\s*sessions\.filter/,
    "the saved-session fallback is missing from app.js - it must be restored, not removed"
  );
  const f = loadSnapshotItemRef();
  const logs = logWithoutSnapshot("2026-09-01", SESSION);
  assert.equal(f(logs, [], ITEM), "", "with no sessions supplied there is nothing to resolve from");
});

test("an unknown item id resolves to an empty string, not undefined", () => {
  const f = loadSnapshotItemRef();
  const logs = logWithSnapshot("2026-09-01", SESSION, ITEM, REF);
  assert.equal(f(logs, [], "no-such-item"), "");
});

test("an item with no ref is skipped rather than returning undefined", () => {
  const f = loadSnapshotItemRef();
  const session = { id: SESSION, phases: { activity: { items: [{ id: ITEM, label: "No ref" }] } } };
  const logs = { "2026-09-01": { sessions: { [SESSION]: { complete: true, snapshot: session } } } };
  assert.equal(f(logs, [], ITEM), "");
});

test("the schemaVersion key is not treated as a date", () => {
  const f = loadSnapshotItemRef();
  const logs = Object.assign({ schemaVersion: 2 }, logWithSnapshot("2026-09-01", SESSION, ITEM, REF));
  assert.equal(f(logs, [], ITEM), REF);
});

test("an empty log store resolves to an empty string", () => {
  const f = loadSnapshotItemRef();
  assert.equal(f({}, [], ITEM), "");
  assert.equal(f(null, null, ITEM), "");
});

test("the fallback is found across every phase, not just activity", () => {
  const f = loadSnapshotItemRef();
  const session = {
    id: SESSION,
    phases: {
      prep: { items: [] },
      activity: { items: [] },
      recovery: { items: [{ id: ITEM, label: "Stretch", ref: "r7-band-chest-stretch" }] }
    }
  };
  const logs = logWithoutSnapshot("2026-09-01", SESSION);
  assert.equal(f(logs, [session], ITEM), "r7-band-chest-stretch");
});
