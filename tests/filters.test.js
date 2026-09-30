"use strict";
/* Unit tests for the query predicates (js/data/filters.js) using only Node
 * built-ins. Run: node --test tests/
 *
 * These decide what the Library and the session list show, so the assertions
 * are about the exact rules: which fields a search covers, how the alias
 * vocabulary rewrites a query, and that an empty group means "everything"
 * rather than "nothing".
 *
 * Two quirks are pinned deliberately because they are load-bearing:
 *   - alias expansion is case-sensitive; callers lowercase the query first
 *   - patterns apply in array order, so "db " is rewritten after /dumbbell/ has
 *     already run and only affects a trailing-space "db "
 * Changing either is a behaviour change, not a cleanup.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/data/filters.js");

const ALL = { q: "", component: "all", aft: "all", equipment: "all" };

function ex(overrides) {
  return Object.assign({
    id: "e1",
    name: "Deadlift",
    component: "muscular-strength",
    equipment: "Barbell",
    muscles: "Hamstrings, glutes",
    drill: "Free Weight Core",
    cues: ["Bar over mid-foot", "Drive through heels"],
    programming: "2-6 sets x up to 6 reps",
    aft: ["MDL"]
  }, overrides || {});
}

/* ---------------- expandAliases ---------------- */

test("expandAliases: each shorthand rewrites to its canonical term", () => {
  assert.equal(F.expandAliases("medball"), "medicine ball");
  assert.equal(F.expandAliases("med ball"), "medicine ball");
  assert.equal(F.expandAliases("tricep"), "triceps");
  assert.equal(F.expandAliases("lat pulldown"), "lat pulldown");
  assert.equal(F.expandAliases("latpull down"), "lat pulldown");
  assert.equal(F.expandAliases("ohp"), "overhead push-press");
  assert.equal(F.expandAliases("overhead press"), "overhead push-press");
  assert.equal(F.expandAliases("bw"), "bodyweight");
  assert.equal(F.expandAliases("pullup"), "pull-up");
  assert.equal(F.expandAliases("pull up"), "pull-up");
  assert.equal(F.expandAliases("sqt"), "squat");
  assert.equal(F.expandAliases("squats"), "squat");
});

test("expandAliases: a query with no shorthand is returned unchanged", () => {
  assert.equal(F.expandAliases("deadlift"), "deadlift");
  assert.equal(F.expandAliases(""), "");
});

test("expandAliases is case-sensitive — callers must lowercase first", () => {
  // filterExercises does f.q.toLowerCase(). Pin the raw behaviour so nobody
  // "fixes" it into an incompatible change.
  assert.equal(F.expandAliases("O.H.P"), "O.H.P");
  assert.equal(F.expandAliases("Tricep"), "Tricep");
  assert.equal(F.expandAliases("tricep"), "triceps");
});

test("expandAliases: /g replaces every occurrence, not just the first", () => {
  assert.equal(F.expandAliases("tricep tricep tricep"), "triceps triceps triceps");
  assert.equal(F.expandAliases("bw bw"), "bodyweight bodyweight");
});

test("expandAliases: patterns apply in array order, so a later one sees rewritten text", () => {
  // /dumbbell/ -> "dumbbell" is a no-op, then /"db "/ -> "dumbbell" rewrites a
  // "db " that the first pass could not have produced.
  //
  // The replacement swallows the trailing space, which is a pre-existing bug
  // (filed as #29): "db curl" expands to "dumbbellcurl", which matches
  // nothing, while "db  curl" with two spaces expands correctly. Pinned as-is
  // because a pure extraction must not change behaviour.
  assert.equal(F.expandAliases("db curl"), "dumbbellcurl");
  assert.equal(F.expandAliases("db  curl"), "dumbbell curl");
  // No trailing space: the /db / pattern does not fire, so it survives.
  assert.equal(F.expandAliases("dbcurl"), "dbcurl");
  // "bw" inside a longer word is rewritten too — the pattern has no boundary.
  assert.equal(F.expandAliases("bwcurl"), "bodyweightcurl");
});

/* ---------------- matchesExercise / filterExercises ---------------- */

test("matchesExercise: a fully-open filter matches anything", () => {
  assert.equal(F.matchesExercise(ex(), ALL), true);
  assert.equal(F.matchesExercise(ex(), {}), true, "absent fields mean no restriction");
  assert.equal(F.matchesExercise(ex(), undefined), true);
});

