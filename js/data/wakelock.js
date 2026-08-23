"use strict";
/* Screen wake-lock helper (adapted from openGym's wakelock, rewritten clean).
 *
 * Keeps the screen from sleeping while a session or stopwatch is running, and
 * lets it go the moment training ends. Purely guards around the experimental
 * Screen Wake Lock API; on non-supporting browsers every call is a no-op that
 * resolves without throwing, so the app never depends on it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BR_WAKELOCK = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var lock = null;   /* latest held WakeLockSentinel */
  var enabled = true;

  function supported() {
    try {
      return typeof navigator !== "undefined" &&
        !!(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
    } catch (e) {
      return false;
    }
  }

  function isEnabled() { return enabled; }
  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) release();
    return enabled;
  }

  /* Returns a Promise that resolves true if a lock is held (or already was). */
  function request() {
    if (!enabled || !supported()) return Promise.resolve(false);
    if (lock) return Promise.resolve(true);
    lock = navigator.wakeLock.request("screen")
      .then(function (l) {
        lock = l;
        /* A released/expired sentinel means the lock is gone. */
        if (l && typeof l.addEventListener === "function") {
          l.addEventListener("release", function () { if (lock === l) lock = null; });
        }
        return true;
      })
      .catch(function () { lock = null; return false; });
    return lock;
  }

  /* Releases whatever is held. Safe to call repeatedly / when unsupported. */
  function release() {
    var current = lock;
    lock = null;
    if (!current) return Promise.resolve();
    if (typeof current.then === "function") {
      return current.then(function (l) {
        if (l && typeof l.release === "function") { try { l.release(); } catch (e) {} }
      }).catch(function () {});
    }
    if (typeof current.release === "function") { try { current.release(); } catch (e) {} }
    return Promise.resolve();
  }

  return { supported: supported, request: request, release: release, setEnabled: setEnabled, isEnabled: isEnabled };
});