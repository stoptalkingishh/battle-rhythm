/* End-to-end browser test: Builder -> Tracker -> Progress.
 *
 * Acceptance target for repo issue #14. Drives the shipped static site in a
 * real headless Chrome over the DevTools Protocol (no build step, no test
 * framework, no npm dependency) and asserts the data a user creates in the
 * Builder is visible after they log it in the Tracker.
 *
 * Every interaction goes through the DOM a user would touch — clicking
 * buttons, typing into inputs, dispatching change events. Nothing is stubbed
 * and no app module is re-implemented here, so this fails if the *wiring*
 * breaks even when every unit test still passes.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launch, findBrowser } from './lib/cdp.mjs';
import { serve } from './lib/server.mjs';
import { Page } from './lib/page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* `init()` runs on DOMContentLoaded and calls nav(initialView()), which marks
 * one .nav-btn and one .view active. Waiting on that is view-agnostic; waiting
 * on home-only markup (e.g. #home-stats) deadlocks when booting into #tracker. */
function readyFor(view) {
  return `document.readyState === "complete" && !!document.querySelector('#main-nav .nav-btn.active[data-view=${JSON.stringify(view)}]') && document.querySelector('section[data-view=${JSON.stringify(view)}]').classList.contains('active')`;
}
const SESSION_NAME = 'E2E Bar Bell Block';
const LOG_DATE = '2026-03-04';
const DEADLIFT = { id: 's1-deadlift', name: 'Deadlift' };
const PREP = { id: 'mb1-bend-and-reach', name: 'Bend and Reach' };
const RECOVERY = { id: 'mb8-recovery-drill-stretches', name: 'Recovery Drill / Stretches' };
const SETS = [
  { weight: '135', reps: '5' },
  { weight: '135', reps: '5' },
];

/* Skip rather than fail when no browser is installed, so a fresh clone still
 * has a green `npm run test:e2e` on a machine without Chrome. CI sets
 * BR_E2E_REQUIRED=1, which turns the same condition into a failure — a guard
 * that cannot fail is not a guard. */
const browserPath = findBrowser();
const required = process.env.BR_E2E_REQUIRED === '1';
const unavailable = !browserPath && !required;

