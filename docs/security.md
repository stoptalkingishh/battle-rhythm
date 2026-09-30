# Local encryption of stored data (issue #16)

Battle Rhythm stores everything in `localStorage`. It is optional to encrypt that
payload at rest, so that someone who obtains the browser profile cannot read
the training data without a passphrase.

This document exists because the feature's value is entirely in its limits. A
vague "your data is encrypted" claim on a page that holds the key in memory
would be worse than no feature at all.

## Decision: in scope, implemented

The issue asked for an explicit decision. Encryption is implemented, opt-in, and
off by default.

## What it does

- **At rest.** Every user collection (`br_sessions`, `br_regiments`,
  `br_tracker`, `br_aft_results`, `br_bodyweight`, `br_groups`,
  `br_custom_exercises`, `br_settings`, `br_week`, `br_bw_goal`) is stored as an
  AES-GCM-256 envelope: `br-enc-v1:<b64 salt>:<b64 iv>:<b64 ciphertext>`.
- **Key derivation.** PBKDF2-HMAC-SHA256, 310,000 iterations, a fresh random
  16-byte salt per vault, a fresh random 96-bit IV on every single encryption.
- **Authentication.** AES-GCM, so a tampered value is rejected rather than
  decrypted to garbage.
- **No stored secrets.** The passphrase is never written anywhere, and no key
  material is stored. The vault record holds the KDF parameters, the salt, and
  a *sealed verifier* — a fixed public string encrypted under the derived key,
  not a password hash. A wrong passphrase fails GCM authentication.

## What it does not do

This is the part that matters.

- **It does not protect against anything running on this origin.** An XSS
  payload in the page can read the derived `CryptoKey` while the app is open,
  and can read plaintext values as they pass through. Client-side encryption
  cannot fix this; only a server holding the key could.
- **It does not protect against a compromised OS, a malicious browser
  extension, or a keylogger.** Anything that can read the process memory has the
  key.
- **It does not protect against someone looking over your shoulder** while you
  type the passphrase.
- **The key lives in memory for the whole session.** It is a non-extractable
  `CryptoKey` in the vault's in-memory mirror; it is never written to disk, but
  it is also not destroyed until the tab closes or the vault is locked.

So: this raises the cost of *offline* access to the stored bytes. It is not a
sandbox and it is not a defence against a compromised page.

## Recovery: there is none, by design

**A forgotten passphrase means the data is permanently unreadable.** AES-GCM is
authenticated, the key is derived only from the passphrase, and no escrow copy,
hint key, or reset path exists anywhere in the codebase. This is deliberate:

- A "recovery key" is a second secret in a second place, which is a weaker
  guarantee than one secret stated honestly.
- A passphrase hint is a well-understood way to make weak passphrases usable.
- A server-side reset would mean a server, which this project does not have and
  does not want.

The app says this in the UI before the user opts in, and again on the unlock
gate. `tests/crypto-vault-store.test.js` asserts that a forgotten passphrase
leaves the data untouched and unreadable rather than triggering a reset, so a
future "helpful" recovery path cannot be added silently.

**The only backup is the app's own JSON export** (Settings → Export all data).
That file is unencrypted, so it is the thing to keep off the shared machine. A
user who enables encryption without having an export is one lost passphrase away
from losing everything, and the confirmation dialog says so.

## Guest mode is unchanged

With no vault record on disk — which is the state of every existing install —
`js/vault.js` is a pass-through to `localStorage` and nothing about the app's
behaviour changes. Encryption is never switched on by writing data; a user has
to choose it. No account, network call, or credential is involved, and
`js/config.js` still ships with empty Google credentials.

## Design notes worth knowing before changing this

- **`js/data/crypto-vault.js` is pure** (no DOM, no storage, no `Date`), takes
  the WebCrypto object as an argument, and is unit-tested in Node. The
  `iterations` default lives in the module's closure, so tests that need a lower
  work factor must pass it explicitly — assigning to the exported
  `DEFAULT_ITERATIONS` does nothing at all.
- **`js/vault.js` is the impure half** and is where the app's synchronous
  `store()`/`load()` contract is reconciled with asynchronous WebCrypto: it
  holds a decrypted in-memory mirror, unlocked once, and `store()` seals onto a
  serialised write queue. `lock()` awaits that queue so the last save is not
  what gets dropped.
- **Bookkeeping keys stay in the clear** — `brsync_*`, `brdrive:*`,
  `br_timer_state:*`, `br_presets_hidden`, `br_tracker_active`. They are read
  directly by `js/cloud.js`, `js/drive.js` and `js/timer.js` with no passphrase
  in scope, they hold no training data, and sealing them would break Drive sync
  and reload recovery. `isProtectedKey()` is the single place that decides, and
  a test pins both halves of the list.
- **Write durability is best-effort.** Sealing is async and a browser will not
  wait for it during unload. `flush()` is wired to `pagehide`, which narrows the
  window but does not close it.
- **The existing master password is untouched.** It still gates builder edits
  with its existing weak hash in `br_settings`; the encryption passphrase is
  separate and never compared against it.

## Open questions for the maintainer

- The app is a static site with no server, so the "same-origin XSS" limit above
  is structural. If that matters enough to fix properly, it needs a server-held
  key, which is a different project.
- `br_settings` holds the master-password hash, which is weak (a 32-bit djb2
  variant, and its length). It is now encrypted at rest when the vault is on,
  but that is confidentiality, not strength. Tightening it is separate work.