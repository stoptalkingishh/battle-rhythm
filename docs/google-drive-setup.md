# Google Drive backup — self-service setup

Battle Rhythm runs entirely in your browser and stores everything in `localStorage`
on the device you use it on. Google Drive backup is **optional**: it adds a
durable copy in your own Google Drive folder called `Battle Rhythm`, so your
sessions, regiments, logs, weigh-ins and AFT results follow you to another
device.

If you never complete this guide, nothing is lost and nothing is broken. The app
never shows a sign-in prompt you did not ask for.

There is one thing this guide cannot avoid: **you need your own Google Cloud
project.** Battle Rhythm ships no credentials of its own, by design — see
[Why the app has no keys of its own](#why-the-app-has-no-keys-of-its-own). The
app cannot create a Google Cloud project for you; only you can, with your Google
account. Everything after that — validating what you paste, storing it, opening
the sign-in popup, and telling you precisely which step went wrong — the app does
itself.

---

## Quick version

1. Open Battle Rhythm → **Settings** → **Set up Google Drive**.
2. The panel shows your page's exact address. Copy it.
3. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials):
   create a project, enable the **Google Drive API**, create an **OAuth client ID
   of type "Web application"**, add your copied address to **Authorized
   JavaScript origins**, and create an **API key**.
4. Paste the Client ID and the API key into the two fields in Settings.
5. **Save and connect**, then finish the Google popup.

The panel stays open and validates each value as you paste, so a typo is caught
before Google ever sees it. The expanded "Show all setup steps" section inside
the panel has clickable links to the exact console pages.

---

## Full walkthrough

### 1. Get to the setup panel

Open Battle Rhythm, choose **Settings**, scroll to **Google Drive backup**, and
press **Set up Google Drive**.

The panel is the same as the "Show all setup steps" section below, with the
origin and the paste fields already filled in for your browser.

### 2. Note your page's address

The panel shows, in a read-only box with a **Copy** button, the exact string
Google needs — for example:

```text
https://stoptalkingishh.github.io
```

Copy it now. This is the single most error-prone value in the whole setup, and
it is why the app renders it instead of describing it.

Rules for this value:

- **Scheme + host only.** No trailing slash, no `/index.html`, no query string.
  `https://example.com` is right; `https://example.com/` and
  `https://example.com/index.html` are both rejected by Google.
- **Include the port when there is one.** Running a local dev server on port
  8000 means the value is `http://localhost:8000`.
- **Google only accepts HTTPS origins for sign-in.** An `http://localhost:…`
  value may work in some browsers and fail in others. The hosted site is the
  reliable option; localhost is fine for development.
- **Opening the app from a `file://` path will not work at all.** There is no
  origin for Google to authorize. If the box says so, serve the folder over HTTP
  instead:

  ```bash
  # from the folder containing index.html
  python -m http.server 8000
  # then open http://localhost:8000
  ```

  (or `npx serve .`)

### 3. Create or pick a Google Cloud project

