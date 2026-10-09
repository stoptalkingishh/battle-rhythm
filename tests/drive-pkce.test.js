/* Tests for the PKCE pieces of js/drive.js.
 *
 * js/drive.js is an IIFE that reads window.BR_GOOGLE_CLIENT_ID at
 * evaluation time and publishes window.BRDrive, so it cannot be required in
 * Node directly. These tests run it inside a vm context with just enough of a
 * browser surface to exercise the state/verifier bookkeeping - the part that
 * gates the token exchange, and therefore the part where a silent logic error
 * costs the user a working sign-in.
 *
 * The original defect this file exists to catch: consumeVerifier() deleted the
 * state before reading it back to verify, so the comparison was always
 * `null === state` and every callback was rejected with "Sign-in could not be
 * verified". The flow looked correct end to end and failed only at the last
 * step.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { webcrypto } = require("node:crypto");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "js", "drive.js"), "utf8");

/* The proxy the sandbox advertises as BR_DRIVE_TOKEN_PROXY. Every token
 * exchange must go here: Google's endpoint accepts only client_secret_post /
 * client_secret_basic, so a direct call from the page cannot work. */
const PROXY = "https://script.google.com/macros/s/TESTPROXY/exec";

/* Minimal sessionStorage. Real semantics matter here: setItem/getItem/removeItem
 * on a plain object is enough, and it is what makes the delete-before-read
 * ordering bug observable. */
function fakeSessionStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map)
  };
}

/* Run drive.js in a vm with a stubbed window. Returns the storage so a test
 * can plant or inspect PKCE state. */
function loadDrive(config = {}) {
  const session = fakeSessionStorage();
  const local = fakeSessionStorage();
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    Promise,
    setTimeout,
    crypto: webcrypto,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    document: { createElement: () => ({}), querySelector: () => null, head: { appendChild() {} } },
    location: { origin: "https://stoptalkingishh.github.io", pathname: "/battle-rhythm/", search: "", assign() {} },
    history: { replaceState() {} },
    fetch: () => Promise.reject(new Error("network disabled in tests")),
    localStorage: local,
    sessionStorage: session,
  };
  sandbox.window = sandbox;
  sandbox.window.BR_GOOGLE_CLIENT_ID =
    "clientId" in config ? config.clientId : "test-client.apps.googleusercontent.com";
  sandbox.window.BR_DRIVE_TOKEN_PROXY =
    "tokenProxy" in config ? config.tokenProxy : "https://script.google.com/macros/s/TESTPROXY/exec";
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, session, local };
}

/* beginSignIn() ends in window.location.assign, so capture the URL it built
 * instead of navigating, and pull the state out of the query. */
function captureAuthUrl(sandbox, session) {
  let captured = null;
  sandbox.location.assign = (url) => { captured = url; };
  const BRDrive = sandbox.window.BRDrive;
  /* beginSignIn is private, but signInToDrive is the public entry that calls
   * it and returns its promise. */
  const done = BRDrive.signInToDrive();
  return Promise.resolve(done).then(() => {
    const url = new URL(captured);
    return {
      url,
      state: url.searchParams.get("state"),
      challenge: url.searchParams.get("code_challenge"),
      method: url.searchParams.get("code_challenge_method"),
      verifier: session.getItem("brdrive:pkce_verifier:" + url.searchParams.get("state"))
    };
  });
}

test("sign-in builds a PKCE authorization URL with S256 and offline access", async () => {
  const { sandbox, session } = loadDrive();
  const { url, state, challenge, method, verifier } = await captureAuthUrl(sandbox, session);

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "code", "must be the code flow, not implicit");
  assert.equal(method, "S256");
  assert.equal(url.searchParams.get("access_type"), "offline", "no refresh token without this");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.ok(challenge && challenge.length > 0, "no code_challenge in the auth URL");
  assert.ok(state && state.length >= 16, "state must be long enough to be unguessable");
  assert.ok(verifier && verifier.length >= 43, "verifier must meet the RFC 7636 minimum of 43 chars");
  assert.equal(url.searchParams.get("redirect_uri"), "https://stoptalkingishh.github.io/battle-rhythm/");
});

