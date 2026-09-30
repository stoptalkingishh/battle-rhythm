"use strict";
/* Asset-usability tests for the visual plates.
 *
 * tests/data-integrity.test.js already proves every plate *reference* resolves
 * to a file on disk. It does not prove the file is usable: a truncated webp
 * whose first twelve bytes still read RIFF/WEBP passes that check, a 0-byte SVG
 * passes it, and nothing anywhere checks dimensions or aspect ratio. The plates
 * are committed binaries served straight from the repository with no build
 * step, so a bad one ships silently and 404s or squashes a tile in production.
 *
 * These tests decode the shipped assets: real WebP container headers for the AI
 * and ATP images, the SVG root geometry for the generated cards. Only the first
 * few bytes of each webp are read, so the suite does not load ~20 MB to check a
 * header.
 *
 * scripts/import-ai-plates.mjs validates an image at intake (non-zero bytes,
 * magic bytes, extension match). Nothing validated the committed result until
 * this file — a hand-edit to the generated registry.js, or a bad rebase, would
 * have gone unnoticed.
 *
 * Thresholds are set from the measured population, with the slack noted on each
 * assertion. No dependencies.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

/* Load a browser data file and return its `window` shim (same approach as
 * tests/data-integrity.test.js and scripts/generate-workout-cards.mjs). */
function loadWindow(relative) {
  const file = path.join(root, relative);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.window;
}

const plates = Array.from(loadWindow("assets/plates/ai/registry.js").BR_AI_PLATES);
const cards = Array.from(loadWindow("js/data/workout-cards.js").BR_WORKOUT_CARDS);
const atpFigures = loadWindow("js/data/atp-figures.js").BR_ATP_FIGURES;

/* A file of this size or less is a placeholder, not an image. The smallest real
 * asset in the repository is a 2,971-byte SVG; the smallest webp is 7,816. */
const MIN_BYTES = 512;

