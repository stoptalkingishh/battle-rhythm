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
/* UMD files, not window-assigning scripts: loadWindow() would find nothing,
 * because their `root` is the vm global rather than our `window` shim. */
const aftResults = require("../js/data/aft-results.js");
const CUST = require("../js/data/custom-exercises.js");

const exerciseIds = exercises.map(e => e.id);
const atpIds = atpExercises.map(e => e.id);
const allIds = new Set([...exerciseIds, ...atpIds]);
const componentIds = new Set(components.map(c => c.id));

/* The doctrine exercise schema, as one reusable contract.
 *
 * The point of extracting it is the custom-exercise section at the bottom: a
 * custom entry claiming "parity" is only parity if it satisfies the *same*
 * function the doctrine libraries are held to, not a lookalike list. Add a
 * required field here and both libraries are held to it.
 */
const REQUIRED_FIELDS = ["id", "name", "component", "equipment", "muscles", "programming", "safety", "source"];

function schemaProblems(exercise, opts) {
  const required = (opts && opts.required) || REQUIRED_FIELDS;
  const problems = [];
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
  return problems;
}

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
  const problems = [...exercises, ...atpExercises].flatMap(e => schemaProblems(e));
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

/* ---------------- Custom exercises (issue #9) ----------------
 *
 * A custom exercise is user-authored, so it is validated against the doctrine
 * schema by CONSTRUCTION rather than by the same sweep: make() coerces every
 * field and the fixtures below are the shape a fully-filled form produces.
 * The tests that matter are the ones that can fail —
 *   - a fixture set that genuinely satisfies the shared schemaProblems()
 *     contract, so "parity" is a checked claim;
 *   - the guard that the duplicated COMPONENTS / AFT_CODES lists have not
 *     drifted from doctrine.js / aft-results.js;
 *   - the guard that a custom entry can never assert a doctrine citation.
 */

/* A fully-populated custom exercise, as the add form now produces it. */
const customFixtures = [
  CUST.make({
    id: "cx-fixture-1",
    name: "Sandbag Clean",
    equipment: "Sandbag",
    muscles: "Quads, glutes; secondary upper back",
    component: "muscular-strength",
    cues: ["Drop the bag between the feet", "Catch it in a squat"],
    programming: "5 x 3 @ 60s rest",
    safety: "Keep the load close; no twisting under load",
    aft: ["MDL"]
  }),
  CUST.make({
    id: "cx-fixture-2",
    name: "Lateral Lunge",
    equipment: "Kettlebell",
    muscles: "Quads, glutes; secondary core",
    component: "mobility-stability",
    cues: ["Step wide", "Sit over the bent leg"],
    programming: "3 x 8 per side",
    safety: "Knee tracks over the second toe",
    plateUrl: "https://example.com/plates/lateral-lunge.png"
  })
];

test("the custom-exercise fixtures satisfy the same schema contract as the doctrine libraries", () => {
  assert.ok(customFixtures.length >= 2, "fixture set must not be empty (a vacuous pass proves nothing)");
  // `source` is the one field a custom entry may not fill: it is the sentinel,
  // which is a non-empty string, so the shared contract still applies verbatim.
  const problems = customFixtures.flatMap(e => schemaProblems(CUST.toLibraryExercise(e)));
  assert.deepEqual(problems, [], `custom-exercise schema violations:\n  ${problems.join("\n  ")}`);
});

test("a custom exercise exposes the descriptive fields a doctrine exercise has", () => {
  // The doctrine shape, minus `source` (which custom cannot claim) and plus the
  // plate. If a doctrine field is ever added here, parity breaks and this fails.
  const doctrineFields = ["id", "name", "component", "equipment", "muscles", "cues", "programming", "safety", "source", "drill"];
  const lib = CUST.toLibraryExercise(customFixtures[0]);
  const missing = doctrineFields.filter(f => !Object.prototype.hasOwnProperty.call(lib, f));
  assert.deepEqual(missing, [], `custom library shape missing: ${missing.join(", ")}`);
});

test("a custom component is one of the six H2F component ids, or the custom sentinel", () => {
  const bad = customFixtures.map(CUST.toLibraryExercise)
    .filter(lib => lib.component !== CUST.COMPONENT && !componentIds.has(lib.component))
    .map(lib => `${lib.id} -> "${lib.component}"`);
  assert.deepEqual(bad, [], `custom exercises with an unknown component:\n  ${bad.join("\n  ")}`);
});

test("BR_CUSTOM.COMPONENTS has not drifted from doctrine.js", () => {
  assert.deepEqual(new Set(CUST.COMPONENTS), componentIds,
    "js/data/custom-exercises.js COMPONENTS must equal doctrine.js BR_DOCTRINE.components ids");
});

