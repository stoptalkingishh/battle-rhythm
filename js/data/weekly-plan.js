"use strict";
/* Pure weekly-plan + reschedule helpers shared by the browser app (loads as
 * window.BR_WEEKLY_PLAN) and the Node test suite (node:test).
 *
 * The app keeps a privacy-local, Drive-synced weekly plan of what session runs
 * on each day of the week: br_week -> week.json. The plan is a plain object
 * keyed by weekday index 0..6 with Monday first (0 = Monday, 6 = Sunday), each
 * value a session id/slug like the openGym weekday plan (S.week) but re-keyed
 * to Monday-first and reimplemented here. Only side-effect-free logic lives in
 * this module; reading localStorage and writing through Drive sync stays in
 * app.js. Every function that takes a plan returns a NEW plan object and never
 * mutates the input. Rescheduling (move) returns { ok, plan, reason } so the
 * caller can keep the target occupied; existing sessions are never overwritten
 * silently.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_WEEKLY_PLAN = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Weekday layout, Monday first. Index doubles as the plan key. */
  var WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function hasValue(k) { return k != null && k !== ""; }

  function clonePlan(plan) {
    var out = {};
    if (plan) {
      Object.keys(plan).forEach(function (k) {
        out[k] = plan[k];
      });
    }
    return out;
  }

  function assertWeekday(weekday) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new RangeError("weekday must be an integer in 0..6 (Monday-first): " + weekday);
    }
  }

  /* -- ISO date helpers, all computed in UTC so calendar math is timezone-stable -- */
  function parseISO(iso) {
    var p = String(iso).split("-");
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }
  function isoFromUTC(ms) {
    var dt = new Date(ms);
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function addDaysISO(iso, days) {
    var p = parseISO(iso);
    return isoFromUTC(Date.UTC(p.y, p.m - 1, p.d + days));
  }

  /* Monday-first weekday index (0 = Mon .. 6 = Sun) for a YYYY-MM-DD date. */
  function weekdayFor(isoDate) {
    var p = parseISO(isoDate);
    var dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sun .. 6 = Sat
    return (dow + 6) % 7;
  }

  /* Map a session on a given weekday. Validates weekday 0..6; returns a new plan. */
  function assign(plan, weekday, sessionRef) {
    assertWeekday(weekday);
    if (typeof sessionRef !== "string" || sessionRef === "") {
      throw new RangeError("sessionRef must be a non-empty string: " + sessionRef);
    }
    var out = clonePlan(plan);
    out[weekday] = sessionRef;
    return out;
  }

  /* Remove the session from a weekday; returns a new plan. */
  function clear(plan, weekday) {
    assertWeekday(weekday);
    var out = clonePlan(plan);
    delete out[weekday];
    return out;
  }

  /* Reschedule a session from fromWeekday to toWeekday.
   * Returns { ok, plan, reason } — ok is false (and the plan is returned
   * unchanged) when the source is empty, the day is the same, or the target is
   * already occupied, so an existing session is never silently overwritten.
   * The caller (app.js) can surface the reason as a warning. */
  function move(plan, fromWeekday, toWeekday) {
    assertWeekday(fromWeekday);
    assertWeekday(toWeekday);
    var src = plan ? plan[fromWeekday] : undefined;
    if (!hasValue(src)) return { ok: false, plan: clonePlan(plan), reason: "no-session" };
    if (fromWeekday === toWeekday) return { ok: false, plan: clonePlan(plan), reason: "same-day" };
    var dst = plan ? plan[toWeekday] : undefined;
    if (hasValue(dst)) return { ok: false, plan: clonePlan(plan), reason: "occupied" };
    var out = clonePlan(plan);
    delete out[fromWeekday];
    out[toWeekday] = src;
    return { ok: true, plan: out, ref: src, from: fromWeekday, to: toWeekday };
  }

  /* Which sessions fall in the ISO week starting on the given Monday.
   * references is an array of session objects ({ id, name, ... }) used to
   * resolve each ref; a ref with no match keeps the slug as its name. Returns
   * entries for every planned weekday, ordered Mon..Sun. */
  function sessionsFor(plan, weekStartIso, references) {
    var refs = references || [];
    var out = [];
    for (var wd = 0; wd <= 6; wd++) {
      var ref = plan ? plan[wd] : undefined;
      if (!hasValue(ref)) continue;
      var found = null;
      for (var i = 0; i < refs.length; i++) {
        if (refs[i] && refs[i].id === ref) { found = refs[i]; break; }
      }
      out.push({
        weekday: wd,
        isoDate: addDaysISO(weekStartIso, wd),
        ref: ref,
        name: found ? found.name : ref,
        session: found
      });
    }
    return out;
  }

  /* The session for a specific YYYY-MM-DD date, resolved purely from its
   * weekday (Monday-first). Returns the session slug, or null if that day is
   * not scheduled. Maps openGym's effectiveRoutineId weekday path. */
  function activeFor(plan, isoDate) {
    var ref = plan ? plan[weekdayFor(isoDate)] : undefined;
    return hasValue(ref) ? ref : null;
  }

  /* Weekday indices (0..6, Monday-first) that have a session scheduled. */
  function weekdays(plan) {
    var out = [];
    for (var wd = 0; wd <= 6; wd++) {
      if (hasValue(plan ? plan[wd] : undefined)) out.push(wd);
    }
    return out;
  }

  return {
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    WEEKDAY_SHORT: WEEKDAY_SHORT,
    weekdayFor: weekdayFor,
    assign: assign,
    clear: clear,
    move: move,
    sessionsFor: sessionsFor,
    activeFor: activeFor,
    weekdays: weekdays
  };
});