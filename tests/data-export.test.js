"use strict";
/* Unit tests for the versioned data export/import (js/data/data-export.js).
 *
 * Fixtures use the app's REAL shapes — blankSession/blankRegiment out of
 * js/app.js, and real tracker-schema v3 entries — not the wire format this
 * module invented, because the point of the round-trip test is that what the
 * app stores is what comes back.
 *
 * The context passed here is exactly what app.js passes at runtime: the real
 * owning modules, so an import is normalised by plan-share / tracker-schema /
 * aft-results / bodyweight / custom-exercises rather than by the module's own
 * mirrors. A separate test covers the no-context mirror path. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const EXP = require("../js/data/data-export.js");
const PS = require("../js/data/plan-share.js");
const TS = require("../js/data/tracker-schema.js");
const AFT = require("../js/data/aft-results.js");
const BW = require("../js/data/bodyweight.js");
const CUST = require("../js/data/custom-exercises.js");

const CTX = { planShare: PS, trackerSchema: TS, aft: AFT, bodyweight: BW, custom: CUST };

function mkSession() {
  return {
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
        items: [{
          id: "i2", type: "exercise", ref: "s1-deadlift", label: "Deadlift",
          sets: "2", reps: "12", duration: "", rest: "60s", machine: "barbell",
          mode: "reps", superset: "", warmup: false, perside: false, bodyweight: false, effort: ""
        }]
      },
      recovery: { name: "Recovery", items: [{ id: "i3", type: "drill", ref: "rd", label: "Recovery Drill", sets: "", reps: "", duration: "20-30 sec", rest: "" }] }
    }
  };
}

/* A tracker-schema v3 entry, the shape app.js writes: findItems() over the
 * snapshot yields i1/i2/i3, and results are keyed by those item ids. */
function mkEntry() {
  return {
    schema: 3,
    complete: true,
    startedAt: "2026-01-02T10:00:00.000Z",
    completedAt: "2026-01-02T11:00:00.000Z",
    rpeActual: "8",
    durationActual: "58",
    notes: "Felt strong",
    snapshot: mkSession(),
    results: {
      i1: { done: true, actual: { sets: [], reps: "", weight: "", duration: "10", distance: "", rpe: "", rir: "", notes: "" } },
      i2: {
        done: true, mode: "reps",
        actual: {
          sets: [
            { weight: "135", reps: "12", duration: "", distance: "", rest: "", warmup: false },
            { weight: "135", reps: "12", duration: "", distance: "", rest: "", warmup: true }
          ],
          reps: "12", weight: "135", duration: "", distance: "", rpe: "8", rir: "-1r", notes: ""
        }
      },
      i3: { done: false, actual: { sets: [], reps: "", weight: "", duration: "", distance: "", rpe: "", rir: "", notes: "" } }
    }
  };
}

/* The stored collections object app.js hands to buildExport. */
function mkStore() {
  return {
    sessions: [mkSession()],
    regiments: [{ id: "r-1", name: "Block 1", period: "Base", days: [{ name: "Mon", sessions: ["s-upper-a"] }] }],
    tracker: { schemaVersion: 3, "2026-01-02": { sessions: { "s-upper-a": mkEntry() } } },
    aftResults: [{ id: "aft1", date: "2026-01-06", event: "MDL", value: "250", unit: "lb", note: "", createdAt: "2026-01-06T09:00:00.000Z" }],
    bodyweight: [{ id: "bw1", date: "2026-01-05", weight: 180.5, unit: "lb", note: "morning", createdAt: "2026-01-05T07:00:00.000Z" }],
    groups: [{ id: "g1", name: "Strength", tags: ["strength"] }],
    customExercises: [{
      id: "cx1", name: "Sled Push", equipment: "sled", muscles: "quads; glutes", cues: ["drive"], notes: "",
      programming: "4 x 20m", component: "custom", source: "custom",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    }],
    /* A legacy pwHash from an older install is just another scalar here. */
    settings: { pwHash: "h1a2b3.4", unit: "lb", wakeLock: true, formula: "epley" }
  };
}