test("two sign-in attempts use different state and verifier values", async () => {
  const { sandbox } = loadDrive();
  const first = await captureAuthUrl(sandbox, sandbox.sessionStorage);
  const second = await captureAuthUrl(sandbox, sandbox.sessionStorage);
  assert.notEqual(first.state, second.state, "state was reused across attempts");
  assert.notEqual(first.verifier, second.verifier, "verifier was reused across attempts");
  assert.notEqual(first.challenge, second.challenge, "challenge must follow the verifier");
});

test("a matching state yields its verifier and clears the stored PKCE state", async () => {
  const { sandbox, session } = loadDrive();
  const { state, verifier } = await captureAuthUrl(sandbox, session);

  /* Drive the same path the redirect handler uses: a code and state on the
   * query string. */
  assert.ok(session.getItem("brdrive:pkce_verifier:" + state), "verifier was never stored");

  /* completeSignInFromRedirect will attempt a real token POST, which the stub
   * fetch rejects. We only care that it got PAST the state check, which shows
   * up as a network failure rather than the verification message. */
  sandbox.location.search = "?code=test-code&state=" + encodeURIComponent(state);
  return sandbox.window.BRDrive.completeSignInFromRedirect().then(
    () => assert.fail("expected the stubbed token request to reject"),
    (err) => {
      assert.doesNotMatch(
        String(err && err.message),
        /could not be verified/,
        "the state check rejected a callback it had itself issued"
      );
      assert.match(
        String(err && err.message),
        /network disabled/,
        "expected the stubbed fetch to be what failed, meaning the state check passed"
      );
      /* The verifier and state must be consumed whether or not the exchange
       * succeeded, so a reload cannot replay an already-used code. */
      assert.equal(session.getItem("brdrive:pkce_verifier:" + state), null, "verifier survived");
      assert.equal(session.getItem("brdrive:pkce_state:" + state), null, "state survived");
    }
  );
});

test("an unknown state is rejected without touching any stored verifier", async () => {
  const { sandbox, session } = loadDrive();
  const { state } = await captureAuthUrl(sandbox, session);

  /* A callback carrying a state we never issued must not consume the pending
   * verifier: that is what stops a forged callback from burning a real
   * sign-in attempt. */
  sandbox.location.search = "?code=forged&state=not-a-state-we-issued";
  return sandbox.window.BRDrive.completeSignInFromRedirect().then(
    () => assert.fail("expected rejection for an unknown state"),
    (err) => {
      assert.match(String(err && err.message), /could not be verified/);
      assert.equal(
        session.getItem("brdrive:pkce_verifier:" + state),
        session._dump()["brdrive:pkce_verifier:" + state],
        "the genuine pending verifier must be left alone"
      );
    }
  );
});

test("the redirect handler clears the query string before it can throw", async () => {
  const { sandbox } = loadDrive();
  let replaceCalls = 0;
  sandbox.history.replaceState = () => { replaceCalls++; };
  sandbox.location.search = "?code=test-code&state=forged-state";

  return sandbox.window.BRDrive.completeSignInFromRedirect().catch(() => {}).then(() => {
    assert.equal(replaceCalls, 1, "a reload would replay the consumed code");
  });
});

test("an OAuth error in the callback is surfaced, not swallowed", async () => {
  const { sandbox } = loadDrive();
  sandbox.location.search = "?error=access_denied&error_description=User+declined";
  return sandbox.window.BRDrive.completeSignInFromRedirect().then(
    () => assert.fail("expected rejection for a declined consent"),
    (err) => assert.match(String(err && err.message), /User declined/)
  );
});

test("a page with no OAuth query params does nothing", async () => {
  const { sandbox } = loadDrive();
  sandbox.location.search = "";
  return sandbox.window.BRDrive.completeSignInFromRedirect().then((v) => {
    assert.equal(v, null, "no code means no work to do");
  });
});

/* The client id is the only required value. Requiring an API key here is what
 * broke sign-in in production: Drive v3 rejects API keys outright, so the key
 * was only ever used by the gapi discovery bootstrap, and when Google's
 * referrer restriction blocked that fetch the app reported "signed out" for a
 * user Google had already authenticated. */
