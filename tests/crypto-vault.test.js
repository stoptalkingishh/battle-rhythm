"use strict";
/* Tests for js/data/crypto-vault.js (issue #16).
 *
 * The dangerous part of a crypto module is a test that cannot fail, so the
 * assertions here are written to be driven to failure by weakening the module
 * (see the mutation note at the bottom of this file and the PR description).
 *
 * PBKDF2 at the shipped 310k iterations would make this file crawl, so the
 * async cases pass an explicit low iteration count. The shipped default is
 * asserted separately and cannot be lowered without failing a test.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const webcrypto = require("node:crypto").webcrypto;
const fs = require("node:fs");
const path = require("node:path");

const VAULT = require("../js/data/crypto-vault.js");

const FAST = { iterations: 1000 };
const PASS = "correct horse battery staple";
const WRONG = "correct horse battery stapl";

/* ---------------- base64 ---------------- */

test("base64 round-trips every byte value and both padding cases", () => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  for (let len = 0; len <= 256; len++) {
    const slice = all.slice(0, len);
    assert.deepEqual(Array.from(VAULT.fromB64(VAULT.toB64(slice))), Array.from(slice));
  }
});

test("base64 is standard, so its output is stable and not a private alphabet", () => {
  assert.equal(VAULT.toB64(new Uint8Array([77, 97, 110])), "TWFu");
  assert.equal(VAULT.toB64(new Uint8Array([77, 97])), "TWE=");
  assert.equal(VAULT.toB64(new Uint8Array([77])), "TQ==");
});

test("fromB64 rejects non-alphabet characters and an impossible leftover", () => {
  assert.throws(() => VAULT.fromB64("abc$def"), /Malformed/);
  /* One leftover sextet cannot encode a byte. Truncating instead of throwing
   * would let a corrupted envelope "decrypt" to garbage. */
  assert.throws(() => VAULT.fromB64("TQ"), /Malformed/);
  assert.deepEqual(Array.from(VAULT.fromB64("")), []);
});

/* ---------------- envelope shape ---------------- */

test("isEnvelope only claims Battle Rhythm envelopes", () => {
  assert.equal(VAULT.isEnvelope(VAULT.FORMAT + ":AAAA:BBBB:CCCC"), true);
  assert.equal(VAULT.isEnvelope('[{"id":"a"}]'), false);
  assert.equal(VAULT.isEnvelope(""), false);
  assert.equal(VAULT.isEnvelope(null), false);
  assert.equal(VAULT.isEnvelope(42), false);
  /* A near-miss on the format marker must not be accepted: a future/foreign
   * envelope has to fail loudly rather than be parsed with today's rules. */
  assert.equal(VAULT.isEnvelope("br-enc-v2:AAAA:BBBB:CCCC"), false);
});

test("looksSealed covers the whole envelope family, isEnvelope only today's", () => {
  assert.equal(VAULT.looksSealed(VAULT.FORMAT + ":AAAA:BBBB:CCCC"), true);
  assert.equal(VAULT.looksSealed("br-enc-v2:AAAA:BBBB:CCCC"), true);
  assert.equal(VAULT.looksSealed("br-enc-v9:something"), true);
  assert.equal(VAULT.isEnvelope("br-enc-v2:AAAA:BBBB:CCCC"), false);
  /* A JSON value that happens to start with the letters is still not sealed:
   * only the marker at position 0 counts. */
  assert.equal(VAULT.looksSealed('[{"x":"br-enc-v1"}]'), false);
  assert.equal(VAULT.looksSealed('[{"id":"a"}]'), false);
  assert.equal(VAULT.looksSealed(null), false);
  assert.equal(VAULT.looksSealed(7), false);
});

