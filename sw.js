/* Battle Rhythm service worker — offline app shell and plate images.
 *
 * LOCATION — this file is at the REPOSITORY ROOT on purpose, and that is a
 * deliberate exception to "the deploy only copies index.html assets css js".
 *
 * A service worker's default scope is the directory containing its script, and
 * GitHub Pages serves no `Service-Worker-Allowed` header (verified against the
 * live site: the response carries only content-type, etag and cache-control).
 * So a worker at `js/sw.js` can only ever claim `/battle-rhythm/js/` and the
 * navigation to `/battle-rhythm/` would fall outside its scope — the app would
 * work online and fail to start offline, which is the exact failure this
 * issue exists to fix. Scope can only be widened by a header we cannot set.
 *
 * The resolution is a one-line addition to the Pages staging step in
 * .github/workflows/ci.yml (`cp sw.js _site/`), which is why the deploy
 * whitelist test in tests/deploy-whitelist.test.js parses the workflow rather
 * than hardcoding a list: it asserts the worker is actually published. That
 * test is the reason this file cannot silently stop being deployed.
 *
 * CACHING — the stale-asset hazard, and why it cannot happen here.
 * check-cache-buster.mjs exists because a warm browser cache pairing a new
 * app.js with an old sync-core.js fails at runtime, not at build time. A
 * service worker is a second cache with the same failure mode, so:
 *
 *   1. Every shell entry is keyed on its FULL versioned URL including the
 *      `?v=battle-rhythm-N` tag. app.js?v=…-40 and app.js?v=…-41 are distinct
 *      cache entries; a bump is therefore a miss, never a stale hit.
 *   2. The precache list is parsed from index.html at install time rather than
 *      hardcoded, so it cannot drift from the tags the guard checks.
 *   3. The cache NAME embeds N, and activate() deletes every cache that is not
 *      the current shell or the plate cache. One version, one cache: a
 *      half-old half-new shell is not representable.
 *   4. If the tags in index.html disagree, the worker refuses to install
 *      (drifted) instead of building a mixed cache.
 *   5. The worker script itself is never cached, so a deploy can always
 *      install the worker that would have replaced it.
 *
 * WHAT IS AND IS NOT OFFLINE — honest accounting, because "works offline"
 * otherwise overclaims.
 *
 *   Offline after one successful load: the app shell (index.html, css, all 43
 *   script tags) and any plate image already viewed, which is cached on
 *   demand. All user data (sessions, log, weigh-ins, AFT results) is in
 *   localStorage, so guest mode is fully functional with no account and no
 *   network.
 *
 *   Not offline: Google Drive sync and sign-in (network by definition — it
 *   fails fast and leaves local data untouched), and the 15.5 MiB of ATP
 *   figures and 4.4 MiB of AI plates a user has never opened. Those are
 *   fetched on first view, so a plate first opened while offline is missing
 *   until connectivity returns. Precaching 20 MiB on first load would make
 *   the app unusable on the spotty connections this is for, so it is a
 *   deliberate trade, not an oversight.
 */
"use strict";

importScripts("js/data/pwa-cache.js");

var CACHE = self.BR_PWA_CACHE;
var ORIGIN = self.location.origin;

/* Resolved during install. */
var SHELL_URLS = [];
var SHELL_CACHE = null;

/* ---------------------------------------------------------------- install */

/* Parse the tags out of index.html so the precache list is whatever the
 * document actually references — no list to maintain by hand, and the
 * cache-buster guard is the single source of truth for what is versioned. */
function readShell() {
  return fetch("index.html", { cache: "reload" })
    .then(function (response) {
      if (!response.ok) throw new Error("index.html " + response.status);
      return response.text();
    })
    .then(function (html) {
      var shell = CACHE.parseShell(html);
      if (shell.drifted || shell.version === null || !shell.urls.length) {
        // Refusing to install is the point: a mixed-version cache is the exact
        // hazard the cache-buster guard exists to prevent, and the guard
        // should already have failed CI.
        throw new Error("refusing to precache a drifted or untagged shell");
      }
      return shell;
    });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    readShell().then(function (shell) {
      SHELL_URLS = shell.urls;
      SHELL_CACHE = CACHE.shellCacheName(shell.version);

      // caches.open() resolves to the Cache; awaiting it is required before
      // calling add() on the result.
      return caches.open(SHELL_CACHE).then(function (cache) {
        // The shell document itself is precached unversioned: navigations are
        // network-first, and this is the offline fallback when there is no
        // network to fall back from.
        var puts = SHELL_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" })).catch(function (err) {
            // One missing asset must not cost the whole offline app. Log and
            // carry on; the network-first navigation will still fetch it.
            console.warn("[sw] precache miss", url, err && err.message);
          });
        });
        puts.push(cache.add(new Request("index.html", { cache: "reload" })));
        puts.push(cache.add(new Request("assets/manifest.webmanifest", { cache: "reload" })));
        return Promise.all(puts);
      });
    })
  );
});

/* --------------------------------------------------------------- activate */

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            // SHELL_CACHE is set during install on this same worker instance.
            // If install ever failed, it stays null and every shell cache
            // looks superseded: deleting them is the safe direction (a missing
            // cache is a refetch, a wrong one is a stale app).
            if (!CACHE.shouldDeleteCache(name, SHELL_CACHE, CACHE.plateCacheName())) {
              return null;
            }
            return caches.delete(name);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/* ------------------------------------------------------------------ fetch */

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function (response) {
      // 404/5xx must not overwrite a good cached shell: a failed deploy
      // should keep the last working app available offline, not replace it.
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(cacheName).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        // Offline with nothing cached under the requested URL: fall back to
        // the precached shell so the app opens and can render its last-known
        // state instead of the browser's error page. If even that is missing
        // there is nothing to serve, and an explicit error beats handing
        // respondWith() an undefined value.
        if (request.mode === "navigate") {
          return caches.match("index.html").then(function (shell) {
            return shell || new Response(
              "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<p>Battle Rhythm is offline and has no cached copy of the app yet. " +
              "Reconnect once to install it for offline use.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            );
          });
        }
        return Response.error();
      });
    });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(cacheName).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        // A cache miss while offline — a plate the Soldier has not opened
        // yet, say. Returning Response.error() keeps the failure attached to
        // this one <img> instead of rejecting respondWith(), which would
        // fail the whole page load with an unhandled rejection.
        return Response.error();
      });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // Never intercept the worker script, or a deploy could never install the
  // worker that would have replaced the cached one.
  // path + search: the cache-buster tag lives in the search.
  if (CACHE.isServiceWorkerScript(url.pathname + url.search)) return;
  if (CACHE.isCrossOrigin(request.url, ORIGIN)) return; // Drive, the FM 7-22 PDF

  var strategy = CACHE.classify(url.pathname + url.search, request.mode === "navigate");

  if (strategy === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
  if (strategy === "versioned") {
    // Safe to serve cache-first: the ?v= tag is part of the key, so a new
    // version is a different entry and cannot be a stale hit.
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (strategy === "plate") {
    event.respondWith(cacheFirst(request, CACHE.plateCacheName()));
    return;
  }
  // passthrough: not handled, so the browser does it normally.
});
