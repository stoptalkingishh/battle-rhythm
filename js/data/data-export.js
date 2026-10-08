"use strict";
/* Versioned, Drive-independent export / import of the whole local store.
 *
 * Why this exists: everything the app knows lives in localStorage, and the
 * only durable copy today is Google Drive — which a guest-mode user does not
 * have. Without a plain JSON dump, clearing the browser profile loses every
 * session, log and weigh-in with no recovery path. This module is that dump.
 *
 * Scope — exactly eight collections travel, mapped to their localStorage keys:
 *
 *   sessions        br_sessions          saved builder sessions
 *   regiments       br_regiments         weekly regiments over saved sessions
 *   tracker         br_tracker           log entries and per-set history
 *   aftResults      br_aft_results       personal AFT event results
 *   bodyweight      br_bodyweight        weigh-ins
 *   groups          br_groups            saved tag bundles
 *   customExercises br_custom_exercises  user-authored exercises
 *   settings        br_settings          preferences
 *
 * Deliberately NOT exported, because neither is user-authored training data:
 *   - Drive / sync state (brsync_outbox, brsync_mtime_*, br_tracker_active):
 *     device-local bookkeeping that must not be replayed onto another device;
 *     a stale outbox would re-upload collections this import just replaced.
 *   - the master-password hash inside br_settings: see sanitizeSettings.
 *   - ephemeral view state (br_timer_state:*, br_presets_hidden, br_week,
 *     br_bw_goal). The week and bodyweight goal are conveniences re-derivable
 *     in a click; keeping the envelope to the eight collections above keeps it
 *     reviewable.
 *
 * Pure and DOM-free: buildExport takes the collections object and returns the
 * envelope; parseImport takes a JSON string and returns an explicit result
 * ({ok:true, data} / {ok:false, error}). Reading files, writing localStorage,
 * confirming with the user and applying the result all stay in app.js.
 *
 * Nothing is applied partially: parseImport either returns a fully sanitized
 * envelope or an error. Individual junk ROWS inside an otherwise valid payload
 * are dropped rather than rejecting the file (a single corrupt weigh-in must
 * not cost the user their whole history), and every row that survives is
 * rebuilt field-by-field from a whitelist so no payload can store a record the
 * owning module would refuse.
 *
 * The normalizers that already own these shapes are injected through `ctx`
 * (see resolve() below) rather than duplicated here, following the precedent in
 * js/data/session-text.js: plan-share owns the session/regiment whitelist,
 * tracker-schema owns the tracker migration, and the aft/bodyweight/custom
 * modules own their record validation. The conservative mirrors below exist
 * only so that a caller without those modules still gets a safe result.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_DATA_EXPORT = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var FORMAT = "battle-rhythm-data";
  var VERSION = 1;

  /* Whole document, checked BEFORE JSON.parse so an oversized file is never
   * materialized into a huge object graph. A real library is a few hundred KB
   * of text, so this is a safety net, not a working limit. */
  var MAX_FILE_BYTES = 8 * 1024 * 1024;

  /* Per-collection ceilings. Import is untrusted input; export passes through
   * the same caps so what is written is what can be read back. */
  var MAX_SESSIONS = 500;
  var MAX_REGIMENTS = 100;
  var MAX_GROUPS = 200;
  var MAX_AFT = 1000;
  var MAX_BODYWEIGHT = 5000;
  var MAX_CUSTOM = 500;
  var MAX_TRACKER_DAYS = 1500;
  var MAX_ENTRIES_PER_DAY = 40;
  var MAX_RESULTS = 200;
  var MAX_SETS = 50;
  var MAX_TAGS = 12;
  var MAX_NAME = 80;
  var MAX_REF = 60;
  var MAX_TEXT = 60;
  var MAX_NOTES = 2000;
  var MAX_ITEMS = 80;
  var MAX_SETTING_KEYS = 40;
  var MAX_SETTING_KEY = 60;
  var MAX_SETTING_STR = 500;
  /* A tracker snapshot is a frozen copy of a session plan. We do not reshape
   * it beyond the plan-share whitelist (its item ids are what the logged
   * results are keyed by, so rewriting it could orphan real numbers); the byte
   * cap is the backstop against a payload smuggling in a huge blob. */
  var MAX_SNAPSHOT_BYTES = 256 * 1024;
  var TRACKER_SCHEMA = 3;

  /* ---- helpers ---- */
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }
  function isArr(v) { return Array.isArray(v); }
  function genId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Trimmed string, clamped to a max length. Never returns a non-string. */
  function str(v, max) {
    var s = String(v == null ? "" : v).trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }

  /* Text-ish value that may legitimately be a number (a logged weight of 135
   * is stored as 135, not "135"): keep numbers as numbers so import does not
   * silently retype the user's data. Everything else becomes a clamped string. */
  function scalar(v, max) {
    if (typeof v === "number" && isFinite(v)) return v;
    return str(v, max);
  }

  function nullableStr(v) { return typeof v === "string" && v.trim() ? v : null; }

  function clampNum(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  /* Real calendar dates only: "2026-02-30" is rejected. */
  function isRealDate(yyyymmdd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return false;
    var p = yyyymmdd.split("-").map(function (x) { return parseInt(x, 10); });
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }

  /* Array of trimmed, non-empty, deduped strings, capped. */
  function toStrings(v, cap, max) {
    var arr = isArr(v) ? v : ((typeof v === "string" || typeof v === "number") ? [v] : []);
    var out = [];
    for (var i = 0; i < arr.length && out.length < cap; i++) {
      var s = str(arr[i], max);
      if (s && out.indexOf(s) === -1) out.push(s);
    }
    return out;
  }

  function list(v, cap, fn) {
    if (!isArr(v)) return [];
    var src = v.length > cap ? v.slice(0, cap) : v;
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var row = fn(src[i]);
      if (row) out.push(row);
    }
    return out;
  }

  /* Structural clone with a byte ceiling; null when the value is not a plain
   * object or exceeds the ceiling. Used for opaque sub-objects we refuse to
   * reshape (legacy tracker entries, settings we do not own). */
  function cloneBounded(v, maxBytes) {
    if (!isObj(v)) return null;
    var s;
    try { s = JSON.stringify(v); } catch (e) { return null; }
    if (s == null || s.length > maxBytes) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  /* ---- context resolution ----
   * ctx (all optional) supplies the modules that already own each shape:
   *   planShare      BR_PLAN_SHARE      — normalizeSession / normalizeRegiment
   *   trackerSchema  BR_TrackerSchema   — SCHEMA_VERSION / migrateToV2
   *   aft            BR_AFTResults      — make()
   *   bodyweight     BR_BODYWEIGHT      — make()
   *   custom         BR_CUSTOM          — make()
   * The app passes all five. Tests pass their own instances. A caller that
   * passes none still gets sanitized output through the mirrors below, so the
   * module never depends on script load order.
   */
  function hook(ctx, name, fnName) {
    var mod = ctx && ctx[name];
    return (mod && typeof mod[fnName] === "function") ? mod[fnName] : null;
  }

  /* ---- sessions and regiments ---- */

  /* Mirror of js/data/plan-share.js normalizeItem. Kept deliberately close to
   * it: if the two ever disagree, the app path (which passes plan-share) is
   * authoritative and this one is only reachable from a test. */
  function mirrorItem(it) {
    if (!isObj(it)) return null;
    var label = str(it.label, 140);
    var ref = str(it.ref, MAX_REF);
    if (!label && !ref) return null;
    return {
      id: str(it.id, MAX_REF) || genId("id"),
      type: it.type === "drill" ? "drill" : "exercise",
      ref: ref,
      label: label,
      sets: str(it.sets, MAX_TEXT),
      reps: str(it.reps, MAX_TEXT),
      duration: str(it.duration, MAX_TEXT),
      rest: str(it.rest, MAX_TEXT),
      machine: str(it.machine, MAX_TEXT),
      mode: it.mode === "time" ? "time" : (it.mode === "reps" ? "reps" : (str(it.duration, MAX_TEXT) ? "time" : "reps")),
      warmup: !!it.warmup,
      perside: !!it.perside,
      bodyweight: !!it.bodyweight,
      superset: str(it.superset, MAX_REF),
      effort: str(it.effort, MAX_TEXT)
    };
  }

  function mirrorPhases(raw) {
    var out = {
      prep: { name: "Preparation", items: [] },
      activity: { name: "Activity", items: [] },
      recovery: { name: "Recovery", items: [] }
    };
    if (!isObj(raw)) return out;
    ["prep", "activity", "recovery"].forEach(function (key) {
      var p = raw[key];
      if (!isObj(p)) return;
      out[key].name = str(p.name, MAX_NAME) || out[key].name;
      out[key].items = list(p.items, MAX_ITEMS, mirrorItem);
    });
    return out;
  }

  function mirrorSession(s) {
    if (!isObj(s)) return null;
    var name = str(s.name, MAX_NAME);
    if (!name) return null;
    var circuit = isObj(s.circuit) ? s.circuit : {};
    return {
      id: str(s.id, MAX_REF) || genId("id"),
      name: name,
      duration: clampNum(s.duration, 10, 600, 60),
      focus: str(s.focus, MAX_TEXT),
      rpe: clampNum(s.rpe, 1, 10, 7),
      format: s.format === "circuit" ? "circuit" : "session",
      circuit: {
        rounds: clampNum(circuit.rounds, 1, 50, 3),
        work: str(circuit.work, MAX_TEXT) || "45 sec",
        rest: str(circuit.rest, MAX_TEXT) || "30 sec"
      },
      notes: str(s.notes, MAX_NOTES),
      tags: toStrings(s.tags, MAX_TAGS, MAX_NAME),
      safetyConfirmed: !!s.safetyConfirmed,
      phases: mirrorPhases(s.phases)
    };
  }

  var MIRROR_PERIODS = ["Base", "Build", "Peak 1 (Taper)", "Combat / Peak 2", "Recovery"];

  function mirrorRegiment(r) {
    if (!isObj(r)) return null;
    var name = str(r.name, MAX_NAME);
    if (!name) return null;
    var period = str(r.period);
    var matched = MIRROR_PERIODS[0];
    for (var i = 0; i < MIRROR_PERIODS.length; i++) {
      if (MIRROR_PERIODS[i].toLowerCase() === period.toLowerCase()) matched = MIRROR_PERIODS[i];
    }
    var days = isArr(r.days) ? r.days : [];
    return {
      id: str(r.id, MAX_REF) || genId("r"),
      name: name,
      period: matched,
      days: days.slice(0, 14).map(function (d, i) {
        if (!isObj(d)) return { name: "Day " + (i + 1), sessions: [] };
        return { name: str(d.name, MAX_NAME) || ("Day " + (i + 1)), sessions: toStrings(d.sessions, 40, MAX_REF) };
      })
    };
  }

  function sanitizeSessions(v, ctx) {
    var norm = hook(ctx, "planShare", "normalizeSession") || mirrorSession;
    return list(v, MAX_SESSIONS, norm);
  }

  function sanitizeRegiments(v, ctx) {
    var norm = hook(ctx, "planShare", "normalizeRegiment") || mirrorRegiment;
    return list(v, MAX_REGIMENTS, norm);
  }

  /* ---- tracker logs (entries, per-set history) ---- */

  function sanitizeActual(a) {
    var src = isObj(a) ? a : {};
    var sets = [];
    var raw = isArr(src.sets) ? src.sets : [];
    for (var i = 0; i < raw.length && sets.length < MAX_SETS; i++) {
      var s = raw[i];
      if (!isObj(s)) continue;
      /* The row shape the tracker writes: { weight, reps, warmup }; timed and
       * distance rows carry duration/distance instead. Anything else is not a
       * logged set and is dropped. */
      var row = {
        weight: scalar(s.weight, MAX_TEXT),
        reps: scalar(s.reps, MAX_TEXT),
        duration: scalar(s.duration, MAX_TEXT),
        distance: scalar(s.distance, MAX_TEXT),
        rest: scalar(s.rest, MAX_TEXT),
        warmup: !!s.warmup
      };
      if (String(row.weight) !== "" || String(row.reps) !== "" ||
          String(row.duration) !== "" || String(row.distance) !== "") sets.push(row);
    }
    return {
      sets: sets,
      reps: scalar(src.reps, MAX_TEXT),
      weight: scalar(src.weight, MAX_TEXT),
      duration: scalar(src.duration, MAX_TEXT),
      distance: scalar(src.distance, MAX_TEXT),
      rpe: scalar(src.rpe, MAX_TEXT),
      rir: scalar(src.rir, MAX_TEXT),
      notes: str(src.notes, MAX_NOTES)
    };
  }

  function sanitizeResults(r) {
    var out = {};
    if (!isObj(r)) return out;
    var ids = Object.keys(r);
    for (var i = 0; i < ids.length && Object.keys(out).length < MAX_RESULTS; i++) {
      var key = str(ids[i], MAX_REF);
      var row = r[ids[i]];
      if (!key || !isObj(row)) continue;
      var res = { done: !!row.done, actual: sanitizeActual(row.actual) };
      var mode = str(row.mode, MAX_TEXT);
      if (mode) res.mode = mode;
      out[key] = res;
    }
    return out;
  }

  /* A snapshot, normalized through plan-share when available. A
   * snapshot the normalizer rejects (no name, or junk) becomes an empty object
   * rather than dropping the entry — the logged numbers hang off `results`,
   * not the snapshot. */
  function sanitizeSnapshot(s, ctx) {
    var norm = hook(ctx, "planShare", "normalizeSession");
    if (norm) {
      var clean = norm(s);
      if (clean) return clean;
    }
    var bounded = cloneBounded(s, MAX_SNAPSHOT_BYTES);
    return bounded || {};
  }

  /* Does a snapshot actually hold planned items? Used to tell a real (if
   * sparse) log from a row the tracker migration synthesised out of junk. */
  function snapshotHasItems(s) {
    if (!isObj(s) || !isObj(s.phases)) return false;
    return ["prep", "activity", "recovery"].some(function (key) {
      var p = s.phases[key];
      return isObj(p) && isArr(p.items) && p.items.length > 0;
    });
  }

  function sanitizeEntry(e, schema, ctx) {
    if (!isObj(e)) return null;
    if (!isObj(e.results)) {
      /* Pre-v2 entries kept the tick marks on the entry itself (`done`), and
       * results became an object only in v2. Preserve that shape instead of
       * inventing a `results` map, so the app's own migration still restores
       * the history; a row with neither is junk and is dropped. */
      if (!isObj(e.done) && !isObj(e.snapshot)) return null;
      return {
        schema: clampNum(e.schema, 1, TRACKER_SCHEMA, 1),
        complete: !!e.complete,
        done: isObj(e.done) ? e.done : {},
        snapshot: sanitizeSnapshot(e.snapshot, ctx),
        results: {}
      };
    }
    var entry = {
      schema: schema,
      complete: !!e.complete,
      startedAt: nullableStr(e.startedAt),
      completedAt: nullableStr(e.completedAt),
      rpeActual: str(e.rpeActual, MAX_TEXT),
      durationActual: str(e.durationActual, MAX_TEXT),
      notes: str(e.notes, MAX_NOTES),
      snapshot: sanitizeSnapshot(e.snapshot, ctx),
      results: sanitizeResults(e.results)
    };
    /* The tracker migration rebuilds a plausible empty entry out of anything
     * shaped like one, so a row whose `results` or `snapshot` carry nothing is
     * dropped here rather than restored as a blank log. */
    if (!Object.keys(entry.results).length && !snapshotHasItems(entry.snapshot)) return null;
    return entry;
  }

  /* The tracker store is { schemaVersion, "<date>": { sessions: { sid: entry } } }.
   * With ctx.trackerSchema the payload is migrated first (so a v1 dump restores
   * its tick marks and a v2 dump keeps its logged sets), then whitelisted.
   * Without it we leave the store unversioned and write only the fields the app
   * reads, so its own migration still runs on read. */
  function sanitizeTracker(v, ctx) {
    var TS = ctx && ctx.trackerSchema;
    var current = (TS && typeof TS.SCHEMA_VERSION === "number") ? TS.SCHEMA_VERSION : 0;
    var base = v;
    if (isObj(v) && current && typeof TS.migrateToV2 === "function") base = TS.migrateToV2(v);
    var out = current ? { schemaVersion: current } : {};
    if (!isObj(base)) return out;
    var schema = current || TRACKER_SCHEMA;
    var days = 0;
    Object.keys(base).forEach(function (date) {
      if (date === "schemaVersion" || days >= MAX_TRACKER_DAYS) return;
      if (!isRealDate(date)) return;
      var day = base[date];
      if (!isObj(day)) return;
      var src = isObj(day.sessions) ? day.sessions : {};
      var sessions = {};
      var ids = Object.keys(src);
      for (var i = 0; i < ids.length && Object.keys(sessions).length < MAX_ENTRIES_PER_DAY; i++) {
        var entry = sanitizeEntry(src[ids[i]], schema, ctx);
        var sid = str(ids[i], MAX_REF);
        if (entry && sid) sessions[sid] = entry;
      }
      /* A day whose every entry was junk carries nothing to restore. */
      if (!Object.keys(sessions).length) return;
      out[date] = { sessions: sessions };
      days++;
    });
    return out;
  }

  /* ---- AFT results and bodyweight ---- */

  function mirrorAft(r) {
    if (!isObj(r)) return null;
    var date = str(r.date);
    if (!isRealDate(date)) return null;
    var event = str(r.event, 12);
    var value = str(r.value, MAX_TEXT);
    if (!event || !value) return null;
    return {
      id: str(r.id, MAX_REF) || genId("aft"),
      date: date,
      event: event,
      value: value,
      unit: str(r.unit, 20),
      note: str(r.note, MAX_NOTES),
      createdAt: str(r.createdAt, 40)
    };
  }

  function mirrorBodyweight(r) {
    if (!isObj(r)) return null;
    var date = str(r.date);
    if (!isRealDate(date)) return null;
    var n = typeof r.weight === "number" ? r.weight : Number(str(r.weight));
    if (!isFinite(n) || n <= 0) return null;
    var unit = str(r.unit).toLowerCase() || "lb";
    if (unit !== "lb" && unit !== "kg") return null;
    return {
      id: str(r.id, MAX_REF) || genId("bw"),
      date: date,
      weight: n,
      unit: unit,
      note: str(r.note, MAX_NOTES),
      createdAt: str(r.createdAt, 40)
    };
  }

  function sanitizeAft(v, ctx) {
    return list(v, MAX_AFT, hook(ctx, "aft", "make") || mirrorAft);
  }

  function sanitizeBodyweight(v, ctx) {
    return list(v, MAX_BODYWEIGHT, hook(ctx, "bodyweight", "make") || mirrorBodyweight);
  }

  /* ---- groups and custom exercises ---- */

  /* Groups are app-level records ({ id, name, tags }) with no owning module. */
  function mirrorGroup(g) {
    if (!isObj(g)) return null;
    var name = str(g.name, MAX_NAME);
    if (!name) return null;
    return { id: str(g.id, MAX_REF) || genId("grp"), name: name, tags: toStrings(g.tags, MAX_TAGS, MAX_NAME) };
  }

  function sanitizeGroups(v) { return list(v, MAX_GROUPS, mirrorGroup); }

  function mirrorCustom(r) {
    if (!isObj(r)) return null;
    var name = str(r.name, MAX_NAME);
    if (!name) return null;
    return {
      id: str(r.id, MAX_REF) || genId("cx"),
      name: name,
      equipment: str(r.equipment, MAX_TEXT),
      muscles: str(r.muscles, 200),
      cues: toStrings(r.cues, 20, 200),
      notes: str(r.notes, MAX_NOTES),
      programming: str(r.programming, MAX_NOTES),
      component: "custom",
      source: "custom",
      createdAt: str(r.createdAt, 40),
      updatedAt: str(r.updatedAt, 40)
    };
  }

  function sanitizeCustom(v, ctx) {
    return list(v, MAX_CUSTOM, hook(ctx, "custom", "make") || mirrorCustom);
  }

  /* ---- settings ---- */

  /* Settings are a flat bag of scalar preferences. Only scalars survive the
   * round trip; nested values are dropped rather than deep-cloned, so a crafted
   * file cannot smuggle a structure into the live store. */
  function sanitizeSettings(v) {
    var out = {};
    if (!isObj(v)) return out;
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length && Object.keys(out).length < MAX_SETTING_KEYS; i++) {
      var key = str(keys[i], MAX_SETTING_KEY);
      if (!key) continue;
      var val = v[keys[i]];
      if (typeof val === "string") out[key] = str(val, MAX_SETTING_STR);
      else if (typeof val === "number" && isFinite(val)) out[key] = val;
      else if (typeof val === "boolean" || val === null) out[key] = val;
    }
    return out;
  }

  /* ---- collection table ----
   * localKey is the localStorage key the app reads and writes, so the caller
   * can apply an import without a second hand-written list that could drift. */
  function col(key, localKey, kind, sanitize) {
    return { key: key, localKey: localKey, kind: kind, sanitize: sanitize };
  }

  var COLLECTIONS = [
    col("sessions", "br_sessions", "array", sanitizeSessions),
    col("regiments", "br_regiments", "array", sanitizeRegiments),
    col("tracker", "br_tracker", "object", sanitizeTracker),
    col("aftResults", "br_aft_results", "array", sanitizeAft),
    col("bodyweight", "br_bodyweight", "array", sanitizeBodyweight),
    col("groups", "br_groups", "array", sanitizeGroups),
    col("customExercises", "br_custom_exercises", "array", sanitizeCustom),
    col("settings", "br_settings", "object", sanitizeSettings)
  ];

  function sanitizeAll(raw, ctx) {
    var out = {};
    COLLECTIONS.forEach(function (c) {
      out[c.key] = c.sanitize(raw ? raw[c.key] : null, ctx);
    });
    return out;
  }

  /* Row counts, so the UI can tell the user what a file holds before applying
   * it and tell them afterwards what was restored. */
  function countsOf(collections) {
    var t = (collections && collections.tracker) || {};
    var days = 0;
    var entries = 0;
    Object.keys(t).forEach(function (k) {
      if (k === "schemaVersion") return;
      days++;
      entries += Object.keys((t[k] && t[k].sessions) || {}).length;
    });
    return {
      sessions: (collections.sessions || []).length,
      regiments: (collections.regiments || []).length,
      trackerDays: days,
      trackerEntries: entries,
      aftResults: (collections.aftResults || []).length,
      bodyweight: (collections.bodyweight || []).length,
      groups: (collections.groups || []).length,
      customExercises: (collections.customExercises || []).length,
      settingsKeys: Object.keys(collections.settings || {}).length
    };
  }

  /* Build the envelope from the app's stored collections. The collections are
   * sanitized on the way out as well as on the way in, so an envelope is
   * always something this module can read back unchanged (export/import
   * round-trips to a deep-equal object). */
  function buildExport(input, ctx) {
    var collections = sanitizeAll(isObj(input) ? input : {}, ctx);
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      counts: countsOf(collections),
      collections: collections
    };
  }

  /* Parse + validate an exported document. Returns {ok:true, data} where data
   * is the sanitized envelope, or {ok:false, error} with a message safe to
   * show the user. Never throws for bad input, and never returns a partial
   * payload: a rejected file yields no data at all. */
  function parseImport(text, ctx) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, error: "That file is empty." };
    if (raw.length > MAX_FILE_BYTES) {
      return { ok: false, error: "That file is too large (limit " + Math.round(MAX_FILE_BYTES / (1024 * 1024)) + " MB)." };
    }
    var doc;
    try { doc = JSON.parse(raw); } catch (e) { return { ok: false, error: "That file is not valid JSON." }; }
    if (!isObj(doc)) return { ok: false, error: "That file is not a Battle Rhythm data export." };
    if (str(doc.format, 60) !== FORMAT) return { ok: false, error: "That file is not a Battle Rhythm data export." };
    var version = Number(doc.version);
    if (!isFinite(version) || version < 1) return { ok: false, error: "That export has no usable version number." };
    if (version > VERSION) {
      return { ok: false, error: "That export was made by a newer version of Battle Rhythm (" + version + "). Update the app first." };
    }
    if (!isObj(doc.collections)) return { ok: false, error: "That export contains no data." };
    /* Every collection must be present. An absent key is not treated as empty:
     * applying it would silently wipe a store the file simply forgot to carry. */
    for (var i = 0; i < COLLECTIONS.length; i++) {
      if (!(COLLECTIONS[i].key in doc.collections)) {
        return { ok: false, error: "That export is missing its " + COLLECTIONS[i].key + " data." };
      }
    }
    var collections = sanitizeAll(doc.collections, ctx);
    return {
      ok: true,
      data: {
        format: FORMAT,
        version: version,
        exportedAt: str(doc.exportedAt, 40),
        counts: countsOf(collections),
        collections: collections
      }
    };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    COLLECTIONS: COLLECTIONS,
    sanitizeSettings: sanitizeSettings,
    countsOf: countsOf,
    buildExport: buildExport,
    parseImport: parseImport
  };
});