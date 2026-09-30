"use strict";
/* Pure helpers for the self-service Google Drive setup flow.
 *
 * Three jobs, all side-effect-free so they can be unit-tested with node:test
 * (see tests/drive-setup.test.js):
 *
 *   1. VALIDATING what the user pasted into Settings. A client id or API key
 *      that is subtly wrong is the single most common way this feature dies
 *      quietly, so the shapes are checked before anything is stored.
 *   2. COMPUTING the exact string the user has to add to the OAuth client's
 *      "Authorized JavaScript origins" — a trailing slash or a /path/ suffix
 *      makes Google reject the sign-in with origin_mismatch.
 *   3. TRANSLATING a Google/gapi error into one specific, actionable sentence.
 *      Every branch gets its own message; there is no "something went wrong"
 *      fallback that hides which step failed.
 *
 * Nothing here touches window, document, fetch or localStorage. The origin is
 * passed in by the caller (index.html passes window.location) so this stays
 * testable in Node. Loads as window.BR_DRIVE_SETUP in the browser and as a
 * CommonJS module in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BR_DRIVE_SETUP = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* Google OAuth client ids look like:
   *   1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
   * The project number prefix and the 32-char client secret-looking suffix are
   * both fixed-length, so a loose match would still catch a pasted URL or an
   * "API key" pasted into the wrong box. */
  var CLIENT_ID_RE = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

  /* API keys are AIza followed by 35 URL-safe base64 chars. */
  var API_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;

  /* Where the guided setup lives. Kept in one place so the Settings panel and
   * the docs can never disagree about the link they send the user to. */
  var DOCS_URL = "docs/google-drive-setup.md";
  var DOCS_BLOB_ROOT = "https://github.com/stoptalkingishh/battle-rhythm/blob/main/";
  var CONSOLE_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";
  var CONSOLE_DRIVE_API_URL = "https://console.cloud.google.com/apis/library/google-drive-api";
  var CONSOLE_CONSENT_URL = "https://console.cloud.google.com/apis/credentials/consent";

  /* ---------------------------------------------------------------- *
   * Credential validation
   * ---------------------------------------------------------------- */

  function asString(value) {
    if (typeof value !== "string") return "";
    /* Users paste from a console table, so a stray newline or a smart quote
     * is routine. Trim whitespace and normalise the quotes a phone keyboard
     * turns them into before validating — but never silently "fix" anything
     * that would change the credential itself. */
    return value
      .replace(/[‘’“”]/g, "")
      .replace(/[\r\n\t]+/g, "")
      .trim();
  }

  /* Returns { ok, code, message, value }. code is stable and testable; message
   * is what the Settings panel shows under the field. */
  function validateClientId(value) {
    var id = asString(value);
    if (!id) {
      return {
        ok: false,
        code: "empty",
        value: "",
        message: "Paste the OAuth 2.0 Client ID (it ends in .apps.googleusercontent.com)."
      };
    }
    if (/\s/.test(id)) {
      return {
        ok: false,
        code: "whitespace",
        value: id,
        message: "That value contains a space. Copy the Client ID again — the console table copies it in one piece."
      };
    }
    if (/^AIza/.test(id)) {
      return {
        ok: false,
        code: "wrong-value",
        value: id,
        message: "That is an API key, not a Client ID. Use the Client ID from the same page, or move this value to the API key field."
      };
    }
    if (/^https?:\/\//i.test(id)) {
      return {
        ok: false,
        code: "url",
        value: id,
        message: "That is a link, not a Client ID. The Client ID is the long text starting with your project number, ending in .apps.googleusercontent.com."
      };
    }
    if (!CLIENT_ID_RE.test(id)) {
      return {
        ok: false,
        code: "malformed",
        value: id,
        message: "That does not look like a Client ID. It should be your project number, a hyphen, then more characters, ending in .apps.googleusercontent.com."
      };
    }
    return { ok: true, code: "ok", value: id, message: "" };
  }

  function validateApiKey(value) {
    var key = asString(value);
    if (!key) {
      return {
        ok: false,
        code: "empty",
        value: "",
        message: "Paste the API key (it starts with AIza)."
      };
    }
    if (/\s/.test(key)) {
      return {
        ok: false,
        code: "whitespace",
        value: key,
        message: "That value contains a space. Copy the API key again from Credentials > your key > Edit."
      };
    }
    if (/\.apps\.googleusercontent\.com$/.test(key)) {
      return {
        ok: false,
        code: "wrong-value",
        value: key,
        message: "That is a Client ID, not an API key. Use the API key from the same page, or move this value to the Client ID field."
      };
    }
    if (!API_KEY_RE.test(key)) {
      return {
        ok: false,
        code: "malformed",
        value: key,
        message: "That does not look like an API key. It starts with AIza and is 39 characters long."
      };
    }
    return { ok: true, code: "ok", value: key, message: "" };
  }

  /* ---------------------------------------------------------------- *
   * The authorized origin string
   * ---------------------------------------------------------------- */

  /* Google matches "Authorized JavaScript origins" on scheme + host + port
   * only, with no trailing slash and no path. Derive exactly that from a
   * location-like object. Returns "" for a file:// or otherwise unusable
   * origin, so the UI can say "this will not work locally" instead of
   * printing an origin Google would reject. */
  function authorizedOrigin(locationLike) {
    if (!locationLike) return "";
    var protocol = locationLike.protocol || "";
    if (protocol !== "https:" && protocol !== "http:") return "";
    var host = locationLike.host || "";
    if (!host) return "";
    return protocol + "//" + host;
  }

  /* A plain-English note about where the user is running, because the same
   * credentials behave differently on GitHub Pages vs a local file:// open. */
  function originAdvice(locationLike) {
    var origin = authorizedOrigin(locationLike);
    if (!origin) {
      return {
        origin: "",
        ok: false,
        message: "This page was opened from a file:// URL, so it has no origin Google will accept. Serve the folder over http (for example `npx serve .` or `python -m http.server 8000`) and reopen it, then add that address to Authorized JavaScript origins."
      };
    }
    if (origin.indexOf("http://") === 0) {
      return {
        origin: origin,
        ok: true,
        message: "Add " + origin + " to Authorized JavaScript origins exactly as written — no trailing slash, no /index.html. Google only accepts HTTPS origins for sign-in, so this will work locally in some browsers and fail in others; the hosted site is the reliable option."
      };
    }
    return {
      origin: origin,
      ok: true,
      message: "Add " + origin + " to Authorized JavaScript origins exactly as written — no trailing slash, no /index.html."
    };
  }

  /* ---------------------------------------------------------------- *
   * The guided steps
   * ---------------------------------------------------------------- */

  /* The console work cannot be done by the app: it needs a Google account, a
   * project, and the user's own OAuth client. What the app does own is
   * everything after that, and the steps are ordered so the two values the
   * user has to paste into Settings are the only things they need to keep. */
  function setupSteps(context) {
    var ctx = context || {};
    var origin = ctx.origin || "";
    return [
      {
        id: "project",
        title: "Open the Google Cloud console and pick a project",
        detail: "Sign in to any Google account. If the project picker is empty, click New Project, name it anything (for example Battle Rhythm), and create it. No billing is needed and the Drive API is free.",
        url: "https://console.cloud.google.com/projectcreate",
        linkLabel: "Open the project picker"
      },
      {
        id: "enable-api",
        title: "Turn on the Google Drive API for that project",
        detail: "Confirm the project selected at the top of the page is the one you just made, then Enable. The button reads Manage instead if it is already on. Skip this and sign-in later fails with \"Google Drive API has not been used in project … before or it is disabled\".",
        url: CONSOLE_DRIVE_API_URL,
        linkLabel: "Open the Drive API page"
      },
      {
        id: "oauth-client",
        title: "Create an OAuth client ID of type \"Web application\"",
        detail: "On the Credentials page choose Create credentials > OAuth client ID. Application type must be Web application — \"Desktop app\" and \"iOS\" produce a client id Google rejects for a browser sign-in.",
        url: CONSOLE_CREDENTIALS_URL,
        linkLabel: "Open Credentials"
      },
      {
        id: "authorized-origin",
        title: "Add this page's origin to Authorized JavaScript origins",
        detail: origin
          ? "In the client you just created, under Authorized JavaScript origins click Add URI and paste exactly: " + origin + "  (no trailing slash, no path). This is the step that causes origin_mismatch when it is wrong."
          : "Add this page's origin under Authorized JavaScript origins. This page has no usable origin, so open it over http(s) first to see the exact value.",
        url: CONSOLE_CREDENTIALS_URL,
        linkLabel: "Open the client you just created",
        copy: origin || ""
      },
      {
        id: "api-key",
        title: "Create an API key",
        detail: "Back on the Credentials page choose Create credentials > API key, then copy it. Optional but recommended: Edit the key, restrict it to the Google Drive API and to the origin above. The key is a quota control, not a lock — your data stays private because the app only asks for the drive.file scope, which reaches only files this app creates.",
        url: CONSOLE_CREDENTIALS_URL,
        linkLabel: "Open Credentials"
      },
      {
        id: "consent-screen",
        title: "Publish the consent screen if Google asks you to",
        detail: "If the OAuth consent screen is in \"Testing\" status, Google only lets listed test users sign in, and the popup reports access_denied. Either add yourself under Test users, or choose Publish app. The app has no server and no verification steps — it only asks for your email and drive.file.",
        url: CONSOLE_CONSENT_URL,
        linkLabel: "Check the consent screen"
      },
      {
        id: "paste",
        title: "Paste both values into Settings > Google Drive backup",
        detail: "Back in Battle Rhythm, open Settings, paste the Client ID and the API key into the fields, and choose Save and connect. Both values stay in this browser only — they are never written to the app's code and never leave your device except to Google's own endpoints.",
        url: "",
        linkLabel: ""
      }
    ];
  }

  /* ---------------------------------------------------------------- *
   * Error translation
   * ---------------------------------------------------------------- */

  /* Pull a reason string out of the several shapes gapi and Google Identity
   * Services use. gapi wraps failures as
   *   { status: 403, result: { error: { code, message, errors: [{ reason }] } } }
   * and GIS reports OAuth errors as { error: "origin_mismatch", ... }. */
  function reasonsFor(error) {
    var out = [];
    if (!error) return out;
    if (typeof error === "string") {
      out.push(error);
      return out;
    }
    if (error.error) out.push(String(error.error));
    if (error.status) out.push("status:" + error.status);
    var result = error.result || error;
    var googleError = (result && result.error) || null;
    if (googleError) {
      if (googleError.status) out.push("status:" + googleError.status);
      if (googleError.message) out.push(String(googleError.message));
      var list = googleError.errors || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].reason) out.push(String(list[i].reason));
      }
    }
    if (error.reason) out.push(String(error.reason));
    if (error.message && !googleError) out.push(String(error.message));
    return out;
  }

  function has(haystack, needle) {
    return haystack.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
  }

  /* Ordered rules. First match wins, so the specific causes are checked
   * before the generic HTTP-status ones. */
  var RULES = [
    {
      match: "not-in-browser",
      code: "not_in_browser",
      title: "Not running in a browser",
      message: "The Drive layer was called outside a browser page, so it has no window to sign in with. This is a bug in the page, not your setup — the data on this device is unaffected."
    },
    {
      match: "not-configured",
      code: "not_configured",
      title: "This build has no Google keys yet",
      message: "No Client ID and API key are stored for this browser. Add them in Settings > Google Drive backup — the guided steps are in docs/google-drive-setup.md."
    },
    {
      match: "origin_mismatch",
      code: "origin_mismatch",
      title: "This page's address is not on the OAuth client",
      message: "Google refused the sign-in because this page's origin is not listed under Authorized JavaScript origins on the OAuth client. Add the exact origin shown in Settings (no trailing slash, no path) and try again. Google can take a minute or two to pick up a change."
    },
    {
      match: "redirect_uri_mismatch",
      code: "origin_mismatch",
      title: "This page's address is not on the OAuth client",
      message: "Google rejected the redirect because this page's origin is not registered on the OAuth client. A Web-application client with no redirect URIs is fine; one with redirect URIs must include this origin. Check Authorized JavaScript origins and the redirect URI list, then try again."
    },
    {
      match: "popup_timeout",
      code: "popup_timeout",
      title: "The sign-in popup never came back",
      message: "Google's sign-in popup did not respond within two minutes — it was probably blocked, or the page was left in the background while it waited. Allow pop-ups for this site, then choose Save and connect again. Your keys were saved, so nothing has to be pasted twice."
    },
    {
      match: "popup_closed_by_user",
      code: "cancelled",
      title: "Sign-in was cancelled",
      message: "The Google sign-in popup was closed before it finished. Choose Continue with Google again and finish the prompt without closing it."
    },
    {
      match: "access_denied",
      code: "access_denied",
      title: "Google did not grant access",
      message: "You declined the permission request, or the consent screen is still in Testing and this Google account is not one of its test users. Retry, and if it fails again publish the consent screen (or add yourself as a test user)."
    },
    {
      match: "unauthorized_client",
      code: "unauthorized_client",
      title: "The OAuth client is not allowed to sign in",
      message: "Google says this OAuth client cannot be used here. Confirm the client is of type \"Web application\" (not Desktop or iOS) and that its Authorized JavaScript origins include this page's origin."
    },
    {
      match: "invalid_client",
      code: "invalid_client",
      title: "The Client ID is not valid",
      message: "Google does not recognise this Client ID. It is usually a truncated or stale paste — copy it again from Credentials, or delete the OAuth client in the console and create a new one."
    },
    {
      match: "invalid_scope",
      code: "invalid_scope",
      title: "The requested permission is not available",
      message: "Google rejected the drive.file permission. This usually means the Drive API is not enabled for the project the OAuth client belongs to — enable it, then try again."
    },
    {
      match: "accessnotconfigured",
      code: "api_disabled",
      title: "The Google Drive API is not enabled",
      message: "The Drive API is off for the project behind this key. Open the Drive API page, confirm the right project is selected, choose Enable, wait a minute, and try again."
    },
    {
      match: "servicedisabled",
      code: "api_disabled",
      title: "The Google Drive API is not enabled",
      message: "Google reports that the Drive API is disabled for this project. Enable it in the Cloud console, wait a minute, then try again."
    },
    {
      match: "has not been used in project",
      code: "api_disabled",
      title: "The Google Drive API is not enabled",
      message: "Google reports that the Drive API has never been used in this project. Enable it in the Cloud console (and confirm the API key and OAuth client belong to the same project), then try again."
    },
    {
      match: "api_key_invalid",
      code: "bad_api_key",
      title: "The API key was rejected",
      message: "Google rejected the API key. It is usually a truncated paste, a key from a different project than the OAuth client, or a key restricted to a referrer that does not match this page. Copy it again, or lift the referrer restriction while testing."
    },
    {
      match: "api key not valid",
      code: "bad_api_key",
      title: "The API key was rejected",
      message: "Google rejected the API key. Copy it again from Credentials, and check that it is not restricted to a website referrer other than this page's origin."
    },
    {
      match: "referrernotallowed",
      code: "bad_api_key",
      title: "The API key is not allowed from this page",
      message: "The API key's website restriction does not include this page's origin. Edit the key in the console and add this origin to Application restrictions > Websites, or remove the restriction while you are setting things up."
    },
    {
      match: "quota",
      code: "quota",
      title: "The API key's quota is exhausted",
      message: "Google is rate-limiting this key. Wait a minute and retry. If it keeps happening, the key may be shared with another app — create a fresh key and restrict it to the Drive API."
    },
    {
      match: "status:401",
      code: "expired_session",
      title: "The Drive session expired",
      message: "The saved Drive access is no longer valid. Sign in again to refresh it — nothing on this device is lost."
    },
    {
      match: "status:403",
      code: "forbidden",
      title: "Google refused the request",
      message: "Google returned 403 for this Drive request. The usual causes are an API key restricted away from this origin, a consent screen that has not been published, or a Drive account without permission to write the file. Try signing out and back in; if it persists, check the key's restrictions in the Cloud console."
    },
    {
      match: "status:404",
      code: "not_found",
      title: "The Drive file could not be found",
      message: "The saved file id no longer points at a file — it was deleted or moved in Drive. The next save recreates it in the Battle Rhythm folder."
    },
    {
      match: "status:429",
      code: "quota",
      title: "Too many requests",
      message: "Google is rate-limiting this key. Wait a moment and use Sync now to retry; your changes are queued on this device meanwhile."
    },
    {
      match: "status:5",
      code: "google_outage",
      title: "Google had a server error",
      message: "Google's own service returned an error. Nothing is wrong with your setup — your changes are queued on this device and will sync when the next save or Sync now succeeds."
    },
    {
      match: "network",
      code: "offline",
      title: "No connection to Google",
      message: "The request to Google never completed, so this device is offline or a network is blocking accounts.google.com. Your changes stay queued on this device and will sync when you are back online."
    },
    {
      match: "failed to load",
      code: "blocked_script",
      title: "Google's sign-in script did not load",
      message: "accounts.google.com could not be loaded. This is usually an ad blocker, a privacy extension, or a firewall. Allow accounts.google.com and apis.google.com for this page, then reload and try again."
    },
    {
      match: "failed to fetch",
      code: "offline",
      title: "No connection to Google",
      message: "The request to Google never completed, so this device is offline or a network is blocking Google's endpoints. Your changes stay queued on this device and will sync when you are back online."
    },
    {
      match: "popup",
      code: "popup_blocked",
      title: "The sign-in popup was blocked",
      message: "The browser blocked the Google sign-in popup. Allow pop-ups for this site, then choose Continue with Google again."
    }
  ];

  /* Map a thrown error (or a plain string) onto { code, title, message }.
   * The fallback deliberately keeps Google's own words instead of replacing
   * them with a generic apology, so an unrecognised failure is still
   * actionable — but it is never the bare string "Something went wrong". */
  function explainError(error) {
    var reasons = reasonsFor(error);
    var blob = reasons.join(" | ");
    if (!blob) {
      return {
        code: "unknown",
        title: "Drive sync could not continue",
        message: "The Drive layer reported a failure with no detail. Your data is safe on this device — choose Sync now to retry, and check the browser console if it keeps happening."
      };
    }
    for (var i = 0; i < RULES.length; i++) {
      if (has(blob, RULES[i].match)) {
        return { code: RULES[i].code, title: RULES[i].title, message: RULES[i].message };
      }
    }
    var detail = reasons.filter(function (r) { return r.indexOf("status:") !== 0; })[0] || blob;
    return {
      code: "unmapped",
      title: "Google rejected the request",
      message: "Google reported: " + detail + ". If it keeps happening, check that the Drive API is enabled for the project and that this page's origin is listed on the OAuth client (docs/google-drive-setup.md has the steps)."
    };
  }

  /* The raw .md renders as plain text if it is served as a file, so on a
   * GitHub Pages origin point at the rendered blob instead. A local http origin
   * keeps the repo-relative path, which is the copy that exists on disk. */
  function docsUrl(locationLike) {
    var origin = authorizedOrigin(locationLike);
    if (!origin) return DOCS_URL;
    var host = (locationLike && locationLike.host) || "";
    if (host.indexOf("github.io") === -1) return DOCS_URL;
    var path = (locationLike && locationLike.pathname) || "/";
    /* A project Pages site is served at /<repo>/ but the blob URL is already
     * scoped to the repo, so that first segment is dropped. */
    var segments = path.split("/").filter(Boolean);
    var base = segments.length > 1 ? segments.slice(1) : [];
    return DOCS_BLOB_ROOT + base.join("/") + (base.length ? "/" : "") + DOCS_URL;
  }

  return {
    CLIENT_ID_RE: CLIENT_ID_RE,
    DOCS_BLOB_ROOT: DOCS_BLOB_ROOT,
    docsUrl: docsUrl,
    API_KEY_RE: API_KEY_RE,
    DOCS_URL: DOCS_URL,
    CONSOLE_CREDENTIALS_URL: CONSOLE_CREDENTIALS_URL,
    CONSOLE_DRIVE_API_URL: CONSOLE_DRIVE_API_URL,
    CONSOLE_CONSENT_URL: CONSOLE_CONSENT_URL,
    asString: asString,
    validateClientId: validateClientId,
    validateApiKey: validateApiKey,
    authorizedOrigin: authorizedOrigin,
    originAdvice: originAdvice,
    setupSteps: setupSteps,
    explainError: explainError
  };
});
