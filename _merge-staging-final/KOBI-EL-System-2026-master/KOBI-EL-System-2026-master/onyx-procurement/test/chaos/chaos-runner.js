'use strict';
/**
 * test/chaos/chaos-runner.js
 * ─────────────────────────────────────────────────────────────
 * Minimal, zero-dependency chaos engineering framework for
 * onyx-procurement. Uses ONLY Node built-ins.
 *
 * Agent 55 — 2026-04-11
 * Rule: NEVER delete anything. Chaos is additive; every fault
 * is registered through a lifecycle so it can be fully
 * reverted. `dispose()` MUST leave the process in the state it
 * was in before the experiment started.
 *
 * The runner exposes a set of `faults` that can be attached to:
 *
 *   1. Latency injection   — adds 500 ms … 5 s to every matched
 *                            outbound HTTP response (intercepts
 *                            `http.createServer`'s request handler).
 *   2. Error injection     — a percentage of HTTP responses are
 *                            rewritten to 500 Internal Server Error.
 *   3. Connection drop     — closes the socket mid-response.
 *   4. DB slow query       — monkey-patches any registered query
 *                            function so every call sleeps N ms.
 *   5. Disk full           — wraps `fs.writeFile`/`fs.createWriteStream`
 *                            to reject with ENOSPC.
 *   6. Memory pressure     — allocates ~500 MB of retained buffers
 *                            to starve V8's young generation.
 *   7. CPU spike           — runs a timed busy loop on the main
 *                            thread (configurable duty cycle).
 *
 * Usage:
 *     const { ChaosRunner } = require('./chaos-runner');
 *     const runner = new ChaosRunner({ seed: 42 });
 *     runner.enable('latency', { minMs: 500, maxMs: 5000 });
 *     // … run tests …
 *     await runner.disposeAll();
 *
 * Nothing is exported as a singleton. Every instance owns its
 * own fault table so parallel scenarios can't cross-contaminate.
 *
 * This file does NOT execute any fault when merely `require`d.
 * Running `node chaos-runner.js` prints a self-test that
 * exercises every fault with dispose() verification.
 * ─────────────────────────────────────────────────────────────
 */

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { EventEmitter } = require('node:events');

// ─────────────────────────────────────────────────────────────
// Deterministic PRNG (mulberry32). We never use Math.random
// directly so scenarios can replay failures bit-for-bit.
// ─────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// Fault registry
// ─────────────────────────────────────────────────────────────
// Each fault is an object:
//   {
//     name:    'latency',
//     enable:  (runner, opts) => disposeFn,
//     default: { … },
//   }
//
// `enable` MUST return a dispose function that perfectly
// reverts the fault. The runner stores it and guarantees
// disposal even if the scenario throws.
//
// NOTE ON MONKEY-PATCHING: every patch captures the original
// reference. Multiple faults on the same symbol stack LIFO —
// last one enabled is the first disposed.

function defineFault(name, impl) {
  return Object.freeze({ name, ...impl });
}

// ---------- 1. Latency injection --------------------------
const latencyFault = defineFault('latency', {
  enable(runner, opts = {}) {
    const minMs = Number(opts.minMs ?? 500);
    const maxMs = Number(opts.maxMs ?? 5000);
    const probability = Number(opts.probability ?? 1.0);
    const rand = runner._rand;

    // Wrap `http.Server.prototype.emit` so every 'request'
    // event is deferred by a sleep.
    const origEmit = http.Server.prototype.emit;
    http.Server.prototype.emit = function patchedEmit(event, ...args) {
      if (event !== 'request') return origEmit.call(this, event, ...args);
      if (rand() > probability) return origEmit.call(this, event, ...args);
      const [req, res] = args;
      const delay = Math.floor(minMs + rand() * (maxMs - minMs));
      runner._record('latency', { url: req.url, delay });
      const t = setTimeout(() => origEmit.call(this, event, req, res), delay);
      runner._timers.add(t);
      return true;
    };

    return function dispose() {
      http.Server.prototype.emit = origEmit;
    };
  },
});

