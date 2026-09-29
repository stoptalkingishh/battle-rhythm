"use strict";
/* Unit tests for the portable plan share/import (js/data/plan-share.js).
 * Fixtures use the app's REAL shapes (js/app.js blankSession / blankRegiment),
 * not the wire format this module invented. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const PS = require("../js/data/plan-share.js");

/* session = { id, name, duration, focus, rpe, format, circuit, notes, tags[],
 *              safetyConfirmed, phases: { prep|activity|recovery: { name, items[] } } } */
function mkSessions() {
  return [
    {
      id: "s-upper-a",
      name: "Upper A",
      duration: 55,
      focus: "muscular-strength",
      rpe: 7,
      format: "session",
      circuit: { rounds: 3, work: "45 sec", rest: "30 sec" },
      notes: "Bench first, then row.",
      tags: ["strength", "upper"],
      safetyConfirmed: true,
      phases: {
        prep: { name: "Preparation", items: [{ id: "i1", type: "drill", ref: "pd", label: "Preparation Drill", sets: "", reps: "", duration: "5-10 reps", rest: "" }] },
        activity: {
          name: "Activity",
          items: [
            { id: "i2", type: "exercise", ref: "s1-deadlift", label: "Deadlift", sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell", mode: "reps", superset: "", warmup: false, perside: false, bodyweight: false, effort: "" }
          ]
        },
        recovery: { name: "Recovery", items: [{ id: "i3", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }] }
      }
    },
    {
      id: "s-legs-b",
      name: "Legs B",
      duration: 60,
      focus: "muscular-strength",
      rpe: 8,
      format: "circuit",
      circuit: { rounds: 4, work: "40 sec", rest: "20 sec" },
      notes: "",
      tags: ["strength", "legs"],
      safetyConfirmed: true,
      phases: {
        prep: { name: "Preparation", items: [] },
        activity: { name: "Activity", items: [{ id: "i4", type: "exercise", ref: "s2-squat", label: "Squat", sets: "3", reps: "8", duration: "", rest: "90s", machine: "barbell" }] },
        recovery: { name: "Recovery", items: [] }
      }
    }
  ];
}

/* regiment = { id, name, period, days: [ { name, sessions: [sessionId] } ] } */
function mkRegiments() {
  return [{ id: "r-1", name: "Block 1", period: "Base", days: [
    { name: "Mon", sessions: ["s-upper-a"] },
    { name: "Tue", sessions: [] },
    { name: "Wed", sessions: ["s-legs-b"] }
  ] }];
}

test("exportPlan keeps plan-only fields and collects tags", () => {
  const doc = PS.exportPlan(mkSessions(), mkRegiments());
  assert.equal(doc.format, PS.FORMAT);
  assert.equal(doc.version, 1);
  assert.equal(doc.sessions.length, 2);
  assert.ok(doc.tags.indexOf("strength") !== -1);
  assert.equal(doc.regiments.length, 1);
  assert.equal(doc.regiments[0].name, "Block 1");
  /* Real regiment shape survives export. */
  assert.deepEqual(doc.regiments[0].days[0], { name: "Mon", sessions: ["s-upper-a"] });
});

test("importPlan merges new sessions/regiments and never overwrites existing", () => {
  const doc = PS.exportPlan(mkSessions(), []);
  const current = {
    sessions: [{ name: "Upper A", tags: [] }], // same name already present
    regiments: [{ id: "r-old", name: "Old Regiment", period: "Recovery", days: [] }]
  };
  const res = PS.importPlan(JSON.stringify(doc), current);
  // Upper A exists -> unchanged; Legs B is new.
  assert.equal(res.sessions.find((s) => s.name === "Upper A").tags.length, 0, "existing plan untouched");
  assert.equal(res.sessions.find((s) => s.name === "Legs B") !== undefined, true);
  assert.equal(res.regiments.find((r) => r.name === "Old Regiment") !== undefined, true);
  assert.equal(res.added, 1);
});

test("importPlan rejects non-plan input and newer-version docs", () => {
  assert.throws(() => PS.importPlan("not json", {}), /JSON/);
  assert.throws(() => PS.importPlan(JSON.stringify({ format: "other" }), {}), /format/);
  assert.throws(() => PS.importPlan(JSON.stringify({ format: PS.FORMAT, version: PS.VERSION + 1, sessions: [] }), {}), /newer version/);
});

test("importPlan tolerates an empty export as a no-op", () => {
  const doc = PS.exportPlan([], []);
  const res = PS.importPlan(JSON.stringify(doc), { sessions: [{ name: "Keep" }], regiments: [] });
  assert.equal(res.sessions.length, 1);
  assert.equal(res.added, 0);
});

test("export/import round-trip keeps regiment days and object-shaped phases", () => {
  const doc = PS.exportPlan(mkSessions(), mkRegiments());
  const res = PS.importPlan(JSON.stringify(doc), { sessions: [], regiments: [] });
  assert.equal(res.added, 3); // 2 sessions + 1 regiment
  const r = res.regiments[0];
  assert.ok(Array.isArray(r.days), "regiment keeps a days array after import");
  assert.deepEqual(r.days, mkRegiments()[0].days);
  const s = res.sessions.find((x) => x.name === "Upper A");
  ["prep", "activity", "recovery"].forEach((key) => {
    assert.equal(typeof s.phases[key], "object", key + " phase is an object");
    assert.ok(Array.isArray(s.phases[key].items), key + " items is an array");
    assert.ok(typeof s.phases[key].name === "string");
  });
  assert.equal(s.phases.activity.items[0].id, "i2", "item ids are carried through");
  assert.equal(s.phases.activity.items[0].machine, "barbell");
});

test("importPlan preserves duration, rpe, focus, format and circuit", () => {
  const doc = PS.exportPlan(mkSessions(), []);
  const res = PS.importPlan(JSON.stringify(doc), { sessions: [], regiments: [] });
  const s = res.sessions.find((x) => x.name === "Legs B");
  assert.equal(s.duration, 60);
  assert.equal(s.rpe, 8);
  assert.equal(s.focus, "muscular-strength");
  assert.equal(s.format, "circuit");
  assert.deepEqual(s.circuit, { rounds: 4, work: "40 sec", rest: "20 sec" });
  assert.equal(s.notes, "");
  assert.equal(s.safetyConfirmed, true);
  assert.deepEqual(s.tags, ["strength", "legs"]);
  assert.equal(s.id, "s-legs-b");
});

test("importPlan coerces a legacy array phases shape into the app object form", () => {
  const legacy = {
    format: PS.FORMAT, version: 1,
    sessions: [{ name: "Legacy", tags: [], phases: [{ name: "activity", items: [{ id: "x", label: "Deadlift", reps: "5" }, { id: "y", reps: "5" }] }] }],
    regiments: []
  };
  const res = PS.importPlan(JSON.stringify(legacy), { sessions: [], regiments: [] });
  const s = res.sessions[0];
  assert.equal(Array.isArray(s.phases), false, "phases is an object, not an array");
  assert.deepEqual(Object.keys(s.phases).sort(), ["activity", "prep", "recovery"]);
  assert.equal(s.phases.activity.items.length, 1, "rows with nothing to render are dropped");
  assert.equal(s.phases.activity.items[0].label, "Deadlift");
  assert.equal(s.phases.activity.items[0].reps, "5");
  assert.ok(s.phases.prep.items.length === 0);
});

test("importPlan sanitizes a primitive phases payload instead of storing it", () => {
  const bad = {
    format: PS.FORMAT, version: 1,
    sessions: [
      { name: "Primitive phases", phases: "x" },
      { name: "Number phases", phases: 42 },
      { name: "String items", phases: { activity: { items: "abc" } } },
      { name: "Junk items", phases: { activity: { items: [null, 5, {}, { label: "Real", ref: "r" }] } } }
    ],
    regiments: []
  };
  const res = PS.importPlan(JSON.stringify(bad), { sessions: [], regiments: [] });
  assert.equal(res.sessions.length, 4, "named sessions are kept, sanitized");
  res.sessions.forEach((s) => {
    ["prep", "activity", "recovery"].forEach((k) => {
      assert.ok(Array.isArray(s.phases[k].items), s.name + "/" + k + " items is an array");
    });
  });
  // Rendering the Builder walks exactly these paths.
  res.sessions.forEach((s) => assert.equal(s.phases.activity.items.length <= 80, true));
  assert.equal(res.sessions[3].phases.activity.items.length, 1, "unusable rows dropped, usable kept");
});

test("importPlan drops a session with no name", () => {
  const bad = { format: PS.FORMAT, version: 1, sessions: [{ tags: ["x"] }, { name: "   " }, null, { name: "Good" }], regiments: [{ period: "Base" }] };
  const res = PS.importPlan(JSON.stringify(bad), { sessions: [], regiments: [] });
  assert.deepEqual(res.sessions.map((s) => s.name), ["Good"]);
  assert.deepEqual(res.regiments, []);
  assert.equal(res.added, 1);
});

test("importPlan caps oversized arrays and clamps oversized strings", () => {
  const many = [];
  for (let i = 0; i < 600; i++) many.push({ name: "S" + i, phases: { activity: { items: [] } } });
  for (let i = 0; i < 200; i++) many.push({ name: "T" + i, phases: { activity: { items: [] } } });
  const doc = { format: PS.FORMAT, version: 1, sessions: many, regiments: [] };
  const res = PS.importPlan(JSON.stringify(doc), { sessions: [], regiments: [] });
  assert.equal(res.sessions.length, 500, "session count is capped");
  const longName = "n".repeat(5000);
  const one = PS.importPlan(JSON.stringify({ format: PS.FORMAT, version: 1, sessions: [{ name: longName, tags: [longName], notes: longName }], regiments: [] }), { sessions: [], regiments: [] });
  assert.equal(one.sessions[0].name.length, 80, "name is clamped");
  assert.equal(one.sessions[0].notes.length, 2000, "notes are clamped");
  assert.equal(one.sessions[0].tags[0].length, 80, "tag is clamped");
  const items = [];
  for (let i = 0; i < 500; i++) items.push({ label: "i" + i });
  const capped = PS.importPlan(JSON.stringify({ format: PS.FORMAT, version: 1, sessions: [{ name: "Big", phases: { activity: { items } } }], regiments: [] }), { sessions: [], regiments: [] });
  assert.equal(capped.sessions[0].phases.activity.items.length, 80, "items per phase are capped");
  const days = [];
  for (let i = 0; i < 50; i++) days.push({ name: "D" + i, sessions: ["a", "b"] });
  const reg = PS.importPlan(JSON.stringify({ format: PS.FORMAT, version: 1, regiments: [{ name: "Wide", days }] }), { sessions: [], regiments: [] });
  assert.equal(reg.regiments[0].days.length, 14, "days per regiment are capped");
});

test("importPlan normalizes a regiment that has no days into an editable shape", () => {
  // The exact record an old share file produced: sessions on the regiment itself.
  const legacy = { format: PS.FORMAT, version: 1, regiments: [{ name: "Block 1", period: "base", sessions: ["s-upper-a"] }] };
  const res = PS.importPlan(JSON.stringify(legacy), { sessions: [], regiments: [] });
  const r = res.regiments[0];
  assert.ok(Array.isArray(r.days));
  assert.equal(r.days.length, 1);
  assert.equal(r.days[0].name, "Mon");
  assert.deepEqual(r.days[0].sessions, ["s-upper-a"]);
  assert.equal(r.period, "Base", "unknown period falls back to Base");
  // The Builder's own read path stays safe on this record.
  assert.deepEqual(r.days.filter((d) => d.sessions && d.sessions.length).length, 1);
});

test("parsePlan rejects a document over the size limit before parsing", () => {
  const huge = JSON.stringify({ format: PS.FORMAT, version: 1, pad: "x".repeat(PS.MAX_FILE_BYTES + 10) });
  assert.throws(() => PS.parsePlan(huge), /too large/);
  assert.throws(() => PS.importPlan(huge, {}), /too large/);
});

/* The same normalizers run on getSessions()/getRegiments(), so a corrupt
 * sessions.json restored from Drive is sanitized on read. */
test("normalizeSessionList sanitizes a corrupt synced store", () => {
  const stored = [
    { name: "Good", phases: "x" },
    { phases: { activity: { items: "abc" } } },
    null,
    { name: "Second", duration: "9999", rpe: 42, format: "hypertrophy", phases: { activity: { items: [{ label: "Deadlift", ref: "s1-deadlift", machine: "barbell" }] } } }
  ];
  const list = PS.normalizeSessionList(stored);
  assert.deepEqual(list.map((s) => s.name), ["Good", "Second"]);
  list.forEach((s) => assert.equal(typeof s.phases.activity, "object"));
  assert.equal(list[0].phases.activity.items.length, 0, "string items become an empty array");
  assert.equal(list[1].duration, 600, "duration is clamped");
  assert.equal(list[1].rpe, 10, "rpe is clamped");
  assert.equal(list[1].format, "session", "unknown format falls back to session");
  assert.equal(list[1].phases.activity.items[0].machine, "barbell");
});

test("normalizeSessionList infers item mode the way tracker-schema v3 does", () => {
  const s = PS.normalizeSession({
    name: "Timed",
    phases: {
      prep: { items: [] },
      activity: { items: [{ label: "Plank", duration: "1:30" }, { label: "Deadlift", sets: "3", reps: "5" }] },
      recovery: { items: [] }
    }
  });
  const items = s.phases.activity.items;
  assert.equal(items[0].mode, "time", "a planned duration implies a timed exercise");
  assert.equal(items[1].mode, "reps");
  assert.equal(items[1].superset, "");
  assert.equal(items[1].bodyweight, false);
});

test("normalizeRegimentList repairs stored regiments without days", () => {
  const list = PS.normalizeRegimentList([
    { name: "Broken" },
    { name: "Dated", period: "Combat / Peak 2", days: [{ name: "Mon", sessions: "nope" }, { name: "Tue", sessions: { a: 1 } }] }
  ]);
  assert.deepEqual(list[0].days, []);
  assert.deepEqual(list[1].days[0].sessions, ["nope"], "a bare session id is kept");
  assert.deepEqual(list[1].days[1].sessions, [], "a non-array, non-scalar sessions value becomes an empty array");
  assert.equal(list[1].period, "Combat / Peak 2");
  // No regiment in the list can throw in the Builder list render.
  list.forEach((r) => assert.equal((r.days || []).filter((d) => d.sessions && d.sessions.length) !== undefined, true));
});
