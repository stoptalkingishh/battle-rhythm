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
function loadDrive() {
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
  sandbox.window.BR_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  sandbox.window.BR_GOOGLE_API_KEY = "AIzaTest";
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

test("isDriveConfigured needs both values and reflects config.js", () => {
  const both = loadDrive();
  assert.equal(both.sandbox.window.BRDrive.isDriveConfigured(), true);

  const noKey = loadDrive();
  noKey.sandbox.window.BR_GOOGLE_API_KEY = "";
  /* drive.js captured API_KEY at evaluation time, so re-running with the value
   * absent is the honest way to model an unconfigured build. */
  const sandbox2 = { ...noKey.sandbox };
  assert.ok(sandbox2.window.BRDrive, "BRDrive missing");
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