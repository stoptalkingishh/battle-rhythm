"use strict";
/* Google Drive data + auth layer (port of the openquiz drive.ts mechanic).
 *
 * Uses Google Identity Services (OAuth token client) for sign-in and the
 * Drive API v3 to store app data as JSON files inside a per-user folder named
 * "Battle Rhythm" in the signed-in user's own Google Drive.
 *
 * Scope is limited to drive.file (only files this app creates). When the
 * Google keys are not configured (see js/config.js), everything falls back to
 * localStorage in guest mode — data-layer callers don't need to change.
 *
 * Exposes window.BRDrive. Synchronous page code keeps working: reads and
 * writes are Promise-based and cloud.js bridges them to the app's storage.
 */
(function () {
  /* Credentials are resolved on every call rather than captured at load time,
   * so a user who pastes their own keys in Settings gets a working sign-in
   * without reloading. js/config.js still wins when it is populated. */
  function credentials() {
    if (window.BRCredentials && typeof window.BRCredentials.get === "function") {
      return window.BRCredentials.get();
    }
    return {
      clientId: window.BR_GOOGLE_CLIENT_ID || "",
      apiKey: window.BR_GOOGLE_API_KEY || "",
      source: "build"
    };
  }
  var SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";
  var DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
  var FOLDER_NAME = "Battle Rhythm";

  var initialized = false;
  var currentToken = null;
  var currentUser = null;
  var driveReady = null;
  var lastIdToken = null;

  function isDriveConfigured() {
    var c = credentials();
    return Boolean(c.clientId && c.apiKey);
  }

  /* Google/gapi failures are strings and loosely-shaped objects. Every
   * rejection out of this module carries a stable { code, title, message } so
   * the UI can name the failing step instead of printing a raw exception. */
  function coded(error, fallback) {
    var explained = (window.BR_DRIVE_SETUP && window.BR_DRIVE_SETUP.explainError)
      ? window.BR_DRIVE_SETUP.explainError(error)
      : { code: "unknown", title: "Drive sync could not continue", message: String((error && error.message) || error || fallback || "Unknown Drive failure.") };
    var err = new Error(explained.message);
    err.code = explained.code;
    err.title = explained.title;
    err.detail = error;
    return err;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (typeof document === "undefined") { reject(new Error("Not in browser")); return; }
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  /* A cached <script> tag does not prove the API it provides is usable: a
   * network error, a blocked script, or a partially-initialised gapi all leave
   * the global missing. Check the global rather than the tag. */
  function requireGlobal(name) {
    var parts = name.split(".");
    var node = window;
    for (var i = 0; i < parts.length; i++) {
      node = node ? node[parts[i]] : undefined;
    }
    if (!node) {
      throw coded(
        new Error("Failed to load " + name + " (blocked by the network, an extension, or a firewall)"),
        name
      );
    }
    return node;
  }

  /* Why the last init attempt failed, so sign-in can name the step instead of
   * reporting a generic "could not initialize". */
  var lastInitError = null;

  /* The most recent read/write failure, so the Settings panel can say why the
   * last save did not reach Drive instead of showing a bare "offline?". */
  var lastOpError = null;

  function initGapi() {
    if (!initialized) {
      initialized = true;
      driveReady = (async function () {
        try {
          await loadScript("https://accounts.google.com/gsi/client");
          requireGlobal("google.accounts.oauth2");
          await loadScript("https://apis.google.com/js/api.js");
          requireGlobal("gapi");
          await new Promise(function (resolve, reject) {
            window.gapi.load("client", {
              callback: resolve,
              onerror: function () {
                reject(new Error("Failed to load the Google API client library (blocked by the network, an extension, or a firewall)"));
              }
            });
          });
          await window.gapi.client.init({
            apiKey: credentials().apiKey,
            discoveryDocs: [DISCOVERY_DOC]
          });
          lastInitError = null;
          return true;
        } catch (err) {
          initialized = false;
          driveReady = null;
          lastInitError = err;
          console.error("Drive init failed:", err);
          return false;
        }
      })();
    }
    return driveReady;
  }

  /* Google never calls back in some real situations: the popup is suppressed
   * without raising an error, the user leaves it open indefinitely, or the
   * page is backgrounded. Without a deadline the caller waits forever and the
   * UI stays disabled, so bound it and name the likely cause. */
  var TOKEN_TIMEOUT_MS = 120000;

  function requestToken(prompt) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;
      function finish(fn, value) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn(value);
      }
      var creds = credentials();
      if (!creds.clientId || !creds.apiKey) {
        reject(coded("not-configured", "credentials"));
        return;
      }
      timer = setTimeout(function () {
        finish(reject, coded("popup_timeout", "sign-in"));
      }, TOKEN_TIMEOUT_MS);
      var client = requireGlobal("google.accounts.oauth2").initTokenClient({
        client_id: creds.clientId,
        scope: SCOPE,
        callback: function (response) {
          if (response && response.access_token) {
            lastIdToken = response.id_token || null;
            finish(resolve, response.access_token);
          } else {
            finish(reject, coded(response || "Google sign-in failed", "sign-in"));
          }
        },
        error_callback: function (error) {
          finish(reject, coded(error || "popup_closed_by_user", "sign-in"));
        }
      });
      try {
        client.requestAccessToken({ prompt: prompt });
      } catch (err) {
        /* A suppressed popup can throw synchronously rather than calling back. */
        finish(reject, coded(err, "popup_blocked"));
      }
    });
  }

  /* Decode the id_token Google returns alongside the access token. It contains
   * sub/email/name/picture, so we never need the (scope-gated) userinfo endpoint. */
  function profileFromIdToken(idToken) {
    try {
      var parts = idToken.split(".");
      var json = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return toDriveUser(json);
    } catch (e) {
      return null;
    }
  }

  function toDriveUser(info) {
    var joinedKey = "brdrive:joined_" + (info.sub || "");
    var joined = "";
    try {
      joined = window.localStorage.getItem(joinedKey) || "";
      if (!joined) {
        joined = new Date().toISOString();
        window.localStorage.setItem(joinedKey, joined);
      }
    } catch (e) {
      joined = new Date().toISOString();
    }
    return {
      id: info.sub || "google-user",
      email: info.email || "",
      name: info.name || (info.email ? info.email.split("@")[0] : "User"),
      picture: info.picture || "",
      created_at: joined
    };
  }

  function fetchProfile(token) {
    if (lastIdToken) {
      var fromIdToken = profileFromIdToken(lastIdToken);
      if (fromIdToken) return Promise.resolve(fromIdToken);
    }
    return fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token }
    }).then(function (res) {
      if (!res.ok) throw coded({ status: res.status, message: "Failed to fetch Google profile" }, "profile");
      return res.json();
    }).then(function (info) { return toDriveUser(info); });
  }

  /* If the user already has a Google session, grab a token without a popup. */
  function getDriveToken() {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(null);
    if (currentToken) return Promise.resolve(currentToken);
    return initGapi().then(function (ok) {
      if (!ok) return null;
      return requestToken("").then(function (token) {
        currentToken = token;
        window.gapi.client.setToken({ access_token: currentToken });
        return currentToken;
      }).catch(function (err) {
        currentToken = null;
        lastOpError = coded(err, "token");
        return null;
      });
    });
  }

  function signInToDrive() {
    if (!isDriveConfigured()) return Promise.reject(coded("not-configured", "sign-in"));
    if (typeof window === "undefined") return Promise.reject(coded("not-in-browser", "sign-in"));
    return initGapi().then(function (ok) {
      if (!ok) throw coded(lastInitError || "not-configured", "sign-in");
      return requestToken("consent").then(function (token) {
        currentToken = token;
        window.gapi.client.setToken({ access_token: token });
        return fetchProfile(token).then(function (user) {
          currentUser = user;
          return user;
        });
      });
    });
  }

  function restoreDriveSession() {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(null);
    return getDriveToken().then(function (token) {
      if (!token) return null;
      return fetchProfile(token).then(function (user) {
        currentUser = user;
        return user;
      }).catch(function () { return null; });
    });
  }

  function signOutFromDrive() {
    if (typeof window === "undefined") return Promise.resolve();
    var revoke = window.google && window.google.accounts && window.google.accounts.oauth2 && window.google.accounts.oauth2.revoke;
    if (currentToken && revoke) {
      return new Promise(function (resolve) {
        revoke(currentToken, function () { resolve(); });
      }).then(function () {
        currentToken = null;
        currentUser = null;
      });
    }
    currentToken = null;
    currentUser = null;
    return Promise.resolve();
  }

  function getDriveUser() { return currentUser; }

  /* ---------------- Drive file storage ---------------- */

  function localGet(key) {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function localSet(key, value) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }

  function ensureFolder() {
    return getDriveToken().then(function (token) {
      if (!token) return null;
      var folderKey = "brdrive:folder_" + (currentUser ? currentUser.id : "");
      var cached = localGet(folderKey);
      if (cached) return cached;
      return window.gapi.client.drive.files.list({
        q: "name = '" + FOLDER_NAME + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)",
        pageSize: 1
      }).then(function (found) {
        var existing = found && found.result && found.result.files && found.result.files[0];
        if (existing && existing.id) {
          localSet(folderKey, existing.id);
          return existing.id;
        }
        return window.gapi.client.drive.files.create({
          resource: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
          fields: "id"
        }).then(function (created) {
          if (created && created.result && created.result.id) {
            localSet(folderKey, created.result.id);
            return created.result.id;
          }
          return null;
        });
      }).catch(function (err) {
        console.error("Drive ensureFolder failed:", err);
        lastOpError = coded(err, "folder");
        return null;
      });
    });
  }

  function findFileId(folderId, name) {
    return window.gapi.client.drive.files.list({
      q: "'" + folderId + "' in parents and name = '" + name + "' and trashed = false",
      fields: "files(id, name)",
      pageSize: 1
    }).then(function (res) {
      var f = res && res.result && res.result.files && res.result.files[0];
      return { id: (f && f.id) || null, available: true };
    }).catch(function (err) {
      console.error("Drive file lookup failed:", err);
      lastOpError = coded(err, "lookup");
      return { id: null, available: false };
    });
  }

  /* Serialize Drive writes so concurrent saves can't overwrite each other. */
  var writeQueues = {};

  function queuedWrite(key, fn) {
    var prev = writeQueues[key] || Promise.resolve({ ok: true, modifiedTime: "" });
    var next = prev.then(fn).catch(function () { return { ok: false, modifiedTime: "" }; });
    writeQueues[key] = next;
    return next;
  }

  function emptyRead(available) {
    return { data: null, modifiedTime: "", id: null, available: available !== false };
  }

  /* Fetch a file's metadata (id + modifiedTime). The alt:media content request
   * does not carry metadata, so reads follow it up with a cheap metadata call. */
  function fetchMetadata(fileId) {
    return window.gapi.client.drive.files
      .get({ fileId: fileId, fields: "id,modifiedTime" })
      .then(function (res) {
        var m = (res && res.result) || {};
        return { id: m.id || fileId, modifiedTime: m.modifiedTime || "" };
      })
      .catch(function (err) {
        console.error("Drive metadata fetch failed:", err);
        lastOpError = coded(err, "metadata");
        return { id: fileId, modifiedTime: "", available: false };
      });
  }

  /* Read a Drive file. Resolves to { data, modifiedTime, id }. When the file,
   * the folder, the token, or Drive is unavailable, data is null (callers
   * treat data == null as "no remote file"). */
  function readDriveFile(fileName) {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(emptyRead(false));
    return getDriveToken().then(function (token) {
      if (!token) return emptyRead(false);
      return ensureFolder().then(function (folderId) {
        if (!folderId) return emptyRead(false);
        return findFileId(folderId, fileName).then(function (found) {
          if (!found.available) return emptyRead(false);
          var fileId = found.id;
          if (!fileId) return emptyRead();
          return window.gapi.client.request({
            path: "/drive/v3/files/" + fileId,
            method: "GET",
            params: { alt: "media" }
          }).then(function (res) {
            var text = typeof res.body === "string" ? res.body : JSON.stringify(res.result || res);
            var data = JSON.parse(text);
            return fetchMetadata(fileId).then(function (meta) {
              return { data: data, modifiedTime: meta.modifiedTime, id: meta.id, available: meta.available !== false };
            });
          }).catch(function (err) {
            console.error("Drive read failed:", err);
            lastOpError = coded(err, "read");
            return emptyRead(false);
          });
        });
      });
    });
  }

  /* Write a Drive file. Resolves to { ok, modifiedTime } where ok is true only
   * after Drive confirms the upload and modifiedTime is the new Drive
   * modifiedTime (used by the cloud layer to reconcile changed remotes). */
  function writeDriveFile(fileName, data) {
    if (!isDriveConfigured() || typeof window === "undefined") {
      return Promise.resolve({ ok: false, modifiedTime: "" });
    }
    var key = (currentUser ? currentUser.id : "") + ":" + fileName;
    return queuedWrite(key, function () {
      return getDriveToken().then(function (token) {
        if (!token) return { ok: false, modifiedTime: "" };
        return ensureFolder().then(function (folderId) {
          if (!folderId) return { ok: false, modifiedTime: "" };
          return findFileId(folderId, fileName).then(function (found) {
            if (!found.available) return { ok: false, modifiedTime: "" };
            var fileId = found.id;
            function upload(id) {
              return window.gapi.client.request({
                path: "/upload/drive/v3/files/" + id,
                method: "PATCH",
                params: { uploadType: "media" },
                headers: { "Content-Type": "application/json; charset=UTF-8" },
                body: JSON.stringify(data)
              });
            }
            function afterUpload(id) {
              return fetchMetadata(id).then(function (meta) {
                return { ok: Boolean(meta.available !== false && meta.modifiedTime), modifiedTime: meta.modifiedTime || "", id: meta.id };
              });
            }
            if (fileId) {
              return upload(fileId).then(function () { return afterUpload(fileId); });
            }
            return window.gapi.client.drive.files.create({
              resource: { name: fileName, parents: [folderId], mimeType: "application/json" },
              fields: "id"
            }).then(function (created) {
              var newFileId = created && created.result && created.result.id;
              if (!newFileId) return { ok: false, modifiedTime: "" };
              return upload(newFileId).then(function () { return afterUpload(newFileId); });
            });
          }).catch(function (err) {
            console.error("Drive write failed:", err);
            lastOpError = coded(err, "write");
            return { ok: false, modifiedTime: "" };
          });
        });
      });
    });
  }

  /* Forget the cached gapi client so a newly entered API key is picked up
   * without a page reload. */
  function resetClient() {
    initialized = false;
    driveReady = null;
    lastInitError = null;
    lastOpError = null;
  }

  function getLastError() { return lastOpError || lastInitError; }

  window.BRDrive = {
    isDriveConfigured: isDriveConfigured,
    resetClient: resetClient,
    getLastError: getLastError,
    signInToDrive: signInToDrive,
    signOutFromDrive: signOutFromDrive,
    restoreDriveSession: restoreDriveSession,
    getDriveUser: getDriveUser,
    readDriveFile: readDriveFile,
    writeDriveFile: writeDriveFile
  };
})();