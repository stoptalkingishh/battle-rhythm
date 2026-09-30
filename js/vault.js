"use strict";
/* Storage bridge for the opt-in local vault (issue #16).
 *
 * js/data/crypto-vault.js is pure crypto. This file is the part that talks to
 * localStorage, and it exists because the app's storage contract is
 * SYNCHRONOUS: js/app.js calls store(key, value) and load(key, fallback) from
 * ordinary view code, hundreds of places, with no await in sight. WebCrypto is
 * not synchronous. So the bridge keeps a decrypted in-memory mirror of every
 * protected key:
 *
 *   - unlock(passphrase)  -> decrypts each protected key once into memory
 *   - load(key, fallback) -> served from memory (the app's contract is intact)
 *   - store(key, value)   -> written to memory, then sealed and persisted
 *                             asynchronously on a serialised queue
 *   - lock()              -> drops the mirror; the key and the plaintext go
 *
 * The mirror is why this is honest about its limits: while the app is open and
 * unlocked, the plaintext is in the page. See docs/security.md.
 *
 * WRITE DURABILITY: sealing is async, so a store() that is immediately followed
 * by a tab close can be lost. Two things bound that: writes go on one serial
 * queue (so they cannot interleave and corrupt a key), and flush() is exposed
 * so the caller can await the queue - js/app.js does that before locking and
 * on pagehide. There is no way to await WebCrypto during unload itself, so
 * this is best-effort, not synchronous durability.
 *
 * INERT BY DEFAULT. With no vault record on disk, enable() is false, isEnabled()
 * is false, and every method is a straight pass-through to localStorage. That is
 * the guest-mode path and it must behave exactly as it did before this file
 * existed - a user who never opts in never sees a difference, and no data is
 * encrypted behind their back.
 *
 * Exposes window.BRVault. The crypto module and the storage object are both
 * injected, so tests/crypto-vault-store.test.js runs this in Node against a fake
 * storage and Node's WebCrypto.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BRVault = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Reject a passphrase that is too weak to be worth deriving a key from. The
   * app's existing master password floor is 4 characters (a UI guard, not a
   * security control); encryption gets its own, stated floor, because a
   * 4-character key is brute-forceable in seconds. The passphrase is NOT
   * confirmed against anything: nothing about the user's existing password is
   * reused, so there is nothing to leak by comparison. */
  var MIN_PASSPHRASE = 8;

  function create(crypto, opts) {
    var options = opts || {};
    var storage = options.storage;
    var cryptoObj = options.crypto;
    /* KDF work factor. Defaults to the shipped constant; a caller may pass a
     * lower one ONLY as a test affordance, and nothing in the app does. It is
     * an injected value rather than a mutated module constant because
     * DEFAULT_ITERATIONS lives in crypto-vault.js's closure - assigning to the
     * exported copy would silently do nothing, and a test that thinks it
     * lowered the cost while still running at 310k is worse than a slow test. */
    if (!crypto) throw new Error("crypto-vault.js must load before vault.js");
    var iterations = Number(options.iterations) >= 1 ? Number(options.iterations) : crypto.DEFAULT_ITERATIONS;
    if (!storage) throw new Error("vault.js needs a storage object");

    /* Decrypted mirror of the protected keys. Null while locked, which is what
     * makes "locked" a real state rather than a flag nobody reads. */
    var cache = null;
    /* Values written while the vault was locked. Kept apart from the mirror
     * because lock() drops the mirror but must NOT drop these: they are the
     * user's most recent changes, and there is nowhere else they exist. */
    var held = {};
    var queue = Promise.resolve();
    var lastError = "";

    function isEnabled() { return !!readMeta(); }
    function isUnlocked() { return cache !== null; }

    function readMeta() {
      try {
        var raw = storage.getItem(crypto.META_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    /* Every protected key that actually holds something, as a parsed value.
     * An unparseable value is reported rather than silently dropped: it means
     * localStorage is damaged, and quietly treating it as absent would lose it
     * on the next seal. */
    function readPlaintext() {
      var found = {};
      var broken = [];
      crypto.PROTECTED_KEYS.forEach(function (key) {
        var raw;
        try { raw = storage.getItem(key); } catch (e) { return; }
        if (raw == null) return;
        try {
          found[key] = JSON.parse(raw);
        } catch (e) {
          /* A value that is not JSON AND carries the envelope family marker is
           * a sealed value from a version this build cannot read. Reporting it
           * as "broken" is the honest answer; JSON.parse would not have thrown
           * on a foreign envelope, and would have loaded the ciphertext string
           * as if it were data. */
          if (!crypto.looksSealed(raw)) broken.push(key);
        }
      });
      return { values: found, broken: broken };
    }

    /* ---- the inert path: exactly what the app did before ---- */

    function rawGet(key, fallback) {
      if (isEnabled() && crypto.isProtectedKey(key)) {
        if (!isUnlocked()) return fallback;
        return key in cache ? cache[key] : fallback;
      }
      try {
        var v = JSON.parse(storage.getItem(key));
        return v == null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    }

    function rawSet(key, value) {
      if (!(isEnabled() && crypto.isProtectedKey(key))) {
        try { storage.setItem(key, JSON.stringify(value)); } catch (e) { lastError = String(e.message || e); }
        return Promise.resolve();
      }
      if (!isUnlocked()) {
        /* Locked with data still coming in: hold it rather than drop it, and
         * never write it to disk in the clear. It is sealed on the next
         * unlock. lastError is how the app tells the user. */
        lastError = "The vault is locked; the change is held until you unlock.";
        held[key] = value;
        return Promise.resolve();
      }
      cache[key] = value;
      return enqueue(function () {
        return crypto.seal(value, { passphrase: cache.__pass, iterations: iterationsOf() }, cryptoObj)
          .then(function (envelope) {
            try { storage.setItem(key, envelope); } catch (e) { lastError = String(e.message || e); }
          });
      });
    }

    function rawRemove(key) {
      if (crypto.isProtectedKey(key)) {
        if (isUnlocked()) delete cache[key];
        /* A delete is a change too: it must not be resurrected by a held
         * write from before the lock, and it must not survive one either. */
        delete held[key];
      }
      try { storage.removeItem(key); } catch (e) {}
      return Promise.resolve();
    }

    /* ---- lifecycle ---- */

    function iterationsOf() {
      /* The record's own count, so a vault written by a build with different
       * settings still opens. Falls back to the injected default. */
      var meta = readMeta();
      return meta && Number(meta.iterations) >= 1 ? Number(meta.iterations) : iterations;
    }

    function enqueue(task) {
      queue = queue.then(task, function () {
        /* A failed write must not poison the queue for every later one. */
        return task();
      }).then(function (r) { return r; }, function (e) {
        lastError = String((e && e.message) || e);
      });
      return queue;
    }

    function flush() { return queue; }

    /* Seal anything written while the vault was locked, over the top of the
     * freshly decrypted values, and clear the held set only once each write has
     * actually landed. Called by unlock(); the mirror is already installed, so
     * this goes through the same serial queue as any other write. */
    function reapplyHeld(target, passphrase, iterations) {
      var keys = Object.keys(held);
      if (!keys.length) return Promise.resolve();
      var done = {};
      return keys.reduce(function (chain, key) {
        return chain.then(function () {
          return crypto.seal(target[key], { passphrase: passphrase, iterations: iterations }, cryptoObj)
            .then(function (envelope) {
              storage.setItem(key, envelope);
              done[key] = true;
            });
        });
      }, Promise.resolve()).then(function () {
        Object.keys(done).forEach(function (key) { delete held[key]; });
        return true;
      }, function (e) {
        /* Keep the failed ones held and visible in the mirror rather than
         * dropping them; the next unlock retries. The vault itself is open,
         * so this is a write failure, not an unlock failure. */
        keys.forEach(function (key) {
          if (!done[key]) target[key] = held[key];
        });
        lastError = "Could not save a change made while locked: " + ((e && e.message) || e);
        return false;
      });
    }

    /* Switch encryption ON. Existing plaintext is sealed in place; the vault
     * record is written LAST, so an interruption mid-way leaves the profile
     * exactly as it was - readable, unencrypted, no lockout. */
    function enable(passphrase) {
      if (isEnabled()) return Promise.resolve({ ok: false, error: "Encryption is already on." });
      if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) {
        return Promise.resolve({
          ok: false,
          error: "Use an encryption passphrase of at least " + MIN_PASSPHRASE + " characters."
        });
      }
      var scan = readPlaintext();
      if (scan.broken.length) {
        return Promise.resolve({
          ok: false,
          error: "These stored values are not readable and were left untouched: " + scan.broken.join(", ") + "."
        });
      }
      var meta;
      return crypto.newMeta(passphrase, cryptoObj, { iterations: iterations }).then(function (m) {
        meta = m;
        var keys = Object.keys(scan.values);
        return keys.reduce(function (chain, key) {
          return chain.then(function () {
            return crypto.seal(scan.values[key], { passphrase: passphrase, iterations: m.iterations }, cryptoObj)
              .then(function (envelope) {
                try { storage.setItem(key, envelope); } catch (e) { throw e; }
              });
          });
        }, Promise.resolve());
      }).then(function () {
        try { storage.setItem(crypto.META_KEY, JSON.stringify(meta)); } catch (e) {
          return { ok: false, error: "Could not save the vault record: " + (e.message || e) };
        }
        cache = scan.values;
        cache.__pass = passphrase;
        return { ok: true };
      }).catch(function (e) {
        /* Nothing is switched on unless the record was written, so the app
         * stays readable. Report the reason; do not attempt a rollback that
         * could itself lose data. */
        return { ok: false, error: "Could not turn encryption on: " + ((e && e.message) || e) };
      });
    }

    /* Switch encryption OFF. Requires the passphrase and works only from an
     * unlocked state, so the user can always read their data again without
     * typing anything they cannot type. If ANY key fails to open, nothing is
     * changed: a half-decrypted store would be worse than a locked one. */
    function disable(passphrase) {
      if (!isEnabled()) return Promise.resolve({ ok: false, error: "Encryption is not on." });
      if (!isUnlocked()) {
        return Promise.resolve({ ok: false, error: "Unlock the vault before turning encryption off." });
      }
      return unlock(passphrase).then(function (ok) {
        if (!ok) return { ok: false, error: "That passphrase does not open this vault." };
        var meta = readMeta();
        var plain = {};
        var keys = Object.keys(cache).filter(function (k) { return k !== "__pass"; });
        return keys.reduce(function (chain, key) {
          return chain.then(function () {
            return crypto.open(storage.getItem(key), { passphrase: passphrase, iterations: Number(meta.iterations) }, cryptoObj)
              .then(function (value) { plain[key] = value; });
          });
        }, Promise.resolve()).then(function () {
          Object.keys(plain).forEach(function (key) {
            try { storage.setItem(key, JSON.stringify(plain[key])); } catch (e) { throw e; }
          });
          try { storage.removeItem(crypto.META_KEY); } catch (e) {}
          cache = null;
          return { ok: true };
        });
      }).catch(function (e) {
        return { ok: false, error: "Could not turn encryption off: " + ((e && e.message) || e) };
      });
    }

    /* Decrypt every protected key into memory. The verifier decides success;
     * a key that then fails to open is a corrupt store, and the vault is left
     * LOCKED so the app cannot render half a dataset as if it were whole. */
    function unlock(passphrase) {
      if (!isEnabled()) return Promise.resolve(false);
      var meta = readMeta();
      return crypto.tryUnlock(meta, passphrase, cryptoObj).then(function (ok) {
        if (!ok) return false;
        var next = {};
        var keys = crypto.PROTECTED_KEYS;
        return keys.reduce(function (chain, key) {
          return chain.then(function () {
            var raw;
            try { raw = storage.getItem(key); } catch (e) { return; }
            if (raw == null) return;
            if (crypto.looksSealed(raw)) {
              /* Not today's envelope, or a damaged one. Either way it must not
               * become a cache value: JSON.parse would hand back the
               * ciphertext string and the view would render it as data. The
               * rejection below leaves the vault locked. */
              return crypto.open(raw, { passphrase: passphrase, iterations: Number(meta.iterations) }, cryptoObj)
                .then(function (value) { next[key] = value; });
            }
            /* Still plaintext inside an encrypted profile: a migration that did
             * not finish, or a value written by an older build. Take it as-is
             * rather than refusing to open the app. */
            try { next[key] = JSON.parse(raw); } catch (e) { next[key] = raw; }
            return;
          });
        }, Promise.resolve()).then(function () {
          /* A write made while locked is newer than anything on disk, so it
           * wins over the decrypted value before it is re-sealed. */
          Object.keys(held).forEach(function (key) { next[key] = held[key]; });
          next.__pass = passphrase;
          cache = next;
          /* Writes that arrived while the vault was locked were held aside.
           * Seal them now, or the last thing the user did before locking would
           * silently vanish. */
          return reapplyHeld(next, passphrase, Number(meta.iterations)).then(function () {
            return true; /* the vault is open; a write failure is reported via lastError */
          });
        });
      }).catch(function (e) {
        cache = null;
        lastError = String((e && e.message) || e);
        return false;
      });
    }

    /* Drop the mirror. Resolves only once the write queue has drained, so a
     * lock is never the thing that loses the user's last save. `held` survives
     * on purpose - those writes are only in memory anywhere, and the next
     * unlock seals them. */
    function lock() {
      return queue.then(function () {
        cache = null;
        return true;
      });
    }

    /* A fresh passphrase re-seals everything under a new salt. Refuses unless
     * the current passphrase is right, so this cannot be used to lock a user
     * out of their own data. */
    function changePassphrase(current, next) {
      if (!isEnabled()) return Promise.resolve({ ok: false, error: "Encryption is not on." });
      if (typeof next !== "string" || next.length < MIN_PASSPHRASE) {
        return Promise.resolve({
          ok: false,
          error: "Use an encryption passphrase of at least " + MIN_PASSPHRASE + " characters."
        });
      }
      var meta = readMeta();
      return crypto.tryUnlock(meta, current, cryptoObj).then(function (ok) {
        if (!ok) return { ok: false, error: "That is not the current passphrase." };
        return crypto.newMeta(next, cryptoObj, { iterations: iterations }).then(function (m) {
          var keys = Object.keys(cache).filter(function (k) { return k !== "__pass"; });
          return keys.reduce(function (chain, key) {
            return chain.then(function () {
              return crypto.seal(cache[key], { passphrase: next, iterations: m.iterations }, cryptoObj)
                .then(function (envelope) { storage.setItem(key, envelope); });
            });
          }, Promise.resolve()).then(function () {
            storage.setItem(crypto.META_KEY, JSON.stringify(m));
            cache.__pass = next;
            return { ok: true };
          });
        });
      }).catch(function (e) {
        return { ok: false, error: "Could not change the passphrase: " + ((e && e.message) || e) };
      });
    }

    return {
      MIN_PASSPHRASE: MIN_PASSPHRASE,
      isEnabled: isEnabled,
      isUnlocked: isUnlocked,
      get: rawGet,
      set: rawSet,
      remove: rawRemove,
      enable: enable,
      disable: disable,
      unlock: unlock,
      lock: lock,
      flush: flush,
      changePassphrase: changePassphrase,
      readMeta: readMeta,
      readPlaintext: readPlaintext,
      lastError: function () { return lastError; }
    };
  }

  return { create: create, MIN_PASSPHRASE: MIN_PASSPHRASE };
});