// ---------- 2. Error injection ----------------------------
const errorInjectionFault = defineFault('error-injection', {
  enable(runner, opts = {}) {
    const rate = Number(opts.rate ?? 0.05);              // 5% default
    const status = Number(opts.status ?? 500);
    const body = opts.body ?? 'Chaos: injected error';
    const rand = runner._rand;

    const origEmit = http.Server.prototype.emit;
    http.Server.prototype.emit = function patchedEmit(event, ...args) {
      if (event !== 'request') return origEmit.call(this, event, ...args);
      const [req, res] = args;
      if (rand() < rate) {
        runner._record('error-injection', { url: req.url, status });
        try {
          res.writeHead(status, { 'Content-Type': 'text/plain' });
          res.end(body);
        } catch (_) { /* best-effort */ }
        return true;
      }
      return origEmit.call(this, event, ...args);
    };

    return function dispose() {
      http.Server.prototype.emit = origEmit;
    };
  },
});

// ---------- 3. Connection drop ----------------------------
const connectionDropFault = defineFault('connection-drop', {
  enable(runner, opts = {}) {
    const rate = Number(opts.rate ?? 0.05);
    const afterBytes = Number(opts.afterBytes ?? 0);
    const rand = runner._rand;

    const origEmit = http.Server.prototype.emit;
    http.Server.prototype.emit = function patchedEmit(event, ...args) {
      if (event !== 'request') return origEmit.call(this, event, ...args);
      const [req, res] = args;
      if (rand() < rate) {
        runner._record('connection-drop', { url: req.url });
        // Let the handler run but ambush the socket.
        const sock = req.socket;
        if (afterBytes <= 0) {
          if (sock && !sock.destroyed) sock.destroy(new Error('chaos: socket drop'));
          return true;
        }
        let written = 0;
        const origWrite = res.write.bind(res);
        res.write = (chunk, enc, cb) => {
          written += Buffer.byteLength(chunk || '', enc);
          if (written >= afterBytes && sock && !sock.destroyed) {
            sock.destroy(new Error('chaos: socket drop after bytes'));
            return false;
          }
          return origWrite(chunk, enc, cb);
        };
      }
      return origEmit.call(this, event, ...args);
    };

    return function dispose() {
      http.Server.prototype.emit = origEmit;
    };
  },
});

// ---------- 4. DB slow query (simulated) ------------------
// Applies to a user-supplied object with a `query`-shaped
// function (e.g. a pg/mysql pool wrapper). Purely synthetic —
// no real DB is touched.
const dbSlowQueryFault = defineFault('db-slow-query', {
  enable(runner, opts = {}) {
    const target = opts.target;
    const method = opts.method || 'query';
    const extraMs = Number(opts.extraMs ?? 2000);
    if (!target || typeof target[method] !== 'function') {
      // Still return a dispose so the lifecycle holds.
      runner._record('db-slow-query', { warn: 'no target supplied; fault is a no-op' });
      return function dispose() {};
    }
    const original = target[method];
    target[method] = function slowQuery(...args) {
      runner._record('db-slow-query', { extraMs });
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          try {
            const out = original.apply(this, args);
            if (out && typeof out.then === 'function') out.then(resolve, reject);
            else resolve(out);
          } catch (e) { reject(e); }
        }, extraMs);
        runner._timers.add(t);
      });
    };
    return function dispose() { target[method] = original; };
  },
});

// ---------- 5. Disk full (simulated) ----------------------
const diskFullFault = defineFault('disk-full', {
  enable(runner, opts = {}) {
    const pathMatch = opts.pathMatch || /.*/;            // regex or fn
    const match = typeof pathMatch === 'function'
      ? pathMatch
      : (p) => pathMatch.test(String(p));

    const makeEnospc = () => {
      const err = new Error('ENOSPC: no space left on device (chaos)');
      err.code = 'ENOSPC';
      err.errno = -28;
      err.syscall = 'write';
      return err;
    };

    const patched = [];
    const patch = (obj, name, impl) => {
      const orig = obj[name];
      obj[name] = impl(orig);
      patched.push(() => { obj[name] = orig; });
    };

    patch(fs, 'writeFile', (orig) => function patchedWriteFile(p, data, optionsOrCb, cb) {
      if (!match(p)) return orig.apply(fs, arguments);
      runner._record('disk-full', { path: String(p), fn: 'writeFile' });
      const callback = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
      if (typeof callback === 'function') return callback(makeEnospc());
      return Promise.reject(makeEnospc());
    });

    patch(fs.promises, 'writeFile', (orig) => function patchedWriteFileP(p, ...rest) {
      if (!match(p)) return orig.apply(fs.promises, [p, ...rest]);
      runner._record('disk-full', { path: String(p), fn: 'promises.writeFile' });
      return Promise.reject(makeEnospc());
    });

    patch(fs, 'createWriteStream', (orig) => function patchedCreateWriteStream(p, opts2) {
      if (!match(p)) return orig.call(fs, p, opts2);
      runner._record('disk-full', { path: String(p), fn: 'createWriteStream' });
      const stream = orig.call(fs, p, opts2);
      process.nextTick(() => stream.destroy(makeEnospc()));
      return stream;
    });

    return function dispose() {
      while (patched.length) patched.pop()();
    };
  },
});

