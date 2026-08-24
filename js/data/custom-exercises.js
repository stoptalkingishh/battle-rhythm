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
 *                             programming, component, source, createdAt,
 *                             updatedAt } ]
 *
 * The list is merged like the other id-keyed arrays by sync-core's mergeById
 * (remote-wins on collision, local-only rows kept), exactly like br_bodyweight.
 * Only side-effect-free logic lives here; reading localStorage and writing
 * through Drive sync stay in app.js.
 *
 * Custom exercises are kept compatible with the built-in library shape:
 *   - `muscles` is the free-text "primary; secondary" string that
 *     js/data/muscle-groups.js already understands via its parseMusclesText
 *     / musclesOf helpers — so custom exercises light up the body map and
 *     muscle filters with no new code;
 *   - `component` and `source` are forced to sentinel values ("custom") so
 *     the UI can badge them as user-authored;
 *   - toLibraryExercise() emits an object that can be concatenated onto the
 *     EX lookup array in app.js (EX = [...BR_EXERCISES, ...BR_ATP_EXERCISES,
 *     ...custom]) and fed straight to EX.find / the exercise library render.
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

  /* Validate and normalise one custom exercise. Returns a clean record, or
   * null when unusable. Only `name` is required. Every other field is
   * coerced (never rejected outright) so a partially-filled form still saves. */
  function make(record) {
    if (!isObj(record)) return null;
    var name = normalize(record.name);
    if (name === "") return null;
    var equipment = normalize(record.equipment);
    var muscles = normalize(record.muscles);
    var notes = normalize(record.notes, true);
    var programming = normalize(record.programming, true);
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
      component: COMPONENT,
      source: SOURCE,
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

  /* Case-insensitive substring search over name, equipment, muscles, and
   * notes. Empty query matches everything. Returns a NEW array. */
  function matches(list, query) {
    var q = str(query).toLowerCase();
    if (q === "") return (list || []).slice();
    return (list || []).filter(function (x) {
      if (!x) return false;
      return [x.name, x.equipment, x.muscles, x.notes].some(function (f) {
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

  /* Convert a normalized custom exercise into an object shaped like a library
   * exercise, ready to be concatenated onto the EX lookup array. `drill` and
   * `aft` are set so the render paths that read them don't choke. */
  function toLibraryExercise(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      name: entry.name,
      component: COMPONENT,
      equipment: entry.equipment,
      muscles: entry.muscles,
      cues: entry.cues ? entry.cues.slice() : [],
      programming: entry.programming,
      safety: "",
      source: SOURCE,
      drill: "Custom",
      aft: []
    };
  }

  return {
    COMPONENT: COMPONENT,
    SOURCE: SOURCE,
    normalize: normalize,
    genId: genId,
    make: make,
    upsert: upsert,
    remove: remove,
    findById: findById,
    uniqueId: uniqueId,
    matches: matches,
    sortByRecency: sortByRecency,
    splitMuscles: splitMuscles,
    toLibraryExercise: toLibraryExercise
  };
});