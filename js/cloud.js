"use strict";
/* Hybrid Drive sync layer bridging the app's localStorage storage to Drive.
 *
 * The app stores under br_* keys via synchronous store()/load(). This module
 * keeps localStorage as the fast sync source of truth and:
 *   - mirrors each save to a per-collection JSON file in the user's Drive
 *     ("Battle Rhythm" folder) when signed in, and
 *   - on sign-in / session restore, pulls Drive data and merges it back into
 *     localStorage (Drive wins on id collision, local-only rows are kept), then
 *     pushes the merged result so both stay in step.
 *
 * Not synced: br_settings (master-password hash stays local-only) and
 * br_presets_hidden (recomputed). Exposes window.BRCloud.
 */
(function () {
  var FILE_MAP = {
    br_sessions: "sessions.json",
    br_regiments: "regiments.json",
    br_tracker: "tracker.json",
    br_groups: "groups.json"
  };

  var status = "idle"; // idle | off | guest | syncing | ready | error
  var lastSync = "";
  var onSync = null;

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

  /* Merge arrays of {id}-carrying rows: Drive (remote) wins on collision,
   * local-only rows are kept so guest data is never lost. */
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
    var i, keys = Object.keys(local || {});
    for (i = 0; i < keys.length; i++) dates[keys[i]] = 1;
    keys = Object.keys(remote || {});
    for (i = 0; i < keys.length; i++) dates[keys[i]] = 1;
    Object.keys(dates).forEach(function (d) {
      var l = (local || {})[d] || { sessions: {} };
      var r = (remote || {})[d] || { sessions: {} };
      var byId = {};
      Object.keys(l.sessions || {}).forEach(function (sid) { byId[sid] = l.sessions[sid]; });
      Object.keys(r.sessions || {}).forEach(function (sid) { byId[sid] = r.sessions[sid]; });
      out[d] = { sessions: byId };
    });
    return out;
  }

  function mergeFor(key, remote, local) {
    if (key === "br_tracker") return mergeLogs(remote, local);
    return mergeById(remote, local);
  }

  function fallbackFor(key) { return key === "br_tracker" ? {} : []; }
  function hasData(key, val) {
    return key === "br_tracker" ? Object.keys(val || {}).length > 0 : (val && val.length) > 0;
  }

  function emit(dataChanged) {
    if (onSync) { try { onSync(!!dataChanged); } catch (e) {} }
  }

  function pullAll() {
    return Promise.all(Object.keys(FILE_MAP).map(function (key) {
      return window.BRDrive.readDriveFile(FILE_MAP[key]).then(function (remote) {
        if (!remote) return;
        writeJson(key, mergeFor(key, remote, readJson(key, fallbackFor(key))));
      });
    }));
  }

  function pushAll() {
    return Promise.all(Object.keys(FILE_MAP).map(function (key) {
      var val = readJson(key, fallbackFor(key));
      if (!hasData(key, val)) return true;
      return window.BRDrive.writeDriveFile(FILE_MAP[key], val);
    }));
  }

  /* Pull Drive -> local (Drive wins), then push merged local -> Drive. */
  function syncNow() {
    return pullAll().then(pushAll);
  }

  /* Mirror a single collection save to Drive. Writes are debounced per key so
   * a burst of tracker/session saves coalesce into one Drive write (latest
   * value wins), keeping the Drive API quiet during a workout. */
  var pendingMirror = {};
  var mirrorTimer = {};
  function mirror(key) {
    if (!isActive() || !FILE_MAP[key]) return Promise.resolve(false);
    pendingMirror[key] = readJson(key, fallbackFor(key));
    if (mirrorTimer[key]) return Promise.resolve(false);
    return new Promise(function (resolve) {
      mirrorTimer[key] = setTimeout(function () {
        mirrorTimer[key] = null;
        var val = pendingMirror[key];
        pendingMirror[key] = null;
        status = "syncing";
        emit(false);
        window.BRDrive.writeDriveFile(FILE_MAP[key], val)
          .then(function (ok) {
            status = ok ? "ready" : "error";
            if (ok) lastSync = new Date().toISOString();
            emit(false);
            resolve(ok);
          })
          .catch(function () {
            status = "error";
            emit(false);
            resolve(false);
          });
      }, 800);
    });
  }

  function init(cb) {
    onSync = cb || onSync;
    if (!window.BRDrive || !window.BRDrive.isDriveConfigured()) {
      status = "off";
      emit(false);
      return Promise.resolve(null);
    }
    status = "syncing";
    emit(false);
    return window.BRDrive.restoreDriveSession().then(function (user) {
      if (user) {
        status = "ready";
        return syncNow().then(function () {
          lastSync = new Date().toISOString();
          emit(true);
          return user;
        }).catch(function () {
          status = "error";
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
        status = "ready";
        lastSync = new Date().toISOString();
        emit(true);
        return user;
      }).catch(function () {
        status = "ready";
        emit(true);
        return user;
      });
    }).catch(function (err) {
      status = "error";
      emit(true);
      throw err;
    });
  }

  function signOut() {
    return window.BRDrive.signOutFromDrive().then(function () {
      status = "guest";
      lastSync = "";
      emit(true);
    });
  }

  function user() { return window.BRDrive ? window.BRDrive.getDriveUser() : null; }
  function getStatus() { return status; }
  function getLastSync() { return lastSync; }

  window.BRCloud = {
    isActive: isActive,
    init: init,
    signIn: signIn,
    signOut: signOut,
    mirror: mirror,
    syncNow: syncNow,
    user: user,
    getStatus: getStatus,
    getLastSync: getLastSync
  };
})();