"use strict";
/* Unit tests for the plain-text serialisers (js/data/session-text.js) using
 * only Node built-ins. Run: node --test tests/
 *
 * These functions produce the text behind Copy and Copy-to-Notes, so the
 * assertions here are deliberately about exact formatting: a stray blank line
 * or a reordered field is the kind of regression a user notices and a
 * "contains the name" test would not catch.
 *
 * The module is pure and holds no app state — the component/source labels, the
 * phase vocabulary, exercise resolution and the tracker's actual-result summary
 * all arrive through a context object. The tests below supply their own, which
 * is also what proves the module has no browser dependency: requiring it here
 * would fail at load if it reached for `window` or `document`.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const TEXT = require("../js/data/session-text.js");

/* A context matching what js/app.js supplies in production. */
function ctx(overrides) {
  const base = {
    component: function (id) {
      return { "muscular-strength": "Muscular Strength", power: "Power" }[id] || id;
    },
    source: function (ex) {
      const s = ex.source || "";
      if (s.indexOf("QUOTE") === 0) return "Doctrinal - quoted";
      if (s.indexOf("PAR - adapted") === 0) return "Adapted / common H2F practice";
      if (s.indexOf("PAR") === 0) return "Paraphrased from doctrine";
      return "Reference";
    },
    phaseOrder: ["prep", "activity", "recovery"],
    phaseLabels: { prep: "Preparation", activity: "Activity", recovery: "Recovery" },
    findExercise: function (id) {
      return id === "s1-deadlift" ? { id: "s1-deadlift", cues: ["Bar over mid-foot", "Drive through heels", "Lock hips and knees", "A fourth cue that must not be printed"] } : null;
    },
    actualSummary: function (res) {
      const sets = res.actual && res.actual.sets ? res.actual.sets : [];
      return sets.map(s => [s.reps, s.weight].filter(Boolean).join(" x ")).join(", ");
    }
  };
  return Object.assign(base, overrides || {});
}

function session(overrides) {
  return Object.assign({
    id: "s-1",
    name: "Test Session",
    duration: 60,
    focus: "muscular-strength",
    rpe: 8,
    format: "session",
    circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
    notes: "",
    phases: {
      prep: { name: "Preparation", items: [{ id: "i1", label: "Cardio Warmup", ref: null, duration: "5 min" }] },
      activity: { name: "Activity", items: [{ id: "i2", label: "Deadlift", ref: "s1-deadlift", sets: "3", reps: "5", machine: "barbell" }] },
      recovery: { name: "Recovery", items: [{ id: "i3", label: "Recovery Drill", ref: null, duration: "20-30 sec" }] }
    }
  }, overrides || {});
}

/* ---------------- machineLabel ---------------- */

test("machineLabel: known value, none, empty and unknown", () => {
  assert.equal(TEXT.machineLabel("barbell"), "Barbell rig");
  assert.equal(TEXT.machineLabel("erg-rower"), "Rowing ergometer");
  assert.equal(TEXT.machineLabel("none"), "", "none means no machine line at all");
  assert.equal(TEXT.machineLabel(""), "");
  assert.equal(TEXT.machineLabel(null), "");
  assert.equal(TEXT.machineLabel(undefined), "");
  assert.equal(TEXT.machineLabel("kettlebell-rig"), "kettlebell-rig", "an unknown value prints itself rather than vanishing");
});

test("MACHINE_OPTIONS: unique values, none first, and no duplicate labels", () => {
  const values = TEXT.MACHINE_OPTIONS.map(o => o.value);
  assert.deepEqual(values.filter((v, i) => values.indexOf(v) !== i), [], "duplicate machine values");
  assert.equal(values[0], "none");
  const labels = TEXT.MACHINE_OPTIONS.map(o => o.label);
  assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), [], "duplicate machine labels");
  assert.ok(TEXT.MACHINE_OPTIONS.length >= 10, "the vocabulary should not shrink silently");
});

/* ---------------- itemText ---------------- */

