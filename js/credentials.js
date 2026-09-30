"use strict";
/* Per-browser storage for the user's own Google OAuth credentials.
 *
 * Why this exists: js/config.js is a tracked file whose values must stay empty
 * (scripts/check-config.mjs fails the build otherwise), and a self-hosted copy
 * of Battle Rhythm has no way for a user to fill it in without a build. So the
 * app keeps the two public client-side identifiers in this browser's
 * localStorage instead, and the Drive layer reads them from here.
 *
 * This is not a secret store. Both values are embedded in the page by design
 * (see js/config.js.example for the full rationale) — the OAuth client id is
 * not a secret, and the API key is a quota control, not an access control.
 * Access is granted by the signed-in user and limited to the drive.file scope.
 * What matters is that they never enter the repository.
 *
 * A build that does ship credentials in js/config.js keeps priority: an
 * operator who deliberately configured a build should not be overridden by a
 * stale per-browser value.
 *
 * Exposes window.BRCredentials. Validates through js/data/drive-setup.js so
 * the same rules run in the UI, on save, and in the unit tests.
 */
(function () {
  var STORAGE_KEY = "brdrive:credentials";
  var SETUP = window.BR_DRIVE_SETUP || null;

  /* Reads can happen before js/data/drive-setup.js has loaded if a script tag
   * order ever changes, so the validator is resolved lazily rather than
   * captured at definition time. */
  function setup() {
    return window.BR_DRIVE_SETUP || SETUP;
  }

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function buildConfigured() {
    return Boolean((window.BR_GOOGLE_CLIENT_ID || "") && (window.BR_GOOGLE_API_KEY || ""));
  }

  function localGet() {
    var store = storage();
    if (!store) return null;
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      var id = typeof parsed.clientId === "string" ? parsed.clientId : "";
      var key = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
      /* A half-written record (interrupted write, hand-edited storage) is
       * treated as absent rather than as a broken credential, so the app
       * falls back to guest mode instead of failing sign-in forever. */
      if (!id || !key) return null;
      return { clientId: id, apiKey: key };
    } catch (e) {
      return null;
    }
  }

  /* The effective credentials: the build's config.js values if present,
   * otherwise whatever the user saved in this browser. */
  function get() {
    if (buildConfigured()) {
      return {
        clientId: window.BR_GOOGLE_CLIENT_ID,
        apiKey: window.BR_GOOGLE_API_KEY,
        source: "build"
      };
    }
    var local = localGet();
    if (local) return { clientId: local.clientId, apiKey: local.apiKey, source: "local" };
    return { clientId: "", apiKey: "", source: "none" };
  }

  function isConfigured() {
    var c = get();
    return Boolean(c.clientId && c.apiKey);
  }

  /* Validate then store. Resolves to the saved record, or rejects with an
   * object carrying { field, code, message } so the UI can highlight the
   * offending input rather than showing one generic failure. */
  function save(clientId, apiKey) {
    var s = setup();
    if (!s) {
      return Promise.reject({
        field: "form",
        code: "validator_missing",
        message: "The setup helper did not load, so the values cannot be checked. Reload the page and try again."
      });
    }
    var idCheck = s.validateClientId(clientId);
    if (!idCheck.ok) {
      return Promise.reject({ field: "clientId", code: idCheck.code, message: idCheck.message });
    }
    var keyCheck = s.validateApiKey(apiKey);
    if (!keyCheck.ok) {
      return Promise.reject({ field: "apiKey", code: keyCheck.code, message: keyCheck.message });
    }
    var store = storage();
    if (!store) {
      return Promise.reject({
        field: "form",
        code: "storage_blocked",
        message: "This browser is blocking local storage, so the values cannot be saved. Allow site data for this page, or add the values to js/config.js instead (see docs/google-drive-setup.md)."
      });
    }
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ clientId: idCheck.value, apiKey: keyCheck.value }));
    } catch (e) {
      return Promise.reject({
        field: "form",
        code: "storage_write_failed",
        message: "The browser refused to save these values (" + (e && e.name ? e.name : "unknown error") + "). It is usually private-browsing mode or a full quota. Guest mode still works without Drive."
      });
    }
    return Promise.resolve({ clientId: idCheck.value, apiKey: keyCheck.value, source: "local" });
  }

  function clear() {
    var store = storage();
    if (store) {
      try { store.removeItem(STORAGE_KEY); } catch (e) {}
    }
  }

  window.BRCredentials = {
    STORAGE_KEY: STORAGE_KEY,
    get: get,
    isConfigured: isConfigured,
    save: save,
    clear: clear
  };
})();
