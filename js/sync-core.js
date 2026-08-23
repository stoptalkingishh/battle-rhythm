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
    br_groups: "groups.json"
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
    reconcile: reconcile
  };
});