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
/* ---------------- Parity with the doctrine library (issue #9) ---------------- */

test("make: carries component, cues, programming and safety like a doctrine exercise", () => {
  const e = C.make({
    name: "Sandbag Clean",
    equipment: "Sandbag",
    muscles: "Quads, glutes; secondary back",
    component: "muscular-strength",
    cues: ["Drop the bag", "Catch it in a squat"],
    programming: "5 x 3 @ 60s",
    safety: "Keep the load close; no twisting"
  });
  assert.equal(e.component, "muscular-strength", "a real H2F component id is settable");
  assert.deepEqual(e.cues, ["Drop the bag", "Catch it in a squat"]);
  assert.equal(e.programming, "5 x 3 @ 60s");
  assert.equal(e.safety, "Keep the load close; no twisting");
});

test("toComponent: accepts the six H2F ids in any case/spacing, sentinel otherwise", () => {
  C.COMPONENTS.forEach((id) => {
    assert.equal(C.toComponent(id), id, id + " accepted verbatim");
    assert.equal(C.toComponent(id.toUpperCase()), id, id + " case-insensitive");
    assert.equal(C.toComponent("  " + id.replace(/-/g, " ") + "  "), id, id + " spaced");
  });
  assert.equal(C.toComponent(""), C.COMPONENT, "blank -> sentinel");
  assert.equal(C.toComponent(null), C.COMPONENT);
  assert.equal(C.toComponent("strongman"), C.COMPONENT, "unknown component rejected");
  assert.equal(C.toComponent("<script>"), C.COMPONENT);
  assert.equal(C.make({ name: "x", component: "nope" }).component, C.COMPONENT);
});

test("toAft: keeps the five known codes upper-cased and de-duplicated", () => {
  assert.deepEqual(C.toAft(["plk", "MDL", "plk"]), ["PLK", "MDL"], "order of first appearance");
  assert.deepEqual(C.toAft("mdl, sdc"), ["MDL", "SDC"], "loose string accepted");
  assert.deepEqual(C.toAft(["XYZ"]), [], "unknown code dropped, not thrown");
  assert.deepEqual(C.toAft(null), []);
  assert.equal(C.make({ name: "x", aft: ["hrp", "bogus"] }).aft.join(","), "HRP");
});

test("toPlateUrl: keeps loadable images only", () => {
  assert.equal(C.toPlateUrl("https://example.com/a.webp"), "https://example.com/a.webp");
  assert.equal(C.toPlateUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(C.toPlateUrl("data:image/svg+xml,%3Csvg%3E"), "data:image/svg+xml,%3Csvg%3E");
  assert.equal(C.toPlateUrl("javascript:alert(1)"), "", "script url rejected");
  assert.equal(C.toPlateUrl("data:text/html;base64,AAAA"), "", "non-image data uri rejected");
  assert.equal(C.toPlateUrl("assets/plates/custom/foo.png"), "", "repo-relative path rejected — it could only 404");
  assert.equal(C.toPlateUrl("not a url"), "");
  assert.equal(C.toPlateUrl("  "), "");
});

test("make: never lets input forge a doctrine source or citation", () => {
  const e = C.make({
    name: "Sneaky",
    source: "QUOTE: FM 7-22 para 6-16",
    citation: "FM 7-22, Table 6-4",
    drill: "Free Weight Core"
  });
  assert.equal(e.source, C.SOURCE, "source forced to the custom sentinel");
  assert.equal(e.citation, "", "citation forced empty — no doctrine claim");
  const lib = C.toLibraryExercise(e);
  assert.equal(lib.source, C.SOURCE);
  assert.equal(lib.citation, "");
  assert.equal(lib.drill, C.DRILL, "drill stays the Custom sentinel, not a doctrine drill");
});

test("isCustom: distinguishes a custom record from a doctrine exercise", () => {
  assert.equal(C.isCustom(C.make({ name: "Mine" })), true);
  assert.equal(C.isCustom({ source: "QUOTE: FM 7-22 para 6-16" }), false);
  assert.equal(C.isCustom(null), false);
});

test("plateFor: a user image wins, else a generated card; never null", () => {
  const mine = C.make({ name: "Sled Push", equipment: "Sled", muscles: "Quads" });
  const generated = C.plateFor(mine);
  assert.ok(generated.src.startsWith("data:image/svg+xml"), "generic card is an inline svg");
  assert.match(generated.alt, /not doctrine/i, "generated card is labelled non-doctrinal");
  assert.equal(C.plateFor(null), null);

  const withPlate = C.make({ name: "Sled Push", plateUrl: "https://example.com/s.png" });
  const chosen = C.plateFor(withPlate);
  assert.equal(chosen.src, "https://example.com/s.png", "user image preferred over the generated card");
  assert.match(chosen.alt, /user-supplied/i);
});

test("genericCard: embeds the exercise's own fields and marks them non-doctrinal", () => {
  const svg = decodeURIComponent(C.genericCard({
    name: "Sandbag Carry", equipment: "Sandbag", muscles: "Grip, core"
  }).src.replace("data:image/svg+xml;charset=utf-8,", ""));
  assert.match(svg, /Sandbag Carry/);
  assert.match(svg, /Sandbag/);
  assert.match(svg, /Grip, core/);
  assert.match(svg, /NOT DOCTRINE/);
  assert.match(svg, /viewBox="0 0 720 420"/, "same geometry as the committed svg cards");
});

test("genericCard: escapes markup in user text so a name cannot inject svg", () => {
  const svg = decodeURIComponent(C.genericCard({
    name: '<script>alert("x")</script>', equipment: "A & B", muscles: ""
  }).src.replace("data:image/svg+xml;charset=utf-8,", ""));
  assert.ok(!svg.includes("<script>"), "no raw script element in the card");
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /A &amp; B/);
});

