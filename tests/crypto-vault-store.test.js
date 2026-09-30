"use strict";
/* Tests for js/vault.js — the storage bridge in front of the crypto (issue #16).
 *
 * This is where the "encryption is OFF for everyone by default" claim lives,
 * and where "a user can turn it off and read their data again" is proven
 * rather than asserted. The acceptance criteria for #16 are: opt-in, WebCrypto
 * KDF, a recovery story, and guest mode unchanged - the first two are in
 * tests/crypto-vault.test.js, this file covers the storage contract.
 *
 * A fake localStorage and Node's WebCrypto stand in for the browser, so
 * nothing here touches a real profile.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const webcrypto = require("node:crypto").webcrypto;

const VAULT = require("../js/data/crypto-vault.js");
const BRVault = require("../js/vault.js");

/* The shipped 310k PBKDF2 iterations would make this file take minutes, so
 * the work factor is injected at 200. The work factor is a cost knob, not a
 * behaviour - it is asserted at its real value in tests/crypto-vault.test.js.
 * It is injected through create() rather than by assigning to
 * VAULT.DEFAULT_ITERATIONS, because that constant lives in the module's
 * closure: the assignment parses, runs, and does nothing, which would leave
 * this file quietly paying full price and looking fast. */
const TEST_ITERATIONS = 200;

const PASS = "a-long-enough-passphrase";

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => Array.from(map.keys())
  };
}

function seed() {
  return fakeStorage({
    br_sessions: JSON.stringify([{ id: "s1", name: "Leg Day" }]),
    br_tracker: JSON.stringify({ schemaVersion: 2, "2026-01-01": { sessions: {} } }),
    br_bodyweight: JSON.stringify([{ date: "2026-01-01", kg: 81.2 }]),
    br_settings: JSON.stringify({ units: "kg", pwHash: "h1abc.4" }),
    /* Bookkeeping that must stay readable in the clear. */
    brsync_outbox: JSON.stringify([{ key: "br_sessions" }]),
    br_timer_state:JSON.stringify({}),
    br_presets_hidden: JSON.stringify(["p1"])
  });
}

function vaultFor(storage) {
  return BRVault.create(VAULT, { storage, crypto: webcrypto, iterations: TEST_ITERATIONS });
}

/* ---------------- default: nothing changes for a user who does not opt in ---------------- */

test("with no vault record the bridge is a transparent pass-through", () => {
  const storage = seed();
  const v = vaultFor(storage);
  assert.equal(v.isEnabled(), false);
  assert.equal(v.isUnlocked(), false);

  assert.deepEqual(v.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
  assert.deepEqual(v.get("br_settings", {}), { units: "kg", pwHash: "h1abc.4" });
  assert.equal(v.get("br_missing", "fallback"), "fallback");
  assert.equal(v.get("br_missing", null), null);

  v.set("br_week", { mon: "Leg Day" });
  assert.equal(storage.getItem("br_week"), JSON.stringify({ mon: "Leg Day" }));
});

test("opt-in is not silent: a user who never enables it keeps readable plaintext", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.set("br_aft_results", [{ id: "r1", event: "2MR", value: 640 }]);
  await v.flush();
  assert.equal(storage.getItem("br_aft_results"), JSON.stringify([{ id: "r1", event: "2MR", value: 640 }]));
  assert.equal(v.isEnabled(), false, "writing data must never turn encryption on by itself");
});

/* ---------------- enabling ---------------- */

test("enable seals the stored payload and leaves the app's reads working", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  const res = await v.enable(PASS);
  assert.deepEqual(res, { ok: true });
  assert.equal(v.isEnabled(), true);
  assert.equal(v.isUnlocked(), true);

  /* At rest: every protected key is now an envelope. */
  VAULT.PROTECTED_KEYS.forEach((key) => {
    const raw = storage.getItem(key);
    if (raw == null) return;
    assert.ok(VAULT.isEnvelope(raw), key + " is still plaintext after enabling");
    assert.equal(raw.indexOf("Leg Day"), -1, key + " leaks its plaintext");
  });
  /* Through the app's own contract, the data is unchanged. */
  assert.deepEqual(v.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
  assert.deepEqual(v.get("br_bodyweight", []), [{ date: "2026-01-01", kg: 81.2 }]);
  assert.deepEqual(v.get("br_settings", {}), { units: "kg", pwHash: "h1abc.4" });
});

