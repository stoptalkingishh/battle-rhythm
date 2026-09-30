/* Minimal Chrome DevTools Protocol client.
 *
 * Speaks CDP over `--remote-debugging-pipe` (fd 3 = browser reads, fd 4 =
 * browser writes) rather than the WebSocket endpoint. Pipe transport is
 * NUL-delimited JSON, which is a few dozen lines on top of node:child_process;
 * the WebSocket endpoint would need a frame codec or a dependency. Either way
 * there is no build step and nothing to install.
 *
 * A browser executable is located in `findBrowser()`; override with
 * BR_CHROME=/path/to/chrome. On CI (ubuntu-latest) Chrome is preinstalled at
 * /usr/bin/google-chrome, so the E2E suite needs no install step.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = {
  win32: [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
};

/** Absolute path of a usable Chromium-family browser, or null. */
export function findBrowser() {
  if (process.env.BR_CHROME) return process.env.BR_CHROME;
  for (const candidate of CANDIDATES[process.platform] || []) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* unreadable candidate: keep looking */ }
  }
  return null;
}

class Connection {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.buffer = '';
    this.closed = false;
    this.write = child.stdio[3];
    this.read = child.stdio[4];
    this.read.setEncoding('utf8');
    this.read.on('data', (chunk) => this._onData(chunk));
    this.read.on('close', () => this._onClose(new Error('CDP pipe closed')));
    this.read.on('error', (err) => this._onClose(err));
  }

  _onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\0')) !== -1) {
      const raw = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (!raw) continue;
      let message;
      try { message = JSON.parse(raw); } catch { continue; }
      this._dispatch(message);
    }
  }

  _onClose(err) {
    if (this.closed) return;
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  _dispatch(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (CDP ${message.error.code})`));
      else resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  on(listener) { this.listeners.push(listener); }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error(`CDP connection closed before ${method}`));
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write.write(JSON.stringify(payload) + '\0');
    });
  }
}

/** Open a headless page and return { sessionId, connection, close }. */
export async function launch() {
  const executable = findBrowser();
  if (!executable) {
    throw new Error(
      'No Chromium-family browser found. Install Chrome or set BR_CHROME to its path.'
    );
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'br-e2e-'));
  const child = spawn(executable, [
    '--headless=new',
    '--remote-debugging-pipe',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    '--window-size=1280,900',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'], windowsHide: true });

  const stderr = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { if (stderr.length < 200) stderr.push(chunk); });

  const connection = new Connection(child);
  const close = () => {
    try { child.kill(); } catch { /* already gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  };

  let version;
  try {
    version = await connection.send('Browser.getVersion');
  } catch (err) {
    close();
    throw new Error(`Chrome did not start: ${err.message}\n${stderr.join('')}`);
  }

  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });

  return {
    connection,
    sessionId,
    version,
    stderr: () => stderr.join(''),
    close,
  };
}