test("matchesExercise: the three dropdown facets are exact matches", () => {
  const e = ex();
  assert.equal(F.matchesExercise(e, { component: "muscular-strength" }), true);
  assert.equal(F.matchesExercise(e, { component: "power" }), false);
  assert.equal(F.matchesExercise(e, { equipment: "Barbell" }), true);
  assert.equal(F.matchesExercise(e, { equipment: "barbell" }), false, "equipment match is case-sensitive like the dropdown values");
  assert.equal(F.matchesExercise(e, { aft: "MDL" }), true);
  assert.equal(F.matchesExercise(e, { aft: "HRP" }), false);
});

test("matchesExercise: the AFT facet matches any event in the exercise's list", () => {
  const e = ex({ aft: ["MDL", "SDC"] });
  assert.equal(F.matchesExercise(e, { aft: "SDC" }), true);
  assert.equal(F.matchesExercise(e, { aft: "PLK" }), false);
  assert.equal(F.matchesExercise(ex({ aft: [] }), { aft: "MDL" }), false);
  assert.equal(F.matchesExercise(ex({ aft: undefined }), { aft: "MDL" }), false);
});

test("matchesExercise: the query searches name, muscles, drill, equipment, cues and programming", () => {
  const e = ex();
  assert.equal(F.matchesExercise(e, { q: "deadlift" }), true, "name");
  assert.equal(F.matchesExercise(e, { q: "hamstrings" }), true, "muscles");
  assert.equal(F.matchesExercise(e, { q: "free weight" }), true, "drill");
  assert.equal(F.matchesExercise(e, { q: "barbell" }), true, "equipment");
  assert.equal(F.matchesExercise(e, { q: "mid-foot" }), true, "cues");
  assert.equal(F.matchesExercise(e, { q: "6 reps" }), true, "programming");
  assert.equal(F.matchesExercise(e, { q: "kettlebell" }), false);
});

test("matchesExercise: the query is lowercased before alias expansion and matching", () => {
  assert.equal(F.matchesExercise(ex({ cues: ["Grip the triceps area"] }), { q: "TRICEP" }), true);
  assert.equal(F.matchesExercise(ex(), { q: "DEADLIFT" }), true);
});

test("matchesExercise: facets and query are ANDed", () => {
  const e = ex();
  assert.equal(F.matchesExercise(e, { component: "muscular-strength", q: "deadlift" }), true);
  assert.equal(F.matchesExercise(e, { component: "muscular-strength", q: "squat" }), false);
  assert.equal(F.matchesExercise(e, { component: "power", q: "deadlift" }), false);
});

test("filterExercises: preserves order, filters by predicate, and tolerates junk input", () => {
  const list = [
    ex({ id: "a", name: "Deadlift", component: "muscular-strength" }),
    ex({ id: "b", name: "Power Jump", component: "power", equipment: "Bodyweight", aft: [] }),
    ex({ id: "c", name: "Pull-Up", component: "muscular-endurance", equipment: "Pull-up bar" })
  ];
  assert.deepEqual(F.filterExercises(list, ALL).map(e => e.id), ["a", "b", "c"]);
  assert.deepEqual(F.filterExercises(list, { component: "power" }).map(e => e.id), ["b"]);
  assert.deepEqual(F.filterExercises(list, { q: "pull" }).map(e => e.id), ["c"], "only Pull-Up contains 'pull'");
  assert.deepEqual(F.filterExercises(list, { q: "db row" }), [], "'db row' expands to 'dumbbellrow' — the space-eating bug, pinned");
  assert.deepEqual(F.filterExercises([], ALL), []);
  assert.deepEqual(F.filterExercises(undefined, ALL), []);
  assert.deepEqual(F.filterExercises(list, { q: "nothing matches this" }), []);
});

test("haystack: exposes the searched fields, lowercased, and no others", () => {
  const hay = F.haystack(ex({ id: "zzz", source: "QUOTE: something" }));
  assert.ok(hay.includes("deadlift"));
  assert.ok(hay.includes("hamstrings"));
  assert.ok(hay.includes("free weight core"));
  assert.ok(hay.includes("barbell"));
  assert.ok(hay.includes("bar over mid-foot"));
  assert.ok(hay.includes("2-6 sets"));
  assert.ok(!hay.includes("zzz"), "the id is not searchable");
  assert.ok(!hay.includes("quote: something"), "the source is not searchable");
  assert.equal(hay, hay.toLowerCase());
});

/* ---------------- sessionTags / allTags ---------------- */

test("sessionTags: stringifies, trims and drops blanks", () => {
  assert.deepEqual(F.sessionTags({ tags: [" a ", "b", "", "   "] }), ["a", "b"]);
  assert.deepEqual(F.sessionTags({ tags: ["a", null, undefined, 3] }), ["a", "3"], "nullish entries are dropped, not stringified (#30)");
  assert.deepEqual(F.sessionTags({ tags: [] }), []);
  assert.deepEqual(F.sessionTags({}), []);
  assert.deepEqual(F.sessionTags(null), []);
});