test("isDriveConfigured needs the client id and the token proxy, not an API key", () => {
  assert.equal(loadDrive().sandbox.window.BRDrive.isDriveConfigured(), true);

  /* The API key is gone entirely - Drive v3 rejects API keys, so requiring one
   * (as this used to) gated sign-in behind a credential no Drive call can use. */
  assert.equal(
    loadDrive({ apiKey: "" }).sandbox.window.BRDrive.isDriveConfigured(),
    true,
    "a build with no API key must still sign in"
  );

  assert.equal(
    loadDrive({ clientId: "" }).sandbox.window.BRDrive.isDriveConfigured(),
    false,
    "no client id means no sign-in at all"
  );

  /* Without the proxy the code exchange cannot succeed, so offering the button
   * would just produce an error the user cannot act on. */
  assert.equal(
    loadDrive({ tokenProxy: "" }).sandbox.window.BRDrive.isDriveConfigured(),
    false,
    "no token proxy means no sign-in"
  );
});

test("signOut clears the stored refresh token", async () => {
  const { sandbox, local } = loadDrive();
  local.setItem("brdrive:refresh_token", "refresh-token-value");
  return sandbox.window.BRDrive.signOutFromDrive().then(() => {
    assert.equal(
      local.getItem("brdrive:refresh_token"),
      null,
      "sign-out must remove the refresh token, or sync resumes after signing out"
    );
  });
});

test("the refresh token lives under a namespaced key, not a bare token", () => {
  const src = SOURCE;
  assert.ok(src.includes('REFRESH_KEY = "brdrive:refresh_token"'), "refresh key must be namespaced");
  /* The access token is deliberately in-memory only; persisting it would put a
   * short-lived credential in localStorage for no benefit, since the refresh
   * token can mint a new one. */
  assert.ok(!/localSet\([^)]*access[_-]?token/i.test(src), "access token must not be persisted");
});

/* ---------------------------------------------------------------------------
 * Drive transport. The bug this guards: the file layer used to route every
 * call through gapi.client, which needed an API key and a discovery-document
 * fetch. A blocked key made a signed-in user look signed out. Drive v3 takes
 * an OAuth bearer token and nothing else, so the guard asserts the bearer
 * header is present and that no request carries an API key.
 * ------------------------------------------------------------------------- */

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
    clone() { return this; }
  };
}

/* Answer the token endpoint, then Drive, recording every request. */
function loadDriveWithDriveStub() {
  const calls = [];
  const loaded = loadDrive();
  loaded.local.setItem("brdrive:refresh_token", "refresh-1");
  loaded.sandbox.fetch = (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET", headers: (init && init.headers) || {}, body: (init && init.body) || "" });
    const u = String(url);
    if (u === PROXY) {
      return Promise.resolve(jsonResponse({ access_token: "access-1", expires_in: 3600 }));
    }
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      if (u.includes("application%2Fvnd.google-apps.folder")) {
        return Promise.resolve(jsonResponse({ files: [{ id: "folder-1", name: "Battle Rhythm" }] }));
      }
      return Promise.resolve(jsonResponse({ files: [{ id: "file-1" }] }));
    }
    if (u.includes("alt=media")) {
      return Promise.resolve(jsonResponse([{ id: "s1", name: "session" }]));
    }
    if (u.includes("fields=id%2CmodifiedTime")) {
      return Promise.resolve(jsonResponse({ id: "file-1", modifiedTime: "2026-01-02T03:04:05.000Z" }));
    }
    return Promise.resolve(jsonResponse({ error: { message: "unexpected " + u } }, 500));
  };
  return { sandbox: loaded.sandbox, local: loaded.local, calls };
}

test("Drive reads use an OAuth bearer token and never an API key", async () => {
  const { sandbox, calls } = loadDriveWithDriveStub();
  const res = await sandbox.window.BRDrive.readDriveFile("sessions.json");

  /* The vm's arrays AND their objects are a different realm, so deepStrictEqual
   * compares prototypes and fails on identical content. Compare the plain JSON. */
  assert.deepEqual(JSON.parse(JSON.stringify(res.data)), [{ id: "s1", name: "session" }],
    "the file content did not come back");

  const tokenCalls = calls.filter((c) => c.url === PROXY);
  assert.equal(tokenCalls.length, 1, "expected exactly one refresh exchange, got " + tokenCalls.length);
  const sent = JSON.parse(tokenCalls[0].body);
  assert.equal(sent.grant, "refresh_token");
  assert.equal(sent.refresh_token, "refresh-1");
  assert.equal(sent.client_secret, undefined, "the browser must never send a client secret");
  assert.equal(res.modifiedTime, "2026-01-02T03:04:05.000Z", "metadata mtime was not carried through");

  const driveCalls = calls.filter((c) => c.url.startsWith("https://www.googleapis.com/drive"));
  assert.ok(driveCalls.length >= 2, "expected folder lookup + file read, got " + driveCalls.length);
  driveCalls.forEach((c) => {
    assert.match(c.headers.Authorization || "", /^Bearer access-1$/, "missing bearer token on " + c.url);
    assert.doesNotMatch(c.url, /[?&]key=/, "Drive v3 rejects API keys: " + c.url);
    assert.doesNotMatch(c.url, /discovery\/v1\/apis/, "the gapi discovery bootstrap must be gone: " + c.url);
  });
});