test("BR_CUSTOM.AFT_CODES has not drifted from aft-results.js", () => {
  assert.deepEqual(new Set(CUST.AFT_CODES), new Set(aftResults.EVENTS.map(e => e.code)),
    "js/data/custom-exercises.js AFT_CODES must equal aft-results.js EVENTS codes");
});

test("a custom AFT code is one of the five real scoring events", () => {
  const real = new Set(aftResults.EVENTS.map(e => e.code));
  const bad = customFixtures.flatMap(e => e.aft)
    .filter(code => !real.has(code))
    .map(code => `"${code}"`);
  assert.deepEqual(bad, [], `custom exercises citing an AFT event that does not exist: ${bad.join(", ")}`);
});

test("no custom exercise asserts a doctrine citation", () => {
  const libEntries = customFixtures.map(CUST.toLibraryExercise);
  const withCitation = libEntries.filter(e => e.citation && e.citation.trim())
    .map(e => `${e.id} -> ${e.citation}`);
  assert.deepEqual(withCitation, [], `custom exercises carrying a citation: ${withCitation.join(", ")}`);
  const badSource = libEntries.filter(e => e.source !== CUST.SOURCE)
    .map(e => `${e.id} -> "${e.source}"`);
  assert.deepEqual(badSource, [], `custom exercises with a non-custom source: ${badSource.join(", ")}`);
  const badDrill = libEntries.filter(e => e.drill !== CUST.DRILL)
    .map(e => `${e.id} -> "${e.drill}"`);
  assert.deepEqual(badDrill, [], `custom exercises filed under a doctrine drill: ${badDrill.join(", ")}`);
});

test("make() refuses to let an input record forge doctrine provenance", () => {
  const forged = CUST.make({
    name: "Sneaky",
    source: "QUOTE: FM 7-22 para 6-16",
    citation: "FM 7-22, Table 6-4",
    drill: "Free Weight Core"
  });
  assert.equal(forged.source, CUST.SOURCE, "input source discarded");
  assert.equal(forged.citation, "", "input citation discarded");
});

test("every custom exercise resolves a plate, and never onto a committed plate asset", () => {
  // A custom id is in none of the doctrine plate tables, so the tier that
  // serves it is the exercise's own `plate`. If a custom entry could resolve
  // a repo path under assets/plates/, a user could shadow a doctrinal figure.
  const libEntries = customFixtures.map(CUST.toLibraryExercise);
  const noPlate = libEntries.filter(e => !e.plate || !e.plate.src)
    .map(e => e.id);
  assert.deepEqual(noPlate, [], `custom exercises with no plate: ${noPlate.join(", ")}`);
  const shadow = libEntries.filter(e => !/^(data:image\/|https?:\/\/)/.test(e.plate.src))
    .map(e => `${e.id} -> ${e.plate.src}`);
  assert.deepEqual(shadow, [], `custom plates pointing outside data:/http(s): ${shadow.join(", ")}`);
});

test("a custom id can never collide with a doctrine exercise id", () => {
  const customIds = customFixtures.map(e => e.id);
  const collisions = customIds.filter(id => allIds.has(id));
  assert.deepEqual(collisions, [], "a custom id must not shadow a doctrine exercise");
  // And the generator's prefix keeps generated ids out of the doctrine namespace.
  assert.ok(/^cx/.test(CUST.genId()), "generated custom ids carry the cx prefix");
  assert.equal(customIds.some(id => allIds.has(id)), false);
});

/* ---------------- Plate resolution (exercise-coach.workoutCard) ----------------
 *
 * js/exercise-coach.js is a browser IIFE, not a window-assigning data script,
 * so it is loaded into a vm whose `window` is the shim carrying the four plate
 * tables. workoutCard() touches no DOM, which is what makes it testable here.
 */
