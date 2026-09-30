#!/usr/bin/env node
/**
 * Measure first-load cost: transferred bytes, request count, and timing.
 *
 * Why this exists: issue #18 asked for a recorded baseline, not an
 * impression. Every number this prints comes from a real Chrome instance
 * loading the real tree over real HTTP, with the HTTP cache disabled and the
 * network shaped to a named profile. Re-run it after any change and diff the
 * JSON.
 *
 * It is a measurement tool, not a build step. It has no dependencies
 * (node:http, node:zlib, node:child_process, and the WebSocket client that
 * ships inside Node 22+), it writes nothing into the shipped tree except an
 * optional report file, and deleting it would not change what the app does.
 *
 * Usage:
 *   node scripts/measure-first-load.mjs
 *   node scripts/measure-first-load.mjs --profile=fast3g
 *   node scripts/measure-first-load.mjs --json=out.json --headed
 *
 *   --open-plate=<exerciseId>
 *       After first load settles, open that exercise's coach modal and report
 *       what the plate cost. First load fetches no images at all, so the only
 *       honest way to talk about the ~20 MiB of plates is to measure the
 *       interaction that actually pulls them.
 *
 * Profiles emulate Chrome DevTools' own presets: cable (unthrottled),
 * fast3g, slow4g, and the shapes we call out in the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- profiles */
