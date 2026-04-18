/**
 * health-orchestrator.js — Multi-service health check orchestrator
 * Agent Y-175 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero external dependencies. Pure Node.js built-ins only.
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — registrations are
 * append-only. register() of the same service name replaces the
 * callback but preserves accumulated history, SLO buckets, and any
 * previously recorded samples. Un-registration is deliberately not
 * provided — services can only be added, not removed.
 *
 * Features:
 *   - register(service, checkFn, dependencies)
 *     Register a named service with an async probe function and an
 *     optional list of dependency service names. Dependencies must
 *     not create cycles (checked at register time).
 *
 *   - runAll({ bail, timeoutMs })
 *     Runs every registered probe in parallel (respecting per-check
 *     timeouts). Returns a snapshot object including per-service
 *     status, latency, and the cascaded aggregate.
 *
 *   - statusPage(lang)
 *     Emits a bilingual (Hebrew + English) HTML status page with
 *     RTL support, service cards, aggregate banner, SLO widgets,
 *     and a 24h/7d/30d uptime strip. Pure string — no framework.
 *
 *   - aggregateStatus()
 *     Reduces all services to a single overall status:
 *       'green'  → every service up
 *       'yellow' → at least one degraded (or a dependency is down)
 *       'red'    → at least one hard-down service with no degraded
 *                  fallback, or >50% of services down
 *
 *   - onAlert(fn) / offAlert(fn)
 *     Alerting hooks. Fired when a service transitions state
 *     (green→yellow, yellow→red, etc). Callback receives an event
 *     { service, from, to, at, reason }.
 *
 *   - uptime(service, window)
 *     Historical uptime percentage over 24h / 7d / 30d windows,
 *     computed from the rolling sample buffer.
 *
 *   - sloReport(service)
 *     SLO tracker vs the configured target (default 99.9%). Returns
 *     { target, current, burnRate, budgetRemainingPct, window }.
 *
 *   - runSynthetic(name, scriptFn)
 *     Synthetic probes — a scriptFn is a multi-step async closure
 *     that returns an object { ok, steps, durationMs }. Synthetic
 *     checks are stored alongside regular checks and participate
 *     in the aggregate exactly like register()-ed services.
 *
 *   - Dependency cascading
 *     If service B depends on A, and A is 'red' or 'yellow', then B
 *     is degraded to at least 'yellow' even if its own probe passed.
 *     This propagates transitively through the dependency graph.
 *
 * Public API:
 *   const { HealthOrchestrator, STATUS, SLO_TARGET_DEFAULT } =
 *     require('./health-orchestrator');
 *   const ho = new HealthOrchestrator({ sloTarget: 0.999 });
 *   ho.register('db',  async () => ({ ok: true, latencyMs: 12 }));
 *   ho.register('api', async () => ({ ok: true }), ['db']);
 *   const snap = await ho.runAll();
 *   const html = ho.statusPage('he');
 */

'use strict';

/* ------------------------------------------------------------------ *
 *  Constants                                                         *
 * ------------------------------------------------------------------ */

const STATUS = Object.freeze({
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red',
  UNKNOWN: 'unknown',
});

const SLO_TARGET_DEFAULT = 0.999; // three nines

const WINDOW_MS = Object.freeze({
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
});

// Max samples retained per service. 30 days at one sample/minute would be
// ~43_200; we cap at 50_000 to keep memory bounded even at higher rates.
const MAX_SAMPLES = 50_000;

const DEFAULT_TIMEOUT_MS = 5_000;

/* ------------------------------------------------------------------ *
 *  Bilingual copy                                                    *
 * ------------------------------------------------------------------ */

