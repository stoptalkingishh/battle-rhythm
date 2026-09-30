"use strict";
/* Pure, dependency-free sync logic shared by the Drive layer (browser) and the
 * Node test suite (node:test). Loads as window.BRSync in the browser and as a
 * CommonJS module in Node.
 *
 * Only testable, side-effect-free functions live here. localStorage access,
 * Drive I/O, and orchestration stay in cloud.js / drive.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRSync = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Collection -> Drive file mapping. Existing mapping, kept compatible. */
  var FILE_MAP = {
    br_sessions: "sessions.json",
    br_regiments: "regiments.json",
    br_tracker: "tracker.json",
    br_groups: "groups.json",
    br_aft_results: "aft-results.json",
    br_bodyweight: "bodyweight.json",
    br_routines: "routines.json",
    br_week: "week.json",
    br_exweights: "exweights.json",
    br_custom_exercises: "custom-exercises.json"
  };

  function fileFor(key) { return FILE_MAP[key] || null; }

  function fallbackFor(key) {
    return key === "br_tracker" ? {} : [];
  }

  function hasData(key, val) {
    if (key === "br_tracker") {
      return Object.keys(val || {}).some(function (name) { return name !== "schemaVersion"; });
    }
    return (val && val.length) > 0;
  }

  /* Avoid creating empty files on first sync, but preserve explicit deletions:
   * if Drive already has a collection, an empty local collection must be
   * uploaded or deleted records would return on the next device. */
  function shouldWriteRemote(key, data, remoteData) {
    return hasData(key, data) || remoteData != null;
  }

  /* Merge arrays of { id } rows: remote (Drive) wins on collision, local-only
   * rows are kept so guest data is never lost. */
  function mergeById(remote, local) {
    var map = {};
    (local || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
    (remote || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  /* Tracker logs are { date: { sessions: { sessionId: entry } } }. */
  function mergeLogs(remote, local) {
    var out = {};
    var dates = {};
    var remoteVersion = Number(remote && remote.schemaVersion) || 0;
    var localVersion = Number(local && local.schemaVersion) || 0;
    var i, keys = Object.keys(local || {});
    for (i = 0; i < keys.length; i++) {
      if (keys[i] !== "schemaVersion") dates[keys[i]] = 1;
    }
    keys = Object.keys(remote || {});
    for (i = 0; i < keys.length; i++) {
      if (keys[i] !== "schemaVersion") dates[keys[i]] = 1;
    }
    Object.keys(dates).forEach(function (d) {
      var l = (local || {})[d] || { sessions: {} };
      var r = (remote || {})[d] || { sessions: {} };
      var byId = {};
      Object.keys(l.sessions || {}).forEach(function (sid) { byId[sid] = l.sessions[sid]; });
      Object.keys(r.sessions || {}).forEach(function (sid) { byId[sid] = r.sessions[sid]; });
      out[d] = { sessions: byId };
    });
    if (remoteVersion || localVersion) out.schemaVersion = Math.max(remoteVersion, localVersion);
    return out;
  }

  function mergeFor(key, remote, local) {
    if (key === "br_tracker") return mergeLogs(remote, local);
    return mergeById(remote, local);
  }

  /* ---- Offline outbox (append-only log of unverified collection writes) ----
   * Each op: { opId, key, file, ts, attempts }. The outbox is bounded by
   * compaction so there is at most one pending op per collection (latest
   * write wins; the flush reads the current local value anyway).
   */

  function compactOutbox(outbox) {
    var out = [];
    var seen = {};
    for (var i = (outbox || []).length - 1; i >= 0; i--) {
      var op = outbox[i];
      if (!op || !op.key) continue;
      if (!seen[op.key]) { seen[op.key] = 1; out.unshift(op); }
    }
    return out;
  }

  /* Append a new operation and compact. Pure: returns a new array. */
  function pushOp(outbox, op) {
    outbox = (outbox || []).slice();
    outbox.push(op);
    return compactOutbox(outbox);
  }

  function pendingKeys(outbox) {
    var set = {};
    (outbox || []).forEach(function (op) { if (op && op.key) set[op.key] = 1; });
    return Object.keys(set);
  }

  function pendingCount(outbox) { return pendingKeys(outbox).length; }

  /* Record a failed flush attempt for one collection. Pure. */
  function markAttempted(outbox, key) {
    return (outbox || []).map(function (op) {
      if (op && op.key === key) {
        return { opId: op.opId, key: op.key, file: op.file, ts: op.ts, attempts: (op.attempts || 0) + 1 };
      }
      return op;
    });
  }

  /* Drop ops for collections whose Drive write was verified. Pure. */
  function pruneFlushed(outbox, confirmedKeys) {
    var conf = {};
    var flushed = [];
    (confirmedKeys || []).forEach(function (k) { if (k) conf[k] = 1; });
    var rest = [];
    (outbox || []).forEach(function (op) {
      if (op && op.key && conf[op.key]) {
        if (flushed.indexOf(op.key) === -1) flushed.push(op.key);
      } else {
        rest.push(op);
      }
    });
    return { outbox: rest, flushed: flushed };
  }

  /* ---- Retry policy (exponential backoff, capped) ---- */
  function retryDelay(attempt, baseMs, capMs) {
    baseMs = typeof baseMs === "number" ? baseMs : 800;
    capMs = typeof capMs === "number" ? capMs : 30000;
    var exp = Math.min(Math.max(attempt, 0), 30);
    return Math.min(baseMs * Math.pow(2, exp), capMs);
  }

  function shouldRetry(attempt, maxAttempts) {
    if (maxAttempts == null || maxAttempts <= 0) return true; /* infinite */
    return attempt < maxAttempts;
  }

  /* ---- Reconcile / conflict detection via Drive modifiedTime ----
   * lastMTime is the Drive modifiedTime we last successfully wrote or read
   * for a file; remoteMTime is the current Drive metadata. If Drive has no
   * file yet, local is the base. If the remote modifiedTime differs from our
   * last-known value, Drive changed externally and must be merged before any
   * overwrite (no unannounced whole-collection last-write-wins). */
  function doesRemoteMatch(lastMTime, remoteMTime) {
    if (!remoteMTime) return true;        /* no remote yet -> local is base */
    if (!lastMTime) return false;         /* remote exists, base unknown -> changed */
    return String(lastMTime) === String(remoteMTime);
  }

  /* Returns { data, remoteChanged }.
   * - remoteChanged is true when Drive changed since our last sync.
   * - When remoteChanged, data is a merge (remote wins on collisions, local-only
   *   kept) so nothing is silently dropped before a reconcile.
   * - When local is empty but Drive has a matching/known base, pull Drive into
   *   local (restore-from-Drive / bootstrap). */
  function reconcile(lastMTime, remoteMTime, remoteData, localData, key) {
    var remoteChanged = remoteData != null && !doesRemoteMatch(lastMTime, remoteMTime);
    var data;
    if (remoteChanged) {
      data = mergeFor(key, remoteData, localData);
    } else if (remoteData != null && !hasData(key, localData)) {
      data = remoteData; /* local empty -> absorb known Drive state */
    } else {
      data = localData;
    }
    return { data: data, remoteChanged: remoteChanged };
  }

/* ---- Conflict detection: canonical form, digests, three-way merge ----
   *
   * The previous merge reduced to "Drive wins on id collision", which silently
   * destroys an edit made on the other device while this one was offline. A
   * merge rule can only tell a genuine conflict from a one-sided change if it
   * knows the *common ancestor*, so every device keeps a snapshot of the last
   * state Drive confirmed (brsync_base_<file>, written by cloud.js) and merge
   * is three-way: base / local / remote.
   *
   *   local == remote                  -> one value, no conflict
   *   local == base                    -> only the other device changed: take it
   *   remote == base                   -> only this device changed: keep ours
   *   both differ from base, disjoint fields -> field-level union, no conflict
   *   both differ from base, same field/value -> CONFLICT
   *
   * Without a base (first sync, no ancestor recorded) there is no evidence of a
   * collision, so the old remote-wins union is used and `ancestorKnown` is
   * false rather than guessing that every shared id is a conflict.
   *
   * Conflicts are never resolved by picking a winner. The merged value keeps
   * this device's version in place and the other device's version is *also*
   * written, under a derived id, as a sibling record (a "fork"). Both versions
   * then survive the sync on every device, and the user chooses in the
   * Settings panel (see resolveConflict). Policy documented in
   * docs/sync-merge-policy.md.
   */

  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

  /* Order-independent serialization, so key order never reads as a change. */
  function stable(v) {
    if (v === undefined) return "u";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ":" + stable(v[k]);
    }).join(",") + "}";
  }

  function sameRecord(a, b) { return stable(a) === stable(b); }

  /* FNV-1a, hex. Used for readable fork ids and conflict ids only - never for
   * anything that must be collision-resistant against an adversary. */
  function digest(value) {
    var h = 0x811c9dc5, s = stable(value);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  /* Fork id derives from the *other device's* content, so two devices that
   * detect the same conflict mint the same id and the sibling does not multiply
   * on every sync. */
  function forkIdFor(recordId, remoteValue) {
    return recordId + "~conflict-" + digest(remoteValue);
  }

  function unionKeys(a, b, c) {
    var out = [], seen = {};
    [a || {}, b || {}, c || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
    });
    return out;
  }

  /* Field-level three-way merge of one record.
   * Returns { value, conflicts } where conflicts is the list of differing
   * paths; the merged value prefers the local value on a contested path (this
   * device's edit stays where the user expects to find it) and the caller
   * preserves the remote value separately. */
  function mergeThreeWay(base, local, remote) {
    if (sameRecord(local, remote)) return { value: local, conflicts: [] };
    if (sameRecord(local, base)) return { value: remote, conflicts: [] };
    if (sameRecord(remote, base)) return { value: local, conflicts: [] };
    if (isObj(base) && isObj(local) && isObj(remote)) {
      var keys = unionKeys(base, local, remote), value = {}, conflicts = [];
      keys.forEach(function (k) {
        var b = base[k], l = local[k], r = remote[k];
        if (sameRecord(l, r)) { if (l !== undefined) value[k] = l; return; }
        if (sameRecord(l, b)) { if (r !== undefined) value[k] = r; return; }  /* other device only */
        if (sameRecord(r, b)) { if (l !== undefined) value[k] = l; return; }  /* this device only */
        if (isObj(b) && isObj(l) && isObj(r)) {
          var sub = mergeThreeWay(b, l, r);
          if (!sub.conflicts.length) { if (sub.value !== undefined) value[k] = sub.value; return; }
          conflicts = conflicts.concat(sub.conflicts.map(function (p) { return k + "." + p; }));
          if (l !== undefined) value[k] = l;
          return;
        }
        conflicts.push(k);
        if (l !== undefined) value[k] = l;
      });
      return { value: value, conflicts: conflicts };
    }
    /* Scalars and arrays are compared whole: an array edit on both sides has no
     * safe field-level union, so it is a conflict. */
    return { value: local, conflicts: [""] };
  }

  /* One record across base/local/remote.
   * status: same | local-only | remote-only | merged | local-add | remote-add
   *       | deleted-remote | deleted-local | conflict
   * `value` is undefined when the record is deleted. */
  function mergeRecord(base, local, remote) {
    var hasB = base !== undefined, hasL = local !== undefined, hasR = remote !== undefined;
    if (hasL && hasR && sameRecord(local, remote)) return { status: "same", value: local };
    if (!hasL && !hasR) return { status: "absent", value: undefined };
    if (!hasR) {
      if (!hasB) return { status: "local-add", value: local };
      if (sameRecord(local, base)) return { status: "deleted-remote", value: undefined };
      /* Edited here, deleted on the other device: keep ours and ask. There is
       * no second version to keep - the remote side is an absence, not content. */
      return {
        status: "conflict", kind: "edit-local-vs-delete-remote", conflicts: [""],
        value: local, remote: undefined, base: base, local: local, keepBoth: false
      };
    }
    if (!hasL) {
      if (!hasB) return { status: "remote-add", value: remote };
      if (sameRecord(remote, base)) return { status: "deleted-local", value: undefined };
      /* Deleted here, edited there: resurrect theirs and ask. There is no
       * second version to keep - the local side is an absence, not content. */
      return {
        status: "conflict", kind: "delete-local-vs-edit-remote", conflicts: [""],
        value: remote, remote: remote, base: base, local: undefined, keepBoth: false
      };
    }
    if (!hasB) {
      /* Both created the same id independently. Identical content is agreement;
       * anything else is two independent edits and needs the user. */
      return {
        status: "conflict", kind: "created-both", conflicts: [""],
        value: local, remote: remote, base: undefined, local: local, keepBoth: true
      };
    }
    if (sameRecord(local, base)) return { status: "remote-only", value: remote };
    if (sameRecord(remote, base)) return { status: "local-only", value: local };
    var m = mergeThreeWay(base, local, remote);
    if (!m.conflicts.length) return { status: "merged", value: m.value };
    return {
      status: "conflict", kind: "edit-vs-edit", conflicts: m.conflicts,
      value: m.value, remote: remote, base: base, local: local, keepBoth: true
    };
  }

  function conflictEntry(key, recordId, path, res, now) {
    return {
      id: key + "|" + (path ? path + "|" : "") + recordId,
      key: key,
      path: path || null,
      recordId: recordId,
      forkId: res.keepBoth ? forkIdFor(recordId, res.remote) : null,
      kind: res.kind,
      fields: res.conflicts.filter(Boolean),
      base: res.base,
      local: res.local,
      remote: res.remote,
      detectedAt: now || ""
    };
  }

  function indexById(rows) {
    var out = {};
    (rows || []).forEach(function (x) { if (x && x.id) out[x.id] = x; });
    return out;
  }

  function markedFork(record, forkId, fromId, now) {
    var copy = {};
    Object.keys(record).forEach(function (k) { copy[k] = record[k]; });
    copy.id = forkId;
    copy._conflict = { from: fromId, source: "remote", detectedAt: now || "" };
    return copy;
  }

  /* Arrays of { id } rows: sessions, regiments, AFT results, bodyweight,
   * custom exercises, week, exweights. */
  function mergeIdCollection(key, base, local, remote, now) {
    var baseBy = indexById(base), localBy = indexById(local), remoteBy = indexById(remote);
    var out = [], conflicts = [];
    unionKeys(baseBy, localBy, remoteBy).forEach(function (id) {
      var res = mergeRecord(baseBy[id], localBy[id], remoteBy[id]);
      if (res.value !== undefined) out.push(res.value);
      if (res.status === "conflict") {
        conflicts.push(conflictEntry(key, id, null, res, now));
        if (res.keepBoth && res.remote !== undefined) {
          out.push(markedFork(res.remote, forkIdFor(id, res.remote), id, now));
        }
      }
    });
    return { data: out, conflicts: conflicts };
  }

  /* Tracker logs: { date: { sessions: { sessionId: entry } } }. The leaf record
   * - one logged session - is the unit of conflict, so a session is never split
   * by an unrelated edit to another session on the same day. */
  function mergeLogCollection(key, base, local, remote, now) {
    var out = {}, conflicts = [];
    unionKeys(base || {}, local || {}, remote || {}).forEach(function (d) {
      if (d === "schemaVersion") return;
      var bd = (base || {})[d] || {}, ld = (local || {})[d] || {}, rd = (remote || {})[d] || {};
      var bs = bd.sessions || {}, ls = ld.sessions || {}, rs = rd.sessions || {};
      var sessions = {};
      unionKeys(bs, ls, rs).forEach(function (sid) {
        var res = mergeRecord(bs[sid], ls[sid], rs[sid]);
        if (res.value !== undefined) sessions[sid] = res.value;
        if (res.status === "conflict") {
          conflicts.push(conflictEntry(key, sid, d, res, now));
          if (res.keepBoth && res.remote !== undefined) {
            sessions[forkIdFor(sid, res.remote)] = markedFork(res.remote, forkIdFor(sid, res.remote), sid, now);
          }
        }
      });
      /* Keep the date key when either side had it, even with no surviving
       * sessions: mergeLogs unioned dates before filling them, and dropping
       * an emptied day would make a delete-then-repopulate look like a wipe. */
      if (Object.keys(sessions).length || ld.sessions || rd.sessions) out[d] = { sessions: sessions };
    });
    var lv = Number((local || {}).schemaVersion) || 0, rv = Number((remote || {}).schemaVersion) || 0;
    if (lv || rv) out.schemaVersion = Math.max(lv, rv);
    return { data: out, conflicts: conflicts };
  }

  function mergeCollection(key, base, local, remote, now) {
    if (key === "br_tracker") return mergeLogCollection(key, base, local, remote, now);
    return mergeIdCollection(key, base, local, remote, now);
  }

  /* ---- Conflict stash (device-local, survives sign-out) ----
   * Keyed by conflict id so re-syncing the same collision updates one entry
   * instead of piling up. Pure: returns a new array. */
  function addConflicts(stash, conflicts) {
    var out = (stash || []).slice(), byId = {};
    out.forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    (conflicts || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    Object.keys(byId).forEach(function (id) {
      var i = out.findIndex(function (c) { return c && c.id === id; });
      if (i === -1) out.push(byId[id]); else out[i] = byId[id];
    });
    return out;
  }

  function removeConflict(stash, conflictId) {
    return (stash || []).filter(function (c) { return !c || c.id !== conflictId; });
  }

  function pendingConflicts(stash) {
    return (stash || []).filter(function (c) { return c && c.id; });
  }

  /* Apply the user's choice to the merged collection. Pure.
   *   choice "local"  - keep this device's version, drop the fork
   *   choice "remote" - keep the other device's version at the original id
   *   choice "both"   - leave both versions in place, forget the conflict
   * Returns { data, stash } with the conflict removed. */
  function resolveConflict(key, data, stash, conflictId, choice) {
    var entry = pendingConflicts(stash).filter(function (c) { return c.id === conflictId; })[0];
    var next = removeConflict(stash, conflictId);
    if (!entry) return { data: data, stash: next };

    /* pairs are [id, record]; tracker sessions have no .id of their own, so the
       identity always comes from the caller rather than from the record. */
    var apply = function (pairs) {
      var out = pairs.filter(function (p) {
        return choice === "both" ? true : p[0] !== entry.forkId;
      });
      if (choice === "remote" && entry.remote !== undefined) {
        var replaced = false;
        out = out.map(function (p) {
          if (p[0] === entry.recordId) { replaced = true; return [p[0], entry.remote]; }
          return p;
        });
        if (!replaced) out.push([entry.recordId, entry.remote]);
      }
      return out;
    };
    var toMap = function (pairs) {
      var m = {};
      pairs.forEach(function (p) { m[p[0]] = p[1]; });
      return m;
    };

    if (key === "br_tracker") {
      var nextData = {};
      Object.keys(data || {}).forEach(function (d) {
        if (d === "schemaVersion" || entry.path !== d) { nextData[d] = data[d]; return; }
        var sessions = (data[d] || {}).sessions || {};
        var pairs = Object.keys(sessions).map(function (sid) { return [sid, sessions[sid]]; });
        nextData[d] = { sessions: toMap(apply(pairs)) };
      });
      return { data: nextData, stash: next };
    }
    return { data: apply((data || []).map(function (x) { return [x && x.id, x]; })).map(function (p) { return p[1]; }), stash: next };
  }

  /* Three-way reconcile over a whole collection, with the base snapshot.
   * Returns { data, conflicts, ancestorKnown }. `now` only stamps detectedAt;
   * it never affects which records conflict. */
  function reconcileWithBase(key, base, local, remote, now) {
    if (base == null) return { data: mergeFor(key, remote, local), conflicts: [], ancestorKnown: false };
    var res = mergeCollection(key, base, local, remote, now);
    return { data: res.data, conflicts: res.conflicts, ancestorKnown: true };
  }

  return {
    FILE_MAP: FILE_MAP,
    fileFor: fileFor,
    fallbackFor: fallbackFor,
    hasData: hasData,
    shouldWriteRemote: shouldWriteRemote,
    mergeById: mergeById,
    mergeLogs: mergeLogs,
    mergeFor: mergeFor,
    compactOutbox: compactOutbox,
    pushOp: pushOp,
    pendingKeys: pendingKeys,
    pendingCount: pendingCount,
    markAttempted: markAttempted,
    pruneFlushed: pruneFlushed,
    retryDelay: retryDelay,
    shouldRetry: shouldRetry,
    doesRemoteMatch: doesRemoteMatch,
    reconcile: reconcile,
    stable: stable,
    sameRecord: sameRecord,
    digest: digest,
    forkIdFor: forkIdFor,
    mergeThreeWay: mergeThreeWay,
    mergeRecord: mergeRecord,
    mergeCollection: mergeCollection,
    reconcileWithBase: reconcileWithBase,
    addConflicts: addConflicts,
    removeConflict: removeConflict,
    pendingConflicts: pendingConflicts,
    resolveConflict: resolveConflict
  };
});