test("parseEnvelope rejects malformed envelopes instead of returning junk", () => {
  const good = VAULT.formatEnvelope({
    salt: new Uint8Array(VAULT.SALT_BYTES),
    iv: new Uint8Array(VAULT.IV_BYTES),
    ct: new Uint8Array([1, 2, 3])
  });
  const parsed = VAULT.parseEnvelope(good);
  assert.equal(parsed.salt.length, VAULT.SALT_BYTES);
  assert.equal(parsed.iv.length, VAULT.IV_BYTES);
  assert.deepEqual(Array.from(parsed.ct), [1, 2, 3]);

  assert.throws(() => VAULT.parseEnvelope("not an envelope"), /Not a Battle Rhythm vault envelope/);
  assert.throws(() => VAULT.parseEnvelope(VAULT.FORMAT + ":AAAA:BBBB"), /Malformed/);
  /* Well-formed but wrong parts. parseEnvelope checks salt, then IV, then
   * ciphertext, so each fixture is built to reach exactly one of those. */
  const SALT_OK = "A".repeat(22) + "=="; /* 16 bytes of 0x00 */
  const IV_OK = "A".repeat(16); /* 12 bytes of 0x00, no padding */
  assert.throws(
    () => VAULT.parseEnvelope(VAULT.FORMAT + ":" + SALT_OK + ":" + IV_OK + ":"),
    /no ciphertext/
  );
  assert.throws(
    () => VAULT.parseEnvelope(VAULT.FORMAT + ":AAAA:" + IV_OK + ":AwQ="),
    /short salt/
  );
  assert.throws(
    () => VAULT.parseEnvelope(VAULT.FORMAT + ":" + SALT_OK + ":AAAA:AwQ="),
    /bad IV length/
  );
  /* An IV that is not 12 bytes must not be quietly padded or truncated. */
  assert.throws(
    () => VAULT.parseEnvelope(VAULT.FORMAT + ":" + SALT_OK + ":" + "A".repeat(8) + ":AwQ="),
    /bad IV length/
  );
  /* Non-canonical base64 (a stray "=" in the middle) is rejected. */
  assert.throws(
    () => VAULT.parseEnvelope(VAULT.FORMAT + ":AA=AA:" + IV_OK + ":AwQ="),
    /Malformed/
  );
});

/* ---------------- which keys are protected ---------------- */

test("isProtectedKey covers every user collection and the settings record", () => {
  [
    "br_sessions", "br_regiments", "br_tracker", "br_aft_results", "br_bodyweight",
    "br_groups", "br_custom_exercises", "br_settings", "br_week", "br_bw_goal"
  ].forEach((key) => {
    assert.equal(VAULT.isProtectedKey(key), true, key + " must be sealed at rest");
  });
});

test("isProtectedKey leaves sync, Drive and timer bookkeeping in the clear", () => {
  [
    "brsync_outbox", "brsync_mtime_sessions.json", "brdrive:folder_x", "brdrive:joined_y",
    "br_timer_state:123", VAULT.META_KEY, "br_presets_hidden", "br_tracker_active", "br_unknown"
  ].forEach((key) => {
    assert.equal(VAULT.isProtectedKey(key), false, key + " must not be sealed");
  });
});

test("the protected list and the ephemeral list cannot overlap", () => {
  VAULT.PROTECTED_KEYS.forEach((key) => {
    assert.equal(VAULT.isProtectedKey(key), true);
    assert.equal(VAULT.EPHEMERAL_KEYS.indexOf(key), -1, key + " is both protected and ephemeral");
  });
  assert.equal(VAULT.EPHEMERAL_KEYS.indexOf(VAULT.META_KEY), -1, "the vault record must not seal itself");
  /* No duplicate entries, which would let one key be treated two ways. */
  assert.equal(new Set(VAULT.PROTECTED_KEYS).size, VAULT.PROTECTED_KEYS.length);
});

/* ---------------- metadata validation ---------------- */

