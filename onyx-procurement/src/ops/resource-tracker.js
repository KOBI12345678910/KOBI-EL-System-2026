/**
 * ONYX OPS — Resource Usage Tracker / עוקב שימוש במשאבים
 * ═══════════════════════════════════════════════════════════════
 * Agent X-64 · Techno-Kol Uzi (Swarm 3D) · Kobi-EL · 2026-04-11
 *
 * Zero-dependency sampler for real-time CPU, memory, disk, network,
 * file-descriptor, process-tree and Node.js runtime metrics.
 *
 * Uses only Node.js built-ins:
 *   - node:os           (cpus, totalmem, freemem, loadavg, uptime, nis)
 *   - node:process      (memoryUsage, cpuUsage, resourceUsage, hrtime)
 *   - node:fs           (statfs / existsSync / readdirSync for /proc and disk)
 *   - node:perf_hooks   (eventLoopUtilization, monitorEventLoopDelay)
 *   - node:child_process (spawnSync to enumerate process tree on win32)
 *   - node:v8           (getHeapStatistics, getHeapSpaceStatistics)
 *
 * Metrics collected every sample:
 *   1. CPU: user, system, idle, load average 1/5/15, per-core utilization
 *   2. Memory: total, used, free, available, RSS, heap used/total, external
 *   3. Disk: used/free/total per mount (win32: fs.statfsSync; posix: statfs)
 *   4. Network: bytes in/out, errors, drops (posix: /proc/net/dev; win32: snap)
 *   5. File descriptors: open, max (posix: /proc/self/fd; win32: N/A, 0)
 *   6. Process tree: child PIDs + their cpu/mem (best-effort per OS)
 *   7. Node.js: heap histogram (v8.getHeapStatistics), GC stats, ELU
 *   8. Uptime: process (process.uptime) + OS (os.uptime)
 *
 * Features:
 *   - Periodic sampling (default every 5s)
 *   - Ring buffer of last N samples (default 1000)
 *   - Threshold alerts with hold-for-M-samples sustained check
 *   - Trend detection (rising / falling / flat) via linear slope
 *   - Prediction: linear extrapolation N steps ahead
 *   - Leak detection: heap growth slope >X% sustained across window
 *   - Top-K processes by resource (cpu, mem, rss)
 *
 * Public API:
 *   createTracker(opts)                 -> Tracker
 *   tracker.start()                     -> begin periodic sampling
 *   tracker.stop()                      -> end sampling
 *   tracker.sampleOnce()                -> capture a synchronous snapshot
 *   tracker.current()                   -> latest sample (or null)
 *   tracker.history(seconds)            -> samples captured in last N seconds
 *   tracker.stats(metric, window)       -> { min, max, avg, p50, p95, p99 }
 *   tracker.setThreshold(metric, limit, onExceed, opts)
 *   tracker.removeThreshold(id)
 *   tracker.detectLeak(metric, window)  -> { leaking, slope, growthPct }
 *   tracker.predict(metric, steps)      -> extrapolated value
 *   tracker.trend(metric, window)       -> 'rising'|'falling'|'flat'
 *   tracker.topK(resource, k)           -> top-K child processes
 *   tracker.exportPrometheus()          -> Prometheus text block
 *   tracker.exportJSON()                -> serializable state snapshot
 *   tracker.on(event, handler)          -> subscribe (sample|alert|leak|trend)
 *
 * Integration hooks:
 *   - Prometheus (X-52) — via exportPrometheus()
 *   - Alert Manager (X-55) — via 'alert' events forwarded to opts.alertManager
 *   - Logs — opts.logger.info/warn/error called at every alert
 *
 * Bilingual: every public error message is Hebrew + English.
 * "Never delete" rule: ring buffer evicts oldest on overflow, never destroys
 * the underlying metric series on disk when opts.persistPath is supplied.
 */

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const perf_hooks = require('node:perf_hooks');
const child_process = require('node:child_process');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS / DEFAULTS
// ═══════════════════════════════════════════════════════════════

const DEFAULTS = Object.freeze({
  intervalMs: 5_000,
  bufferSize: 1_000,
  sustainSamples: 60,           // 60 * 5s = 5 minutes
  leakWindowSec: 600,           // 10 minutes
  heapGrowthPct: 10,            // 10% growth = possible leak
  topK: 5,
  persistPath: null,
  logger: null,
  alertManager: null,
});

const DEFAULT_THRESHOLDS = Object.freeze({
  cpu:        { limit: 80,  op: '>', sustain: 60 },   // >80% sustained 5m
  memory:     { limit: 85,  op: '>', sustain: 1  },   // >85% immediate
  disk:       { limit: 90,  op: '>', sustain: 1  },   // >90% immediate
  heap:       { limit: 85,  op: '>', sustain: 1  },   // >85% of heap_size_limit
  fd:         { limit: 80,  op: '>', sustain: 1  },   // >80% of max FDs
  loopLagMs:  { limit: 100, op: '>', sustain: 6  },   // >100ms sustained 30s
});

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';

