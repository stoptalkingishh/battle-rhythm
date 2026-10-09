"use strict";
/* Google Drive data + auth layer (port of the openquiz drive.ts mechanic).
 *
 * Uses the OAuth 2.0 Authorization Code flow with PKCE for sign-in and the
 * Drive API v3 to store app data as JSON files inside a per-user folder named
 * "Battle Rhythm" in the signed-in user's own Google Drive. The refresh token
 * means sync survives past the ~1 hour access token and past the browser's
 * Google session cookie.
 *
 * Scope is limited to drive.file (only files this app creates). When the
 * Google client id is not configured (see js/config.js), everything falls back
 * to localStorage in guest mode - data-layer callers don't need to change.
 *
 * The Drive REST API is called with fetch + an OAuth bearer token. There is no
 * client library and no API key: Drive v3 does not accept API keys at all
 * ("API keys are not supported by this API") and the gapi client library's
 * discovery-document bootstrap needed one, so requiring a key made sign-in
 * depend on a credential that buys nothing here. The previous version called
 * gapi.client.init({apiKey}) first, and when Google blocked that call the whole
 * session was reported as signed out even though the OAuth exchange had
 * succeeded.
 *
 * TWO SIGN-IN MODES, chosen by config, because Google leaves no third option:
 *
 *   durable (BR_DRIVE_TOKEN_PROXY set) - Authorization Code + PKCE, with the
 *     code exchanged by an Apps Script proxy that holds the client secret. Google
 *     returns a refresh token, so the login outlives the access token and the
 *     browser session. This is the only way to stay signed in.
 *
 *   session (no proxy - the default) - Google Identity Services token client.
 *     Works with the client id alone and no secret, but returns NO refresh
 *     token: the access token lasts ~1 hour and is re-minted silently from the
 *     user's Google session while that session lives, after which one click
 *     signs in again.
 *
 * Why not PKCE alone: Google's token endpoint advertises only client_secret_post
 * and client_secret_basic (no "none"), so a page that authenticates with PKCE
 * alone is refused with "client_secret is missing" - before the code is even
 * examined. Verified against both this project's OAuth client and the openquiz
 * sibling's; the flow cannot be completed from a browser without a server.
 *
 * Exposes window.BRDrive. Synchronous page code keeps working: reads and
 * writes are Promise-based and cloud.js bridges them to the app's storage.
 */
