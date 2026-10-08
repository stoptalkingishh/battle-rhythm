# Handoff: Google Drive backup reworked (PKCE)

**Date:** 2026-10-08
**Branch:** `main` · **HEAD:** `6a999cf` · **Status:** CI green, deployed to GitHub Pages, verified live
**Live site:** https://stoptalkingishh.github.io/battle-rhythm/

---

## What changed

Two features were removed and Drive sign-in was reworked. Two commits, both deployed.

| Commit | Scope |
|---|---|
| `d85c58e` | Removed master password + local encryption vault; moved sign-in to PKCE; added deploy-time credential injection |
| `6a999cf` | Fixed the PKCE state check that made every sign-in fail |

### Removed: master password
`hashPw` / `hasPassword` / `passwordMatches` / `requirePassword` / `pendingAuth` / `showPw`, the
`#pw-modal` prompt, and the Settings password fields. The Builder no longer gates session saves behind
a prompt — saving is immediate. `pwHash` was removed from the export deny-list, so `br_settings` is now
just scalars.

### Removed: local encryption vault
Deleted `js/vault.js`, `js/data/crypto-vault.js`, `docs/security.md`, and three test files
(`vault-wiring`, `crypto-vault`, `crypto-vault-store`). `store()` / `load()` / `unstore()` in
`js/app.js` are plain `localStorage` again. The `#vault-modal` unlock gate and the Settings encryption
panel are gone, and `init()` no longer short-circuits behind an unlock.

> **Known data loss, deliberate.** Anyone who had encryption enabled before this change still has sealed
> ciphertext in their browser that nothing can decrypt. There is no migration and no recovery path. This
> was a conscious choice to match the `openquiz` sibling, which stores plaintext and relies on Drive.

### Changed: sign-in is now Authorization Code + PKCE
Ported from the sibling repo's `app/lib/googlePkce.ts`. Replaces the Google Identity Services
`initTokenClient` implicit flow.

Why: the implicit flow returns a ~1 hour access token and **no refresh token**, and renewed off Google's
browser session cookie. In practice Drive sync stopped after about an hour and looked to the user like
being silently signed out. PKCE with `access_type=offline` yields a refresh token, which decouples
persistence from that session.

- No client secret anywhere. This is a browser-only public client; PKCE supplies the protection a secret
  would provide, and a secret in a public page would be readable by anyone.
- The GIS script is no longer loaded. Only the Drive client library (`apis.google.com/js/api.js`).
- Sign-in is a full-page redirect, not a popup. `signInToDrive()` returns a promise that normally never
  settles, because the document is replaced. `restoreDriveSession()` calls
  `completeSignInFromRedirect()` on load to finish the exchange.
- Refresh token stored at `localStorage["brdrive:refresh_token"]`. The access token is memory-only;
  `accessToken()` mints a new one when within 60s of expiry.
- `signOutFromDrive()` clears the refresh token.

### Changed: credentials are injected at deploy time
`js/config.js` is committed **empty** and must stay that way — `scripts/check-config.mjs` fails CI
otherwise. New `scripts/write-config.mjs` writes a populated copy into the published artifact from two
repo secrets, so credentials never enter git history.

| Secret | Value |
|---|---|
| `BR_GOOGLE_CLIENT_ID` | `675132980388-ss7orii1cfqn8ra9j778k1orn8id81cp.apps.googleusercontent.com` |
| `BR_GOOGLE_API_KEY` | API key restricted to the Drive API and this site's referrer |

Both are set on the repo. Both verified present in the live `config.js`.

---

## The bug worth knowing about

The first end-to-end sign-in test failed at the very last step with *"Sign-in could not be verified"*,
even though Google had completed the handshake correctly and redirected back with a valid code.

In `consumeVerifier`, the state was deleted and **then** read back to compare:

```js
sessionDel(STATE_PREFIX + state);                              // deleted first
return sessionGet(STATE_PREFIX + state) === state ? ... : null; // always null === state
```

So the check that gates the token exchange rejected every callback. Fixed in `6a999cf` by reading before
deleting. The cleanup still runs on every path, so a reload cannot replay a consumed code.

`tests/drive-pkce.test.js` runs `js/drive.js` in a `vm` with a stubbed browser surface. **The regression
test was verified to fail against the old code and pass against the fix.** If you touch the PKCE
bookkeeping, that test is the guard.

