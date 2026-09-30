"use strict";
/* Unit tests for multi-device conflict detection (js/sync-core.js), using only
 * Node built-ins. Run: node --test tests/
 *
 * Every fixture below is a three-way merge: `base` is the state both devices
 * last agreed on (the last state Drive confirmed), `local` is this device's
 * copy, `remote` is what Drive holds. The tests that matter most are the pairs:
 * one where both devices edited the same record and one where only one did.
 * A detector that always says "conflict" passes the first and fails the second,
 * which is why they are asserted side by side throughout.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/sync-core.js");

/* ---------------- Canonical form ---------------- */

test("stable: key order and array order are canonical, object order is not", () => {
  assert.equal(S.stable({ a: 1, b: 2 }), S.stable({ b: 2, a: 1 }), "key order is not a change");
  assert.notEqual(S.stable({ a: [1, 2] }), S.stable({ a: [2, 1] }), "array order IS a change");
  assert.equal(S.sameRecord({ x: 1, y: { p: 1, q: 2 } }, { y: { q: 2, p: 1 }, x: 1 }), true);
  assert.equal(S.sameRecord({ a: 1 }, { a: "1" }), false, "types are distinguished");
  assert.equal(S.sameRecord(undefined, null), false, "missing is not null");
});

test("digest is stable across key order and distinct for different content", () => {
  assert.equal(S.digest({ a: 1, b: 2 }), S.digest({ b: 2, a: 1 }));
  assert.notEqual(S.digest({ a: 1 }), S.digest({ a: 2 }));
  assert.match(S.digest({ a: 1 }), /^[0-9a-f]{8}$/);
});

/* ---------------- The bug: two offline edits to the same record ---------------- */

test("ISSUE 3: two devices edit the same field while both offline -> one conflict, both versions kept", () => {
  const base = [{ id: "s1", name: "Legs", reps: 10 }];
  const local = [{ id: "s1", name: "Legs + Run", reps: 10 }];   /* device A renamed it */
  const remote = [{ id: "s1", name: "Legs (heavy)", reps: 10 }]; /* device B renamed it too */
  const res = S.reconcileWithBase("br_sessions", base, local, remote, "2026-01-01T00:00:00.000Z");

  assert.equal(res.ancestorKnown, true);
  assert.equal(res.conflicts.length, 1, "exactly one conflict surfaced, not one per record");
  const c = res.conflicts[0];
  assert.equal(c.recordId, "s1");
  assert.equal(c.kind, "edit-vs-edit");
  assert.deepEqual(c.fields, ["name"], "the one contested field is named");
  assert.equal(c.local.name, "Legs + Run", "device A's edit preserved in the entry");
  assert.equal(c.remote.name, "Legs (heavy)", "device B's edit preserved in the entry");

  /* The point of the whole change: BOTH versions exist after the merge. */
  const byId = Object.fromEntries(res.data.map((x) => [x.id, x]));
  assert.equal(byId.s1.name, "Legs + Run", "local version still at the original id");
  assert.ok(byId[c.forkId], "remote version written as a sibling, not dropped");
  assert.equal(byId[c.forkId].name, "Legs (heavy)");
  assert.equal(byId[c.forkId].reps, 10);
  assert.deepEqual(byId[c.forkId]._conflict, { from: "s1", source: "remote", detectedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(res.data.length, 2, "nothing was silently overwritten");
});

test("ISSUE 3: one record, two contested fields -> still ONE conflict naming both", () => {
  const base = [{ id: "s1", name: "Legs", reps: 10 }];
  const local = [{ id: "s1", name: "Legs + Run", reps: 11 }];
  const remote = [{ id: "s1", name: "Legs heavy", reps: 12 }];
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.equal(res.conflicts.length, 1, "a record is the unit of conflict, not a field");
  assert.deepEqual(res.conflicts[0].fields.sort(), ["name", "reps"]);
});

test("counter-case: only this device edited -> merges clean, NO conflict", () => {
  const base = [{ id: "s1", name: "Legs", reps: 10 }];
  const local = [{ id: "s1", name: "Legs + Run", reps: 10 }];
  const remote = base;                        /* Drive untouched while we were offline */
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.deepEqual(res.conflicts, [], "a one-sided edit is not a conflict");
  assert.equal(res.data.length, 1, "no sibling fork invented");
  assert.equal(res.data[0].name, "Legs + Run");
  assert.equal(res.data[0]._conflict, undefined);
});

test("counter-case: only the other device edited -> takes their value, NO conflict", () => {
  const base = [{ id: "s1", name: "Legs", reps: 10 }];
  const local = base;
  const remote = [{ id: "s1", name: "Legs", reps: 12 }];
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.deepEqual(res.conflicts, []);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].reps, 12, "the other device's change is absorbed");
});

