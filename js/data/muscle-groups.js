"use strict";
/* Muscle-group taxonomy + per-group load aggregation, adapted for Battle Rhythm
 * (reference behavior modeled on openGym's muscles module, rewritten clean here).
 *
 * Battle Rhythm exercises describe targets as a free-text `muscles` string in
 * the convention "primary muscles; secondary muscles" (e.g. "Hamstrings,
 * glutes, back; secondary quads, grip"). parseMusclesText() resolves that into
 * primary/secondary muscle-group ids; musclesOf() prefers an explicit
 * `muscleTargets` array on the exercise when present, and falls back to the text.
 *
 * loadOf() totals the training load (weight × reps) received by each muscle
 * group across a set of entries, so Phase 1 can shade a body map by actual
 * weekly volume.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_MUSCLE_GROUPS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Canonical muscle groups. `id` is the machine key, `label` the display name,
   * `bp` the cluster used to group them on a front/back figure. */
  var MUSCLES = [
    { id: "chest", label: "Chest", bp: "upper" },
    { id: "shoulders", label: "Shoulders", bp: "upper" },
    { id: "biceps", label: "Biceps", bp: "upper" },
    { id: "triceps", label: "Triceps", bp: "upper" },
    { id: "forearms", label: "Forearms / Grip", bp: "upper" },
    { id: "traps", label: "Traps", bp: "upper" },
    { id: "back", label: "Back", bp: "upper" },
    { id: "lats", label: "Lats", bp: "upper" },
    { id: "core", label: "Core", bp: "core" },
    { id: "abs", label: "Abs", bp: "core" },
    { id: "obliques", label: "Obliques", bp: "core" },
    { id: "glutes", label: "Glutes", bp: "lower" },
    { id: "quads", label: "Quads", bp: "lower" },
    { id: "hamstrings", label: "Hamstrings", bp: "lower" },
    { id: "calves", label: "Calves", bp: "lower" },
    { id: "adductors", label: "Adductors", bp: "lower" }
  ];

  var ALIASES = {
    chest: "chest", pecs: "chest", pec: "chest", "chest press": "chest",
    shoulders: "shoulders", delts: "shoulders", deltoids: "shoulders", "rear delts": "shoulders",
    biceps: "biceps", biceps: "biceps",
    triceps: "triceps",
    forearms: "forearms", grip: "forearms",
    traps: "traps", trapezius: "traps",
    back: "back", "upper back": "back", "middle back": "back",
    lats: "lats", latissimus: "lats",
    core: "core", trunk: "core",
    abs: "abs", abdominals: "abs", abdominals: "abs",
    obliques: "obliques",
    glutes: "glutes", glutes: "glutes",
    quads: "quads", quadriceps: "quads",
    hamstrings: "hamstrings", hams: "hamstrings",
    calves: "calves", calf: "calves", "lower leg": "calves",
    adductors: "adductors", inner: "adductors"
  };

  function normalize(str) {
    return String(str || "").toLowerCase().replace(/[^a-z ,/]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Split a muscle string on ";" into primary / secondary phrases. The optional
   * "secondary"/"target"/"focus" keyword marks the second half; otherwise all
   * listed muscles are treated as primary. */
  function parseMusclesText(str) {
    var raw = String(str || "").trim();
    if (!raw) return { primary: [], secondary: [] };
    var halves = raw.split(";");
    var primaryStr = normalize(halves[0] || "");
    var secondaryStr = halves.length > 1 ? normalize(halves.slice(1).join(";")) : "";
    /* Drop a leading "secondary"/"target"/"focus" keyword from either half. */
    secondaryStr = secondaryStr.replace(/^(secondary|target|focus)\b/, "").trim();
    function resolve(phrase) {
      var out = [];
      phrase.split(/[,/]+/).forEach(function (token) {
        var t = token.trim();
        var id = ALIASES[t];
        if (id && out.indexOf(id) === -1) out.push(id);
      });
      return out;
    }
    return { primary: resolve(primaryStr), secondary: resolve(secondaryStr) };
  }

  /* Muscle-group ids for an exercise, honoring an explicit `muscleTargets`
   * ({primary:[], secondary:[]}) when present. */
  function musclesOf(ex) {
    if (ex && ex.muscleTargets && Array.isArray(ex.muscleTargets.primary)) {
      return ex.muscleTargets;
    }
    return parseMusclesText(ex && ex.muscles);
  }

  function matchesMuscles(ex, query) {
    var q = String(query || "").toLowerCase().trim();
    if (!q) return true;
    var ids = [];
    var groups = musclesOf(ex);
    ids = ids.concat(groups.primary, groups.secondary);
    return ids.indexOf(q) !== -1;
  }

  /* Is this id a known muscle group? */
  function isValid(id) {
    return MUSCLES.some(function (m) { return m.id === id; });
  }

  function labelOf(id) {
    var m = MUSCLES.find(function (g) { return g.id === id; });
    return m ? m.label : id;
  }

  /* Total weight × reps each muscle group received across entries.
   * `entries` is [{ muscles, sets }] — the same normalized entry shape as
   * set-history. Returns { "<muscleId>": load }. */
  function loadOf(entries) {
    var load = {};
    (entries || []).forEach(function (e) {
      var groups = musclesOf(e);
      var ids = groups.primary.concat(groups.secondary);
      if (!ids.length) return;
      var total = 0;
      (e.sets || []).forEach(function (s) {
        if (s.done) total += (s.w || 0) * (s.r || 0);
      });
      ids.forEach(function (id) {
        if (isValid(id)) load[id] = (load[id] || 0) + total;
      });
    });
    return load;
  }

  /* Bin a load value into a level 0..3 by thresholds; undefined thresholds use
   * a simple 0 / 25th / 75th split of the observed range. */
  function levelsOf(load, thresholds) {
    var vals = Object.keys(load).map(function (k) { return load[k]; });
    if (!vals.length) return {};
    var hi = Math.max.apply(null, vals);
    var lo = Math.min.apply(null, vals);
    var t = thresholds || [lo, (lo + hi) / 2, hi];
    var out = {};
    Object.keys(load).forEach(function (id) {
      var v = load[id];
      var level = 0;
      for (var i = 0; i < t.length; i++) if (v >= t[i]) level = i + 1;
      out[id] = level;
    });
    return out;
  }

  return {
    MUSCLES: MUSCLES,
    parseMusclesText: parseMusclesText,
    musclesOf: musclesOf,
    matchesMuscles: matchesMuscles,
    isValid: isValid,
    labelOf: labelOf,
    loadOf: loadOf,
    levelsOf: levelsOf
  };
});