test("enabling leaves sync, timer and Drive bookkeeping readable in the clear", async () => {
  const storage = seed();
  await vaultFor(storage).enable(PASS);
  /* js/cloud.js and js/timer.js read these straight from localStorage with no
   * passphrase in scope. Sealing them would break Drive sync and reload
   * recovery, and they hold no training data. */
  assert.equal(VAULT.isEnvelope(storage.getItem("brsync_outbox")), false);
  assert.equal(storage.getItem("brsync_outbox"), JSON.stringify([{ key: "br_sessions" }]));
  assert.equal(VAULT.isEnvelope(storage.getItem("br_timer_state")), false);
  assert.equal(VAULT.isEnvelope(storage.getItem("br_presets_hidden")), false);
});

test("a passphrase under the floor is refused and nothing is sealed", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  const res = await v.enable("short");
  assert.equal(res.ok, false);
  assert.match(res.error, /at least 8 characters/);
  assert.equal(v.isEnabled(), false);
  assert.equal(storage.getItem("br_sessions"), JSON.stringify([{ id: "s1", name: "Leg Day" }]));
  /* And the data is still readable, not stranded by a failed attempt. */
  assert.deepEqual(v.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
});

test("a corrupt stored value is reported instead of being dropped", async () => {
  const storage = seed();
  storage.setItem("br_sessions", "{not json");
  const v = vaultFor(storage);
  const res = await v.enable(PASS);
  assert.equal(res.ok, false);
  assert.match(res.error, /br_sessions/);
  assert.equal(v.isEnabled(), false);
  assert.equal(storage.getItem("br_sessions"), "{not json", "the unreadable value must be left alone");
});

/* ---------------- unlocking and locking ---------------- */

test("a fresh instance unlocks with the right passphrase and not the wrong one", async () => {
  const storage = seed();
  await vaultFor(storage).enable(PASS);

  const cold = vaultFor(storage);
  assert.equal(cold.isUnlocked(), false);
  /* Locked, a protected read is the fallback - never ciphertext, never a
   * half-decoded value. The app gates rendering on the unlock, so this is the
   * "nothing to show yet" path, not a silent empty dataset. */
  assert.deepEqual(cold.get("br_sessions", []), []);

  assert.equal(await cold.unlock("the-wrong-passphrase"), false);
  assert.equal(cold.isUnlocked(), false);
  assert.deepEqual(cold.get("br_sessions", []), []);

  assert.equal(await cold.unlock(PASS), true);
  assert.equal(cold.isUnlocked(), true);
  assert.deepEqual(cold.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
});

test("locking drops the mirror, and the data comes back on the next unlock", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  await v.set("br_aft_results", [{ id: "r1", event: "FT", value: 300 }]);
  await v.flush();

  await v.lock();
  assert.equal(v.isUnlocked(), false);
  assert.deepEqual(v.get("br_aft_results", []), []);

  assert.equal(await v.unlock(PASS), true);
  assert.deepEqual(v.get("br_aft_results", []), [{ id: "r1", event: "FT", value: 300 }]);
});

test("lock waits for the write queue, so the last save is never the thing lost", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  /* Deliberately NOT awaited. This is the shape the app actually uses:
   * js/app.js store() is synchronous from the caller's point of view and
   * ignores the promise, so several saves can be queued and the tab closed -
   * or the vault locked - before any of them has sealed. If lock() resolved
   * without draining, localStorage would still hold plaintext here. */
  v.set("br_groups", [{ id: "g1", name: "Push" }]);
  v.set("br_week", { mon: "Leg Day" });
  v.set("br_bw_goal", { kg: 81 });
  await v.lock();

  assert.ok(VAULT.isEnvelope(storage.getItem("br_groups")),
    "a queued write was still unsealed when lock() resolved");
  assert.ok(VAULT.isEnvelope(storage.getItem("br_week")));
  assert.ok(VAULT.isEnvelope(storage.getItem("br_bw_goal")));

  const cold = vaultFor(storage);
  assert.equal(await cold.unlock(PASS), true);
  assert.deepEqual(cold.get("br_groups", []), [{ id: "g1", name: "Push" }]);
  assert.deepEqual(cold.get("br_week", {}), { mon: "Leg Day" });
  assert.deepEqual(cold.get("br_bw_goal", null), { kg: 81 });
});