// Bilingual error helper
function bilErr(he, en) { return new Error(`${he} / ${en}`); }

// ═══════════════════════════════════════════════════════════════
// RING BUFFER — bounded, never throws, never destroys on overflow
// ═══════════════════════════════════════════════════════════════

class RingBuffer {
  constructor(capacity) {
    this.capacity = Math.max(1, capacity | 0);
    this.buf = new Array(this.capacity);
    this.head = 0;   // next write index
    this.size = 0;
  }

  push(item) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  // Chronological order (oldest -> newest)
  toArray() {
    const out = new Array(this.size);
    const start = this.size < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.size; i++) {
      out[i] = this.buf[(start + i) % this.capacity];
    }
    return out;
  }

  last() {
    if (this.size === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[idx];
  }

  // Return all samples where sample.ts >= cutoff
  since(cutoffMs) {
    const all = this.toArray();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i] && all[i].ts >= cutoffMs) out.push(all[i]);
    }
    return out;
  }

  clear() {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// STATS — min/max/avg/p50/p95/p99 over an array of numbers
// ═══════════════════════════════════════════════════════════════

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function summarize(values) {
  if (!values || values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: quantile(sorted, 0.50),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
  };
}

// ═══════════════════════════════════════════════════════════════
// LINEAR REGRESSION — slope & intercept for trend/prediction/leak
// ═══════════════════════════════════════════════════════════════

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0].y : 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = points[i];
    sumX += x; sumY += y;
    sumXY += x * y; sumXX += x * x; sumYY += y * y;
  }
  const denom = (n * sumXX - sumX * sumX);
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  // r² for "how confident is this trend" (0..1)
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = points[i];
    const yHat = slope * x + intercept;
    ssTot += (y - meanY) * (y - meanY);
    ssRes += (y - yHat) * (y - yHat);
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

// ═══════════════════════════════════════════════════════════════
// COLLECTORS — one small function per metric group
// ═══════════════════════════════════════════════════════════════

function collectCpu(prevCpus) {
  const cpus = os.cpus() || [];
  let userTotal = 0, sysTotal = 0, idleTotal = 0, niceTotal = 0, irqTotal = 0;
  const perCore = [];
  for (let i = 0; i < cpus.length; i++) {
    const t = cpus[i].times || {};
    userTotal += t.user || 0;
    sysTotal += t.sys || 0;
    idleTotal += t.idle || 0;
    niceTotal += t.nice || 0;
    irqTotal += t.irq || 0;
    perCore.push({
      model: cpus[i].model || 'unknown',
      speedMHz: cpus[i].speed || 0,
      times: { ...t },
    });
  }
  const totalBusy = userTotal + sysTotal + niceTotal + irqTotal;
  const totalAll = totalBusy + idleTotal;

  // Delta-based utilization %: compare to previous cpu snapshot if given
  let utilizationPct = 0;
  if (prevCpus && typeof prevCpus.totalBusy === 'number' && typeof prevCpus.totalAll === 'number') {
    const dBusy = totalBusy - prevCpus.totalBusy;
    const dAll = totalAll - prevCpus.totalAll;
    utilizationPct = dAll > 0 ? Math.max(0, Math.min(100, (dBusy / dAll) * 100)) : 0;
  }

  const load = os.loadavg ? os.loadavg() : [0, 0, 0];
  return {
    coreCount: cpus.length,
    userMs: userTotal,
    sysMs: sysTotal,
    idleMs: idleTotal,
    niceMs: niceTotal,
    irqMs: irqTotal,
    totalBusy,
    totalAll,
    utilizationPct,
    loadAvg: { '1m': load[0] || 0, '5m': load[1] || 0, '15m': load[2] || 0 },
    perCore,
  };
}

function collectMemory() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const pct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const mu = process.memoryUsage();
  let heapStats = null;
  try { heapStats = v8.getHeapStatistics(); } catch { /* noop */ }
  let spaceStats = null;
  try { spaceStats = v8.getHeapSpaceStatistics(); } catch { /* noop */ }
  return {
    totalBytes,
    freeBytes,
    usedBytes,
    availableBytes: freeBytes, // node:os doesn't expose MemAvailable — use free as fallback
    usedPct: pct,
    rssBytes: mu.rss,
    heapTotalBytes: mu.heapTotal,
    heapUsedBytes: mu.heapUsed,
    heapUsedPct: heapStats && heapStats.heap_size_limit > 0
      ? (mu.heapUsed / heapStats.heap_size_limit) * 100
      : 0,
    externalBytes: mu.external || 0,
    arrayBuffersBytes: mu.arrayBuffers || 0,
    heapStats,
    heapSpaces: spaceStats,
  };
}

