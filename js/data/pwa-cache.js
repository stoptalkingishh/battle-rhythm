"use strict";
/* Pure offline/PWA cache rules, shared by the browser (loads as
 * window.BR_PWA_CACHE, and is importScripts'd by sw.js) and the Node test
 * suite (node:test).
 *
 * Issue #5 added a hand-written service worker. With no build step there is no
 * bundler to inline a generated precache manifest, and no way to regenerate
 * one when a <script> tag is added to index.html — so the worker PARSES
 * index.html at install time instead (parseShell below). That is the only way
 * the precache list can stay correct without a build, and it is why the
 * cache-buster guard matters so much here: the worker keys every shell entry
 * on the full versioned URL, so the ?v=battle-rhythm-N tag *is* the cache key.
 *
 * Kept DOM-free and fetch-free so every branch is unit-testable. sw.js holds
 * only the event plumbing and calls into this module.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_PWA_CACHE = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var VERSION_TAG = "?v=battle-rhythm-";
  var SHELL_CACHE_PREFIX = "battle-rhythm-shell-v";
  var PLATE_CACHE = "battle-rhythm-plates-v1";

  /* Matches one whole opening tag, so the attribute we read is unambiguous. */
  var TAG = /<(?:script|link)\b[^>]*>/gi;

  /**
   * Every local `?v=battle-rhythm-N` reference in index.html, in source order,
   * plus the version they agree on.
   *
   * Returns `{ version, urls, drifted }`. `version` is the shared N, or null
   * when the document carries no tag at all. `drifted` is true when the tags
   * disagree — the exact partial-bump state that check-cache-buster.mjs fails
   * CI over, surfaced here so the worker can refuse to build a mixed cache
   * rather than serve one.
   */
  function parseShell(html) {
    var urls = [];
    var versions = [];
    var match;

    TAG.lastIndex = 0;
    while ((match = TAG.exec(String(html))) !== null) {
      var value = match[0].match(/\s(?:src|href)\s*=\s*"([^"]*)"/i);
      if (!value || !value[1]) continue;
      var url = value[1];
      // Remote, protocol-relative and data: URIs are not served from this
      // repository and cannot carry a cache-buster.
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;
      if (url.indexOf(VERSION_TAG) === -1) continue;
      urls.push(url);
      versions.push(url.split(VERSION_TAG)[1].split(/[&"'#]/)[0]);
    }

    var distinct = versions.filter(function (v, i) { return versions.indexOf(v) === i; });
    return {
      version: distinct.length === 1 ? distinct[0] : null,
      urls: urls,
      drifted: distinct.length > 1
    };
  }

  /**
   * Cache name for a given cache-buster N. The version is part of the *name*
   * so that a deploy lands in a new cache and activate() can drop every older
   * one — no LRU bookkeeping, no stale shell left behind.
   */
  function shellCacheName(version) {
    return SHELL_CACHE_PREFIX + (version == null ? "unversioned" : version);
  }

  /* Plate images are content-stable and large (15.5 MiB of ATP figures), so
   * they get their own cache that is NOT deleted on a version bump: a deploy
   * must not force a Soldier to re-download every figure on a bad network. */
  function plateCacheName() {
    return PLATE_CACHE;
  }

  /**
   * Which strategy a request gets. Returns one of:
   *   "navigate"    network-first, cache fallback (the app shell document)
   *   "versioned"   cache-first, immutable (a ?v= tagged shell asset)
   *   "plate"       cache-first, filled on demand (assets/plates/**)
   *   "passthrough" network only, never cached or intercepted
   *
   * `url` is the request's path INCLUDING the query string: the cache-buster
   * tag lives in the search, and `new URL(href).pathname` drops it. Passing
   * only the pathname would silently route every versioned asset to
   * "passthrough" and cache-first would never apply to the shell.
   *
   * The order matters: the navigation check comes first because a navigation
   * to "/" carries no version tag but must still be served from cache when
   * the network is gone.
   */
  function classify(url, isNavigation) {
    var target = String(url || "");

    if (isNavigation) return "navigate";
    if (target.indexOf(VERSION_TAG) !== -1) return "versioned";
    if (target.indexOf("/assets/plates/") !== -1) return "plate";
    return "passthrough";
  }

  /* The service worker script must never be served from a cache, or a deploy
   * could never install the worker that would have replaced it. */
  function isServiceWorkerScript(url) {
    return /\/sw\.js(?:$|\?)/.test(String(url || ""));
  }

  /* Cross-origin (Google Drive, the FM 7-22 PDF) is left entirely alone:
   * opaque responses must never enter the cache. */
  function isCrossOrigin(url, origin) {
    try {
      return new URL(url, origin).origin !== new URL(origin).origin;
    } catch (err) {
      return true; // unparseable: treat as foreign rather than risk caching it
    }
  }

  /* Plates cached on an older worker are still valid bytes: the plate cache
   * name carries no version and is preserved across deploys on purpose. */
  function shouldDeleteCache(name, currentShell, currentPlates) {
    return name !== currentShell && name !== currentPlates;
  }

  return {
    VERSION_TAG: VERSION_TAG,
    SHELL_CACHE_PREFIX: SHELL_CACHE_PREFIX,
    parseShell: parseShell,
    shellCacheName: shellCacheName,
    plateCacheName: plateCacheName,
    classify: classify,
    isServiceWorkerScript: isServiceWorkerScript,
    isCrossOrigin: isCrossOrigin,
    shouldDeleteCache: shouldDeleteCache
  };
});