test("counter-case: disjoint field edits on one record merge with NO conflict", () => {
  const base = [{ id: "s1", name: "Legs", reps: 10 }];
  const local = [{ id: "s1", name: "Legs + Run", reps: 10 }];   /* A renamed it */
  const remote = [{ id: "s1", name: "Legs", reps: 12 }];        /* B raised reps */
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.deepEqual(res.conflicts, [], "disjoint fields union safely");
  assert.equal(res.data.length, 1, "no fork when there is nothing to choose between");
  assert.deepEqual(res.data[0], { id: "s1", name: "Legs + Run", reps: 12 });
});

test("counter-case: different records edited on each device -> NO conflict", () => {
  const base = [{ id: "s1", v: 1 }, { id: "s2", v: 1 }];
  const local = [{ id: "s1", v: 2 }, { id: "s2", v: 1 }];
  const remote = [{ id: "s1", v: 1 }, { id: "s2", v: 9 }];
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.deepEqual(res.conflicts, []);
  assert.equal(res.data.length, 2);
  assert.equal(res.data.find((x) => x.id === "s1").v, 2);
  assert.equal(res.data.find((x) => x.id === "s2").v, 9);
});

test("counter-case: identical edits on both devices are agreement, not a conflict", () => {
  const base = [{ id: "s1", v: 1 }];
  const same = [{ id: "s1", v: 2 }];
  const res = S.reconcileWithBase("br_sessions", base, same, same);
  assert.deepEqual(res.conflicts, []);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].v, 2);
});

test("independent adds of the SAME id with different content is a conflict", () => {
  const res = S.reconcileWithBase("br_sessions", [], [{ id: "s1", name: "A" }], [{ id: "s1", name: "B" }]);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].kind, "created-both");
  assert.ok(res.data.some((x) => x.id === res.conflicts[0].forkId), "B's version is not lost");
});

test("independent adds of DIFFERENT ids merge with no conflict", () => {
  const res = S.reconcileWithBase("br_sessions", [], [{ id: "s1" }], [{ id: "s2" }]);
  assert.deepEqual(res.conflicts, []);
  assert.deepEqual(res.data.map((x) => x.id).sort(), ["s1", "s2"]);
});

/* ---------------- Delete vs edit ---------------- */

test("deleted here, edited there -> resurrect their version and flag it, no data loss", () => {
  const base = [{ id: "s1", v: 1 }];
  const local = [];                                       /* user deleted s1 */
  const remote = [{ id: "s1", v: 2 }];                    /* other device edited it */
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].kind, "delete-local-vs-edit-remote");
  assert.equal(res.conflicts[0].forkId, null, "nothing to keep both - the local side is an absence");
  assert.equal(res.data.length, 1, "the edit is not destroyed by the delete");
  assert.equal(res.data[0].v, 2);
});