test("buildExport emits a versioned envelope covering every collection", () => {
  const env = EXP.buildExport(mkStore(), CTX);
  assert.equal(env.format, EXP.FORMAT);
  assert.equal(env.version, 1);
  assert.ok(typeof env.exportedAt === "string" && env.exportedAt.length > 0);
  assert.deepEqual(EXP.COLLECTIONS.map((c) => c.key), [
    "sessions", "regiments", "tracker", "aftResults", "bodyweight", "groups", "customExercises", "settings"
  ]);
  assert.deepEqual(env.counts, {
    sessions: 1, regiments: 1, trackerDays: 1, trackerEntries: 1,
    aftResults: 1, bodyweight: 1, groups: 1, customExercises: 1, settingsKeys: 4
  });
});

test("round trip: export -> parseImport deep-equals the exported collections", () => {
  const env = EXP.buildExport(mkStore(), CTX);
  const text = JSON.stringify(env, null, 2);
  const res = EXP.parseImport(text, CTX);
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.data.collections, env.collections);
  /* Re-exporting the parsed payload is a fixed point: no field drifts, no id
   * is regenerated, nothing is silently dropped on the second pass. */
  assert.deepEqual(EXP.buildExport(res.data.collections, CTX).collections, env.collections);
});

test("round trip: import into a clean store restores what was exported", () => {
  const store = mkStore();
  const env = EXP.buildExport(store, CTX);
  const res = EXP.parseImport(JSON.stringify(env), CTX);
  assert.equal(res.ok, true, res.error);

  /* Apply exactly as the Settings wiring does: one localStorage key per
   * collection, into an otherwise empty store. */
  const applied = {};
  EXP.COLLECTIONS.forEach((c) => { applied[c.localKey] = res.data.collections[c.key]; });

  const exported = env.collections;
  assert.deepEqual(applied.br_sessions, exported.sessions);
  assert.deepEqual(applied.br_regiments, exported.regiments);
  assert.deepEqual(applied.br_tracker, exported.tracker);
  assert.deepEqual(applied.br_aft_results, exported.aftResults);
  assert.deepEqual(applied.br_bodyweight, exported.bodyweight);
  assert.deepEqual(applied.br_groups, exported.groups);
  assert.deepEqual(applied.br_custom_exercises, exported.customExercises);

  /* The numbers themselves survive, and the migrated store is labelled with
   * the current tracker schema so app.js's own needsMigration() no-ops. */
  const entry = applied.br_tracker["2026-01-02"].sessions["s-upper-a"];
  assert.equal(applied.br_tracker.schemaVersion, TS.SCHEMA_VERSION);
  assert.equal(entry.results.i2.actual.sets[0].weight, "135");
  assert.equal(entry.results.i2.actual.sets[1].warmup, true);
  assert.equal(entry.complete, true);
  assert.equal(applied.br_bodyweight[0].weight, 180.5);
  assert.equal(applied.br_custom_exercises[0].component, "custom");
});

test("import is Drive-independent: the envelope carries no sync or auth state", () => {
  const env = EXP.buildExport({
    sessions: [], regiments: [], tracker: {}, aftResults: [], bodyweight: [], groups: [], customExercises: [],
    settings: {},
    /* Junk the caller might hand us: none of it is a covered collection. */
    outbox: [{ key: "br_sessions" }], mtimes: { br_sessions: "2026-01-01T00:00:00.000Z" },
    trackerActive: { sessionId: "s-upper-a", date: "2026-01-02" }, presetsHidden: ["pw1"], week: { 1: "s-upper-a" }
  }, CTX);
  assert.deepEqual(Object.keys(env.collections).sort(), [
    "aftResults", "bodyweight", "customExercises", "groups", "regiments", "sessions", "settings", "tracker"
  ]);
  const text = JSON.stringify(env);
  assert.equal(text.indexOf("outbox"), -1);
  assert.equal(text.indexOf("mtimes"), -1);
  assert.equal(text.indexOf("trackerActive"), -1);
});

test("settings round-trip as scalars only, dropping nested values", () => {
  const store = mkStore();
  const env = EXP.buildExport(store, CTX);
  assert.deepEqual(env.collections.settings, { pwHash: "h1a2b3.4", unit: "lb", wakeLock: true, formula: "epley" });
  /* Nested objects and arrays are dropped rather than deep-cloned, so a crafted
   * file cannot smuggle a structure into the live store. */
  const res = EXP.parseImport(JSON.stringify({
    format: EXP.FORMAT, version: 1,
    collections: Object.assign({}, env.collections, { settings: { pwHash: "hdeadbeef.9", unit: "kg", nested: { a: 1 }, list: [1], n: 3 } })
  }), CTX);
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.data.collections.settings, { pwHash: "hdeadbeef.9", unit: "kg", n: 3 });
});

