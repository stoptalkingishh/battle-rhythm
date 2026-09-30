"use strict";
/* A demonstration Spanish catalog (window.BR_LOCALE_ES).
 *
 * Scope, stated plainly: this is NOT a complete translation of Battle Rhythm.
 * It covers only the keys the weekly-plan card renders, and only where the
 * translation is one a maintainer can verify without a native speaker on
 * call (weekday names, and the handful of labels below). That is deliberate.
 * A machine-generated catalog for the whole app would look like coverage and
 * be unmaintainable; a small honest one is reviewable and proves the seam.
 *
 * It is also a live proof that the mechanism works end to end: register it,
 * BR_I18N.setLocale("es"), and the weekly-plan card changes language with no
 * build step. Every key it omits falls back to English per key, not to a
 * blank card — that fallback is the behavior worth having.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_LOCALE_ES = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  return {
    "weekday.0": "lunes",
    "weekday.1": "martes",
    "weekday.2": "miércoles",
    "weekday.3": "jueves",
    "weekday.4": "viernes",
    "weekday.5": "sábado",
    "weekday.6": "domingo",

    "weekly.today": "Hoy: {name}",
    "weekly.nothingToday": "Nada programado para hoy.",
    "weekly.noSession": "— sin sesión —",
    "weekly.reschedule": "Reprogramar",
    "weekly.rescheduleLabel": "Reprogramar:",
    "weekly.rescheduled": "Sesión reprogramada",
    "weekly.moveFailed": "No se puede mover: {reason}",

    "language.label": "Idioma"
  };
});
