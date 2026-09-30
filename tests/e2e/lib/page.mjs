/* Page-level driver: navigate, evaluate in the page, and wait for conditions.
 *
 * Everything here goes through Runtime.evaluate against a real page, so the
 * tests exercise the shipped js/ files and index.html exactly as a browser
 * would — no module is re-implemented or stubbed.
 */

const DEFAULT_TIMEOUT = 15000;

export class Page {
  constructor(connection, sessionId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.reloads = 0;
    connection.on((message) => this._onEvent(message));
  }

  _onEvent(message) {
    if (message.sessionId !== this.sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails || {};
      const text = d.exception && (d.exception.description || d.exception.value);
      this.pageErrors.push(String(text || d.text || 'unknown page error'));
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      this.consoleErrors.push(
        (message.params.args || []).map((a) => String(a.description ?? a.value)).join(' ')
      );
    }
  }

  send(method, params) { return this.connection.send(method, params, this.sessionId); }

  /** Evaluate an expression in the page and return its value. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(${expression})`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      const text = d.exception && (d.exception.description || d.exception.value);
      throw new Error(`page evaluate failed: ${text || d.text}`);
    }
    return result.result.value;
  }

  /* Run a statement body (const declarations, several statements, a trailing
   * `return`) in the page. Kept separate from evaluate() because an expression
   * and a statement body cannot share one wrapper. */
  async run(body) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => { ${body} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      const text = d.exception && (d.exception.description || d.exception.value);
      throw new Error(`page run failed: ${text || d.text}`);
    }
    return result.result.value;
  }

  /**
   * Navigate and wait for the load event, then for `ready` to hold.
   *
   * A `reload` counter is added to the URL because a bare hash change is a
   * same-document navigation: no load event fires, and the page's boot code
   * never re-runs, so the "does it survive a reload" assertions would pass
   * against stale state.
   */
  async goto(pathAndHash, { ready = 'document.readyState === "complete"', timeout = DEFAULT_TIMEOUT } = {}) {
    this.consoleErrors = [];
    this.pageErrors = [];
    const url = `${pathAndHash.split('#')[0]}?e2e=${++this.reloads}#${pathAndHash.split('#')[1] || ''}`;
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`load event timed out for ${url}`)), timeout);
      const off = (message) => {
        if (message.sessionId === this.sessionId && message.method === 'Page.loadEventFired') {
          clearTimeout(timer);
          resolve();
        }
      };
      this.connection.on(off);
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Page.navigate', { url });
    await loaded;
    await this.waitFor(ready, { timeout });
  }

  /** Poll a boolean expression in the page until it is true. */
  async waitFor(expression, { timeout = DEFAULT_TIMEOUT, label = expression } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    for (;;) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (err) {
        last = err.message;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out after ${timeout}ms waiting for: ${label} (last value: ${JSON.stringify(last)})`);
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  /** Assert something inside the page, surfacing the reason in the failure. */
  async expect(expression, message) {
    const value = await this.evaluate(expression);
    if (!value) throw new Error(message || `page assertion failed: ${expression}`);
    return value;
  }
}
