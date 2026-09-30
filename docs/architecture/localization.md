# Localization (i18n) — decision record

Issue: [#20 — No i18n / localization hooks](https://github.com/stoptalkingishh/battle-rhythm/issues/20)

## Decision: **in scope, seams only**

The issue asked for a decision to be recorded. The answer is *in scope for the
mechanism, out of scope for the translation*. Concretely:

**In scope**

- A plain lookup module, `js/data/i18n.js` (`window.BR_I18N`), using the same
  UMD `window.BR_*` idiom as every other pure module in `js/data/`.
- Flat string catalogs as separate modules: `js/data/locale-en.js` (the default
  bundle) and `js/data/locale-es.js` (a small demonstration catalog).
- The English copy as the default bundle — every value is the literal text that
  was already inline in the source, so behavior is unchanged.
- One real surface wired end to end, plus a language selector so the seam is
  reachable in the UI without a console.
- Tests that pin the fallback chain.

**Out of scope, deliberately**

- Translating the whole app. A machine-generated catalog for every string would
  look like coverage and be unmaintainable; nobody could review it.
- A framework, plural/gender/select rules, message-format dialects, or locale
  negotiation. The issue explicitly ruled out a premature framework, and a
  project with no build step has no business taking a dependency on one.
- Regional variants (`es-MX` vs `es-419`). `setLocale` matches on the primary
  language subtag only, which is honest about what is actually supported.
- Translating user data (session names, exercise results). Those belong to the
  visitor, not to the app.

## How it works

```js
I18N.register("en", EN);        // a flat { key: "text" } map
I18N.setLocale("es");
I18N.t("weekly.today", { name: "Upper A" });  // -> "Hoy: Upper A"
```

The fallback chain is the load-bearing part, and `t()` never returns `""`:

1. the active locale's catalog
2. the default (`en`) catalog — a partial translation degrades **per key**
3. an explicit `{ default: "..." }` from the call site
4. the key itself, so a missing string is greppable instead of invisible

`setLocale("zz")` on an unregistered locale is refused and the current locale is
kept — a bad tag must not blank the UI.

## Adding a language

1. Add `js/data/locale-xx.js` — a UMD module publishing a flat
   `{ key: "text" }` map on `window.BR_LOCALE_XX`, mirroring `locale-en.js`.
2. Add the `<script>` tag to `index.html` **above `js/app.js`**.
3. Add `["xx", "BR_LOCALE_XX"]` to the `CATALOGS` manifest in `js/app.js`.
4. Add the global to `js/data/capabilities.js` so a 404 is diagnosable from
   the UI (the `tests/capabilities.test.js` cross-check will fail otherwise).
5. `npm run bump:bust` — once.

No build step, no bundler, no new dependency. A fresh clone is still directly
deployable.

## Conventions worth keeping

- Keys are dotted lowerCamelCase namespaces: `weekly.nothingToday`,
  `language.label`. Indexed vocabulary uses a numeric segment (`weekday.0`)
  keyed by the Monday-first weekday the rest of the app already uses, so a
  catalog supplies names without any calling code knowing about ordering.
- Catalogs are flat string maps with **no** embedded metadata. The locale tag
  is declared in `js/app.js`'s `CATALOGS` manifest, next to the `<script>` tag
  that loads the file. That is what keeps a catalog droppable as
  JSON-shaped JS with no loader convention to learn.
- Only the English catalog may define a key that no other catalog has. A test
  pins this, so `en` cannot quietly become incomplete.
- `BR_I18N` is an **optional** capability: `app.js` reads it through a
  `|| null` guard and `t()` degrades to the key string if the module 404s.
  A partial deploy renders raw keys, which is debuggable; it does not render
  blank copy.

## Guest mode

Unchanged. Catalogs are static files served with the app. No network call, no
credential, no `localStorage` write beyond the visitor's own locale choice
(`br_locale`). `js/config.js` still ships with `BR_GOOGLE_CLIENT_ID` and
`BR_GOOGLE_API_KEY` empty, and `npm run check:config` guards it.
