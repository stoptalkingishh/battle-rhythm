"use strict";
/* Unit tests for the pure superset-grouping helpers (js/data/supersets.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const BR = require("../js/data/supersets.js");

/* Ordered session items, each with an id and (defaulted) superset field. */
function items(...ids) {
  return ids.map((id) => ({ id, superset: "" }));
}

function idsOf(list) {
  return list.map((e) => e.id);
}

test("pairAdjacent: two adjacent items pair into one group, order preserved", () => {
  const input = items("A", "B", "C");
  const { items: out, groupId, adjacent } = BR.pairAdjacent(input, 0, 1);
  assert.equal(adjacent, true);
  assert.equal(typeof groupId, "string");
  assert.ok(groupId.length > 0);
  assert.deepEqual(idsOf(out), ["A", "B", "C"], "original order preserved");
  assert.equal(out[0].superset, groupId);
  assert.equal(out[1].superset, groupId);
  assert.equal(out[2].superset, "", "non-member untouched");
  /* Purity: the input array and its items are not mutated. */
  assert.equal(input[0].superset, "");
  assert.equal(input[1].superset, "");
});

test("pairAdjacent: three adjacent items pair into ONE group by merging", () => {
  const input = items("A", "B", "C");
  const first = BR.pairAdjacent(input, 0, 1);
  const merged = BR.pairAdjacent(first.items, 1, 2);
  assert.equal(merged.adjacent, true);
  const g = merged.groupId;
  assert.deepEqual(merged.items.map((e) => e.superset), [g, g, g],
    "all three share a single group id (existing group merges)");
  assert.deepEqual(idsOf(merged.items), ["A", "B", "C"]);
});

test("pairAdjacent: non-adjacent items are rejected with a flag (no group created)", () => {
  const input = items("A", "B", "C");
  const res = BR.pairAdjacent(input, 0, 2);
  assert.equal(res.adjacent, false);
  assert.equal(res.groupId, null);
  assert.deepEqual(idsOf(res.items), ["A", "B", "C"]);
  assert.deepEqual(res.items.map((e) => e.superset), ["", "", ""],
    "nothing grouped when adjacency is violated");
  /* Out-of-range index is also non-adjacent/invalid. */
  const bad = BR.pairAdjacent(input, 0, 9);
  assert.equal(bad.adjacent, false);
  assert.equal(bad.groupId, null);
});

test("pairAdjacent: caller-supplied groupId takes precedence", () => {
  const input = items("A", "B", "C");
  const res = BR.pairAdjacent(input, 1, 2, "bench+curl");
  assert.equal(res.adjacent, true);
  assert.equal(res.groupId, "bench+curl");
  assert.deepEqual(res.items.map((e) => e.superset), ["", "bench+curl", "bench+curl"]);
});

test("unpair: splitting one member out leaves the other(s) as a group", () => {
  const input = items("A", "B", "C");
  const trio = BR.pairAdjacent(BR.pairAdjacent(input, 0, 1).items, 1, 2).items;
  const g = trio[0].superset;
  const { items: out, groupId, members } = BR.unpair(trio, 0);
  assert.equal(out[0].superset, "", "unpaired member cleared");
  assert.equal(out[1].superset, g, "remaining member keeps the group");
  assert.equal(out[2].superset, g, "remaining member keeps the group");
  assert.equal(groupId, g, "group still exists after one member leaves");
  assert.deepEqual(members, [1, 2], "reports which members remain");
  assert.deepEqual(idsOf(out), ["A", "B", "C"], "order preserved");
});

test("unpair: removing the last of a pair dissolves the group", () => {
  const input = items("A", "B", "C");
  const pair = BR.pairAdjacent(input, 0, 1);
  const { items: out, groupId, members } = BR.unpair(pair.items, 0);
  const second = BR.unpair(out, 1);
  assert.equal(second.groupId, null, "no group left once fewer than two remain");
  assert.deepEqual(second.members, []);
});

test("unpair: a member with no group is a no-op", () => {
  const input = items("A", "B");
  const res = BR.unpair(input, 0);
  assert.equal(res.groupId, null);
  assert.deepEqual(idsOf(res.items), ["A", "B"]);
});

test("unpairGroup: dissolves the whole group", () => {
  const input = items("A", "B", "C");
  const merged = BR.pairAdjacent(
    BR.pairAdjacent(input, 0, 1).items, 1, 2).items;
  const g = merged[0].superset;
  const { items: out } = BR.unpairGroup(merged, g);
  assert.deepEqual(out.map((e) => e.superset), ["", "", ""], "every member cleared");
  assert.deepEqual(idsOf(out), ["A", "B", "C"]);
  /* Pure: original still carries the group. */
  assert.equal(merged[0].superset, g);
});

test("groupOf / groupMembers / isTrivial report membership accurately", () => {
  const input = items("A", "B", "C");
  const pair = BR.pairAdjacent(input, 0, 1);
  const g = pair.groupId;
  assert.equal(BR.groupOf(pair.items, 0), g);
  assert.equal(BR.groupOf(pair.items, 2), "", "ungrouped item reports empty");
  assert.deepEqual(BR.groupMembers(pair.items, g), [0, 1], "contiguous members");
  assert.deepEqual(BR.groupMembers(pair.items, "nope"), []);
  assert.equal(BR.isTrivial(pair.items, 0), false, "two-member group is not trivial");
  assert.deepEqual(idsOf(pair.items), ["A", "B", "C"]);
});

test("group-of-one is trivial and dissolves to no superset via cleanup", () => {
  const input = items("A", "B");
  const pair = BR.pairAdjacent(input, 0, 1);
  const g = pair.groupId;
  const { items: afterUnpair } = BR.unpair(pair.items, 0);
  /* One lone item still carries the group id. */
  assert.equal(afterUnpair[1].superset, g);
  assert.equal(BR.isTrivial(afterUnpair, 1), true, "lone member is a trivial group");
  const cleaned = BR.cleanup(afterUnpair);
  assert.deepEqual(cleaned.map((e) => e.superset), ["", ""],
    "cleanup removes the group-of-one superset id");
  assert.deepEqual(BR.groupMembers(cleaned, g), [], "group no longer exists");
});

test("cleanup: also drops empty and orphaned (non-adjacent) ids", () => {
  const input = items("A", "B", "C", "D");
  const a = BR.pairAdjacent(input, 0, 1).items;      // A,B grouped
  const c = BR.pairAdjacent(input, 2, 3, "pp").items; // C,D grouped "pp"
  /* Reorder conceptually: force a lone "pp" on D with no adjacent partner. */
  const lone = c.map((e, i) => (i === 3 ? { ...e, superset: "pp" } : e));
  const out = BR.cleanup([...lone.slice(0, 3), lone[1]]);
  assert.equal(out[3].superset, "", "orphaned lone id cleared");
  const empty = BR.cleanup(items("X", "Y"));
  assert.deepEqual(empty.map((e) => e.superset), ["", ""]);
});

test("roundOrder lays out back-to-back work across rounds", () => {
  assert.deepEqual(BR.roundOrder(["A", "B"], 1), ["A", "B"]);
  assert.deepEqual(BR.roundOrder(["A", "B"], 2), ["A", "B", "A", "B"],
    "members alternate back-to-back per round");
  assert.deepEqual(BR.roundOrder(["A", "B", "C"], 1), ["A", "B", "C"]);
  assert.deepEqual(BR.roundOrder(["A", "B"], 0), ["A", "B"],
    "rounds default to at least one");
  assert.deepEqual(BR.roundOrder([], 3), []);
  assert.deepEqual(BR.roundOrder(null, 2), []);
});