test("parseImport rejects malformed and empty input without returning data", () => {
  ["", "   ", null, undefined, "{not json", "{\"format\":", "<div>nope</div>"].forEach((input) => {
    const res = EXP.parseImport(input, CTX);
    assert.equal(res.ok, false, "expected failure for " + JSON.stringify(input));
    assert.ok(typeof res.error === "string" && res.error.length > 0);
    assert.equal(res.data, undefined, "a rejected file yields no collections at all");
  });
});

test("parseImport rejects valid JSON with the wrong shape", () => {
  const bad = [
    JSON.stringify([1, 2, 3]),                                     /* array */
    JSON.stringify("a string"),                                    /* scalar */
    JSON.stringify(42),
    JSON.stringify({}),                                            /* no format */
    JSON.stringify({ format: "battle-rhythm-plan", version: 1, collections: {} }), /* the PLAN format */
    JSON.stringify({ format: EXP.FORMAT, version: 1, collections: [] }),           /* collections is a list */
    JSON.stringify({ format: EXP.FORMAT, version: 1, collections: "nope" }),
    JSON.stringify({ format: EXP.FORMAT, version: 1 })                              /* no collections */
  ];
  bad.forEach((text) => {
    const res = EXP.parseImport(text, CTX);
    assert.equal(res.ok, false, "expected failure for " + text);
    assert.equal(res.data, undefined);
  });
});

test("parseImport rejects an export missing a collection rather than wiping it", () => {
  const env = EXP.buildExport(mkStore(), CTX);
  const trimmed = JSON.parse(JSON.stringify(env));
  delete trimmed.collections.sessions;
  const res = EXP.parseImport(JSON.stringify(trimmed), CTX);
  assert.equal(res.ok, false);
  assert.match(res.error, /sessions/);
  assert.equal(res.data, undefined);
});

test("parseImport rejects unsupported versions", () => {
  const base = () => ({ format: EXP.FORMAT, collections: EXP.buildExport(mkStore(), CTX).collections });
  [
    Object.assign(base(), { version: 2 }),        /* newer than this build */
    Object.assign(base(), { version: 99 }),
    Object.assign(base(), { version: 0 }),        /* not a version at all */
    Object.assign(base(), { version: -1 }),
    Object.assign(base(), { version: "one" }),
    base()                                        /* missing version */
  ].forEach((doc) => {
    const res = EXP.parseImport(JSON.stringify(doc), CTX);
    assert.equal(res.ok, false, "expected failure for version " + JSON.stringify(doc.version));
    assert.equal(res.data, undefined);
  });
});

test("parseImport rejects an oversized document before parsing it", () => {
  const huge = JSON.stringify({ format: EXP.FORMAT, version: 1, collections: {}, pad: "x".repeat(EXP.MAX_FILE_BYTES + 10) });
  const res = EXP.parseImport(huge, CTX);
  assert.equal(res.ok, false);
  assert.match(res.error, /too large/);
  assert.equal(res.data, undefined);
});

/* Sanitisation, not rejection: one corrupt row must not cost the user the rest
 * of their history, but nothing unusable may be stored either. */
