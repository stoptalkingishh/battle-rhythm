"use strict";
/* The window.BR_* globals the app expects a <script> tag to publish, and a
 * pure check of which of them actually loaded.
 *
 * There is no build step (see CONTRIBUTING.md), so nothing fails at compile
 * time when a script 404s, is renamed, or is dropped from index.html. The
 * browser logs one line for the failed file and every feature behind that
 * global simply stops working - a silent capability loss. startCapabilities()
 * in js/app.js consults this list once, at startup, and shows a single
 * dismissible notice naming what is missing, so a partial deploy is
 * diagnosable from the UI instead of only through devtools.
 *
 * Required vs optional is the severity flag: a required global is read by
 * js/app.js with no local fallback, so losing it takes a whole core view
 * (Library, session builder, AFT logging) with it. Every other global is
 * already read through a `|| null` guard - the var block at the top of app.js
 * is the authoritative list - so its feature disables itself and the app keeps
 * running.
 *
 * Loaded as window.BR_CAPABILITIES and required in Node as
 * js/data/capabilities.js; pure (no DOM, no storage), so a test can hand
 * inspect() a plain name -> value object, including {}.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_CAPABILITIES = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* One entry per global the app depends on, in index.html load order (that
   * file is the deployment, so its script tags are the specification).
   * `module` is the file that is supposed to publish it - kept for the notice
   * and cross-checked against the real script tags in
   * tests/capabilities.test.js, so a rename fails CI instead of the app.
   *
   * js/config.js is deliberately absent: it publishes credentials and feature
   * flags, not a module, and scripts/check-config.mjs owns it. */
  var CAPABILITIES = [
    { global: "BR_EXERCISES", module: "js/data/exercises.js", required: true },
    { global: "BR_ATP_EXERCISES", module: "js/data/exercises-atp.js", required: true },
    { global: "BR_DOCTRINE", module: "js/data/doctrine.js", required: true },
    { global: "BR_MOVEMENT_GUIDES", module: "js/data/movement-guides.js", required: false },
    { global: "BR_MUSCLE_MAPS", module: "js/data/muscle-maps.js", required: false },
    { global: "BR_AI_PLATES", module: "assets/plates/ai/registry.js", required: false },
    { global: "BR_WORKOUT_CARDS", module: "js/data/workout-cards.js", required: false },
    { global: "BR_AFT_2MR", module: "js/data/aft-standards.js", required: false },
    { global: "BRRunVisual", module: "js/run-visual.js", required: false },
    { global: "BR_ATP_FIGURES", module: "js/data/atp-figures.js", required: false },
    { global: "BR_ATPF", module: "js/data/atp-figures.js", required: false },
    { global: "BRExerciseCoach", module: "js/exercise-coach.js", required: false },
    { global: "BR_PRESET_WORKOUTS", module: "js/data/preset-workouts.js", required: false },
    { global: "BRAFTResults", module: "js/data/aft-results.js", required: true },
    { global: "BRTrackerSchema", module: "js/data/tracker-schema.js", required: false },
    { global: "BRTimerCore", module: "js/data/timer-core.js", required: false },
    { global: "BRSync", module: "js/sync-core.js", required: false },
    { global: "BRDrive", module: "js/drive.js", required: false },
    { global: "BRCloud", module: "js/cloud.js", required: false },
    { global: "BRTimer", module: "js/timer.js", required: false },
    { global: "BR_SET_HISTORY", module: "js/data/set-history.js", required: false },
    { global: "BR_PROGRESSION", module: "js/data/progression.js", required: false },
    { global: "BR_ONE_RM", module: "js/data/onerm.js", required: false },
    { global: "BR_MUSCLE_GROUPS", module: "js/data/muscle-groups.js", required: false },
    { global: "BR_HISTORY_ADAPTER", module: "js/data/history-adapter.js", required: false },
    { global: "BR_WAKELOCK", module: "js/data/wakelock.js", required: false },
    { global: "BR_HEATMAP", module: "js/data/heatmap.js", required: false },
    { global: "BR_PLAN_SHARE", module: "js/data/plan-share.js", required: false },
    { global: "BR_RECOVERY", module: "js/data/recovery.js", required: false },
    { global: "BR_BODYWEIGHT", module: "js/data/bodyweight.js", required: false },
    { global: "BR_SUPERSETS", module: "js/data/supersets.js", required: false },
    { global: "BR_WEEKLY_PLAN", module: "js/data/weekly-plan.js", required: false },
    { global: "BR_FREESTYLE_PREFILL", module: "js/data/freestyle-prefill.js", required: false },
    { global: "BR_CUSTOM", module: "js/data/custom-exercises.js", required: false },
    { global: "BR_NOTIFICATIONS", module: "js/data/notifications.js", required: false },
    { global: "BRChart", module: "js/chart.js", required: false },
    { global: "BR_DOM_ATTRS", module: "js/data/dom-attrs.js", required: false },
    { global: "BR_FILTERS", module: "js/data/filters.js", required: true },
    { global: "BR_SESSION_TEXT", module: "js/data/session-text.js", required: true },
    { global: "BR_DATA_EXPORT", module: "js/data/data-export.js", required: false },
    /* Localization (#20). BR_I18N is the lookup itself and is read in app.js
     * only through a `|| null` guard that degrades to the key string, so a
     * miss renders raw keys rather than blank copy - optional on purpose. The
     * catalogs are data: losing one removes a language, and the English
     * default is the one that must never be the casualty, so all three are
     * listed so a 404 is visible in the notice. */
    { global: "BR_I18N", module: "js/data/i18n.js", required: false },
    { global: "BR_LOCALE_EN", module: "js/data/locale-en.js", required: false },
    { global: "BR_LOCALE_ES", module: "js/data/locale-es.js", required: false }
  ];

  /* null/undefined only. An empty array or object means the file loaded and
   * published something - a module with no data is not a failed script, and
   * calling it missing would send the maintainer hunting for a 404 that is not
   * there. */
  function isPresent(value) { return value != null; }

  function names() {
    return CAPABILITIES.map(function (cap) { return cap.global; });
  }

  /* globals: the object to check - `window` in the browser, or any plain
   * name -> value map in a test. Returns present names plus missing entries
   * (name, module, required), split by severity. `ok` is about the app still
   * working, so only required misses clear it: an optional miss is a disabled
   * feature, not an outage. */
  function inspect(globals) {
    var g = globals || {};
    var report = {
      present: [],
      missing: [],
      missingRequired: [],
      missingOptional: [],
      ok: true
    };
    CAPABILITIES.forEach(function (cap) {
      if (isPresent(g[cap.global])) {
        report.present.push(cap.global);
        return;
      }
      report.missing.push({ name: cap.global, module: cap.module, required: cap.required });
      if (cap.required) report.missingRequired.push(cap.global);
      else report.missingOptional.push(cap.global);
    });
    report.ok = report.missingRequired.length === 0;
    return report;
  }

  /* The user-facing sentence, or null when nothing is missing. Built here
   * rather than in app.js so the wording (the module names, and whether the
   * loss is disabling or fatal) is testable without a DOM. Required entries
   * are marked, because they are what explains an app that looks broken. */
  function message(report) {
    if (!report || !report.missing.length) return null;
    var labels = report.missing.map(function (m) {
      return m.required ? m.name + " (required)" : m.name;
    });
    return "Missing module" + (labels.length === 1 ? "" : "s") + ": " + labels.join(", ") +
      ". Those features are unavailable until the page is reloaded with the script restored.";
  }

  return {
    CAPABILITIES: CAPABILITIES,
    isPresent: isPresent,
    names: names,
    inspect: inspect,
    message: message
  };
});
