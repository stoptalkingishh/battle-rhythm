"use strict";
/* Reusable, bounded guided-workout countdown widget (loads as window.BRTimer).
 *
 * Independent of app.js's DOM helpers so any view (Tracker today, Doctor or a
 * future plan runner tomorrow) can mount as many instances as it likes. Each
 * instance owns its own deadline and interval and exposes start/pause/reset/
 * destroy.
 *
 * Behavior contract (the "bounded, guided" parts):
 *   - Countdown is derived from a fixed deadline against performance.now()
 *     every tick, so a paused or hidden/sleeping tab never drifts — when it
 *     wakes it jumps straight to the correct remaining time.
 *   - The planned seconds are clamped to BRTimerCore.MAX_SECONDS (60 min) so a
 *     mistyped rest value can't start a runaway multi-hour timer.
 *   - Reaches 0: stops, renders "00:00", announces completion, plays a short
 *     beep, and calls the optional onComplete callback exactly once.
 *   - Accessible: the ticking display uses role="timer" with aria-live="off"
 *     (its aria-label is refreshed each tick); meaningful state changes are
 *     announced on a polite role="status" line; the toggle uses aria-pressed.
 *
 * Usage:
 *   var t = window.BRTimer.create({
 *       mount: hostEl, variant: "rest"|"set", label: "Rest",
 *       seconds: 45, onStart: fn, onPause: fn, onReset: fn, onComplete: fn
 *   });
 *   ... t.destroy();  // cancels interval, unbinds, clears DOM
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory((typeof BRTimerCore !== "undefined") ? BRTimerCore : require("./data/timer-core.js"));
  } else {
    root.BRTimer = factory(root.BRTimerCore);
  }
})(typeof self !== "undefined" ? self : this, function (CORE) {
  var INSTANCES = 0;
  var TICK_MS = 250;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") el.className = attrs[k];
        else if (k === "text") el.textContent = attrs[k];
        else if (k.indexOf("aria-") === 0) el.setAttribute(k, attrs[k]);
        else el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function timer() { return CORE ? CORE : null; }

  /* Lazy WebAudio beep, guarded so a missing/unpermitted AudioContext can
   * never throw or block the UI. Creates the context on first successful use
   * (a real user gesture has happened by then). */
  function playComplete(volume) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      [[660, 0], [880, 0.18]].forEach(function (pair) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = pair[0];
        gain.gain.setValueAtTime((volume || 0.25), now + pair[1]);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + pair[1] + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + pair[1]);
        osc.stop(now + pair[1] + 0.3);
      });
      setTimeout(function () { ctx.close().catch(function () {}); }, 800);
    } catch (e) { /* sound is best-effort only */ }
  }

  function create(cfg) {
    cfg = cfg || {};
    var totalSec = CORE.clampToMax(cfg.seconds || 0);
    if (totalSec <= 0) return null; // nothing to count down — refuse

    var variant = cfg.variant === "set" ? "set" : "rest";
    var label = cfg.label || (variant === "set" ? "Timed set" : "Rest");
    var onStart = cfg.onStart, onPause = cfg.onPause,
        onReset = cfg.onReset, onComplete = cfg.onComplete;
    var uid = "br-timer-" + (++INSTANCES);
    var remainingMs = totalSec * 1000;
    var deadlineMs = 0;
    var running = false;
    var intervalId = null;
    var done = false; // reached 0 — start() must reset before re-running

    /* ---- optional local-state persistence (durable active-session recovery).
     * When cfg.storageKey is set the widget keeps its own running/paused
     * position in localStorage so a reload returns you to the same workout in
     * the same place. A running timer stores an absolute wall-clock deadline so
     * it survives the restart exactly; reset/complete clears the saved state. */
    var storageKey = cfg.storageKey || null;

    function loadSaved() {
      if (!storageKey) return null;
      try {
        var raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        var o = JSON.parse(raw);
        return (o && typeof o === "object") ? o : null;
      } catch (e) { return null; }
    }
    function clearSaved() {
      if (!storageKey) return;
      try { localStorage.removeItem(storageKey); } catch (e) {}
    }
    function saveState() {
      if (!storageKey) return;
      var payload = { v: 1, totalSec: totalSec, running: running };
      if (running) {
        payload.deadlineWall = Date.now() + Math.max(0, remainingMs); // absolute, reload-safe
      } else {
        payload.remainingMs = Math.max(0, remainingMs);
      }
      try { localStorage.setItem(storageKey, JSON.stringify(payload)); } catch (e) {}
    }

    /* ---- DOM ---- */
    var mount = cfg.mount;
    var display = h("time", { role: "timer", "aria-live": "off", class: "br-timer-display" });
    var status = h("div", { class: "br-timer-status", role: "status", "aria-live": "polite" });
    var toggleBtn = h("button", { type: "button", class: "btn btn-gold br-timer-toggle", "aria-pressed": "false", text: "Start" });
    var resetBtn = h("button", { type: "button", class: "btn btn-ghost br-timer-reset", text: "Reset" });
    var rootEl = h("div", { class: "br-timer", "data-variant": variant, "data-timer-id": uid }, [
      h("div", { class: "br-timer-head" }, [
        h("span", { class: "br-timer-label", text: label }),
        h("span", { class: "br-timer-plan", text: planText(totalSec) })
      ]),
      display,
      h("div", { class: "br-timer-actions" }, [toggleBtn, resetBtn]),
      status
    ]);

    function refreshDisplay() {
      display.textContent = CORE.format(remainingMs);
      display.setAttribute("aria-label", ariaLabel(label, remainingMs));
      rootEl.classList.toggle("br-timer-done", remainingMs <= 0);
      rootEl.classList.toggle("br-timer-running", running);
    }

    function announce(msg) {
      status.textContent = msg;
      status.setAttribute("aria-label", msg);
    }

    function tick() {
      remainingMs = CORE.remaining(deadlineMs, now());
      if (remainingMs <= 0) {
        remainingMs = 0;
        complete();
        return;
      }
      refreshDisplay();
    }

    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function stopInterval() {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    }

    function start() {
      if (running) return;
      // If it already finished, restart from the full planned duration.
      if (done || remainingMs <= 0) { remainingMs = totalSec * 1000; done = false; }
      stopInterval();
      deadlineMs = now() + remainingMs;
      running = true;
      toggleBtn.textContent = "Pause";
      toggleBtn.setAttribute("aria-pressed", "true");
      refreshDisplay();
      announce(label + " started — " + CORE.format(remainingMs) + " remaining.");
      intervalId = setInterval(tick, TICK_MS);
      saveState(); // running: persist an absolute wall-clock deadline
      if (onStart) onStart();
    }

    function pause() {
      if (!running) return;
      remainingMs = CORE.remaining(deadlineMs, now());
      stopInterval();
      running = false;
      saveState(); // paused: snapshot the remaining time
      refreshDisplay();
      toggleBtn.textContent = "Start";
      toggleBtn.setAttribute("aria-pressed", "false");
      announce(label + " paused — " + CORE.format(remainingMs) + " remaining.");
      if (onPause) onPause();
    }

    function reset() {
      stopInterval();
      running = false;
      done = false;
      remainingMs = totalSec * 1000;
      clearSaved(); // a reset intentionally discards any durable position
      toggleBtn.textContent = "Start";
      toggleBtn.setAttribute("aria-pressed", "false");
      refreshDisplay();
      announce(label + " reset — " + CORE.format(remainingMs) + " planned.");
      if (onReset) onReset();
    }

    function complete() {
      done = true;
      stopInterval();
      running = false;
      clearSaved(); // finished — nothing left to recover
      refreshDisplay();
      toggleBtn.textContent = "Start";
      toggleBtn.setAttribute("aria-pressed", "false");
      announce(label + " complete.");
      playComplete();
      if (onComplete) onComplete();
    }

    function destroy() {
      stopInterval();
      if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      toggleBtn.onclick = resetBtn.onclick = null;
    }

    toggleBtn.addEventListener("click", function () { running ? pause() : start(); });
    resetBtn.addEventListener("click", reset);

    /* Restore a durable running/paused position — but only when this timer's
     * planned duration is unchanged since it was saved (an edited plan must
     * invalidate the stale state). Running timers resume using their persisted
     * absolute wall-clock deadline so they restart exactly where they were. */
    var saved = loadSaved();
    var restored = false;
    if (saved && saved.v === 1 && saved.totalSec === totalSec) {
      restored = true;
      if (saved.running && typeof saved.deadlineWall === "number") {
        remainingMs = Math.max(0, saved.deadlineWall - Date.now());
        if (remainingMs > 0) {
          running = true;
          deadlineMs = now() + remainingMs;
          toggleBtn.textContent = "Pause";
          toggleBtn.setAttribute("aria-pressed", "true");
          intervalId = setInterval(tick, TICK_MS);
          saveState(); // refresh the wall-clock deadline after time elapsed
        } else {
          clearSaved(); // deadline already passed — start clean
          remainingMs = totalSec * 1000;
          restored = false;
        }
      } else if (typeof saved.remainingMs === "number") {
        remainingMs = Math.max(0, Math.min(Math.round(saved.remainingMs), totalSec * 1000));
      }
    }

    refreshDisplay();
    if (running) {
      announce(label + " restored — " + CORE.format(remainingMs) + " remaining.");
    } else if (restored) {
      announce(label + " restored at " + CORE.format(remainingMs) + ".");
    } else {
      announce(label + " ready — " + CORE.format(remainingMs) + " planned.");
    }

    if (mount) mount.appendChild(rootEl);

    return {
      el: rootEl,
      start: start, pause: pause, reset: reset, destroy: destroy,
      isRunning: function () { return running; },
      remainingMs: function () { return remainingMs; }
    };
  }

  function planText(totalSec) {
    var C = CORE;
    if (!C) return "";
    return "Planned " + C.format(totalSec * 1000);
  }

  function ariaLabel(label, remainingMs) {
    var C = CORE;
    var sec = C ? C.format(remainingMs) : Math.ceil(remainingMs / 1000);
    return label + " timer, " + sec + " remaining";
  }

  return {
    create: create,
    TICK_MS: TICK_MS
  };
});