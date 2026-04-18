#!/usr/bin/env node
/**
 * Unified status check for all ERP services.
 * Hits each service's /health endpoint and prints a dashboard.
 */

'use strict';

const http = require('http');

const SERVICES = [
  { name: 'techno-kol-ops',   port: 3200, path: '/api/health' },
  { name: 'onyx-procurement', port: 3100, path: '/api/health' },
  { name: 'onyx-ai',          port: 3300, path: '/health'     },
  { name: 'payroll-autonomous', port: 5173, path: '/'         },
  { name: 'vm-task-runner',   port: 3400, path: '/health'     },
];

function check(svc, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.get(
      { host: 'localhost', port: svc.port, path: svc.path, timeout: timeoutMs },
      (res) => {
        const ms = Date.now() - started;
        resolve({ ...svc, ok: res.statusCode < 500, status: res.statusCode, ms });
        res.resume();
      }
    );
    req.on('error', () => resolve({ ...svc, ok: false, status: 'DOWN', ms: Date.now() - started }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ...svc, ok: false, status: 'TIMEOUT', ms: timeoutMs });
    });
  });
}

(async () => {
  console.log('\n  Techno-Kol Uzi ERP 2026 — Service Status');
  console.log('  ' + '─'.repeat(55));
  const results = await Promise.all(SERVICES.map((s) => check(s)));
  for (const r of results) {
    const icon = r.ok ? '[OK]  ' : '[DOWN]';
    console.log(`  ${icon}  ${r.name.padEnd(22)} :${r.port}  ${String(r.status).padEnd(8)} ${r.ms}ms`);
  }
  const allOk = results.every((r) => r.ok);
  console.log('  ' + '─'.repeat(55));
  console.log(`  ${allOk ? 'All systems operational.' : 'Some services are not responding.'}\n`);
  process.exit(allOk ? 0 : 1);
})();
