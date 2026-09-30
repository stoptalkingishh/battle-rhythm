"use strict";
/* Plain-text serialisers behind the Copy and Copy-to-Notes actions: exercises,
 * doctrine drills, sessions, tracked sessions, and regiments.
 *
 * Extracted from js/app.js, where these six functions were the largest
 * self-contained block with no DOM dependency. The module is pure: every lookup
 * it needs — component labels, source labels, the phase vocabulary, exercise
 * resolution, and the tracker's actual-result summary — is supplied by the
 * caller through a context object. That is what makes it unit-testable with
 * node:test and no browser, which is the point of the extraction.
 *
 * app.js keeps one-line wrappers with the original signatures, so no call site
 * changed. Output is byte-for-byte what the app produced before the move —
 * tests/session-text.test.js pins the formatting, and the extraction was
 * verified against captured before/after output from the running app.
 *
 * Input shape: `session` is a builder session ({ name, duration, focus, rpe,
 * format, circuit, notes, phases: { prep|activity|recovery: { items } } }) and
 * `entry` is a tracker entry ({ complete, results: { [itemId]: { done, actual } } }).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_SESSION_TEXT = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* The training-machine vocabulary. The printed label and the Builder
   * dropdown are the same list, so both live here — app.js reads the options
   * from the module. Keeping one list is what stops the exported text and the
   * select drifting apart, which is exactly the bug a second copy would cause.
   */
  var MACHINE_OPTIONS = [
    { value: "none", label: "No machine (free weight / bodyweight)" },
    { value: "barbell", label: "Barbell rig" },
    { value: "hex-bar", label: "MDL hex bar" },
    { value: "cable", label: "Cable pulley column" },
    { value: "leg-press", label: "Leg press machine" },
    { value: "lat-pulldown", label: "Lat pulldown machine" },
    { value: "smith", label: "Smith machine" },
    { value: "treadmill", label: "Treadmill" },
    { value: "stationary-bike", label: "Stationary cycle" },
    { value: "erg-rower", label: "Rowing ergometer" }
  ];

  var PHASE_ORDER = ["prep", "activity", "recovery"];
  var PHASE_LABELS = { prep: "Preparation", activity: "Activity", recovery: "Recovery" };

  function machineLabel(value) {
    if (!value || value === "none") return "";
    var m = MACHINE_OPTIONS.find(function (o) { return o.value === value; });
    return m ? m.label : value;
  }

  /* ---------- defaults for an omitted context ---------- */

  function defaultComponent(id) { return id; }
  function defaultSource() { return "Reference"; }
  function noExercise() { return null; }
  function noSummary() { return ""; }

  /* ---------- items ---------- */

  function itemText(item) {
    var parts = [];
    if (item.sets) parts.push(item.sets + " sets");
    if (item.reps) parts.push(item.reps + " reps");
    if (item.duration) parts.push(item.duration);
    if (item.rest) parts.push("rest " + item.rest);
    var machine = machineLabel(item.machine);
    if (machine) parts.push("machine: " + machine);
    return parts.join(", ");
  }

  /* ---------- exercises and drills ---------- */

  function exercisePlainText(exercise, ctx) {
    var component = (ctx && ctx.component) || defaultComponent;
    var source = (ctx && ctx.source) || defaultSource;
    var ex = exercise;
    var lines = [];
    lines.push(ex.name.toUpperCase());
    lines.push("Component: " + component(ex.component) + "  |  Equipment: " + (ex.equipment || "None"));
    if (ex.drill) lines.push("Drill: " + ex.drill);
    lines.push("");
    lines.push("FORM:");
    (ex.cues || []).forEach(function (cue, i) { lines.push("  " + (i + 1) + ". " + cue); });
    lines.push("");
    lines.push("PROGRAMMING:");
    lines.push("  " + (ex.programming || ""));
    lines.push("MUSCLES:");
    lines.push("  " + (ex.muscles || ""));
    lines.push("SAFETY:");
    lines.push("  " + (ex.safety || ""));
    if ((ex.aft || []).length) lines.push("AFT: " + ex.aft.join(", "));
    lines.push("SOURCE: " + (ex.source || "") + "  [" + source(ex) + "]");
    return lines.join("\n");
  }

  function drillPlainText(drill) {
    var lines = [];
    lines.push(drill.name.toUpperCase());
    lines.push("Doctrine Drill");
    lines.push("");
    if (drill.description) { lines.push("PURPOSE:"); lines.push("  " + drill.description); }
    if (drill.exercises) { lines.push("EXERCISES:"); lines.push("  " + drill.exercises); }
    if (drill.citation) { lines.push("CITATION: " + drill.citation); }
    return lines.join("\n");
  }

  /* ---------- sessions ---------- */

  function sessionPlainText(session, ctx) {
    var component = (ctx && ctx.component) || defaultComponent;
    var phaseOrder = (ctx && ctx.phaseOrder) || PHASE_ORDER;
    var phaseLabels = (ctx && ctx.phaseLabels) || PHASE_LABELS;
    var findExercise = (ctx && ctx.findExercise) || noExercise;

    var lines = [];
    lines.push("BATTLE RHYTHM - SESSION");
    if (ctx && ctx.dateLabel) lines.push("Date: " + ctx.dateLabel);
    lines.push(session.name.toUpperCase());
    lines.push(session.duration + " min  |  Focus: " + component(session.focus) + "  |  RPE " + session.rpe);
    if (session.format === "circuit") {
      lines.push("Format: Active-Recovery Circuit | " + session.circuit.rounds + " rounds | " + session.circuit.work + " work | " + session.circuit.rest + " transition/rest");
    }
    if (session.notes) { lines.push("Notes: " + session.notes); }
    lines.push("------------------------------------");
    phaseOrder.forEach(function (key) {
      var phase = session.phases[key];
      if (!phase || !phase.items.length) return;
      lines.push("");
      lines.push(phaseLabels[key].toUpperCase() + ":");
      phase.items.forEach(function (item, i) {
        var t = itemText(item);
        var head = (i + 1) + ". " + item.label + (t ? "  [" + t + "]" : "");
        lines.push(head);
        var ex = findExercise(item.ref);
        if (ex) {
          (ex.cues || []).slice(0, 3).forEach(function (cue) { lines.push("     - " + cue); });
        }
      });
    });
    lines.push("");
    lines.push("Safety confirmation: profile, supervision, risk controls, and environmental conditions reviewed.");
    lines.push("Sourced from FM 7-22 and ATP 7-22.02 (H2F doctrine).");
    lines.push("Safety: apply risk management (ATP 5-19); respect profiles (DA 3349/DD 689) and environmental guidance (TB MED 507/508).");
    return lines.join("\n");
  }

  function trackedSessionPlainText(session, dateLabel, entry, ctx) {
    var summary = (ctx && ctx.actualSummary) || noSummary;
    var lines = sessionPlainText(session, ctx).split("\n");
    var results = (entry && entry.results) || {};
    /* The status line is placed by the stats line, never by a fixed index. The
     * header above it is not a fixed shape: `Date:` is emitted only when a date
     * label is given, and a circuit session adds a `Format:` line. An index
     * therefore lands somewhere different depending on which of those were
     * emitted — at 4 it dropped below `Notes:` whenever the date label was
     * empty (issue #26). The stats line is the marker because sessionPlainText
     * always emits exactly one line carrying both the " min  |  Focus: " and
     * "  |  RPE " separators, and the status belongs directly under it: above
     * `Notes:`, and above any `Format:` line.
     */
    var statusAt = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(" min  |  Focus: ") !== -1 && lines[i].indexOf("  |  RPE ") !== -1) {
        statusAt = i + 1;
        break;
      }
    }
    /* Defensive only: sessionPlainText always emits the stats line, so the
     * marker is always found. Appending keeps the line in the document rather
     * than landing at the top of it if that ever stops being true.
     */
    if (statusAt === -1) statusAt = lines.length;
    lines.splice(statusAt, 0, "Tracker status: " + (entry && entry.complete ? "Completed" : "In progress"));
    lines.push("");
    lines.push("TRACKED RESULTS:");
    var phaseOrder = (ctx && ctx.phaseOrder) || PHASE_ORDER;
    phaseOrder.forEach(function (key) {
      var phase = session.phases[key];
      if (!phase || !phase.items.length) return;
      phase.items.forEach(function (item) {
        var r = results[item.id];
        var done = !!(r && r.done);
        var line = (done ? "[x] " : "[ ] ") + item.label;
        var act = (r && ctx && ctx.actualSummary) ? summary(r) : "";
        if (act) line += " - actual: " + act;
        else if (itemText(item)) line += " - " + itemText(item);
        lines.push(line);
      });
    });
    if (entry) {
      var meta = [];
      if (entry.rpeActual) meta.push("RPE actual: " + entry.rpeActual);
      if (entry.durationActual) meta.push("Duration actual: " + entry.durationActual);
      if (entry.notes) meta.push("Notes: " + entry.notes);
      if (meta.length) { lines.push(""); lines.push("SESSION RESULTS: " + meta.join("  |  ")); }
    }
    return lines.join("\n");
  }

  /* ---------- regiments ---------- */

  function regimentPlainText(regiment, sessions) {
    var list = sessions || [];
    var lines = [];
    lines.push("BATTLE RHYTHM - REGIMENT");
    lines.push(regiment.name.toUpperCase());
    lines.push("Period: " + regiment.period);
    lines.push("------------------------------------");
    (regiment.days || []).forEach(function (day) {
      if (!day.sessions || !day.sessions.length) return;
      lines.push("");
      lines.push(day.name.toUpperCase() + ":");
      day.sessions.forEach(function (sid) {
        var s = list.find(function (x) { return x.id === sid; });
        if (s) lines.push("  - " + s.name + " (" + s.duration + " min, RPE " + s.rpe + ")");
      });
    });
    lines.push("");
    lines.push("Regiment grouped with Battle Rhythm, informed by FM 7-22 periodization (base/build/peak/recovery).");
    return lines.join("\n");
  }

  return {
    MACHINE_OPTIONS: MACHINE_OPTIONS,
    PHASE_ORDER: PHASE_ORDER,
    PHASE_LABELS: PHASE_LABELS,
    machineLabel: machineLabel,
    itemText: itemText,
    exercisePlainText: exercisePlainText,
    drillPlainText: drillPlainText,
    sessionPlainText: sessionPlainText,
    trackedSessionPlainText: trackedSessionPlainText,
    regimentPlainText: regimentPlainText
  };
});