"use strict";
/* Pure AFT results collection helpers shared by the browser app (loads as
 * window.BRAFTResults) and the Node test suite (node:test).
 *
 * The app keeps a privacy-local, Drive-synced log of recognised event results:
 * br_aft_results = [ { id, date, event, value, unit, note, createdAt } ].
 * Each entry is a dated record the user explicitly added (event + result
 * value/unit + optional note). Only side-effect-free logic lives here; reading
 * localStorage and writing through Drive sync stays in app.js.
 *
 * The collection is merged like the other id-keyed arrays by sync-core's
 * mergeById, so entries sync across devices without touching anything else.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRAFTResults = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* The five AFT scoring events, in official order, with a sensible default
   * unit for each so a value can be recorded with a single tap. */
  var EVENTS = [
    { code: "MDL", name: "3 Repetition Max Deadlift", unit: "lb" },
    { code: "HRP", name: "Hand-Release Push-Up — Arm Extension", unit: "reps" },
    { code: "SDC", name: "Sprint-Drag-Carry", unit: "min:sec" },
    { code: "PLK", name: "Plank", unit: "min:sec" },
    { code: "2MR", name: "Two-Mile Run", unit: "min:sec" }
  ];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function events() { return EVENTS.slice(); }

  function eventFor(code) {
    for (var i = 0; i < EVENTS.length; i++) {
      if (EVENTS[i].code === code) return EVENTS[i];
    }
    return null;
  }

  function defaultUnit(code) {
    var e = eventFor(code);
    return e ? e.unit : "";
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function genId() {
    return "aft" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* Validate and normalise an incoming record. Returns a clean entry object,
   * or null when it is unusable. Requires an explicit dated event result. */
  function make(record) {
    if (!record || typeof record !== "object") return null;
    var event = record.event;
    if (!eventFor(event)) return null;
    var date = String(record.date == null ? "" : record.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) return null;
    var value = String(record.value == null ? "" : record.value).trim();
    if (!value) return null;
    var unit = String(record.unit == null ? "" : record.unit).trim() || defaultUnit(event);
    var note = String(record.note == null ? "" : record.note).trim();
    return {
      id: record.id || genId(),
      date: date,
      event: event,
      value: value,
      unit: unit,
      note: note,
      createdAt: record.createdAt || new Date().toISOString()
    };
  }

  function isRealDate(yyyymmdd) {
    var p = yyyymmdd.split("-").map(function (x) { return parseInt(x, 10); });
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  /* Insert a new entry or replace an existing one by id. Never mutates the
   * input; returns the new list and a flag so the caller knows it changed. */
  function upsert(list, record) {
    var entry = make(record);
    if (!entry) return { list: list || [], changed: false, entry: null };
    var out = (list || []).slice();
    var idx = -1;
    for (var i = 0; i < out.length; i++) {
      if (out[i] && out[i].id === entry.id) { idx = i; break; }
    }
    if (idx >= 0) out[idx] = entry; else out.push(entry);
    return { list: out, changed: true, entry: entry };
  }

  function remove(list, id) {
    var out = (list || []).filter(function (x) { return !(x && x.id === id); });
    return { list: out, changed: out.length !== (list || []).length };
  }

  /* Most recent first; ties broken by most recent createdAt. */
  function sortByDate(list) {
    return (list || []).slice().sort(function (a, b) {
      var c = String(b.date).localeCompare(String(a.date));
      if (c !== 0) return c;
      return String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date));
    });
  }

  /* Latest record (max date, then max createdAt) for each event. */
  function latestByEvent(list) {
    var out = {};
    (list || []).forEach(function (x) {
      if (!x) return;
      var cur = out[x.event];
      if (!cur ||
          x.date > cur.date ||
          (x.date === cur.date && String(x.createdAt || "") > String(cur.createdAt || ""))) {
        out[x.event] = x;
      }
    });
    return out;
  }

  function count(list) { return (list || []).length; }

  return {
    EVENTS: EVENTS,
    events: events,
    eventFor: eventFor,
    defaultUnit: defaultUnit,
    todayISO: todayISO,
    genId: genId,
    make: make,
    upsert: upsert,
    remove: remove,
    sortByDate: sortByDate,
    latestByEvent: latestByEvent,
    count: count
  };
});