describe('Builder -> Tracker -> Progress (browser E2E)', { skip: unavailable ? 'no Chromium-family browser found' : false }, () => {
  let browser;
  let site;
  let page;
  let sessionId;

  before(async () => {
    site = await serve(root);
    browser = await launch();
    page = new Page(browser.connection, browser.sessionId);
    await page.goto(`${site.origin}/index.html`, {
      ready: readyFor('home'),
    });
    /* Guest mode: no account, no network, no credentials. Start from a clean
     * localStorage so the run does not depend on prior browser state. */
    await page.run('localStorage.clear();');
    await page.goto(`${site.origin}/index.html`, {
      ready: readyFor('home'),
    });
  });

  after(async () => {
    if (browser) browser.close();
    if (site) await site.close();
  });

  it('loads every module with no console error or uncaught exception', async () => {
    assert.deepEqual(page.pageErrors, [], `uncaught page errors: ${page.pageErrors.join(' | ')}`);
    assert.deepEqual(page.consoleErrors, [], `console errors: ${page.consoleErrors.join(' | ')}`);
    /* The app reports a missing BR_* module rather than failing silently, so
     * this also proves no data module dropped out of index.html. */
    const missing = await page.evaluate(
      'Array.from(document.querySelectorAll("script[src]")).filter(s => /data/.test(s.src)).length'
    );
    assert.ok(missing > 20, `expected the data modules to be loaded, found ${missing}`);
  });

  it('serves every local asset index.html references', async () => {
    const broken = site.requests.filter((r) => r.status === 404);
    assert.deepEqual(broken.map((r) => r.path), [], '404s on assets referenced by index.html');
  });

  

  it('builds a session in the Builder with prep, activity and recovery', async () => {
    await page.evaluate('document.querySelector(\'.nav-btn[data-view="builder"]\').click()');
    await page.waitFor('document.querySelector(\'section[data-view="builder"]\').classList.contains("active")',
      { label: 'builder view active' });

    await page.evaluate('document.querySelector("#new-session-btn").click()');
    await page.waitFor('!document.querySelector("#session-editor").classList.contains("hidden")',
      { label: 'session editor open' });

    const add = async (phaseName, exercise) => page.run(`
      const cards = Array.from(document.querySelectorAll('#session-structure > .card'));
      const card = cards.find(c => c.querySelector('.phase-item-name').textContent.trim() === ${JSON.stringify(phaseName)});
      if (!card) throw new Error('no phase card: ' + ${JSON.stringify(phaseName)});
      const select = card.querySelector('.phase-add select');
      const value = 'exercise:' + ${JSON.stringify(exercise.id)};
      if (!Array.from(select.options).some(o => o.value === value)) {
        throw new Error('phase ' + ${JSON.stringify(phaseName)} + ' cannot take ' + value +
          ' — offered: ' + Array.from(select.options).map(o => o.value).slice(0, 5).join(','));
      }
      select.value = value;
      Array.from(card.querySelectorAll('.phase-add button')).find(b => b.textContent.trim() === 'Add').click();
    `);

    await add('Preparation', PREP);
    await add('Activity', DEADLIFT);
    await add('Recovery', RECOVERY);

    const items = await page.evaluate(`
      Array.from(document.querySelectorAll('#session-structure .phase-item-name')).map(n => n.textContent.trim())
    `);
    assert.ok(items.includes(DEADLIFT.name), `activity phase is missing ${DEADLIFT.name}: ${items.join(', ')}`);

    await page.run(`
      const name = document.querySelector('#session-name');
      name.value = ${JSON.stringify(SESSION_NAME)};
      name.dispatchEvent(new Event('input', { bubbles: true }));
      const safety = document.querySelector('#session-safety-confirm');
      safety.checked = true;
      safety.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#session-save').click();
    `);
    /* Saving is immediate — there is no password prompt. */
    await page.waitFor(
      'Array.from(document.querySelectorAll("#sessions-list .list-item")).some(n => n.textContent.includes(' +
        JSON.stringify(SESSION_NAME) + '))',
      { label: `saved session "${SESSION_NAME}" in the sessions list` }
    );

    sessionId = await page.evaluate(
      `(JSON.parse(localStorage.getItem("br_sessions") || "[]").find(s => s.name === ${JSON.stringify(SESSION_NAME)}) || {}).id || ""`
    );
    assert.ok(sessionId, 'the saved session has no id');
  });

  it('offers the built session in the Tracker and restores it after a reload', async () => {
    await page.goto(`${site.origin}/index.html#tracker`, {
      ready: readyFor('tracker'),
    });
    const offered = await page.evaluate(`
      Array.from(document.querySelector('#track-session').options).map(o => ({ value: o.value, text: o.textContent }))
    `);
    assert.ok(
      offered.some((o) => o.value === sessionId && o.text === SESSION_NAME),
      `tracker session dropdown is missing the built session: ${JSON.stringify(offered)}`
    );

    /* Log against an explicit date so the Progress history is deterministic. */
    await page.run(`
      const date = document.querySelector('#track-date');
      date.value = ${JSON.stringify(LOG_DATE)};
      date.dispatchEvent(new Event('change', { bubbles: true }));
      const sel = document.querySelector('#track-session');
      sel.value = ${JSON.stringify(sessionId)};
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await page.waitFor(
      'document.querySelector("#tracker-active").textContent.includes(' + JSON.stringify(DEADLIFT.name) + ')',
      { label: 'tracker active card for the built session' }
    );

    /* The active session is remembered, so a reload comes back to it. */
    const active = await page.evaluate('JSON.parse(localStorage.getItem("br_tracker_active") || "null")');
    assert.deepEqual(active, { sessionId, date: LOG_DATE });

    await page.goto(`${site.origin}/index.html#tracker`, {
      ready: readyFor('tracker'),
    });
    await page.waitFor(`document.querySelector("#track-session").value === ${JSON.stringify(sessionId)}`,
      { label: 'tracker restores the active session after reload' });
  });

  it('logs weight sets for the Deadlift and marks the session complete', async () => {
    await page.run(`
      const rows = Array.from(document.querySelectorAll('#tracker-active .tracker-item'));
      const row = rows.find(r => (r.querySelector('.content h4') || {}).textContent === ${JSON.stringify(DEADLIFT.name)});
      if (!row) throw new Error('no tracker row for ' + ${JSON.stringify(DEADLIFT.name)});
      Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === 'Log').click();
    `);
    await page.waitFor(`
      (() => {
        const rows = Array.from(document.querySelectorAll('#tracker-active .tracker-item'));
        const row = rows.find(r => (r.querySelector('.content h4') || {}).textContent === ${JSON.stringify(DEADLIFT.name)});
        const form = row && row.querySelector('.log-form');
        return !!form && !form.classList.contains('hidden');
      })()
    `, { label: 'the deadlift log form is open' });

    /* One weight/reps row per set, then Save result. The form pre-renders one
     * empty set row; "+ Set" appends the rest, and each re-render rebuilds the
     * row elements, so the inputs are re-queried by their Weight/Reps
     * placeholders after every click rather than held in a stale NodeList. */
    await page.run(`
      const row = Array.from(document.querySelectorAll('#tracker-active .tracker-item'))
        .find(r => (r.querySelector('.content h4') || {}).textContent === ${JSON.stringify(DEADLIFT.name)});
      const form = row.querySelector('.log-form');
      const sets = ${JSON.stringify(SETS)};
      const type = (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const addSet = () => Array.from(form.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '+ Set').click();
      for (let i = 0; i < sets.length; i++) {
        if (i > 0) addSet();
        const w = form.querySelectorAll('input[placeholder="Weight"]')[i];
        const r = form.querySelectorAll('input[placeholder="Reps"]')[i];
        if (!w || !r) throw new Error('set row ' + i + ' is missing after adding it');
        type(w, sets[i].weight);
        type(r, sets[i].reps);
      }
      Array.from(form.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save result').click();
    `);

    await page.waitFor(`
      (() => {
        const rows = Array.from(document.querySelectorAll('#tracker-active .tracker-item'));
        const row = rows.find(r => (r.querySelector('.content h4') || {}).textContent === ${JSON.stringify(DEADLIFT.name)});
        return !!row && row.classList.contains('done');
      })()
    `, { label: 'the deadlift row is marked done' });

    const stored = await page.evaluate(`
      (JSON.parse(localStorage.getItem("br_tracker") || "{}")[${JSON.stringify(LOG_DATE)}] || { sessions: {} })
        .sessions[${JSON.stringify(sessionId)}] || null
    `);
    assert.ok(stored, 'nothing was persisted to br_tracker for the logged date');
    /* Address the deadlift by the item id in the saved snapshot — a session
     * logs several results, and the first key is the preparation drill. */
    const deadliftItemId = await page.evaluate(`
      (JSON.parse(localStorage.getItem("br_sessions") || "[]")
        .find(s => s.id === ${JSON.stringify(sessionId)}) || { phases: {} })
        .phases.activity.items.filter(i => i.ref === ${JSON.stringify(DEADLIFT.id)}).map(i => i.id)[0] || ""
    `);
    assert.ok(deadliftItemId, 'the deadlift item id is missing from the saved session snapshot');
    assert.deepEqual(
      stored.results[deadliftItemId].actual.sets,
      SETS.map((s) => ({ weight: s.weight, reps: s.reps, warmup: false })),
      'the logged sets do not match what was typed into the form'
    );

    /* Progress reads completed sessions only, so the flow needs the mark. */
    await page.run(`
      Array.from(document.querySelectorAll('#tracker-active button'))
        .find(b => b.textContent.trim() === 'Mark Complete').click();
    `);
    await page.waitFor(`
      Array.from(document.querySelectorAll('#tracker-active button'))
        .some(b => b.textContent.trim() === 'Completed')
    `, { label: 'the session shows as Completed' });

    const complete = await page.evaluate(`
      (JSON.parse(localStorage.getItem("br_tracker") || "{}")[${JSON.stringify(LOG_DATE)}] || { sessions: {} })
        .sessions[${JSON.stringify(sessionId)}] || {}
    `);
    assert.equal(complete.complete, true, 'complete flag was not persisted');
  });

  it('shows the logged session in the Progress rep/volume history', async () => {
    await page.evaluate('document.querySelector(\'.nav-btn[data-view="progress"]\').click()');
    await page.waitFor('document.querySelector(\'section[data-view="progress"]\').classList.contains("active")',
      { label: 'progress view active' });
    await page.waitFor('document.querySelector("#progress-ex").options.length > 0',
      { label: 'progress exercise dropdown populated' });

    const options = await page.evaluate(
      'Array.from(document.querySelector("#progress-ex").options).map(o => ({ value: o.value, text: o.textContent }))'
    );
    assert.ok(
      options.some((o) => o.value === DEADLIFT.id),
      `progress dropdown is missing ${DEADLIFT.id}: ${JSON.stringify(options)}`
    );

    await page.run(`
      const sel = document.querySelector('#progress-ex');
      sel.value = ${JSON.stringify(DEADLIFT.id)};
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    `);

    const row = await page.waitFor(`
      (() => {
        const tr = Array.from(document.querySelectorAll('#progress-history tr'))
          .find(r => r.children[0] && r.children[0].textContent.trim() === ${JSON.stringify(LOG_DATE)});
        if (!tr) return null;
        return Array.from(tr.children).map(td => td.textContent.trim());
      })()
    `, { label: 'a progress history row for the logged date' });
    /* volume = 2 sets x 135 x 5 reps */
    assert.deepEqual(row.slice(0, 4), [LOG_DATE, String(SETS.length), String(SETS.length * 5), '1350'],
      'date/sets/reps/volume row is wrong');

    /* Best e1RM in the table must equal what the shipped onerm module derives.
     * Recomputed independently here (raw log -> snapshot ref map -> keyed
     * workouts -> best1RM) rather than reading the rendered number back, so a
     * wrong value in the table cannot agree with a wrong expectation. */
    const expected = await page.evaluate(`
      (() => {
        const logs = JSON.parse(localStorage.getItem("br_tracker") || "{}");
        const sessions = JSON.parse(localStorage.getItem("br_sessions") || "[]");
        const refOf = {};
        Object.keys(logs).filter(d => d !== "schemaVersion").forEach(d => {
          Object.keys((logs[d] && logs[d].sessions) || {}).forEach(sid => {
            const e = logs[d].sessions[sid];
            const snap = (e && e.snapshot) || sessions.filter(s => s.id === sid)[0];
            if (!snap || !snap.phases) return;
            Object.keys(snap.phases).forEach(p => (snap.phases[p].items || []).forEach(i => {
              if (i && i.id && i.ref) refOf[i.id] = i.ref;
            }));
          });
        });
        const keyed = window.BR_HISTORY_ADAPTER.keyWorkoutsByRef(
          window.BR_HISTORY_ADAPTER.workoutsFromLogs(logs), id => refOf[id]);
        return window.BR_ONE_RM.best1RM(keyed, ${JSON.stringify(DEADLIFT.id)});
      })()
    `);
    assert.ok(expected && expected.est > 0, 'onerm derived no estimate from the logged sets');
    assert.equal(row[4], String(expected.est), 'table best e1RM disagrees with onerm.best1RM');
    assert.match(
      await page.evaluate('document.querySelector("#progress-best").textContent'),
      /All-time best estimated 1RM/
    );

    /* The activity heatmap and the history table both render from the same log. */
    assert.ok(
      await page.evaluate('document.querySelectorAll("#progress-heat *").length > 0'),
      'the activity heatmap rendered nothing'
    );
    assert.equal(
      await page.evaluate('document.querySelector("#progress-empty").textContent.trim()'),
      '',
      'progress still reports no history despite a logged session'
    );
  });

  it('survives a full reload: the logged set is still in Progress', async () => {
    await page.goto(`${site.origin}/index.html#progress`, {
      ready: readyFor('progress'),
    });
    await page.waitFor('document.querySelector("#progress-ex").options.length > 0',
      { label: 'progress populated after reload' });
    const options = await page.evaluate(
      'Array.from(document.querySelector("#progress-ex").options).map(o => o.value)'
    );
    assert.ok(options.includes(DEADLIFT.id), 'persisted log did not repopulate Progress after reload');
    assert.deepEqual(page.pageErrors, [], `uncaught page errors: ${page.pageErrors.join(' | ')}`);
  });
});