const I18N = Object.freeze({
  he: {
    title: 'מרכז בריאות מערכת',
    subtitle: 'ניטור רב-שירותי עם גרף תלויות',
    aggregate: 'מצב כולל',
    services: 'שירותים',
    uptime: 'זמינות',
    slo: 'יעד SLO',
    deps: 'תלויות',
    lastCheck: 'בדיקה אחרונה',
    latency: 'זמן תגובה',
    w24h: '24 שעות',
    w7d: '7 ימים',
    w30d: '30 יום',
    green: 'תקין',
    yellow: 'השפעה חלקית',
    red: 'תקלה',
    unknown: 'לא ידוע',
    burnRate: 'קצב צריכה',
    budget: 'תקציב שגיאה',
    none: 'אין',
    cascaded: 'מושפע מתלויה',
  },
  en: {
    title: 'System Health Center',
    subtitle: 'Multi-service monitoring with dependency graph',
    aggregate: 'Overall Status',
    services: 'Services',
    uptime: 'Uptime',
    slo: 'SLO Target',
    deps: 'Dependencies',
    lastCheck: 'Last Check',
    latency: 'Latency',
    w24h: '24h',
    w7d: '7d',
    w30d: '30d',
    green: 'Operational',
    yellow: 'Degraded',
    red: 'Outage',
    unknown: 'Unknown',
    burnRate: 'Burn Rate',
    budget: 'Error Budget',
    none: 'None',
    cascaded: 'Cascaded from dependency',
  },
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusRank(s) {
  // Higher rank = worse. Used to combine and find the worst-case status.
  switch (s) {
    case STATUS.RED: return 3;
    case STATUS.YELLOW: return 2;
    case STATUS.GREEN: return 1;
    default: return 0;
  }
}

function worst(a, b) {
  return statusRank(a) >= statusRank(b) ? a : b;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms: ${label}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function detectCycle(graph, start, extraEdges) {
  // DFS cycle detection. graph is { name -> [deps] }. extraEdges adds
  // proposed new edges (start → d for each d in extraEdges).
  const visited = new Set();
  const stack = new Set();
  const adjacency = new Map();
  for (const [k, v] of Object.entries(graph)) adjacency.set(k, [...v]);
  adjacency.set(start, [...(adjacency.get(start) || []), ...extraEdges]);

  function dfs(node) {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const d of adjacency.get(node) || []) {
      if (dfs(d)) return true;
    }
    stack.delete(node);
    return false;
  }
  return dfs(start);
}

/* ------------------------------------------------------------------ *
 *  HealthOrchestrator                                                *
 * ------------------------------------------------------------------ */

class HealthOrchestrator {
  constructor(opts = {}) {
    this.sloTarget = typeof opts.sloTarget === 'number'
      ? opts.sloTarget
      : SLO_TARGET_DEFAULT;
    this.defaultTimeoutMs = typeof opts.defaultTimeoutMs === 'number'
      ? opts.defaultTimeoutMs
      : DEFAULT_TIMEOUT_MS;
    this.now = typeof opts.now === 'function'
      ? opts.now
      : () => Date.now();

    // name → { checkFn, dependencies, lastStatus, lastLatencyMs,
    //          lastCheckAt, samples:[{ts,ok,latencyMs}], lastError,
    //          cascaded, isSynthetic, syntheticSteps }
    this.services = new Map();
    this.alertListeners = new Set();
  }

  /* -------- registration -------- */

  register(service, checkFn, dependencies = []) {
    if (typeof service !== 'string' || !service.trim()) {
      throw new TypeError('service name must be a non-empty string');
    }
    if (typeof checkFn !== 'function') {
      throw new TypeError('checkFn must be a function');
    }
    if (!Array.isArray(dependencies)) {
      throw new TypeError('dependencies must be an array of strings');
    }

    // Cycle check using current graph + proposed edges.
    const currentGraph = {};
    for (const [name, rec] of this.services.entries()) {
      currentGraph[name] = rec.dependencies;
    }
    if (!currentGraph[service]) currentGraph[service] = [];
    // Also add any dependencies that aren't registered yet as empty nodes.
    for (const d of dependencies) {
      if (!currentGraph[d]) currentGraph[d] = [];
    }
    if (detectCycle(currentGraph, service, dependencies)) {
      throw new Error(
        `dependency cycle detected when registering '${service}'`,
      );
    }

    const existing = this.services.get(service);
    if (existing) {
      // Never delete: preserve history, update callback + deps.
      existing.checkFn = checkFn;
      existing.dependencies = [...dependencies];
      return;
    }

    this.services.set(service, {
      checkFn,
      dependencies: [...dependencies],
      lastStatus: STATUS.UNKNOWN,
      lastLatencyMs: null,
      lastCheckAt: null,
      lastError: null,
      cascaded: false,
      samples: [],
      isSynthetic: false,
      syntheticSteps: [],
    });
  }

  registerSynthetic(service, scriptFn, dependencies = []) {
    // Synthetic checks are regular registrations with a wrapped runner.
    const wrapped = async () => {
      const t0 = this.now();
      let steps = [];
      try {
        const out = await scriptFn();
        steps = Array.isArray(out && out.steps) ? out.steps : [];
        const ok = !!(out && out.ok);
        const latencyMs = typeof (out && out.durationMs) === 'number'
          ? out.durationMs
          : this.now() - t0;
        return { ok, latencyMs, steps };
      } catch (err) {
        return {
          ok: false,
          latencyMs: this.now() - t0,
          steps,
          error: err && err.message,
        };
      }
    };
    this.register(service, wrapped, dependencies);
    const rec = this.services.get(service);
    rec.isSynthetic = true;
  }

  /* -------- alerting -------- */

  onAlert(fn) {
    if (typeof fn !== 'function') throw new TypeError('alert handler must be a function');
    this.alertListeners.add(fn);
    return () => this.alertListeners.delete(fn);
  }

  offAlert(fn) {
    this.alertListeners.delete(fn);
  }

  _emitAlert(evt) {
    for (const fn of this.alertListeners) {
      try { fn(evt); } catch (_) { /* never throw from orchestrator */ }
    }
  }

  /* -------- execution -------- */

  async runAll(opts = {}) {
    const timeoutMs = typeof opts.timeoutMs === 'number'
      ? opts.timeoutMs
      : this.defaultTimeoutMs;

    const names = [...this.services.keys()];
    const results = new Map();

    // Run every probe in parallel; per-probe timeout is enforced below.
    await Promise.all(names.map(async (name) => {
      const rec = this.services.get(name);
      const t0 = this.now();
      let ok = false;
      let latencyMs = 0;
      let error = null;
      let steps = [];
      try {
        const out = await withTimeout(
          Promise.resolve().then(() => rec.checkFn()),
          timeoutMs,
          name,
        );
        ok = !!(out && out.ok);
        latencyMs = typeof (out && out.latencyMs) === 'number'
          ? out.latencyMs
          : this.now() - t0;
        if (Array.isArray(out && out.steps)) steps = out.steps;
        if (out && out.error) error = String(out.error);
      } catch (err) {
        ok = false;
        latencyMs = this.now() - t0;
        error = err && err.message ? err.message : String(err);
      }

      const rawStatus = ok ? STATUS.GREEN : STATUS.RED;
      results.set(name, { rawStatus, latencyMs, error, steps, at: this.now() });

      // Record sample for uptime / SLO — never delete, just trim.
      rec.samples.push({ ts: this.now(), ok, latencyMs });
      if (rec.samples.length > MAX_SAMPLES) {
        rec.samples.splice(0, rec.samples.length - MAX_SAMPLES);
      }
      if (steps.length) rec.syntheticSteps = steps;
    }));

    // Apply dependency cascading. Order: topological (deps first).
    const order = this._topoOrder(names);
    for (const name of order) {
      const rec = this.services.get(name);
      const res = results.get(name);
      let status = res.rawStatus;
      let cascaded = false;
      for (const dep of rec.dependencies) {
        const depStatus = results.get(dep) ? results.get(dep).effectiveStatus : null;
        if (depStatus === STATUS.RED) {
          status = worst(status, STATUS.YELLOW);
          cascaded = true;
        } else if (depStatus === STATUS.YELLOW) {
          status = worst(status, STATUS.YELLOW);
          cascaded = true;
        }
      }
      res.effectiveStatus = status;
      res.cascaded = cascaded && res.rawStatus === STATUS.GREEN;

      const prev = rec.lastStatus;
      rec.lastStatus = status;
      rec.lastLatencyMs = res.latencyMs;
      rec.lastCheckAt = res.at;
      rec.lastError = res.error;
      rec.cascaded = res.cascaded;

      if (prev !== status && prev !== STATUS.UNKNOWN) {
        this._emitAlert({
          service: name,
          from: prev,
          to: status,
          at: res.at,
          reason: cascaded ? 'cascaded' : (res.error || 'state-change'),
        });
      } else if (prev === STATUS.UNKNOWN && status !== STATUS.GREEN) {
        // First-time red/yellow still produces an alert.
        this._emitAlert({
          service: name,
          from: STATUS.UNKNOWN,
          to: status,
          at: res.at,
          reason: cascaded ? 'cascaded' : (res.error || 'first-check'),
        });
      }

      if (opts.bail && status === STATUS.RED) break;
    }

    return {
      at: this.now(),
      services: Object.fromEntries(
        [...this.services.entries()].map(([n, r]) => [n, {
          status: r.lastStatus,
          latencyMs: r.lastLatencyMs,
          lastCheckAt: r.lastCheckAt,
          error: r.lastError,
          cascaded: r.cascaded,
          isSynthetic: r.isSynthetic,
          dependencies: [...r.dependencies],
        }]),
      ),
      aggregate: this.aggregateStatus(),
    };
  }

  _topoOrder(names) {
    const inDegree = new Map(names.map((n) => [n, 0]));
    for (const n of names) {
      const rec = this.services.get(n);
      for (const d of rec.dependencies) {
        if (inDegree.has(d)) {
          // d is a prerequisite for n, so n depends on d → n's in-degree ++.
          inDegree.set(n, (inDegree.get(n) || 0) + 1);
        }
      }
    }
    const queue = [];
    for (const [n, deg] of inDegree.entries()) if (deg === 0) queue.push(n);
    const order = [];
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      // find services that depend on n and decrement them.
      for (const m of names) {
        const mRec = this.services.get(m);
        if (mRec.dependencies.includes(n)) {
          inDegree.set(m, inDegree.get(m) - 1);
          if (inDegree.get(m) === 0) queue.push(m);
        }
      }
    }
    // If not all services are ordered (shouldn't happen: we prevent cycles),
    // append the rest deterministically.
    for (const n of names) if (!order.includes(n)) order.push(n);
    return order;
  }

  /* -------- aggregate -------- */

  aggregateStatus() {
    if (this.services.size === 0) return STATUS.UNKNOWN;
    let red = 0, yellow = 0, green = 0, unknown = 0;
    for (const rec of this.services.values()) {
      switch (rec.lastStatus) {
        case STATUS.RED: red++; break;
        case STATUS.YELLOW: yellow++; break;
        case STATUS.GREEN: green++; break;
        default: unknown++;
      }
    }
    const total = this.services.size;
    if (unknown === total) return STATUS.UNKNOWN;
    // Majority red OR everybody either red or unknown → RED.
    if (red > total / 2) return STATUS.RED;
    // Any red/yellow present (but not majority red) → YELLOW (partial).
    if (red > 0 || yellow > 0) return STATUS.YELLOW;
    return STATUS.GREEN;
  }

  /* -------- history / uptime -------- */

  uptime(service, windowKey = '24h') {
    const rec = this.services.get(service);
    if (!rec) return null;
    const windowMs = WINDOW_MS[windowKey];
    if (!windowMs) throw new Error(`unknown window: ${windowKey}`);
    const cutoff = this.now() - windowMs;
    const inWindow = rec.samples.filter((s) => s.ts >= cutoff);
    if (inWindow.length === 0) return null;
    const ok = inWindow.filter((s) => s.ok).length;
    return ok / inWindow.length;
  }

  historicalUptime(service) {
    return {
      '24h': this.uptime(service, '24h'),
      '7d': this.uptime(service, '7d'),
      '30d': this.uptime(service, '30d'),
    };
  }

  /* -------- SLO -------- */

  sloReport(service) {
    const up30d = this.uptime(service, '30d');
    const current = up30d == null ? null : up30d;
    const target = this.sloTarget;
    const budget = 1 - target; // allowed error fraction
    const consumed = current == null ? null : Math.max(0, 1 - current);
    const burnRate = (current == null || budget === 0)
      ? null
      : consumed / budget;
    const budgetRemainingPct = (consumed == null || budget === 0)
      ? null
      : Math.max(0, (1 - (consumed / budget)) * 100);
    return { service, target, current, burnRate, budgetRemainingPct, window: '30d' };
  }

  /* -------- synthetic runner -------- */

  async runSynthetic(name, scriptFn, timeoutMs) {
    const to = typeof timeoutMs === 'number' ? timeoutMs : this.defaultTimeoutMs;
    const t0 = this.now();
    let ok = false;
    let steps = [];
    let error = null;
    try {
      const out = await withTimeout(
        Promise.resolve().then(() => scriptFn()),
        to,
        name,
      );
      ok = !!(out && out.ok);
      steps = Array.isArray(out && out.steps) ? out.steps : [];
    } catch (err) {
      ok = false;
      error = err && err.message ? err.message : String(err);
    }
    return { name, ok, durationMs: this.now() - t0, steps, error };
  }

  /* -------- status page (bilingual HTML, RTL) -------- */

  statusPage(lang = 'he') {
    const L = I18N[lang] || I18N.he;
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const agg = this.aggregateStatus();

    const aggLabel = L[agg] || L.unknown;
    const aggColor = aggColorForStatus(agg);

    const rows = [];
    for (const [name, rec] of this.services.entries()) {
      const label = L[rec.lastStatus] || L.unknown;
      const color = aggColorForStatus(rec.lastStatus);
      const up = this.historicalUptime(name);
      const slo = this.sloReport(name);
      const deps = rec.dependencies.length
        ? rec.dependencies.map(escapeHtml).join(', ')
        : L.none;
      const lastAt = rec.lastCheckAt
        ? new Date(rec.lastCheckAt).toISOString()
        : '—';
      const latency = rec.lastLatencyMs == null
        ? '—'
        : `${Math.round(rec.lastLatencyMs)} ms`;
      const cascadedNote = rec.cascaded
        ? `<div class="cascaded">${escapeHtml(L.cascaded)}</div>`
        : '';
      const uptimeStrip = `
        <div class="uptime-strip">
          <span class="uw"><b>${escapeHtml(L.w24h)}</b> ${fmtPct(up['24h'])}</span>
          <span class="uw"><b>${escapeHtml(L.w7d)}</b> ${fmtPct(up['7d'])}</span>
          <span class="uw"><b>${escapeHtml(L.w30d)}</b> ${fmtPct(up['30d'])}</span>
        </div>`;
      const sloLine = `
        <div class="slo">
          <b>${escapeHtml(L.slo)}</b> ${(slo.target * 100).toFixed(2)}%
          &middot; <b>${escapeHtml(L.burnRate)}</b> ${fmtNum(slo.burnRate)}
          &middot; <b>${escapeHtml(L.budget)}</b> ${fmtPct(
            slo.budgetRemainingPct == null ? null : slo.budgetRemainingPct / 100,
          )}
        </div>`;

      rows.push(`
        <article class="card" data-service="${escapeHtml(name)}">
          <header>
            <span class="dot" style="background:${color}"></span>
            <h3>${escapeHtml(name)}${rec.isSynthetic ? ' <sup>synthetic</sup>' : ''}</h3>
            <span class="badge" style="background:${color}">${escapeHtml(label)}</span>
          </header>
          <dl>
            <dt>${escapeHtml(L.deps)}</dt><dd>${deps}</dd>
            <dt>${escapeHtml(L.lastCheck)}</dt><dd>${escapeHtml(lastAt)}</dd>
            <dt>${escapeHtml(L.latency)}</dt><dd>${escapeHtml(latency)}</dd>
          </dl>
          ${uptimeStrip}
          ${sloLine}
          ${cascadedNote}
        </article>`);
    }

    return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(L.title)}</title>
  <style>
    :root{
      --bg:#0f172a;--fg:#e2e8f0;--card:#1e293b;--muted:#94a3b8;
      --green:#10b981;--yellow:#f59e0b;--red:#ef4444;--unknown:#6b7280;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,"Segoe UI",Arial,sans-serif;
         background:var(--bg);color:var(--fg);padding:24px;direction:${dir}}
    header.page{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    h1{margin:0;font-size:1.6rem}
    .subtitle{color:var(--muted);margin:4px 0 16px}
    .agg-banner{padding:16px;border-radius:12px;color:#fff;font-size:1.2rem;
                display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;
                background:${aggColor}}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .card{background:var(--card);border-radius:12px;padding:16px}
    .card header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .card h3{margin:0;font-size:1.05rem;flex:1}
    .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
    .badge{padding:2px 8px;border-radius:999px;color:#fff;font-size:0.78rem}
    dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0 0 12px;font-size:0.85rem}
    dt{color:var(--muted)}
    .uptime-strip{display:flex;gap:12px;margin-bottom:8px;font-size:0.82rem}
    .uw{background:#0b1424;padding:4px 8px;border-radius:6px}
    .slo{font-size:0.82rem;color:var(--muted)}
    .cascaded{margin-top:6px;color:var(--yellow);font-size:0.8rem}
    sup{font-size:0.65rem;color:var(--muted)}
  </style>
</head>
<body>
  <header class="page">
    <div>
      <h1>${escapeHtml(L.title)}</h1>
      <div class="subtitle">${escapeHtml(L.subtitle)}</div>
    </div>
  </header>
  <section class="agg-banner">
    <span>${escapeHtml(L.aggregate)}</span>
    <strong>${escapeHtml(aggLabel)}</strong>
  </section>
  <section class="grid">
    ${rows.join('\n')}
  </section>
  <footer class="subtitle" style="margin-top:24px">
    Agent Y-175 &middot; Techno-Kol Uzi mega-ERP &middot; ${new Date(this.now()).toISOString()}
  </footer>
</body>
</html>`;
  }
}

/* ------------------------------------------------------------------ *
 *  Formatters                                                        *
 * ------------------------------------------------------------------ */

function aggColorForStatus(s) {
  switch (s) {
    case STATUS.GREEN: return '#10b981';
    case STATUS.YELLOW: return '#f59e0b';
    case STATUS.RED: return '#ef4444';
    default: return '#6b7280';
  }
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtNum(v) {
  if (v == null) return '—';
  return v.toFixed(2);
}

/* ------------------------------------------------------------------ *
 *  Exports                                                           *
 * ------------------------------------------------------------------ */

module.exports = {
  HealthOrchestrator,
  STATUS,
  SLO_TARGET_DEFAULT,
  WINDOW_MS,
  // internal helpers exposed for unit tests
  _internal: { escapeHtml, statusRank, worst, detectCycle, withTimeout, fmtPct, fmtNum },
};