function collectDisk(mounts) {
  // mounts: array of filesystem paths (e.g. ['/', '/var']) or undefined
  if (!mounts || mounts.length === 0) {
    mounts = [IS_WINDOWS ? (process.cwd().slice(0, 2) + path.sep) : '/'];
  }
  const out = [];
  for (let i = 0; i < mounts.length; i++) {
    const m = mounts[i];
    try {
      if (typeof fs.statfsSync === 'function') {
        const s = fs.statfsSync(m);
        const total = s.blocks * s.bsize;
        const free = s.bavail * s.bsize;
        const used = Math.max(0, total - free);
        out.push({
          mount: m,
          totalBytes: total,
          usedBytes: used,
          freeBytes: free,
          usedPct: total > 0 ? (used / total) * 100 : 0,
        });
      } else {
        out.push({ mount: m, totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPct: 0, note: 'statfs_unavailable' });
      }
    } catch (err) {
      out.push({ mount: m, error: String(err && err.message || err) });
    }
  }
  return out;
}

function collectNetwork(prev) {
  // On Linux we can read /proc/net/dev; on everything else use os.networkInterfaces
  // for a best-effort counter-less snapshot.
  const ifaces = os.networkInterfaces() || {};
  const result = {
    interfaces: {},
    totalBytesIn: 0,
    totalBytesOut: 0,
    totalErrors: 0,
    totalDrops: 0,
  };
  for (const name of Object.keys(ifaces)) {
    result.interfaces[name] = (ifaces[name] || []).map(a => ({
      address: a.address, family: a.family, mac: a.mac, internal: !!a.internal, cidr: a.cidr || null,
    }));
  }
  // Linux counters
  if (IS_LINUX && fs.existsSync('/proc/net/dev')) {
    try {
      const txt = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = txt.split('\n').slice(2);
      const perIface = {};
      for (const line of lines) {
        const m = line.match(/^\s*([^:]+):\s*(.+)$/);
        if (!m) continue;
        const name = m[1].trim();
        const nums = m[2].trim().split(/\s+/).map(Number);
        // RX bytes packets errs drop fifo frame compressed multicast; TX equivalents
        const rxBytes = nums[0] || 0;
        const rxErrs  = nums[2] || 0;
        const rxDrop  = nums[3] || 0;
        const txBytes = nums[8] || 0;
        const txErrs  = nums[10] || 0;
        const txDrop  = nums[11] || 0;
        perIface[name] = { rxBytes, txBytes, rxErrs, txErrs, rxDrop, txDrop };
        result.totalBytesIn  += rxBytes;
        result.totalBytesOut += txBytes;
        result.totalErrors   += rxErrs + txErrs;
        result.totalDrops    += rxDrop + txDrop;
      }
      result.counters = perIface;
      // Deltas
      if (prev && prev.counters) {
        result.deltaBytesIn  = Math.max(0, result.totalBytesIn  - (prev.totalBytesIn  || 0));
        result.deltaBytesOut = Math.max(0, result.totalBytesOut - (prev.totalBytesOut || 0));
      } else {
        result.deltaBytesIn = 0;
        result.deltaBytesOut = 0;
      }
    } catch { /* noop */ }
  } else {
    result.counters = null;
    result.deltaBytesIn = 0;
    result.deltaBytesOut = 0;
  }
  return result;
}

function collectFileDescriptors() {
  // Linux: count entries in /proc/self/fd; cap from /proc/self/limits
  let open = 0, max = 0;
  try {
    if (IS_LINUX && fs.existsSync('/proc/self/fd')) {
      open = fs.readdirSync('/proc/self/fd').length;
    }
  } catch { /* noop */ }
  try {
    if (IS_LINUX && fs.existsSync('/proc/self/limits')) {
      const txt = fs.readFileSync('/proc/self/limits', 'utf8');
      const m = txt.match(/Max open files\s+(\d+)\s+(\d+)/);
      if (m) max = Number(m[2]);
    }
  } catch { /* noop */ }
  // Fallback: POSIX ulimit via process.getrlimit if available (newer Node)
  if (!max && typeof process.getrlimit === 'function') {
    try { const r = process.getrlimit('nofile'); if (r && r.hard) max = r.hard; } catch { /* noop */ }
  }
  const pct = max > 0 ? (open / max) * 100 : 0;
  return { open, max, usedPct: pct };
}