test("genericCard: clips an over-long name instead of overflowing the card", () => {
  const long = "S".repeat(200);
  const svg = decodeURIComponent(C.genericCard({ name: long }).src.replace("data:image/svg+xml;charset=utf-8,", ""));
  assert.ok(!svg.includes(long), "the full 200-char name is not embedded verbatim");
  assert.match(svg, /…/, "clipped with an ellipsis");
});

test("toLibraryExercise: emits the full doctrine-shaped field set", () => {
  const e = C.make({
    id: "cx-1", name: "Sled Push", equipment: "Sled", component: "power",
    cues: ["Drive"], safety: "Clear lane", programming: "6 x 20m",
    muscles: "Quads; secondary calves", aft: ["sdc"]
  });
  const lib = C.toLibraryExercise(e);
  /* The same keys a doctrine exercise in js/data/exercises.js carries. */
  ["id", "name", "component", "equipment", "muscles", "cues", "programming", "safety", "source", "citation", "drill", "aft", "plate"]
    .forEach((field) => {
      assert.ok(Object.prototype.hasOwnProperty.call(lib, field), "lib." + field + " present");
    });
  assert.equal(lib.component, "power");
  assert.equal(lib.safety, "Clear lane");
  assert.deepEqual(lib.aft, ["SDC"]);
  assert.equal(lib.citation, "", "no citation — the doctrine/custom distinction");
  assert.ok(lib.plate.src, "a plate always resolves for a custom exercise");
});

test("toLibraryExercise: an empty custom record still yields a renderable plate", () => {
  const lib = C.toLibraryExercise(C.make({ name: "Bare" }));
  assert.ok(lib.plate && lib.plate.src, "no plateUrl still renders a card");
  assert.equal(lib.component, C.COMPONENT);
  assert.deepEqual(lib.cues, []);
  assert.deepEqual(lib.aft, []);
});

test("matches: safety, programming and cues are searchable", () => {
  const list = [C.make({
    id: "cx-a", name: "Carry", safety: "Watch the load", programming: "5 x 40m", cues: ["Stand tall"]
  })];
  assert.equal(C.matches(list, "load").length, 1, "safety searched");
  assert.equal(C.matches(list, "40m").length, 1, "programming searched");
  assert.equal(C.matches(list, "stand tall").length, 1, "cues searched");
  assert.equal(C.matches(list, "nothing").length, 0);
});