---

## Google Cloud configuration (project `overfly`)

OAuth client, type **Web application**:

- **Authorized JavaScript origins:** `https://stoptalkingishh.github.io`
- **Authorized redirect URIs:** `https://stoptalkingishh.github.io/battle-rhythm/`

The redirect URI is required by the PKCE flow and was **not** present before this work. The trailing
slash matters; the value must match `location.origin + location.pathname` exactly. A missing or
mismatched entry fails with `redirect_uri_mismatch`.

API key: restricted to the Google Drive API, and to website referrer
`https://stoptalkingishh.github.io/battle-rhythm/*`.

---

## Verification state

**Confirmed working, live:**
- Deployed `config.js` carries a populated client id and a valid `AIza...` key
- `isDriveConfigured()` true at runtime; "Continue with Google" renders
- PKCE auth URL correct on the wire: `response_type=code`, `code_challenge_method=S256`,
  `access_type=offline`, correct `redirect_uri`
- Google accepts the client and the redirect URI — reached the account chooser with no
  `redirect_uri_mismatch`
- `drive.js` v44 served, fix present
- `js/vault.js` and `js/data/crypto-vault.js` both 404
- 482 unit tests pass, 7 browser E2E pass, syntax check clean, cache-buster consistent

**NOT yet verified — this is the open item:**
- Completing a full sign-in round trip. Both attempts were interrupted before the consent screen was
  approved, so the token exchange has never been observed succeeding end to end.
- Therefore also unverified: the refresh token landing in `localStorage`, the session restoring as
  signed in, and a save actually writing a file to Drive.

### How to finish verifying

1. Open https://stoptalkingishh.github.io/battle-rhythm/ → Settings → Continue with Google.
2. Approve consent. An **unverified app** warning is expected while the consent screen is in Testing.
3. Confirm the redirect lands back on `/battle-rhythm/` with **no query string** left over.
4. Check `localStorage["brdrive:refresh_token"]` exists.
5. Settings should show the signed-in user with a Sign out button, not the sign-in button.
6. Log a weigh-in or save a session, then confirm a file appears in the "Battle Rhythm" Drive folder.

If sign-in succeeds but Drive file writes fail with 401/403, that is the **API key referrer
restriction**, not a code fault. The key is restricted to `https://stoptalkingishh.github.io/battle-rhythm/*`,
so any other origin (including `localhost`) will fail file calls while sign-in still works. That
asymmetry is confusing when it happens.

---

## Two loose ends

**Client secret.** A client secret was pasted into chat and is public. It is not used by this app and
not present in the repo or the bundle — after the PKCE rewrite there is no secret to use. Rotating it is
cleanup, not an emergency. Note that rotating does **not** revoke already-issued tokens; to drop existing
grants the user removes access at https://myaccount.google.com/permissions.

**Testing mode.** The consent screen is in Testing, so only listed test users can sign in, and Google
expires refresh tokens after 7 days. Publishing the consent screen to Production removes both limits.
Neither is a code issue.

---

## Conventions for the next change

- **Cache-buster is mandatory.** Every local asset in `index.html` carries `?v=battle-rhythm-N`. Bump
  **every** tag in the same commit, not just the one you touched. Mismatched tags let a warm cache pair a
  new `app.js` with an old `sync-core.js`, which fails at runtime. `scripts/check-cache-buster.mjs` runs in
  CI. Currently **v44**.
- **Checks:** `npm test`, `npm run check`, `node scripts/check-cache-buster.mjs`,
  `node scripts/check-config.mjs`, `npm run test:e2e`.
- No build step. `index.html` script tags are the deployment spec.
- The deploy job stages an explicit whitelist (`index.html assets css js`), never `cp -R .`, because the
  repo also holds source-only material that must not be published.

## Commands

```powershell
cd "C:\Users\Ismael\Documents\Default Project\battle-rhythm"
npm test
npm run check
node scripts/check-cache-buster.mjs
node scripts/check-config.mjs
npm run test:e2e
git log --oneline -5
gh run list -R stoptalkingishh/battle-rhythm --limit 3
```

After changing Google secrets, re-run the deploy workflow. `--failed` will not work since nothing fails;
use **Re-run all jobs**.