"use strict";
/* Unit tests for the localization seam (js/data/i18n.js) and the catalogs that
 * ship with it, using only Node built-ins.
 * Run: node --test tests/i18n.test.js
 *
 * What is deliberately pinned here: the fallback chain. A lookup module whose
 * fallback silently returns "" is worse than no module at all, because a
 * missing translation then ships as a blank button. The mutation test for
 * this issue breaks the English fallback deliberately and confirms a test
 * here fails.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const EN = require("../js/data/locale-en.js");
const ES = require("../js/data/locale-es.js");

/* Fresh module instance per test: register() mutates module state, and a
 * shared instance would let one test's catalog leak into the next. */
function freshI18n() {
  delete require.cache[require.resolve("../js/data/i18n.js")];
  const I18N = require("../js/data/i18n.js");
  I18N.register("en", EN);
  I18N.register("es", ES);
  return I18N;
}

/* ---- default locale ---- */

test("a known key resolves in the default locale", () => {
  const I18N = freshI18n();
  assert.equal(I18N.getLocale(), "en");
  assert.equal(I18N.t("weekday.0"), "Monday");
  assert.equal(I18N.t("weekly.nothingToday"), "Nothing scheduled today.");
});

test("the English catalog is the pre-existing app copy, byte for byte", () => {
  /* These literals were inline in js/app.js and js/data/weekly-plan.js before
   * extraction. If one drifts, this PR stopped being a no-behavior-change
   * refactor and became an unreviewed copy edit. */
  const I18N = freshI18n();
  assert.equal(I18N.t("weekday.1"), "Tuesday");
  assert.equal(I18N.t("weekday.6"), "Sunday");
  assert.equal(I18N.t("weekly.noSession"), "— no session —");
  assert.equal(I18N.t("weekly.noModule"),
    "Weekly-plan module not loaded, or no saved sessions yet.");
  assert.equal(I18N.t("weekly.reschedule"), "Reschedule");
  assert.equal(I18N.t("weekly.rescheduleLabel"), "Reschedule:");
  assert.equal(I18N.t("weekly.rescheduled"), "Session rescheduled");
  assert.equal(I18N.t("language.label"), "Language");
});

test("the English catalog covers every weekday the app indexes (Monday-first)", () => {
  const I18N = freshI18n();
  for (let wd = 0; wd <= 6; wd++) {
    assert.ok(I18N.has("weekday." + wd), "weekday." + wd + " must exist in the default catalog");
  }
  assert.equal(I18N.t("weekday.0"), "Monday", "0 = Monday");
  assert.equal(I18N.t("weekday.6"), "Sunday", "6 = Sunday");
});

/* ---- interpolation ---- */

test("placeholders interpolate from the vars object", () => {
  const I18N = freshI18n();
  assert.equal(I18N.t("weekly.today", { name: "Upper A" }), "Today: Upper A");
  assert.equal(I18N.t("weekly.moveFailed", { reason: "occupied" }), "Can't move: occupied");
});

test("an unknown placeholder is left visible rather than blanked", () => {
  const I18N = freshI18n();
  /* Same philosophy as the key fallback: show the gap so it gets found. */
  assert.equal(I18N.t("weekly.today", {}), "Today: {name}");
  assert.equal(I18N.t("weekly.today", { name: 0 }), "Today: 0", "0 is a value, not absent");
});

/* ---- switching locale changes the output ---- */

test("switching locale changes the output", () => {
  const I18N = freshI18n();
  assert.equal(I18N.t("weekday.2"), "Wednesday");
  I18N.setLocale("es");
  assert.equal(I18N.getLocale(), "es");
  assert.equal(I18N.t("weekday.2"), "miércoles");
  assert.equal(I18N.t("weekly.nothingToday"), "Nada programado para hoy.");
  I18N.setLocale("en");
  assert.equal(I18N.t("weekday.2"), "Wednesday", "switching back restores English");
});

test("has() distinguishes a real translation from an inherited English default", () => {
  const I18N = freshI18n();
  /* es omits weekly.title on purpose: it must fall back, not disappear. */
  assert.equal(I18N.has("weekly.title", "es"), false, "es does not translate weekly.title");
  assert.equal(I18N.has("weekday.0", "es"), true, "es does translate weekday.0");
});

/* ---- fallback: the whole point of the module ---- */

test("a key missing from the active locale falls back to English, not to empty", () => {
  const I18N = freshI18n();
  I18N.setLocale("es");
  assert.equal(I18N.t("weekly.title"), "Weekly plan", "English default fills the gap");
  assert.equal(I18N.t("weekly.noModule"),
    "Weekly-plan module not loaded, or no saved sessions yet.");
});

test("an unknown key falls back to the key itself, never empty and never throwing", () => {
  const I18N = freshI18n();
  assert.equal(I18N.t("weekly.doesNotExist"), "weekly.doesNotExist");
  assert.equal(I18N.t("nope.at.all"), "nope.at.all");
  /* The mutation test in this issue's PR removes the English fallback line and
   * asserts one of the two cases above goes red. A "" here is the bug. */
  assert.notEqual(I18N.t("weekly.doesNotExist"), "");
});

