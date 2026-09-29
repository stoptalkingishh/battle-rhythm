"use strict";
/* Cross-reference integrity tests for the declarative data blobs under js/data/.
 *
 * These files are UMD-ish scripts that assign to `window.BR_*` globals, so they
 * are loaded through a vm context with a `window` shim — the same approach
 * scripts/generate-workout-cards.mjs uses to read the exercise source.
 *
 * Line-by-line assertions on data blobs are the wrong goal; what actually
 * breaks is a dangling or colliding reference. Both libraries are concatenated
 * into a single array in js/app.js and looked up by id, so an id collision
 * between them is a real runtime bug, not a style issue.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

/* Load a browser data file and return its `window` shim. */
function loadWindow(relative) {
  const file = path.join(root, relative);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.window;
}

/* Re-home a vm-realm array into this realm.
 *
 * A vm context has its own Array.prototype, so deepStrictEqual rejects the
 * result of `vmArray.map(...)` even when every element matches — it compares
 * prototypes. Array.from (called from this realm) allocates a local array.
 */
function list(value) {
  return Array.from(value);
}

const exercises = list(loadWindow("js/data/exercises.js").BR_EXERCISES);
const atpExercises = list(loadWindow("js/data/exercises-atp.js").BR_ATP_EXERCISES);
const components = list(loadWindow("js/data/doctrine.js").BR_DOCTRINE.components);
const guides = loadWindow("js/data/movement-guides.js").BR_MOVEMENT_GUIDES;
const cards = list(loadWindow("js/data/workout-cards.js").BR_WORKOUT_CARDS);
const plates = list(loadWindow("assets/plates/ai/registry.js").BR_AI_PLATES);
const atpFigures = loadWindow("js/data/atp-figures.js").BR_ATP_FIGURES;
const presets = list(loadWindow("js/data/preset-workouts.js").BR_PRESET_WORKOUTS);

const exerciseIds = exercises.map(e => e.id);
const atpIds = atpExercises.map(e => e.id);
const allIds = new Set([...exerciseIds, ...atpIds]);
const componentIds = new Set(components.map(c => c.id));

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

/* ---------------- Identity and collisions ---------------- */

test("exercise ids are unique within exercises.js", () => {
  assert.deepEqual(duplicates(exerciseIds), [], "duplicate ids in js/data/exercises.js");
});

test("exercise ids are unique within exercises-atp.js", () => {
  assert.deepEqual(duplicates(atpIds), [], "duplicate ids in js/data/exercises-atp.js");
});

test("no id collisions across the two exercise libraries", () => {
  // Both files are concatenated into one array in js/app.js and looked up by
  // id, so a shared id means one entry silently shadows the other.
  const collisions = exerciseIds.filter(id => atpIds.includes(id));
  assert.deepEqual(collisions, [], "id present in both exercises.js and exercises-atp.js");
});

test("the two exercise libraries stay disjoint and non-empty", () => {
  assert.ok(exercises.length > 0, "exercises.js is empty");
  assert.ok(atpExercises.length > 0, "exercises-atp.js is empty");
});

/* ---------------- Schema ---------------- */

test("every exercise carries the required schema fields, non-empty and correctly typed", () => {
  const required = ["id", "name", "component", "equipment", "muscles", "programming", "safety", "source"];
  const problems = [];
  for (const exercise of [...exercises, ...atpExercises]) {
    for (const field of required) {
      const value = exercise[field];
      if (typeof value !== "string" || !value.trim()) {
        problems.push(`${exercise.id}.${field}: expected a non-empty string, got ${JSON.stringify(value)}`);
      }
    }
    if (!Array.isArray(exercise.cues) || !exercise.cues.length) {
      problems.push(`${exercise.id}.cues: expected a non-empty array, got ${JSON.stringify(exercise.cues)}`);
    } else if (exercise.cues.some(cue => typeof cue !== "string" || !cue.trim())) {
      problems.push(`${exercise.id}.cues: every cue must be a non-empty string`);
    }
  }
  assert.deepEqual(problems, [], `schema violations:\n  ${problems.join("\n  ")}`);
});

test("every exercise component is one of the six H2F component ids", () => {
  assert.equal(componentIds.size, 6, "doctrine.js should define exactly six H2F components");
  const bad = [...exercises, ...atpExercises]
    .filter(e => !componentIds.has(e.component))
    .map(e => `${e.id} -> "${e.component}"`);
  assert.deepEqual(bad, [], `unknown component ids:\n  ${bad.join("\n  ")}`);
});

/* ---------------- Dangling references ---------------- */

test("every movement-guide key resolves to a real exercise id", () => {
  const dangling = Object.keys(guides).filter(id => !allIds.has(id));
  assert.deepEqual(dangling, [], "movement guides pointing at unknown exercises");
});

test("every workout-card id exists in exercises.js and has its SVG file", () => {
  const unknown = cards.map(c => c.id).filter(id => !exerciseIds.includes(id));
  assert.deepEqual(unknown, [], "workout cards referencing unknown exercises");

  const missingFile = cards.filter(card => !fs.existsSync(path.join(root, card.src))).map(card => card.id);
  assert.deepEqual(missingFile, [], "workout cards whose SVG is not on disk");
});

test("every exercise in exercises.js has a generated SVG plate on disk", () => {
  // A no-build Pages deploy serves these straight from the repo, so a missing
  // file is a broken exercise tile in production.
  const missing = exerciseIds.filter(id => !fs.existsSync(path.join(root, "assets/plates/svg", `${id}.svg`)));
  assert.deepEqual(missing, [], "exercises without an SVG fallback plate");
});

test("every AI plate id exists in exercises.js and its image is on disk", () => {
  const unknown = plates.map(p => p.id).filter(id => !exerciseIds.includes(id));
  assert.deepEqual(unknown, [], "AI plates referencing unknown exercises");

  const missingFile = plates.filter(plate => !fs.existsSync(path.join(root, plate.webp))).map(plate => plate.id);
  assert.deepEqual(missingFile, [], "AI plates whose webp is not on disk");
});

test("every ATP figure reference resolves to a real file under assets/plates/atp/", () => {
  const entries = Object.entries(atpFigures);
  assert.ok(entries.length > 0, "atp-figures.js is empty");

  const missing = entries
    .filter(([, figure]) => !fs.existsSync(path.join(root, "assets/plates/atp", `${figure}.webp`)))
    .map(([id, figure]) => `${id} -> ${figure}.webp`);
  assert.deepEqual(missing, [], "ATP figure references with no image on disk");

  const dangling = entries.map(([id]) => id).filter(id => !allIds.has(id));
  assert.deepEqual(dangling, [], "ATP figures keyed by unknown exercise id");
});

/* ---------------- Presets ---------------- */

test("preset workouts have unique ids and a valid focus component", () => {
  assert.deepEqual(duplicates(presets.map(p => p.id)), [], "duplicate preset workout ids");
  const bad = presets.filter(p => !componentIds.has(p.focus)).map(p => `${p.id} -> "${p.focus}"`);
  assert.deepEqual(bad, [], `presets with an unknown focus component:\n  ${bad.join("\n  ")}`);
});
