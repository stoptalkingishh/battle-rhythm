"use strict";
/* Unit tests for the pure muscle-group taxonomy (js/data/muscle-groups.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MG = require("../js/data/muscle-groups.js");

test("parseMusclesText splits primary and secondary on the ';' convention", () => {
  const groups = MG.parseMusclesText("Hamstrings, glutes, back; secondary quads, grip");
  assert.deepEqual(groups.primary.sort(), ["back", "glutes", "hamstrings"]);
  assert.deepEqual(groups.secondary.sort(), ["forearms", "quads"]);
});

test("parseMusclesText handles synonyms and multi-word aliases", () => {
  const g = MG.parseMusclesText("Pecs, upper back, lower leg");
  assert.deepEqual(g.primary.sort(), ["back", "calves", "chest"]);
  const noSecondary = MG.parseMusclesText("Chest");
  assert.deepEqual(noSecondary.primary, ["chest"]);
  assert.deepEqual(noSecondary.secondary, []);
  assert.deepEqual(MG.parseMusclesText(""), { primary: [], secondary: [] });
});

test("musclesOf prefers explicit muscleTargets over the text", () => {
  const explicit = MG.musclesOf({ muscleTargets: { primary: ["quads"], secondary: ["core"] } });
  assert.deepEqual(explicit.primary, ["quads"]);
  const fromText = MG.musclesOf({ muscles: "Quads, core" });
  assert.deepEqual(fromText.primary.sort(), ["core", "quads"]);
  assert.deepEqual(MG.musclesOf({}), { primary: [], secondary: [] });
});

test("matchesMuscles filters an exercise by a canonical id", () => {
  const ex = { muscles: "Chest, triceps; secondary shoulders" };
  assert.equal(MG.matchesMuscles(ex, "chest"), true);
  assert.equal(MG.matchesMuscles(ex, "triceps"), true);
  assert.equal(MG.matchesMuscles(ex, "shoulders"), true);
  assert.equal(MG.matchesMuscles(ex, "back"), false);
  assert.equal(MG.matchesMuscles(ex, ""), true);
});

test("isValid and labelOf over the taxonomy", () => {
  assert.equal(MG.isValid("quads"), true);
  assert.equal(MG.isValid("bogus"), false);
  assert.equal(MG.labelOf("quads"), "Quads");
  assert.equal(MG.labelOf("bogus"), "bogus");
  assert.equal(MG.MUSCLES.length, 16);
});

test("loadOf aggregates weight × reps into muscle groups", () => {
  const entries = [
    { muscles: "Quads, glutes", sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] },
    { muscles: "Chest; secondary triceps", sets: [{ w: 80, r: 10, done: true }, { w: 80, r: 10, done: false }] }
  ];
  const load = MG.loadOf(entries);
  assert.equal(load.quads, 1000);
  assert.equal(load.glutes, 1000);
  assert.equal(load.chest, 800, "only completed sets count");
  assert.equal(load.triceps, 800);
});

test("levelsOf bins loads into 0..3 by thresholds", () => {
  const load = { a: 0, b: 100, c: 300, d: 300 };
  const levels = MG.levelsOf(load, [100, 200, 300]);
  assert.equal(levels.a, 0);
  assert.equal(levels.b, 1);
  assert.equal(levels.c, 3);
  assert.deepEqual(MG.levelsOf({}), {});
});