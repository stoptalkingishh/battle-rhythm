"use strict";
/* Activity heatmap — a GitHub-style year grid of training days, adapted for
 * Battle Rhythm (reference behavior modeled on openGym's heatmap component).
 * Pure + unit-test...
 * testable; app.js just renders the returned grid.
 *
 * Input : workouts = [{ d: isoDate, t: ms, entries }]  (one item per session-day)
 * Output: weeks = [ [ { iso, level }, x7 ], ... ]  with level in 0..4.
 * Weeks run Monday → Sunday, anchored so the grid ends on the week containing
 * the supplied end date; the first row is padded with blanks for alignment.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_HEATMAP = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Bucket a single day's session count into a 0..4 shade. */
  function levelFor(count) {
    if (!count || count < 1) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 5) return 3;
    return 4;
  }

  /* iso "YYYY-MM-DD" -> session count for that calendar day. */
  function countsByDay(workouts) {
    var out = {};
    (workouts || []).forEach(function (w) {
      if (w && w.d) out[w.d] = (out[w.d] || 0) + 1;
    });
    return out;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(date) { return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()); }

  /* Monday of the week containing `date`. JS getDay(): 0=Sun..6=Sat;
   * Monday index 1 => shift = (day + 6) % 7. */
  function mondayOf(date) {
    var shift = (date.getDay() + 6) % 7;
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
    return d;
  }

  /* 52 (occasionally 53) weeks ending on endDate's week. Each week is 7 cells;
   * cells before the start-of-year / after today render as blanks (iso ""). */
  function buildYearGrid(workouts, endDateIso) {
    var counts = countsByDay(workouts);
    var end = endDateIso ? new Date(endDateIso + "T12:00:00") : new Date();
    if (isNaN(end.getTime())) end = new Date();
    var endMonday = mondayOf(end);
    var today = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    /* Build an index day→level for the whole week range. */
    var index = {};
    var cursor = new Date(endMonday.getFullYear(), endMonday.getMonth(), endMonday.getDate());
    // walk back to find the Monday 52 weeks earlier
    cursor = new Date(cursor.getTime() - (52 * 7 - 1) * 86400000);
    var cursorMonday = mondayOf(cursor);

    var weeks = [];
    var c = new Date(cursorMonday.getTime());
    for (var w = 0; w < 53; w++) {
      if (c.getTime() > endMonday.getTime()) break;
      var cells = [];
      for (var day = 0; day < 7; day++) {
        if (isNaN(c.getTime()) || c.getTime() > today.getTime()) {
          cells.push({ iso: "", level: 0 });
        } else {
          var iso = isoOf(c);
          cells.push({ iso: iso, level: levelFor(counts[iso]) });
        }
        c = new Date(c.getTime() + 86400000);
      }
      weeks.push(cells);
    }
    return weeks;
  }

  return {
    levelFor: levelFor,
    countsByDay: countsByDay,
    buildYearGrid: buildYearGrid,
    isoOf: isoOf
  };
});