test("edited here, deleted there -> keep our edit and flag it", () => {
  const base = [{ id: "s1", v: 1 }];
  const local = [{ id: "s1", v: 2 }];
  const remote = [];                                      /* deleted on the other device */
  const res = S.reconcileWithBase("br_sessions", base, local, remote);
  assert.equal(res.conflicts.length, 1);
  assert.equal(res.conflicts[0].kind, "edit-local-vs-delete-remote");
  assert.equal(res.data.length, 1, "the local edit survives");
  assert.equal(res.data[0].v, 2);
});

test("counter-case: deleted on BOTH devices -> no conflict, record stays gone", () => {
  const base = [{ id: "s1", v: 1 }, { id: "s2", v: 1 }];
  const res = S.reconcileWithBase("br_sessions", base, [], []);
  assert.deepEqual(res.conflicts, []);
  assert.deepEqual(res.data, []);
});

test("counter-case: deleted here, untouched there -> the delete propagates, no conflict", () => {
  const base = [{ id: "s1", v: 1 }];
  const remote = [{ id: "s1", v: 1 }];
  const res = S.reconcileWithBase("br_sessions", base, [], remote);
  assert.deepEqual(res.conflicts, [], "agreeing on a delete is not a conflict");
  assert.deepEqual(res.data, []);
});

/* ---------------- Tracker logs (date -> sessions -> entry) ---------------- */

test("tracker: two devices log the same sessionId on the same date -> conflict, both kept", () => {
  const base = { "2026-01-01": { sessions: { s1: { note: "", reps: 10 } } } };
  /* A wrote one note, B wrote a different one: same field, two values. */
  const local = { "2026-01-01": { sessions: { s1: { note: "felt heavy", reps: 10 } } } };
  const remote = { "2026-01-01": { sessions: { s1: { note: "r knee", reps: 12 } } } };
  const res = S.reconcileWithBase("br_tracker", base, local, remote);
  assert.equal(res.conflicts.length, 1);
  const c = res.conflicts[0];
  assert.equal(c.key, "br_tracker");
  assert.equal(c.path, "2026-01-01", "the date the conflict lives under is recorded");
  assert.equal(c.recordId, "s1");
  assert.deepEqual(c.fields, ["note"], "only the genuinely contested field is named");
  const sessions = res.data["2026-01-01"].sessions;
  assert.equal(sessions.s1.note, "felt heavy", "local version at the original id");
  assert.equal(sessions[c.forkId].note, "r knee", "remote version as a sibling in the same date");
  assert.equal(sessions[c.forkId].reps, 12);
});

test("tracker counter-case: different sessions on the same date merge clean", () => {
  const base = { "2026-01-01": { sessions: { s1: { reps: 10 } } } };
  const local = { "2026-01-01": { sessions: { s1: { reps: 11 } } } };
  const remote = { "2026-01-01": { sessions: { s1: { reps: 10 }, s2: { reps: 3 } } } };
  const res = S.reconcileWithBase("br_tracker", base, local, remote);
  assert.deepEqual(res.conflicts, [], "an edit to s1 and an addition of s2 do not collide");
  assert.deepEqual(Object.keys(res.data["2026-01-01"].sessions).sort(), ["s1", "s2"]);
  assert.equal(res.data["2026-01-01"].sessions.s1.reps, 11);
});

test("tracker: same sessionId on DIFFERENT dates is two records, not a conflict", () => {
  const base = {};
  const local = { "2026-01-01": { sessions: { s1: { reps: 1 } } } };
  const remote = { "2026-01-02": { sessions: { s1: { reps: 2 } } } };
  const res = S.reconcileWithBase("br_tracker", base, local, remote);
  assert.deepEqual(res.conflicts, []);
  assert.deepEqual(Object.keys(res.data).sort(), ["2026-01-01", "2026-01-02"]);
});

test("tracker: schemaVersion is carried by max, never treated as a date or a session", () => {
  const base = { schemaVersion: 1 };
  const local = { schemaVersion: 2, "2026-01-01": { sessions: {} } };
  const remote = { schemaVersion: 1 };
  const res = S.reconcileWithBase("br_tracker", base, local, remote);
  assert.equal(res.data.schemaVersion, 2);
  assert.deepEqual(Object.keys(res.data).sort(), ["2026-01-01", "schemaVersion"]);
});