(function () {
  var CLIENT_ID = window.BR_GOOGLE_CLIENT_ID || "";

  var SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";
  var DRIVE_API = "https://www.googleapis.com/drive/v3";
  var DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  var FOLDER_NAME = "Battle Rhythm";

  var AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
  var GIS_SRC = "https://accounts.google.com/gsi/client";
  /* The token exchange goes to our Apps Script proxy, not to Google directly.
   * Google's discovery document advertises only client_secret_post and
   * client_secret_basic (no "none"), so a request from this page is rejected
   * with 401 invalid_client "client_secret is missing" - the secret has to be
   * added server-side. See scripts/drive-token-proxy.gs. */
  var TOKEN_PROXY = window.BR_DRIVE_TOKEN_PROXY || "";

  /* OAuth 2.0 Authorization Code flow with PKCE (RFC 7636).
   *
   * The original implementation used the GIS initTokenClient, which is the
   * implicit flow: about a one-hour access token and NO refresh token. Renewing
   * it leaned on Google's browser session cookie, so Drive sync stopped after
   * roughly an hour and looked to the user like being signed out. With the code
   * flow and access_type=offline Google returns a refresh token that mints new
   * access tokens silently, which decouples persistence from that session.
   *
   * This is a public client with no server, so there is no client secret and
   * PKCE supplies the protection a secret otherwise would. */
  var REFRESH_KEY = "brdrive:refresh_token";
  /* Public profile fields of the last sign-in, so a returning browser knows a
   * silent attempt is worth making. Never treated as proof of a session. */
  var ACCOUNT_KEY = "brdrive:account";
  var VERIFIER_PREFIX = "brdrive:pkce_verifier:";
  var STATE_PREFIX = "brdrive:pkce_state:";

  var currentToken = null;
  var currentUser = null;
  var lastIdToken = null;
  var expiresAt = 0;
  /* Why the last sign-in attempt did not produce a session. Kept so the UI can
   * say it out loud: a rejected callback used to be console.error'd and then
   * disappear, leaving the user signed out with no explanation at all. */
  var lastSignInError = null;

  /* One public identifier is enough to offer sign-in: the client id. No API key
   * (Drive v3 rejects API keys outright, so a key only ever gated sign-in behind
   * a credential no Drive call uses) and no client secret (it cannot live in a
   * page anyone can read; the proxy holds it). */
  function isDriveConfigured() {
    return Boolean(CLIENT_ID);
  }

  /* The proxy makes the login durable. Without it we fall back to the GIS token
   * client, which cannot outlive its hour. */
  function useDurableSignIn() {
    return Boolean(CLIENT_ID && TOKEN_PROXY);
  }

  function localGet(key) {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function localSet(key, value) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }

  /* ---------------- Drive REST (bearer token only) ---------------- */

  /* One place that talks to Drive. Resolves to the parsed JSON body, or null
   * when there is no usable access token (callers treat null as "unavailable",
   * never as success). Rejects with Google's own message on a non-2xx so the
   * reason can reach the UI instead of being a bare status code. */
  function driveFetch(url, init) {
    return accessToken().then(function (token) {
      if (!token) return null;
      var opts = init || {};
      var headers = {};
      var given = opts.headers || {};
      for (var i in given) {
        if (Object.prototype.hasOwnProperty.call(given, i)) headers[i] = given[i];
      }
      headers.Authorization = "Bearer " + token;
      opts.headers = headers;
      return fetch(url, opts).then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          if (text) { try { json = JSON.parse(text); } catch (e) { json = null; } }
          if (!res.ok) {
            var msg = (json && json.error && json.error.message) ||
              ("Drive request failed (" + res.status + ")");
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          }
          return json;
        });
      });
    });
  }

  function queryString(params) {
    return new URLSearchParams(params).toString();
  }

  function listFiles(q, fields) {
    return driveFetch(DRIVE_API + "/files?" + queryString({
      q: q,
      fields: fields || "files(id,name)",
      pageSize: "1"
    }));
  }

  function createFile(resource, fields) {
    return driveFetch(DRIVE_API + "/files?" + queryString({ fields: fields || "id" }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource)
    });
  }

  function fileMetadata(fileId) {
    return driveFetch(DRIVE_API + "/files/" + encodeURIComponent(fileId) + "?" +
      queryString({ fields: "id,modifiedTime" }));
  }

  /* alt=media returns the file's raw content, which is our JSON document. */
  function readMedia(fileId) {
    return driveFetch(DRIVE_API + "/files/" + encodeURIComponent(fileId) + "?" +
      queryString({ alt: "media" }));
  }

  function uploadMedia(fileId, data) {
    return driveFetch(DRIVE_UPLOAD + "/files/" + encodeURIComponent(fileId) + "?" +
      queryString({ uploadType: "media" }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(data)
    });
  }

  /* ---------------- PKCE ---------------- */

  function base64UrlEncode(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* 32 random bytes base64url-encode to 43 characters, the RFC 7636 minimum. */
  function generateCodeVerifier() {
    var buf = new Uint8Array(32);
    window.crypto.getRandomValues(buf);
    return base64UrlEncode(buf);
  }

  function generateCodeChallenge(verifier) {
    return window.crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(verifier))
      .then(function (digest) { return base64UrlEncode(new Uint8Array(digest)); });
  }

  function generateState() {
    var buf = new Uint8Array(16);
    window.crypto.getRandomValues(buf);
    return base64UrlEncode(buf);
  }

  function sessionGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function sessionSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) {
      throw new Error("Could not start sign-in: browser storage is unavailable.");
    }
  }
  function sessionDel(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) {}
  }

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  /* Start the redirect flow. Full-page navigation, not a popup: the code
   * arrives on our own origin, which is where the verifier lives. */
  function beginSignIn(promptConsent) {
    var verifier = generateCodeVerifier();
    var state = generateState();
    return generateCodeChallenge(verifier).then(function (challenge) {
      sessionSet(VERIFIER_PREFIX + state, verifier);
      sessionSet(STATE_PREFIX + state, state);
      var params = [
        "client_id=" + encodeURIComponent(CLIENT_ID),
        "redirect_uri=" + encodeURIComponent(redirectUri()),
        "response_type=code",
        "scope=" + encodeURIComponent(SCOPE),
        "code_challenge=" + encodeURIComponent(challenge),
        "code_challenge_method=S256",
        "state=" + encodeURIComponent(state),
        "access_type=offline",
        "include_granted_scopes=true"
      ];
      if (promptConsent) params.push("prompt=consent");
      window.location.assign(AUTH_ENDPOINT + "?" + params.join("&"));
    });
  }

  /* Consume the verifier for a returned state and delete it. A state we never
   * issued yields null, which is how a forged or stale callback is rejected.
   * Read before deleting: the verification and the cleanup cannot be reordered
   * without the state check silently failing every time. */
  function consumeVerifier(state) {
    var issued = sessionGet(STATE_PREFIX + state) === state;
    var verifier = sessionGet(VERIFIER_PREFIX + state);
    sessionDel(VERIFIER_PREFIX + state);
    sessionDel(STATE_PREFIX + state);
    return issued ? verifier : null;
  }

  /* Send a grant to the proxy and return Google's answer. The proxy replies with
   * Google's own body, so a refusal arrives as error/error_description and the
   * reason reaches the Settings panel instead of a bare status code.
   *
   * text/plain keeps this a CORS "simple request": Apps Script Web Apps answer
   * a POST but do not implement a preflight, so an application/json content
   * type would be blocked before the request was ever sent. */
  function postToken(params) {
    return fetch(TOKEN_PROXY, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(params)
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (!json) {
          throw new Error("The sign-in proxy did not answer with JSON (HTTP " + res.status + "). " +
            "Check that the Web App deployment is live and shared with anyone.");
        }
        if (json.error) throw new Error(json.error_description || json.error);
        return json;
      });
    });
  }

  function exchangeCode(code, verifier) {
    return postToken({
      grant: "authorization_code",
      code: code,
      code_verifier: verifier,
      redirect_uri: redirectUri()
    }).then(function (tokens) {
      /* Google only issues a refresh token on the first grant. Without one the
       * app is back to hourly re-auth, so treat its absence as a failure the
       * user can act on rather than silently degrading. */
      if (tokens.refresh_token) localSet(REFRESH_KEY, tokens.refresh_token);
      if (!localGet(REFRESH_KEY)) {
        throw new Error("Google did not return a refresh token. Revoke this app's access and sign in again.");
      }
      lastIdToken = tokens.id_token || null;
      currentToken = tokens.access_token;
      expiresAt = Date.now() + (Number(tokens.expires_in) || 3600) * 1000;
      return currentToken;
    });
  }

  /* Called once at startup: if we are on the redirect URI with a code, finish
   * the exchange. Resolves to null when there is nothing to complete. */
  function completeSignInFromRedirect() {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(null);
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    var state = params.get("state");
    var oauthError = params.get("error");
    if (!code && !oauthError) return Promise.resolve(null);

    /* Clear the query before anything else can throw, or a reload re-runs the
     * exchange with an already-consumed verifier. */
    var clean = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, clean);

    if (oauthError) {
      return Promise.reject(new Error(params.get("error_description") || oauthError));
    }
    var verifier = state ? consumeVerifier(state) : null;
    if (!verifier) return Promise.reject(new Error("Sign-in could not be verified. Please try again."));
    return exchangeCode(code, verifier);
  }

  function refreshAccessToken() {
    var stored = localGet(REFRESH_KEY);
    if (!stored) return Promise.resolve(null);
    return postToken({
      grant: "refresh_token",
      refresh_token: stored
    }).then(function (tokens) {
      currentToken = tokens.access_token;
      expiresAt = Date.now() + (Number(tokens.expires_in) || 3600) * 1000;
      return currentToken;
    }).catch(function (err) {
      /* invalid_grant means the refresh token was revoked or expired: the user
       * must re-authenticate, which is not a transient failure to retry. */
      console.error("Drive token refresh failed:", err);
      currentToken = null;
      expiresAt = 0;
      return null;
    });
  }

  /* The single access point for a usable access token: returns the cached one
   * while it is fresh, mints a new one from the refresh token otherwise, and
   * returns null when the user has to sign in again. */
  function accessToken() {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(null);
    if (currentToken && Date.now() < expiresAt - 60000) return Promise.resolve(currentToken);
    if (useDurableSignIn()) return refreshAccessToken();
    /* Session mode has no refresh token: mint a new one silently. This is the
     * path that stops working about an hour in when the Google session is gone,
     * which is why durable mode exists. */
    if (!accountHint()) return Promise.resolve(null);
    return requestToken(false).catch(function (err) {
      lastSignInError = (err && err.message) || "Your Google session ended - sign in again";
      return null;
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
      if (!res.ok) throw new Error("Failed to fetch Google profile");
      return res.json();
    }).then(function (info) { return toDriveUser(info); });
  }

  /* ---------------- Session sign-in: Google Identity Services ----------------
   *
   * The token client needs no secret and no redirect, so it works with the
   * client id alone - which is the whole reason it is here. What it cannot do is
   * give a refresh token: the access token is valid for about an hour, and after
   * that the app must ask Google again (silently while the user's Google session
   * lives, otherwise with one click). */
  var gisLoading = null;

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gisLoading) return gisLoading;
    gisLoading = new Promise(function (resolve, reject) {
      if (typeof document === "undefined") { reject(new Error("Not in browser")); return; }
      var s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        gisLoading = null;
        reject(new Error("Could not load Google Identity Services. Check the connection and try again."));
      };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  /* interactive=false asks for a token with no visible UI. It still fails when
   * the user has to be involved (signed out of Google, revoked access, or a
   * popup blocker), and that failure is what the caller reports. */
  function requestToken(interactive) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: function (resp) {
            if (!resp || resp.error) {
              reject(new Error((resp && resp.error_description) || (resp && resp.error) || "Sign-in failed"));
              return;
            }
            currentToken = resp.access_token;
            expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            resolve(currentToken);
          },
          error_callback: function (err) {
            /* type "popup_closed" / "popup_failed_to_open" / "unknown" - the
             * user cancelled, or the browser refused the window. */
            var msg = (err && err.message) || (err && err.type) || "Sign-in was cancelled";
            reject(new Error(msg === "popup_closed" ? "Sign-in was cancelled" : msg));
          }
        });
        client.requestAccessToken({ prompt: interactive ? "consent" : "" });
      });
    });
  }

  /* Whether this browser has signed in before. Used only to decide whether a
   * silent attempt is worth making: trying it for a first-time visitor invites
   * a blocked popup for no reason. */
  function rememberAccount(user) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({
        id: user.id, name: user.name, email: user.email, picture: user.picture
      }));
    } catch (e) {}
  }
  function accountHint() {
    if (typeof window === "undefined") return null;
    try {
      var raw = window.localStorage.getItem(ACCOUNT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function profileOf(token) {
    return fetchProfile(token).then(function (user) {
      currentUser = user;
      lastSignInError = null;
      rememberAccount(user);
      return user;
    }).catch(function (err) {
      lastSignInError = "Could not read the Google profile" + (err && err.message ? ": " + err.message : "");
      return null;
    });
  }

  /* Sign in with no UI. Returns null (and records why) when Google needs the
   * user, so the caller can offer the button instead of guessing. */
  function restoreSessionMode() {
    if (!accountHint()) return Promise.resolve(null);
    return requestToken(false).then(function (token) {
      return token ? profileOf(token) : null;
    }).catch(function (err) {
      lastSignInError = (err && err.message) || "Sign-in is needed again";
      return null;
    });
  }

  /* Offer sign-in. In durable mode this navigates away to Google and the
   * promise normally never settles - the document is replaced, and
   * completeSignInFromRedirect finishes the job on return. */
  function signInToDrive() {
    if (!isDriveConfigured()) return Promise.reject(new Error("Google sign-in is not configured on this build."));
    if (typeof window === "undefined") return Promise.reject(new Error("Not in browser"));
    if (useDurableSignIn()) return beginSignIn(true);
    return requestToken(true).then(function (token) {
      if (!token) throw new Error("Google did not return an access token.");
      return profileOf(token);
    });
  }

  /* Resolve the signed-in user. Deliberately does NOT call the Drive API: a
   * working sign-in is enough to be signed in, and gating this on a Drive
   * request is what let a blocked API key look like a failed sign-in. */
  function restoreDriveSession() {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(null);
    if (!useDurableSignIn()) return restoreSessionMode();
    return completeSignInFromRedirect().catch(function (err) {
      console.error("Drive sign-in callback failed:", err);
      lastSignInError = (err && err.message) || "Sign-in failed";
      return null;
    }).then(function (token) {
      return (token ? Promise.resolve(token) : accessToken());
    }).then(function (token) {
      if (!token) return null;
      return profileOf(token);
    });
  }

  function signOutFromDrive() {
    if (typeof window === "undefined") return Promise.resolve();
    /* Clearing the refresh token is what actually ends the session locally.
     * The access token is short-lived and Google will expire it on its own. */
    try { window.localStorage.removeItem(REFRESH_KEY); } catch (e) {}
    try { window.localStorage.removeItem(ACCOUNT_KEY); } catch (e) {}
    currentToken = null;
    currentUser = null;
    lastIdToken = null;
    expiresAt = 0;
    lastSignInError = null;
    return Promise.resolve();
  }

  function getDriveUser() { return currentUser; }
  function getLastSignInError() { return lastSignInError; }

  /* ---------------- Drive file storage ---------------- */

  function ensureFolder() {
    return accessToken().then(function (token) {
      if (!token) return null;
      var folderKey = "brdrive:folder_" + (currentUser ? currentUser.id : "");
      var cached = localGet(folderKey);
      if (cached) return cached;
      return listFiles(
        "name = '" + FOLDER_NAME + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        "files(id, name)"
      ).then(function (found) {
        var existing = found && found.files && found.files[0];
        if (existing && existing.id) {
          localSet(folderKey, existing.id);
          return existing.id;
        }
        return createFile({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }, "id")
          .then(function (created) {
            if (created && created.id) {
              localSet(folderKey, created.id);
              return created.id;
            }
            return null;
          });
      }).catch(function (err) {
        console.error("Drive ensureFolder failed:", err);
        return null;
      });
    });
  }

  function findFileId(folderId, name) {
    return listFiles("'" + folderId + "' in parents and name = '" + name + "' and trashed = false")
      .then(function (res) {
        var f = res && res.files && res.files[0];
        return { id: (f && f.id) || null, available: true };
      }).catch(function (err) {
        console.error("Drive file lookup failed:", err);
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
    return fileMetadata(fileId).then(function (m) {
      m = m || {};
      return { id: m.id || fileId, modifiedTime: m.modifiedTime || "" };
    }).catch(function (err) {
      console.error("Drive metadata fetch failed:", err);
      return { id: fileId, modifiedTime: "", available: false };
    });
  }

  /* Read a Drive file. Resolves to { data, modifiedTime, id }. When the file,
   * the folder, the token, or Drive is unavailable, data is null (callers
   * treat data == null as "no remote file"). */
  function readDriveFile(fileName) {
    if (!isDriveConfigured() || typeof window === "undefined") return Promise.resolve(emptyRead(false));
    return accessToken().then(function (token) {
      if (!token) return emptyRead(false);
      return ensureFolder().then(function (folderId) {
        if (!folderId) return emptyRead(false);
        return findFileId(folderId, fileName).then(function (found) {
          if (!found.available) return emptyRead(false);
          var fileId = found.id;
          if (!fileId) return emptyRead();
          return readMedia(fileId).then(function (data) {
            return fetchMetadata(fileId).then(function (meta) {
              return { data: data, modifiedTime: meta.modifiedTime, id: meta.id, available: meta.available !== false };
            });
          }).catch(function (err) {
            console.error("Drive read failed:", err);
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
      return accessToken().then(function (token) {
        if (!token) return { ok: false, modifiedTime: "" };
        return ensureFolder().then(function (folderId) {
          if (!folderId) return { ok: false, modifiedTime: "" };
          return findFileId(folderId, fileName).then(function (found) {
            if (!found.available) return { ok: false, modifiedTime: "" };
            var fileId = found.id;
            function afterUpload(id) {
              return fetchMetadata(id).then(function (meta) {
                return { ok: Boolean(meta.available !== false && meta.modifiedTime), modifiedTime: meta.modifiedTime || "", id: meta.id };
              });
            }
            if (fileId) {
              return uploadMedia(fileId, data).then(function () { return afterUpload(fileId); });
            }
            return createFile({ name: fileName, parents: [folderId], mimeType: "application/json" }, "id")
              .then(function (created) {
                var newFileId = created && created.id;
                if (!newFileId) return { ok: false, modifiedTime: "" };
                return uploadMedia(newFileId, data).then(function () { return afterUpload(newFileId); });
              });
          }).catch(function (err) {
            console.error("Drive write failed:", err);
            return { ok: false, modifiedTime: "" };
          });
        });
      });
    });
  }

  window.BRDrive = {
    isDriveConfigured: isDriveConfigured,
    completeSignInFromRedirect: completeSignInFromRedirect,
    signInToDrive: signInToDrive,
    signOutFromDrive: signOutFromDrive,
    restoreDriveSession: restoreDriveSession,
    getDriveUser: getDriveUser,
    getLastSignInError: getLastSignInError,
    usesDurableSignIn: useDurableSignIn,
    readDriveFile: readDriveFile,
    writeDriveFile: writeDriveFile
  };
})();
