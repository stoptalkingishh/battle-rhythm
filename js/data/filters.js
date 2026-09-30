"use strict";
/* Query predicates: the exercise Library filter/search and the session
 * tag/group filtering.
 *
 * Extracted from js/app.js for the same reason as js/data/session-text.js —
 * these were a self-contained, DOM-free block inside the monolith, and moving
 * them makes the query semantics testable with node:test instead of only
 * observable by clicking around the Library.
 *
 * Everything the predicates need arrives as an argument: the exercise list, the
 * session list, the preset list. Nothing is read from the DOM or storage, so
 * the module has no browser dependency at all.
 *
 * Two behaviours are load-bearing and deliberately preserved:
 *   - expandAliases is case-sensitive. Callers lowercase the query first
 *     (`q.toLowerCase()`), so an alias pattern like /tricep/g matches "tricep"
 *     but not "Tricep". Do not "fix" that here without a separate decision.
 *   - alias patterns are applied in array order, each with /g, so an earlier
 *     pattern can rewrite text a later one then matches ("db " -> "dumbbell"
 *     runs after /dumbbell/ has already been applied).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_FILTERS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Search shorthand the Library understands. Lowercase on purpose: the caller
   * lowercases the query before expansion. */
  var ALIASES = [
    [/med ?ball/g, "medicine ball"],
    [/tricep/g, "triceps"],
    [/lat ?pulldown|lat ?pull ?down/g, "lat pulldown"],
    [/ohp|overhead press/g, "overhead push-press"],
    [/bw/g, "bodyweight"],
    [/pullup|pull ?up/g, "pull-up"],
    [/plank/g, "plank"],
    [/sqt|squats/g, "squat"],
    [/dumbbell/g, "dumbbell"],
    [/db /g, "dumbbell"]
  ];

  function expandAliases(q) {
    return ALIASES.reduce(function (memo, pair) { return memo.replace(pair[0], pair[1]); }, q);
  }

  /* The fields a free-text query searches. Kept here so matchesExercise and any
   * future index stay in step. */
  function haystack(exercise) {
    return (
      exercise.name + " " +
      (exercise.muscles || "") + " " +
      (exercise.drill || "") + " " +
      (exercise.equipment || "") + " " +
      (exercise.cues || []).join(" ") + " " +
      (exercise.programming || "")
    ).toLowerCase();
  }

  /**
   * A filter is `{ q, component, aft, equipment }` where the three non-query
   * fields use the string "all" for "no restriction". Absent fields are treated
   * as "all" / empty, so a partial filter object filters on what it does
   * specify rather than rejecting everything.
   */
  function matchesExercise(exercise, filter) {
    var f = filter || {};
    if (f.component && f.component !== "all" && exercise.component !== f.component) return false;
    if (f.aft && f.aft !== "all" && !(exercise.aft || []).some(function (a) { return a === f.aft; })) return false;
    if (f.equipment && f.equipment !== "all" && exercise.equipment !== f.equipment) return false;
    if (f.q) {
      if (haystack(exercise).indexOf(expandAliases(f.q.toLowerCase())) === -1) return false;
    }
    return true;
  }

  function filterExercises(exercises, filter) {
    return (exercises || []).filter(function (exercise) { return matchesExercise(exercise, filter); });
  }

  /** Tags are trimmed, stringified, and empties dropped: `[" a ", "", null]` -> `["a"]`. */
  function sessionTags(session) {
    var t = session && session.tags ? session.tags : [];
    return t.map(function (x) { return String(x).trim(); }).filter(Boolean);
  }

  /** Every distinct tag across the sessions, sorted. */
  function allTags(sessions) {
    var seen = {};
    (sessions || []).forEach(function (s) {
      sessionTags(s).forEach(function (t) { seen[t] = 1; });
    });
    return Object.keys(seen).sort();
  }

  /** A group with no tags matches everything — the "All" case. */
  function matchesGroup(session, group) {
    if (!group || !group.tags || !group.tags.length) return true;
    var st = sessionTags(session);
    return group.tags.some(function (t) { return st.indexOf(t) !== -1; });
  }

  function isPreset(session, presets) {
    var list = presets || [];
    return list.some(function (p) { return p.id === session.id; });
  }

  return {
    ALIASES: ALIASES,
    expandAliases: expandAliases,
    haystack: haystack,
    matchesExercise: matchesExercise,
    filterExercises: filterExercises,
    sessionTags: sessionTags,
    allTags: allTags,
    matchesGroup: matchesGroup,
    isPreset: isPreset
  };
});