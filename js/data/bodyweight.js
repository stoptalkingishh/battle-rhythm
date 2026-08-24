"use strict";
/* Pure body-weight tracking helpers for Battle Rhythm (loads as
 * window.BR_BODYWEIGHT in the browser and via require in node:test).
 *
 * Behavior modeled on openGym's body-weight logging (its `lastBW` helper and
 * the LineChart series built in Stats/Home), but rewritten cleanly from the
 * ground up — no openGym source is copied.
 *
 * The app keeps a privacy-local, Drive-synced log of weigh-ins:
 *   br_bodyweight = [ { id, date, weight, unit, note, createdAt } ]
 * backed by a single saved goal:
 *   { weight, unit }
 * Only side-effect-free logic lives here; reading localStorage and writing
 * through Drive sync stays in app.js. The listing is merged like the other
 * id-keyed arrays by sync-core's mergeById.
 *
 * OpenGym's behavior that this mirrors:
 *   - entries are keyed by day, and a new weigh-in for an already-logged day
 *     replaces the stored number (openGym keys by `d`, we key by `id`);
 *   - deltas are computed chronologically as current - previous, and a goal
 *     line colors a move by whether its sign heads toward the goal:
 *       goal above current ? want a gain (change > 0) : want a loss (change < 0);
 *   - the chart series is [{ t: ms, y: weight, d: iso, change }] sorted by t.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_BODYWEIGHT = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var UNITS = ["lb", "kg"];
  var DEFAULT_UNIT = "lb";

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function genId() {
    return "bw" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* A date is real only if it is YYYY-MM-DD AND round-trips through the
   * calendar, so "2026-02-30" and "2026-13-01" are rejected. */
  function isRealDate(yyyymmdd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return false;
    var p = yyyymmdd.split("-").map(function (x) { return parseInt(x, 10); });
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] &&
      d.getUTCMonth() === p[1] - 1 &&
      d.getUTCDate() === p[2];
  }

  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  /* Coerce to a positive finite number, or null when unusable. Strings that
   * parse to a number (e.g. "180.5") are accepted; anything else is not. */
  function toWeight(v) {
    var n;
    if (typeof v === "number") n = v;
    else if (typeof v === "string" && v.trim() !== "") n = Number(v.trim());
    else return null;
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return null;
    return n;
  }

  /* Validate and normalise one weigh-in. Returns a clean entry:
   *   { id, date, weight, unit, note, createdAt }
   * or null when it is unusable. unit defaults to "lb"; note is optional. */
  function make(record) {
    if (!isObj(record)) return null;
    var date = String(record.date == null ? "" : record.date).trim();
    if (!isRealDate(date)) return null;
    var weight = toWeight(record.weight);
    if (weight == null) return null;
    var unit = String(record.unit == null ? "" : record.unit).trim().toLowerCase() || DEFAULT_UNIT;
    if (UNITS.indexOf(unit) === -1) return null;
    var note = String(record.note == null ? "" : record.note).trim();
    return {
      id: record.id || genId(),
      date: date,
      weight: weight,
      unit: unit,
      note: note,
      createdAt: record.createdAt || new Date().toISOString()
    };
  }

  /* Insert a new weigh-in or replace an existing one by id. Never mutates the
   * input; returns the new list plus a flag and the (normalized) entry so the
   * caller knows what changed. */
  function upsert(list, record) {
    var entry = make(record);
    if (!entry) return { list: list || [], changed: false, entry: null };
    var out = (list || []).slice();
    var idx = -1;
    for (var i = 0; i < out.length; i++) {
      if (out[i] && out[i].id === entry.id) { idx = i; break; }
    }
    if (idx >= 0) out[idx] = entry; else out.push(entry);
    return { list: out, changed: true, entry: entry };
  }

  function remove(list, id) {
    var out = (list || []).filter(function (x) { return !(x && x.id === id); });
    return { list: out, changed: out.length !== (list || []).length };
  }

  /* Most recent first; ties broken by most recent createdAt. */
  function sortByDate(list) {
    return (list || []).slice().sort(function (a, b) {
      var c = String(b.date).localeCompare(String(a.date));
      if (c !== 0) return c;
      return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date));
    });
  }

  /* Oldest first; ties broken by createdAt. Used for delta/chart math. */
  function asc(list) {
    return (list || []).slice().sort(function (a, b) {
      var c = String(a.date).localeCompare(String(b.date));
      if (c !== 0) return c;
      return String(a.createdAt || a.date).localeCompare(String(b.createdAt || a.date));
    });
  }

  /* The newest weigh-in (max date, then max createdAt), regardless of input
   * order. Null when there are no entries. */
  function latest(list) {
    var best = null;
    (list || []).forEach(function (x) {
      if (!x) return;
      if (!best ||
          x.date > best.date ||
          (x.date === best.date && String(x.createdAt || "") > String(best.createdAt || ""))) {
        best = x;
      }
    });
    return best;
  }

  /* Does a change of `change` at current weight `current` move toward `goal`?
   * { weight, unit } goal, or null/absent when there is no goal. A move toward
   * a higher goal means a gain; toward a lower goal means a loss. Zero change,
   * no goal, or already exactly at the goal are never "toward". */
  function towardGoal(goal, current, change) {
    if (!goal || typeof goal.weight !== "number" || !isFinite(goal.weight)) return false;
    var g = goal.weight;
    if (Math.abs(change) === 0) return false;
    if (g > current) return change > 0;
    if (g < current) return change < 0;
    return false; // already at the goal: any move is away before it crosses
  }

  /* Chronological maths over the weigh-ins. Returns a NEW array (ascending by
   * date) where each entry carries:
   *   change    gain/loss vs the previous entry (first entry = 0)
   *   towardGoal  whether that change moves toward the saved goal
   * The input is never mutated and its order does not matter. */
  function withDeltas(list, goal) {
    var order = asc(list);
    var out = [];
    var prev = null;
    for (var i = 0; i < order.length; i++) {
      var e = order[i];
      var change = prev && prev.date <= e.date ? e.weight - prev.weight : 0;
      out.push({
        id: e.id,
        date: e.date,
        weight: e.weight,
        unit: e.unit,
        note: e.note,
        createdAt: e.createdAt,
        change: change,
        towardGoal: towardGoal(goal, e.weight, change)
      });
      prev = e;
    }
    return out;
  }

  /* Build the LineChart series: [{ t: ms, y: weight, d: iso, change }],
   * ascending by t. Optional { days } narrows to entries within that many days
   * (omit / 0 = all). `change` re-baselines to 0 for the first surviving point
   * after a window filter, so each dot shows the delta vs the previous dot. */
  function series(list, opts) {
    var days = opts && opts.days > 0 ? opts.days : 0;
    var tOf = function (e) { return Date.parse(e.date + "T00:00:00Z"); };
    var order = days
      ? asc(list).filter(function (e) { return Date.now() - tOf(e) < days * 86400000; })
      : asc(list);
    var out = [];
    var prev = null;
    for (var i = 0; i < order.length; i++) {
      var e = order[i];
      var t = tOf(e);
      out.push({
        t: t,
        y: e.weight,
        d: e.date,
        change: prev && prev.date <= e.date ? e.weight - prev.weight : 0
      });
      prev = e;
    }
    return out;
  }

  /* Validate and normalise a saved goal:
   *   { weight, unit }   (unit defaults to "lb")
   * or null when unusable. Negative/zero/non-finite weights are rejected. */
  function normalizeGoal(input) {
    if (!isObj(input)) {
      if (typeof input === "number" || (typeof input === "string" && input.trim() !== "")) {
        input = { weight: input };
      } else {
        return null;
      }
    }
    var weight = toWeight(input.weight);
    if (weight == null) return null;
    var unit = String(input.unit == null ? "" : input.unit).trim().toLowerCase() || DEFAULT_UNIT;
    if (UNITS.indexOf(unit) === -1) return null;
    return { weight: weight, unit: unit };
  }

  return {
    UNITS: UNITS,
    DEFAULT_UNIT: DEFAULT_UNIT,
    todayISO: todayISO,
    genId: genId,
    isRealDate: isRealDate,
    make: make,
    upsert: upsert,
    remove: remove,
    sortByDate: sortByDate,
    latest: latest,
    towardGoal: towardGoal,
    withDeltas: withDeltas,
    series: series,
    normalizeGoal: normalizeGoal
  };
});