function loadCoach(overrides) {
  const win = Object.assign({
    BR_MUSCLE_MAPS: {},
    BR_WORKOUT_CARDS: {},
    BR_AI_PLATES: [],
    BR_ATP_FIGURES: {},
    BR_ATPF: (id) => `assets/plates/atp/${win.BR_ATP_FIGURES[id]}.webp`
  }, overrides || {});
  const context = { window: win };
  const file = path.join(root, "js/exercise-coach.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return win.BRExerciseCoach;
}

test("a custom exercise resolves its own plate, and a doctrine plate still outranks it", () => {
  const withFigures = loadCoach({ BR_ATP_FIGURES: { "s1-deadlift": "fig-1" } });
  const custom = CUST.toLibraryExercise(customFixtures[0]);
  const resolved = withFigures.workoutCard(custom);
  assert.ok(resolved && resolved.src, "a custom exercise always resolves a plate");
  assert.equal(resolved.src, custom.plate.src, "the custom plate tier is reached");
  assert.match(resolved.alt, /not doctrine/i, "and it says so in the alt text");

  // The documented precedence is first-match-wins: an official ATP figure must
  // still beat an exercise that also carries a `plate`.
  const hybrid = { id: "s1-deadlift", name: "Deadlift", plate: { src: "data:image/svg+xml,x" } };
  const official = withFigures.workoutCard(hybrid);
  assert.equal(official.src, "assets/plates/atp/fig-1.webp", "the ATP figure outranks exercise.plate");
});

test("plate precedence across all four tiers is unchanged for doctrine exercises", () => {
  const coach = loadCoach({
    BR_ATP_FIGURES: { a: "fig-a" },
    BR_AI_PLATES: [{ id: "b", webp: "assets/plates/ai/b.webp" }],
    BR_WORKOUT_CARDS: [{ id: "c", src: "assets/plates/svg/c.svg" }]
  });
  assert.equal(coach.workoutCard({ id: "a", name: "A" }).src, "assets/plates/atp/fig-a.webp", "1. ATP figure");
  assert.equal(coach.workoutCard({ id: "b", name: "B" }).src, "assets/plates/ai/b.webp", "2. AI plate");
  assert.equal(coach.workoutCard({ id: "c", name: "C" }).src, "assets/plates/svg/c.svg", "3. SVG card");
  assert.equal(coach.workoutCard({ id: "zz", name: "Z" }), undefined, "4. nothing, for an exercise with no plate");
  // 4b. the exercise's own plate, which is the tier custom exercises live on.
  assert.equal(coach.workoutCard({ id: "zz", name: "Z", plate: { src: "https://x/y.png" } }).src,
    "https://x/y.png");
});

test("every custom-exercise fixture survives the real coach, plate and all", () => {
  const coach = loadCoach();
  for (const fixture of customFixtures) {
    const lib = CUST.toLibraryExercise(fixture);
    const resolved = coach.workoutCard(lib);
    assert.ok(resolved && resolved.src, fixture.id + " resolves a plate through the coach");
  }
});

/* The full render path, driven against a minimal DOM shim — the same
 * bespoke-shim precedent as tests/timer-recovery.test.js. render() is what the
 * app actually calls for a custom exercise (there is no movement guide keyed
 * by a cx- id), so this asserts the acceptance criterion end to end: a plate
 * <img> and a safety block reach the DOM. Only createElement is needed: the
 * no-guide branch never builds the SVG diagram. */
function shimEl(tag) {
  return {
    tagName: String(tag).toLowerCase(), className: "", textContent: "", innerHTML: "",
    children: [], attrs: {}, src: "", alt: "", type: "", listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    classList: {
      _cls: new Set(),
      add(...c) { c.forEach((x) => this._cls.add(x)); },
      remove(c) { this._cls.delete(c); },
      contains(c) { return this._cls.has(c); },
      toggle(c, f) { if (f === undefined) { this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c); } else if (f) { this._cls.add(c); } else { this._cls.delete(c); } }
    },
    appendChild(c) { this.children.push(c); return c; },
    replaceWith() {}, replaceChild() {}, remove() {},
    querySelector() { return null; }
  };
}

function flattenText(node) {
  return [node.textContent].concat(node.children.map(flattenText)).join(" ").replace(/\s+/g, " ");
}

function findAll(node, pred, out) {
  out = out || [];
  if (pred(node)) out.push(node);
  node.children.forEach((c) => findAll(c, pred, out));
  return out;
}

test("the movement guide for a custom exercise renders a plate and its safety notes", () => {
  const context = { window: { BR_MUSCLE_MAPS: {}, BR_WORKOUT_CARDS: {}, BR_AI_PLATES: [], BR_ATP_FIGURES: {} },
                    document: { createElement: shimEl, createElementNS: (ns, t) => shimEl(t) } };
  const file = path.join(root, "js/exercise-coach.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  const coach = context.window.BRExerciseCoach;

  const lib = CUST.toLibraryExercise(customFixtures[0]);
  // app.js passes GUIDES[ex.id]; there is no guide for a custom id.
  const section = coach.render(lib, undefined);

  const imgs = findAll(section, (n) => n.tagName === "img");
  assert.ok(imgs.length >= 1, "a custom exercise renders a plate <img>");
  assert.ok(imgs[0].src.startsWith("data:image/svg+xml"), "and it is the generated generic card");
  assert.match(imgs[0].alt, /not doctrine/i, "the alt text marks it non-doctrinal");

  const warnings = findAll(section, (n) => String(n.className).includes("coach-warning"));
  assert.ok(warnings.length === 1, "a safety block is rendered without a movement guide");
  assert.match(flattenText(warnings[0]), /Keep the load close/, "carrying the user's safety notes");
  assert.match(flattenText(section), /Drop the bag between the feet/, "and the form cues");
});