// ---------- 6. Memory pressure ----------------------------
// Allocates ~sizeMB in retained Buffer chunks. The buffers are
// held in the runner so GC can't free them until dispose().
const memoryPressureFault = defineFault('memory-pressure', {
  enable(runner, opts = {}) {
    const sizeMB = Number(opts.sizeMB ?? 500);
    const chunkMB = Math.max(1, Number(opts.chunkMB ?? 16));
    const chunks = [];
    const total = sizeMB * 1024 * 1024;
    let allocated = 0;
    // Allocate lazily on next tick so enabling the fault doesn't
    // block construction of the runner.
    process.nextTick(() => {
      while (allocated < total) {
        const size = Math.min(chunkMB * 1024 * 1024, total - allocated);
        try {
          // `allocUnsafeSlow` bypasses the shared pool, forcing a
          // full allocation we actually keep.
          const buf = Buffer.allocUnsafeSlow(size);
          // Touch every 4 KB page so the OS really commits it.
          for (let i = 0; i < size; i += 4096) buf[i] = 1;
          chunks.push(buf);
          allocated += size;
        } catch (e) {
          runner._record('memory-pressure', { halt: e.message, allocatedMB: allocated / (1024 * 1024) });
          break;
        }
      }
      runner._record('memory-pressure', { allocatedMB: allocated / (1024 * 1024) });
    });

    return function dispose() {
      chunks.length = 0;
      // Hint V8 to collect. Only runs if --expose-gc is on.
      if (typeof global.gc === 'function') {
        try { global.gc(); } catch (_) {}
      }
    };
  },
});

// ---------- 7. CPU spike ----------------------------------
// Runs a busy loop for `durationMs` on the main thread at the
// requested duty cycle (e.g. 50% => 10ms work / 10ms idle).
const cpuSpikeFault = defineFault('cpu-spike', {
  enable(runner, opts = {}) {
    const durationMs = Number(opts.durationMs ?? 5000);
    const dutyCycle = Math.max(0, Math.min(1, Number(opts.dutyCycle ?? 0.8)));
    const sliceMs = Number(opts.sliceMs ?? 20);
    const deadline = performance.now() + durationMs;
    let cancelled = false;

    function tick() {
      if (cancelled || performance.now() >= deadline) return;
      const workUntil = performance.now() + sliceMs * dutyCycle;
      // Busy loop — deliberate.
      while (performance.now() < workUntil) {
        Math.sqrt(Math.random() * 1e6);
      }
      const idleMs = sliceMs * (1 - dutyCycle);
      if (idleMs <= 0) return setImmediate(tick);
      const t = setTimeout(tick, idleMs);
      runner._timers.add(t);
    }
    process.nextTick(tick);
    runner._record('cpu-spike', { durationMs, dutyCycle });

    return function dispose() { cancelled = true; };
  },
});

// ─────────────────────────────────────────────────────────────
// Runner class
// ─────────────────────────────────────────────────────────────

const FAULTS = {
  'latency':          latencyFault,
  'error-injection':  errorInjectionFault,
  'connection-drop':  connectionDropFault,
  'db-slow-query':    dbSlowQueryFault,
  'disk-full':        diskFullFault,
  'memory-pressure':  memoryPressureFault,
  'cpu-spike':        cpuSpikeFault,
};

