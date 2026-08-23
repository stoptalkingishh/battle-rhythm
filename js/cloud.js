"use strict";
/* Hybrid Drive sync layer bridging the app's localStorage storage to Drive.
 *
 * The app stores under br_* keys via synchronous store()/load(). Keeping that
 * contract, localStorage remains the fast device-local cache and this module
 * layers a durable, offline-safe write path on top:
 *
 *   - Outbox (append-only, persisted in localStorage under brsync_outbox):
 *     every save while signed in appends a pending op for its collection. An
 *     op is only removed after Drive *confirms* the write (ok + modifiedTime),
 *     so failed or offline writes stay queued and retried instead of silently
 *     dropping. The outbox compacts to at most one op per collection.
 *
 *   - Reconcile before overwrite: each collection flushes by first reading the
 *     current Drive modifiedTime + data. If Drive changed since our last
 *     verified write (brsync_mtime_*), the remote is merged into local
 *     (Drive wins on id collisions, local-only rows kept) before pushing, so a
 *     collection changed elsewhere is never blindly overwritten.
 *
 *   - User-visible sync state (free text via getStatus): off | guest |
 *     syncing | pending (offline changes queued) | ready (synced). Settings and
 *     the master-password hash (br_settings / br_presets_hidden) are never
 *     synced and stay device-local.
 *
 * Merge/outbox/retry math is pure and lives in js/sync-core.js (window.BRSync
 * in the browser, also unit-tested in Node). Exposes window.BRCloud.
 */
