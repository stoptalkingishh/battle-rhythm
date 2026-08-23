"use strict";
/* Pure helpers over logged set/rep history, adapted for Battle Rhythm (reference
 * behavior modeled on openGym's history module, rewritten clean here)).
 *
 * Works on a normalized entry shape so the pure logic is testable without the
 * DOM or localStorage:
 *
 *   entry = { id, target?, bodyweight?, side?, mode?, sets: [ set ] }
 *   set   = { w, r, sec, min, speed, done, warmup, phase }   (mode-dependent keys)
 *
 *   - reps    sets carry { w, r }
 *   - time    sets carry { sec, w }   (w = added weight; 0 for bodyweight)
 *   - cardio  sets carry { min, speed }
 *
 * `setsFromActual()` adapts a Battle Rhythm stored `actual` result ({ sets:
 * [{weight,reps,rest}], reps, weight, duration, distance }) into this shape, so
 * the browser layer (app.js) can feed stored history straight in on Phase 1.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_SET_HISTORY = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var MODES = ["reps", "time", "cardio"];

  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  function modeOf(cfg) {
    var m = cfg && cfg.mode;
    if (MODES.indexOf(m) !== -1) return m;
    var dur = String((cfg && cfg.duration) || "").trim();
    return dur ? "time" : "reps";
  }
  function isTimed(cfg) { return modeOf(cfg) === "time"; }

  function isWarmupRow(s) { return !!(s && (s.warmup || s.phase === "warmup")); }

  /* Bodyweight exercises carry no load of their own, so `w` means ADDED weight.
   * A per-side exercise logs the total; the split is derived for display only. */
  function isBw(cfg) { return !!(cfg && (cfg.bodyweight != null ? !!cfg.bodyweight : false)); }
  function isPerSide(cfg) { return !!(cfg && cfg.side); }
  function sideReps(reps) { return (reps || 0) / 2; }
  function repStep(cfg) { return isPerSide(cfg) ? 2 : 1; }

  /* mm:ss for a work duration — seconds alone read badly past a minute. */
  function fmtSec(sec) {
    var n = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
  }

  /* How hard a set felt; two scales for the same thing. RIR counts reps left in
   * the tank; RPE reads the same effort off a 10-point scale from the top.
   * `min`..`max` is the range the stepper walks. */
  var EFFORT = {
    rir: { f: "rir", hd: "RIR", step: 0.5, min: 0, max: 10 },
    rpe: { f: "rpe", hd: "RPE", step: 0.5, min: 6, max: 10 }
  };
  function stepEffort(kind, cur, dir) {
    var e = EFFORT[kind];
    if (!e) return cur == null ? null : cur;
    if (cur == null) return dir < 0 ? null : e.min;
    var n = Math.round((cur + dir * e.step) * 100) / 100;
    if (dir < 0 && n < e.min) return null;
    return dir > 0 ? Math.min(e.max, n) : Math.max(e.min, n);
  }
  function capEffort(kind, v) {
    return (v == null || !EFFORT[kind]) ? v : Math.min(EFFORT[kind].max, v);
  }
  function effortTail(s) {
    var k = s && s.rir != null ? "rir" : (s && s.rpe != null ? "rpe" : null);
    return k ? " (" + EFFORT[k].hd + " " + s[k] + ")" : "";
  }

  /* One-line summary of a logged set. `cfg` carries the mode/bodyweight flags
   * when the caller has them; an id alone keeps the default behavior. */
  function setLabel(id, s, cfg) {
    var c = cfg || { id: id };
    var mode = modeOf(c);
    if (mode === "cardio") return (s.min || 0) + " min @ " + (s.speed || 0) + " km/h";
    if (mode === "time") return fmtSec(s.sec) + (s.w > 0 ? " · " + s.w : "");
    var r = s.r || 0;
    if (isBw(c)) {
      var load = s.w > 0 ? "+" + s.w + " × " : "";
      return load + r + effortTail(s);
    }
    return (s.w || 0) + "x" + r + effortTail(s);
  }

  /* One-line summary of a planned exercise ("3 × 10 · 60 lb"), shared by the
   * session builder and any export so a mode is described the same way. */
  function exLine(cfg, unit) {
    var mode = modeOf(cfg);
    var n = cfg.sets || 1;
    var load = (cfg.weight > 0)
      ? " · " + (isBw(cfg) ? "+" : "") + cfg.weight + " " + unit
      : "";
    if (mode === "cardio") return n + " × " + (cfg.min || 20) + " min @ " + (cfg.speed || 8) + " km/h";
    if (mode === "time") return n + " × " + fmtSec(cfg.sec || 45) + load;
    var split = isPerSide(cfg) ? " · " + sideReps(cfg.reps) + "/side" : "";
    return n + " × " + cfg.reps + load + split;
  }

  /* Total tonnage moved across a workout's completed sets. No per-side special
   * case: a per-side set logs its total, so both sides are already counted. */
  function workoutVolume(w) {
    var v = 0;
    (w ? w.entries || [] : []).forEach(function (e) {
      (e.sets || []).forEach(function (s) {
        if (s.done) v += (s.w || 0) * (s.r || 0);
      });
    });
    return v;
  }

  /* Number of completed sets (training load proxy for the finish summary). */
  function setsDone(w) {
    var n = 0;
    (w ? w.entries || [] : []).forEach(function (e) {
      (e.sets || []).forEach(function (s) { if (s.done) n++; });
    });
    return n;
  }

  /* Completed non-warm-up sets across a workout's entries. */
  function workSetsDone(w) {
    var n = 0;
    (w ? w.entries || [] : []).forEach(function (e) {
      (e.sets || []).forEach(function (s) {
        if (s.done === true && !isWarmupRow(s)) n++;
      });
    });
    return n;
  }

  /* The most recent completed entry for an exercise, with its target for
   * re-seeding on a guided/freestyle session. */
  function lastEntryFor(workouts, exId) {
    for (var i = (workouts || []).length - 1; i >= 0; i--) {
      var en = (workouts[i].entries || []).find(function (e) { return e.id === exId; });
      if (en && en.sets && en.sets.some(function (s) { return s.done; })) {
        return {
          d: workouts[i].d,
          sets: en.sets.filter(function (s) { return s.done; }),
          target: en.target || null
        };
      }
    }
    return null;
  }

  /* Best completed working load for an exercise across all workouts. */
  function bestWeightFor(workouts, exId) {
    var best = 0;
    (workouts || []).forEach(function (w) {
      (w.entries || []).forEach(function (e) {
        if (e.id === exId) best = Math.max(best, bestWeightForEntry(e));
      });
    });
    return best;
  }

  function bestWeightForEntry(entry) {
    var best = 0;
    (entry && Array.isArray(entry.sets) ? entry.sets : []).forEach(function (s) {
      if (s.done !== true || isWarmupRow(s)) return;
      var weight = Number(s.w);
      if (isFinite(weight) && weight > best) best = weight;
    });
    return best;
  }

  /* Adapt a Battle Rhythm stored `actual` result into normalized sets. Predates
   * per-set done/warmup markers, so every reps row is treated as completed
   * work; timed/distance rows become single {sec} / cardio {min} sets. */
  function setsFromActual(actual) {
    var sets = [];
    if (!isObj(actual)) return sets;
    (Array.isArray(actual.sets) ? actual.sets : []).forEach(function (set) {
      var w = Number(set && set.weight) || 0;
      var r = Number(set && set.reps) || 0;
      var warm = !!(set && set.warmup);
      if (set && set.duration) sets.push({ sec: Number(set.duration) || 0, done: true, warmup: warm });
      else if (set && set.distance) sets.push({ min: Number(set.distance) || 0, speed: 0, done: true, warmup: warm });
      else sets.push({ w: w, r: r, done: true, warmup: warm });
    });
    var scalarW = Number(actual.weight) || 0;
    var scalarR = Number(actual.reps) || 0;
    if (!sets.length && (scalarW || scalarR)) {
      sets.push({ w: scalarW, r: scalarR, done: true });
    }
    if (!sets.length && Number(actual.duration)) {
      sets.push({ sec: Number(actual.duration) || 0, done: true });
    }
    return sets;
  }

  return {
    modeOf: modeOf,
    isTimed: isTimed,
    isBw: isBw,
    isPerSide: isPerSide,
    sideReps: sideReps,
    repStep: repStep,
    fmtSec: fmtSec,
    EFFORT: EFFORT,
    stepEffort: stepEffort,
    capEffort: capEffort,
    setLabel: setLabel,
    exLine: exLine,
    workoutVolume: workoutVolume,
    setsDone: setsDone,
    workSetsDone: workSetsDone,
    lastEntryFor: lastEntryFor,
    bestWeightFor: bestWeightFor,
    bestWeightForEntry: bestWeightForEntry,
    setsFromActual: setsFromActual,
    isWarmupRow: isWarmupRow
  };
});