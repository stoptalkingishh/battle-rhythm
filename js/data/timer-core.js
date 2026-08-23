"use strict";
/* Pure countdown-timer helpers shared by the browser app (loads as
 * window.BRTimerCore) and the Node test suite (node:test).
 *
 * This module is strictly side-effect-free: no timers, no DOM, no Date reads
 * at definition time — callers pass the current time (e.g. performance.now())
 * in explicitly so the math is deterministic and testable. Only the pieces
 * that make a countdown correct and bounded live here:
 *
 *   - parseDuration / fromDurationStr  -- turn "45 sec", "1:30", "60s", etc.
 *                                         into a whole number of seconds.
 *   - MAX_SECONDS / clamp               -- bound a countdown so it stays
 *                                         guided and can't run away.
 *   - remaining(deadlineMs, nowMs)      -- the drift-free countdown formula:
 *                                         always derived from a fixed deadline
 *                                         rather than by subtracting tick
 *                                         deltas, so a paused/hidden tab still
 *                                         lands on the exact right value.
 *   - format(ms)                        -- render remaining time as "MM:SS".
 *
 * All values are in milliseconds except the parsed/clamped seconds counts.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRTimerCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Bounded: a single guided-workout countdown is capped at 60 minutes.
   * Anything longer (or unparseable) is clamped so a mistyped rest value
   * can never start a runaway multi-hour timer. */
  var MAX_SECONDS = 3600;
  var MS = 1000;

  /* Parse a human duration like "45", "45s", "45 sec", "1:30", "2 min", or
   * "0:45" into whole seconds. Returns an integer >= 0, or 0 when the string
   * doesn't look like a duration. Colons are treated as [minutes:]seconds,
   * minutes can exceed 59. A plain number with no unit is seconds. */
  function parseDuration(str) {
    if (typeof str !== "string") return 0;
    var t = str.trim().toLowerCase();
    if (!t) return 0;

    if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(t)) {
      var parts = t.split(":").map(function (p) { return parseInt(p, 10); });
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) {
        var secs = parts[0] * 60 + parts[1];
        return parts[1] >= 60 ? 0 : secs; // mm:ss — seconds must be < 60
      }
      return 0;
    }

    var m = /^(\d*\.?\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)?$/.exec(t);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n < 0) return 0;
    var unit = m[2] || "s";
    var seconds;
    if (/^h/.test(unit)) seconds = n * 3600;
    else if (/^m/.test(unit)) seconds = n * 60;
    else seconds = n;
    return Math.round(seconds);
  }

  function clampToMax(seconds) {
    if (!isFinite(seconds) || seconds < 0) return 0;
    return Math.min(Math.floor(seconds), MAX_SECONDS);
  }

  /* Parse then bound a planned duration string (an item's rest or timed-set
   * value) into usable countdown seconds, clamped to MAX_SECONDS. */
  function fromDurationStr(str) {
    return clampToMax(parseDuration(str));
  }

  function maxSeconds() { return MAX_SECONDS; }

  /* Drift-free remaining time: always recomputed from the fixed deadline
   * against the supplied clock, never accumulated from tick deltas. */
  function remaining(deadlineMs, nowMs) {
    return Math.max(0, (deadlineMs || 0) - (nowMs || 0));
  }

  /* Render a non-negative millisecond countdown as "MM:SS" (or "H:MM:SS" at
   * or above one hour). Remaining fractions ceil to a full second so a fresh
   * timer shows its full configured time and "time's up" only ever shows 0. */
  function format(ms) {
    var total = Math.max(0, Math.ceil((ms || 0) / MS));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    if (h > 0) return h + ":" + pad(m) + ":" + pad(s);
    return pad(m) + ":" + pad(s);
  }

  return {
    MAX_SECONDS: MAX_SECONDS,
    maxSeconds: maxSeconds,
    parseDuration: parseDuration,
    clampToMax: clampToMax,
    fromDurationStr: fromDurationStr,
    remaining: remaining,
    format: format
  };
});