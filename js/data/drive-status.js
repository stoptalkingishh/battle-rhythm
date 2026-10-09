"use strict";
/* The Settings -> Google Drive copy, as a pure function of sync state.
 *
 * End-user wording lives in a data module (same reason as help-content.js):
 * the thing that actually breaks is the *sentence* - signing out with no
 * reason given, or a "not configured" build looking like a broken sign-in.
 * js/app.js only builds nodes for what this returns, so the wording is
 * unit-testable without a DOM.
 *
 * Loaded as window.BR_DRIVE_STATUS and required in Node as
 * js/data/drive-status.js; pure (no DOM, no storage).
 *
 * Why errorText exists: a failed sign-in used to be console.error'd and then
 * vanish behind a plain "Continue with Google" button, so a user whose consent
 * was refused - or whose Drive call was blocked - could not tell the difference
 * between "you are not signed in" and "sign-in is broken". Every state that is
 * not a working session now carries a reason when one is known.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_DRIVE_STATUS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* One public value is required at runtime: the OAuth client id. The API key is
   * gone (Drive v3 rejects API keys, so it only ever gated sign-in behind a
   * credential no Drive call uses) and the client secret is not in the page at
   * all. The copy names js/config.js because that is where a developer looks and
   * where the deploy job injects the value. */
  var NOT_CONFIGURED =
    "Backups are off: this build has no Google client id in js/config.js. " +
    "Everything still works, but it stays on this device.";

  var SYNCING = "Syncing with Google Drive\u2026";

  var SIGN_IN =
    "Sign in to back up your workouts to your own Google Drive in a private " +
    "\u201cBattle Rhythm\u201d folder. Your completed sessions, history, weigh-ins, " +
    "AFT results, groups, custom exercises and weekly plan all travel with it.";

  var SYNC_PROBLEM_PREFIX = "Saved on this device, not yet in Drive: ";
  var SIGN_IN_PROBLEM_PREFIX = "Could not complete sign-in: ";

  /* state: { configured, status, user, lastError }
   *  - configured: is a Google client id present in this build
   *  - status:     BRCloud.getStatus() (idle|off|guest|syncing|pending|ready)
   *  - user:       BRCloud.user() (null when signed out)
   *  - lastError:  BRCloud.getLastError(), "" when there is none
   * Returns { auth, statusText, errorText }.
   *  - auth: "none" (nothing to do) | "signin" (offer the button) | "account"
   */
  function describe(state) {
    var s = state || {};
    /* Only an explicit false means "this build cannot sign in". A caller that
     * forgets the flag must not be told backups are off. */
    if (s.configured === false) {
      return { auth: "none", statusText: NOT_CONFIGURED, errorText: "" };
    }
    if (s.status === "syncing") {
      return { auth: "none", statusText: SYNCING, errorText: "" };
    }
    if (s.user) {
      return {
        auth: "account",
        statusText: "",
        errorText: s.lastError ? SYNC_PROBLEM_PREFIX + s.lastError : ""
      };
    }
    return {
      auth: "signin",
      statusText: SIGN_IN,
      errorText: s.lastError ? SIGN_IN_PROBLEM_PREFIX + s.lastError : ""
    };
  }

  return {
    describe: describe,
    NOT_CONFIGURED: NOT_CONFIGURED,
    SYNCING: SYNCING,
    SIGN_IN: SIGN_IN,
    SYNC_PROBLEM_PREFIX: SYNC_PROBLEM_PREFIX,
    SIGN_IN_PROBLEM_PREFIX: SIGN_IN_PROBLEM_PREFIX
  };
});
