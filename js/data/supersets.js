"use strict";
/* Pure helpers for grouping session items into supersets (BR_SUPERSETS).
 *
 * Battle Rhythm stores a `superset` (groupId) field on each planned item, so
 * this module only needs to model group membership and ordering over a
 * normalized ordered list of items:
 *
 *   item = { id, ..., superset: <groupId or ""> }
 *
 * All functions are pure: they return a NEW array of items with each item
 * shallow-copied, never mutating the input. Empty string is "no group",
 * matching the tracker-schema v3 default.
 *
 * Behavioral notes (working brief):
 *  - pairAdjacent pairs the two entries at `first` and `second`. They must be
 *    adjacent (otherwise it returns `{ adjacent:false }` so the caller can
 *    surface the constraint). Pairing against an existing contiguous group on
 *    either side merges those into one unit, so pairing 0,1 then 1,2 yields one
 *    three-item group — the same merging rule openGym's pairAdjacent uses,
 *    reimplemented cleanly here.
 *  - unpair splits one member out of its group (the other members stay grouped)
 *    and reports which members remain. unpairGroup dissolves the whole group.
 *  - isTrivial reports a lone member (size 1) that should dissolve.
 *  - roundOrder lays out a group for working back-to-back across rounds.
 *  - cleanup drops any superset id that is empty or has no adjacent partner
 *    (group of one dissolves back to no superset).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_SUPERSETS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function isArr(v) { return Array.isArray(v); }

  /* Shallow-copy every item so results never alias the caller's objects. */
  function cloneItems(items) {
    return (isArr(items) ? items : []).map(function (e) {
      var c = {};
      if (e && typeof e === "object") {
        for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) c[k] = e[k]; }
      }
      return c;
    });
  }

  /* The contiguous run around `idx` that shares items[idx].superset. A repeated
   * id in a separated part of the list is deliberately NOT included: display
   * semantics are adjacent items sharing one id. */
  function contiguousGroup(items, idx) {
    var sg = items[idx] && items[idx].superset;
    if (!sg) return [];
    var first = idx;
    var last = idx;
    while (first > 0 && items[first - 1].superset === sg) first--;
    while (last + 1 < items.length && items[last + 1].superset === sg) last++;
    var out = [];
    for (var i = first; i <= last; i++) out.push(i);
    return out;
  }

  /* Deterministic unused group id for the given pair of positions (mirrors the
   * freshSg convention but avoids colliding with any id already in use). */
  function freshGroup(items, left, right) {
    var base = "sg-" + left + "-" + right;
    var sg = base;
    var n = 2;
    while (items.some(function (e) { return (e && e.superset) === sg; })) {
      sg = base + "-" + (n++);
    }
    return sg;
  }

  /* Pair two adjacent entries into one superset group, merging any contiguous
   * group on either side. Original order is preserved. */
  function pairAdjacent(items, first, second, groupId) {
    if (!isArr(items)) return { items: [], groupId: null, adjacent: false };
    var validFirst = Number.isInteger(first) && first >= 0 && first < items.length;
    var validSecond = Number.isInteger(second) && second >= 0 && second < items.length;
    if (!validFirst || !validSecond) {
      return { items: cloneItems(items), groupId: null, adjacent: false };
    }
    /* The adjacency constraint: a superset pairs items worked back-to-back. */
    if (Math.abs(first - second) !== 1) {
      return { items: cloneItems(items), groupId: null, adjacent: false };
    }

    var next = cloneItems(items);
    var left = Math.min(first, second);
    var right = Math.max(first, second);
    var group = (groupId && typeof groupId === "string")
      ? groupId
      : next[left].superset || next[right].superset || freshGroup(next, left, right);

    var members = [];
    contiguousGroup(next, left).forEach(function (i) {
      if (members.indexOf(i) === -1) members.push(i);
    });
    contiguousGroup(next, right).forEach(function (i) {
      if (members.indexOf(i) === -1) members.push(i);
    });
    for (var i = left; i <= right; i++) {
      if (members.indexOf(i) === -1) members.push(i);
    }
    members.sort(function (a, b) { return a - b; });
    members.forEach(function (i) { next[i].superset = group; });

    return { items: next, groupId: group, adjacent: true };
  }

  /* Remove one member from its group. Other members keep the group; `members`
   * reports which remain. A group left with 0 or 1 members is dissolved
   * (returns groupId null; run cleanup to clear the stray lone superset). */
  function unpair(items, index) {
    if (!isArr(items)) return { items: [], groupId: null, members: [] };
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      return { items: cloneItems(items), groupId: null, members: [] };
    }
    var next = cloneItems(items);
    var sg = next[index].superset;
    if (!sg) return { items: next, groupId: null, members: [] };

    next[index].superset = "";
    var remaining = [];
    for (var i = 0; i < next.length; i++) {
      if (i !== index && next[i].superset === sg) remaining.push(i);
    }
    /* Group persists only if 2+ members still share the id. */
    return { items: next, groupId: remaining.length >= 2 ? sg : null, members: remaining };
  }

  /* Dissolve an entire superset group: every item carrying groupId is cleared. */
  function unpairGroup(items, groupId) {
    var next = cloneItems(items);
    if (!groupId) return { items: next, groupId: null };
    next.forEach(function (e) {
      if (e && e.superset === groupId) e.superset = "";
    });
    return { items: next, groupId: null };
  }

  /* The group id of the item at `index`, or "" when ungrouped. */
  function groupOf(items, index) {
    if (!isArr(items) || !Number.isInteger(index) || index < 0 || index >= items.length) {
      return "";
    }
    return items[index].superset || "";
  }

  /* Indexes of the contiguous run sharing groupId (empty if no such group). */
  function groupMembers(items, groupId) {
    if (!isArr(items) || !groupId) return [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].superset === groupId) return contiguousGroup(items, i);
    }
    return [];
  }

  /* A group is trivial when it has exactly one member — a lone superset id that
   * has no adjacent partner and so should dissolve. Items with no group are not
   * trivial (there is nothing to clean up). */
  function isTrivial(items, index) {
    var sg = groupOf(items, index);
    if (!sg) return false;
    return groupMembers(items, sg).length <= 1;
  }

  /* Flat back-to-back ordering for a group across `rounds` rounds: work each
   * member in turn per round, e.g. rounds of [A, B] over 2 => A,B,A,B. */
  function roundOrder(group, rounds) {
    if (!isArr(group) || !group.length) return [];
    var n = Math.max(1, Math.floor(Number(rounds) || 1));
    var out = [];
    for (var r = 0; r < n; r++) {
      for (var i = 0; i < group.length; i++) out.push(group[i]);
    }
    return out;
  }

  /* Clear every superset id that is empty or has no adjacent partner sharing it,
   * so a group of one dissolves back to no superset. Pure. */
  function cleanup(items) {
    if (!isArr(items)) return items || [];
    var next = cloneItems(items);
    next.forEach(function (e, i) {
      if (e.superset &&
          !(i > 0 && next[i - 1].superset === e.superset) &&
          !(i + 1 < next.length && next[i + 1].superset === e.superset)) {
        e.superset = "";
      }
    });
    return next;
  }

  return {
    pairAdjacent: pairAdjacent,
    unpair: unpair,
    unpairGroup: unpairGroup,
    groupOf: groupOf,
    groupMembers: groupMembers,
    isTrivial: isTrivial,
    roundOrder: roundOrder,
    cleanup: cleanup
  };
});