/* ---------------- No ancestor: refuse to invent conflicts ---------------- */

test("no base snapshot -> old remote-wins union, ancestorKnown false, no false conflicts", () => {
  const local = [{ id: "s1", v: 1 }];
  const remote = [{ id: "s1", v: 9 }, { id: "s2", v: 2 }];
  const res = S.reconcileWithBase("br_sessions", null, local, remote);
  assert.equal(res.ancestorKnown, false);
  assert.deepEqual(res.conflicts, [], "without an ancestor there is no evidence of a collision");
  const byId = Object.fromEntries(res.data.map((x) => [x.id, x]));
  assert.equal(byId.s1.v, 9, "falls back to the pre-existing Drive-wins rule");
  assert.equal(byId.s2.v, 2);
});

/* ---------------- Fork id stability ---------------- */

test("forkIdFor is content-derived, so two devices detect the same collision identically", () => {
  assert.equal(S.forkIdFor("s1", { v: 9 }), S.forkIdFor("s1", { v: 9 }));
  assert.notEqual(S.forkIdFor("s1", { v: 9 }), S.forkIdFor("s1", { v: 10 }));
  assert.match(S.forkIdFor("s1", { v: 9 }), /^s1~conflict-[0-9a-f]{8}$/);
});

test("re-running the same sync does not multiply the sibling record", () => {
  const base = [{ id: "s1", name: "A" }];
  const local = [{ id: "s1", name: "B" }];
  const remote = [{ id: "s1", name: "C" }];
  const first = S.reconcileWithBase("br_sessions", base, local, remote);
  const forkId = first.conflicts[0].forkId;
  /* Second sync sees the first sync's output as its new base (as cloud.js
   * records it), so the fork is now an ordinary agreed record. */
  const second = S.reconcileWithBase("br_sessions", first.data, first.data, first.data);
  assert.deepEqual(second.conflicts, [], "a synced fork is stable, not a fresh conflict");
  assert.equal(second.data.filter((x) => x.id === forkId).length, 1);
});

/* ---------------- Conflict stash ---------------- */

test("addConflicts is idempotent per conflict id", () => {
  let stash = S.addConflicts([], [{ id: "br_sessions|s1", recordId: "s1", kind: "edit-vs-edit" }]);
  assert.equal(S.pendingConflicts(stash).length, 1);
  stash = S.addConflicts(stash, [{ id: "br_sessions|s1", recordId: "s1", kind: "edit-vs-edit" }]);
  assert.equal(S.pendingConflicts(stash).length, 1, "re-detecting the same collision updates it");
  stash = S.addConflicts(stash, [{ id: "br_sessions|s2", recordId: "s2", kind: "edit-vs-edit" }]);
  assert.equal(S.pendingConflicts(stash).length, 2);
});

test("addConflicts replaces the entry for a re-detected collision", () => {
  let stash = S.addConflicts([], [{ id: "k|a", recordId: "a", fields: ["x"] }]);
  stash = S.addConflicts(stash, [{ id: "k|a", recordId: "a", fields: ["y"] }]);
  const only = S.pendingConflicts(stash);
  assert.equal(only.length, 1);
  assert.deepEqual(only[0].fields, ["y"]);
});

test("removeConflict drops one entry and keeps the rest", () => {
  const stash = S.addConflicts([], [{ id: "k|a" }, { id: "k|b" }]);
  const after = S.removeConflict(stash, "k|a");
  assert.deepEqual(S.pendingConflicts(after).map((c) => c.id), ["k|b"]);
});

/* ---------------- Resolution ---------------- */

