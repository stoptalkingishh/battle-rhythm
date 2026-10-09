/* Tests for the Google Drive section's copy (js/data/drive-status.js).
 *
 * The bug this guards: a sign-in that Google completed but the app could not
 * turn into a session rendered as a plain "Continue with Google" button with
 * no explanation. Every non-working state must now carry its reason through to
 * the UI, and the DOM wiring that shows it must exist.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STATUS = require(path.join(ROOT, "js", "data", "drive-status.js"));

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");

const signedIn = { configured: true, status: "ready", user: { name: "A" }, lastError: "" };
const signedOut = { configured: true, status: "guest", user: null, lastError: "" };

test("an unconfigured build says backups are off and offers no button", () => {
  const v = STATUS.describe({ configured: false, status: "off", user: null, lastError: "" });
  assert.equal(v.auth, "none");
  assert.match(v.statusText, /backups are off/i);
  assert.equal(v.errorText, "", "an unconfigured build is not an error to shout about");
});

test("a syncing build shows progress and no auth control", () => {
  const v = STATUS.describe({ configured: true, status: "syncing", user: null, lastError: "" });
  assert.equal(v.auth, "none");
  assert.equal(v.statusText, STATUS.SYNCING);
  assert.doesNotMatch(v.statusText, /sign in/i, "do not offer sign-in mid-sync");
});

test("a signed-in user is shown as an account, with no pitch", () => {
  const v = STATUS.describe(signedIn);
  assert.equal(v.auth, "account");
  assert.equal(v.statusText, "", "the account row speaks for itself");
  assert.equal(v.errorText, "");
});

test("a signed-in user whose sync failed keeps the account and the reason", () => {
  const v = STATUS.describe(Object.assign({}, signedIn, { lastError: "Drive read failed" }));
  assert.equal(v.auth, "account", "a failed sync must not sign the user out in the UI");
  assert.match(v.errorText, /Drive read failed/, "the reason must survive");
  assert.match(v.errorText, /on this device/i, "say where the data is right now");
});

/* THE regression this file exists for. */
test("a sign-in that produced no session explains itself", () => {
  const v = STATUS.describe(Object.assign({}, signedOut, { lastError: "Requests from referer are blocked." }));
  assert.equal(v.auth, "signin", "still offer the button: the user may be able to retry");
  assert.match(v.errorText, /Could not complete sign-in/);
  assert.match(v.errorText, /referer are blocked/, "the actual cause must reach the user, not just the console");
  assert.ok(v.errorText.indexOf(v.statusText) === -1 || v.statusText !== "", "copy is composed, not duplicated");
});

test("a plain signed-out state is not dressed up as a failure", () => {
  const v = STATUS.describe(signedOut);
  assert.equal(v.auth, "signin");
  assert.equal(v.errorText, "", "no error text when there is nothing wrong");
  assert.match(v.statusText, /Battle Rhythm/, "name the folder the backup lands in");
  assert.match(v.statusText, /weekly plan/, "say what travels with the account");
});

test("a missing state object does not throw", () => {
  assert.equal(STATUS.describe(undefined).auth, "signin");
  assert.equal(STATUS.describe({}).auth, "signin");
});

test("Settings renders the reason: the node, the script and the wiring all exist", () => {
  assert.ok(html.includes('id="drive-error"'), "index.html has no #drive-error node to show the reason in");
  assert.ok(html.includes("js/data/drive-status.js"), "index.html does not load the copy module");
  assert.match(appSource, /BR_DRIVE_STATUS/, "app.js does not read the copy module");
  assert.match(appSource, /renderDriveError\(/, "app.js has no path that renders the reason");
  assert.match(appSource, /getLastError/, "app.js never asks the cloud layer why sync is not running");
});