test("itemText: field order is sets, reps, duration, rest, machine", () => {
  assert.equal(
    TEXT.itemText({ sets: 3, reps: "10", duration: "45 sec", rest: "60 sec", machine: "cable" }),
    "3 sets, 10 reps, 45 sec, rest 60 sec, machine: Cable pulley column"
  );
});

test("itemText: omitted fields are omitted, not printed empty", () => {
  assert.equal(TEXT.itemText({}), "");
  assert.equal(TEXT.itemText({ sets: "4", reps: "8" }), "4 sets, 8 reps");
  assert.equal(TEXT.itemText({ sets: "2", machine: "none" }), "2 sets", "machine: none adds nothing");
  assert.equal(TEXT.itemText({ duration: "5 min" }), "5 min");
});

/* ---------------- exercisePlainText ---------------- */

test("exercisePlainText: full exercise, including the source label", () => {
  const text = TEXT.exercisePlainText({
    name: "Deadlift",
    component: "muscular-strength",
    equipment: "Barbell",
    cues: ["Bar over mid-foot", "Drive through heels"],
    programming: "2-6 sets x up to 6 reps",
    muscles: "Hamstrings, glutes",
    safety: "Keep lumbar spine neutral",
    aft: ["MDL", "SDC"],
    source: "QUOTE: FWC core lift, FM 7-22 para 6-16"
  }, ctx());

  assert.equal(text, [
    "DEADLIFT",
    "Component: Muscular Strength  |  Equipment: Barbell",
    "",
    "FORM:",
    "  1. Bar over mid-foot",
    "  2. Drive through heels",
    "",
    "PROGRAMMING:",
    "  2-6 sets x up to 6 reps",
    "MUSCLES:",
    "  Hamstrings, glutes",
    "SAFETY:",
    "  Keep lumbar spine neutral",
    "AFT: MDL, SDC",
    "SOURCE: QUOTE: FWC core lift, FM 7-22 para 6-16  [Doctrinal - quoted]"
  ].join("\n"));
});

test("exercisePlainText: every source prefix maps to its own label", () => {
  const label = source => {
    const text = TEXT.exercisePlainText({ name: "X", component: "power", cues: [], source: source }, ctx());
    return text.split("\n").pop().match(/\[(.*)\]$/)[1];
  };
  assert.equal(label("QUOTE: something"), "Doctrinal - quoted");
  assert.equal(label("PAR - adapted, common H2F field exercise"), "Adapted / common H2F practice");
  assert.equal(label("PAR: STC station"), "Paraphrased from doctrine");
  assert.equal(label("ATP 7-22.02 Conditioning Drill 1"), "Reference");
  assert.equal(label(""), "Reference");
});

test("exercisePlainText: missing optional fields degrade to blank lines, not to 'undefined'", () => {
  const text = TEXT.exercisePlainText({ name: "Squat", component: "power", cues: [] }, ctx());
  assert.ok(!/undefined/.test(text), "no undefined may leak into user-facing text");
  assert.ok(!/^AFT:/m.test(text), "no AFT line when there are no AFT events");
  assert.ok(text.includes("Equipment: None"), "absent equipment reads None");
  assert.ok(text.includes("SOURCE:   [Reference]"), "absent source leaves the source slot empty");
});

test("exercisePlainText: the drill line appears only when the exercise has one", () => {
  const withDrill = TEXT.exercisePlainText({ name: "X", component: "power", cues: [], drill: "Preparation Drill" }, ctx());
  assert.ok(withDrill.includes("\nDrill: Preparation Drill\n"));
  const without = TEXT.exercisePlainText({ name: "X", component: "power", cues: [] }, ctx());
  assert.ok(!without.includes("Drill:"));
});

/* ---------------- drillPlainText ---------------- */

test("drillPlainText: purpose, exercises and citation are each optional", () => {
  assert.equal(TEXT.drillPlainText({
    name: "Preparation Drill",
    description: "Standard dynamic warm-up.",
    exercises: "Bend and Reach, Rear Lunge",
    citation: "FM 7-22, Table 6-2"
  }), [
    "PREPARATION DRILL",
    "Doctrine Drill",
    "",
    "PURPOSE:",
    "  Standard dynamic warm-up.",
    "EXERCISES:",
    "  Bend and Reach, Rear Lunge",
    "CITATION: FM 7-22, Table 6-2"
  ].join("\n"));

  assert.equal(TEXT.drillPlainText({ name: "Bare Drill" }), "BARE DRILL\nDoctrine Drill\n");
});

