"use strict";
/* Wiring tests for the local vault in js/app.js (issue #16).
 *
 * The browser tool cannot reach a localhost server, so the UI could not be
 * driven end to end here. These tests close the gap by evaluating the REAL
 * source of js/app.js - sliced out of the file by anchor, not copied into this
 * test - against a minimal window shim. That catches the regression that
 * actually matters: someone changing store()/load() back to a direct
 * localStorage call, which would silently write plaintext beside an encrypted
 * vault while every crypto test stayed green.
 *
 * Also pins the structural facts the UI depends on: the vault panel and gate
 * live in index.html, and the two ids app.js queries exist in the markup.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const VAULT_CRYPTO = require("../js/data/crypto-vault.js");
const VAULT_STORE = require("../js/vault.js");
const webcrypto = require("node:crypto").webcrypto;

/* Slice a function out of app.js by its declaration and brace matching. The
 * anchor is the declaration line; the body is everything up to the matching
 * close brace at column 0. Throws if the shape is not what we expect, so a
 * reformat of app.js fails here loudly rather than silently testing nothing. */
function sliceFn(name) {
  const decl = "  function " + name + "(";
  const start = APP.indexOf(decl);
  assert.notEqual(start, -1, name + " not found in js/app.js");
  const open = APP.indexOf("{", start + decl.length);
  let depth = 0;
  for (let i = open; i < APP.length; i++) {
    if (APP[i] === "{") depth++;
    else if (APP[i] === "}") {
      depth--;
      if (depth === 0) {
        /* Only end at a brace that closes the function itself, i.e. one that is
         * followed by a newline and two spaces or EOF. A brace inside a nested
         * object also reaches depth 1, so this is the guard against a
         * multi-line default argument. */
        const after = APP.slice(i + 1, i + 3);
        if (after === "" || after === "\n ") return APP.slice(start, i + 1);
      }
    }
  }
  throw new Error("could not find the end of " + name);
}