test("junk rows inside a valid payload are sanitised away", () => {
  const payload = {
    format: EXP.FORMAT, version: 1,
    collections: {
      sessions: [
        null, "junk", 7, { name: "   " },
        { name: "Real", phases: { activity: { items: [null, 5, {}, { label: "Deadlift", ref: "s1-deadlift" }] } } },
        { name: "N".repeat(200), duration: "9999", rpe: 42, format: "hypertrophy" }
      ],
      regiments: [null, "junk", { name: "" }, { name: "R", period: "nonsense", days: [{ name: "Mon", sessions: ["a", "a", null] }, 5] }],
      tracker: {
        schemaVersion: 3,
        "not-a-date": { sessions: { a: { results: {} } } },
        "2026-02-30": { sessions: { a: { results: {} } } },
        "2026-03-01": {
          sessions: {
            ok: { schema: 3, results: { r1: { done: "yes", actual: { sets: [null, 1, { weight: 135, reps: "5" }] } }, "": { done: true, actual: {} } } },
            junk: "a string",
            worse: { schema: 3 }
          }
        }
      },
      aftResults: [
        "junk",
        { event: "NOPE", date: "2026-01-01", value: "1" },
        { event: "MDL", date: "2026-13-40", value: "1" },
        { event: "MDL", date: "2026-01-06", value: "250", unit: "lb" }
      ],
      bodyweight: [
        null,
        { date: "2026-01-05", weight: -5 },
        { date: "2026-01-05", weight: "180.5", unit: "stone" },
        { date: "2026-01-05", weight: "180.5" }
      ],
      groups: [null, 5, { name: "" }, { name: "G" }, { name: "Tagged", tags: ["a", "a", "", null] }],
      customExercises: [null, {}, { name: "   " }, { name: "Sled Push", cues: "drive" }],
      settings: { pwHash: "h1.2", unit: "lb", nested: { a: 1 }, list: [1], n: 3 }
    }
  };

  const res = EXP.parseImport(JSON.stringify(payload), CTX);
  assert.equal(res.ok, true, res.error);
  const c = res.data.collections;

  /* Sessions: unnamed and non-object rows dropped; a 200-char name clamped. */
  assert.deepEqual(c.sessions.map((s) => s.name.length <= 80), [true, true]);
  assert.equal(c.sessions[0].name, "Real");
  assert.equal(c.sessions[1].duration, 600);
  assert.equal(c.sessions[1].rpe, 10);
  assert.equal(c.sessions[1].format, "session");
  /* A phase whose items are junk becomes an empty item list, not a string. */
  c.sessions.forEach((s) => {
    ["prep", "activity", "recovery"].forEach((k) => assert.ok(Array.isArray(s.phases[k].items), k));
  });
  assert.equal(c.sessions[0].phases.activity.items.length, 1);

  /* Regiments: only the named one survives; ids deduped; a non-object day
   * becomes a placeholder day rather than crashing the Builder. */
  assert.equal(c.regiments.length, 1);
  assert.equal(c.regiments[0].period, "Base");
  assert.deepEqual(c.regiments[0].days[0].sessions, ["a"]);
  assert.ok(Array.isArray(c.regiments[0].days[1].sessions));

  /* Tracker: only the real calendar date survives; the junk entry and the
   * empty result key are dropped; the logged set numbers are kept. */
  assert.deepEqual(Object.keys(c.tracker).sort(), ["2026-03-01", "schemaVersion"]);
  assert.deepEqual(Object.keys(c.tracker["2026-03-01"].sessions), ["ok"]);
  assert.equal(c.tracker["2026-03-01"].sessions.ok.results.r1.done, true);
  assert.equal(c.tracker["2026-03-01"].sessions.ok.results.r1.actual.sets.length, 1);
  assert.equal(c.tracker["2026-03-01"].sessions.ok.results.r1.actual.sets[0].weight, 135);

  /* AFT: only the recognised event with a real date and a value survives. */
  assert.deepEqual(c.aftResults.map((r) => r.event), ["MDL"]);
  assert.equal(c.aftResults[0].value, "250");

  /* Bodyweight: a negative weight and an unknown unit are rejected, a missing
   * unit defaults to lb, and the number stays a number. */
  assert.equal(c.bodyweight.length, 1);
  assert.equal(c.bodyweight[0].weight, 180.5);
  assert.equal(c.bodyweight[0].unit, "lb");

  /* Groups and custom exercises: names required, tags deduped and non-empty. */
  assert.deepEqual(c.groups.map((g) => g.name), ["G", "Tagged"]);
  assert.deepEqual(c.groups[1].tags, ["a"]);
  assert.deepEqual(c.customExercises.map((x) => x.name), ["Sled Push"]);
  assert.deepEqual(c.customExercises[0].cues, ["drive"]);

  /* Settings: scalars only; nested values dropped. */
  assert.deepEqual(c.settings, { pwHash: "h1.2", unit: "lb", n: 3 });

  /* The summary counts reflect what was actually restored. */
  assert.deepEqual(res.data.counts, {
    sessions: 2, regiments: 1, trackerDays: 1, trackerEntries: 1,
    aftResults: 1, bodyweight: 1, groups: 2, customExercises: 1, settingsKeys: 3
  });
});