// Shapes mirror Chrome DevTools' Network conditions panel. Values are
// bytes/second for throughput and milliseconds for latency, which is what
// Network.emulateNetworkConditions expects.
const PROFILES = {
  cable: { label: 'Cable (unthrottled)', latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  fast3g: { label: 'Fast 3G', latency: 562.5 * 2, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 },
  slow4g: { label: 'Slow 4G', latency: 150 * 2, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 },
  mobile3g: { label: 'Regular 3G', latency: 300 * 2, downloadThroughput: 400 * 1024 / 8 * 0.9, uploadThroughput: 400 * 1024 / 8 * 0.9 }
};

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = name => args.includes(`--${name}`);

const profileName = opt('profile', 'fast3g');
if (!PROFILES[profileName]) {
  console.error(`FAIL: unknown profile "${profileName}". Known: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}
const profile = PROFILES[profileName];
// 0 = let the OS pick a free port, so concurrent runs never collide.
let port = Number(opt('port', 0)) || 0;
const settleMs = Number(opt('settle', 2500));
const jsonOut = opt('json', null);
const headed = flag('headed');
const openPlate = opt('open-plate', null);
// Three by default: enough to see through the noise on a throttled link.
const repeatCount = Math.max(1, Number(opt('runs', 3)) || 3);

const verbose = flag('verbose');
const trace = (...args) => { if (verbose) console.error('[measure]', ...args); };

/* ------------------------------------------------------------ static server */
// GitHub Pages serves this tree over HTTPS with HTTP/2, which multiplexes all
// 42 scripts onto one connection. An HTTP/1.1 test server instead serialises
// them into seven queueing rounds and manufactures a latency staircase the
// real deployment does not have — the measurement would report a problem that
// users never hit, and then "fix" it.
//
// So this serves TLS + HTTP/2 with a throwaway self-signed certificate, and
// launches Chrome with --ignore-certificate-errors. Certificate trust is
// irrelevant to byte counts and timings; the protocol is everything.
const h2 = await import('node:http2');
const { execFileSync } = await import('node:child_process');
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg)/;

function ensureCert(dir) {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  // A self-signed cert for 127.0.0.1, valid for two days, never leaves the
  // temp dir. Generated with the openssl that ships alongside git; if it is
  // missing the caller falls back to plain HTTP/1.1 and says so.
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'
  ], { stdio: 'ignore' });
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

function payloadFor(file, acceptEncoding) {
  const body = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  // GitHub Pages serves these gzipped; matching that keeps the byte numbers honest.
  const wantsGzip = /\bgzip\b/.test(acceptEncoding || '') && COMPRESSIBLE.test(type);
  const payload = wantsGzip ? zlib.gzipSync(body, { level: 9 }) : body;
  const headers = {
    ':status': 200,
    'content-type': type,
    // Must describe the bytes actually sent, not the ones we started from.
    'content-length': String(payload.length),
    'cache-control': 'no-cache'
  };
  if (wantsGzip) headers['content-encoding'] = 'gzip';
  return { headers, payload };
}

function resolveAsset(url) {
  let rel = decodeURIComponent(url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

// Chrome only speaks HTTP/2 over TLS (or via Alt-Svc), never over cleartext,
// so this is a secure server. Without a usable certificate we fall back to
// HTTP/1.1 and let the protocol report say so, rather than failing outright.
const certDir = path.join(os.tmpdir(), 'br-measure-tls');
let server = null;
let scheme = 'https';
let tlsReady = false;
try {
  fs.mkdirSync(certDir, { recursive: true });
  server = h2.createSecureServer(ensureCert(certDir));
  tlsReady = true;
} catch (err) {
  server = h2.createServer();
  scheme = 'http';
  console.error(`WARN: no TLS certificate (${err.message.split('\n')[0]}); serving HTTP/1.1.`);
  console.error('      Timings will include a request-queueing penalty that GitHub Pages does not have.');
}
// Only the 'stream' event is handled. Adding a 'request' listener puts
// node:http2 into HTTP/1 compatibility mode, which answers the HTTP/2 preface
// with a response Chrome rejects as ERR_INVALID_HTTP_RESPONSE.
server.on('stream', (stream, headers) => {
  const file = resolveAsset(headers[':path'] || '/');
  if (!file) {
    stream.respond({ ':status': 404, 'content-type': 'text/plain' });
    return stream.end('not found');
  }
  const { headers: out, payload } = payloadFor(file, headers['accept-encoding']);
  stream.respond(out);
  stream.end(payload);
});

/* ------------------------------------------------------------------- chrome */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

await new Promise((resolve, reject) => {
  server.once('error', err => reject(new Error(`static server could not listen — ${err.message}. Pass --port=<free port>.`)));
  server.listen(port, '127.0.0.1', resolve);
});
port = server.address().port;

const chrome = findChrome();
if (!chrome) {
  console.error('FAIL: no Chrome/Chromium found. Set CHROME_PATH to a browser binary.');
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(path.join(process.env.TMPDIR || process.env.TMP || '.', 'br-measure-'));
const chromeArgs = [
  `--user-data-dir=${userDataDir}`,
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-features=Translate,OptimizationHints,MediaRouter',
  '--headless=new',
  'about:blank'
];
if (tlsReady) {
  // The certificate is self-signed and thrown away every run. It exists only
  // so Chrome will negotiate HTTP/2, which is what GitHub Pages serves.
  chromeArgs.splice(2, 0, '--ignore-certificate-errors');
}
if (headed) chromeArgs.splice(chromeArgs.indexOf('--headless=new'), 1);

const chromeProc = spawn(chrome, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
chromeProc.stderr.on('data', d => { stderr += d; });

// A hung browser must fail the run, not the shell that invoked it.
const watchdog = setTimeout(() => {
  console.error(`FAIL: measurement did not finish within 180 s.\n${stderr}`);
  chromeProc.kill();
  server.close();
  process.exit(1);
}, 180000);
watchdog.unref?.();

async function devtoolsPort() {
  const marker = path.join(userDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 400; i++) {
    if (fs.existsSync(marker)) {
      let text = null;
      // Chrome holds this file open while writing it, so a read can land
      // mid-write on Windows and fail with EBUSY. That is a retry, not a fault.
      try { text = fs.readFileSync(marker, 'utf8').split('\n'); } catch { text = null; }
      if (text && text[0] && text[0].trim()) return Number(text[0].trim());
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Chrome did not report a DevTools port.\n${stderr}`);
}

/* ------------------------------------------------------------- CDP plumbing */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data || '')})`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  on(fn) { this.listeners.push(fn); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

function httpJson(devtoolsPortNumber, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: devtoolsPortNumber, path: pathname, method, headers: { Host: `127.0.0.1:${devtoolsPortNumber}` } }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error(`bad JSON from ${pathname}: ${body.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

/**
 * Attach to a fresh page target.
 *
 * The browser-level endpoint (/devtools/browser/<id>) is the usual way to do
 * this, but it is not reachable in every environment — some hardened Windows
 * setups refuse the upgrade outright. The per-page socket from
 * PUT /json/new?url= is always served, so this drives the page directly and
 * needs no session multiplexing. Same measurements, one less dependency on
 * the environment being friendly.
 */
async function connect(url) {
  const p = await devtoolsPort();
  // The URL goes in the query string verbatim; encoding the ':' breaks the route.
  const target = await httpJson(p, `/json/new?${url}`, 'PUT');
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error(`Chrome did not hand back a page target: ${JSON.stringify(target).slice(0, 200)}`);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const opened = await Promise.race([
    once(ws, 'open').then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 10000))
  ]);
  if (!opened) throw new Error(`could not open the page DevTools socket at ${target.webSocketDebuggerUrl}`);
  return { cdp: new Cdp(ws), targetId: target.id };
}