class ChaosRunner extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._seed = Number(opts.seed ?? 1);
    this._rand = mulberry32(this._seed);
    this._active = [];                 // [{ name, dispose, enabledAt }]
    this._timers = new Set();
    this._log = [];                    // structured event log
    this._startedAt = Date.now();
  }

  static list() { return Object.keys(FAULTS); }

  /**
   * Enable a fault by name. Returns a handle with `.dispose()`.
   * Multiple faults can be enabled in sequence.
   */
  enable(name, opts = {}) {
    const fault = FAULTS[name];
    if (!fault) throw new Error(`unknown chaos fault: ${name}`);
    const dispose = fault.enable(this, opts);
    const entry = { name, dispose, enabledAt: Date.now(), opts };
    this._active.push(entry);
    this._record('enable', { name, opts });
    this.emit('fault:enabled', entry);
    return {
      name,
      dispose: () => this._disposeOne(entry),
    };
  }

  _disposeOne(entry) {
    const idx = this._active.indexOf(entry);
    if (idx === -1) return;
    try { entry.dispose(); }
    catch (e) { this._record('dispose-error', { name: entry.name, err: e.message }); }
    this._active.splice(idx, 1);
    this._record('disable', { name: entry.name });
    this.emit('fault:disabled', entry);
  }

  /**
   * Dispose every active fault in LIFO order. Safe to call
   * multiple times and safe to call in a `finally` block.
   */
  async disposeAll() {
    while (this._active.length) {
      const entry = this._active.pop();
      try { entry.dispose(); }
      catch (e) { this._record('dispose-error', { name: entry.name, err: e.message }); }
    }
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this.emit('all:disabled');
    // Yield once so any in-flight I/O can finish.
    await new Promise((r) => setImmediate(r));
  }

  /** Structured log for reporters. */
  log() { return this._log.slice(); }

  _record(kind, data) {
    const entry = {
      t: Date.now() - this._startedAt,
      kind,
      data,
    };
    this._log.push(entry);
    this.emit('log', entry);
  }

  /** Convenience: run a function while `faults` are active. */
  async withFaults(faults, fn) {
    const handles = [];
    try {
      for (const [name, opts] of faults) handles.push(this.enable(name, opts));
      return await fn(this);
    } finally {
      await this.disposeAll();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Self-test (when run directly): exercises every fault with
// dispose verification. Does NOT bind any server on a real port;
// creates a one-off http.Server with `listen: 0`.
// ─────────────────────────────────────────────────────────────
async function selfTest() {
  const assert = require('node:assert/strict');
  const runner = new ChaosRunner({ seed: 7 });

  // Latency + error-injection + connection-drop on a local server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  // Enable all http-level faults simultaneously.
  runner.enable('latency', { minMs: 10, maxMs: 20 });
  runner.enable('error-injection', { rate: 0.5 });
  runner.enable('connection-drop', { rate: 0.2 });

  // Fire a handful of requests using the built-in http client.
  const results = [];
  for (let i = 0; i < 8; i++) {
    results.push(await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode }));
        res.on('error', (err) => resolve({ err: err.code }));
      });
      req.on('error', (err) => resolve({ err: err.code }));
      req.setTimeout(500, () => { req.destroy(new Error('client timeout')); });
    }));
  }

  server.close();

  // DB slow-query on a synthetic target.
  const fakeDb = { async query(sql) { return { sql, rows: [] }; } };
  runner.enable('db-slow-query', { target: fakeDb, extraMs: 10 });
  const t0 = Date.now();
  await fakeDb.query('SELECT 1');
  assert.ok(Date.now() - t0 >= 10, 'db-slow-query must add latency');

  // Disk-full on a path that we never actually write.
  runner.enable('disk-full', { pathMatch: /chaos-test-.*\.tmp$/ });
  await new Promise((resolve) => {
    fs.writeFile('./chaos-test-x.tmp', 'data', (err) => {
      assert.equal(err && err.code, 'ENOSPC');
      resolve();
    });
  });

  // Memory pressure — small allocation for the self-test so CI
  // runners don't OOM.
  runner.enable('memory-pressure', { sizeMB: 4, chunkMB: 2 });

  // CPU spike — very short for self-test.
  runner.enable('cpu-spike', { durationMs: 50, dutyCycle: 0.5, sliceMs: 5 });

  await runner.disposeAll();

  // Verify nothing was left patched.
  assert.equal(fs.writeFile.name, 'writeFile', 'fs.writeFile must be restored');
  const s2 = http.createServer((req, res) => { res.end('post-chaos'); });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const p2 = s2.address().port;
  const clean = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: p2, path: '/' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
  });
  s2.close();
  assert.equal(clean, 200, 'server must work cleanly after dispose');

  console.log('[chaos-runner] self-test OK. Log entries:', runner.log().length);
  console.log('[chaos-runner] results:', JSON.stringify(results));
}

module.exports = {
  ChaosRunner,
  FAULTS,
  mulberry32,
};

if (require.main === module) {
  selfTest().catch((e) => {
    console.error('[chaos-runner] self-test FAILED:', e);
    process.exitCode = 1;
  });
}