/* ---------------- sessionPlainText ---------------- */

test("sessionPlainText: header, phases, per-item stats and the safety footer", () => {
  const text = TEXT.sessionPlainText(session(), ctx());
  const lines = text.split("\n");

  assert.equal(lines[0], "BATTLE RHYTHM - SESSION");
  assert.equal(lines[1], "TEST SESSION", "no Date line when no date label is given");
  assert.equal(lines[2], "60 min  |  Focus: Muscular Strength  |  RPE 8");
  assert.equal(lines[3], "------------------------------------");
  assert.ok(text.includes("\nPREPARATION:\n1. Cardio Warmup  [5 min]\n"));
  assert.ok(text.includes("1. Deadlift  [3 sets, 5 reps, machine: Barbell rig]\n"), "item stats are bracketed, numbered within their phase");
  assert.ok(text.includes("     - Bar over mid-foot"), "cues are indented under the item");
  assert.ok(text.includes("\nACTIVITY:\n"), "phase labels come from the context");
  assert.ok(text.endsWith("Safety: apply risk management (ATP 5-19); respect profiles (DA 3349/DD 689) and environmental guidance (TB MED 507/508)."));
});

test("sessionPlainText: the date label is optional and sits on its own line", () => {
  const withDate = TEXT.sessionPlainText(session(), ctx({ dateLabel: "Sep 29, 2026" })).split("\n");
  assert.equal(withDate[1], "Date: Sep 29, 2026");
  assert.equal(withDate[2], "TEST SESSION");
  const without = TEXT.sessionPlainText(session(), ctx()).split("\n");
  assert.equal(without[1], "TEST SESSION");
});

test("sessionPlainText: circuit format adds one line and only for circuits", () => {
  const circuit = TEXT.sessionPlainText(session({ format: "circuit" }), ctx());
  assert.ok(circuit.includes("\nFormat: Active-Recovery Circuit | 3 rounds | 45 sec work | 30 sec transition/rest\n"));
  assert.ok(!TEXT.sessionPlainText(session(), ctx()).includes("Active-Recovery Circuit"));
});

test("sessionPlainText: notes appear only when set", () => {
  assert.ok(TEXT.sessionPlainText(session({ notes: "Pairing: group into 2-3 people." }), ctx()).includes("\nNotes: Pairing: group into 2-3 people.\n"));
  assert.ok(!TEXT.sessionPlainText(session(), ctx()).includes("\nNotes: "));
});

test("sessionPlainText: at most three cues are printed per item", () => {
  const text = TEXT.sessionPlainText(session(), ctx());
  assert.ok(text.includes("     - A fourth cue that must not be printed") === false, "the fourth cue is dropped");
  assert.equal((text.match(/^ {5}- /gm) || []).length, 3, "exactly the first three cues");
});

test("sessionPlainText: empty phases are skipped entirely, not printed as bare headers", () => {
  const text = TEXT.sessionPlainText(session({
    phases: {
      prep: { name: "Preparation", items: [] },
      activity: { name: "Activity", items: [{ id: "i2", label: "Deadlift", ref: null, sets: "3" }] },
      recovery: { name: "Recovery", items: [] }
    }
  }), ctx());
  assert.ok(!text.includes("PREPARATION:"));
  assert.ok(!text.includes("RECOVERY:"));
  assert.ok(text.includes("\nACTIVITY:\n"));
});

test("sessionPlainText: an unresolved exercise reference still prints the item, without cues", () => {
  const text = TEXT.sessionPlainText(session({
    phases: { prep: { items: [{ id: "x", label: "Ghost Lift", ref: "no-such-id", sets: "3" }] }, activity: { items: [] }, recovery: { items: [] } }
  }), ctx());
  assert.ok(text.includes("1. Ghost Lift  [3 sets]"));
  assert.ok(!text.includes("     - "), "no cue lines for an unresolved reference");
});