Open the [project picker](https://console.cloud.google.com/projectcreate) and
sign in with any Google account.

- If a project is already selected, keep it. The Drive API and the credentials
  you create next all belong to whichever project is selected at the top of the
  page — this is the most common reason "it works for them but not for me".
- If the list is empty, click **New Project**, give it any name (for example
  `Battle Rhythm`), and create it.

**No billing account is required.** The Google Drive API is free, and the app
never calls a paid API. You do not need to add a card.

### 4. Enable the Google Drive API

Open the [Google Drive API page](https://console.cloud.google.com/apis/library/google-drive-api).

Confirm the project you just made is selected, then press **Enable**. If it is
already on, the button reads **Manage** — nothing to do.

Skip this and sign-in fails later with *"Google Drive API has not been used in
project … or it is disabled"*. The app recognises that exact message and tells
you so, but it is faster to just enable it now.

### 5. Create the OAuth client ID

On the [Credentials page](https://console.cloud.google.com/apis/credentials),
choose **Create credentials → OAuth client ID**.

**Application type must be "Web application".** Choosing "Desktop app" or
"iOS" produces a client ID that Google refuses for a browser sign-in — the app
reports this as `unauthorized_client` and says exactly that.

Leave **Authorized redirect URIs** empty. The app uses a popup-based token flow
and never performs a redirect.

### 6. Add your origin to Authorized JavaScript origins

Still in the client you just created, find **Authorized JavaScript origins**,
click **Add URI**, and paste the address you copied in step 2.

Press **Create** to save the client. Google sometimes takes a minute or two to
propagate a new origin; if sign-in immediately afterwards reports
`origin_mismatch`, wait a moment and retry before changing anything.

### 7. Create the API key

Back on the [Credentials page](https://console.cloud.google.com/apis/credentials),
choose **Create credentials → API key**, then copy it.

Recommended: click **Edit** on the key and restrict it.

- **API restrictions:** keep only **Google Drive API**.
- **Application restrictions → Websites:** add the same origin from step 2.

The key is a **quota and rate-limit control, not a lock.** It is a public
client-side identifier by design (see below), so anyone can read it from the
page source. Your data stays private because access is granted by *you* at
sign-in, and the app requests only the `drive.file` scope — which reaches only
files this app creates, and nothing else in your Drive. Restricting the key is
still worth doing: it stops someone else spending your quota.

### 8. Publish the consent screen, if Google asks

Visit the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).

If it says **Testing**, Google only lets *listed test users* sign in, and
everyone else gets `access_denied`. Either:

- add yourself under **Test users**, or
- choose **Publish app**.

There is nothing to verify. The app has no server, so the only scopes it requests
are your email address, your name and profile picture, and `drive.file`. Google's
unverified-app warning screen is expected and safe: the data goes straight to
the browser and into your own Drive.

### 9. Paste both values into Settings

Back in Battle Rhythm's Settings panel:

- **OAuth 2.0 Client ID** — looks like
  `123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com`
- **API key** — looks like `AIzaSy…` and is 39 characters

Both fields validate as you type. The common mistakes are caught immediately with
a specific message rather than being sent to Google:

| What you pasted | What the app says |
| --- | --- |
| An API key in the Client ID field | "That is an API key, not a Client ID." |
| A Client ID in the API key field | "That is a Client ID, not an API key." |
| A console URL instead of the ID | "That is a link, not a Client ID." |
| A truncated paste | "That does not look like a Client ID…" |
| A copy with a line break in it | Normalised automatically; inner spaces are rejected by name |

Press **Save and connect**. The values are stored in this browser's
`localStorage` under `brdrive:credentials`. They are **never written into the
app's source code and never committed to the repository.**

### 10. Finish the Google popup

A Google sign-in popup opens. Finish it without closing the window. On success
the Settings section shows your name and avatar, and backups start flowing into
your Drive folder.

---

## After setup

- **Where the data lives:** a folder named `Battle Rhythm` in your Drive, as
  plain JSON files (`sessions.json`, `regiments.json`, `tracker.json`, …).
- **Signing out** keeps your outbox queued on the device, so nothing is lost.
- **Removing keys** (the *Remove keys* button, next to *Sign out*) returns the
  app to guest mode and deletes the stored values from this browser. Sign out
  first; the app refuses to remove keys while a Drive session is live so it
  cannot strand one.
- **Other devices:** run steps 1–10 again on each device. Use the same Google
  account and you will see the same Drive folder.
- **The master password** is never synced. It stays local to each device.

---

## Troubleshooting

Every failure below has its own message in the app. Find your message in the
left column; the app names the step, because the console is where the fix
happens.

| What the app says | What it means | Fix |
| --- | --- | --- |
| **This page's address is not on the OAuth client** (`origin_mismatch`) | The origin is missing or misspelled in Authorized JavaScript origins. | Step 6. Copy the address from the Settings panel again — no trailing slash, no path. |
| **The Google Drive API is not enabled** (`api_disabled`) | The API is off for the project the key belongs to. | Step 4. Also confirm the API key and OAuth client belong to the *same* project. |
| **The API key was rejected** (`bad_api_key`) | Truncated paste, a key from a different project, or a key restricted to another referrer. | Step 7. Copy the key again; lift the website restriction while testing. |
| **The API key is not allowed from this page** (`referrerNotAllowed`) | The key's website restriction does not include this origin. | Step 7, *Application restrictions*. |
| **Google did not grant access** (`access_denied`) | You declined, or the consent screen is in Testing and you are not a test user. | Step 8. |
| **The OAuth client is not allowed to sign in** (`unauthorized_client`) | The client is Desktop/iOS type, or its origins are wrong. | Steps 5 and 6. |
| **The Client ID is not valid** (`invalid_client`) | Truncated or stale paste, or the client was deleted in the console. | Copy it again, or create a new client. |
| **The requested permission is not available** (`invalid_scope`) | The Drive API is not enabled for the client's project. | Step 4. |
| **The Drive session expired** (`expired_session`) | The saved access token aged out. | Sign in again. Nothing on the device is lost. |
| **The sign-in popup was blocked** (`popup_blocked`) | The browser blocked it. | Allow pop-ups for this site, then retry. |
| **Google's sign-in script did not load** (`blocked_script`) | An ad blocker, privacy extension, or firewall is blocking `accounts.google.com` or `apis.google.com`. | Allow both domains for this page and reload. |
| **No connection to Google** (`offline`) | The request never completed. | Reconnect. Queued changes sync on the next save. |
| **Too many requests** / **quota exhausted** (`quota`) | The key is rate-limited. | Wait a minute and press *Sync now*. |
| **The API key's quota is exhausted** | Often a key shared with another app. | Create a fresh key restricted to the Drive API. |
| **Google refused the request** (403) | Consent screen not published, key restricted away from this origin, or no write permission on the file. | Check steps 7 and 8, then sign out and back in. |
| **The Drive file could not be found** (404) | The saved file id points at a deleted or moved file. | Nothing to do — the next save recreates it. |
| **Google had a server error** (5xx) | Google's side. | Retry. Changes stay queued on the device. |
| **The browser is blocking local storage** | The values cannot be saved. | Allow site data for this page, or put the values in `js/config.js` instead. |
| **The browser refused to save these values** | Private browsing, or a full quota. | Guest mode still works without Drive. |

If a failure is not on this list, the app shows Google's own wording rather than
hiding it. That is a bug worth reporting — please include the exact text.

---

## Why the app has no keys of its own

Battle Rhythm could ship a public OAuth client so nobody has to visit the
console. It deliberately does not:

- **A shared client id is a shared reputation.** Google marks OAuth clients used
  by many unrelated projects as *unverified* or *suspicious*, and can restrict
  them. Every user of a third-party app would inherit the maintainer's quota and
  verification state.
- **A shared key is a shared quota.** The API key would be readable in the page
  source by everyone, and every install would spend the same daily quota.
- **Blast radius.** A compromised or revoked shared client would break Drive
  backup for all users at once, with no way for an individual to fix it.
- **Consent clarity.** Each user sees a consent screen attached to *their own*
  project, so what is being granted is unambiguous.

The two values are **public client-side identifiers, not secrets**:

- The OAuth client ID is embedded in every page that uses it and confers no
  access on its own.
- The API key is a rate-limit control, not an access control. Data access is
  granted by the signed-in user and limited to the `drive.file` scope.

So storing them per-browser changes nothing about the security model. What it
buys is that the repository never contains anyone's credentials —
`npm run check:config` enforces that and fails the build if it does.

---

## For maintainers: shipping credentials on a build instead

If you self-host Battle Rhythm and want Drive backup on with no setup for your
users, put the two values in `js/config.js`:

```js
window.BR_GOOGLE_CLIENT_ID = "123456789012-….apps.googleusercontent.com";
window.BR_GOOGLE_API_KEY = "AIza…";
```

`js/config.js` is tracked, so do **not** commit that. Add it to
`.git/info/exclude` (local, uncommitted ignore) or to `.gitignore` if you fork,
and run `npm run bump:bust` so the browser picks the change up.

A build with populated `js/config.js` takes priority over anything the user
saved in their own browser, so nobody's local paste can override a deliberate
build configuration.

`js/config.js.example` documents both shapes in full.

---

## See also

- `README.md` — the sync architecture: outbox, reconcile-before-overwrite, and
  what is and is not synced.
- `js/data/drive-setup.js` — the validation, origin and error-message logic
  behind the Settings panel, unit-tested in `tests/drive-setup.test.js`.
- `js/credentials.js` — per-browser credential storage and validation.
- `scripts/check-config.mjs` — the guard that keeps credentials out of git.