test("flush resolves only after every queued write has landed", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  v.set("br_groups", [{ id: "g1", name: "Push" }]);
  v.set("br_week", { mon: "Leg Day" });
  await v.flush();
  /* No await on the sets: flush() is what the pagehide handler relies on. */
  assert.ok(VAULT.isEnvelope(storage.getItem("br_groups")));
  assert.ok(VAULT.isEnvelope(storage.getItem("br_week")));
});

test("a write while locked is held in memory, not dropped and not written in the clear", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  await v.lock();

  await v.set("br_week", { mon: "Leg Day" });
  await v.flush();
  /* Must not have been written to disk in the clear while the vault is on. */
  assert.notEqual(storage.getItem("br_week"), JSON.stringify({ mon: "Leg Day" }));
  assert.match(v.lastError(), /locked/);

  await v.unlock(PASS);
  await v.flush();
  const raw = storage.getItem("br_week");
  assert.ok(VAULT.isEnvelope(raw), "the held write must be sealed once the vault is open");
  const cold = vaultFor(storage);
  await cold.unlock(PASS);
  assert.deepEqual(cold.get("br_week", {}), { mon: "Leg Day" });
});

/* ---------------- turning it back off ---------------- */

test("disable restores readable plaintext, which is the recovery story", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  await v.set("br_aft_results", [{ id: "r1", event: "2MR", value: 640 }]);
  await v.flush();

  const res = await v.disable(PASS);
  assert.deepEqual(res, { ok: true });
  assert.equal(v.isEnabled(), false);
  assert.equal(v.isUnlocked(), false);
  assert.equal(storage.getItem(VAULT.META_KEY), null, "the vault record must be removed");

  /* Plaintext again, byte-for-byte the app's own JSON. */
  assert.equal(storage.getItem("br_sessions"), JSON.stringify([{ id: "s1", name: "Leg Day" }]));
  assert.equal(storage.getItem("br_aft_results"), JSON.stringify([{ id: "r1", event: "2MR", value: 640 }]));
  assert.deepEqual(v.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);

  /* A brand-new instance reads it with no unlock step at all. */
  const cold = vaultFor(storage);
  assert.equal(cold.isUnlocked(), false);
  assert.deepEqual(cold.get("br_aft_results", []), [{ id: "r1", event: "2MR", value: 640 }]);
});

test("disable refuses without the right passphrase and leaves the data sealed", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);

  const wrong = await v.disable("not-the-passphrase");
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /does not open/);
  assert.equal(v.isEnabled(), true, "a wrong passphrase must not switch encryption off");
  assert.ok(VAULT.isEnvelope(storage.getItem("br_sessions")));

  const locked = vaultFor(storage);
  const res = await locked.disable(PASS);
  assert.equal(res.ok, false);
  assert.match(res.error, /Unlock the vault/);
  assert.equal(locked.isEnabled(), true);
  assert.ok(VAULT.isEnvelope(storage.getItem("br_sessions")));
});

test("a forgotten passphrase loses the data, and the app says so rather than resetting", async () => {
  /* This is the documented consequence of AES-GCM with no escrow copy: there is
   * no code path anywhere in this module that recovers a vault without the
   * passphrase. Asserted so a future "helpful" reset cannot be added quietly. */
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);

  const lost = vaultFor(storage);
  assert.equal(await lost.unlock("whatever-they-guess"), false);
  assert.equal(await lost.unlock(""), false);
  assert.equal(lost.isUnlocked(), false);
  /* Nothing was rewritten or deleted by the failed attempts. */
  assert.ok(VAULT.isEnvelope(storage.getItem("br_sessions")));
  assert.equal(storage.getItem(VAULT.META_KEY) != null, true);
});

/* A damaged key makes the internal unlock fail, which disable() reports as
 * "does not open this vault" before it rewrites anything. That path is safe by
 * accident of ordering. The path that needs a guard is one where the keys
 * decrypt fine and the REWRITE fails partway: a storage quota error, or another
 * tab writing mid-way. Then a naive disable would leave some keys in plaintext,
 * others still sealed, and the vault record gone - unrecoverable and
 * unreportable. So the test drives a storage that fails on one key. */
