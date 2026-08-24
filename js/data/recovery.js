"use strict";
/* Muscle fatigue & volume-balance, adapted for Battle Rhythm (reference
 * behavior modeled on openGym's recovery module, rewritten clean here).
 *
 * Consumes normalized workouts whose entries carry an explicit `muscleGroups`
 * array (the caller augments exercise ids -> muscle-group ids via
 * muscle-groups.musclesOf). Pure + unit-tested.
 *
 *   fatigue fades on a half-life as time passes and scales with the load done
 *   to that muscle. `balanceOf` reports the volume each muscle has received in
 *   a trailing window, as an absolute load and a share of the total.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_RECOVERY = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var DAY = 86400000;
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

  /* Sets that count toward load: done, non-warm-up rows (weight x reps). */
  function setLoad(e) {
    var total = 0;
    (e && e.sets || []).forEach(function (s) {
      if (s && s.done === true && !s.warmup) total += (Number(s.w) || 0) * (Number(s.r) || 0);
    });
    return total;
  }
  function setCount(e) {
    return (e && e.sets || []).filter(function (s) { return s.done === true && !s.warmup; }).length;
  }

  /* Per-muscle training footprint: time of last stimulus, cumulative load, sets. */
  function footprints(workouts) {
    var out = {};
    (workouts || []).forEach(function (w) {
      (w && w.entries || []).forEach(function (e) {
        var muscles = e.muscleGroups || [];
        var load = setLoad(e);
        var sets = setCount(e);
        if (!muscles.length && !sets) return;
        (muscles.length ? muscles : ["_workout_only"]).forEach(function (mg) {
          var rec = out[mg] || (out[mg] = { lastT: 0, load: 0, sets: 0, count: 0 });
          if (w.t > rec.lastT) rec.lastT = w.t;
          rec.load += load; rec.sets += sets; rec.count++;
        });
      });
    });
    return out;
  }

  /* Map each muscle to current recovery: how fresh, how loaded. fatigue 0..1,
   * days since last stimulus, and a boolean readiness flag. */
  function muscleRecovery(workouts, now, opts) {
    opts = opts || {};
    var ft = footprints(workouts);
    var nowMs = now || Date.now();
    var half = opts.halfLifeMs || (24 * DAY);   /* fatigue halves every 24h */
    var loadCap = opts.loadCap || 4000;         /* saturate the load factor */
    var out = {};
    Object.keys(ft).forEach(function (id) {
      var r = ft[id];
      var days = Math.max(0, (nowMs - r.lastT) / DAY);
      var decay = Math.exp(-Math.LN2 * days);   /* 1 today, ~0.5 after a day */
      var vol = Math.min(1, r.load / loadCap);
      var fatigue = clamp01(0.6 * decay + 0.4 * vol);
      out[id] = {
        lastT: r.lastT, days: days, load: r.load, sets: r.sets,
        fatigue: Math.round(fatigue * 100) / 100,
        fresh: fatigue < 0.3, tired: fatigue >= 0.6
      };
    });
    return out;
  }

  /* Volume balance over a trailing window: per-muscle load + share of total. */
  function balanceOf(workouts, windowMs, now) {
    windowMs = windowMs || (28 * DAY);
    var nowMs = now || Date.now();
    var totalLoad = 0;
    var loads = {};
    (workouts || []).forEach(function (w) {
      if (nowMs - w.t > windowMs) return;
      (w && w.entries || []).forEach(function (e) {
        var load = setLoad(e);
        if (!load) return;
        var muscles = e.muscleGroups && e.muscleGroups.length ? e.muscleGroups : ["_workout_only"];
        muscles.forEach(function (mg) {
          loads[mg] = (loads[mg] || 0) + load;
          totalLoad += load;
        });
      });
    });
    var out = {};
    Object.keys(loads).forEach(function (id) {
      out[id] = { load: Math.round(loads[id] * 10) / 10, share: totalLoad ? loads[id] / totalLoad : 0 };
    });
    return out;
  }

  return {
    setLoad: setLoad, setCount: setCount, footprints: footprints,
    muscleRecovery: muscleRecovery, balanceOf: balanceOf
  };
});