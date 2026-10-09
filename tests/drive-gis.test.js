/* Tests for the Google Identity Services sign-in path in js/drive.js.
 *
 * This is the DEFAULT mode (no token proxy configured), so it is the path most
 * users meet. It exists because Google refuses a secret-less PKCE exchange:
 * its token endpoint advertises only client_secret_post and client_secret_basic,
 * so the durable PKCE flow needs a server (the Apps Script proxy). The GIS token
 * client needs no secret - it also needs no refresh token, which is the trade
 * this file pins down.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "js", "drive.js"), "utf8");

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map)
  };
}

/* A stand-in for google.accounts.oauth2. `respond` decides what happens when
 * requestAccessToken is called: a token, or an error (cancel / blocked popup). */
function loadDrive(respond, { hint = null, withProxy = false } = {}) {
  const local = fakeStorage();
  const session = fakeStorage();
  const calls = [];
  if (hint) local.setItem("brdrive:account", JSON.stringify(hint));

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    Promise,
    setTimeout,
    crypto: webcrypto,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    document: { createElement: () => ({}), querySelector: () => null, head: { appendChild() {} } },
    location: { origin: "https://stoptalkingishh.github.io", pathname: "/battle-rhythm/", search: "", assign() {} },
    history: { replaceState() {} },
    fetch: (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/oauth2/v3/userinfo")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sub: "sub-1", email: "soldier@example.com", name: "Soldier" }),
          text: () => Promise.resolve(JSON.stringify({ sub: "sub-1", email: "soldier@example.com", name: "Soldier" })),
          clone() { return this; }
        });
      }
      return Promise.reject(new Error("unexpected fetch " + u));
    },
    localStorage: local,
    sessionStorage: session
  };
  sandbox.window = sandbox;
  sandbox.window.BR_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  if (withProxy) sandbox.window.BR_DRIVE_TOKEN_PROXY = "https://script.google.com/macros/s/TESTPROXY/exec";

  /* google.accounts.oauth2, pre-injected so loadGis() resolves without a script tag. */
  sandbox.google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          calls.push("initTokenClient");
          sandbox.__clientConfig = config;
          return {
            requestAccessToken: (opts) => {
              calls.push({ requestAccessToken: opts });
              respond(config, opts);
            }
          };
        }
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, local, session, calls };
}

const TOKEN_OK = (config) => config.callback({ access_token: "access-gis", expires_in: 3600 });

test("with no proxy, sign-in uses Google Identity Services - not the PKCE redirect", async () => {
  const { sandbox } = loadDrive(TOKEN_OK);
  assert.equal(sandbox.window.BRDrive.usesDurableSignIn(), false);
  assert.equal(sandbox.window.BRDrive.isDriveConfigured(), true);

  await sandbox.window.BRDrive.signInToDrive();

  const init = sandbox.__clientConfig;
  assert.ok(init, "initTokenClient was never called");
  assert.equal(init.client_id, "test-client.apps.googleusercontent.com");
  assert.match(init.scope, /drive\.file/, "the Drive scope must be requested");
  assert.equal(sandbox.window.BRDrive.getLastSignInError(), null, "a good sign-in records no error");
});

test("an interactive sign-in remembers the account so a return visit can be silent", async () => {
  const { sandbox, local } = loadDrive(TOKEN_OK);
  const user = await sandbox.window.BRDrive.signInToDrive();
  assert.equal(user.email, "soldier@example.com");
  const hint = JSON.parse(local.getItem("brdrive:account") || "null");
  assert.equal(hint && hint.email, "soldier@example.com", "no account hint was stored");
});

test("a returning browser restores the session silently and reports the user", async () => {
  const { sandbox, calls } = loadDrive(TOKEN_OK, { hint: { email: "soldier@example.com" } });
  const user = await sandbox.window.BRDrive.restoreDriveSession();
  assert.equal(user && user.email, "soldier@example.com");
  const prompted = calls.find((c) => c && c.requestAccessToken);
  assert.ok(prompted, "no token was requested");
  assert.equal(prompted.requestAccessToken.prompt, "", "the silent attempt must not prompt");
});

