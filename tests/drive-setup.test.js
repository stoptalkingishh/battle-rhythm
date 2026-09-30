"use strict";
/* Unit tests for the self-service Drive setup helpers (js/data/drive-setup.js):
 * credential validation, the authorized-origin string, the guided step list,
 * and the one-specific-message-per-error-branch rule.
 * Run: node --test tests/
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/data/drive-setup.js");

const GOOD_ID = "123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com";
const GOOD_KEY = "AIza" + "SyD1x2y3z4a5b6c7d8e9f0g1h2i3j4k5L6M";

/* ---- credential validation ---- */

test("validateClientId accepts a real-shaped client id and normalizes whitespace", () => {
  const ok = S.validateClientId("  " + GOOD_ID + "\n");
  assert.equal(ok.ok, true);
  assert.equal(ok.code, "ok");
  assert.equal(ok.value, GOOD_ID, "trims the surrounding whitespace/newline from a console copy");
  assert.equal(ok.message, "", "no message when the value is good");
});

test("validateClientId rejects an empty value with its own message", () => {
  const r = S.validateClientId("");
  assert.equal(r.ok, false);
  assert.equal(r.code, "empty");
  assert.match(r.message, /Client ID/);
  assert.notEqual(r.message, "", "an empty field still gets a human-readable message");
});

test("validateClientId rejects a value containing an inner space", () => {
  const r = S.validateClientId("123456789012- abc.apps.googleusercontent.com");
  assert.equal(r.ok, false);
  assert.equal(r.code, "whitespace");
  assert.match(r.message, /space/);
});

test("validateClientId catches an API key pasted into the wrong field", () => {
  const r = S.validateClientId(GOOD_KEY);
  assert.equal(r.ok, false);
  assert.equal(r.code, "wrong-value");
  assert.match(r.message, /API key/);
});

test("validateClientId catches a console URL pasted into the field", () => {
  const r = S.validateClientId("https://console.cloud.google.com/apis/credentials");
  assert.equal(r.ok, false);
  assert.equal(r.code, "url");
  assert.match(r.message, /link/);
});

test("validateClientId rejects a plausible-looking but truncated id", () => {
  const r = S.validateClientId("123456789012-abcdef.apps.googleusercontent.co");
  assert.equal(r.ok, false);
  assert.equal(r.code, "malformed");
  assert.match(r.message, /\.apps\.googleusercontent\.com/);
});

test("validateApiKey accepts a real-shaped key", () => {
  assert.equal(GOOD_KEY.length, 39, "the fixture itself is a correctly sized key");
  const r = S.validateApiKey(" " + GOOD_KEY + " ");
  assert.equal(r.ok, true);
  assert.equal(r.value, GOOD_KEY);
});

test("validateApiKey rejects an empty value with its own message", () => {
  const r = S.validateApiKey(undefined);
  assert.equal(r.ok, false);
  assert.equal(r.code, "empty");
  assert.match(r.message, /AIza/);
});

test("validateApiKey catches a Client ID pasted into the wrong field", () => {
  const r = S.validateApiKey(GOOD_ID);
  assert.equal(r.ok, false);
  assert.equal(r.code, "wrong-value");
  assert.match(r.message, /Client ID/);
});

test("validateApiKey rejects a truncated key and states the expected length", () => {
  const r = S.validateApiKey("AIzaSyTooShort");
  assert.equal(r.ok, false);
  assert.equal(r.code, "malformed");
  assert.match(r.message, /39 characters/);
});

test("asString strips smart quotes and newlines from a phone-keyboard paste", () => {
  assert.equal(S.asString("abc\ndef\tghi"), "abcdefghi");
  assert.equal(S.asString("“quoted”"), "quoted");
  assert.equal(S.asString(null), "", "non-strings degrade to empty rather than throwing");
});

/* ---- authorized origin ---- */

test("authorizedOrigin is scheme+host+port only, with no trailing slash or path", () => {
  assert.equal(
    S.authorizedOrigin({ protocol: "https:", host: "stoptalkingishh.github.io", pathname: "/battle-rhythm/" }),
    "https://stoptalkingishh.github.io"
  );
  assert.equal(
    S.authorizedOrigin({ protocol: "http:", host: "localhost:8000", pathname: "/index.html" }),
    "http://localhost:8000",
    "the dev-server port is part of the origin Google matches on"
  );
});