/** Read at most `bytes` from the start of a file without loading the whole thing. */
function readHead(file, bytes) {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(handle, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Decode a WebP's intrinsic geometry from its container header.
 * Returns `{ format, width, height }`, or throws with the reason a browser
 * would also refuse to render it.
 *
 * Covers the three chunk layouts a committed webp can use: lossy (`VP8 `),
 * lossless (`VP8L`) and extended (`VP8X`, which carries an explicit canvas).
 */
function webpGeometry(relative) {
  const file = path.join(root, relative);
  const size = fs.statSync(file).size;
  if (size < 30) throw new Error(`truncated: ${size} bytes, no room for a WebP header`);

  const head = readHead(file, 32);
  if (head.subarray(0, 4).toString("ascii") !== "RIFF") throw new Error("not a RIFF container");
  if (head.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("RIFF container is not WebP");

  const chunk = head.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    // Flags, 3 reserved bytes, then canvas width-1 and height-1 as 24-bit LE.
    const width = 1 + (head[24] | (head[25] << 8) | (head[26] << 16));
    const height = 1 + (head[27] | (head[28] << 8) | (head[29] << 16));
    return { format: "VP8X", width, height };
  }
  if (chunk === "VP8 ") {
    // 3-byte frame tag, then the 0x9D 0x01 0x2A start code, then 14-bit dimensions.
    if (!(head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a)) {
      throw new Error("VP8 start code missing — the bitstream is not a valid lossy frame");
    }
    return { format: "VP8", width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (head[20] !== 0x2f) throw new Error("VP8L signature byte missing");
    // 14 bits of width-1, then 14 bits of height-1, packed little-endian.
    const bits = head.readUInt32LE(21);
    return { format: "VP8L", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unknown chunk ${JSON.stringify(chunk)} — not VP8, VP8L or VP8X`);
}

/** The root `<svg>` tag's declared geometry, or throws if there is no usable root. */
function svgGeometry(relative) {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, "utf8");
  const rootTag = text.match(/<svg\b[^>]*>/i);
  if (!rootTag) throw new Error("no <svg> root element");

  const attribute = name => {
    const match = rootTag[0].match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i"));
    if (!match) throw new Error(`root <svg> has no ${name} attribute`);
    const value = Number(match[1].trim().replace(/px$/, ""));
    if (!Number.isFinite(value)) throw new Error(`root <svg> ${name}="${match[1]}" is not a number`);
    return value;
  };

  const width = attribute("width");
  const height = attribute("height");
  const box = rootTag[0].match(/\bviewBox\s*=\s*"([^"]+)"/i);
  if (!box) throw new Error("root <svg> has no viewBox");
  const parts = box[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) {
    throw new Error(`root <svg> viewBox="${box[1]}" is not four numbers`);
  }

  return { width, height, viewBox: { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }, text };
}

const ratio = (width, height) => width / height;
const geometry = (width, height) => `${width}x${height}`;

/** Collect `label: reason` strings rather than stopping at the first failure. */
function problemsFor(entries, check) {
  const problems = [];
  for (const [label, value] of entries) {
    try {
      const problem = check(value);
      if (problem) problems.push(`${label}: ${problem}`);
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
    }
  }
  return problems;
}

/* ---------------- AI anatomy plates ---------------- */

test("every AI plate is a decodable WebP with a sane intrinsic geometry", () => {
  // Measured population: all 60 are 1376x768 (1.792), 45,006-116,810 bytes.
  // Bounds are deliberately wide — this catches a corrupt or placeholder file,
  // not a legitimate re-export at a slightly different size.
  assert.ok(plates.length > 0, "registry.js is empty");

  const problems = problemsFor(
    plates.map(plate => [plate.id, plate.webp]),
    relative => {
      if (fs.statSync(path.join(root, relative)).size <= MIN_BYTES) return `file is ${fs.statSync(path.join(root, relative)).size} bytes`;
      const { format, width, height } = webpGeometry(relative);
      if (width < 800 || height < 450) return `geometry ${geometry(width, height)} is below the 800x450 floor (${format})`;
      if (width > 4096 || height > 4096) return `geometry ${geometry(width, height)} exceeds 4096px (${format})`;
      const aspect = ratio(width, height);
      if (aspect < 1.4 || aspect > 2.0) return `aspect ratio ${aspect.toFixed(3)} is outside 1.4-2.0`;
      return null;
    }
  );

  assert.deepEqual(problems, [], `unusable AI plates:\n  ${problems.join("\n  ")}`);
});

test("the AI plates share one geometry — they are generated and imported as a batch", () => {
  // The intake pipeline exports every plate at one size. A single plate at a
  // different size is either a hand-placed file that skipped intake or an
  // export that used the wrong preset; both are worth failing on, and the
  // uniform-geometry invariant makes the tile grid predictable.
  const seen = new Map();
  for (const plate of plates) {
    const { width, height } = webpGeometry(plate.webp);
    const key = geometry(width, height);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(plate.id);
  }

  assert.equal(seen.size, 1, `AI plates use ${seen.size} different geometries:\n  ${[...seen].map(([key, ids]) => `${key}: ${ids.length} plate(s), e.g. ${ids[0]}`).join("\n  ")}`);
});

test("registry.js has no duplicate plate ids or image paths", () => {
  // import-ai-plates.mjs generates this file, so a duplicate means it was
  // hand-edited: the app looks plates up by exercise id, and a duplicate
  // silently shadows the first entry.
  const ids = plates.map(plate => plate.id);
  const paths = plates.map(plate => plate.webp);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], "duplicate ids in registry.js");
  assert.deepEqual(paths.filter((p, index) => paths.indexOf(p) !== index), [], "duplicate webp paths in registry.js");
  assert.deepEqual(plates.filter(plate => !plate.provenance || !plate.provenance.webp).map(plate => plate.id), [], "plates missing provenance");
});

/* ---------------- Generated SVG technical cards ---------------- */

test("every workout card is a usable, self-consistent SVG", () => {
  // Measured population: 79 at 720x420 (1.714) and one at 900x600 (1.500),
  // 2,971-6,870 bytes.
  assert.ok(cards.length > 0, "workout-cards.js is empty");

  const problems = problemsFor(cards.map(card => [card.id, card.src]), relative => {
    const file = path.join(root, relative);
    if (fs.statSync(file).size <= MIN_BYTES) return `file is ${fs.statSync(file).size} bytes`;
    const { width, height, viewBox, text } = svgGeometry(relative);

    // A card whose declared width/height disagrees with its viewBox is drawn
    // stretched: the vector is authored in viewBox units and scaled into the
    // declared box.
    if (Math.abs(ratio(viewBox.width, viewBox.height) - ratio(width, height)) > 0.001) {
      return `viewBox ${viewBox.width}x${viewBox.height} does not match the declared ${width}x${height}`;
    }
    if (viewBox.x !== 0 || viewBox.y !== 0) return `viewBox origin is ${viewBox.x},${viewBox.y}, expected 0,0`;
    if (width < 640 || height < 360) return `geometry ${geometry(width, height)} is below the 640x360 floor`;

    // The generator emits role + aria-labelledby + <title> + <desc> on every
    // card. A card missing them is announced as an unlabelled image.
    if (!/\brole\s*=\s*"img"/i.test(text.match(/<svg\b[^>]*>/i)[0])) return 'root <svg> has no role="img"';
    if (!/<title\b/i.test(text)) return "no <title> element";
    if (!/<desc\b/i.test(text)) return "no <desc> element";
    return null;
  });

  assert.deepEqual(problems, [], `unusable SVG cards:\n  ${problems.join("\n  ")}`);
});

test("SVG card geometry is one of the two known sizes", () => {
  // The current generator hardcodes 720x420 for every card. s1-deadlift is
  // 900x600, so it cannot have come from the current generator — a stale or
  // hand-authored card. It is listed here rather than blessed silently: a third
  // geometry appearing is a failing test, not a surprise in production.
  const known = new Set(["720x420", "900x600"]);
  const seen = new Map();
  for (const card of cards) {
    const { width, height } = svgGeometry(card.src);
    const key = geometry(width, height);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(card.id);
  }

  const unknown = [...seen.keys()].filter(key => !known.has(key));
  assert.deepEqual(unknown, [], `cards at an undocumented geometry:\n  ${unknown.map(key => `${key}: ${seen.get(key).join(", ")}`).join("\n  ")}`);
  assert.deepEqual([...seen.keys()].sort(), [...known].sort(), "the documented geometry set no longer matches what is on disk");
});

test("every exercise with an SVG fallback has a real file at the generated path", () => {
  // The fallback is addressed by convention, not by a manifest entry:
  // assets/plates/svg/<exercise id>.svg. A missing file is a broken tile.
  const exercises = Array.from(loadWindow("js/data/exercises.js").BR_EXERCISES);
  const problems = problemsFor(exercises.map(exercise => [exercise.id, `assets/plates/svg/${exercise.id}.svg`]), relative => {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return "file is missing";
    if (fs.statSync(file).size <= MIN_BYTES) return `file is ${fs.statSync(file).size} bytes`;
    const { width, height } = svgGeometry(relative);
    return width > 0 && height > 0 ? null : "zero geometry";
  });
  assert.deepEqual(problems, [], `broken SVG fallbacks:\n  ${problems.join("\n  ")}`);
});

/* ---------------- Official ATP 7-22.02 figures ---------------- */

test("every referenced ATP figure is a decodable WebP", () => {
  // Measured population: 191 referenced figures, all `VP8 `, 7,816-196,514
  // bytes, from 580x871 up to 1804x2286 — plus a 1732x134 strip and a
  // 1439x1954 portrait. These are cropped from a PDF page, so their aspect
  // ratios legitimately range from 0.518 to 12.9 and no ratio bound is
  // asserted here.
  const referenced = [...new Set(Object.values(atpFigures))];
  assert.ok(referenced.length > 0, "atp-figures.js is empty");

  const problems = problemsFor(referenced.map(figure => [figure, `assets/plates/atp/${figure}.webp`]), relative => {
    const file = path.join(root, relative);
    if (fs.statSync(file).size <= MIN_BYTES) return `file is ${fs.statSync(file).size} bytes`;
    const { format, width, height } = webpGeometry(relative);
    if (width < 64 || height < 64) return `geometry ${geometry(width, height)} is below the 64x64 floor (${format})`;
    if (width > 4096 || height > 4096) return `geometry ${geometry(width, height)} exceeds 4096px (${format})`;
    return null;
  });

  assert.deepEqual(problems, [], `unusable ATP figures:\n  ${problems.join("\n  ")}`);
});

test("the plate population is non-trivial — a broken scan cannot pass vacuously", () => {
  // If the manifests stop loading, every loop above iterates nothing and the
  // suite goes green having verified nothing.
  assert.ok(plates.length >= 40, `expected at least 40 registered AI plates, found ${plates.length}`);
  assert.ok(cards.length >= 60, `expected at least 60 workout cards, found ${cards.length}`);
  assert.ok(Object.keys(atpFigures).length >= 100, `expected at least 100 ATP figure mappings, found ${Object.keys(atpFigures).length}`);
});