/* ---------------- trackedSessionPlainText ---------------- */

test("trackedSessionPlainText: status line, checkboxes, actuals and session results", () => {
  const text = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", {
    complete: true,
    results: {
      i1: { done: true, actual: { sets: [{ reps: "5", weight: "135" }] } },
      i2: { done: false },
      i3: { done: true }
    },
    rpeActual: "9",
    durationActual: "52",
    notes: "Felt strong."
  }, ctx());
  const lines = text.split("\n");

  assert.equal(lines[2], "60 min  |  Focus: Muscular Strength  |  RPE 8");
  assert.equal(lines[3], "Tracker status: Completed", "the status line follows the stats line (no date label in this context)");
  assert.ok(text.includes("\nTRACKED RESULTS:\n"));
  assert.ok(text.includes("[x] Cardio Warmup - actual: 5 x 135"), "a logged actual replaces the planned stats");
  assert.ok(text.includes("[ ] Deadlift - 3 sets, 5 reps, machine: Barbell rig"), "an unlogged item keeps its planned stats");
  assert.ok(text.includes("[x] Recovery Drill - 20-30 sec"));
  assert.ok(text.endsWith("SESSION RESULTS: RPE actual: 9  |  Duration actual: 52  |  Notes: Felt strong."));
});

test("trackedSessionPlainText: a missing entry reads as in progress with nothing ticked", () => {
  const text = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", null, ctx());
  assert.ok(text.includes("\nTracker status: In progress\n"));
  assert.ok(!text.includes("[x]"));
  assert.ok(!text.includes("SESSION RESULTS:"), "no results block without an entry");
  assert.ok(text.includes("[ ] Cardio Warmup - 5 min"));
});

test("trackedSessionPlainText: an item with no planned stats and no actual prints bare", () => {
  const text = TEXT.trackedSessionPlainText(session({
    phases: { prep: { items: [{ id: "b", label: "Bare Item" }] }, activity: { items: [] }, recovery: { items: [] } }
  }), "Sep 29, 2026", { complete: false, results: { b: { done: false } } }, ctx());
  assert.ok(text.endsWith("\n[ ] Bare Item"), "no trailing dash when there is nothing to say");
});

test("trackedSessionPlainText: without an actualSummary in the context it falls back to the plan", () => {
  const text = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", {
    complete: false,
    results: { i2: { done: true, actual: { sets: [{ reps: "5", weight: "135" }] } } }
  }, ctx({ actualSummary: undefined }));
  assert.ok(text.includes("[x] Deadlift - 3 sets, 5 reps, machine: Barbell rig"));
});

test("trackedSessionPlainText: the status line sits directly after the stats line, before Notes", () => {
  // The status line is placed relative to a marker — the stats line — not an
  // index, because the header above it is not a fixed shape: the Date line is
  // emitted only when a date label is given. A fixed index therefore moved the
  // status line below Notes whenever the date label was empty (issue #26), so
  // all four combinations are asserted here rather than the two that used to
  // agree by accident.
  const cases = [
    { name: "(date, notes)", dateLabel: "Sep 29, 2026", notes: "Some notes." },
    { name: "(date, no notes)", dateLabel: "Sep 29, 2026", notes: "" },
    { name: "(no date, notes)", dateLabel: "", notes: "Some notes." },
    { name: "(no date, no notes)", dateLabel: "", notes: "" }
  ];
  cases.forEach(c => {
    const lines = TEXT.trackedSessionPlainText(session({ notes: c.notes }), c.dateLabel, null, ctx({ dateLabel: c.dateLabel })).split("\n");
    const stats = lines.findIndex(l => l.includes(" min  |  Focus: ") && l.includes("  |  RPE "));
    const status = lines.findIndex(l => l.startsWith("Tracker status:"));
    const notes = lines.findIndex(l => l.startsWith("Notes: "));

    assert.notEqual(stats, -1, c.name + ": the stats line is present");
    assert.equal(status, stats + 1, c.name + ": the status line is directly after the stats line");
    assert.equal(status, lines.findIndex(l => l.startsWith("Tracker status: ")), c.name + ": exactly one status line");
    if (c.notes) assert.equal(notes, status + 1, c.name + ": the Notes line follows the status line, not the reverse");
  });
});

