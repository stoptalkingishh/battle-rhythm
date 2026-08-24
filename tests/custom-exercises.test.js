"use strict";
/* Unit tests for the pure custom-exercise helpers (js/data/custom-exercises.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/data/custom-exercises.js");

function idsOf(list) { return list.map((e) => e.id); }

test("make: requires a name, rejects without one", () => {
  assert.equal(C.make({}), null);
  assert.equal(C.make({ name: "   " }), null);
  assert.equal(C.make(null), null);
  assert.equal(C.make("not an object"), null);
});

test("make: normalizes all fields and forces custom sentinels", () => {
  const e = C.make({
    id: "cx-1",
    name: "  Sandbag  Carry  ",
    equipment: " Sandbag ",
    muscles: "Grip, core; secondary shoulders",
    cues: [" Walk tall ", "", "stay braced"],
    notes: "  Long   carries   ",
    programming: " 3-5 x 40m  "
  });
  assert.ok(e);
  assert.equal(e.name, "Sandbag Carry");
  assert.equal(e.equipment, "Sandbag");
  assert.equal(e.component, C.COMPONENT);
  assert.equal(e.source, "custom");
  assert.deepEqual(e.cues, ["Walk tall", "stay braced"], "empty/blank cues dropped");
  assert.equal(e.notes, "Long carries");
  assert.equal(e.programming, "3-5 x 40m");
  assert.ok(e.createdAt && e.updatedAt);
});

test("make: generates an id and timestamps when absent", () => {
  const e = C.make({ name: "Farmers Walk" });
  assert.ok(/^cx/.test(e.id), "id prefixed with cx");
  assert.ok(e.id.length > 2);
  assert.ok(e.createdAt);
});

test("upsert: appends a new exercise without mutating the input", () => {
  const list = [{ id: "cx-a", name: "A" }];
  const before = list[0].name;
  const { list: out, changed, entry, updated } = C.upsert(list, {
    id: "cx-b", name: "B"
  });
  assert.equal(changed, true);
  assert.equal(updated, false);
  assert.equal(entry.id, "cx-b");
  assert.deepEqual(idsOf(out), ["cx-a", "cx-b"]);
  assert.equal(list.length, 1, "input untouched");
  assert.equal(before, "A");
});

test("upsert: replaces by id, preserving original createdAt on update", () => {
  const list = [C.make({ id: "cx-x", name: "Old", createdAt: "2020-01-01T00:00:00Z" })];
  const origCreated = list[0].createdAt;
  const { changed, updated, entry } = C.upsert(list, { id: "cx-x", name: "New Name" });
  assert.equal(changed, true);
  assert.equal(updated, true);
  assert.equal(entry.name, "New Name");
  assert.equal(entry.createdAt, origCreated, "createdAt preserved on update");
  assert.equal(list.length, 1, "no duplicate row");
});

test("upsert: rejects unusable input (no change)", () => {
  const { changed, entry } = C.upsert([{ id: "cx-a", name: "A" }], {});
  assert.equal(changed, false);
  assert.equal(entry, null);
});

test("remove: drops by id; reports changed", () => {
  const list = [{ id: "cx-a", name: "A" }, { id: "cx-b", name: "B" }];
  const r1 = C.remove(list, "cx-a");
  assert.equal(r1.changed, true);
  assert.deepEqual(idsOf(r1.list), ["cx-b"]);
  const r2 = C.remove(list, "cx-nope");
  assert.equal(r2.changed, false);
  assert.deepEqual(idsOf(r2.list), ["cx-a", "cx-b"]);
  assert.equal(list.length, 2, "input untouched");
});

test("findById: matches by id, returns null when absent", () => {
  const list = [{ id: "cx-a", name: "A" }];
  assert.equal(C.findById(list, "cx-a").name, "A");
  assert.equal(C.findById(list, "missing"), null);
  assert.equal(C.findById([], "cx-a"), null);
});

test("uniqueId: de-duplicates colliding ids, keeps first occurrence", () => {
  const list = [{ id: "cx-a", name: "A1" }, { id: "cx-a", name: "A2" }, { id: "cx-b", name: "B" }];
  const out = C.uniqueId(list);
  assert.equal(out.length, 3);
  assert.equal(idsOf(out).filter((x) => x === "cx-a").length, 1, "collision resolved");
  assert.equal(out[0].id, "cx-a", "first occurrence keeps the id");
  assert.ok(/^cx/.test(out[1].id));
  assert.equal(out[1].id !== "cx-a", true);
  assert.equal(list[1].id, "cx-a", "input not mutated");
});

test("matches: case-insensitive substring over name/equipment/muscles/notes", () => {
  const list = [
    { id: "cx-a", name: "Sandbag Carry", equipment: "Sandbag", muscles: "", notes: "" },
    { id: "cx-b", name: "Row", equipment: "Kettlebell", muscles: "Back; secondary grip", notes: "" },
    { id: "cx-c", name: "Plank", equipment: "Bodyweight", muscles: "Core", notes: "hold 60s" }
  ];
  assert.deepEqual(idsOf(C.matches(list, "sandbag")), ["cx-a"]);
  assert.deepEqual(idsOf(C.matches(list, "GRIP")), ["cx-b"], "muscles field searched");
  assert.deepEqual(idsOf(C.matches(list, "kettle")), ["cx-b"], "equipment searched");
  assert.deepEqual(idsOf(C.matches(list, "60S")), ["cx-c"], "notes searched");
  assert.deepEqual(idsOf(C.matches(list, "")), ["cx-a", "cx-b", "cx-c"], "empty matches all");
  assert.deepEqual(idsOf(C.matches(list, "zzz")), []);
});

test("sortByRecency: newest updated first, ties by createdAt desc", () => {
  const list = [
    { id: "a", updatedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" },
    { id: "b", updatedAt: "2024-03-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" },
    { id: "c", updatedAt: "2024-02-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" }
  ];
  assert.deepEqual(idsOf(C.sortByRecency(list)), ["b", "c", "a"]);
  assert.deepEqual(idsOf(C.sortByRecency([])), []);
});

test("splitMuscles: splits on ';' and strips a secondary keyword", () => {
  assert.deepEqual(C.splitMuscles("Hamstrings, glutes; secondary quads, grip"), {
    primary: "Hamstrings, glutes",
    secondary: "quads, grip"
  });
  assert.deepEqual(C.splitMuscles("Core"), { primary: "Core", secondary: "" });
  assert.deepEqual(C.splitMuscles(""), { primary: "", secondary: "" });
  assert.deepEqual(C.splitMuscles("  Grip ; focus: core  "), {
    primary: "Grip",
    secondary: "core"
  });
});

test("toLibraryExercise: emits an EX-compatible object", () => {
  const e = C.make({ id: "cx-9", name: "Sled Push", equipment: "Sled", cues: ["Drive"], muscles: "Quads; secondary calves" });
  const lib = C.toLibraryExercise(e);
  assert.equal(lib.id, "cx-9");
  assert.equal(lib.name, "Sled Push");
  assert.equal(lib.equipment, "Sled");
  assert.equal(lib.component, "custom");
  assert.equal(lib.source, "custom");
  assert.equal(lib.drill, "Custom");
  assert.deepEqual(lib.aft, []);
  assert.deepEqual(lib.cues, ["Drive"]);
  assert.equal(lib.muscles, "Quads; secondary calves", "free-text preserved for muscle-groups parse");
  assert.equal(C.toLibraryExercise(null), null);
});

/* Round-trip: a custom exercise produced by make() flows straight into the
 * library lookup shape, mirroring how app.js concatenates the lists. */
test("custom exercise integrates with EX-style lookup (find across concat)", () => {
  const builtins = [{ id: "s1-deadlift", name: "Deadlift" }];
  const mine = C.toLibraryExercise(C.make({ name: "Ruck Carry", equipment: "Ruck pack" }));
  const EX = builtins.concat([mine]);
  const found = EX.find((x) => x.id === mine.id);
  assert.equal(found.name, "Ruck Carry");
  assert.equal(found.component, "custom");
  assert.ok(EX.some((x) => x.id === mine.id));
});