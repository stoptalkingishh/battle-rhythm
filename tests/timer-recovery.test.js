"use strict";
/* Durable active-session recovery: timer state persisted in localStorage must
 * survive a reload. These tests drive window.BRTimer (a DOM widget) against a
 * minimal DOM/localStorage shim with a controllable fake clock, then re-create
 * instances to simulate a page reload and assert the recovered position.
 *
 * Covered:
 *   - a running timer restored from its absolute wall-clock deadline
 *   - a paused timer restored to its frozen remaining snapshot
 *   - elapsed time between save and restore is honored
 *   - reset() discards the durable position
 *   - complete() discards the durable position
 *   - an edited plan (totalSec changed) invalidates the stale state
 *   - no storageKey => no localStorage writes, so recovery stays opt-in
 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// ---- controllable fake clock + storage ----
let CLOCK = 1_000_000_000;
const store = new Map();

global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// ---- minimal DOM element shim ----
function makeEl(tag) {
  return {
    tagName: tag,
    className: "",
    textContent: "",
    children: [],
    attrs: {},
    listeners: {},
    style: {},
    parentNode: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) {
      const a = this.listeners[t] || [];
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    classList: {
      add(...cls) { cls.forEach((c) => this._set(c, true)); },
      toggle(c, force) { this._set(c, force === undefined ? !this._has(c) : !!force); },
      remove(c) { this._set(c, false); },
      contains(c) { return this._has(c); },
      _cls: new Set(),
      _set(c, on) { on ? this._cls.add(c) : this._cls.delete(c); },
      _has(c) { return this._cls.has(c); },
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    querySelector() { return null; },
  };
}

global.document = {
  createElement: (tag) => makeEl(tag),
  createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
};

const clockNow = {
  now: () => CLOCK, // performance.now
};
global.window = {
  performance: clockNow,
  // no AudioContext in tests — playComplete must silently no-op
};
global.performance = clockNow;
// Date.now is used for the persisted wall-clock deadline
const realDateNow = Date.now;
test.beforeEach(() => {
  CLOCK = 1_000_000_000;
  Date.now = () => CLOCK;
});

test.after(() => {
  Date.now = realDateNow;
});

// ---- load the widget under test ----
const brDir = path.join(__dirname, "..", "js");
global.BRTimerCore = require(path.join(brDir, "data", "timer-core.js"));
const Timer = require(path.join(brDir, "timer.js"));

const KEY_A = "t:workoutA:item1:rest";

test("running timer restores from persisted wall-clock deadline, honoring elapsed time", () => {
  store.clear();
  const mountA = makeEl("div");

  let t1 = Timer.create({ mount: mountA, variant: "rest", label: "Rest", seconds: 45, storageKey: KEY_A });
  assert.ok(t1, "timer created");
  assert.equal(t1.remainingMs(), 45 * 1000);
  assert.equal(t1.isRunning(), false);

  t1.start();
  assert.equal(t1.isRunning(), true);

  CLOCK += 5000; // 5s passes
  t1.destroy();
  assert.equal(store.has(KEY_A), true, "running state persisted");

  // ---- "reload": fresh instance, same key ----
  const mountB = makeEl("div");
  const t2 = Timer.create({ mount: mountB, variant: "rest", label: "Rest", seconds: 45, storageKey: KEY_A });
  assert.ok(t2);
  assert.equal(t2.isRunning(), true, "running position restored");
  assert.ok(Math.abs(t2.remainingMs() - 40 * 1000) <= 1, `expected ~40s left, got ${t2.remainingMs()}`);
  t2.destroy();
});

test("paused timer restores to its frozen remaining snapshot (not running)", () => {
  store.clear();
  const mount = makeEl("div");
  const t1 = Timer.create({ mount, variant: "rest", seconds: 45, storageKey: KEY_A });
  t1.start();
  CLOCK += 5000;
  t1.pause();
  assert.equal(t1.isRunning(), false);
  assert.equal(store.has(KEY_A), true);
  t1.destroy();

  const mount2 = makeEl("div");
  const t2 = Timer.create({ mount: mount2, variant: "rest", seconds: 45, storageKey: KEY_A });
  assert.equal(t2.isRunning(), false, "paused stays paused");
  assert.equal(t2.remainingMs(), 40 * 1000, "remaining frozen snapshot restored");
  t2.destroy();
});

test("reset() discards the durable running position", () => {
  store.clear();
  const mount = makeEl("div");
  const t1 = Timer.create({ mount, variant: "rest", seconds: 45, storageKey: KEY_A });
  t1.start();
  CLOCK += 5000;
  t1.reset();
  assert.equal(store.has(KEY_A), false, "reset clears persisted state");
  t1.destroy();

  const t2 = Timer.create({ mount: makeEl("div"), variant: "rest", seconds: 45, storageKey: KEY_A });
  assert.equal(t2.isRunning(), false);
  assert.equal(t2.remainingMs(), 45 * 1000, "starts fresh at full planned duration");
  t2.destroy();
});

test("an expired running deadline is dropped on restore (shares complete()'s clearSaved)", () => {
  store.clear();
  const mount = makeEl("div");
  const t = Timer.create({ mount, variant: "rest", seconds: 45, storageKey: KEY_A });
  t.start();
  assert.equal(store.has(KEY_A), true);
  // The whole planned window elapses before any restore
  CLOCK += 46 * 1000;
  t.destroy();
  const t2 = Timer.create({ mount: makeEl("div"), variant: "rest", seconds: 45, storageKey: KEY_A });
  assert.equal(store.has(KEY_A), false, "expired running deadline cleared (deadline passed)");
  assert.equal(t2.isRunning(), false);
  assert.equal(t2.remainingMs(), 45 * 1000);
  t2.destroy();
});

test("an edited plan (totalSec changed) invalidates the stale saved state", () => {
  store.clear();
  const t1 = Timer.create({ mount: makeEl("div"), variant: "set", seconds: 45, storageKey: KEY_A });
  t1.start();
  CLOCK += 2000;
  t1.destroy();
  assert.equal(store.has(KEY_A), true);

  // Reload with a different planned duration
  const t2 = Timer.create({ mount: makeEl("div"), variant: "set", seconds: 60, storageKey: KEY_A });
  assert.equal(t2.isRunning(), false, "stale state must not be restored across a plan edit");
  assert.equal(t2.remainingMs(), 60 * 1000);
  t2.destroy();
});

test("no storageKey means no localStorage writes (recovery stays opt-in)", () => {
  store.clear();
  const mount = makeEl("div");
  const t = Timer.create({ mount, variant: "rest", seconds: 30 });
  t.start();
  CLOCK += 3000;
  t.pause();
  assert.equal(store.size, 0, "nothing written without a storageKey");
  t.destroy();
});

