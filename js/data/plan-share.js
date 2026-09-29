"use strict";
/* Portable plan share/import, adapted for Battle Rhythm (reference behavior
 * modeled on openGym's plan-share module, rewritten clean here).
 *
 * A "plan" is the shareable part of the app: the saved-session line-up and the
 * regiments that reference them (no workout logs, no body-weight or AF  results
 * — those stay private). Exporting produces one small JSON document; importing
 * merges into the existing plans, never overwriting by name.
 *
 * The wire format mirrors the app's REAL storage shapes exactly, so a share
 * round-trips without the Builder having to repair anything (see js/app.js
 * blankSession / blankRegiment):
 *
 *   session  = { id, name, duration, focus, rpe, format, circuit, notes,
 *                tags[], safetyConfirmed,
 *                phases: { prep|activity|recovery: { name, items[] } } }
 *   regiment = { id, name, period, days: [ { name, sessions: [sessionId] } ] }
 *
 * Everything entering the app (a share file, or a synced Drive collection)
 * goes through the whitelist normalizers below, so no payload can store a
 * record the Builder cannot render.
 *
 * Pure + unit-tested. app.js wires download / file-read onto this.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_PLAN_SHARE = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var FORMAT = "battle-rhythm-plan";
  var VERSION = 1;

  /* Canonical keys, mirroring js/app.js. */
  var PHASE_ORDER = ["prep", "activity", "recovery"];
  var PHASE_LABEL = { prep: "Preparation", activity: "Activity", recovery: "Recovery" };
  /* Doctrine period names (js/data/doctrine.js programming.periods) — the only
   * values the regiment period picker can hold. */
  var PERIODS = ["Base", "Build", "Peak 1 (Taper)", "Combat / Peak 2", "Recovery"];
  /* Default weekday layout, mirroring blankRegiment(). */
  var DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  var FORMATS = ["session", "circuit"];
  var ITEM_TYPES = ["exercise", "drill"];
  var MODES = ["reps", "time"];

  /* Import guards. A share file (or a synced Drive collection) is untrusted
   * input, so string lengths are clamped and collection counts capped. */
  var MAX_FILE_BYTES = 512 * 1024; /* whole document; checked before JSON.parse */
  var MAX_SESSIONS = 500;           /* per import / read */
  var MAX_REGIMENTS = 100;          /* per import / read */
  var MAX_DAYS = 14;                /* days per regiment */
  var MAX_DAY_SESSIONS = 40;        /* session ids per day */
  var MAX_ITEMS = 80;               /* items per phase */
  var MAX_TAGS = 12;                /* tags per session */
  var MAX_NAME = 80;                /* session / regiment / day names */
  var MAX_LABEL = 140;              /* item label */
  var MAX_REF = 60;                 /* ids and exercise/drill refs */
  var MAX_TEXT = 60;                /* cue-length text: focus, sets, reps, rest, machine... */
  var MAX_NOTES = 2000;             /* free-form session notes */
  var MAX_MINUTES = 600;            /* session duration ceiling */
  var MAX_ROUNDS = 50;              /* circuit rounds ceiling */

  /* ---- helpers ---- */
  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }

  /* Trimmed string, clamped to a max length. Never returns a non-string. */
  function str(v, max) {
    var s = String(v == null ? "" : v).trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }

  /* Integer within [min, max]; dflt when the value is not a number at all. */
  function clampNum(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  function genId() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Array of trimmed, non-empty, deduped strings, capped. A bare string or
   * number is treated as a one-element list; anything else yields []. */
  function toStrings(v, cap, max) {
    var arr = Array.isArray(v) ? v : ((typeof v === "string" || typeof v === "number") ? [v] : []);
    var out = [];
    for (var i = 0; i < arr.length && out.length < cap; i++) {
      var s = str(arr[i], max);
      if (s && out.indexOf(s) === -1) out.push(s);
    }
    return out;
  }

  /* One planned exercise/drill row: the app's item shape (newItemFromExercise)
   * plus the v3 tracker fields (mode/warmup/perside/bodyweight/superset/effort).
   * Returns null for a row with nothing to render. */
  function normalizeItem(it) {
    if (!isObj(it)) return null;
    var label = str(it.label, MAX_LABEL);
    var ref = str(it.ref, MAX_REF);
    if (!label && !ref) return null;
    var type = str(it.type);
    return {
      id: str(it.id, MAX_REF) || genId(),
      type: ITEM_TYPES.indexOf(type) === -1 ? "exercise" : type,
      ref: ref,
      label: label,
      sets: str(it.sets, MAX_TEXT),
      reps: str(it.reps, MAX_TEXT),
      duration: str(it.duration, MAX_TEXT),
      rest: str(it.rest, MAX_TEXT),
      machine: str(it.machine, MAX_TEXT),
      /* Same inference as tracker-schema v3: a planned duration implies a timed
       * exercise, otherwise reps. */
      mode: MODES.indexOf(str(it.mode)) === -1 ? (str(it.duration, MAX_TEXT) ? "time" : "reps") : str(it.mode),
      warmup: !!it.warmup,
      perside: !!it.perside,
      bodyweight: !!it.bodyweight,
      superset: str(it.superset, MAX_REF),
      effort: str(it.effort, MAX_TEXT)
    };
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    var out = [];
    for (var i = 0; i < items.length && out.length < MAX_ITEMS; i++) {
      var it = normalizeItem(items[i]);
      if (it) out.push(it);
    }
    return out;
  }

  /* Phases are always the object form {prep, activity, recovery}. A legacy
   * array (the old v1 export, or a bare snapshot list) is folded in by phase
   * name, falling back to position; anything else yields empty phases. */
  function normalizePhases(raw) {
    var out = {};
    PHASE_ORDER.forEach(function (key) { out[key] = { name: PHASE_LABEL[key], items: [] }; });
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length && i < PHASE_ORDER.length; i++) {
        var p = raw[i];
        if (!isObj(p)) continue;
        var byName = PHASE_ORDER.indexOf(str(p.name).toLowerCase());
        var key = byName === -1 ? PHASE_ORDER[i] : PHASE_ORDER[byName];
        var items = normalizeItems(p.items);
        if (!items.length) continue;
        out[key].name = str(p.name, MAX_NAME) || PHASE_LABEL[key];
        out[key].items = items;
      }
      return out;
    }
    if (isObj(raw)) {
      PHASE_ORDER.forEach(function (key) {
        var p = raw[key];
        if (!isObj(p)) return;
        var items = normalizeItems(p.items);
        if (!items.length) return;
        out[key].name = str(p.name, MAX_NAME) || PHASE_LABEL[key];
        out[key].items = items;
      });
    }
    return out;
  }

  /* One saved session, normalized to the app's real session shape. Returns
   * null when the record is unusable (no name), so a bad row can never be
   * persisted and later throw in the Builder. */
  function normalizeSession(s) {
    if (!isObj(s)) return null;
    var name = str(s.name, MAX_NAME);
    if (!name) return null;
    var circuit = isObj(s.circuit) ? s.circuit : {};
    var format = str(s.format);
    return {
      id: str(s.id, MAX_REF) || genId(),
      name: name,
      duration: clampNum(s.duration, 10, MAX_MINUTES, 60),
      focus: str(s.focus, MAX_TEXT),
      rpe: clampNum(s.rpe, 1, 10, 7),
      format: FORMATS.indexOf(format) === -1 ? "session" : format,
      circuit: {
        rounds: clampNum(circuit.rounds, 1, MAX_ROUNDS, 3),
        work: str(circuit.work, MAX_TEXT) || "45 sec",
        rest: str(circuit.rest, MAX_TEXT) || "30 sec"
      },
      notes: str(s.notes, MAX_NOTES),
      tags: toStrings(s.tags, MAX_TAGS, MAX_NAME),
      safetyConfirmed: !!s.safetyConfirmed,
      phases: normalizePhases(s.phases != null ? s.phases : s.snapshot)
    };
  }

  function normalizePeriod(v) {
    var p = str(v);
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].toLowerCase() === p.toLowerCase()) return PERIODS[i];
    }
    return PERIODS[0];
  }

  /* One regiment day: { name, sessions: [sessionId] }. A bare id list is
   * tolerated and keeps the default weekday name. */
  function normalizeDay(d, i) {
    var list = isObj(d) ? d.sessions : d;
    return {
      name: (isObj(d) ? str(d.name, MAX_NAME) : "") || DEFAULT_DAYS[i] || ("Day " + (i + 1)),
      sessions: toStrings(list, MAX_DAY_SESSIONS, MAX_REF)
    };
  }

  /* One regiment, normalized to the app's real regiment shape (id, name,
   * period, days[]). Returns null when the record has no name. */
  function normalizeRegiment(r) {
    if (!isObj(r)) return null;
    var name = str(r.name, MAX_NAME);
    if (!name) return null;
    /* The old share format put session refs on the regiment itself; fold those
     * into a single unassigned day rather than dropping them. */
    var days = Array.isArray(r.days) ? r.days
      : (Array.isArray(r.sessions) ? [{ name: DEFAULT_DAYS[0], sessions: r.sessions }] : []);
    return {
      id: str(r.id, MAX_REF) || genId(),
      name: name,
      period: normalizePeriod(r.period),
      days: days.slice(0, MAX_DAYS).map(normalizeDay)
    };
  }

  /* Normalize a list. cap > 0 bounds untrusted input (import + synced reads);
   * export passes cap 0 so a real library is never silently truncated. */
  function normalizeList(list, fn, cap) {
    if (!Array.isArray(list)) return [];
    return (cap ? list.slice(0, cap) : list).map(fn).filter(Boolean);
  }

  function normalizeSessionList(list) { return normalizeList(list, normalizeSession, MAX_SESSIONS); }
  function normalizeRegimentList(list) { return normalizeList(list, normalizeRegiment, MAX_REGIMENTS); }

  /* Serialize an array of sessions (+ regiments) into the portable plan. */
  function exportPlan(sessions, regiments) {
    var known = {};
    var outSessions = normalizeList(sessions, normalizeSession, 0);
    outSessions.forEach(function (s) {
      s.tags.forEach(function (t) { known[t] = true; });
    });
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      tags: Object.keys(known),
      sessions: outSessions,
      regiments: normalizeList(regiments, normalizeRegiment, 0)
    };
  }

  /* Parse + validate an exported plan document. Throws on anything that is not
   * a Battle Rhythm plan at all; tolerates a missing payload as an empty plan.
   * The size check runs BEFORE JSON.parse so an oversized file is never
   * materialized into a huge object graph. */
  function parsePlan(text) {
    var raw = String(text == null ? "" : text);
    if (raw.length > MAX_FILE_BYTES) {
      throw new Error("Plan file is too large (limit " + Math.round(MAX_FILE_BYTES / 1024) + " KB)");
    }
    var data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error("Not valid JSON"); }
    if (!isObj(data)) throw new Error("Not a plan document");
    if (data.format && data.format !== FORMAT) throw new Error("Not the Battle Rhythm plan format");
    return data;
  }

  /* Merge an imported plan into existing sessions/regiments. New entries are
   * appended (deduped by name); existing entries are left untouched so a share
   * can never overwrite what you already have. Every incoming record is run
   * through the normalizers, so a malformed payload is sanitized (or dropped)
   * rather than stored. Returns { sessions, regiments, added }. */
  function importPlan(text, current) {
    current = current || {};
    var data = parsePlan(text);
    if (data.version > VERSION) throw new Error("Plan was made by a newer version of Battle Rhythm");
    var sessions = (current.sessions || []).slice();
    var regiments = (current.regiments || []).slice();
    var added = 0;

    var haveS = {};
    sessions.forEach(function (s) { if (s && s.name) haveS[s.name] = true; });
    normalizeSessionList(data.sessions).forEach(function (s) {
      if (!haveS[s.name]) { sessions.push(s); haveS[s.name] = true; added++; }
    });

    var haveR = {};
    regiments.forEach(function (r) { if (r && r.name) haveR[r.name] = true; });
    normalizeRegimentList(data.regiments).forEach(function (r) {
      if (!haveR[r.name]) { regiments.push(r); haveR[r.name] = true; added++; }
    });

    return { sessions: sessions, regiments: regiments, added: added };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    PHASE_ORDER: PHASE_ORDER,
    PERIODS: PERIODS,
    exportPlan: exportPlan,
    parsePlan: parsePlan,
    importPlan: importPlan,
    normalizeSession: normalizeSession,
    normalizeRegiment: normalizeRegiment,
    normalizeSessionList: normalizeSessionList,
    normalizeRegimentList: normalizeRegimentList
  };
});