test("validateMeta accepts a real record and rejects every broken field", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  assert.equal(VAULT.validateMeta(meta), null);

  assert.match(VAULT.validateMeta(null), /not readable/);
  assert.match(VAULT.validateMeta("nope"), /not readable/);
  assert.match(VAULT.validateMeta([]), /not readable/);

  const cases = [
    [{ format: "br-enc-v2" }, /different version/],
    [{ kdf: "scrypt" }, /key derivation/],
    [{ hash: "MD5" }, /unsupported hash/],
    [{ iterations: 0 }, /iteration count/],
    [{ iterations: 1.5 }, /iteration count/],
    [{ iterations: "many" }, /iteration count/],
    [{ salt: "!!!" }, /salt is corrupt/],
    [{ salt: "AAAA" }, /salt is too short/],
    [{ verifier: "plaintext" }, /no passphrase verifier/]
  ];
  for (const [override, expected] of cases) {
    const bad = Object.assign({}, meta, override);
    assert.match(VAULT.validateMeta(bad), expected, JSON.stringify(override));
  }
});

/* ---------------- seal / open ---------------- */

test("seal then open returns the value, for objects, arrays and scalars", async () => {
  const payloads = [
    [{ id: "a", sets: [{ reps: 5, load: 225 }] }],
    [1, 2, 3],
    { nested: { deep: [true, false, null, "x"] } },
    [],
    {},
    "just a string",
    42,
    true,
    null
  ];
  for (const payload of payloads) {
    const sealed = await VAULT.seal(payload, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
    assert.ok(VAULT.isEnvelope(sealed));
    const opened = await VAULT.open(sealed, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
    assert.deepEqual(opened, payload);
  }
});

test("a wrong passphrase cannot open the envelope", async () => {
  const sealed = await VAULT.seal({ secret: "training data" }, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  await assert.rejects(
    () => VAULT.open(sealed, { passphrase: WRONG, iterations: FAST.iterations }, webcrypto),
    "a wrong passphrase must fail AES-GCM authentication"
  );
});

test("the sealed text never contains the plaintext", async () => {
  const secret = { note: "shoulder-press-max-test" };
  const sealed = await VAULT.seal(secret, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  assert.equal(sealed.indexOf("shoulder-press"), -1);
  assert.equal(sealed.indexOf(PASS), -1);
});

/* The two mutations that break AES-GCM. Both are asserted on the module as
 * shipped; see the mutation note in the PR for the manual re-run. */
test("sealing the same value twice produces a different salt and IV each time", async () => {
  const value = { id: "same", reps: 10 };
  const seen = new Set();
  const salts = new Set();
  const ivs = new Set();
  for (let i = 0; i < 8; i++) {
    const sealed = await VAULT.seal(value, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
    seen.add(sealed);
    const parts = VAULT.parseEnvelope(sealed);
    salts.add(VAULT.toB64(parts.salt));
    ivs.add(VAULT.toB64(parts.iv));
    /* Both must still open: a fresh IV that breaks decryption is not a fix. */
    const opened = await VAULT.open(sealed, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
    assert.deepEqual(opened, value);
  }
  assert.equal(seen.size, 8, "8 seals of one value produced only " + seen.size + " distinct envelopes (IV or salt reused)");
  assert.equal(salts.size, 8, "salt is not fresh per encryption");
  assert.equal(ivs.size, 8, "IV is not fresh per encryption");
});

test("a tampered ciphertext byte is rejected", async () => {
  const sealed = await VAULT.seal({ reps: 5 }, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  const parts = VAULT.parseEnvelope(sealed);
  parts.ct[0] = parts.ct[0] ^ 0x01;
  const tampered = VAULT.formatEnvelope(parts);
  assert.notEqual(tampered, sealed);
  await assert.rejects(
    () => VAULT.open(tampered, { passphrase: PASS, iterations: FAST.iterations }, webcrypto),
    "AES-GCM must authenticate the ciphertext"
  );
});

test("a swapped salt from another envelope cannot open it", async () => {
  const a = await VAULT.seal({ a: 1 }, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  const b = await VAULT.seal({ a: 2 }, { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  const partsB = VAULT.parseEnvelope(b);
  const partsA = VAULT.parseEnvelope(a);
  const mixed = VAULT.formatEnvelope({ salt: partsB.salt, iv: partsA.iv, ct: partsA.ct });
  await assert.rejects(
    () => VAULT.open(mixed, { passphrase: PASS, iterations: FAST.iterations }, webcrypto),
    "the salt is part of the key derivation, not decoration"
  );
});

test("an envelope sealed under one passphrase does not open under another", async () => {
  const sealed = await VAULT.seal({ x: 1 }, { passphrase: "alpha-pass", iterations: FAST.iterations }, webcrypto);
  await assert.rejects(
    () => VAULT.open(sealed, { passphrase: "beta-pass", iterations: FAST.iterations }, webcrypto)
  );
});

/* The verifier comparison must not be vacuous. Without it, ANY value this
 * vault could have produced would pass as "the right passphrase" - and an
 * attacker who can get the app to seal one arbitrary string under the key
 * would have a working unlock. Sealing the wrong text under the real key and
 * handing that to tryUnlock is the only way to reach that comparison, since a
 * wrong passphrase is stopped earlier by GCM authentication. */
test("a verifier sealed from the wrong text does not unlock the vault", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  const wrongText = await VAULT.seal("not the verifier", { passphrase: PASS, iterations: FAST.iterations }, webcrypto);
  assert.notEqual(wrongText, meta.verifier);
  const forged = Object.assign({}, meta, { verifier: wrongText });
  assert.equal(await VAULT.tryUnlock(forged, PASS, webcrypto, FAST), false,
    "the verifier must be compared, not merely decrypted");
});

/* ---------------- vault lifecycle ---------------- */

test("newMeta never stores the passphrase or any key material", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  const text = JSON.stringify(meta);
  assert.equal(text.indexOf(PASS), -1, "the passphrase leaked into the metadata record");
  /* The record is public by design - salt, KDF params, sealed verifier - so
   * the whole key list is asserted: nothing that could hold key material. */
  assert.equal("key" in meta, false);
  assert.equal("keyBytes" in meta, false);
  assert.equal("derivedKey" in meta, false);
  assert.equal(meta.verifier.indexOf(PASS), -1, "the passphrase leaked into the sealed verifier");
  assert.deepEqual(Object.keys(meta).sort(), [
    "alg", "createdAt", "format", "hash", "iterations", "kdf", "salt", "verifier"
  ]);
});

test("newMeta produces a fresh salt per vault, so two vaults differ", async () => {
  const a = await VAULT.newMeta(PASS, webcrypto, FAST);
  const b = await VAULT.newMeta(PASS, webcrypto, FAST);
  assert.notEqual(a.salt, b.salt, "two vaults from one passphrase shared a salt");
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(VAULT.validateMeta(a), null);
  assert.equal(VAULT.validateMeta(b), null);
});

test("tryUnlock accepts the right passphrase and rejects everything else", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  assert.equal(await VAULT.tryUnlock(meta, PASS, webcrypto, FAST), true);
  assert.equal(await VAULT.tryUnlock(meta, WRONG, webcrypto, FAST), false);
  assert.equal(await VAULT.tryUnlock(meta, "", webcrypto, FAST), false);
  /* A corrupt record must be a plain false, not a rejection: the app cannot
   * tell the user "wrong password" when the file is what is broken, and an
   * exception here would leave the unlock UI stuck. */
  assert.equal(await VAULT.tryUnlock({ format: "br-enc-v2" }, PASS, webcrypto, FAST), false);
  assert.equal(await VAULT.tryUnlock(null, PASS, webcrypto, FAST), false);

  /* A verifier swapped for another vault's must not unlock this one. */
  const other = await VAULT.newMeta(WRONG, webcrypto, FAST);
  const swapped = Object.assign({}, meta, { verifier: other.verifier });
  assert.equal(await VAULT.tryUnlock(swapped, PASS, webcrypto, FAST), false);
});

test("tryUnlock uses the record's own iteration count, not the default", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  assert.equal(meta.iterations, FAST.iterations);
  assert.equal(await VAULT.tryUnlock(meta, PASS, webcrypto), true);
  assert.equal(await VAULT.tryUnlock(meta, WRONG, webcrypto), false);
});

/* ---------------- shipped parameters ---------------- */

test("the shipped default is a real PBKDF2 work factor", () => {
  assert.equal(VAULT.KDF, "PBKDF2");
  assert.equal(VAULT.HASH, "SHA-256");
  assert.equal(VAULT.ALG, "AES-GCM");
  assert.equal(VAULT.KEY_BITS, 256);
  assert.equal(VAULT.IV_BYTES, 12, "AES-GCM wants a 96-bit IV");
  assert.equal(VAULT.SALT_BYTES, 16);
  assert.ok(
    VAULT.DEFAULT_ITERATIONS >= VAULT.MIN_ITERATIONS,
    "shipped iterations (" + VAULT.DEFAULT_ITERATIONS + ") are below the floor (" + VAULT.MIN_ITERATIONS + ")"
  );
  /* Mutation guard: lowering either constant fails here. */
  assert.equal(VAULT.DEFAULT_ITERATIONS, 310000);
  assert.equal(VAULT.MIN_ITERATIONS, 100000);
});

test("seal defaults to the shipped iteration count when none is passed", async () => {
  const meta = await VAULT.newMeta(PASS, webcrypto);
  assert.equal(meta.iterations, VAULT.DEFAULT_ITERATIONS);
  const sealed = await VAULT.seal({ a: 1 }, { passphrase: PASS }, webcrypto);
  const opened = await VAULT.open(sealed, { passphrase: PASS }, webcrypto);
  assert.deepEqual(opened, { a: 1 });
});

test("the module contains no hardcoded salt, IV, key or passphrase", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "data", "crypto-vault.js"), "utf8");
  /* The standard base64 alphabet is a 64-character literal and is not secret
   * material; drop that exact line before scanning, otherwise the scanner
   * flags itself and a real hit would be lost in the noise. */
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  assert.equal(source.indexOf(ALPHABET) !== -1, true, "the standard base64 alphabet is expected");
  const scanned = source.split("\n").filter((line) => line.indexOf(ALPHABET) === -1);
  /* Any literal that looks like key material: a long base64/hex run, or a
   * 32+ byte array literal. */
  const suspicious = scanned
    .map((line, i) => ({ i: i + 1, line }))
    .filter(({ line }) => {
      const code = line.replace(/^\s*\*.*$/, "").replace(/\/\/.*$/, "");
      if (/["'][A-Za-z0-9+/=]{24,}["']/.test(code)) return true;
      if (/new Uint8Array\(\[[^\]]*\d[^\]]*\]\)/.test(code)) return true;
      if (/\b0x[0-9a-fA-F]{8,}\b/.test(code)) return true;
      return false;
    });
  assert.deepEqual(suspicious, [], "possible hardcoded key material: " + JSON.stringify(suspicious));
  /* The KDF inputs must be the caller's passphrase and a generated salt. */
  assert.equal(/randomBytes\(c, SALT_BYTES\)/.test(source), true);
  assert.equal(/randomBytes\(c, IV_BYTES\)/.test(source), true);
});

test("seal/open/newMeta/tryUnlock refuse to run without WebCrypto", async () => {
  const broken = { subtle: null, getRandomValues: null };
  await assert.rejects(
    () => VAULT.seal({ a: 1 }, { passphrase: PASS }, broken),
    /WebCrypto is unavailable/
  );
  await assert.rejects(() => VAULT.newMeta(PASS, broken), /WebCrypto is unavailable/);
  /* tryUnlock is total: an unusable environment must read as "did not unlock",
   * not as a crash, or the unlock dialog would hang on an old browser. */
  const meta = await VAULT.newMeta(PASS, webcrypto, FAST);
  assert.equal(await VAULT.tryUnlock(meta, PASS, broken), false);
});