const kb = n => (n / 1024).toFixed(1) + ' kB';
const ms = n => Math.round(n) + ' ms';

/* ------------------------------------------------------------------- drive */
const base = `${scheme}://127.0.0.1:${port}/index.html`;

/**
 * One cold load, in its own page target so no cache or connection state
 * leaks between runs.
 */
async function runOnce() {
const { cdp } = await connect('about:blank');
trace('page devtools socket open');

await cdp.send('Network.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
});
if (profile.latency || profile.downloadThroughput > 0) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latency,
    downloadThroughput: profile.downloadThroughput,
    uploadThroughput: profile.uploadThroughput
  });
}
// Cold cache, twice over: the network layer's cache, then the browser's.
await cdp.send('Network.clearBrowserCache').catch(() => {});

const records = new Map();
let loadFired = false;
cdp.on(msg => {
  if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, type, wallTime } = msg.params;
    records.set(requestId, {
      url: request.url,
      type: type || 'Other',
      method: request.method,
      startedAt: wallTime,
      encoded: 0,
      status: 0,
      fromCache: false,
      failed: false
    });
  } else if (msg.method === 'Network.responseReceived') {
    const rec = records.get(msg.params.requestId);
    if (rec) {
      rec.status = msg.params.response.status;
      rec.fromCache = !!msg.params.response.fromDiskCache;
      rec.protocol = msg.params.response.protocol;
      rec.mimeType = (msg.params.response.mimeType || '').split(';')[0];
    }
  } else if (msg.method === 'Network.loadingFinished') {
    const rec = records.get(msg.params.requestId);
    if (rec) rec.encoded = msg.params.encodedDataLength || 0;
  } else if (msg.method === 'Network.loadingFailed') {
    const rec = records.get(msg.params.requestId);
    if (rec) { rec.failed = true; rec.error = msg.params.errorText; }
  } else if (msg.method === 'Page.loadEventFired') {
    loadFired = true;
  }
});

const wallStart = Date.now();
await cdp.send('Page.navigate', { url: base });
for (let i = 0; i < 400 && !loadFired; i++) await new Promise(r => setTimeout(r, 25));
const loadWallMs = Date.now() - wallStart;
trace('load event after', loadWallMs, 'ms; loadFired =', loadFired);
if (!loadFired) console.error('WARN: the load event never fired within 10 s; reporting what did arrive.');
// Give late work (lazy images, deferred fetches) a fixed window to show up.
await new Promise(r => setTimeout(r, settleMs));

const { result } = await cdp.send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: false,
  expression: `(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = {};
    for (const entry of performance.getEntriesByType('paint')) paints[entry.name] = entry.startTime;
    const resources = performance.getEntriesByType('resource').map(r => ({
      name: r.name, type: r.initiatorType, start: r.startTime, end: r.responseEnd,
      transfer: r.transferSize, encoded: r.encodedBodySize, decoded: r.decodedBodySize
    }));
    return {
      domContentLoaded: nav.domContentLoadedEventEnd || 0,
      loadEvent: nav.loadEventEnd || 0,
      responseEnd: nav.responseEnd || 0,
      paints, resources,
      imageRequests: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'img').length,
      layoutCount: document.querySelectorAll('*').length
    };
  })()`
});
const perf = result.value;

