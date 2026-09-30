"use strict";
/* Pure helpers for custom, user-created exercises in Battle Rhythm (loads as
 * window.BR_CUSTOM in the browser and via require in node:test).
 *
 * Battle Rhythm ships a fixed library (window.BR_EXERCISES, plus the ATP
 * set in BR_ATP_EXERCISES). This module lets the user author their own
 * exercises and have them flow through the same lookup path. A custom
 * exercise is a privacy-local, Drive-synced record:
 *
 *   br_custom_exercises = [ { id, name, equipment, muscles, cues, notes,
 *                             programming, safety, component, aft, plateUrl,
 *                             source, createdAt, updatedAt } ]
 *
 * The list is merged like the other id-keyed arrays by sync-core's mergeById
 * (remote-wins on collision, local-only rows kept), exactly like br_bodyweight.
 * Only side-effect-free logic lives here; reading localStorage and writing
 * through Drive sync stay in app.js.
 *
 * Parity with the doctrine library
 * --------------------------------
 * A custom exercise now carries the same descriptive fields a doctrine
 * exercise does, so it renders through the same code paths:
 *
 *   - `muscles` is the free-text "primary; secondary" string that
 *     js/data/muscle-groups.js already understands via its parseMusclesText
 *     / musclesOf helpers — so custom exercises light up the body map and
 *     muscle filters with no new code;
 *   - `component` is a real H2F component id (see COMPONENTS below) so the
 *     component badge, the component filter and the phase grouping work
 *     unchanged. Anything unrecognized falls back to the "custom" sentinel;
 *   - `cues`, `programming` and `safety` carry the same free text a doctrine
 *     exercise does, and js/exercise-coach.js reads them from the same fields;
 *   - `aft` maps to the same five AFT event codes, validated against AFT_CODES;
 *   - `plateUrl` is a user-supplied image (an http(s) URL or an image data:
 *     URI). With no plateUrl, plateFor() generates a generic SVG
 *     card from the exercise's own fields, so every custom exercise renders a
 *     plate and never reaches a broken <img>.
 *
 * What stays deliberately different: `source` is forced to the "custom"
 * sentinel and `citation` is forced to the empty string. Doctrine exercises
 * carry a real citation ("QUOTE: FM 7-22 para 6-16"); a custom exercise can
 * carry none, and that absence IS the distinction — no citation means no
 * doctrine claim. `drill` likewise stays the "Custom" sentinel, because
 * filing a user movement under a named doctrine drill would be exactly such a
 * claim.
 *
 * COMPONENTS and AFT_CODES below are the only identifiers duplicated from
 * other modules (js/data/doctrine.js and js/data/aft-results.js). They are
 * kept here deliberately rather than injected, so the module stays a pure
 * zero-dependency UMD file; tests/data-integrity.test.js asserts both lists
 * still equal their canonical source, so a drift upstream fails CI instead of
 * silently going stale.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_CUSTOM = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var COMPONENT = "custom";
  var SOURCE = "custom";
  var DRILL = "Custom";
  /* The six H2F component ids (mirrors js/data/doctrine.js BR_DOCTRINE.components). */
  var COMPONENTS = [
    "muscular-strength",
    "muscular-endurance",
    "aerobic-endurance",
    "anaerobic-endurance",
    "power",
    "mobility-stability"
  ];
  /* The five AFT scoring event codes (mirrors js/data/aft-results.js EVENTS). */
  var AFT_CODES = ["MDL", "HRP", "SDC", "PLK", "2MR"];
  /* Plate images: repo-relative paths, http(s) URLs, and image data: URIs. */
  var IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  function str(v) { return String(v == null ? "" : v).trim(); }

  /* Collapse inner whitespace runs and trim, so "  Row  &nbsp;  Pulley " ->
   * "Row  Pulley". Pass a separator to keep single spaces, e.g. for prose. */
  function normalize(s, keepSpace) {
    s = str(s);
    return keepSpace ? s.replace(/\s+/g, " ") : s.replace(/\s+/g, " ").trim();
  }

  function genId() {
    return "cx" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() { return new Date().toISOString(); }

  /* Coerce cues to an array of non-empty trimmed strings; null/[] when none. */
  function toCues(v) {
    if (v == null) return [];
    var arr = Array.isArray(v) ? v : [v];
    var out = arr.map(function (c) { return normalize(c); }).filter(function (c) { return c !== ""; });
    return out;
  }

  /* A component is settable only when it is one of the six H2F ids; anything
   * else (including blank) keeps the "custom" sentinel, so a typo can never
   * produce a badge-less exercise that silently drops out of the filters. */
  function toComponent(v) {
    var c = normalize(v).toLowerCase().replace(/\s+/g, "-");
    return COMPONENTS.indexOf(c) === -1 ? COMPONENT : c;
  }

  /* AFT codes are upper-cased, de-duplicated, order-preserving, and filtered
   * to the five known events. Unknown codes are dropped rather than rejected,
   * so an exercise with a bad code still saves. */
  function toAft(v) {
    if (v == null) return [];
    var arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/);
    var out = [];
    arr.forEach(function (code) {
      var c = str(code).toUpperCase();
      if (AFT_CODES.indexOf(c) !== -1 && out.indexOf(c) === -1) out.push(c);
    });
    return out;
  }

  /* A plate reference is usable only if it is an image the page can actually
   * load: an http(s) URL or a base64/URL-encoded image data: URI. A bare
   * repo-relative path is deliberately NOT accepted — the site is deployed
   * from this repository with no build step, so a user has no way to get a
   * file under assets/plates/ onto it, and such a path could only ever 404.
   * Anything else (javascript:, an HTML document, a bare word) is dropped, so
   * the value is always safe to hand to <img src>. */
  function toPlateUrl(v) {
    var u = str(v);
    if (!u) return "";
    if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(u)) return u;
    if (/^https?:\/\/\S+$/i.test(u)) return u;
    return "";
  }

  function isCustom(entry) {
    return !!entry && str(entry.source) === SOURCE;
  }

  /* Validate and normalise one custom exercise. Returns a clean record, or
   * null when unusable. Only `name` is required. Every other field is
   * coerced (never rejected outright) so a partially-filled form still saves.
   * `source` and `citation` are never taken from the input: a user-authored
   * record can make no doctrine claim. */
  function make(record) {
    if (!isObj(record)) return null;
    var name = normalize(record.name);
    if (name === "") return null;
    var equipment = normalize(record.equipment);
    var muscles = normalize(record.muscles);
    var notes = normalize(record.notes, true);
    var programming = normalize(record.programming, true);
    var safety = normalize(record.safety, true);
    var createdAt = str(record.createdAt);
    var updatedAt = str(record.updatedAt);
    return {
      id: str(record.id) || genId(),
      name: name,
      equipment: equipment,
      muscles: muscles,
      cues: toCues(record.cues),
      notes: notes,
      programming: programming,
      safety: safety,
      component: toComponent(record.component),
      aft: toAft(record.aft),
      plateUrl: toPlateUrl(record.plateUrl),
      source: SOURCE,
      citation: "",
      createdAt: createdAt || record.createdAt || nowISO(),
      updatedAt: updatedAt || nowISO()
    };
  }

  /* Insert a new custom exercise or replace an existing one by id. Never
   * mutates the input; returns the new list plus a flag and the normalized
   * entry so the caller knows what changed. */
  function upsert(list, record) {
    var entry = make(record);
    if (!entry) return { list: list || [], changed: false, entry: null };
    var out = (list || []).slice();
    var idx = -1;
    for (var i = 0; i < out.length; i++) {
      if (out[i] && out[i].id === entry.id) { idx = i; break; }
    }
    /* Preserve the original createdAt when updating an existing row. */
    if (idx >= 0) entry.createdAt = out[idx].createdAt || entry.createdAt;
    if (idx >= 0) out[idx] = entry; else out.push(entry);
    return { list: out, changed: true, entry: entry, updated: idx >= 0 };
  }

  function remove(list, id) {
    var out = (list || []).filter(function (x) { return !(x && String(x.id) === String(id)); });
    return { list: out, changed: out.length !== (list || []).length };
  }

  function findById(list, id) {
    var found = null;
    (list || []).forEach(function (x) {
      if (!found && x && String(x.id) === String(id)) found = x;
    });
    return found;
  }

  /* Enforce unique ids defensively (e.g. after a merge that raced two gens).
   * Rows are kept in order; the first occurrence keeps its id, later dupes
   * get fresh ones. Returns a new list, never mutates the input. */
  function uniqueId(list) {
    var seen = {};
    return (list || []).map(function (x) {
      if (!x) return x;
      var keeps = x.id;
      while (seen[keeps]) keeps = genId();
      seen[keeps] = true;
      return keeps !== x.id ? Object.assign({}, x, { id: keeps }) : x;
    });
  }

  /* Case-insensitive substring search over name, equipment, muscles, notes,
   * programming, safety and cues. Empty query matches everything. Returns a
   * NEW array. */
  function matches(list, query) {
    var q = str(query).toLowerCase();
    if (q === "") return (list || []).slice();
    return (list || []).filter(function (x) {
      if (!x) return false;
      var hay = [x.name, x.equipment, x.muscles, x.notes, x.programming, x.safety]
        .concat(Array.isArray(x.cues) ? x.cues : []);
      return hay.some(function (f) {
        return str(f).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  /* Newest-updated first; ties broken by createdAt desc. */
  function sortByRecency(list) {
    return (list || []).slice().sort(function (a, b) {
      var c = String(b.updatedAt || b.createdAt || "").localeCompare(
        String(a.updatedAt || a.createdAt || ""));
      if (c !== 0) return c;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  /* Split a muscles string on ";" into { primary, secondary } raw-text halves
   * (trimmed). This mirrors the split muscle-groups.parseMusclesText performs;
   * id resolution stays in that module. */
  function splitMuscles(s) {
    var raw = str(s);
    if (!raw) return { primary: "", secondary: "" };
    var halves = raw.split(";");
    var second = halves.length > 1 ? halves.slice(1).join(";") : "";
    second = second.replace(/^\s*(secondary|target|focus)\b\s*:?\s*/i, "").trim();
    return { primary: normalize(halves[0]), secondary: normalize(second) };
  }

  /* ---------- generated plate ---------- */

  function xml(v) {
    return str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function dataUri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* Trim to a character budget with an ellipsis, so a long user-entered name
   * cannot break the card layout or bloat the data: URI. */
  function clip(v, n) {
    var s = str(v);
    return s.length > n ? s.slice(0, Math.max(0, n - 1)).trim() + "…" : s;
  }

  /* A generic card for a custom exercise with no user-supplied plate. Built
   * from the exercise's own fields only — no network, no asset on disk, and
   * deliberately marked "Custom exercise — not doctrine" so a generated card
   * can never be mistaken for a doctrinal figure. Same 720x420 geometry as the
   * committed SVG cards. */
  function genericCard(entry) {
    var e = entry || {};
    var name = clip(e.name, 34) || "Custom exercise";
    var equipment = clip(e.equipment, 40);
    var muscles = clip(e.muscles, 52);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" width="720" height="420" role="img">' +
      '<rect width="720" height="420" fill="#151a21"/>' +
      '<rect x="8" y="8" width="704" height="404" fill="none" stroke="#c9972e" stroke-width="3" stroke-dasharray="14 10"/>' +
      '<text x="360" y="150" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="44" font-weight="700" fill="#f2ede4">' + xml(name) + "</text>" +
      '<text x="360" y="200" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="24" fill="#c9972e">' + xml(equipment || "No equipment") + "</text>" +
      '<text x="360" y="240" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="20" fill="#9aa3ad">' + xml(muscles) + "</text>" +
      '<text x="360" y="356" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="18" letter-spacing="2" fill="#7b848e">CUSTOM EXERCISE — NOT DOCTRINE</text>' +
      "</svg>";
    return { src: dataUri(svg), alt: name + " — generated custom-exercise card (not doctrine)" };
  }

  /* The plate to render for a custom exercise: the user's image when they
   * supplied a usable one, otherwise the generated card. Never null, so
   * js/exercise-coach.js always has an <img> to show. */
  function plateFor(entry) {
    if (!entry) return null;
    var url = toPlateUrl(entry.plateUrl || entry.plate);
    if (url) return { src: url, alt: str(entry.name) + " — user-supplied plate" };
    return genericCard(entry);
  }

  /* Convert a normalized custom exercise into an object shaped like a library
   * exercise, ready to be concatenated onto the EX lookup array. `drill`,
   * `aft` and `plate` are set so the render paths that read them don't choke:
   * `aft` is the validated code list, `drill` the "Custom" sentinel, and
   * `plate` the object js/exercise-coach.js workoutCard() consumes. `source`
   * stays the custom sentinel and `citation` stays empty — that pair is what
   * keeps a custom exercise visibly distinct from doctrine content. */
  function toLibraryExercise(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      name: entry.name,
      component: toComponent(entry.component),
      equipment: entry.equipment,
      muscles: entry.muscles,
      cues: entry.cues ? entry.cues.slice() : [],
      programming: entry.programming,
      safety: entry.safety || "",
      source: SOURCE,
      citation: "",
      drill: DRILL,
      aft: toAft(entry.aft),
      plate: plateFor(entry)
    };
  }

  return {
    COMPONENT: COMPONENT,
    SOURCE: SOURCE,
    DRILL: DRILL,
    COMPONENTS: COMPONENTS.slice(),
    AFT_CODES: AFT_CODES.slice(),
    normalize: normalize,
    genId: genId,
    isCustom: isCustom,
    toComponent: toComponent,
    toAft: toAft,
    toPlateUrl: toPlateUrl,
    make: make,
    upsert: upsert,
    remove: remove,
    findById: findById,
    uniqueId: uniqueId,
    matches: matches,
    sortByRecency: sortByRecency,
    splitMuscles: splitMuscles,
    genericCard: genericCard,
    plateFor: plateFor,
    toLibraryExercise: toLibraryExercise
  };
});
