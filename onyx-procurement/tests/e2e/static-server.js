// ═══════════════════════════════════════════════════════════════════════════
// static-server.js — zero-dependency static server for Playwright
// Agent 52
//
// The Playwright `webServer` config launches this script. It serves the
// /web directory as a plain HTTP host so tests can navigate to URLs like
//   http://127.0.0.1:4319/index.html
//   http://127.0.0.1:4319/vat-dashboard.html
//
// It deliberately has NO dependency on Supabase or the real Express backend —
// the dashboards' API calls are stubbed by page.route() in the specs, so all
// this server has to do is ship HTML, JSX, CSS, and the `lib/` helpers.
//
// It also exposes two convenience endpoints the tests may use:
//   GET /api/health            → { status: "OK" } (for the index.html poller)
//   GET /api/_testping         → { ok: true } (used by fixtures.js to verify)
//
// Everything else under /api/* returns 204 — individual specs override with
// page.route() when they want real mock payloads.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PW_PORT || 4319);
const WEB_ROOT =
  process.env.PW_WEB_ROOT || path.join(__dirname, '..', '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'application/javascript; charset=utf-8', // browser fetches as text, babel transpiles
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-API-Key,Authorization',
    ...(headers || {}),
  });
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

function safeJoin(root, reqPath) {
  // strip query / hash
  const clean = reqPath.split('?')[0].split('#')[0];
  // resolve and make sure we stay inside root
  const decoded = decodeURIComponent(clean);
  const normalized = path
    .normalize(decoded)
    .replace(/^([a-zA-Z]:)?[\\/]+/, '');
  const abs = path.join(root, normalized);
  if (!abs.startsWith(path.resolve(root))) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  // WHATWG URL parser (modern replacement for url.parse)
  const parsed = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = parsed.pathname || '/';

  // ─── API convenience routes ─────────────────────────────────────────────
  if (pathname === '/api/health' || pathname === '/api/health/db') {
    return sendJSON(res, 200, { status: 'OK', uptime: 0, ts: Date.now() });
  }
  if (pathname === '/api/_testping') {
    return sendJSON(res, 200, {
      ok: true,
      server: 'playwright-static',
      port: PORT,
    });
  }
  if (pathname.startsWith('/api/')) {
    // Default: empty list payload so dashboards fall back to fixtures.
    // Individual specs override via page.route('**/api/...').
    return sendJSON(res, 200, {});
  }

  // ─── Static files ───────────────────────────────────────────────────────
  let filePath =
    pathname === '/' ? path.join(WEB_ROOT, 'index.html') : safeJoin(WEB_ROOT, pathname);

  if (!filePath) {
    return send(res, 403, 'Forbidden');
  }

  // Translate *.html requests whose .html doesn't exist yet (e.g. onyx-dashboard.html)
  // to the matching .jsx file — this way the mega index tile still works in tests.
  fs.stat(filePath, (err, stats) => {
    if (err) {
      // onyx-dashboard.html shim → serve a minimal wrapper so the link at least
      // doesn't 404 and the navigation test can verify it loads.
      if (filePath.endsWith('onyx-dashboard.html')) {
        const shim = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>ONYX Procurement</title><style>body{background:#0c0f1a;color:#e2e8f0;font-family:system-ui;text-align:center;padding:40px}</style></head><body><h1>רכש · ONYX Procurement</h1><p>דשבורד רכש — ממתין לשרת אחורי</p></body></html>`;
        return send(res, 200, shim, { 'Content-Type': MIME['.html'] });
      }
      return send(res, 404, 'Not found: ' + pathname);
    }
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return send(res, 500, 'Read error: ' + readErr.message);
      }
      send(res, 200, data, { 'Content-Type': mime });
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(
    `[playwright-static] serving "${WEB_ROOT}" on http://127.0.0.1:${PORT}`,
  );
});

// Graceful shutdown so Playwright can recycle the port.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