test("resolveConflict 'remote' puts the other device's version at the original id", () => {
  const res0 = S.reconcileWithBase("br_sessions",
    [{ id: "s1", name: "A" }], [{ id: "s1", name: "B" }], [{ id: "s1", name: "C" }]);
  const stash = S.addConflicts([], res0.conflicts);
  const out = S.resolveConflict("br_sessions", res0.data, stash, res0.conflicts[0].id, "remote");
  assert.equal(out.data.length, 1, "the sibling is removed once its content is promoted");
  assert.deepEqual(out.data[0], { id: "s1", name: "C" });
  assert.deepEqual(S.pendingConflicts(out.stash), [], "the conflict is settled");
});

test("resolveConflict 'local' keeps this device's version and drops the sibling", () => {
  const res0 = S.reconcileWithBase("br_sessions",
    [{ id: "s1", name: "A" }], [{ id: "s1", name: "B" }], [{ id: "s1", name: "C" }]);
  const stash = S.addConflicts([], res0.conflicts);
  const out = S.resolveConflict("br_sessions", res0.data, stash, res0.conflicts[0].id, "local");
  assert.equal(out.data.length, 1);
  assert.deepEqual(out.data[0], { id: "s1", name: "B" });
  assert.deepEqual(S.pendingConflicts(out.stash), []);
});

test("resolveConflict 'both' keeps both versions and settles the conflict", () => {
  const res0 = S.reconcileWithBase("br_sessions",
    [{ id: "s1", name: "A" }], [{ id: "s1", name: "B" }], [{ id: "s1", name: "C" }]);
  const stash = S.addConflicts([], res0.conflicts);
  const out = S.resolveConflict("br_sessions", res0.data, stash, res0.conflicts[0].id, "both");
  assert.equal(out.data.length, 2, "choosing 'both' really keeps both");
  assert.deepEqual(S.pendingConflicts(out.stash), []);
});

test("resolveConflict on a tracker log rewrites only the affected date", () => {

  const base = { "2026-01-01": { sessions: { s1: { note: "" } } }, "2026-01-02": { sessions: { s9: { reps: 5 } } } };
  const local = { "2026-01-01": { sessions: { s1: { note: "local note" } } }, "2026-01-02": { sessions: { s9: { reps: 5 } } } };
  const remote = { "2026-01-01": { sessions: { s1: { note: "remote note" } } }, "2026-01-02": { sessions: { s9: { reps: 5 } } } };
  const res0 = S.reconcileWithBase("br_tracker", base, local, remote);
  assert.equal(res0.conflicts.length, 1, "fixture really does conflict");
  const stash = S.addConflicts([], res0.conflicts);
  const out = S.resolveConflict("br_tracker", res0.data, stash, res0.conflicts[0].id, "remote");
  assert.deepEqual(Object.keys(out.data["2026-01-01"].sessions), ["s1"]);
  assert.deepEqual(out.data["2026-01-01"].sessions.s1, { note: "remote note" });
  assert.deepEqual(out.data["2026-01-02"].sessions.s9, { reps: 5 }, "other dates untouched");
});

test("resolveConflict with an unknown id is a no-op on the data", () => {
  const data = [{ id: "s1", v: 1 }];
  const out = S.resolveConflict("br_sessions", data, [], "nope", "remote");
  assert.deepEqual(out.data, data);
});

/* ---------------- Purity / no mutation ---------------- */

test("merge is pure: inputs are not mutated", () => {
  const base = [{ id: "s1", v: 1 }];
  const local = [{ id: "s1", v: 2 }];
  const remote = [{ id: "s1", v: 3 }];
  const snap = JSON.stringify([base, local, remote]);
  S.reconcileWithBase("br_sessions", base, local, remote);
  assert.equal(JSON.stringify([base, local, remote]), snap, "merge must not write through its arguments");
});