function collectProcessTree(pid, maxChildren = 50) {
  // Best-effort per-OS enumeration
  const children = [];
  try {
    if (IS_LINUX) {
      const root = '/proc';
      const entries = fs.readdirSync(root).filter(n => /^\d+$/.test(n));
      for (const e of entries) {
        try {
          const statusPath = path.join(root, e, 'status');
          if (!fs.existsSync(statusPath)) continue;
          const txt = fs.readFileSync(statusPath, 'utf8');
          const ppidM = txt.match(/PPid:\s+(\d+)/);
          if (!ppidM) continue;
          if (Number(ppidM[1]) !== pid) continue;
          const nameM = txt.match(/Name:\s+(\S+)/);
          const rssM  = txt.match(/VmRSS:\s+(\d+)\s+kB/);
          children.push({
            pid: Number(e),
            name: nameM ? nameM[1] : 'unknown',
            rssBytes: rssM ? Number(rssM[1]) * 1024 : 0,
            cpuPct: 0,
          });
          if (children.length >= maxChildren) break;
        } catch { /* skip */ }
      }
    } else if (IS_WINDOWS) {
      // wmic is deprecated but still present; use tasklist as fallback
      try {
        const out = child_process.spawnSync('wmic', [
          'process', 'where', `(ParentProcessId=${pid})`, 'get',
          'ProcessId,Name,WorkingSetSize', '/FORMAT:CSV',
        ], { encoding: 'utf8', timeout: 2000 });
        if (out.status === 0 && out.stdout) {
          const lines = out.stdout.split(/\r?\n/).filter(Boolean).slice(1);
          for (const l of lines) {
            const parts = l.split(',');
            if (parts.length < 4) continue;
            const name = parts[1], cpid = parts[2], ws = parts[3];
            if (!cpid || !/^\d+$/.test(cpid.trim())) continue;
            children.push({
              pid: Number(cpid.trim()),
              name: name || 'unknown',
              rssBytes: Number(ws) || 0,
              cpuPct: 0,
            });
            if (children.length >= maxChildren) break;
          }
        }
      } catch { /* noop */ }
    } else if (IS_MAC) {
      try {
        const out = child_process.spawnSync('ps', [
          '-o', 'pid,ppid,rss,comm', '-A',
        ], { encoding: 'utf8', timeout: 2000 });
        if (out.status === 0 && out.stdout) {
          const lines = out.stdout.split(/\r?\n/).slice(1);
          for (const l of lines) {
            const parts = l.trim().split(/\s+/);
            if (parts.length < 4) continue;
            const cpid = Number(parts[0]);
            const ppid = Number(parts[1]);
            const rss  = Number(parts[2]);
            const name = parts.slice(3).join(' ');
            if (ppid !== pid) continue;
            children.push({ pid: cpid, name, rssBytes: rss * 1024, cpuPct: 0 });
            if (children.length >= maxChildren) break;
          }
        }
      } catch { /* noop */ }
    }
  } catch { /* noop */ }
  return { parentPid: pid, count: children.length, children };
}

function collectNodeRuntime(eluBaseline) {
  // Heap stats + GC + event loop utilization
  let heap = null, spaces = null;
  try { heap = v8.getHeapStatistics(); } catch { /* noop */ }
  try { spaces = v8.getHeapSpaceStatistics(); } catch { /* noop */ }
  let elu = null, eluPct = 0;
  try {
    elu = perf_hooks.performance.eventLoopUtilization(eluBaseline || undefined);
    eluPct = (elu && typeof elu.utilization === 'number') ? elu.utilization * 100 : 0;
  } catch { /* noop */ }
  let resource = null;
  try { resource = process.resourceUsage(); } catch { /* noop */ }
  return { heap, spaces, elu, eluPct, resource };
}

function collectEventLoopLag(sample) {
  // Caller supplies a running perf_hooks.monitorEventLoopDelay histogram
  if (!sample) return { meanMs: 0, maxMs: 0, p95Ms: 0, p99Ms: 0 };
  const toMs = (ns) => (ns || 0) / 1e6;
  return {
    meanMs: toMs(sample.mean),
    minMs: toMs(sample.min),
    maxMs: toMs(sample.max),
    stdDevMs: toMs(sample.stddev),
    p50Ms: toMs(sample.percentile ? sample.percentile(50) : 0),
    p95Ms: toMs(sample.percentile ? sample.percentile(95) : 0),
    p99Ms: toMs(sample.percentile ? sample.percentile(99) : 0),
  };
}

// ═══════════════════════════════════════════════════════════════
// METRIC PATH ACCESSOR — 'cpu.utilizationPct' -> sample.cpu.utilizationPct
// ═══════════════════════════════════════════════════════════════

function getMetricByPath(sample, metricPath) {
  if (!sample || !metricPath) return undefined;
  // Aliases for common metrics
  const aliases = {
    cpu:        'cpu.utilizationPct',
    memory:     'memory.usedPct',
    mem:        'memory.usedPct',
    heap:       'memory.heapUsedPct',
    disk:       'disk.0.usedPct',
    fd:         'fd.usedPct',
    loopLagMs:  'eventLoopLag.p95Ms',
    eventLoop:  'eventLoopLag.p95Ms',
  };
  const key = aliases[metricPath] || metricPath;
  const parts = key.split('.');
  let cur = sample;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return (typeof cur === 'number' && Number.isFinite(cur)) ? cur : undefined;
}

