"use strict";
/* Estimated one-rep max, adapted for Battle Rhythm (reference behavior modeled
 * on openGym's onerm module, rewritten clean here).
 *
 * Deliberately knows nothing about the exercise database: an estimate needs a
 * weight AND a rep count, and only reps-mode sets carry both. Cardio ({min,
 * speed}) and timed ({sec}) sets therefore drop out of every scan on their own —
 * there is no exercise-type check to keep in sync.
 *
 * Formulas are the usual submaximal-load estimators. Epley is the default
 * because it is the one most lifters have seen; all agree closely at low reps
 * and diverge as reps rise, which is exactly why REP_CAP exists.
 *
 * A one-rep max (w · 1) is not an estimate — it is a measurement — and comes
 * back unchanged from estimate1RM(w, 1).
 *
 * A set is described as { w, r, done, warmup }. Non-finite / missing load, zero
 * weight, < 1 rep, or a warm-up row all disqualify a set from estimation.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_ONE_RM = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var REP_CAP = 12;

  var FORMULAS = {
    epley: function (w, r) { return w * (1 + r / 30); },
    brzycki: function (w, r) { return w * 36 / (37 - r); },
    lombardi: function (w, r) { return w * Math.pow(r, 0.1); }
  };
  var DEFAULT_FORMULA = "epley";

  function isWarmupRow(s) { return !!(s && (s.warmup || s.phase === "warmup")); }

  /* Estimate a 1RM from one set. Returns null for anything it cannot honestly
   * answer: missing / zero / negative load, no reps, non-finite input, or more
   * reps than REP_CAP. A single rep comes back unchanged. */
  function estimate1RM(w, r, formula) {
    var weight = Number(w);
    var reps = Number(r);
    if (!isFinite(weight) || !isFinite(reps)) return null;
    if (weight <= 0 || reps < 1) return null;
    if (reps > REP_CAP) return null;
    var fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA];
    var est = reps === 1 ? weight : fn(weight, Math.round(reps));
    if (!isFinite(est) || est <= 0) return null;
    return Math.round(est * 10) / 10;
  }

  /* Best estimate out of one entry's completed, non-warm-up sets.
   * Returns null when no set in the entry is estimable. */
  function bestSetOf(entry, formula) {
    var best = null;
    var sets = entry && Array.isArray(entry.sets) ? entry.sets : [];
    sets.forEach(function (s) {
      if (!s || s.done !== true || isWarmupRow(s)) return;
      var est = estimate1RM(s.w, s.r, formula);
      if (est !== null && (!best || est > best.est)) {
        best = { est: est, w: Number(s.w), r: Math.round(Number(s.r)) };
      }
    });
    return best;
  }

  /* One point per workout in which the exercise produced an estimate — feeds the
   * trend chart. Chronological, matching the order workouts are appended in.
   * `workouts` is [{ d (iso date), t (ms), entries: [{ id, sets }] }]. */
  function e1rmSeries(workouts, exId, formula) {
    var pts = [];
    (workouts || []).forEach(function (w) {
      var entry = w.entries.find(function (e) { return e.id === exId; });
      if (!entry) return;
      var best = bestSetOf(entry, formula);
      if (best) pts.push({ t: w.t, d: w.d, y: best.est, w: best.w, r: best.r });
    });
    return pts;
  }

  /* All-time best estimate, with the set and date it came from — the source
   * matters, because "142.5 lb est. from 100x10" is a very different claim than
   * "from 140x1". */
  function best1RM(workouts, exId, formula) {
    var best = null;
    e1rmSeries(workouts, exId, formula).forEach(function (p) {
      if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, d: p.d, t: p.t };
    });
    return best;
  }

  /* Did this entry beat every estimate that came before it? Compared against a
   * history that does not yet contain `entry` (used for the finish summary). */
  function is1RMRecord(workouts, exId, entry, formula) {
    var now = bestSetOf(entry, formula);
    if (!now) return null;
    var prev = best1RM(workouts, exId, formula);
    return (!prev || now.est > prev.est)
      ? { est: now.est, w: now.w, r: now.r, prev: prev ? prev.est : 0 }
      : null;
  }

  return {
    REP_CAP: REP_CAP,
    FORMULAS: FORMULAS,
    DEFAULT_FORMULA: DEFAULT_FORMULA,
    isWarmupRow: isWarmupRow,
    estimate1RM: estimate1RM,
    bestSetOf: bestSetOf,
    e1rmSeries: e1rmSeries,
    best1RM: best1RM,
    is1RMRecord: is1RMRecord
  };
});