test("t() never throws on hostile input", () => {
  const I18N = freshI18n();
  assert.equal(I18N.t(undefined), "");
  assert.equal(I18N.t(null), "");
  assert.equal(I18N.t(""), "");
  assert.equal(I18N.t(42), "", "non-string keys yield the same safe empty as an empty key");
  assert.equal(I18N.t("weekday.0", "not-an-object"), "Monday");
  assert.equal(I18N.t("weekday.0", null), "Monday");
  assert.equal(I18N.t("weekday.0", [1, 2]), "Monday");
});

test("a call-site default is used only when neither catalog has the key", () => {
  const I18N = freshI18n();
  assert.equal(I18N.t("weekly.title", { default: "Weekly plan (default)" }), "Weekly plan",
    "the catalog wins over a call-site default");
  assert.equal(I18N.t("weekly.missing", { default: "fallback text" }), "fallback text");
});

/* ---- locale tags and registration ---- */

test("locale tags are normalized, and the primary subtag matches", () => {
  const I18N = freshI18n();
  assert.equal(I18N.setLocale("ES"), "es", "case-insensitive");
  assert.equal(I18N.setLocale("es_ES"), "es", "underscore form");
  assert.equal(I18N.setLocale("es-MX"), "es", "regional tag falls back to the language");
  assert.equal(I18N.setLocale("  es  "), "es", "surrounding whitespace");
});

test("an unregistered locale is refused and the active one is kept", () => {
  const I18N = freshI18n();
  I18N.setLocale("es");
  assert.equal(I18N.setLocale("zz"), "es", "a bad tag must not blank the UI");
  assert.equal(I18N.t("weekday.0"), "lunes", "still rendering the good locale");
  assert.equal(I18N.t("weekly.title"), "Weekly plan", "fallback still intact");
});

test("setLocale(null) returns to the default locale", () => {
  const I18N = freshI18n();
  I18N.setLocale("es");
  assert.equal(I18N.setLocale(null), "en");
  assert.equal(I18N.t("weekday.0"), "Monday");
});

test("register() is additive and refuses a malformed call loudly", () => {
  const I18N = freshI18n();
  I18N.register("fr", { "weekday.0": "lundi" });
  assert.equal(I18N.setLocale("fr"), "fr");
  assert.equal(I18N.t("weekday.0"), "lundi");
  assert.equal(I18N.t("weekday.1"), "Tuesday", "unstated keys fall back to English");
  /* A silently dropped catalog is the one failure this module cannot surface
   * in the UI, so registration errors throw instead. */
  assert.throws(() => I18N.register("", {}), TypeError);
  assert.throws(() => I18N.register("de", null), TypeError);
  assert.throws(() => I18N.register("de", "not an object"), TypeError);
});

test("locales() lists registered catalogs, sorted", () => {
  const I18N = freshI18n();
  assert.deepEqual(I18N.locales(), ["en", "es"]);
});

test("non-string catalog values are ignored, not rendered", () => {
  const I18N = freshI18n();
  I18N.register("en", { "weekly.title": { nested: "object" } });
  assert.equal(I18N.t("weekly.title"), "Weekly plan", "the pre-existing string survives");
});

/* ---- change notification ---- */

test("onChange fires on a real switch, not on a refused one", () => {
  const I18N = freshI18n();
  const seen = [];
  const off = I18N.onChange(tag => seen.push(tag));
  I18N.setLocale("es");
  I18N.setLocale("zz");            // refused: no catalog
  I18N.setLocale("en");
  off();
  I18N.setLocale("es");            // after unsubscribe: must not fire
  assert.deepEqual(seen, ["es", "en"]);
});

test("a throwing listener does not break the locale switch", () => {
  const I18N = freshI18n();
  const seen = [];
  I18N.onChange(() => { throw new Error("boom"); });
  I18N.onChange(tag => seen.push(tag));
  assert.equal(I18N.setLocale("es"), "es");
  assert.equal(I18N.t("weekday.0"), "lunes");
  assert.deepEqual(seen, ["es"]);
});

/* ---- the catalogs themselves ---- */

test("every locale-es key that exists also exists in English", () => {
  /* A translation can never be the sole source of a key: if en drops a key,
   * es would keep rendering it and the English default would be gone. */
  for (const key of Object.keys(ES)) {
    assert.equal(typeof EN[key], "string", "en is missing " + key);
  }
});

test("the catalogs are flat string maps with no embedded metadata", () => {
  /* Keeps a catalog droppable as plain JSON-shaped JS with no loader
   * convention — that is what keeps extraction build-step-free. */
  for (const [tag, cat] of [["en", EN], ["es", ES]]) {
    for (const [key, value] of Object.entries(cat)) {
      assert.equal(typeof value, "string", tag + "." + key + " must be a string");
      /* dotted lowerCamelCase namespaces: "weekly.nothingToday". Numeric
       * segments are allowed for indexed vocabulary ("weekday.0"). */
      assert.match(key, /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/, tag + " key shape: " + key);
    }
  }
});
