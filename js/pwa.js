"use strict";
/* Service worker registration (issue #5).
 *
 * Purely a thin wrapper: the interesting logic — what to cache and how — is in
 * js/data/pwa-cache.js and sw.js, and both are unit-tested under node:test.
 *
 * Registration is deliberately forgiving. The app must work perfectly well
 * with no service worker at all: offline support is an enhancement, and a
 * failed registration (insecure context, private-mode restrictions, a browser
 * without support) must never break the app or spam the console. Every path
 * that can fail is caught and downgraded to a console note.
 */
(function (root) {
  var SW_URL = "sw.js";
  var PLATE_CACHE_HINT = "assets/plates/";

  function supported() {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator;
  }

  function register() {
    if (!supported()) return Promise.resolve(null);
    // Service workers need a secure context. file:// (opening index.html
    // straight off disk) is not one, and registration there throws.
    if (typeof location !== "undefined" && location.protocol === "file:") {
      return Promise.resolve(null);
    }

    return navigator.serviceWorker
      .register(SW_URL)
      .then(function (registration) {
        return registration;
      })
      .catch(function (err) {
        console.warn("[pwa] service worker not registered:", err && err.message);
        return null;
      });
  }

  /* Ask the browser to prompt for installation. Chrome only fires this before
   * the user has installed or dismissed, and the app must not depend on it. */
  function installPrompt() {
    var deferred = null;
    if (typeof window === "undefined") return null;
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferred = event;
    });
    window.addEventListener("appinstalled", function () {
      deferred = null;
    });
    return {
      available: function () { return deferred !== null; },
      prompt: function () {
        if (!deferred) return Promise.resolve(false);
        var event = deferred;
        deferred = null;
        return event.prompt();
      }
    };
  }

  var api = {
    supported: supported,
    register: register,
    installPrompt: installPrompt,
    SW_URL: SW_URL,
    PLATE_CACHE_HINT: PLATE_CACHE_HINT
  };

  // Self-start, so the <script> tag in index.html is the whole wiring: there
  // is no bootstrap call in app.js to forget, and no ordering dependency
  // between the two files. Registration is async and failure-tolerant, so
  // this never blocks or breaks app start.
  register();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BR_PWA = api;
  }
})(typeof self !== "undefined" ? self : this);