/* ------------------------------------------------------------------ report */
const urls = new Map();
for (const r of perf.resources) {
  // Strip scheme+host so local assets read as paths, then the cache-buster.
  const short = r.name.replace(/^https?:\/\/[^/]+\//, '').split('?')[0] || r.name;
  const prev = urls.get(short) || { bytes: 0, count: 0, type: r.type, encoded: 0 };
  prev.bytes += r.transfer;
  prev.encoded += r.encoded;
  prev.count += 1;
  urls.set(short, prev);
}
const navRec = [...records.values()].find(r => r.url.startsWith(base));
trace('nav record:', JSON.stringify(navRec));
trace('resource entries from the page:', perf.resources.length);

// A failed request still reports an encodedDataLength, so a broken server
// reads as a fast, complete load. Refuse to publish numbers from a run where
// anything failed — a measurement that cannot fail is not a measurement.
const failed = [...records.values()].filter(r => r.failed);
if (failed.length) {
  throw new Error(
    `${failed.length} request(s) failed during the run; the numbers would be fiction:\n` +
    failed.slice(0, 10).map(f => `  ${f.error}  ${f.url}`).join('\n') +
    '\n      Check the static server before trusting any timing from this run.'
  );
}
const docBytes = navRec ? navRec.encoded : 0;
const totalBytes = docBytes + [...urls.values()].reduce((sum, v) => sum + v.bytes, 0);
// A silent HTTP/1.1 fallback would quietly reinstate the queueing artefact
// this server exists to remove, so state the protocol in the output.
const navProtocol = navRec ? navRec.protocol : 'unknown';
const h2Seen = navProtocol === 'h2';
if (!h2Seen) {
  console.error(`WARN: served over ${navProtocol}, not HTTP/2. Request-queueing latency is inflated`);
  console.error('      relative to GitHub Pages; treat the timings as a worst case.');
}

// Anything not served from this tree: third-party CSS, fonts, beacons. A
// guest-mode app that blocks first paint on one of these is worth seeing.
// Compare against the origin, not the document URL, or every local asset
// matches the "external" test and the section lists the whole page.
const origin = new URL(base).origin;
const externals = [...records.values()]
  .filter(r => !r.url.startsWith(origin) && !r.url.startsWith('data:') && r.type !== 'Other')
  .map(r => ({ url: r.url, type: r.type, bytes: r.encoded, status: r.status, failed: !!r.failed }));

const top = [...urls.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
const imageTop = top.filter(([, v]) => v.type === 'img');
const imageBytes = imageTop.reduce((sum, [, v]) => sum + v.bytes, 0);

// Optional second phase: open an exercise modal and price the plate.
// Images are never fetched during first load, so this is the only place the
// ~20 MiB of plates shows up in a measurement at all.
let plate = null;
if (openPlate) {
  const before = records.size;
  const t0 = Date.now();
  await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      // openExerciseModal is module-private, so this drives the real UI:
      // search the exercise library for a card and click it, exactly as a user
      // would. Anything cleverer would measure a code path nobody takes.
      const query = ${JSON.stringify(openPlate)};
      // The cards live in the library view, which is not the default. Click the
      // nav button a user would click rather than reaching past the UI.
      const navBtn = document.querySelector('[data-view="library"]');
      if (navBtn) { navBtn.click(); await new Promise(r => setTimeout(r, 500)); }
      const input = document.querySelector('#search-input');
      if (input) {
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
      }
      const card = document.querySelector('#exercise-grid .card, #exercise-grid > *');
      if (!card) return 'no card in #exercise-grid (cards found: ' + document.querySelectorAll('#exercise-grid *').length + ')';
      card.click();
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const img = document.querySelector('.exercise-coach img');
        if (img && img.complete && img.naturalWidth > 0) return 'ok ' + img.getAttribute('src');
        await new Promise(r => setTimeout(r, 100));
      }
      const img = document.querySelector('.exercise-coach img');
      return img ? 'image present but never completed: ' + img.getAttribute('src') : 'no plate image rendered';
    })()`
  }).then(r => trace('plate probe:', r.result.value));
  const newRecords = [...records.values()].slice(before);
  const images = newRecords.filter(r => r.type === 'Image');
  plate = {
    exerciseId: openPlate,
    wallMs: Date.now() - t0,
    imageRequests: images.length,
    imageBytes: images.reduce((s, r) => s + r.encoded, 0),
    images: images.map(r => ({ url: r.url.replace(/^https?:\/\/[^/]+\//, ''), bytes: r.encoded }))
  };
  trace('plate probe result:', JSON.stringify(plate));
}

cdp.ws.close();

return {
  document: { url: 'index.html', transferBytes: docBytes },
  protocol: { http2: h2Seen, negotiated: navProtocol },
  externalRequests: externals,
  totals: {
    transferBytes: totalBytes,
    requestCount: urls.size + 1,
    imageRequestCount: perf.imageRequests,
    imageTransferBytes: imageBytes
  },
  timing: {
    responseEnd: perf.responseEnd,
    domContentLoaded: perf.domContentLoaded,
    loadEvent: perf.loadEvent,
    firstPaint: perf.paints['first-paint'] || null,
    firstContentfulPaint: perf.paints['first-contentful-paint'] || null,
    observedLoadWallMs: loadWallMs
  },
  assets: top.map(([name, v]) => ({ name, type: v.type, requests: v.count, transferBytes: v.bytes, encodedBytes: v.encoded })),
  plate
};
}

/* ----------------------------------------------------------------- repeats */
// One run on a throttled connection is noisy enough to invent an effect that
// is not there. The median of several cold loads is the number worth quoting;
// --runs controls the count and every raw sample is kept in the JSON.
const runs = [];
for (let i = 0; i < repeatCount; i++) {
  trace(`run ${i + 1}/${repeatCount}`);
  try {
    runs.push(await runOnce());
  } catch (err) {
    console.error(`FAIL: run ${i + 1}/${repeatCount} did not complete.\n${err.message}`);
    chromeProc.kill();
    server.close();
    process.exit(1);
  }
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const first = runs[0];
const medianTiming = key => median(runs.map(r => r.timing[key] ?? 0));

const report = {
  generatedAt: new Date().toISOString(),
  profile: { name: profileName, ...profile },
  device: '390x844 @2x, mobile emulation',
  runs: runs.length,
  summary: 'medians across runs',
  document: first.document,
  protocol: first.protocol,
  externalRequests: first.externalRequests,
  totals: first.totals,
  timing: {
    responseEnd: medianTiming('responseEnd'),
    domContentLoaded: medianTiming('domContentLoaded'),
    loadEvent: medianTiming('loadEvent'),
    firstPaint: medianTiming('firstPaint'),
    firstContentfulPaint: medianTiming('firstContentfulPaint')
  },
  rawTiming: runs.map(r => r.timing),
  assets: first.assets,
  plate: first.plate
};

const { totals, protocol } = first;
console.log(`\nbattle-rhythm first-load measurement — ${profile.label}`);
console.log('='.repeat(64));
console.log(`runs                  ${runs.length} (median reported)`);
console.log(`index.html            ${kb(first.document.transferBytes)}`);
console.log(`total transferred     ${kb(totals.transferBytes)}  (${(totals.transferBytes / 1024 / 1024).toFixed(2)} MiB) across ${totals.requestCount} requests`);
console.log(`image requests        ${totals.imageRequestCount} (${kb(totals.imageTransferBytes)})`);
console.log(`protocol              ${protocol.negotiated}${protocol.http2 ? ' (matches GitHub Pages)' : ' (NOT HTTP/2 — timings are a worst case)'}`);
console.log(`domContentLoaded      ${ms(report.timing.domContentLoaded)}`);
console.log(`load event            ${ms(report.timing.loadEvent)}`);
console.log(`first paint           ${report.timing.firstPaint ? ms(report.timing.firstPaint) : 'n/a'}`);
console.log(`first contentful      ${report.timing.firstContentfulPaint ? ms(report.timing.firstContentfulPaint) : 'n/a'}`);
console.log('\nlargest contributors');
console.log('-'.repeat(64));
const totalBytes = totals.transferBytes;
const top = first.assets;
for (const [i, v] of top.slice(0, 20).entries()) {
  const pct = ((v.transferBytes / totalBytes) * 100).toFixed(1);
  console.log(`${String(i + 1).padStart(2)}. ${kb(v.transferBytes).padStart(10)}  ${pct.padStart(5)}%  ${v.type.padEnd(10)} ${v.name}${v.requests > 1 ? ` x${v.requests}` : ''}`);
}
const others = top.slice(20).reduce((sum, v) => sum + v.transferBytes, 0);
if (others) console.log(`    ${kb(others).padStart(10)}          rest of ${top.length - 20} assets`);

if (first.plate) {
  console.log('\nplate probe (after first load, on user interaction)');
  console.log('-'.repeat(64));
  console.log(`  exercise       ${first.plate.exerciseId}`);
  console.log(`  image requests ${first.plate.imageRequests}`);
  console.log(`  bytes          ${kb(first.plate.imageBytes)}`);
  console.log(`  wall time      ${ms(first.plate.wallMs)}`);
  for (const i of first.plate.images) console.log(`    ${kb(i.bytes).padStart(10)}  ${i.url}`);
}

if (first.externalRequests.length) {
  console.log('\nthird-party requests (not served from this tree)');
  console.log('-'.repeat(64));
  for (const e of first.externalRequests) {
    console.log(`${kb(e.bytes).padStart(10)}  ${String(e.status || (e.failed ? 'FAILED' : '?')).padEnd(6)} ${e.type.padEnd(10)} ${e.url.slice(0, 80)}`);
  }
} else {
  console.log('\nthird-party requests   none — the load is entirely local assets');
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nJSON written to ${jsonOut}`);
}

chromeProc.kill();
server.close();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(0);
