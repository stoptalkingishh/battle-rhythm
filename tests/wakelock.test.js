"use strict";
/* Unit tests for the wake-lock helper (js/data/wakelock.js). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const W = require("../js/data/wakelock.js");

test("supported() is false where the Screen Wake Lock API is absent", () => {
  assert.equal(W.supported(), false);
});

test("disabled state releases immediately and reports as off", async () => {
  assert.equal(W.isEnabled(), true);
  W.setEnabled(false);
  assert.equal(W.isEnabled(), false);
  await W.setEnabled(true);
  assert.equal(W.isEnabled(), true);
});

test("request/release are safe no-ops when unsupported", async () => {
  assert.equal(await W.request(), false, "no lock on unsupported browser");
  await W.release();
  assert.equal(await W.request(), false);
});