test("authorizedOrigin returns empty for a file:// page rather than a rejected origin", () => {
  assert.equal(S.authorizedOrigin({ protocol: "file:", host: "" }), "");
  assert.equal(S.authorizedOrigin(null), "");
});

test("originAdvice explains the http caveat and the file:// dead end", () => {
  const local = S.originAdvice({ protocol: "file:", host: "" });
  assert.equal(local.ok, false);
  assert.match(local.message, /http/, "tells the user to serve the folder over http");
  const dev = S.originAdvice({ protocol: "http:", host: "localhost:8000" });
  assert.equal(dev.ok, true);
  assert.match(dev.message, /HTTPS/, "warns that Google only accepts https origins for sign-in");
  const prod = S.originAdvice({ protocol: "https:", host: "stoptalkingishh.github.io" });
  assert.match(prod.message, /no trailing slash/);
});

/* ---- guided steps ---- */

test("setupSteps covers the whole console-to-sign-in path in order", () => {
  const steps = S.setupSteps({ origin: "https://stoptalkingishh.github.io" });
  const ids = steps.map(s => s.id);
  assert.deepEqual(ids, [
    "project",
    "enable-api",
    "oauth-client",
    "authorized-origin",
    "api-key",
    "consent-screen",
    "paste"
  ]);
  for (const step of steps) {
    assert.ok(step.title && step.detail, `step ${step.id} has both a title and detail`);
  }
});

test("setupSteps embeds the exact origin in the authorized-origin step", () => {
  const steps = S.setupSteps({ origin: "https://stoptalkingishh.github.io" });
  const originStep = steps.find(s => s.id === "authorized-origin");
  assert.match(originStep.detail, /https:\/\/stoptalkingishh\.github\.io/);
  assert.equal(originStep.copy, "https://stoptalkingishh.github.io", "exposed for a copy button");
  assert.match(originStep.detail, /origin_mismatch/, "names the failure it prevents");
});

test("setupSteps degrades gracefully when there is no usable origin", () => {
  const steps = S.setupSteps({ origin: "" });
  const originStep = steps.find(s => s.id === "authorized-origin");
  assert.equal(originStep.copy, "");
  assert.match(originStep.detail, /no usable origin/);
});