function shim(storage, cryptoObj, extraGlobals) {
  const sandbox = {
    localStorage: storage,
    window: null,
    console,
    Promise,
    JSON,
    Object,
    Array,
    Boolean,
    Math,
    Date,
    TextEncoder,
    TextDecoder,
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  Object.assign(sandbox, extraGlobals || {});
  return vm.createContext(sandbox);
}

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const PASS = "a-long-enough-passphrase";

/* ---------------- the delegation itself ---------------- */

test("app.js store() and load() go through the vault, not straight to localStorage", () => {
  /* A recording vault: any read or write must arrive here. */
  const calls = [];
  const fakeVault = {
    get: (k, d) => { calls.push(["get", k]); return d; },
    set: (k, v) => { calls.push(["set", k]); return Promise.resolve(); },
    remove: (k) => { calls.push(["remove", k]); return Promise.resolve(); },
  };
  const ctx = shim(fakeStorage(), null, { BRCloud: null, VAULT: fakeVault });
  vm.runInContext(sliceFn("store") + "\n" + sliceFn("load") + "\n" + sliceFn("unstore")
    + "\nglobalThis.__api = { store, load, unstore };", ctx);

  ctx.__api.load("br_sessions", []);
  ctx.__api.store("br_sessions", [{ id: "a" }]);
  ctx.__api.unstore("br_sessions");

  assert.deepEqual(calls, [["get", "br_sessions"], ["set", "br_sessions"], ["remove", "br_sessions"]]);
  /* And nothing reached localStorage directly. */
  assert.equal(ctx.localStorage.getItem("br_sessions"), null,
    "store() wrote to localStorage behind the vault's back");
});

test("with no vault module the store/load fall back to localStorage unchanged", () => {
  const storage = fakeStorage({ br_sessions: JSON.stringify([{ id: "a" }]) });
  const ctx = shim(storage, null, { BRCloud: null, VAULT: null });
  vm.runInContext(sliceFn("store") + "\n" + sliceFn("load") + "\n" + sliceFn("unstore")
    + "\nglobalThis.__api = { store, load, unstore };", ctx);

  /* This is the guest-mode / module-missing path: it must behave exactly as
   * the pre-encryption app did, or a 404 on js/vault.js would lose data. */
  assert.deepEqual(ctx.__api.load("br_sessions", []), [{ id: "a" }]);
  assert.deepEqual(ctx.__api.load("br_missing", "fallback"), "fallback");
  assert.deepEqual(ctx.__api.load("br_missing", null), null);
  ctx.__api.store("br_week", { mon: "Leg" });
  assert.equal(storage.getItem("br_week"), JSON.stringify({ mon: "Leg" }));
  ctx.__api.unstore("br_week");
  assert.equal(storage.getItem("br_week"), null);
});

test("the only direct localStorage writes left in app.js are store()'s fallback", () => {
  /* The point of the shim above is that it is exhaustive. Every direct
   * localStorage access left in app.js must be one of the known-good ones: the
   * !VAULT fallbacks inside store()/unstore(), which only run when js/vault.js
   * failed to load, or the construction of the vault's storage object. A new
   * direct write would put plaintext next to ciphertext on any profile where
   * the vault IS active - which is the bug this whole feature risks. */
  const storeSrc = sliceFn("store");
  const unstoreSrc = sliceFn("unstore");
  const loadSrc = sliceFn("load");
  const known = [storeSrc, unstoreSrc, loadSrc].join("\n");
  const offenders = APP.split("\n")
    .map((line, i) => ({ i: i + 1, line }))
    .filter(({ line }) => /localStorage\.(setItem|removeItem|getItem)\s*\(/.test(line))
    .filter(({ line }) => {
      const code = line.replace(/^\s*\*.*$/, "").replace(/\/\/.*$/, "").trim();
      if (!code) return false;
      if (/storage: window\.localStorage/.test(code)) return false;
      /* The pass-throughs, with their own argument names. */
      return !/localStorage\.(setItem|removeItem|getItem)\(key[,)]/.test(code);
    })
    .filter(({ line }) => known.split("\n").indexOf(line) === -1)
    .filter(({ line }) => !/\/\*/.test(line));
  assert.deepEqual(offenders, [], "unexpected direct localStorage access in app.js: " + JSON.stringify(offenders));

  /* And the fallbacks must be conditional - an unconditional write in store()
   * would defeat the vault entirely. */
  assert.match(storeSrc, /if \(VAULT\) VAULT\.set\(key, val\);\s*else \{ try \{ localStorage\.setItem/,
    "store() must fall back to localStorage only when there is no vault");
});

/* ---------------- the vault record and the gate ---------------- */

test("the vault panel and unlock gate exist in index.html", () => {
  ["vault-modal", "vault-status", "vault-panel", "vault-unlock-input",
    "vault-unlock-error", "vault-unlock-submit"].forEach((id) => {
    assert.equal(HTML.indexOf('id="' + id + '"') !== -1, true, "#" + id + " is missing from index.html");
  });
});

test("the unlock gate is a modal of its own, outside the settings modal", () => {
  const gate = HTML.indexOf('id="vault-modal"');
  const settings = HTML.indexOf('id="settings-modal"');
  assert.ok(gate !== -1 && settings !== -1);
  /* Nested modals are how a dismissable dialog ends up on top of a modal that
   * must not be dismissable. */
  const settingsEnd = HTML.indexOf("</div>\n  </div>", settings);
  assert.ok(gate < settings || gate > settingsEnd, "the vault gate is nested inside the settings modal");
  /* It has no close button: the only way out is a successful unlock. */
  const block = HTML.slice(gate, gate + 1400);
  assert.equal(/id="vault-modal-close"/.test(block), false, "the unlock gate must not offer a close button");
});

test("app.js protects the gate from the dismiss-Escape and dismiss-backdrop handlers", () => {
  assert.equal(/id === "vault-modal"/.test(APP), true,
    "js/app.js closes every modal on Escape and on a backdrop click; the vault gate must opt out");
  /* Twice: once for the Escape key handler, once for the backdrop handler. */
  assert.equal((APP.match(/id === "vault-modal"/g) || []).length >= 2, true,
    "only one of the two dismiss paths guards the gate");
});

test("initStorage passes localStorage and WebCrypto into the vault factory", () => {
  const src = sliceFn("initStorage");
  assert.match(src, /factory\.create\(crypto,\s*\{\s*storage: window\.localStorage, crypto: window\.crypto\s*\}\)/);
});

test("clearBWGoal goes through the storage shim so a cleared goal stays cleared", () => {
  const clear = sliceFn("clearBWGoal");
  assert.match(clear, /unstore\(KEYS\.bwGoal\)/);
  assert.equal(/localStorage\.removeItem/.test(clear), false);
});

/* ---------------- end to end through the real module pair ---------------- */

test("a full app-shaped round trip seals, hides and restores the user's data", async () => {
  const storage = fakeStorage({
    br_sessions: JSON.stringify([{ id: "s1", name: "Leg Day" }]),
    br_bodyweight: JSON.stringify([{ date: "2026-02-01", kg: 80 }])
  });
  const vault = VAULT_STORE.create(VAULT_CRYPTO, { storage, crypto: webcrypto, iterations: 200 });

  /* Read through the app's contract before opting in. */
  assert.deepEqual(vault.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);

  assert.deepEqual(await vault.enable(PASS), { ok: true });
  /* At rest, unreadable without the passphrase. */
  const raw = storage.getItem("br_sessions");
  assert.equal(VAULT_CRYPTO.isEnvelope(raw), true);
  assert.equal(raw.indexOf("Leg Day"), -1, "the session name is readable in localStorage");
  /* Through the app's contract, unchanged. */
  assert.deepEqual(vault.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);

  /* A reload: a brand-new bridge, locked, shows nothing rather than noise. */
  const reloaded = VAULT_STORE.create(VAULT_CRYPTO, { storage, crypto: webcrypto, iterations: 200 });
  assert.deepEqual(reloaded.get("br_sessions", []), []);
  assert.equal(await reloaded.unlock(PASS), true);
  assert.deepEqual(reloaded.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
  assert.deepEqual(reloaded.get("br_bodyweight", []), [{ date: "2026-02-01", kg: 80 }]);

  /* And the user can turn it back off and read everything again. */
  assert.deepEqual(await reloaded.disable(PASS), { ok: true });
  assert.equal(VAULT_CRYPTO.isEnvelope(storage.getItem("br_sessions")), false);
  assert.equal(storage.getItem("br_sessions"), JSON.stringify([{ id: "s1", name: "Leg Day" }]));
});