test("trackedSessionPlainText: a date label pushes the stats line down, and the status follows it", () => {
  // Guards the property the bug violated: insertion follows the header shape
  // instead of assuming one, so adding a Date line shifts both lines together.
  const withDate = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", null, ctx({ dateLabel: "Sep 29, 2026" })).split("\n");
  assert.equal(withDate[1], "Date: Sep 29, 2026");
  assert.equal(withDate[3], "60 min  |  Focus: Muscular Strength  |  RPE 8");
  assert.equal(withDate[4], "Tracker status: In progress");

  const noDate = TEXT.trackedSessionPlainText(session(), "", null, ctx()).split("\n");
  assert.equal(noDate[1], "TEST SESSION");
  assert.equal(noDate[2], "60 min  |  Focus: Muscular Strength  |  RPE 8");
  assert.equal(noDate[3], "Tracker status: In progress");
});

/* ---------------- regimentPlainText ---------------- */

test("regimentPlainText: days with sessions, skipped empty days, unresolved refs dropped", () => {
  const sessions = [
    { id: "a", name: "Upper Strength", duration: 60, rpe: 8 },
    { id: "b", name: "Zone 2 Run", duration: 45, rpe: 5 }
  ];
  const text = TEXT.regimentPlainText({
    name: "1st Platoon Block",
    period: "build",
    days: [
      { name: "Monday", sessions: ["a", "missing"] },
      { name: "Tuesday", sessions: [] },
      { name: "Wednesday", sessions: ["b"] }
    ]
  }, sessions);

  assert.equal(text, [
    "BATTLE RHYTHM - REGIMENT",
    "1ST PLATOON BLOCK",
    "Period: build",
    "------------------------------------",
    "",
    "MONDAY:",
    "  - Upper Strength (60 min, RPE 8)",
    "",
    "WEDNESDAY:",
    "  - Zone 2 Run (45 min, RPE 5)",
    "",
    "Regiment grouped with Battle Rhythm, informed by FM 7-22 periodization (base/build/peak/recovery)."
  ].join("\n"));
});

test("regimentPlainText: no sessions at all still produces a well-formed document", () => {
  const text = TEXT.regimentPlainText({ name: "Empty", period: "base" }, []);
  assert.ok(!/undefined/.test(text));
  assert.ok(text.startsWith("BATTLE RHYTHM - REGIMENT\nEMPTY\nPeriod: base\n"));
});

/* ---------------- purity ---------------- */

test("the serialisers are pure: repeated calls with the same input match exactly", () => {
  const first = TEXT.sessionPlainText(session(), ctx());
  const second = TEXT.sessionPlainText(session(), ctx());
  assert.equal(first, second);
  const tracked = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", null, ctx());
  assert.equal(tracked, TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", null, ctx()));
});

test("calling does not mutate the session or the entry it was given", () => {
  const s = session();
  const entry = { complete: true, results: { i1: { done: true } }, rpeActual: "9", durationActual: "52", notes: "n" };
  const before = JSON.stringify({ s: s, e: entry });
  TEXT.sessionPlainText(s, ctx());
  TEXT.trackedSessionPlainText(s, "Sep 29, 2026", entry, ctx());
  TEXT.regimentPlainText({ name: "R", period: "base", days: [{ name: "Monday", sessions: ["a"] }] }, []);
  assert.equal(JSON.stringify({ s: s, e: entry }), before);
});

test("an omitted context still produces text rather than throwing", () => {
  const text = TEXT.sessionPlainText(session(), undefined);
  assert.ok(text.includes("Focus: muscular-strength"), "the component id is passed through unchanged");
  assert.ok(text.includes("PREPARATION:"));
  const tracked = TEXT.trackedSessionPlainText(session(), "Sep 29, 2026", null, undefined);
  assert.ok(tracked.includes("\nTracker status: In progress\n"));
});