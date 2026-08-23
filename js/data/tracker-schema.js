"use strict";
/* Pure tracker storage schema + migration logic shared by the browser app
 * (loads as window.BRTrackerSchema) and the Node test suite (node:test).
 *
 * Only testable, side-effect-free functions live here. localStorage access,
 * rendering, and orchestration stay in app.js.
 *
 * Schema history:
 *   v1 (original, pre-PR):  br_tracker = { "<date>": { sessions: { "<sid>": {
 *                              done: { "<itemId>": bool },
 *                              complete: bool,
 *                              snapshot: <session plan>
 *                            } } } }
 *   v2 (this PR):           br_tracker = { schemaVersion: 2, "<date>": {
 *                              sessions: { "<sid>": {
 *                                schema: 2,
 *                                complete, startedAt, completedAt,
 *                                rpeActual, durationActual, notes,
 *                                snapshot,
 *                                results: { "<itemId>": {
 *                                  done: bool,
 *                                  actual: {
 *                                    sets: [{weight,reps,rest}],
 *                                    reps, weight,
 *                                    duration, distance,
 *                                    rpe, rir, notes
 *                                  }
 *                                } }
 *                              } } } }
 *
 * migrateToV2() converts a v1 store in place of a lossy Boolean checklist to
 * the v2 result model, preserving every date, session, done flag, completion
 * state, and snapshot.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRTrackerSchema = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var SCHEMA_VERSION = 2;

  /* H2F session phase keys; keep in canonical order for stable output. */
  var PHASE_ORDER = ["prep", "activity", "recovery"];

  /* ---- helpers ---- */
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  function findItems(snapshot) {
    var out = [];
    if (!isObj(snapshot) || !isObj(snapshot.phases)) return out;
    PHASE_ORDER.forEach(function (key) {
      var p = snapshot.phases[key];
      if (isObj(p) && Array.isArray(p.items)) {
        p.items.forEach(function (it) { if (isObj(it) && it.id) out.push(it); });
      }
    });
    return out;
  }

  /* Which actual-result fields a planned item should capture. */
  function resultKind(item) {
    if (!isObj(item)) return "generic";
    var reps = String(item.reps || "").trim();
    var sets = String(item.sets || "").trim();
    var dur = String(item.duration || "").trim();
    if (reps || sets) return "strength";
    if (dur) return "timed";
    return "generic";
  }

  function version(raw) {
    if (isObj(raw) && typeof raw.schemaVersion === "number" && raw.schemaVersion >= 2) {
      return raw.schemaVersion;
    }
    return 1; /* unversioned v1 store */
  }

  function needsMigration(raw) { return isObj(raw) && version(raw) < SCHEMA_VERSION; }

  function blankActual() {
    return { sets: [], reps: "", weight: "", duration: "", distance: "", rpe: "", rir: "", notes: "" };
  }

  function newResult(item) {
    return { done: false, actual: blankActual() };
  }

  function newEntry(snapshot) {
    var entry = {
      schema: SCHEMA_VERSION,
      complete: false,
      startedAt: null,
      completedAt: null,
      rpeActual: "",
      durationActual: "",
      notes: "",
      snapshot: isObj(snapshot) ? snapshot : {},
      results: {}
    };
    findItems(snapshot).forEach(function (item) {
      entry.results[item.id] = newResult(item);
    });
    return entry;
  }

  /* Human-readable summary of a logged actual result, e.g.
   * "5 reps x 135", "30 sec", "400m", "done" for bare completion.
   */
  function actualSummary(res) {
    if (!isObj(res)) return "";
    var parts = [];
    var a = isObj(res.actual) ? res.actual : {};
    (Array.isArray(a.sets) ? a.sets : []).forEach(function (set) {
      if (!isObj(set)) return;
      var p = [];
      if (String(set.reps || "").trim()) p.push(String(set.reps).trim() + " reps");
      if (String(set.weight || "").trim()) p.push(String(set.weight).trim());
      if (String(set.rest || "").trim()) p.push("rest " + String(set.rest).trim());
      if (p.length) parts.push(p.join(" x "));
    });
    if (parts.length) {
      if (String(a.reps || "").trim() && String(a.weight || "").trim()) {
        parts.push(String(a.reps).trim() + " reps x " + String(a.weight).trim());
      }
    } else {
      if (String(a.reps || "").trim()) parts.push(String(a.reps).trim() + " reps");
      if (String(a.weight || "").trim()) parts.push(String(a.weight).trim());
    }
    if (String(a.duration || "").trim()) parts.push(String(a.duration).trim());
    if (String(a.distance || "").trim()) parts.push(String(a.distance).trim());
    if (String(a.rpe || "").trim()) parts.push("RPE " + String(a.rpe).trim());
    if (String(a.rir || "").trim()) parts.push("RIR " + String(a.rir).trim());
    return parts.join(", ");
  }

  function entrySummary(entry) {
    if (!isObj(entry)) return "";
    var parts = [];
    if (String(entry.rpeActual || "").trim()) parts.push("RPE " + String(entry.rpeActual).trim());
    if (String(entry.durationActual || "").trim()) parts.push(String(entry.durationActual).trim() + " elapsed");
    var notes = String(entry.notes || "").trim();
    if (notes) parts.push('"' + notes + '"');
    return parts.join(", ");
  }

  /* Count of completed items in a snapshot+entry pair. */
  function doneCount(entry) {
    var results = isObj(entry) && isObj(entry.results) ? entry.results : {};
    return Object.keys(results).reduce(function (n, id) { return n + (results[id] && results[id].done ? 1 : 0); }, 0);
  }

  /* Explicit v1 -> v2 migration. Returns a new object; never mutates input. */
  function migrateToV2(raw) {
    var out = { schemaVersion: SCHEMA_VERSION };
    if (!isObj(raw)) return out;
    Object.keys(raw).forEach(function (date) {
      if (date === "schemaVersion") return;
      var outDay = { sessions: {} };
      var day = raw[date];
      if (isObj(day)) {
        var sessions = isObj(day.sessions) ? day.sessions : {};
        Object.keys(sessions).forEach(function (sid) {
          if (!isObj(sessions[sid])) return;
          outDay.sessions[sid] = migrateEntry(sessions[sid]);
        });
      }
      out[date] = outDay;
    });
    return out;
  }

  function migrateEntry(e) {
    if (e.schema === SCHEMA_VERSION && isObj(e.results)) {
      /* Already a v2 entry: preserve exactly (idempotence). */
      return JSON.parse(JSON.stringify(e));
    }
    var entry = newEntry(e.snapshot);
    entry.complete = !!e.complete;
    entry.startedAt = typeof e.startedAt === "string" ? e.startedAt : null;
    entry.completedAt = typeof e.completedAt === "string" ? e.completedAt : null;
    entry.rpeActual = typeof e.rpeActual === "string" ? e.rpeActual : "";
    entry.durationActual = typeof e.durationActual === "string" ? e.durationActual : "";
    entry.notes = typeof e.notes === "string" ? e.notes : "";
    var done = isObj(e.done) ? e.done : {};
    findItems(entry.snapshot).forEach(function (item) {
      var r = entry.results[item.id];
      if (!r) { r = newResult(item); entry.results[item.id] = r; }
      r.done = !!done[item.id];
    });
    return entry;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    version: version,
    needsMigration: needsMigration,
    migrateToV2: migrateToV2,
    newEntry: newEntry,
    newResult: newResult,
    resultKind: resultKind,
    actualSummary: actualSummary,
    entrySummary: entrySummary,
    doneCount: doneCount,
    findItems: findItems
  };
});