test("a Drive write creates the file and confirms the new modifiedTime", async () => {
  const { sandbox, calls } = loadDriveWithDriveStub();
  sandbox.fetch = (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET", headers: (init && init.headers) || {}, body: (init && init.body) || "" });
    const u = String(url);
    if (u === PROXY) {
      return Promise.resolve(jsonResponse({ access_token: "access-1", expires_in: 3600 }));
    }
    if (u.includes("/upload/drive/")) {
      return Promise.resolve(jsonResponse({ id: "file-1" }));
    }
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      if (u.includes("application%2Fvnd.google-apps.folder")) {
        return Promise.resolve(jsonResponse({ files: [{ id: "folder-1" }] }));
      }
      if ((init && init.method) === "POST") {
        return Promise.resolve(jsonResponse({ id: "file-1" }));
      }
      return Promise.resolve(jsonResponse({ files: [] }));
    }
    if (u.includes("fields=id%2CmodifiedTime")) {
      return Promise.resolve(jsonResponse({ id: "file-1", modifiedTime: "2026-02-02T00:00:00.000Z" }));
    }
    return Promise.resolve(jsonResponse({ error: { message: "unexpected " + u } }, 500));
  };

  const res = await sandbox.window.BRDrive.writeDriveFile("sessions.json", [{ id: "s1" }]);
  assert.equal(res.ok, true, "a confirmed upload must report ok");
  assert.equal(res.modifiedTime, "2026-02-02T00:00:00.000Z", "the new mtime must be reported back");
});

/* THE chain that produced the silent signed-out state in production: the
 * proxy refuses the exchange, restoreDriveSession absorbs it, and the user sees
 * "Continue with Google" with no explanation. */
test("a refused token exchange surfaces Google's own reason", async () => {
  const { sandbox, session } = loadDrive();
  const { state } = await captureAuthUrl(sandbox, session);
  sandbox.fetch = (url) => {
    if (String(url) === PROXY) {
      return Promise.resolve(jsonResponse({ error: "invalid_client", error_description: "client_secret is missing" }, 401));
    }
    return Promise.resolve(jsonResponse({}, 500));
  };
  sandbox.location.search = "?code=test-code&state=" + encodeURIComponent(state);

  await assert.rejects(
    () => sandbox.window.BRDrive.completeSignInFromRedirect(),
    (err) => {
      assert.match(String(err && err.message), /client_secret is missing/,
        "the proxy's (Google's) reason must survive to the caller");
      return true;
    }
  );
});

test("a failed callback is remembered so the UI can say why", async () => {
  const { sandbox, session } = loadDrive();
  const { state } = await captureAuthUrl(sandbox, session);
  sandbox.fetch = (url) => {
    if (String(url) === PROXY) {
      return Promise.resolve(jsonResponse({ error: "access_denied", error_description: "User denied" }, 403));
    }
    return Promise.resolve(jsonResponse({}, 500));
  };
  sandbox.location.search = "?code=test-code&state=" + encodeURIComponent(state);

  const user = await sandbox.window.BRDrive.restoreDriveSession();
  assert.equal(user, null, "a refused exchange is not a session");
  assert.match(
    String(sandbox.window.BRDrive.getLastSignInError()),
    /User denied/,
    "the reason must be retrievable, not just console.error'd"
  );
});

test("no client secret is ever sent from the browser", () => {
  /* The secret lives in the Apps Script proxy. A page cannot keep one, and
   * Google's token endpoint would not accept this client without it - which is
   * exactly why the exchange is server-side. */
  const code = SOURCE.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
  assert.doesNotMatch(code, /client_secret/, "a client secret appeared in executable code");
  assert.match(SOURCE, /BR_DRIVE_TOKEN_PROXY/, "the proxy URL is not read from config");
  assert.match(SOURCE, /JSON\.stringify\(params\)/, "token params must be sent as a JSON body");
});