test("a first-time visitor is not silently prompted (no hint, no popup)", async () => {
  const { sandbox, calls } = loadDrive(TOKEN_OK);
  const user = await sandbox.window.BRDrive.restoreDriveSession();
  assert.equal(user, null, "there is nothing to restore");
  assert.ok(!calls.includes("initTokenClient"), "a silent attempt was made for a visitor who never signed in");
});

test("a blocked or cancelled silent attempt is reported, not hidden", async () => {
  const { sandbox } = loadDrive((config) => config.error_callback({ type: "popup_closed" }),
    { hint: { email: "soldier@example.com" } });
  const user = await sandbox.window.BRDrive.restoreDriveSession();
  assert.equal(user, null);
  assert.match(String(sandbox.window.BRDrive.getLastSignInError()), /cancel/i,
    "the reason must reach the UI so the user knows to click sign-in");
});

/* The trade this mode makes, pinned so nobody assumes a refresh token exists. */
test("session mode keeps no refresh token and stores no access token", async () => {
  const { sandbox, local } = loadDrive(TOKEN_OK);
  await sandbox.window.BRDrive.signInToDrive();
  assert.equal(local.getItem("brdrive:refresh_token"), null, "GIS issues no refresh token");
  const stored = JSON.stringify(local._dump());
  assert.doesNotMatch(stored, /access-gis/, "the access token must stay in memory");
});

test("signing out forgets the account hint as well as the token", async () => {
  const { sandbox, local } = loadDrive(TOKEN_OK);
  await sandbox.window.BRDrive.signInToDrive();
  await sandbox.window.BRDrive.signOutFromDrive();
  assert.equal(local.getItem("brdrive:account"), null, "the hint survived sign-out");
  assert.equal(sandbox.window.BRDrive.getDriveUser(), null);
});

test("Drive calls carry the GIS access token as a bearer", async () => {
  const calls = [];
  const { sandbox } = loadDrive(TOKEN_OK);
  await sandbox.window.BRDrive.signInToDrive();
  const inner = sandbox.fetch;
  sandbox.fetch = (url, init) => {
    calls.push({ url: String(url), headers: (init && init.headers) || {} });
    return inner(url, init);
  };
  await sandbox.window.BRDrive.readDriveFile("sessions.json");
  const drive = calls.filter((c) => c.url.includes("googleapis.com/drive"));
  assert.ok(drive.length >= 1, "no Drive request was made");
  drive.forEach((c) => assert.match(c.headers.Authorization || "", /^Bearer access-gis$/));
});

/* GIS's token client is popup-only: `ux_mode` belongs to initCodeClient (the
 * code flow), so there is no redirect fallback here and passing ux_mode would
 * be silently ignored. Verified against the API reference and by observation -
 * a "redirect" retry still opened a popup and still failed. If this ever
 * changes, these tests should be rewritten rather than the code silently
 * carrying a config that does nothing. */
test("the token client is not given a ux_mode it cannot honour", async () => {
  const { sandbox } = loadDrive(TOKEN_OK);
  await sandbox.window.BRDrive.signInToDrive();
  assert.equal(sandbox.__clientConfig.ux_mode, undefined,
    "initTokenClient has no ux_mode; only initCodeClient does");
});

test("a blocked popup produces the one instruction the user can act on", async () => {
  const { sandbox } = loadDrive((config) => config.error_callback({ type: "popup_failed_to_open" }),
    { hint: { email: "soldier@example.com" } });
  await assert.rejects(() => sandbox.window.BRDrive.signInToDrive(), /Allow pop-ups/i);

  /* and the same reason reaches the panel when it happens on restore */
  const restore = loadDrive((config) => config.error_callback({ type: "popup_failed_to_open" }),
    { hint: { email: "soldier@example.com" } });
  const user = await restore.sandbox.window.BRDrive.restoreDriveSession();
  assert.equal(user, null);
  assert.match(String(restore.sandbox.window.BRDrive.getLastSignInError()), /pop-ups/i);
});

test("a cancelled popup says so plainly", async () => {
  const { sandbox } = loadDrive((config) => config.error_callback({ type: "popup_closed" }));
  await assert.rejects(() => sandbox.window.BRDrive.signInToDrive(), /cancelled/i);
});