test("a failed rewrite keeps the vault record and reports the reason", async () => {
  const base = seed();
  /* The key whose rewrite fails has to be one enable() actually sealed, or
   * there is nothing to be stranded in the first place. */
  base.setItem("br_week", JSON.stringify({ mon: "Leg Day" }));
  const failing = "br_week";
  let failed = false;
  const storage = {
    map: base.map,
    getItem: (k) => base.getItem(k),
    /* Arm the failure only after enable() has run, so the test exercises the
     * disable() rewrite rather than a half-finished enable. */
    setItem: (k, v) => {
      if (k === failing && failed) throw new Error("QuotaExceededError");
      base.setItem(k, v);
    },
    removeItem: (k) => base.removeItem(k)
  };
  const v = BRVault.create(VAULT, { storage, crypto: webcrypto, iterations: TEST_ITERATIONS });
  await v.enable(PASS);
  assert.deepEqual(await v.enable(PASS), { ok: false, error: "Encryption is already on." });
  failed = true;

  const res = await v.disable(PASS);
  assert.equal(res.ok, false);
  assert.match(res.error, /Could not turn encryption off/);
  assert.match(res.error, /QuotaExceededError/);
  assert.equal(base.getItem(VAULT.META_KEY) != null, true,
    "the vault record must survive a failed rewrite, or the sealed keys are stranded");
  /* The keys written before the failure are plaintext again - which is why the
   * record has to stay until every key has actually landed. */
  assert.equal(VAULT.isEnvelope(base.getItem("br_sessions")), false);
  assert.ok(VAULT.isEnvelope(base.getItem("br_week")), "the failed key stays sealed");
});

/* ---------------- changing the passphrase ---------------- */

test("changePassphrase re-seals under a new salt and the old one stops working", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  const before = JSON.parse(storage.getItem(VAULT.META_KEY)).salt;

  const wrong = await v.changePassphrase("nope", "another-long-passphrase");
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /not the current passphrase/);

  const res = await v.changePassphrase(PASS, "another-long-passphrase");
  assert.deepEqual(res, { ok: true });
  const meta = JSON.parse(storage.getItem(VAULT.META_KEY));
  assert.notEqual(meta.salt, before, "a new passphrase must not reuse the old salt");

  const fresh = vaultFor(storage);
  assert.equal(await fresh.unlock(PASS), false, "the old passphrase must stop working");
  const fresh2 = vaultFor(storage);
  assert.equal(await fresh2.unlock("another-long-passphrase"), true);
  assert.deepEqual(fresh2.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
});

test("changePassphrase refuses a weak new passphrase", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  const res = await v.changePassphrase(PASS, "tiny");
  assert.equal(res.ok, false);
  assert.match(res.error, /at least 8 characters/);
  assert.equal(await vaultFor(storage).unlock(PASS), true, "the old passphrase must still work");
});

/* ---------------- damage and half-migrated profiles ---------------- */

test("a protected key left in plaintext inside an encrypted profile still opens", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  await v.lock();
  /* An older build, or a migration that did not finish, leaves one key plain. */
  storage.setItem("br_aft_results", JSON.stringify([{ id: "r9", event: "SR", value: 34 }]));

  const cold = vaultFor(storage);
  assert.equal(await cold.unlock(PASS), true);
  assert.deepEqual(cold.get("br_aft_results", []), [{ id: "r9", event: "SR", value: 34 }]);
  assert.deepEqual(cold.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
});

test("an unreadable vault record reads as encryption off rather than throwing", () => {
  const storage = seed();
  storage.setItem(VAULT.META_KEY, "{not json");
  const v = vaultFor(storage);
  assert.equal(v.isEnabled(), false);
  assert.equal(v.readMeta(), null);
  /* And the app is fully usable: the data was never sealed. */
  assert.deepEqual(v.get("br_sessions", []), [{ id: "s1", name: "Leg Day" }]);
});

test("an envelope from a future format is not silently treated as plaintext", async () => {
  const storage = seed();
  const v = vaultFor(storage);
  await v.enable(PASS);
  await v.lock();
  storage.setItem("br_sessions", VAULT.FORMAT + "-v9:AAAA:BBBB:CCCC");

  const cold = vaultFor(storage);
  /* unlock() fails on it (bad envelope) and leaves the vault locked, rather
   * than loading the raw string into a list view. */
  assert.equal(await cold.unlock(PASS), false);
  assert.equal(cold.isUnlocked(), false);
  assert.deepEqual(cold.get("br_sessions", []), []);
});

/* ---------------- construction guards ---------------- */

test("create refuses to run without the crypto module or a storage", () => {
  assert.throws(() => BRVault.create(null, { storage: fakeStorage(), crypto: webcrypto }), /crypto-vault/);
  assert.throws(() => BRVault.create(VAULT, { crypto: webcrypto }), /storage/);
});
