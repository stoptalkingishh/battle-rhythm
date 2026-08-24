"use strict";
/* Pure push-notification helpers shared by the browser app (loads as
 * window.BR_NOTIFICATIONS) and the Node test suite (node:test).
 *
 * This module is strictly side-effect-free: no timers, no DOM, no
 * Notification API, no localStorage, no Date reads at definition time.
 * Callers feed in the current time / today's ISO date explicitly so every
 * branch is deterministic and testable. It answers two questions the app
 * (and, eventually, a service worker) turns into a user-visible alert:
 *
 *   - REST-TIMER ALERTS — when a guided-workout rest countdown has elapsed
 *     and a "rest over / start the next set" notification should fire. The
 *     "fire exactly once per expiration" logic is factored out so a polling
 *     tick (or a background worker) can't spam a notification every frame
 *     after the countdown reaches 0.
 *
 *   - MISSED-SESSION REMINDERS — given the recurring weekly plan (the same
 *     Monday-first weekday->session map used by weekly-plan.js) plus the
 *     dates a workout was actually logged, which planned days have gone by
 *     without being done, so the app can nudge the user to get back on
 *     rhythm.
 *
 * Nothing here throws special exceptions beyond the input guards; bad input
 * degrades to a safe "no notification". Weekday indices follow the project's
 * Monday-first convention (0 = Monday .. 6 = Sunday).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_NOTIFICATIONS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  /* How far back (in days) missed-session detection scans the weekly plan.
   * A full weekly cycle plus a couple of days' slack, so a session scheduled
   * early last week is still caught this week. */
  var LOOKBACK_DAYS = 14;

  var DAY_MS = 24 * 60 * 60 * 1000;

  function hasValue(k) { return k != null && k !== ""; }

  /* -- self-contained ISO date helpers (computed in UTC for stable math) -- */
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
  /* Monday-first weekday index (0 = Mon .. 6 = Sun) for a YYYY-MM-DD date. */
  function weekdayFor(isoDate) {
    var p = parseISO(isoDate);
    var dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sun .. 6 = Sat
    return (dow + 6) % 7;
  }
  /* Whole ISO dates elapsed from dayA to dayB (dayB being later). */
  function daysBetweenIso(dayA, dayB) {
    var a = Date.UTC(parseISO(dayA).y, parseISO(dayA).m - 1, parseISO(dayA).d);
    var b = Date.UTC(parseISO(dayB).y, parseISO(dayB).m - 1, parseISO(dayB).d);
    return Math.round((b - a) / DAY_MS);
  }

  /* ======================================================================
   * REST-TIMER ALERTS
   * ====================================================================== */

  /* True once the rest countdown has fully elapsed (now >= deadline). */
  function isRestOver(deadlineMs, nowMs) {
    return (nowMs || 0) >= (deadlineMs || 0);
  }

  /* Milliseconds until a deadline — used to setTimeout a notification at
   * exactly the moment the rest ends. Never negative. */
  function delayUntil(deadlineMs, nowMs) {
    return Math.max(0, (deadlineMs || 0) - (nowMs || 0));
  }

  /* Whether a "rest over" notification should fire for the given countdown,
   * on this tick. The caller keeps lastFiredMs (when it last fired for THIS
   * rest timer) and passes it back; firing stores nowMs as lastFiredMs.
   *
   * Rules:
   *   - while still resting (or within an optional graceMs buffer after the
   *     deadline), nothing fires ({ fired:false, reason:"resting" })
   *   - on the transition, it fires exactly once ({ fired:true }) because
   *     lastFiredMs (prior to the deadline) is older than the deadline
   *   - on later ticks lastFiredMs is now >= deadline, so it will not refire
   *     until the caller moves the deadline for a brand-new rest countdown.
   */
  function restAlert(deadlineMs, nowMs, lastFiredMs, graceMs) {
    var deadline = deadlineMs || 0;
    var now = nowMs || 0;
    var grace = graceMs || 0;
    if (now < deadline + grace) {
      return { fired: false, reason: "resting" };
    }
    if (lastFiredMs && lastFiredMs >= deadline) {
      return { fired: false, reason: "already-fired" };
    }
    return {
      fired: true,
      elapsed: true,
      secondsOver: Math.floor((now - deadline) / 1000)
    };
  }

  /* Compose the payload the app (or a service worker) shows for a rest-timer
   * alert. opts: { restSeconds, nextLabel }. nextLabel describes what starts
   * next, e.g. "the next set" or "Round 2". */
  function buildRestAlert(opts) {
    opts = opts || {};
    var restSeconds = Number.isFinite(Number(opts.restSeconds)) ? Math.max(0, Math.floor(Number(opts.restSeconds))) : 0;
    var label = hasValue(opts.nextLabel) ? String(opts.nextLabel) : "the next set";
    var dur = restSeconds + "s";
    if (restSeconds >= 60) {
      var m = Math.floor(restSeconds / 60);
      var s = restSeconds % 60;
      dur = m + " min" + (s ? " " + s + "s" : "");
    }
    return {
      kind: "rest-over",
      title: "Rest over",
      body: (dur !== "0s" ? "Your " + dur + " rest is done. " : "") + "Time for " + label + ".",
      restSeconds: restSeconds
    };
  }

  /* ======================================================================
   * MISSED-SESSION REMINDERS
   * ====================================================================== */

  function resolveName(ref, references) {
    var refs = references || [];
    for (var i = 0; i < refs.length; i++) {
      if (refs[i] && refs[i].id === ref) return refs[i].name;
    }
    return ref;
  }

  /* Scan the trailing LOOKBACK_DAYS for planned weekdays that have gone by
   * without a logged workout. plan is the Monday-first weekday->session ref
   * map (0 = Mon .. 6 = Sun); todayIso is "YYYY-MM-DD"; loggedDates is an
   * array of ISO dates already completed. Returns the missed sessions sorted
   * oldest-first, each { isoDate, weekday, weekdayName, ref, name,
   * daysMissed }. A day scheduled TODAY is never "missed" — it isn't over yet
   * (see dueToday for the same-day reminder). */
  function missedSessions(plan, todayIso, loggedDates, references) {
    var today = todayIso || isoFromUTC(Date.now());
    var logged = {};
    (loggedDates || []).forEach(function (d) { if (hasValue(d)) logged[String(d)] = true; });

    var out = [];
    for (var back = LOOKBACK_DAYS; back >= 1; back--) {
      var dayIso = isoFromUTC(
        Date.UTC(parseISO(today).y, parseISO(today).m - 1, parseISO(today).d) - back * DAY_MS
      );
      var ref = plan ? plan[weekdayFor(dayIso)] : undefined;
      if (!hasValue(ref) || logged[dayIso]) continue;
      var wd = weekdayFor(dayIso);
      out.push({
        isoDate: dayIso,
        weekday: wd,
        weekdayName: WEEKDAY_NAMES[wd],
        ref: ref,
        name: resolveName(ref, references),
        daysMissed: back
      });
    }
    return out; // oldest-first: largest back (farthest past) was pushed first
  }

  /* The session scheduled for today, if it hasn't been logged yet — the
   * "you're on today" reminder. Returns null when today isn't planned or is
   * already done. */
  function dueToday(plan, todayIso, loggedDates, references) {
    var today = todayIso || isoFromUTC(Date.now());
    var logged = {};
    (loggedDates || []).forEach(function (d) { if (hasValue(d)) logged[String(d)] = true; });
    if (logged[today]) return null;
    var wd = weekdayFor(today);
    var ref = plan ? plan[wd] : undefined;
    if (!hasValue(ref)) return null;
    return {
      isoDate: today,
      weekday: wd,
      weekdayName: WEEKDAY_NAMES[wd],
      ref: ref,
      name: resolveName(ref, references),
      daysMissed: 0
    };
  }

  /* Compose the payload for one missed (or due-today) session item. */
  function buildMissedReminder(item) {
    if (!item || !hasValue(item.ref)) return null;
    var name = hasValue(item.name) ? item.name : item.ref;
    var when;
    if (item.daysMissed === 0) when = "is on your plan today";
    else if (item.daysMissed === 1) when = "was due yesterday";
    else when = "was due " + item.daysMissed + " days ago";
    return {
      kind: "missed-session",
      title: item.daysMissed === 0 ? "Session on today" : "Skipped a session",
      body: name + " " + when + " but isn't logged yet. Get back on rhythm.",
      isoDate: item.isoDate,
      ref: item.ref
    };
  }

  return {
    LOOKBACK_DAYS: LOOKBACK_DAYS,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    weekdayFor: weekdayFor,
    isRestOver: isRestOver,
    delayUntil: delayUntil,
    restAlert: restAlert,
    buildRestAlert: buildRestAlert,
    missedSessions: missedSessions,
    dueToday: dueToday,
    buildMissedReminder: buildMissedReminder
  };
});