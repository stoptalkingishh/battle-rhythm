"use strict";
/* Automatic progression, adapted for Battle Rhythm (reference behavior modeled
 * on openGym's progression module, rewritten clean here).
 *
 * Everything is a pure function of your logged workout history. Nothing writes
 * back into a finished session: the log is what happened, and the next
 * prescription (target weight / reps / duration) is *derived* each time it is
 * asked for. That keeps the suggestion honest — a mistyped set, or a changed
 * policy, immediately produces the right next target with no stored counters.
 *
 * Reading a session honestly is the whole game:
 *    a set checked off with >= its target reps  -> hit
 *    a set checked off with fewer reps          -> miss (you logged what you got)
 *    a set never checked off                    -> miss (it was not performed)
 *    fewer sets than prescribed                 -> miss
 * So a session that fell apart never advances the load as though it had won.
 *
 * Works on the same normalized `workouts` shape as onerm.js / set-history.js
 * and the exercise plan (`cfg`) that previded the target you logged against.
 */
(function (root, factory) {// eslint-disable-line indent
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./set-history.js"));
  } else {
    root.BR_PROGRESSION = factory(root.BR_SET_HISTORY);
  }
})(typeof self !== "undefined" ? self : this, function (SH) {
  var POLICIES = ["off", "linear", "greyskull", "double", "time"];
  var POLICIES_FOR = {
    reps: ["off", "linear", "greyskull", "double"],
    time: ["off", "time"],
    cardio: ["off"]
  };
  var POLICY_NAME = {
    off: "No automatic progression",
    linear: "Linear progression",
    greyskull: "Greyskull LP",
    double: "Double progression",
    time: "Add time"
  };
  var POLICY_DESC = {
    off: "Targets stay where you set them.",
    linear: "Hit every rep in every set and the weight goes up. Repeated misses trigger a deload.",
    greyskull: "Two straight sets plus a final set to failure. Beat the target on that set and the weight goes up — double if you double the reps. One failure resets 10%.",
    double: "Work up through a rep range at the same weight. Reach the top of the range in every set and the weight goes up, reps back to the bottom.",
    time: "Hold every set for the full duration and the target goes up."
  };
  var DELOAD_AFTER = { linear: 3, greyskull: 1, double: 3, time: 3 };
  var DELOAD_FACTOR = 0.9;
  var HEAVY_HINT = /barbell|hex|trap|deadlift|hip belt|sled|ruck/i;
  var DEFAULT_SEC_INCREMENT = 5;
  var MAX_BW_SETS = 6;

  function isWarmupRow(s) { return !!(s && (s.warmup || s.phase === "warmup")); }

  /* Default load step. Lower-body / heavy-bar lifts take the bigger jump. An
   * exercise can override with cfg.inc. */
  function defaultIncrement(exId, unit, ex) {
    var heavy = ex && (HEAVY_HINT.test(ex.equipment || "") || HEAVY_HINT.test(ex.name || ""));
    var unitStr = unit || "";
    if (unitStr.toLowerCase().indexOf("lb") !== -1) return heavy ? 10 : 5;
    return heavy ? 5 : 2.5;
  }

  /* The policy in force for one exercise: its own override, else the routine's
   * default, else the mode's default (reps keeps "all reps -> add a step"). */
  function policyFor(cfg, routine, mode) {
    var m = mode || SH.modeOf(cfg || {});
    var allowed = POLICIES_FOR[m] || ["off"];
    var pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === "reps" ? "linear" : "off");
    return allowed.indexOf(pick) !== -1 ? pick : "off";
  }

  function round1(v) { return Math.round(v * 10) / 10; }
  function snap(v, step) {
    if (!(step > 0)) return round1(v);
    return round1(Math.round(v / step) * step);
  }
  /* Back off by DELOAD_FACTOR, landing on a loadable multiple; a deload that
   * would not actually reduce anything takes one step down instead. */
  function deloadTo(cur, step) {
    var next = snap(cur * DELOAD_FACTOR, step);
    if (next >= cur) next = snap(cur - step, step);
    return Math.max(step, next);
  }

  /* Reduce one finished workout entry to what a policy needs to judge it.
   * An entry logged without its own target is judged against `fallback` (the
   * exercise's current plan) so old history is not scored as wholesale misses. */
  function readSession(entry, fallback) {
    var target = (entry && entry.target) || fallback || {};
    var mode = SH.modeOf(target);
    var sets = ((entry && entry.sets) || []).filter(function (s) { return !isWarmupRow(s); });
    var planned = target.sets || sets.length;
    var enough = sets.length >= planned;

    if (mode === "time") {
      var goal = target.sec || 0;
      var held = sets.map(function (s) { return (s.done ? (s.sec || 0) : 0); });
      return {
        mode: mode, goal: goal, held: held,
        weight: safeMax(sets, "w"),
        best: held.reduce(function (m, h) { return Math.max(m, h); }, 0),
        ok: goal > 0 && enough && held.length > 0 && held.every(function (h) { return h >= goal; })
      };
    }
    var reps = sets.map(function (s) { return (s.done ? (s.r || 0) : 0); });
    return {
      mode: mode, goal: target.reps || 0, reps: reps,
      weight: safeMax(sets, "w"),
      count: reps.length,
      low: reps.length ? Math.min.apply(null, reps) : 0,
      amrap: reps.length ? reps[reps.length - 1] : 0,
      ok: (target.reps || 0) > 0 && enough && reps.length > 0 && reps.every(function (r) { return r >= (target.reps || 0); })
    };
  }

  function safeMax(sets, key) {
    var m = 0;
    (sets || []).forEach(function (s) {
      if (s.done) { var v = Number(s[key]) || 0; if (v > m) m = v; }
    });
    return m;
  }

  /* Every past session for one exercise, oldest first. */
  function sessionsFor(workouts, exId, fallback) {
    var out = [];
    (workouts || []).forEach(function (w) {
      var entry = (w.entries || []).filter(function (e) { return e.id === exId; })[0];
      if (!entry) return;
      if ((entry.sets || []).some(function (s) { return s.done && !isWarmupRow(s); })) {
        var r = readSession(entry, fallback);
        out.push({ d: w.d, t: w.t, mode: r.mode, goal: r.goal, reps: r.reps, weight: r.weight, count: r.count, low: r.low, amrap: r.amrap, ok: r.ok });
      }
    });
    return out;
  }

  /* Sessions in a row ending in a miss, counting back from the most recent. */
  function stallCount(sessions) {
    var n = 0;
    for (var i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].ok) break;
      n++;
    }
    return n;
  }

  /* The next prescription for one exercise.
   * Returns { weight?, reps?, sec?, sets?, policy, kind, why } — kind is one of
   * first | up | hold | deload | off. An undefined field means "keep the plan as
   * it was". */
  function nextPrescription(workouts, cfg, routine, unit) {
    var mode = SH.modeOf(cfg || {});
    var policy = policyFor(cfg, routine, mode);
    var ex = (cfg && cfg.ex) || null;
    var inc = (cfg && cfg.inc > 0) ? cfg.inc : (mode === "time" ? DEFAULT_SEC_INCREMENT : defaultIncrement(cfg && cfg.id, unit, ex));
    if (policy === "off") return { policy: policy, kind: "off" };

    var sessions = sessionsFor(workouts, cfg && cfg.id, cfg).filter(function (s) { return s.mode === mode; });
    var last = sessions[sessions.length - 1];
    if (!last) return { policy: policy, kind: "first", why: ["Nothing logged yet — this session sets the baseline."] };

    var stalls = stallCount(sessions);
    var deloadAt = DELOAD_AFTER[policy] || 3;

    if (mode === "time") {
      if (last.ok) {
        var secUp = (last.goal || (cfg && cfg.sec) || 0) + inc;
        return { policy: policy, kind: "up", sec: secUp, why: ["Held every set for the full time — target up by " + inc + "s."] };
      }
      if (stalls >= deloadAt) {
        var secDel = deloadTo(last.goal || (cfg && cfg.sec) || 0, 5);
        return { policy: policy, kind: "deload", sec: secDel, why: ["Short " + stalls + " sessions in a row — back off to " + secDel + "s and build up again."] };
      }
      return { policy: policy, kind: "hold", sec: last.goal || (cfg && cfg.sec), why: ["Last time came up short — same target again."] };
    }

    var w = last.weight;
    /* Bodyweight work carries no external load: progress in reps, not plates.
       Trigger is the *logged* weight, so a dip with a belt (w > 0) still uses the
       normal policies and a barbell logged at 0 has nothing to add. */
    if (w <= 0) {
      var goal = last.goal || (cfg && cfg.reps) || 0;
      if (!last.ok || goal <= 0) {
        return { policy: policy, kind: "hold", weight: 0, reps: goal || undefined, why: ["Bodyweight — same target again until every set is clean."] };
      }
      var top = (cfg && cfg.repsMax > 0) ? cfg.repsMax : 0;
      if (top > 0 && goal >= top) {
        var sets = Math.max(1, (cfg && cfg.sets) || last.count || 1) + 1;
        var bottom = Math.max(1, Math.min((cfg && cfg.reps) || top, top));
        if (sets <= MAX_BW_SETS) {
          return { policy: policy, kind: "up", weight: 0, reps: bottom, sets: sets, why: [goal + " reps in every set — add a set and go back to " + bottom + "."] };
        }
        return { policy: policy, kind: "hold", weight: 0, reps: goal, why: [(sets - 1) + " sets of " + goal + " — time to add weight or move to a harder variation."] };
      }
      var next = goal + SH.repStep(cfg || {});
      return { policy: policy, kind: "up", weight: 0, reps: next, why: ["Bodyweight — every rep last time, so go for " + next + " this time."] };
    }

    if (policy === "double") {
      var topD = (cfg && cfg.reps) || last.goal || 10;
      var bottomD = Math.min((cfg && cfg.repsMin) || Math.max(1, topD - 2), topD);
      if (last.ok) {
        return { policy: policy, kind: "up", weight: snap(w + inc, inc), reps: bottomD, why: ["Top of the rep range in every set — " + inc + " " + (unit || "") + " more, back to " + bottomD + " reps."] };
      }
      if (stalls >= deloadAt) {
        var dwD = deloadTo(w, inc);
        return { policy: policy, kind: "deload", weight: dwD, reps: bottomD, why: ["Stalled " + stalls + " sessions — deload to " + dwD + " " + (unit || "") + "."] };
      }
      var aim = Math.min(topD, Math.max(bottomD, last.low + SH.repStep(cfg || {})));
      return { policy: policy, kind: "hold", weight: w, reps: aim, why: ["Same weight — aim for " + aim + " reps this time."] };
    }

    /* linear + greyskull */
    if (last.ok) {
      var dbl = policy === "greyskull" && last.goal > 0 && last.amrap >= last.goal * 2;
      var step = dbl ? inc * 2 : inc;
      return {
        policy: policy, kind: "up", weight: snap(w + step, inc),
        why: dbl
          ? ["Last set hit " + last.amrap + " reps — twice the target, so take a double jump of " + step + " " + (unit || "") + "."]
          : ["Every rep last time — " + step + " " + (unit || "") + " more."]
      };
    }
    if (stalls >= deloadAt) {
      var dw = deloadTo(w, inc);
      return {
        policy: policy, kind: "deload", weight: dw,
        why: ["Missed reps " + stalls + " sessions running — reset to " + dw + " " + (unit || "") + " and work back up."]
      };
    }
    return { policy: policy, kind: "hold", weight: w, why: ["Missed reps last time — same weight again (" + (deloadAt - stalls) + " of " + deloadAt + " to go)."] };
  }

  /* Apply a prescription to a freshly built set list. Only fields the policy
   * decided on are touched, and only on sets that have not been logged yet and
   * are not warm-ups. */
  function applyPrescription(sets, p) {
    if (!p || p.kind === "off" || p.kind === "first") return sets;
    var out = (sets || []).map(function (s) {
      if (!s || s.done || isWarmupRow(s)) return s;
      var o = {};
      for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k]; }
      if (p.weight != null) o.w = p.weight;
      if (p.reps != null) o.r = p.reps;
      if (p.sec != null) o.sec = p.sec;
      return o;
    });
    var workRows = out.filter(function (s) { return !isWarmupRow(s); });
    if (p.sets > workRows.length && workRows.length) {
      var seed = workRows[workRows.length - 1];
      while (out.filter(function (s) { return !isWarmupRow(s); }).length < p.sets) {
        var copy = {};
        for (var kk in seed) { if (Object.prototype.hasOwnProperty.call(seed, kk)) copy[kk] = seed[kk]; }
        copy.done = false;
        out.push(copy);
      }
    }
    return out;
  }

  return {
    POLICIES: POLICIES,
    POLICIES_FOR: POLICIES_FOR,
    POLICY_NAME: POLICY_NAME,
    POLICY_DESC: POLICY_DESC,
    DELOAD_AFTER: DELOAD_AFTER,
    DEFAULT_SEC_INCREMENT: DEFAULT_SEC_INCREMENT,
    MAX_BW_SETS: MAX_BW_SETS,
    defaultIncrement: defaultIncrement,
    policyFor: policyFor,
    isWarmupRow: isWarmupRow,
    readSession: readSession,
    sessionsFor: sessionsFor,
    stallCount: stallCount,
    nextPrescription: nextPrescription,
    applyPrescription: applyPrescription
  };
});