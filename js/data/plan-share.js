"use strict";
/* Portable plan share/import, adapted for Battle Rhythm (reference behavior
 * modeled on openGym's plan-share module, rewritten clean here).
 *
 * A "plan" is the shareable part of the app: the saved-session line-up and the
 * regiments that reference them (no workout logs, no body-weight or AF  results
 * — those stay private). Exporting produces one small JSON document; importing
 * merges into the existing plans, never overwriting by name.
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

  /* Pick the plan-relevant subset of a saved session: identity, tags, and the
   * structure (phases -> items), minus anything tied to a logged workout. */
  function pickSession(s, present) {
    return {
      name: s && s.name ? String(s.name) : "",
      tags: (s && s.tags ? s.tags : [])
        .filter(function (x) { return present.indexOf(x) !== -1; })
        .slice(),
      phases: JSON.parse(JSON.stringify((s && (s.phases || s.snapshot)) || []))
    };
  }

  /* Serialize an array of sessions (+ regiments) into the portable plan. */
  function exportPlan(sessions, regiments) {
    var known = {};
    (sessions || []).forEach(function (s) {
      if (s && s.tags) s.tags.forEach(function (t) { known[t] = true; });
    });
    var tags = Object.keys(known);
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      tags: tags,
      sessions: (sessions || []).filter(function (s) { return s && s.name; })
        .map(function (s) { return pickSession(s, tags); }),
      regiments: (regiments || []).filter(function (r) { return r && r.name; })
        .map(function (r) { return { name: r.name, period: r.period || "", sessions: (r.sessions || []).slice() }; })
    };
  }

  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

  /* Parse + validate an exported plan document. Throws on anything that is not
   * a Battle Rhythm plan at all; tolerates a missing payload as an empty plan. */
  function parsePlan(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("Not valid JSON"); }
    if (!isObj(data)) throw new Error("Not a plan document");
    if (data.format && data.format !== FORMAT) throw new Error("Not the Battle Rhythm plan format");
    return data;
  }

  /* Merge an imported plan into existing sessions/regiments. New entries are
   * appended (deduped by name); existing entries are left untouched so a share
   * can never overwrite what you already have. Returns { sessions, regiments,
   * added }. */
  function importPlan(text, current) {
    current = current || {};
    var data = parsePlan(text);
    if (data.version > VERSION) throw new Error("Plan was made by a newer version of Battle Rhythm");
    var sessions = (current.sessions || []).slice();
    var regiments = (current.regiments || []).slice();
    var added = 0;

    var haveS = {};
    sessions.forEach(function (s) { if (s && s.name) haveS[s.name] = true; });
    ((data.sessions) || []).forEach(function (s) {
      if (s && s.name && !haveS[s.name]) { sessions.push({ name: s.name, tags: s.tags || [], phases: s.phases || s.snapshot || [] }); haveS[s.name] = true; added++; }
    });

    var haveR = {};
    regiments.forEach(function (r) { if (r && r.name) haveR[r.name] = true; });
    ((data.regiments) || []).forEach(function (r) {
      if (r && r.name && !haveR[r.name]) { regiments.push({ name: r.name, period: r.period || "", sessions: (r.sessions || []).slice() }); haveR[r.name] = true; added++; }
    });

    return { sessions: sessions, regiments: regiments, added: added };
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    exportPlan: exportPlan,
    parsePlan: parsePlan,
    importPlan: importPlan
  };
});