(function () {
  var BRSync = window.BRSync;
  if (!BRSync) { console.error("sync-core.js must load before cloud.js"); BRSync = { FILE_MAP: {} }; }
  var FILE_MAP = BRSync.FILE_MAP || {};

  var status = "idle"; // idle | off | guest | syncing | pending | ready
  var lastSync = "";
  var lastError = "";
  var onSync = null;
  var flushing = false;
  var pendingFlushAgain = false;

  function isActive() {
    return Boolean(window.BRDrive) && window.BRDrive.isDriveConfigured() &&
      typeof window !== "undefined" && !!window.BRDrive.getDriveUser();
  }

  function localGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function localSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }
  function readJson(key, fallback) {
    try {
      var raw = localGet(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(key, value) { localSet(key, JSON.stringify(value)); }

  /* ---------------- Outbox persistence ---------------- */

  function readOutbox() {
    var raw = localGet("brsync_outbox");
    if (!raw) return [];
    try {
      var o = JSON.parse(raw);
      return Array.isArray(o) ? o : [];
    } catch (e) { return []; }
  }
  function saveOutbox(outbox) { localSet("brsync_outbox", JSON.stringify(outbox)); }

  function outboxOp(key, file) {
    var ts = new Date().toISOString();
    return {
      opId: "op" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      key: key,
      file: file,
      ts: ts,
      attempts: 0
    };
  }

  function pendingCount() { return BRSync.pendingCount(readOutbox()); }
  function hasPending() { return pendingCount() > 0; }

  function mtimeKey(file) { return "brsync_mtime_" + file; }

  function emit(dataChanged) {
    if (onSync) { try { onSync(!!dataChanged); } catch (e) {} }
  }

  /* Recompute the advisory status the settings panel shows. */
  function appraise() {
    if (!window.BRDrive || !window.BRDrive.isDriveConfigured()) { status = "off"; return; }
    if (hasPending()) { status = "pending"; return; }
    if (isActive()) { status = "ready"; }
    else { status = "guest"; }
  }

  /* ---------------- Flush (per-collection, reconcile-first) ----------------
   * Reads the current Drive modifiedTime + data. If Drive changed since our
   * last verified write, merge remote into local (nothing dropped), persist the
   * merged value locally, then overwrite Drive with the merged value. Only when
   * Drive confirms (ok + modifiedTime) do we advance our base modifiedTime and
   * let the caller prune the outbox — i.e. durability is confirmed against
   * Drive, never assumed. */
  function flushCollection(key) {
    var file = FILE_MAP[key];
    if (!file) return Promise.resolve({ ok: false, reconciled: false, dataChanged: false });
    if (!isActive()) {
      return Promise.resolve({ ok: false, reconciled: false, dataChanged: false });
    }
    var local = readJson(key, BRSync.fallbackFor(key));
    var lastMTime = localGet(mtimeKey(file)) || "";
    return window.BRDrive.readDriveFile(file).then(function (remoteRes) {
      if (!remoteRes || remoteRes.available === false) {
        lastError = "Drive read failed";
        return { ok: false, reconciled: false, dataChanged: false };
      }
      var remoteData = remoteRes ? remoteRes.data : null;
      var remoteMTime = remoteRes ? remoteRes.modifiedTime : "";
      var rec = BRSync.reconcile(lastMTime, remoteMTime, remoteData, local, key);
      var dataChanged = String(JSON.stringify(rec.data)) !== String(JSON.stringify(local));
      if (dataChanged) writeJson(key, rec.data); /* absorb remote before pushing */
      if (!BRSync.shouldWriteRemote(key, rec.data, remoteData)) {
        return { ok: true, reconciled: rec.remoteChanged, dataChanged: dataChanged };
      }
      return window.BRDrive.writeDriveFile(file, rec.data).then(function (res) {
        if (res && res.ok && res.modifiedTime) {
          localSet(mtimeKey(file), res.modifiedTime || "");
          lastSync = new Date().toISOString();
          return { ok: true, reconciled: rec.remoteChanged, dataChanged: dataChanged };
        }
        lastError = "Drive write not confirmed";
        return { ok: false, reconciled: rec.remoteChanged, dataChanged: dataChanged };
      }, function () {
        lastError = "Drive write failed";
        return { ok: false, reconciled: rec.remoteChanged, dataChanged: dataChanged };
      });
    }, function () {
      lastError = "Drive read failed";
      return { ok: false, reconciled: false, dataChanged: false };
    });
  }

  function applyFlushResult(key, res) {
    if (res.ok) {
      saveOutbox(BRSync.pruneFlushed(readOutbox(), [key]).outbox);
    } else {
      saveOutbox(BRSync.markAttempted(readOutbox(), key));
    }
    return res.ok;
  }

  /* Flush every collection with a pending op. Failed/offline ops stay queued
   * (attempts bumped) and are retried on the next trigger. Serialized so a
   * burst of saves coalesces into one flush pass. */
  function flushPending() {
    if (!isActive()) return Promise.resolve(false);
    if (flushing) { pendingFlushAgain = true; return Promise.resolve(false); }
    flushing = true;
    status = "syncing";
    emit(false);
    var keys = BRSync.pendingKeys(readOutbox());
    var step = function (i) {
      if (i >= keys.length) {
        flushing = false;
        if (pendingFlushAgain) { pendingFlushAgain = false; return flushPending(); }
        appraise();
        emit(true);
        return Promise.resolve(hasPending() === false);
      }
      return flushCollection(keys[i]).then(function (res) {
        applyFlushResult(keys[i], res);
        return step(i + 1);
      });
    };
    return step(0);
  }

  /* Full reconcile of every collection with Drive (bootstrap / sign-in /
   * explicit sync): pull, merge changed remotes, push merged, advance base
   * modifiedTimes. Leaves the outbox untouched but any collection that has a
   * pending op still re-flushes via flushPending afterwards. */
  function syncNow() {
    if (!isActive()) return Promise.resolve(false);
    var keys = Object.keys(FILE_MAP);
    var step = function (i) {
      if (i >= keys.length) {
        appraise();
        emit(true);
        return Promise.resolve(true);
      }
      return flushCollection(keys[i]).then(function (res) {
        applyFlushResult(keys[i], res);
        return step(i + 1);
      });
    };
    var prev = status;
    status = "syncing";
    emit(false);
    return step(0).then(function (ok) { if (ok) lastSync = new Date().toISOString(); return ok; });
  }

  /* ---------------- Save mirroring (drive-first, offline-safe) ---------------- */

  var mirrorTimers = {};

  /* Mirror a single collection save to Drive. Appends a durable outbox op
   * synchronously (so a save is never silently dropped even if we are offline
   * right now), then schedules a debounced flush. Latest value wins because the
   * flush reads the current localStorage value at flush time. */
  function mirror(key) {
    var file = FILE_MAP[key];
    if (!isActive() || !file) return Promise.resolve(false);
    saveOutbox(BRSync.pushOp(readOutbox(), outboxOp(key, file)));
    if (status === "ready") status = "pending";
    if (!mirrorTimers[key]) {
      mirrorTimers[key] = setTimeout(function () {
        mirrorTimers[key] = null;
        flushPending();
      }, 800);
    }
    return Promise.resolve(false);
  }

  /* ---------------- Session lifecycle ---------------- */

  function init(cb) {
    onSync = cb || onSync;
    if (!window.BRDrive || !window.BRDrive.isDriveConfigured()) {
      status = "off";
      emit(false);
      return Promise.resolve(null);
    }
    status = "syncing";
    emit(false);
    var onOnline = function () {
      if (isActive()) flushPending().then(function () { appraise(); emit(false); });
    };
    if (typeof window !== "undefined" && !window.__brOnlineBound) {
      window.__brOnlineBound = true;
      window.addEventListener("online", onOnline);
    }
    return window.BRDrive.restoreDriveSession().then(function (user) {
      if (user) {
        return syncNow().then(function () {
          if (hasPending()) { status = "pending"; } else { status = "ready"; }
          emit(true);
          return user;
        });
      }
      status = "guest";
      emit(true);
      return null;
    }).catch(function () {
      status = "guest";
      emit(true);
      return null;
    });
  }

  function signIn() {
    if (!window.BRDrive) return Promise.reject(new Error("Drive layer not loaded"));
    status = "syncing";
    emit(false);
    return window.BRDrive.signInToDrive().then(function (user) {
      return syncNow().then(function () {
        appraise();
        emit(true);
        return user;
      }, function () {
        appraise();
        emit(true);
        return user;
      });
    }).catch(function (err) {
      lastError = (err && err.message) || "Sign-in failed";
      status = pendingErr();
      emit(true);
      throw err;
    });
  }

  function pendingErr() {
    if (hasPending()) return "pending";
    if (isActive()) return "ready";
    return "guest";
  }

  function signOut() {
    return window.BRDrive.signOutFromDrive().then(function () {
      /* Outbox is kept device-local so queued changes are not silently lost on
       * sign-out; they flush on the next sign-in. */
      status = "guest";
      lastSync = "";
      emit(true);
    });
  }

  function user() { return window.BRDrive ? window.BRDrive.getDriveUser() : null; }
  function getStatus() { return status; }
  function getLastSync() { return lastSync; }
  function getLastError() { return lastError; }
  function retry() { return flushPending(); }

  window.BRCloud = {
    isActive: isActive,
    init: init,
    signIn: signIn,
    signOut: signOut,
    mirror: mirror,
    syncNow: syncNow,
    flushPending: flushPending,
    retry: retry,
    user: user,
    getStatus: getStatus,
    getLastSync: getLastSync,
    getLastError: getLastError,
    getPendingCount: pendingCount
  };
})();