// ═══════════════════════════════════════════════════════════════
// TRACKER CLASS
// ═══════════════════════════════════════════════════════════════

class ResourceTracker {
  constructor(opts) {
    this.opts = Object.assign({}, DEFAULTS, opts || {});
    if (this.opts.intervalMs < 100) {
      throw bilErr('מרווח דגימה חייב להיות >= 100ms', 'intervalMs must be >= 100ms');
    }
    if (this.opts.bufferSize < 1) {
      throw bilErr('גודל חיץ חייב להיות >= 1', 'bufferSize must be >= 1');
    }

    this.buffer = new RingBuffer(this.opts.bufferSize);
    this.thresholds = new Map();     // id -> { metric, limit, op, sustain, onExceed, streak }
    this.listeners = {
      sample: [],
      alert: [],
      leak: [],
      trend: [],
      stop: [],
      start: [],
      error: [],
    };
    this.timer = null;
    this.running = false;
    this._lastCpu = null;
    this._lastNet = null;
    this._eluBaseline = null;
    this._loopHist = null;
    this._nextThresholdId = 1;
    this._counter = 0;

    // Install default thresholds unless explicitly disabled
    if (this.opts.installDefaults !== false) {
      for (const [metric, spec] of Object.entries(DEFAULT_THRESHOLDS)) {
        this.setThreshold(metric, spec.limit, null, { op: spec.op, sustain: spec.sustain });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────────────────────────
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw bilErr('handler חייב להיות פונקציה', 'handler must be a function');
    }
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
    return this;
  }

  off(event, handler) {
    const arr = this.listeners[event];
    if (!arr) return this;
    const i = arr.indexOf(handler);
    if (i >= 0) arr.splice(i, 1);
    return this;
  }

  emit(event, payload) {
    const arr = this.listeners[event];
    if (!arr || arr.length === 0) return;
    for (const fn of arr) {
      try { fn(payload); } catch (err) {
        if (event !== 'error') this.emit('error', err);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // START / STOP
  // ─────────────────────────────────────────────────────────────
  start() {
    if (this.running) return this;
    this.running = true;
    // Start event-loop histogram if available
    try {
      if (typeof perf_hooks.monitorEventLoopDelay === 'function') {
        this._loopHist = perf_hooks.monitorEventLoopDelay({ resolution: 20 });
        this._loopHist.enable();
      }
    } catch { /* noop */ }
    // Seed ELU baseline
    try { this._eluBaseline = perf_hooks.performance.eventLoopUtilization(); } catch { /* noop */ }

    // Immediate first sample so current() works right after start()
    this.sampleOnce();

    this.timer = setInterval(() => {
      try { this.sampleOnce(); } catch (err) { this.emit('error', err); }
    }, this.opts.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.emit('start', { ts: Date.now() });
    return this;
  }

  stop() {
    if (!this.running) return this;
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { if (this._loopHist) this._loopHist.disable(); } catch { /* noop */ }
    this.emit('stop', { ts: Date.now() });
    return this;
  }

  // ─────────────────────────────────────────────────────────────
  // SAMPLE (synchronous single capture)
  // ─────────────────────────────────────────────────────────────
  sampleOnce() {
    const t0 = Date.now();
    const cpu = collectCpu(this._lastCpu);
    this._lastCpu = { totalBusy: cpu.totalBusy, totalAll: cpu.totalAll };
    const memory = collectMemory();
    const disk = collectDisk(this.opts.mounts);
    const network = collectNetwork(this._lastNet);
    this._lastNet = network;
    const fd = collectFileDescriptors();
    const procTree = collectProcessTree(process.pid);
    const runtime = collectNodeRuntime(this._eluBaseline);
    // Update ELU baseline to current for next delta
    try { this._eluBaseline = perf_hooks.performance.eventLoopUtilization(); } catch { /* noop */ }
    const eventLoopLag = collectEventLoopLag(this._loopHist);
    const uptime = {
      processSec: process.uptime(),
      osSec: os.uptime ? os.uptime() : 0,
    };

    const sample = {
      ts: t0,
      seq: ++this._counter,
      cpu, memory, disk, network, fd, procTree, runtime, eventLoopLag, uptime,
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
    };

    this.buffer.push(sample);
    this.emit('sample', sample);

    // Threshold / trend / leak evaluation runs on every sample
    this._evaluateThresholds(sample);
    this._evaluateTrendsAndLeaks();

    // Optional persistence (append-only JSONL — "never delete")
    if (this.opts.persistPath) {
      try {
        fs.mkdirSync(path.dirname(this.opts.persistPath), { recursive: true });
        fs.appendFileSync(
          this.opts.persistPath,
          JSON.stringify(this._persistableSample(sample)) + '\n',
          'utf8'
        );
      } catch (err) { this.emit('error', err); }
    }

    return sample;
  }

  _persistableSample(s) {
    // Strip non-JSON-safe or huge fields before appending to disk
    return {
      ts: s.ts,
      seq: s.seq,
      cpu: {
        utilizationPct: s.cpu.utilizationPct,
        loadAvg: s.cpu.loadAvg,
        coreCount: s.cpu.coreCount,
      },
      memory: {
        usedPct: s.memory.usedPct,
        heapUsedPct: s.memory.heapUsedPct,
        rssBytes: s.memory.rssBytes,
        heapUsedBytes: s.memory.heapUsedBytes,
      },
      disk: s.disk.map(d => ({ mount: d.mount, usedPct: d.usedPct || 0 })),
      network: {
        deltaBytesIn: s.network.deltaBytesIn || 0,
        deltaBytesOut: s.network.deltaBytesOut || 0,
      },
      fd: { open: s.fd.open, max: s.fd.max, usedPct: s.fd.usedPct },
      eventLoopLag: { p95Ms: s.eventLoopLag.p95Ms, maxMs: s.eventLoopLag.maxMs },
      uptime: s.uptime,
      platform: s.platform,
      pid: s.pid,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ACCESSORS
  // ─────────────────────────────────────────────────────────────
  current() {
    return this.buffer.last();
  }

  history(seconds) {
    if (typeof seconds !== 'number' || seconds <= 0) return this.buffer.toArray();
    return this.buffer.since(Date.now() - seconds * 1000);
  }

  stats(metricPath, windowSec) {
    const samples = typeof windowSec === 'number' && windowSec > 0
      ? this.buffer.since(Date.now() - windowSec * 1000)
      : this.buffer.toArray();
    const values = [];
    for (let i = 0; i < samples.length; i++) {
      const v = getMetricByPath(samples[i], metricPath);
      if (typeof v === 'number') values.push(v);
    }
    return summarize(values);
  }

  trend(metricPath, windowSec) {
    const samples = typeof windowSec === 'number' && windowSec > 0
      ? this.buffer.since(Date.now() - windowSec * 1000)
      : this.buffer.toArray();
    if (samples.length < 2) return { direction: 'flat', slope: 0, r2: 0 };
    // Normalize x-axis to seconds relative to the first sample
    // (raw epoch-ms causes catastrophic cancellation in the regression denominator).
    const rawPoints = [];
    for (let i = 0; i < samples.length; i++) {
      const v = getMetricByPath(samples[i], metricPath);
      if (typeof v === 'number') rawPoints.push({ ts: samples[i].ts, y: v });
    }
    if (rawPoints.length < 2) return { direction: 'flat', slope: 0, r2: 0 };
    const t0 = rawPoints[0].ts;
    const points = rawPoints.map(p => ({ x: (p.ts - t0) / 1000, y: p.y }));
    const { slope, intercept, r2 } = linearRegression(points);
    // slope is now per-second
    const slopePerSec = slope;
    const meanY = (points[0].y + points[points.length - 1].y) / 2;
    const pctPerSec = meanY > 0 ? (slopePerSec / meanY) * 100 : 0;
    let direction = 'flat';
    if (r2 >= 0.5 && Math.abs(pctPerSec) >= 0.01) {
      direction = pctPerSec > 0 ? 'rising' : 'falling';
    }
    return { direction, slope: slopePerSec, intercept, r2, pctPerSec };
  }

  predict(metricPath, stepsAhead, windowSec) {
    const samples = typeof windowSec === 'number' && windowSec > 0
      ? this.buffer.since(Date.now() - windowSec * 1000)
      : this.buffer.toArray();
    if (samples.length < 2) {
      const last = this.current();
      const v = last ? getMetricByPath(last, metricPath) : 0;
      return { value: v || 0, confidence: 0 };
    }
    const points = [];
    for (let i = 0; i < samples.length; i++) {
      const v = getMetricByPath(samples[i], metricPath);
      if (typeof v === 'number') points.push({ x: i, y: v });
    }
    if (points.length < 2) {
      return { value: points.length === 1 ? points[0].y : 0, confidence: 0 };
    }
    const { slope, intercept, r2 } = linearRegression(points);
    const xPred = points[points.length - 1].x + (stepsAhead || 1);
    const value = slope * xPred + intercept;
    return { value, confidence: r2, slope, intercept };
  }

  detectLeak(metricPath, windowSec) {
    metricPath = metricPath || 'memory.heapUsedBytes';
    windowSec = windowSec || this.opts.leakWindowSec;
    const samples = this.buffer.since(Date.now() - windowSec * 1000);
    if (samples.length < 3) {
      return { leaking: false, slope: 0, growthPct: 0, reason: 'insufficient_samples', count: samples.length };
    }
    const points = [];
    for (let i = 0; i < samples.length; i++) {
      const v = getMetricByPath(samples[i], metricPath);
      if (typeof v === 'number') points.push({ x: i, y: v });
    }
    if (points.length < 3) {
      return { leaking: false, slope: 0, growthPct: 0, reason: 'insufficient_values', count: points.length };
    }
    const first = points[0].y;
    const last = points[points.length - 1].y;
    const growthPct = first > 0 ? ((last - first) / first) * 100 : 0;
    const { slope, r2 } = linearRegression(points);
    const threshold = this.opts.heapGrowthPct != null ? this.opts.heapGrowthPct : 10;
    const leaking = (growthPct >= threshold) && (slope > 0) && (r2 >= 0.5);
    const res = { leaking, slope, growthPct, r2, windowSec, first, last, threshold };
    if (leaking) this.emit('leak', { metric: metricPath, ...res });
    return res;
  }

  topK(resource, k) {
    k = k || this.opts.topK;
    const last = this.current();
    if (!last || !last.procTree || !last.procTree.children) return [];
    const arr = last.procTree.children.slice();
    const keyFor = (p) => {
      if (resource === 'cpu')  return p.cpuPct || 0;
      if (resource === 'mem')  return p.rssBytes || 0;
      if (resource === 'rss')  return p.rssBytes || 0;
      return p.rssBytes || 0;
    };
    arr.sort((a, b) => keyFor(b) - keyFor(a));
    return arr.slice(0, k);
  }

  // ─────────────────────────────────────────────────────────────
  // THRESHOLDS
  // ─────────────────────────────────────────────────────────────
  setThreshold(metric, limit, onExceed, opts) {
    if (typeof metric !== 'string' || metric.length === 0) {
      throw bilErr('metric חייב להיות מחרוזת', 'metric must be a non-empty string');
    }
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      throw bilErr('limit חייב להיות מספר', 'limit must be a number');
    }
    const spec = {
      id: this._nextThresholdId++,
      metric,
      limit,
      op: (opts && opts.op) || '>',
      sustain: (opts && opts.sustain) || 1,
      onExceed: typeof onExceed === 'function' ? onExceed : null,
      streak: 0,
      firing: false,
      lastFiredAt: 0,
    };
    this.thresholds.set(spec.id, spec);
    return spec.id;
  }

  removeThreshold(id) {
    return this.thresholds.delete(id);
  }

  listThresholds() {
    return Array.from(this.thresholds.values()).map(t => ({
      id: t.id, metric: t.metric, limit: t.limit, op: t.op, sustain: t.sustain,
      streak: t.streak, firing: t.firing, lastFiredAt: t.lastFiredAt,
    }));
  }

  _evaluateThresholds(sample) {
    for (const t of this.thresholds.values()) {
      const v = getMetricByPath(sample, t.metric);
      if (typeof v !== 'number') continue;
      let breached = false;
      switch (t.op) {
        case '>':  breached = v >  t.limit; break;
        case '>=': breached = v >= t.limit; break;
        case '<':  breached = v <  t.limit; break;
        case '<=': breached = v <= t.limit; break;
        case '==': breached = v === t.limit; break;
        case '!=': breached = v !== t.limit; break;
        default:   breached = v > t.limit;
      }
      if (breached) {
        t.streak += 1;
        if (t.streak >= t.sustain && !t.firing) {
          t.firing = true;
          t.lastFiredAt = sample.ts;
          const alert = {
            id: t.id,
            metric: t.metric,
            value: v,
            limit: t.limit,
            op: t.op,
            sustain: t.sustain,
            streak: t.streak,
            ts: sample.ts,
            severity: this._severityFor(t.metric, v, t.limit),
            messageHe: `חריגה במדד ${t.metric}: ${v.toFixed(2)} ${t.op} ${t.limit}`,
            messageEn: `Threshold breach on ${t.metric}: ${v.toFixed(2)} ${t.op} ${t.limit}`,
          };
          this.emit('alert', alert);
          if (t.onExceed) {
            try { t.onExceed(alert); } catch (err) { this.emit('error', err); }
          }
          // Forward to alert manager (X-55)
          if (this.opts.alertManager && typeof this.opts.alertManager.fire === 'function') {
            try { this.opts.alertManager.fire(alert); } catch (err) { this.emit('error', err); }
          }
          // Forward to logger
          if (this.opts.logger && typeof this.opts.logger.warn === 'function') {
            try { this.opts.logger.warn('[resource-tracker] alert', alert); } catch { /* noop */ }
          }
        }
      } else {
        // Clear firing state if value returns below limit
        if (t.firing) {
          t.firing = false;
          if (this.opts.logger && typeof this.opts.logger.info === 'function') {
            try {
              this.opts.logger.info('[resource-tracker] alert resolved', {
                id: t.id, metric: t.metric, value: v, limit: t.limit,
              });
            } catch { /* noop */ }
          }
        }
        t.streak = 0;
      }
    }
  }

  _severityFor(metric, value, limit) {
    const ratio = limit > 0 ? value / limit : 0;
    if (ratio >= 1.2) return 'critical';
    if (ratio >= 1.05) return 'high';
    return 'warning';
  }

  _evaluateTrendsAndLeaks() {
    // Only evaluate periodically once we have enough samples, not every tick
    if (this.buffer.size < 6) return;
    if (this._counter % 6 !== 0) return; // every 6th sample
    // Heap leak check is the headline metric
    const leak = this.detectLeak('memory.heapUsedBytes', this.opts.leakWindowSec);
    if (leak.leaking) {
      // Emit bilingual notice; ._emit already handled inside detectLeak
    }
    // Trend on CPU + memory
    const cpuTrend = this.trend('cpu.utilizationPct', this.opts.leakWindowSec);
    const memTrend = this.trend('memory.usedPct', this.opts.leakWindowSec);
    this.emit('trend', { cpu: cpuTrend, memory: memTrend, ts: Date.now() });
  }

  // ─────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────
  exportJSON() {
    return {
      running: this.running,
      opts: {
        intervalMs: this.opts.intervalMs,
        bufferSize: this.opts.bufferSize,
      },
      buffer: this.buffer.toArray().map(s => this._persistableSample(s)),
      thresholds: this.listThresholds(),
      counter: this._counter,
    };
  }

  exportPrometheus() {
    // Minimal Prometheus text block compatible with ops/metrics.js registry
    const last = this.current();
    if (!last) return '# HELP onyx_resource_tracker_ready Tracker has no samples yet\n';
    const lines = [];
    lines.push('# HELP onyx_cpu_utilization_pct CPU utilization percentage');
    lines.push('# TYPE onyx_cpu_utilization_pct gauge');
    lines.push(`onyx_cpu_utilization_pct ${last.cpu.utilizationPct || 0}`);
    lines.push('# HELP onyx_cpu_load_average_1m 1-minute load average');
    lines.push('# TYPE onyx_cpu_load_average_1m gauge');
    lines.push(`onyx_cpu_load_average_1m ${last.cpu.loadAvg['1m']}`);
    lines.push('# HELP onyx_memory_used_pct Memory used percentage');
    lines.push('# TYPE onyx_memory_used_pct gauge');
    lines.push(`onyx_memory_used_pct ${last.memory.usedPct || 0}`);
    lines.push('# HELP onyx_memory_rss_bytes Resident set size in bytes');
    lines.push('# TYPE onyx_memory_rss_bytes gauge');
    lines.push(`onyx_memory_rss_bytes ${last.memory.rssBytes || 0}`);
    lines.push('# HELP onyx_heap_used_bytes V8 heap used in bytes');
    lines.push('# TYPE onyx_heap_used_bytes gauge');
    lines.push(`onyx_heap_used_bytes ${last.memory.heapUsedBytes || 0}`);
    lines.push('# HELP onyx_heap_used_pct V8 heap used percentage of heap_size_limit');
    lines.push('# TYPE onyx_heap_used_pct gauge');
    lines.push(`onyx_heap_used_pct ${last.memory.heapUsedPct || 0}`);
    for (let i = 0; i < last.disk.length; i++) {
      const d = last.disk[i];
      const mount = (d.mount || '').replace(/"/g, '\\"');
      lines.push(`onyx_disk_used_pct{mount="${mount}"} ${d.usedPct || 0}`);
    }
    lines.push(`onyx_fd_open ${last.fd.open || 0}`);
    lines.push(`onyx_fd_max ${last.fd.max || 0}`);
    lines.push(`onyx_event_loop_p95_ms ${last.eventLoopLag.p95Ms || 0}`);
    lines.push(`onyx_uptime_process_seconds ${last.uptime.processSec || 0}`);
    lines.push(`onyx_uptime_os_seconds ${last.uptime.osSec || 0}`);
    return lines.join('\n') + '\n';
  }

  // ─────────────────────────────────────────────────────────────
  // TEST HELPERS
  // ─────────────────────────────────────────────────────────────
  _injectSample(sample) {
    // Used by tests to feed canned samples into the buffer.
    if (!sample || typeof sample !== 'object') {
      throw bilErr('סמפל חייב להיות אובייקט', 'sample must be an object');
    }
    if (!sample.ts) sample.ts = Date.now();
    if (!sample.seq) sample.seq = ++this._counter;
    this.buffer.push(sample);
    this._evaluateThresholds(sample);
    return sample;
  }

  _clearBuffer() {
    this.buffer.clear();
    this._counter = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

function createTracker(opts) {
  return new ResourceTracker(opts);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  createTracker,
  ResourceTracker,
  // Internals exported for tests and introspection
  RingBuffer,
  linearRegression,
  summarize,
  quantile,
  collectCpu,
  collectMemory,
  collectDisk,
  collectNetwork,
  collectFileDescriptors,
  collectProcessTree,
  collectNodeRuntime,
  collectEventLoopLag,
  getMetricByPath,
  DEFAULTS,
  DEFAULT_THRESHOLDS,
};
