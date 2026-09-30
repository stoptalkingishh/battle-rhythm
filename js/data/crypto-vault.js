"use strict";
/* Opt-in client-side encryption of the localStorage payload (issue #16).
 *
 * WHAT THIS IS
 * A passphrase is stretched with PBKDF2-HMAC-SHA256 into an AES-GCM-256 key,
 * and each protected localStorage value is sealed into an envelope carrying
 * its own salt and IV. The passphrase itself is never stored, and neither is
 * any key material: the only thing kept next to the ciphertext is a random
 * salt and a random IV, neither of which is secret.
 *
 * WHAT THIS IS NOT (read this before claiming it protects anything)
 * The threat model is offline access to the stored bytes: a stolen browser
 * profile, a backup of localStorage, another person at an unlocked machine.
 * It does NOT protect against anything running on the same origin. Any script
 * on this origin - including an XSS payload - can read the derived key out of
 * the live CryptoKey while the vault is unlocked, and can read plaintext
 * before it is sealed. It also does not protect against a compromised OS,
 * a malicious extension, or shoulder-surfing the passphrase. It is obfuscation
 * with a real KDF, not a vault.
 *
 * RECOVERY: there is none, by design. AES-GCM is authenticated and the key is
 * derived only from the passphrase, so a forgotten passphrase means the data
 * is permanently unreadable. No escrow copy, no backdoor, no "hint" key is
 * stored anywhere. The app's own JSON export is the only backup, which is why
 * the UI says so before encryption is switched on. See docs/security.md.
 *
 * PURE. No DOM, no localStorage, no timers, no Date. The WebCrypto object is
 * injected by the caller (`cryptoObj`), so this file is unit-testable in Node
 * with a lower iteration count while shipping the expensive default. Loaded as
 * window.BR_VAULT in the browser and required in Node as
 * js/data/crypto-vault.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_VAULT = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Envelope marker. The value is `FORMAT:b64(salt):b64(iv):b64(ciphertext)`.
   * The marker is what makes an encrypted value self-describing, so a profile
   * that is half migrated (some keys sealed, some not) still reads back
   * correctly instead of feeding a ciphertext string to JSON.parse. */
  var FORMAT = "br-enc-v1";
  /* The family marker, without the version. A value carrying it that is not
   * today's envelope is an envelope from another build, NOT plaintext: a
   * caller must never hand a future/foreign envelope to JSON.parse and get a
   * string where a list of sessions should be. */
  var ENVELOPE_PREFIX = "br-enc-";
  var ALG = "AES-GCM";
  var KDF = "PBKDF2";
  var HASH = "SHA-256";
  var KEY_BITS = 256;

  /* OWASP's floor for PBKDF2-HMAC-SHA256 is far above this; the shipped value
   * is deliberately above 100k and is asserted by tests/crypto-vault.test.js so
   * it cannot be quietly lowered. Tests pass a lower count explicitly. */
  var DEFAULT_ITERATIONS = 310000;
  var MIN_ITERATIONS = 100000;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;

  /* The vault's own metadata record. Stays in the clear: it holds the KDF
   * parameters, the random salt and a sealed verifier, none of which are
   * secret. It is what makes the vault self-describing on a cold start. */
  var META_KEY = "br_vault_meta";

  /* Sealed at rest: everything that is the user's own training data, plus the
   * settings record (which carries the master-password hash, so it must not be
   * readable without the passphrase either). */
  var PROTECTED_KEYS = [
    "br_sessions",
    "br_regiments",
    "br_tracker",
    "br_aft_results",
    "br_bodyweight",
    "br_groups",
    "br_custom_exercises",
    "br_settings",
    "br_week",
    "br_bw_goal"
  ];

  /* Left in the clear, and deliberately so:
   *   - the vault's own metadata, which must be readable to attempt an unlock;
   *   - brsync_*, brdrive:* - Drive/sync bookkeeping read by js/cloud.js and
   *     js/drive.js directly, with no passphrase in scope there;
   *   - br_timer_state:* - an in-progress timer's position, written by
   *     js/timer.js straight to localStorage;
   *   - br_presets_hidden, br_tracker_active - a list of preset ids and the
   *     currently-selected tracker row, i.e. view state, not training data.
   * Encrypting the bookkeeping keys would buy nothing (they are not sensitive
   * and they are not behind the unlock gate) and would break the modules that
   * read them. */
  var EPHEMERAL_PREFIXES = ["brsync_", "brdrive:", "br_timer_state:"];
  var EPHEMERAL_KEYS = ["br_presets_hidden", "br_tracker_active"];

  /* Sealed to prove a passphrase is right. Not a secret, and not a password
   * hash: it is a fixed public string encrypted under the derived key, so a
   * wrong passphrase fails AES-GCM authentication instead of matching a
   * stored hash. */
  var VERIFIER_TEXT = "battle-rhythm-vault-verifier-v1";

  /* ---------------- base64 (no atob/btoa, no Buffer) ---------------- */

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function toB64(bytes) {
    var out = "";
    var i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var a = bytes[i] << 16;
      out += B64[(a >> 18) & 63] + B64[(a >> 12) & 63] + "==";
    } else if (rest === 2) {
      var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + "=";
    }
    return out;
  }

  function fromB64(str) {
    var raw = String(str == null ? "" : str).replace(/\s/g, "");
    /* Padding is the last one or two characters and nothing else may follow,
     * so record it before stripping rather than deleting every "=" anywhere. */
    var pad = 0;
    if (raw.charAt(raw.length - 1) === "=") pad++;
    if (raw.charAt(raw.length - 2) === "=") pad++;
    var clean = pad ? raw.slice(0, raw.length - pad) : raw;
    if (!clean.length) {
      if (pad && pad !== 2) throw new Error("Malformed base64 in vault envelope");
      return new Uint8Array(0);
    }
    if (!/^[A-Za-z0-9+/]+$/.test(clean)) throw new Error("Malformed base64 in vault envelope");
    /* Canonical length: a full group is 4 characters. A residue of 1 has no
     * encoding at all, and the padding must complete the group. Truncating
     * instead of throwing would let a corrupted envelope "decrypt" to garbage. */
    if (clean.length % 4 === 1) throw new Error("Malformed base64 in vault envelope");
    if ((clean.length + pad) % 4 !== 0) throw new Error("Malformed base64 in vault envelope");
    /* Each character is SIX bits. The value has to be shifted into place, not
     * concatenated as a decimal number - "3" is one bit of "000011", and
     * string-concatenating it would corrupt every byte that follows. Any
     * leftover bits are the padding's, and are dropped. */
    var acc = 0;
    var accBits = 0;
    var bytes = [];
    for (var i = 0; i < clean.length; i++) {
      acc = (acc << 6) | B64.indexOf(clean.charAt(i));
      accBits += 6;
      if (accBits >= 8) {
        accBits -= 8;
        bytes.push((acc >> accBits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  }

  function utf8(str) { return new TextEncoder().encode(String(str)); }

  /* ---------------- pure envelope / metadata logic ---------------- */

  function isEnvelope(value) {
    return typeof value === "string" && value.slice(0, FORMAT.length + 1) === FORMAT + ":";
  }

  /* True for today's envelope AND for any other version of the format. Use
   * this to decide "was this written by a vault at all?"; use isEnvelope to
   * decide "can I open this with today's rules?". */
  function looksSealed(value) {
    return typeof value === "string" && value.indexOf(ENVELOPE_PREFIX) === 0;
  }

  function formatEnvelope(parts) {
    return FORMAT + ":" + toB64(parts.salt) + ":" + toB64(parts.iv) + ":" + toB64(parts.ct);
  }

  /* Returns {salt, iv, ct} as Uint8Arrays. Throws on anything that is not a
   * well-formed envelope - a truncated write, a foreign value under a
   * protected key, or a hand-edited string must fail loudly, not yield
   * undefined bytes that decrypt to noise. */
  function parseEnvelope(value) {
    if (!isEnvelope(value)) throw new Error("Not a Battle Rhythm vault envelope");
    var parts = String(value).slice(FORMAT.length + 1).split(":");
    if (parts.length !== 3) throw new Error("Malformed vault envelope");
    var out = { salt: fromB64(parts[0]), iv: fromB64(parts[1]), ct: fromB64(parts[2]) };
    if (out.salt.length < SALT_BYTES) throw new Error("Vault envelope has a short salt");
    if (out.iv.length !== IV_BYTES) throw new Error("Vault envelope has a bad IV length");
    if (!out.ct.length) throw new Error("Vault envelope has no ciphertext");
    return out;
  }

  function isProtectedKey(key) {
    var name = String(key == null ? "" : key);
    if (name === META_KEY) return false;
    if (EPHEMERAL_KEYS.indexOf(name) !== -1) return false;
    for (var i = 0; i < EPHEMERAL_PREFIXES.length; i++) {
      if (name.indexOf(EPHEMERAL_PREFIXES[i]) === 0) return false;
    }
    return PROTECTED_KEYS.indexOf(name) !== -1;
  }

  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  /* Shape check for the on-disk metadata record. Returns null when valid,
   * otherwise a short reason - the app shows that reason and refuses to
   * attempt an unlock it cannot perform. */
  function validateMeta(meta) {
    if (!isObj(meta)) return "The saved vault record is not readable.";
    if (meta.format !== FORMAT) return "That vault was written by a different version of Battle Rhythm.";
    if (meta.kdf !== KDF) return "That vault uses an unsupported key derivation function.";
    if (meta.hash !== HASH) return "That vault uses an unsupported hash.";
    var iters = Number(meta.iterations);
    if (!isFinite(iters) || Math.floor(iters) !== iters || iters < 1) return "That vault has no usable iteration count.";
    var salt;
    try { salt = fromB64(meta.salt); } catch (e) { return "That vault's salt is corrupt."; }
    if (salt.length < SALT_BYTES) return "That vault's salt is too short.";
    if (!isEnvelope(meta.verifier)) return "That vault has no passphrase verifier.";
    return null;
  }

  /* ---------------- WebCrypto ---------------- */

  function subtleOf(cryptoObj) {
    var c = cryptoObj || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
    if (!c || !c.subtle || typeof c.getRandomValues !== "function") {
      throw new Error("WebCrypto is unavailable in this browser");
    }
    return c;
  }

  function randomBytes(cryptoObj, n) {
    var c = subtleOf(cryptoObj);
    var bytes = new Uint8Array(n);
    c.getRandomValues(bytes);
    return bytes;
  }

  /* Stretch the passphrase. The passphrase is imported as PBKDF2 key material
   * and never leaves this function as anything but a derived key. */
  function deriveKey(passphrase, salt, iterations, cryptoObj) {
    var subtle = subtleOf(cryptoObj).subtle;
    return subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return subtle.deriveKey(
        { name: KDF, salt: salt, iterations: iterations, hash: HASH },
        base,
        { name: ALG, length: KEY_BITS },
        false,
        ["encrypt", "decrypt"]
      );
    });
  }

  /* Seal any JSON-serialisable value. A fresh random salt and a fresh random
   * IV are generated on EVERY call - reusing either across two encryptions of
   * the same data is the classic way to break AES-GCM, and
   * tests/crypto-vault.test.js fails if this ever regresses. */
  function seal(value, opts, cryptoObj) {
    return Promise.resolve().then(function () {
    var settings = opts || {};
    var c = subtleOf(cryptoObj);
    var salt = randomBytes(c, SALT_BYTES);
    var iv = randomBytes(c, IV_BYTES);
    var iterations = settings.iterations || DEFAULT_ITERATIONS;
    return deriveKey(settings.passphrase, salt, iterations, c).then(function (key) {
      return c.subtle.encrypt({ name: ALG, iv: iv }, key, utf8(JSON.stringify(value)));
    }).then(function (ct) {
      return formatEnvelope({ salt: salt, iv: iv, ct: new Uint8Array(ct) });
    });
    });
  }

  /* Open an envelope. Rejects (throws) on a wrong passphrase, a truncated or
   * tampered envelope, or a wrong salt - AES-GCM authentication is what makes
   * those indistinguishable, which is the point. */
  function open(envelope, opts, cryptoObj) {
    var parts = parseEnvelope(envelope);
    var settings = opts || {};
    var iterations = settings.iterations || DEFAULT_ITERATIONS;
    return deriveKey(settings.passphrase, parts.salt, iterations, subtleOf(cryptoObj)).then(function (key) {
      return subtleOf(cryptoObj).subtle.decrypt({ name: ALG, iv: parts.iv }, key, parts.ct);
    }).then(function (pt) {
      return JSON.parse(new TextDecoder().decode(pt));
    });
  }

  /* Build a fresh metadata record: a new random salt, the shipped KDF
   * parameters, and a verifier sealed under the new salt. Two vaults made from
   * the same passphrase must not share a salt - that is what
   * tests/crypto-vault.test.js asserts. */
  function newMeta(passphrase, cryptoObj, opts) {
    /* Promise.resolve().then() so a missing-WebCrypto environment rejects
     * rather than throwing synchronously: every async entry point in this
     * module fails the same way, which is what a caller's .catch expects. */
    return Promise.resolve().then(function () {
    var settings = opts || {};
    var c = subtleOf(cryptoObj);
    var salt = randomBytes(c, SALT_BYTES);
    var iterations = settings.iterations || DEFAULT_ITERATIONS;
    var meta = {
      format: FORMAT,
      alg: ALG,
      kdf: KDF,
      hash: HASH,
      iterations: iterations,
      salt: toB64(salt),
      createdAt: new Date().toISOString()
    };
    return seal(VERIFIER_TEXT, { passphrase: passphrase, iterations: iterations }, c).then(function (verifier) {
      meta.verifier = verifier;
      return meta;
    });
    });
  }

  /* True when the passphrase opens this vault's verifier. Never returns the
   * reason - the caller must not be able to tell "wrong passphrase" from
   * "corrupt file", because that difference is a confirmation oracle. */
  function tryUnlock(meta, passphrase, cryptoObj) {
    /* Total by construction: validate first, then resolve-then so a
     * synchronous WebCrypto throw (an old browser, a locked-down context) is
     * caught as a rejection and reported as "did not unlock" rather than
     * escaping to the click handler. Never returns the reason - the caller
     * must not be able to tell "wrong passphrase" from "corrupt file",
     * because that difference is a confirmation oracle. */
    return Promise.resolve().then(function () {
      var reason = validateMeta(meta);
      if (reason) return false;
      var c = subtleOf(cryptoObj);
      return open(meta.verifier, { passphrase: passphrase, iterations: Number(meta.iterations) }, c).then(function (text) {
        return text === VERIFIER_TEXT;
      });
    }).then(function (result) {
      return result === true;
    }, function () {
      return false;
    });
  }

  return {
    FORMAT: FORMAT,
    ENVELOPE_PREFIX: ENVELOPE_PREFIX,
    ALG: ALG,
    KDF: KDF,
    HASH: HASH,
    KEY_BITS: KEY_BITS,
    DEFAULT_ITERATIONS: DEFAULT_ITERATIONS,
    MIN_ITERATIONS: MIN_ITERATIONS,
    SALT_BYTES: SALT_BYTES,
    IV_BYTES: IV_BYTES,
    META_KEY: META_KEY,
    PROTECTED_KEYS: PROTECTED_KEYS,
    EPHEMERAL_PREFIXES: EPHEMERAL_PREFIXES,
    EPHEMERAL_KEYS: EPHEMERAL_KEYS,
    VERIFIER_TEXT: VERIFIER_TEXT,
    toB64: toB64,
    fromB64: fromB64,
    isEnvelope: isEnvelope,
    looksSealed: looksSealed,
    formatEnvelope: formatEnvelope,
    parseEnvelope: parseEnvelope,
    isProtectedKey: isProtectedKey,
    validateMeta: validateMeta,
    newMeta: newMeta,
    seal: seal,
    open: open,
    tryUnlock: tryUnlock
  };
});
