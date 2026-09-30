"use strict";
/* The English catalog (window.BR_LOCALE_EN) — the app's default bundle.
 *
 * These strings are NOT new copy: every value is the literal text that was
 * already inline in js/app.js and js/data/weekly-plan.js. The English catalog
 * is by construction the source of truth for current behavior, which is what
 * makes this a no-build extraction seam: with no other catalog registered,
 * BR_I18N.t(key) returns exactly what the app rendered before.
 *
 * Only the wired surface is catalogued (the weekly-plan card, its weekday
 * labels, and the shared Monday-first weekday vocabulary). Deliberately NOT a
 * machine translation of the whole app: a large unvetted catalog is worse
 * than a small honest one, because nobody can review it.
 *
 * Weekday entries are indexed by the Monday-first weekday the rest of the app
 * already uses (0 = Monday .. 6 = Sunday) so a locale can supply its own
 * ordering-independent names without changing any calling code.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_LOCALE_EN = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  return {
    /* Monday-first weekday names, the shared vocabulary. */
    "weekday.0": "Monday",
    "weekday.1": "Tuesday",
    "weekday.2": "Wednesday",
    "weekday.3": "Thursday",
    "weekday.4": "Friday",
    "weekday.5": "Saturday",
    "weekday.6": "Sunday",

    "weekly.title": "Weekly plan",
    "weekly.today": "Today: {name}",
    "weekly.nothingToday": "Nothing scheduled today.",
    "weekly.noSession": "— no session —",
    "weekly.noModule": "Weekly-plan module not loaded, or no saved sessions yet.",
    "weekly.reschedule": "Reschedule",
    "weekly.rescheduleLabel": "Reschedule:",
    "weekly.rescheduled": "Session rescheduled",
    "weekly.moveFailed": "Can't move: {reason}",

    /* Language selector, shown next to the weekly plan so the seam is
     * reachable without a console. */
    "language.label": "Language",
    "language.none": "English only for now"
  };
});
