"use strict";
/* Localization lookup (window.BR_I18N) — the string-extraction seam for #20.
 *
 * Why this exists: the app is English-only with copy inline in index.html,
 * js/app.js and the data files. That is fine for the current audience but it
 * means every new language is a fork of the source. This module is the seam
 * that makes extraction possible *without* a build step, which is the whole
 * architectural constraint of the project: a fresh clone must be directly
 * deployable, with zero npm dependencies.
 *
 * Design, deliberately minimal (issue #20: "no premature framework"):
 *   - Plain lookup, no plural/select/gender rules. Add complexity when a real
 *     second language needs it, not before.
 *   - The same `window.BR_*` UMD idiom as every other pure module in
 *     js/data/, so the file loads straight from index.html in the browser and
 *     require()s under node:test with no build, no bundler, no transform.
 *   - Catalogs are separate modules (js/data/locale-en.js) registered with
 *     register(). Adding a language means adding one file and one <script> tag
 *     — not touching this module and not inventing a loader convention.
 *
 * Fallback chain for t(key) — this is the part that matters operationally:
 *   1. the active locale's catalog
 *   2. the DEFAULT_LOCALE ("en") catalog — a partially translated locale
 *      degrades to English per key, never to a blank screen
 *   3. an explicit `{ default: "..." }` passed by the call site
 *   4. the key itself, so a missing string is *visible and greppable* rather
 *      than silently empty. Returning "" is the failure mode that ships.
 *
 * A missing locale registration is likewise not fatal: setLocale("xx") on an
 * unregistered locale is refused and the active locale is left alone.
 *
 * Interpolation is `{name}` placeholders, replaced from the vars object.
 * Unknown placeholders are left in place rather than blanked, for the same
 * "make the gap visible" reason.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_I18N = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var DEFAULT_LOCALE = "en";

  /* locale -> flat { key: "text" } map. */
  var catalogs = Object.create(null);
  var active = DEFAULT_LOCALE;
  var listeners = [];

  function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
  }

  function normalizeLocale(tag) {
    if (typeof tag !== "string") return "";
    /* Accept "es", "es-ES", "ES_es" and normalize to a lowercase BCP-47-ish
     * tag. Only the primary subtag is kept ("es-ES" -> "es"): without a real
     * negotiation layer, matching on the language alone is the honest
     * behaviour and avoids a false sense of regional support. */
    return tag.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  }

  function lookup(catalog, key) {
    if (!catalog) return undefined;
    var v = catalog[key];
    return typeof v === "string" ? v : undefined;
  }

  function interpolate(template, vars) {
    if (!isPlainObject(vars)) return template;
    return template.replace(/\{(\w+)\}/g, function (whole, name) {
      var v = vars[name];
      return v == null ? whole : String(v);
    });
  }

  /* -- catalog registration -- */

  /* Register (or extend) a locale catalog. Returns the locale that was
   * registered. Throws on a malformed call, because a silently dropped
   * catalog is the one bug class this module cannot make visible. */
  function register(locale, bundle) {
    var tag = normalizeLocale(locale);
    if (!tag) throw new TypeError("register(): locale must be a non-empty string");
    if (!isPlainObject(bundle)) throw new TypeError("register(): bundle must be an object for locale " + tag);
    var existing = catalogs[tag] || Object.create(null);
    var merged = Object.create(null);
    Object.keys(existing).forEach(function (k) { merged[k] = existing[k]; });
    Object.keys(bundle).forEach(function (k) {
      if (typeof bundle[k] === "string") merged[k] = bundle[k];
    });
    catalogs[tag] = merged;
    return tag;
  }

  function hasCatalog(locale) {
    var tag = normalizeLocale(locale);
    return !!tag && !!catalogs[tag];
  }

  /* Locale tags with a registered catalog, sorted. */
  function locales() {
    return Object.keys(catalogs).sort();
  }

  /* True if the key resolves in the active locale specifically (not the
   * English fallback). Used by the test suite to prove a second locale really
   * carries its own copy rather than inheriting everything. */
  function has(key, locale) {
    if (typeof key !== "string" || !key) return false;
    var tag = locale == null ? active : normalizeLocale(locale);
    return lookup(catalogs[tag], key) !== undefined;
  }

  /* -- active locale -- */

  function getLocale() { return active; }
  function defaultLocale() { return DEFAULT_LOCALE; }

  /* Switch locale. Returns the locale now active. An unregistered or malformed
   * locale is refused and the current one kept — a bad tag must not blank the
   * UI. Pass null/undefined to return to the default. */
  function setLocale(locale) {
    if (locale == null || locale === "") { active = DEFAULT_LOCALE; }
    else {
      var tag = normalizeLocale(locale);
      if (!hasCatalog(tag)) return active;
      active = tag;
    }
    listeners.slice().forEach(function (fn) {
      try { fn(active); } catch (e) { /* a bad listener must not break a switch */ }
    });
    return active;
  }

  /* Subscribe to locale changes (so a surface can re-render). Returns an
   * unsubscribe function. */
  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* -- the lookup -- */

  /* t("weekly.today", { name: "Upper A" }) -> "Today: Upper A"
   * Never throws and never returns "" — see the fallback chain in the header. */
  function t(key, vars) {
    if (typeof key !== "string" || !key) return "";
    var value = lookup(catalogs[active], key);
    if (value === undefined) value = lookup(catalogs[DEFAULT_LOCALE], key);
    if (value === undefined && isPlainObject(vars) && typeof vars.default === "string") value = vars.default;
    if (value === undefined) return key;
    return interpolate(value, vars);
  }

  return {
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    register: register,
    hasCatalog: hasCatalog,
    locales: locales,
    has: has,
    getLocale: getLocale,
    defaultLocale: defaultLocale,
    setLocale: setLocale,
    onChange: onChange,
    t: t
  };
});