test("mergeRecord classifies each side correctly", () => {
  const rec = { id: "x", v: 1 };
  assert.equal(S.mergeRecord(rec, rec, rec).status, "same");
  assert.equal(S.mergeRecord(rec, { id: "x", v: 2 }, rec).status, "local-only");
  assert.equal(S.mergeRecord(rec, rec, { id: "x", v: 2 }).status, "remote-only");
  assert.equal(S.mergeRecord(undefined, { id: "x" }, undefined).status, "local-add");
  assert.equal(S.mergeRecord(undefined, undefined, { id: "x" }).status, "remote-add");
  assert.equal(S.mergeRecord(rec, undefined, undefined).status, "absent");
  assert.equal(S.mergeRecord(rec, { id: "x", v: 2 }, { id: "x", v: 3 }).status, "conflict");
  assert.equal(S.mergeRecord(rec, { id: "x", v: 1, w: 9 }, { id: "x", v: 1, w: 8 }).status, "conflict");
  assert.equal(S.mergeRecord(rec, { id: "x", v: 1, w: 9 }, rec).status, "local-only");
});

test("mergeThreeWay unions disjoint fields and names the contested ones", () => {
  const base = { a: 1, b: 2, c: 3 };
  const clean = S.mergeThreeWay(base, { a: 9, b: 2, c: 3 }, { a: 1, b: 2, c: 8 });
  assert.deepEqual(clean.conflicts, []);
  assert.deepEqual(clean.value, { a: 9, b: 2, c: 8 });

  const contested = S.mergeThreeWay(base, { a: 9, b: 2, c: 3 }, { a: 8, b: 2, c: 8 });
  assert.deepEqual(contested.conflicts, ["a"], "only the field both sides touched is contested");
  assert.equal(contested.value.a, 9, "this device's value is kept in place on a contested field");
  assert.equal(contested.value.c, 8, "a field only the other device touched still unions in");
});

test("mergeThreeWay treats a whole non-object record as one contested value", () => {
  /* An array field has no safe field-level union, so when both devices changed
   * the same array the entire value is contested - not silently unioned and not
   * silently dropped. This is the branch a scalar-only record lands on. */
  const base = { id: "s1", tags: ["a"] };
  const local = { id: "s1", tags: ["a", "b"] };
  const remote = { id: "s1", tags: ["a", "c"] };
  const res = S.mergeThreeWay(base, local, remote);
  assert.deepEqual(res.conflicts, ["tags"], "the array is named as the contested field");
  assert.deepEqual(res.value.tags, ["a", "b"], "this device's array is kept in place");

  /* A record that is itself an array takes the same path. */
  const arrBase = ["a"];
  const arrRes = S.mergeThreeWay(arrBase, ["a", "b"], ["a", "c"]);
  assert.deepEqual(arrRes.conflicts, [""], "a whole-record array contest is a conflict");
  assert.deepEqual(arrRes.value, ["a", "b"]);

  /* Counter-case: only one side changed the array -> no conflict. */
  const oneSided = S.mergeThreeWay(base, { id: "s1", tags: ["a", "b"] }, { id: "s1", tags: ["a"] });
  assert.deepEqual(oneSided.conflicts, [], "a one-sided array edit is not a conflict");
  assert.deepEqual(oneSided.value.tags, ["a", "b"]);
});

test("mergeThreeWay recurses into nested objects and reports dotted paths", () => {
  const base = { sets: { a: { w: 100, r: 5 }, b: { w: 60, r: 8 } } };
  const local = { sets: { a: { w: 100, r: 6 }, b: { w: 60, r: 8 } } };
  const remote = { sets: { a: { w: 105, r: 5 }, b: { w: 60, r: 8 } } };
  const clean = S.mergeThreeWay(base, local, remote);
  assert.deepEqual(clean.conflicts, [], "a nested field each device touched differently still unions");
  assert.deepEqual(clean.value.sets.a, { w: 105, r: 6 });

  const clash = S.mergeThreeWay(base, local, { sets: { a: { w: 100, r: 7 }, b: { w: 60, r: 8 } } });
  assert.deepEqual(clash.conflicts, ["sets.a.r"], "the contested nested path is named");
});