test("sessionTags: nullish entries are rejected before stringification", () => {
  // String(null) is "null" and truthy, so filtering after String() would keep
  // it. The whole point of #30 is that a nullish tag must never surface as a
  // visible tag named "null".
  assert.deepEqual(F.sessionTags({ tags: [null] }), []);
  assert.deepEqual(F.sessionTags({ tags: [undefined] }), []);
  assert.deepEqual(F.sessionTags({ tags: ["a", null, 3] }), ["a", "3"]);
  assert.deepEqual(F.sessionTags({ tags: [null, "   ", undefined, ""] }), [], "nullish and blank entries both go");
  // Only nullish is dropped — other falsy-but-real tags still stringify.
  assert.deepEqual(F.sessionTags({ tags: [0, false] }), ["0", "false"]);
});

test("allTags: distinct across sessions, sorted, blanks ignored", () => {
  const sessions = [
    { tags: ["strength", "am"] },
    { tags: ["am", "  pm  "] },
    { tags: ["", "   "] },
    {},
    { tags: ["ruck"] }
  ];
  assert.deepEqual(F.allTags(sessions), ["am", "pm", "ruck", "strength"]);
  assert.deepEqual(F.allTags([]), []);
  assert.deepEqual(F.allTags(undefined), []);
});

test("allTags: can never emit the strings \"null\" or \"undefined\" (#30)", () => {
  // allTags() builds the tag list shown in the Builder; a "null" chip there
  // becomes a group filter value that matches nothing meaningful.
  const sessions = [
    { tags: [null, undefined] },
    { tags: ["a", null] },
    { tags: [undefined, "a"] },
    { tags: [null, " ", undefined] }
  ];
  const tags = F.allTags(sessions);
  assert.deepEqual(tags, ["a"]);
  assert.ok(!tags.includes("null"));
  assert.ok(!tags.includes("undefined"));
});

/* ---------------- matchesGroup ---------------- */

test("matchesGroup: no group, or a group with no tags, matches everything", () => {
  const s = { tags: ["strength"] };
  assert.equal(F.matchesGroup(s, null), true);
  assert.equal(F.matchesGroup(s, undefined), true);
  assert.equal(F.matchesGroup(s, {}), true);
  assert.equal(F.matchesGroup(s, { tags: [] }), true);
});

test("matchesGroup: a group matches on any tag in common", () => {
  assert.equal(F.matchesGroup({ tags: ["strength", "am"] }, { tags: ["am"] }), true);
  assert.equal(F.matchesGroup({ tags: ["strength", "am"] }, { tags: ["pm", "am"] }), true, "any, not all");
  assert.equal(F.matchesGroup({ tags: ["strength"] }, { tags: ["pm", "ruck"] }), false);
  assert.equal(F.matchesGroup({}, { tags: ["pm"] }), false);
  assert.equal(F.matchesGroup({ tags: [" am "] }, { tags: ["am"] }), true, "both sides are trimmed");
});

/* ---------------- isPreset ---------------- */

test("isPreset: matches on id against the supplied presets", () => {
  const presets = [{ id: "pw-1" }, { id: "pw-2" }];
  assert.equal(F.isPreset({ id: "pw-1" }, presets), true);
  assert.equal(F.isPreset({ id: "custom-1" }, presets), false);
  assert.equal(F.isPreset({ id: "pw-1" }, []), false);
  assert.equal(F.isPreset({ id: "pw-1" }, undefined), false);
});

/* ---------------- purity ---------------- */

test("the predicates do not mutate their inputs", () => {
  const list = [ex({ id: "a" }), ex({ id: "b", tags: ["t"] })];
  const filter = { q: "deadlift", component: "all", aft: "all", equipment: "all" };
  const before = JSON.stringify({ list: list, filter: filter });
  F.filterExercises(list, filter);
  F.allTags(list);
  F.sessionTags(list[1]);
  F.matchesGroup(list[1], { tags: ["t"] });
  F.isPreset(list[0], [{ id: "a" }]);
  assert.equal(JSON.stringify({ list: list, filter: filter }), before);
});

test("the alias table is exposed for inspection and stays in order", () => {
  assert.ok(Array.isArray(F.ALIASES));
  assert.ok(F.ALIASES.length >= 10);
  F.ALIASES.forEach((pair, i) => {
    assert.ok(pair[0] instanceof RegExp, `ALIASES[${i}] pattern is a RegExp`);
    assert.equal(typeof pair[1], "string", `ALIASES[${i}] replacement is a string`);
    assert.ok(pair[0].global, `ALIASES[${i}] uses /g so it replaces every occurrence`);
  });
  assert.equal(F.ALIASES[0][1], "medicine ball", "order matters and is part of the contract");
});