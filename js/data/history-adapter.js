"use strict";
/* Adapter from Battle Rhythm's logged tracker store (br_tracker) into the
 * normalized `workouts` shape consumed by onerm.js and set-history.js:
 *
 *   workouts = [{ d (iso date), t (ms, sort key), entries: [{ id, sets }] }]
 *
 * Pure + unit-tested; app.js just calls workoutsFromLogs(logs) and passes the
 * result to the chart / tables.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./set-history.js"));
  } else {
    root.BR_HISTORY_ADAPTER = factory(root.BR_SET_HISTORY);
  }
})(typeof self !== "undefined" ? self : this, function (SH) {
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function msOf(dateStr) {
    var n = Date.parse(dateStr);
    return isFinite(n) ? n : 0;
  }

  /* Session sort key: completedAt if we have it, else the day start. */
  function sessionT(session, d) {
    if (session && typeof session.completedAt === "string" && session.completedAt) {
      var n = msOf(session.completedAt);
      if (n) return n;
    }
    return msOf(d);
  }

  /* Collect normalized workouts from logged, completed sessions. Does not
   * require the app's DOM or localStorage — takes the raw logs object. */
  function workoutsFromLogs(logs, opts) {
    opts = opts || {};
    var out = [];
    if (!isObj(logs)) return out;
    Object.keys(logs).forEach(function (date) {
      if (date === "schemaVersion") return;
      var day = logs[date];
      if (!isObj(day) || !isObj(day.sessions)) return;
      Object.keys(day.sessions).forEach(function (sid) {
        var session = day.sessions[sid];
        if (!isObj(session) || !isObj(session.results)) return;
        if (!(session.complete === true || opts.includeIncomplete)) return;
        var entries = [];
        Object.keys(session.results).forEach(function (itemId) {
          var res = session.results[itemId];
          var actual = res && isObj(res.actual) ? res.actual : null;
          if (!actual) return;
          var sets = SH.setsFromActual(actual);
          if (!sets.length) return;
          entries.push({ id: itemId, sets: sets });
        });
        if (!entries.length) return;
        out.push({ d: date, t: sessionT(session, date), entries: entries });
      });
    });
    /* Chronological, stable for ties. */
    out.sort(function (a, b) { return a.t - b.t || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0); });
    return out;
  }

  /* Unique exercise ids that have at least one (presently) estimable set —
   * used to populate the Progress-view exercise dropdown. */
  function exercisesWithSets(logs, opts) {
    var seen = {};
    workoutsFromLogs(logs, opts).forEach(function (w) {
      (w.entries || []).forEach(function (e) {
        if ((e.sets || []).some(function (s) { return s.w > 0 && s.r > 0; })) {
          seen[e.id] = true;
        }
      });
    });
    return Object.keys(seen).sort();
  }

  /* A log entry's results are keyed by the tracker item uid, which uid() mints
   * fresh for every session. Two sessions that both log the Deadlift therefore
   * arrive here under two unrelated ids, and neither resolves to an exercise
   * name in the Progress dropdown.
   *
   * This relabels each workout's entries with the exercise/drill `ref` from the
   * session snapshot that `lookup` supplies, falling back to the item id when
   * the snapshot is absent or has no matching item. Entries that share a ref
   * within one session are merged, so their sets are counted together in the
   * Progress sets/reps/volume row.
   *
   * `lookup(itemId, session)` returns the ref string, or a falsy value to keep
   * the item id. Pure: it takes the workouts, never the DOM or localStorage. */
  function keyWorkoutsByRef(workouts, lookup) {
    if (!Array.isArray(workouts) || typeof lookup !== "function") return [];
    return workouts.map(function (w) {
      var byRef = {};
      var order = [];
      (w.entries || []).forEach(function (e) {
        var ref = lookup(e.id, w);
        if (!ref) ref = e.id;
        if (!byRef[ref]) {
          byRef[ref] = { id: ref, sets: [] };
          order.push(ref);
        }
        byRef[ref].sets = byRef[ref].sets.concat(e.sets || []);
      });
      var out = {};
      out.d = w.d;
      out.t = w.t;
      out.entries = order.map(function (ref) { return byRef[ref]; });
      return out;
    });
  }

  /* Exercise ids in a keyed workout list that have an estimable (weight + reps)
   * set — the Progress dropdown's option list. */
  function exercisesWithSetsIn(workouts) {
    var seen = {};
    (workouts || []).forEach(function (w) {
      (w.entries || []).forEach(function (e) {
        if ((e.sets || []).some(function (s) { return s.w > 0 && s.r > 0; })) seen[e.id] = true;
      });
    });
    return Object.keys(seen).sort();
  }

  return {
    workoutsFromLogs: workoutsFromLogs,
    exercisesWithSets: exercisesWithSets,
    keyWorkoutsByRef: keyWorkoutsByRef,
    exercisesWithSetsIn: exercisesWithSetsIn
  };
});