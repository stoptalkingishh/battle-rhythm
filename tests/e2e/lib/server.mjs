/* Zero-dependency static file server for the E2E suite.
 *
 * The app is a static site with no build step, so serving the repository root
 * over http is the whole "build". file:// would work too, but http gives the
 * page an opaque-ish origin closer to the deployed Pages site and keeps
 * relative asset paths identical to production.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

/** Serve `root` on an ephemeral port. Resolves with { origin, close, requests }. */
export function serve(root) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const resolved = path.join(root, pathname);
    /* Refuse anything that escapes the root (path traversal guard). */
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      res.writeHead(403).end('forbidden');
      requests.push({ path: pathname, status: 403 });
      return;
    }
    fs.readFile(resolved, (err, body) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        requests.push({ path: pathname, status: 404 });
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(body);
      requests.push({ path: pathname, status: 200 });
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
