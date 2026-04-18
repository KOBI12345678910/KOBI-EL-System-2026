#!/usr/bin/env node
/**
 * ONYX Queue Worker CLI
 *
 * Usage:
 *   node scripts/queue-worker.js <queue-name> [--concurrency=N] [--timeout=MS] [--once]
 *
 * Examples:
 *   node scripts/queue-worker.js pdf-generation
 *   node scripts/queue-worker.js email-sending --concurrency=4
 *   node scripts/queue-worker.js bank-matching --timeout=300000
 *   node scripts/queue-worker.js file-cleanup --once     # drain and exit
 *
 * Handlers are loaded from src/queue/handlers/<queue-name>.js if present.
 * If no handler file exists, the worker starts with a logging stub so jobs
 * can be observed without wiring a real implementation yet.
 *
 * Graceful shutdown: SIGINT / SIGTERM wait for in-flight jobs to complete.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const { Worker, QUEUE_TYPES } = require('../src/queue/worker');

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out[k] = v == null ? true : v;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function loadHandlers(queueName) {
  const handlerFile = path.join(__dirname, '..', 'src', 'queue', 'handlers', `${queueName}.js`);
  if (fs.existsSync(handlerFile)) {
    try {
      const mod = require(handlerFile);
      if (mod && typeof mod === 'object') return mod;
    } catch (err) {
      console.error(`ONYX worker: failed to load handlers from ${handlerFile}: ${err.message}`);
    }
  }
  // Fallback: log-only stub — useful for initial observation.
  return {
    __default__: async (payload, ctx) => {
      console.log(`[${queueName}] stub handler fired for type=${ctx.type}`, JSON.stringify(payload).slice(0, 400));
      return { stub: true };
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queueName = args._[0];

  if (!queueName || args.help || args.h) {
    console.log(`
ONYX queue worker

Usage:
  node scripts/queue-worker.js <queue-name> [options]

Known queues:
${Object.keys(QUEUE_TYPES).map((n) => '  - ' + n).join('\n')}

Options:
  --concurrency=N     run up to N jobs in parallel (default 1)
  --timeout=MS        per-job timeout in ms (default from QUEUE_TYPES)
  --poll=MS           idle poll interval (default 500)
  --once              drain queue once and exit (useful for cron-style runs)
  --help, -h          show this help
`);
    process.exit(queueName ? 0 : 1);
  }

  if (!QUEUE_TYPES[queueName]) {
    console.error(`Unknown queue '${queueName}'. Available: ${Object.keys(QUEUE_TYPES).join(', ')}`);
    process.exit(2);
  }

  const defaults = QUEUE_TYPES[queueName];
  const concurrency = parseInt(args.concurrency, 10) || 1;
  const jobTimeoutMs = parseInt(args.timeout, 10) || defaults.visibilityMs - 2000;
  const pollMs = parseInt(args.poll, 10) || 500;

  const handlers = loadHandlers(queueName);

  // build a simple pino-compatible console logger so we don't require the real
  // pino module here (avoids pulling deps for a bare-bones CLI)
  const logger = {
    info: (obj, msg) => console.log(JSON.stringify({ level: 'info', time: Date.now(), ...obj, msg })),
    warn: (obj, msg) => console.log(JSON.stringify({ level: 'warn', time: Date.now(), ...obj, msg })),
    error: (obj, msg) => console.error(JSON.stringify({ level: 'error', time: Date.now(), ...obj, msg })),
  };

  const worker = new Worker(queueName, {
    concurrency,
    jobTimeoutMs,
    pollMs,
    queueOpts: defaults,
    logger,
  });

  // register handlers — if __default__ is set, bind every incoming type to it
  if (handlers.__default__) {
    const defaultFn = handlers.__default__;
    const origClaim = worker.queue.claim.bind(worker.queue);
    worker.queue.claim = function () {
      const j = origClaim();
      if (j && !worker.handlers.has(j.type)) worker.register(j.type, defaultFn);
      return j;
    };
    // also register any explicit types from the module
    for (const [t, fn] of Object.entries(handlers)) {
      if (t !== '__default__') worker.register(t, fn);
    }
  } else {
    for (const [t, fn] of Object.entries(handlers)) worker.register(t, fn);
  }

  console.log(`ONYX queue-worker starting: queue=${queueName} concurrency=${concurrency} jobTimeoutMs=${jobTimeoutMs}`);
  worker.start();

  // graceful shutdown
  let shuttingDown = false;
  async function shutdown(sig) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`ONYX queue-worker: received ${sig}, draining in-flight jobs...`);
    try {
      await worker.stop();
      console.log('ONYX queue-worker: shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('ONYX queue-worker: shutdown error', err);
      process.exit(1);
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // --once: drain pending queue then exit
  if (args.once) {
    const startStats = worker.queue.stats();
    if (startStats.pending === 0 && startStats.processing === 0) {
      console.log('ONYX queue-worker: nothing to drain, exiting');
      await worker.stop();
      process.exit(0);
    }
    const check = setInterval(async () => {
      const s = worker.queue.stats();
      if (s.pending === 0 && s.processing === 0 && worker.activeJobs.size === 0) {
        clearInterval(check);
        console.log('ONYX queue-worker: drained, exiting');
        await worker.stop();
        process.exit(0);
      }
    }, 500);
    if (typeof check.unref === 'function') check.unref();
  }
}

main().catch((err) => {
  console.error('ONYX queue-worker fatal:', err);
  process.exit(1);
});