test("setupSteps only links to real Google console endpoints", () => {
  const steps = S.setupSteps({ origin: "" });
  for (const step of steps) {
    if (!step.url) continue;
    assert.match(step.url, /^https:\/\/console\.cloud\.google\.com\//, `${step.id} links to the console`);
  }
});

/* ---- docs link ---- */

test("docsUrl points at the rendered blob on a GitHub Pages origin", () => {
  const url = S.docsUrl({ protocol: "https:", host: "stoptalkingishh.github.io", pathname: "/battle-rhythm/" });
  assert.equal(url, "https://github.com/stoptalkingishh/battle-rhythm/blob/main/docs/google-drive-setup.md",
    "the Pages sub-path is dropped; the blob URL is already repo-scoped");
});

test("docsUrl keeps the repo-relative path off GitHub Pages", () => {
  assert.equal(S.docsUrl({ protocol: "http:", host: "localhost:8000", pathname: "/" }), S.DOCS_URL);
  assert.equal(S.docsUrl(null), S.DOCS_URL, "no location falls back rather than throwing");
});

/* ---- error translation ---- */

test("explainError gives origin_mismatch its own actionable message", () => {
  const r = S.explainError({ error: "origin_mismatch", error_description: "Bad Request" });
  assert.equal(r.code, "origin_mismatch");
  assert.match(r.message, /Authorized JavaScript origins/);
  assert.match(r.message, /no trailing slash/);
});

test("explainError separates consent-testing from a plain refusal", () => {
  const denied = S.explainError({ error: "access_denied" });
  assert.equal(denied.code, "access_denied");
  assert.match(denied.message, /Testing/);
  const closed = S.explainError({ error: "popup_closed_by_user" });
  assert.equal(closed.code, "cancelled");
  assert.notEqual(denied.message, closed.message);
});

test("explainError tells an unauthorized_client apart from an invalid_client", () => {
  const a = S.explainError({ error: "unauthorized_client" });
  assert.equal(a.code, "unauthorized_client");
  assert.match(a.message, /Web application/);
  const b = S.explainError({ error: "invalid_client" });
  assert.equal(b.code, "invalid_client");
  assert.match(b.message, /truncated or stale paste/);
});

test("explainError maps a disabled Drive API from three different response shapes", () => {
  const a = S.explainError({ result: { error: { errors: [{ reason: "accessNotConfigured" }] } }, status: 403 });
  const b = S.explainError({ result: { error: { errors: [{ reason: "serviceDisabled" }] } }, status: 403 });
  const c = S.explainError({ message: "Google Drive API has not been used in project 123 before or it is disabled" });
  for (const r of [a, b, c]) {
    assert.equal(r.code, "api_disabled", "all three shapes land on the same fix");
    assert.match(r.message, /Enable/);
  }
});

test("explainError separates a bad key from a referrer-restricted key from quota", () => {
  const bad = S.explainError({ result: { error: { errors: [{ reason: "API_KEY_INVALID" }] } }, status: 400 });
  assert.equal(bad.code, "bad_api_key");
  const ref = S.explainError({ result: { error: { errors: [{ reason: "referrerNotAllowed" }] } }, status: 403 });
  assert.equal(ref.code, "bad_api_key");
  assert.match(ref.message, /referrer|restriction/i);
  const quota = S.explainError({ result: { error: { errors: [{ reason: "quotaExceeded" }] } }, status: 403 });
  assert.equal(quota.code, "quota");
  assert.match(quota.message, /rate-limiting/);
});

test("explainError maps the unconfigured case to the guided setup", () => {
  const r = S.explainError("not-configured");
  assert.equal(r.code, "not_configured");
  assert.match(r.message, /google-drive-setup\.md/);
});

test("explainError gives distinct messages for each HTTP status class", () => {
  const cases = [
    [401, "expired_session"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "quota"],
    [500, "google_outage"]
  ];
  const seen = new Set();
  for (const [status, code] of cases) {
    const r = S.explainError({ status, result: { error: {} } });
    assert.equal(r.code, code, `status ${status} -> ${code}`);
    assert.ok(r.message.length > 20, `status ${status} gets a real message`);
    const pair = r.code + "::" + r.message;
    assert.ok(!seen.has(pair), `status ${status} collides with another status's message`);
    seen.add(pair);
  }
  /* 503 is the same class as 500 on purpose — one message, not two that read
   * almost the same. */
  assert.equal(
    S.explainError({ status: 500, result: { error: {} } }).message,
    S.explainError({ status: 503, result: { error: {} } }).message
  );
});

test("explainError names an unresponsive popup and a synchronously blocked one", () => {
  const timeout = S.explainError("popup_timeout");
  assert.equal(timeout.code, "popup_timeout");
  assert.match(timeout.message, /two minutes/);
  assert.match(timeout.message, /keys were saved/, "tells the user they do not have to paste again");
  const blocked = S.explainError("popup blocked by the browser");
  assert.equal(blocked.code, "popup_blocked");
  assert.match(blocked.message, /Allow pop-ups/);
  assert.notEqual(timeout.message, blocked.message);
});

test("explainError names the blocked-script and offline cases", () => {
  const script = S.explainError(new Error("Failed to load https://accounts.google.com/gsi/client"));
  assert.equal(script.code, "blocked_script");
  assert.match(script.message, /ad blocker|extension|firewall/);
  const offline = S.explainError(new Error("network error while fetching"));
  assert.equal(offline.code, "offline");
  assert.match(offline.message, /queued on this device/);
});

test("explainError never degrades to a bare generic message", () => {
  const inputs = [
    null,
    undefined,
    {},
    new Error(""),
    { result: { error: { message: "PERMISSION_DENIED: nope" } } },
    "some unmapped string"
  ];
  for (const input of inputs) {
    const r = S.explainError(input);
    assert.ok(r.title && r.title.length > 5, `title for ${JSON.stringify(input)}`);
    assert.ok(r.message && r.message.length > 20, `message for ${JSON.stringify(input)}`);
    assert.doesNotMatch(r.message, /something went wrong/i);
    assert.doesNotMatch(r.message, /^Error/, "never leaks a raw Error prefix");
  }
});

test("explainError surfaces Google's own wording for an unmapped failure", () => {
  const r = S.explainError({ result: { error: { errors: [{ reason: "PERMISSION_DENIED" }] } }, status: 400 });
  assert.equal(r.code, "unmapped");
  assert.match(r.message, /PERMISSION_DENIED/);
});