test("collections cap oversized arrays instead of rejecting the file", () => {
  const sessions = [];
  for (let i = 0; i < 600; i++) sessions.push({ name: "S" + i, phases: { activity: { items: [] } } });
  const groups = [];
  for (let i = 0; i < 300; i++) groups.push({ name: "G" + i });
  const env = EXP.buildExport(mkStore(), CTX);
  const doc = Object.assign({}, JSON.parse(JSON.stringify(env)), {
    collections: Object.assign({}, env.collections, { sessions, groups })
  });
  const res = EXP.parseImport(JSON.stringify(doc), CTX);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.collections.sessions.length, 500);
  assert.equal(res.data.collections.groups.length, 200);
});

test("a pre-v2 tracker dump restores its tick marks through the real migration", () => {
  const legacy = {
    format: EXP.FORMAT, version: 1,
    collections: {
      sessions: [], regiments: [], aftResults: [], bodyweight: [], groups: [], customExercises: [], settings: {},
      /* v1 store: no schemaVersion, ticks live on the entry as `done`. */
      tracker: { "2026-01-02": { sessions: { "s-upper-a": { done: { i1: true, i2: true }, complete: true, snapshot: mkSession() } } } }
    }
  };
  const res = EXP.parseImport(JSON.stringify(legacy), CTX);
  assert.equal(res.ok, true, res.error);
  const t = res.data.collections.tracker;
  assert.equal(t.schemaVersion, TS.SCHEMA_VERSION);
  const entry = t["2026-01-02"].sessions["s-upper-a"];
  assert.equal(entry.results.i1.done, true, "the logged tick survives the upgrade");
  assert.equal(entry.results.i2.done, true);
  assert.equal(entry.results.i3.done, false);
  assert.equal(entry.complete, true);
});

test("without a context the module still sanitizes and still round-trips", () => {
  const env = EXP.buildExport(mkStore());
  assert.equal(env.collections.sessions.length, 1);
  assert.equal(env.collections.sessions[0].phases.activity.items[0].label, "Deadlift");
  assert.equal(env.collections.settings.unit, "lb");
  const res = EXP.parseImport(JSON.stringify(env));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.data.collections, env.collections);

  /* Junk is still refused on the mirror path. */
  const res2 = EXP.parseImport(JSON.stringify({
    format: EXP.FORMAT, version: 1,
    collections: {
      sessions: [{ name: "Ok", phases: { activity: { items: [null, "x"] } } }, { phases: {} }],
      regiments: [], aftResults: [], bodyweight: [], groups: [], customExercises: [], settings: {},
      tracker: { "2026-01-02": { sessions: { a: { schema: 3, results: { r: { done: true } } }, b: "junk" } } }
    }
  }));
  assert.equal(res2.ok, true, res2.error);
  assert.equal(res2.data.collections.sessions.length, 1);
  assert.deepEqual(res2.data.collections.sessions[0].phases.activity.items, []);
  assert.deepEqual(Object.keys(res2.data.collections.tracker["2026-01-02"].sessions), ["a"]);
  /* No tracker-schema module was supplied, so the store is left unversioned and
   * app.js's own migration decides what it is. */
  assert.equal(res2.data.collections.tracker.schemaVersion, undefined);
});

test("sanitizing is idempotent: a second pass changes nothing", () => {
  const once = EXP.parseImport(JSON.stringify({
    format: EXP.FORMAT, version: 1,
    collections: {
      sessions: [{ name: "Real" }], regiments: [{ name: "R" }],
      tracker: { "2026-03-01": { sessions: { ok: { schema: 3, results: { r1: { done: true, actual: { sets: [{ weight: 135 }] } } } } } } },
      aftResults: [{ event: "MDL", date: "2026-01-06", value: "250" }],
      bodyweight: [{ date: "2026-01-05", weight: "180.5" }],
      groups: [{ name: "G", tags: ["a"] }], customExercises: [{ name: "Sled Push" }], settings: { unit: "lb" }
    }
  }), CTX);
  assert.equal(once.ok, true, once.error);
  const twice = EXP.parseImport(JSON.stringify(once.data), CTX);
  assert.equal(twice.ok, true, twice.error);
  assert.deepEqual(twice.data.collections, once.data.collections);
});