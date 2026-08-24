"use strict";
/* Freestyle session prefill helpers for Battle Rhythm (loads as
 * window.BR_FREESTYLE_PREFILL in the browser and via require in node:test).
 *
 * "Freestyle" lets you start an unscheduled session on the fly and add any
 * exercises to it. Instead of making you retype what you did last time, the
 * tracker prefills each exercise's target from your logged history — the same
 * idea as the guided-session prefill in app.js, but extracted here into pure,
 * testable logic that works off the normalized `workouts`/item shapes shared
 * with set-history.js and progression.js:
 *
 *   item     = { id, mode?, sets?, reps?, repsMin?, repsMax?, weight?,
 *                sec?, min?, speed?, prog?, bodyweight?, side? }
 *   workouts = [ { d, entries: [ { id, target?, sets: [ set ] } ] } ]
 *
 * Which value wins is decided in this order:
 *   1. Progression: if a rule is in force (linear / greyskull / double /
 *      time) and the last session was completed, use its next prescription so
 *      the prefill carries the overloading forward (source "progression").
 *   2. Last logged: otherwise reuse the most recent completed working values
 *      from history (source "last").
 *   3. Plan: with no history at all, fall back to the expressed item target
 *      (source "plan").
 * Body-weight work has no external load, so its prefill carries reps (and for
 * time-mode the hold duration) — never a fabricated weight.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./set-history.js"), require("./progression.js"));
  } else {
    root.BR_FREESTYLE_PREFILL = factory(root.BR_SET_HISTORY, root.BR_PROGRESSION);
  }
})(typeof self !== "undefined" ? self : this, function (SH, PROG) {
  var MODES = ["reps", "time", "cardio"];

  function modeOf(item) {
    var m = item && item.mode;
    if (MODES.indexOf(m) !== -1) return m;
    var dur = String((item && item.duration) || "").trim();
    return dur ? "time" : "reps";
  }
  function isTimed(item) { return modeOf(item) === "time"; }
  function isCardio(item) { return modeOf(item) === "cardio"; }

  /* Most recent completed working values for one exercise, derived from the
   * same normalized history set-history walks. Warm-up rows are excluded; only
   * sets actually checked off contribute. Returns
   *   { weight, reps, sec, min, speed, count }
   * with 0 / null for fields that carry nothing in that mode, or null when the
   * exercise has no completed history. */
  function lastValues(workouts, exId) {
    var last = SH.lastEntryFor(workouts, exId);
    if (!last) return null;
    var sets = (last.sets || []).filter(function (s) { return s.done && !SH.isWarmupRow(s); });
    var out = { weight: 0, reps: 0, sec: 0, min: 0, speed: 0, count: sets.length, d: last.d || null };
    if (out.count === 0) return null; /* only warm-ups/undone rows: nothing to re-seed */
    sets.forEach(function (s) {
      var w = Number(s.w) || 0, r = Number(s.r) || 0;
      var sec = Number(s.sec) || 0, mn = Number(s.min) || 0, sp = Number(s.speed) || 0;
      if (w > out.weight) out.weight = w;
      if (r > out.reps) out.reps = r;
      if (sec > out.sec) out.sec = sec;
      if (mn > out.min) out.min = mn;
      if (sp > out.speed) out.speed = sp;
    });
    return out;
  }

  /* Derive the prefill target for one exercise. `routine` (optional) carries a
   * progression default; `unit` feeds the load-increment choice. Returns
   *   { mode, weight?, reps?, sec?, setCount, source }
   * where source is "progression" | "last" | "plan". Undefined weight means the
   * row should not carry a load (bodyweight work). */
  function prefillTarget(item, workouts, routine, unit) {
    var mode = modeOf(item);
    var base = { mode: mode, setCount: Math.max(1, Number((item && item.sets)) || 1) };

    var p = PROG.nextPrescription(workouts, item || {}, routine || {}, unit);
    if (p && (p.kind === "up" || p.kind === "deload" || p.kind === "hold")) {
      /* Progression is the authoritative forward-looking rule: its values win
       * outright and only the fields it declined are back-filled from the plan
       * (e.g. a linear "up" advances weight but keeps your rep target). */
      var t1 = { mode: mode, source: "progression" };
      t1.setCount = p.sets ? p.sets : base.setCount;
      if (p.weight != null) t1.weight = p.weight;
      if (p.reps != null) t1.reps = p.reps;
      if (p.sec != null) { t1.sec = p.sec; t1.setCount = base.setCount; }
      backfillFromPlan(t1, item);
      return t1;
    }

    var lv = lastValues(workouts, item && item.id);
    if (lv) {
      var t2 = {
        mode: mode, source: "last", setCount: lv.count > 0 ? lv.count : base.setCount
      };
      if (mode === "reps") {
        if (SH.isBw(item || {})) {
          t2.reps = lv.reps; /* bodyweight: reps only */
        } else if (lv.weight > 0) {
          t2.weight = lv.weight; t2.reps = lv.reps;
        } else {
          t2.reps = lv.reps;
        }
      } else if (mode === "time") {
        t2.sec = lv.sec;
      } else {
        t2.min = lv.min; t2.speed = lv.speed;
      }
      /* Reusing stale history: a target the plan spells out wins. */
      overrideFromPlan(t2, item);
      return t2;
    }

    /* No history: prefill from the expressed plan target. */
    var t3 = { mode: mode, source: "plan", setCount: base.setCount };
    fillPlanTarget(t3, item);
    return t3;
  }

  /* Fill only the fields a derived target left undefined, from the plan. */
  function backfillFromPlan(t, item) {
    if (!item) return;
    if (t.weight == null && Number(item.weight)) t.weight = Number(item.weight);
    if (t.reps == null && Number(item.reps)) t.reps = Number(item.reps);
    if (t.sec == null && Number(item.sec)) t.sec = Number(item.sec);
  }

  /* Plan-spelled values override history-derived ones. */
  function overrideFromPlan(t, item) {
    if (!item) return;
    if (Number(item.weight)) t.weight = Number(item.weight);
    if (Number(item.reps)) t.reps = Number(item.reps);
    if (Number(item.sec)) t.sec = Number(item.sec);
    if (Number(item.repsMin)) t.repsMin = Number(item.repsMin);
    if (Number(item.repsMax)) t.repsMax = Number(item.repsMax);
  }

  function fillPlanTarget(t, item) {
    if (!item) return;
    if (modeOf(item) === "reps") {
      if (Number(item.weight)) t.weight = Number(item.weight);
      if (Number(item.reps)) t.reps = Number(item.reps);
      else if (SH.isBw(item)) t.reps = Number(item.reps) || 8;
    } else if (modeOf(item) === "time") {
      t.sec = Number(item.sec) || 45;
    } else {
      t.min = Number(item.min) || 20;
      t.speed = Number(item.speed) || 8;
    }
  }

  /* Expand a prefill target into the concrete set rows shown in the tracker:
   *   { w?, r?, sec?, min?, speed?, done:false, warmup:false }
   * Row count = target.setCount. Warm-up rows are never prefilled. */
  function buildRows(target) {
    var n = Math.max(1, Math.round((target && target.setCount) || 1));
    var out = [];
    for (var i = 0; i < n; i++) {
      var row = { done: false, warmup: false };
      if (target.weight != null) row.w = target.weight;
      if (target.reps != null) row.r = target.reps;
      if (target.sec != null) row.sec = target.sec;
      if (target.min != null) row.min = target.min;
      if (target.speed != null) row.speed = target.speed;
      out.push(row);
    }
    return out;
  }

  /* One-stop prefill for a freestyle session's chosen exercises. Accepts a
   * list of item configs and returns the same list augmented with
   *   { item, item target, source, rows, mode }
   * in the same order. Exercises with no available target still get rows so the
   * user can fill them manually. */
  function prefillList(items, workouts, routine, unit) {
    return (items || []).map(function (item) {
      var target = prefillTarget(item, workouts, routine, unit);
      return {
        item: item,
        mode: modeOf(item),
        target: target,
        source: target.source,
        rows: buildRows(target)
      };
    });
  }

  return {
    MODES: MODES,
    modeOf: modeOf,
    isTimed: isTimed,
    isCardio: isCardio,
    lastValues: lastValues,
    prefillTarget: prefillTarget,
    buildRows: buildRows,
    prefillList: prefillList
  };
});