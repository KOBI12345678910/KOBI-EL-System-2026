/**
 * ONYX OPS — Master Health Dashboard (Agent X-96)
 * ================================================
 * Techno-Kol Uzi mega-ERP / Swarm 3D
 *
 * Aggregates every observability signal from agents X-51..X-65 into a
 * single unified, bilingual (Hebrew RTL / English LTR), Palantir-dark
 * themed HTML dashboard. Zero chart libraries — pure SVG. Zero external
 * npm dependencies (Node built-ins only). Auto-refresh every 30 seconds
 * via HTML meta tag.
 *
 * Rule (system-wide): לא מוחקים רק משדרגים ומגדלים
 *   — Never delete, only upgrade and grow. This module is strictly
 *   additive: it never mutates or removes any input. It tolerates
 *   missing sources gracefully.
 *
 * --- Signal Sources (all optional) --------------------------------
 *   prom          — Prometheus-style metrics (X-51)
 *     { latency_p95_ms: [n], error_rate: [n], req_rate: [n], ts: [ms] }
 *   slo           — SLO burn-rate + targets (X-60)
 *     { burnRate: n, target: n, current: n, window: '30d' }
 *   incidents     — Open incidents (X-61)
 *     [ { id, title, titleHe, severity, openedAt, status } ]
 *   errorBudget   — Remaining error budget (X-60)
 *     { remaining_pct: n, consumed_pct: n, eta_exhaustion: ms }
 *   alerts        — Active alerts (X-55)
 *     [ { id, name, nameHe, severity, firedAt, labels } ]
 *   errors        — Top errors (X-54)
 *     [ { message, count, lastSeen, service } ]
 *   deps          — Dependency vulnerabilities (X-58)
 *     { critical: n, high: n, medium: n, low: n, totalPackages: n }
 *   resources     — OS resource usage (X-63)
 *     { cpu_pct: [n], mem_pct: [n], disk_pct: n, load_avg: [n], ts: [ms] }
 *   uptime        — Uptime statistics (X-62)
 *     { overall_pct: n, since: ms, per_service: { id: pct } }
 *   logs          — Log volume over time (X-54)
 *     { rate_per_min: [n], ts: [ms], levels: { error: n, warn: n, info: n } }
 *   canary        — Synthetic canary results (X-65)
 *     [ { name, nameHe, status, latencyMs, lastRun } ]
 *   services      — Per-service health table (X-56 aggregated)
 *     [ { id, name, nameHe, status, uptime_pct, p95_ms, error_rate, owner } ]
 *
 * --- Public API ---------------------------------------------------
 *   generateMasterDashboard(signals)  → HTML string
 *   dashboardJSON(signals)            → JSON-safe object for API consumers
 *   middleware([getSignals])          → Express middleware mounted at /ops/dashboard
 *   attach(app, [opts])               → helper: app.use('/ops/dashboard', middleware)
 *
 *   Also exported (for testing / composition):
 *     _renderKpiCards, _renderLatencyChart, _renderErrorChart,
 *     _renderResourceChart, _renderServiceTable, _escapeHtml,
 *     _svgLineChart, _computeSummary, THEME, VERSION
 *
 * --- Layout -------------------------------------------------------
 *   +---------------------------------------------------------------+
 *   | Header: title, bilingual toggle, last-refresh, overall status |
 *   +---------------------------------------------------------------+
 *   | KPI cards: Uptime | SLO Burn | Incidents | Error Budget       |
 *   +---------------------------------------------------------------+
 *   | Charts: p95 latency | error rate | resource usage (CPU/mem)   |
 *   +---------------------------------------------------------------+
 *   | Services table (id, status, uptime, p95, error rate, owner)   |
 *   +---------------------------------------------------------------+
 *   | Footer: alerts summary, top errors, deps, canary, signal src  |
 *   +---------------------------------------------------------------+
 *
 * --- Theme (Palantir dark, honoured verbatim) ---------------------
 *   bg      #0b0d10      (page background)
 *   panel   #13171c      (card / section background)
 *   accent  #4a9eff      (primary highlight, chart main line)
 *
 *   status palette (derived, consistent with ./status-page.js):
 *     healthy/green   #10b981
 *     warning/yellow  #f59e0b
 *     critical/red    #ef4444
 *     info/blue       #3b82f6
 */

'use strict';

const VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════

const THEME = Object.freeze({
  bg: '#0b0d10',
  panel: '#13171c',
  panelElev: '#1a1f26',
  border: '#232932',
  accent: '#4a9eff',
  accentDim: '#2563eb',
  text: '#e5e9f0',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  ok: '#10b981',
  warn: '#f59e0b',
  crit: '#ef4444',
  info: '#3b82f6',
  grid: '#1f242c',
});

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL STRINGS
// ═══════════════════════════════════════════════════════════════════

const L = Object.freeze({
  title:            { he: 'לוח בקרה ראשי', en: 'Master Health Dashboard' },
  subtitle:         { he: 'אחדות כל אותות תצפיתיות X-51..X-65', en: 'Unified X-51..X-65 observability signals' },
  lastUpdate:       { he: 'עדכון אחרון', en: 'Last update' },
  refresh:          { he: 'רענון אוטומטי כל 30 שניות', en: 'Auto-refresh every 30 seconds' },
  overall:          { he: 'מצב כולל', en: 'Overall status' },
  // KPIs
  kpiUptime:        { he: 'זמינות', en: 'Uptime' },
  kpiSloBurn:       { he: 'קצב שריפת SLO', en: 'SLO Burn Rate' },
  kpiIncidents:     { he: 'אירועים פעילים', en: 'Active Incidents' },
  kpiErrorBudget:   { he: 'תקציב שגיאות', en: 'Error Budget' },
  // Charts
  chartLatency:     { he: 'השהיית P95 (ms)', en: 'Latency P95 (ms)' },
  chartErrors:      { he: 'קצב שגיאות (%)', en: 'Error Rate (%)' },
  chartResources:   { he: 'ניצול משאבי מערכת', en: 'Resource Usage' },
  cpuLabel:         { he: 'מעבד', en: 'CPU' },
  memLabel:         { he: 'זיכרון', en: 'Memory' },
  // Tables / sections
  services:         { he: 'שירותים', en: 'Services' },
  service:          { he: 'שירות', en: 'Service' },
  status:           { he: 'סטטוס', en: 'Status' },
  uptime:           { he: 'זמינות', en: 'Uptime' },
  p95:              { he: 'השהיית P95', en: 'P95 Latency' },
  errorRate:        { he: 'קצב שגיאות', en: 'Error Rate' },
  owner:            { he: 'אחראי', en: 'Owner' },
  alerts:           { he: 'התראות פעילות', en: 'Active Alerts' },
  topErrors:        { he: 'שגיאות נפוצות', en: 'Top Errors' },
  deps:             { he: 'פגיעויות תלויות', en: 'Dependency Vulnerabilities' },
  canary:           { he: 'בדיקות סינתטיות', en: 'Synthetic Canaries' },
  sources:          { he: 'מקורות אותות', en: 'Signal Sources' },
  noData:           { he: 'אין נתונים', en: 'No data' },
  missing:          { he: 'חסר', en: 'missing' },
  connected:        { he: 'מחובר', en: 'connected' },
  // Statuses
  stOk:             { he: 'תקין', en: 'operational' },
  stDegraded:       { he: 'מוגבל', en: 'degraded' },
  stOutage:         { he: 'תקלה', en: 'outage' },
  stUnknown:        { he: 'לא ידוע', en: 'unknown' },
  // Severities
  sev1:             { he: 'קריטי', en: 'SEV1' },
  sev2:             { he: 'חמור', en: 'SEV2' },
  sev3:             { he: 'בינוני', en: 'SEV3' },
  sev4:             { he: 'קל', en: 'SEV4' },
  critical:         { he: 'קריטי', en: 'critical' },
  high:             { he: 'גבוה', en: 'high' },
  medium:           { he: 'בינוני', en: 'medium' },
  low:              { he: 'נמוך', en: 'low' },
  remaining:        { he: 'נשאר', en: 'remaining' },
  count:            { he: 'כמות', en: 'count' },
  latency:          { he: 'השהייה', en: 'latency' },
  // Footer
  rule:             { he: 'לא מוחקים רק משדרגים ומגדלים', en: 'Never delete, only upgrade and grow' },
  agent:            { he: 'סוכן', en: 'Agent' },
});

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Escape HTML entities to prevent XSS. Handles null/undefined/non-strings
 * by coercing to empty string.
 */
function _escapeHtml(s) {
  if (s === null || s === undefined) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _num(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _arr(v) {
  return Array.isArray(v) ? v : [];
}

function _fmtPct(n, digits = 2) {
  const x = _num(n, NaN);
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(digits) + '%';
}

function _fmtNum(n, digits = 0) {
  const x = _num(n, NaN);
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}

function _fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch (_) {
    return '—';
  }
}

function _clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function _statusColor(level) {
  switch (level) {
    case 'operational':
    case 'ok':
    case 'healthy':
    case 'green':
      return THEME.ok;
    case 'degraded':
    case 'warning':
    case 'yellow':
      return THEME.warn;
    case 'outage':
    case 'critical':
    case 'red':
    case 'down':
    case 'major_outage':
    case 'partial_outage':
      return THEME.crit;
    case 'info':
    case 'maintenance':
    case 'blue':
      return THEME.info;
    default:
      return THEME.textDim;
  }
}

function _statusLabel(level) {
  switch (level) {
    case 'operational':
    case 'ok':
    case 'healthy':
      return L.stOk;
    case 'degraded':
    case 'warning':
      return L.stDegraded;
    case 'outage':
    case 'critical':
    case 'down':
    case 'major_outage':
    case 'partial_outage':
      return L.stOutage;
    default:
      return L.stUnknown;
  }
}

function _bilingual(key) {
  const entry = L[key];
  if (!entry) return '';
  return `<span class="he">${_escapeHtml(entry.he)}</span><span class="sep">·</span><span class="en">${_escapeHtml(entry.en)}</span>`;
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY COMPUTATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute a high-level summary from raw signals. Every field is safe to
 * missing input — returns sentinel nulls / zeros rather than throwing.
 */
function _computeSummary(signals) {
  const s = signals || {};
  const uptime = s.uptime || {};
  const slo = s.slo || {};
  const incidents = _arr(s.incidents);
  const errorBudget = s.errorBudget || {};
  const alerts = _arr(s.alerts);
  const services = _arr(s.services);

  const uptimePct = _num(uptime.overall_pct, NaN);
  const sloBurn = _num(slo.burnRate, NaN);
  const budgetRemaining = _num(errorBudget.remaining_pct, NaN);

  const openIncidents = incidents.filter(
    (i) => i && i.status !== 'resolved' && i.status !== 'closed'
  );
  const sev1Count = openIncidents.filter((i) => String(i.severity).toUpperCase() === 'SEV1').length;
  const sev2Count = openIncidents.filter((i) => String(i.severity).toUpperCase() === 'SEV2').length;
  const firingAlerts = alerts.filter((a) => a && (a.state === 'firing' || !a.state));

  // Overall level: worst of uptime, SLO, incidents, services
  let level = 'operational';
  if (Number.isFinite(uptimePct) && uptimePct < 99.0) level = 'degraded';
  if (Number.isFinite(uptimePct) && uptimePct < 95.0) level = 'outage';
  if (Number.isFinite(sloBurn) && sloBurn > 2) level = 'degraded';
  if (Number.isFinite(sloBurn) && sloBurn > 10) level = 'outage';
  if (Number.isFinite(budgetRemaining) && budgetRemaining < 25) level = 'degraded';
  if (Number.isFinite(budgetRemaining) && budgetRemaining < 5) level = 'outage';
  if (sev2Count > 0 && level === 'operational') level = 'degraded';
  if (sev1Count > 0) level = 'outage';
  if (services.some((sv) => sv && (sv.status === 'outage' || sv.status === 'critical' || sv.status === 'down'))) {
    level = 'outage';
  }

  return {
    level,
    uptimePct,
    sloBurn,
    sloTarget: _num(slo.target, NaN),
    sloCurrent: _num(slo.current, NaN),
    budgetRemaining,
    budgetConsumed: _num(errorBudget.consumed_pct, NaN),
    openIncidents: openIncidents.length,
    sev1Count,
    sev2Count,
    firingAlerts: firingAlerts.length,
    servicesTotal: services.length,
    servicesHealthy: services.filter((sv) => sv && (sv.status === 'operational' || sv.status === 'ok' || sv.status === 'healthy')).length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SVG CHART PRIMITIVE — zero-dep line chart
// ═══════════════════════════════════════════════════════════════════

/**
 * Render a line chart as inline SVG. Supports one or more series sharing
 * the same x-axis (data length). Safe against empty / malformed input.
 *
 * @param {Array<{label: string, color: string, data: number[]}>} series
 * @param {Object} opts
 * @returns {string} SVG fragment
 */
function _svgLineChart(series, opts) {
  const o = opts || {};
  const width = _num(o.width, 520);
  const height = _num(o.height, 180);
  const padL = 42, padR = 12, padT = 14, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const unit = _escapeHtml(o.unit || '');

  const validSeries = _arr(series)
    .map((s) => ({
      label: _escapeHtml(s && s.label ? s.label : ''),
      color: (s && s.color) || THEME.accent,
      data: _arr(s && s.data).map((v) => _num(v, 0)),
    }))
    .filter((s) => s.data.length > 0);

  if (validSeries.length === 0) {
    return (
      `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="chart">` +
      `<rect width="${width}" height="${height}" fill="${THEME.panel}" rx="6"/>` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${THEME.textDim}" font-size="12" font-family="monospace">${_escapeHtml(L.noData.en)} / ${_escapeHtml(L.noData.he)}</text>` +
      `</svg>`
    );
  }

  const N = Math.max(...validSeries.map((s) => s.data.length));
  let min = Infinity, max = -Infinity;
  validSeries.forEach((s) => {
    s.data.forEach((v) => {
      if (v < min) min = v;
      if (v > max) max = v;
    });
  });
  if (min === max) {
    min = min - 1;
    max = max + 1;
  }
  if (o.yMin !== undefined) min = _num(o.yMin, min);
  if (o.yMax !== undefined) max = _num(o.yMax, max);
  const range = max - min || 1;

  const xStep = N > 1 ? plotW / (N - 1) : plotW;
  const xOf = (i) => padL + i * xStep;
  const yOf = (v) => padT + plotH - ((v - min) / range) * plotH;

  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="chart" role="img" aria-label="${_escapeHtml(o.ariaLabel || 'chart')}">`;
  svg += `<rect width="${width}" height="${height}" fill="${THEME.panel}" rx="6"/>`;

  // Grid + y-axis labels (5 horizontal lines)
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    const val = max - (range * i) / 4;
    svg += `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${padL + plotW}" y2="${y.toFixed(2)}" stroke="${THEME.grid}" stroke-width="1"/>`;
    svg += `<text x="${padL - 4}" y="${(y + 3).toFixed(2)}" text-anchor="end" fill="${THEME.textMuted}" font-size="9" font-family="monospace">${val.toFixed(1)}${unit}</text>`;
  }

  // Axis lines
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${THEME.border}" stroke-width="1"/>`;
  svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${THEME.border}" stroke-width="1"/>`;

  // Series lines + area under main line
  validSeries.forEach((s, idx) => {
    if (s.data.length === 0) return;
    const points = s.data.map((v, i) => `${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`);
    // Area fill for first series only — accent glow
    if (idx === 0 && s.data.length > 1) {
      const areaPts = [
        `${xOf(0).toFixed(2)},${(padT + plotH).toFixed(2)}`,
        ...points,
        `${xOf(s.data.length - 1).toFixed(2)},${(padT + plotH).toFixed(2)}`,
      ].join(' ');
      svg += `<polygon points="${areaPts}" fill="${s.color}" opacity="0.12"/>`;
    }
    svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    // Dots at sample points when sparse
    if (s.data.length <= 24) {
      s.data.forEach((v, i) => {
        svg += `<circle cx="${xOf(i).toFixed(2)}" cy="${yOf(v).toFixed(2)}" r="2" fill="${s.color}"/>`;
      });
    }
  });

  // Legend
  if (validSeries.length > 1 || (validSeries[0] && validSeries[0].label)) {
    let lx = padL;
    const ly = padT + plotH + 14;
    validSeries.forEach((s) => {
      svg += `<rect x="${lx}" y="${ly - 7}" width="10" height="3" fill="${s.color}"/>`;
      svg += `<text x="${lx + 14}" y="${ly}" fill="${THEME.textDim}" font-size="10" font-family="monospace">${s.label}</text>`;
      lx += 14 + (s.label.length * 6) + 10;
    });
  }

  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════════════════════════════════
// KPI CARDS
// ═══════════════════════════════════════════════════════════════════

function _kpiCard(key, value, sub, tone) {
  const toneColor = tone === 'ok' ? THEME.ok : tone === 'warn' ? THEME.warn : tone === 'crit' ? THEME.crit : THEME.accent;
  return (
    `<div class="kpi" style="border-left-color:${toneColor}">` +
    `<div class="kpi-label">${_bilingual(key)}</div>` +
    `<div class="kpi-value" style="color:${toneColor}">${_escapeHtml(value)}</div>` +
    `<div class="kpi-sub">${_escapeHtml(sub || '')}</div>` +
    `</div>`
  );
}

function _renderKpiCards(summary) {
  // Uptime
  const upVal = Number.isFinite(summary.uptimePct) ? _fmtPct(summary.uptimePct, 2) : '—';
  const upTone = !Number.isFinite(summary.uptimePct) ? 'neutral'
    : summary.uptimePct >= 99.9 ? 'ok'
    : summary.uptimePct >= 99 ? 'warn'
    : 'crit';

  // SLO Burn
  const burnVal = Number.isFinite(summary.sloBurn) ? summary.sloBurn.toFixed(2) + '×' : '—';
  const burnTone = !Number.isFinite(summary.sloBurn) ? 'neutral'
    : summary.sloBurn < 1 ? 'ok'
    : summary.sloBurn < 5 ? 'warn'
    : 'crit';
  const burnSub = Number.isFinite(summary.sloTarget) ? `target ${(summary.sloTarget * 100).toFixed(2)}%` : '';

  // Incidents
  const incVal = String(summary.openIncidents);
  const incTone = summary.sev1Count > 0 ? 'crit'
    : summary.sev2Count > 0 ? 'warn'
    : summary.openIncidents === 0 ? 'ok'
    : 'warn';
  const incSub = summary.sev1Count > 0 ? `${summary.sev1Count} SEV1`
    : summary.sev2Count > 0 ? `${summary.sev2Count} SEV2`
    : '';

  // Error Budget
  const ebVal = Number.isFinite(summary.budgetRemaining) ? _fmtPct(summary.budgetRemaining, 1) : '—';
  const ebTone = !Number.isFinite(summary.budgetRemaining) ? 'neutral'
    : summary.budgetRemaining >= 50 ? 'ok'
    : summary.budgetRemaining >= 25 ? 'warn'
    : 'crit';
  const ebSub = L.remaining.en;

  return (
    `<section class="kpi-row" aria-label="KPI cards">` +
    _kpiCard('kpiUptime', upVal, '', upTone) +
    _kpiCard('kpiSloBurn', burnVal, burnSub, burnTone) +
    _kpiCard('kpiIncidents', incVal, incSub, incTone) +
    _kpiCard('kpiErrorBudget', ebVal, ebSub, ebTone) +
    `</section>`
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════

function _renderLatencyChart(prom) {
  const p = prom || {};
  const svg = _svgLineChart(
    [{ label: 'p95 (ms)', color: THEME.accent, data: _arr(p.latency_p95_ms) }],
    { width: 520, height: 180, unit: 'ms', ariaLabel: 'latency p95 trend' }
  );
  return `<div class="chart-card"><div class="chart-title">${_bilingual('chartLatency')}</div>${svg}</div>`;
}

function _renderErrorChart(prom) {
  const p = prom || {};
  // error_rate may arrive as fraction (0..1) or percent (0..100) — normalise to pct
  let data = _arr(p.error_rate).map((v) => _num(v, 0));
  if (data.length > 0 && Math.max(...data) <= 1.0) {
    data = data.map((v) => v * 100);
  }
  const svg = _svgLineChart(
    [{ label: 'error %', color: THEME.crit, data }],
    { width: 520, height: 180, unit: '%', yMin: 0, ariaLabel: 'error rate trend' }
  );
  return `<div class="chart-card"><div class="chart-title">${_bilingual('chartErrors')}</div>${svg}</div>`;
}

function _renderResourceChart(resources) {
  const r = resources || {};
  const cpu = _arr(r.cpu_pct);
  const mem = _arr(r.mem_pct);
  const svg = _svgLineChart(
    [
      { label: L.cpuLabel.en, color: THEME.accent, data: cpu },
      { label: L.memLabel.en, color: THEME.warn, data: mem },
    ],
    { width: 520, height: 180, unit: '%', yMin: 0, yMax: 100, ariaLabel: 'resource usage trend' }
  );
  return `<div class="chart-card"><div class="chart-title">${_bilingual('chartResources')}</div>${svg}</div>`;
}

// ═══════════════════════════════════════════════════════════════════
// SERVICES TABLE
// ═══════════════════════════════════════════════════════════════════

function _renderServiceTable(services) {
  const rows = _arr(services);
  if (rows.length === 0) {
    return (
      `<section class="svc-section"><h2 class="section-title">${_bilingual('services')}</h2>` +
      `<div class="empty">${_escapeHtml(L.noData.he)} · ${_escapeHtml(L.noData.en)}</div></section>`
    );
  }

  const header = (
    `<tr>` +
    `<th>${_bilingual('service')}</th>` +
    `<th>${_bilingual('status')}</th>` +
    `<th>${_bilingual('uptime')}</th>` +
    `<th>${_bilingual('p95')}</th>` +
    `<th>${_bilingual('errorRate')}</th>` +
    `<th>${_bilingual('owner')}</th>` +
    `</tr>`
  );

  const body = rows
    .map((sv) => {
      if (!sv) return '';
      const id = _escapeHtml(sv.id || sv.name || '?');
      const nameHe = _escapeHtml(sv.nameHe || '');
      const nameEn = _escapeHtml(sv.name || sv.id || '');
      const st = sv.status || 'unknown';
      const color = _statusColor(st);
      const lbl = _statusLabel(st);
      const uptimeCell = sv.uptime_pct !== undefined ? _fmtPct(sv.uptime_pct, 2) : '—';
      const p95Cell = sv.p95_ms !== undefined ? _fmtNum(sv.p95_ms, 0) + ' ms' : '—';
      const errPct = sv.error_rate !== undefined
        ? (_num(sv.error_rate, 0) <= 1 ? _fmtPct(_num(sv.error_rate, 0) * 100, 2) : _fmtPct(_num(sv.error_rate, 0), 2))
        : '—';
      const owner = _escapeHtml(sv.owner || '—');
      return (
        `<tr>` +
        `<td><span class="svc-id">${id}</span>${nameHe ? `<span class="svc-he">${nameHe}</span>` : ''}${nameEn && nameEn !== id ? `<span class="svc-en">${nameEn}</span>` : ''}</td>` +
        `<td><span class="pill" style="background:${color}22;color:${color};border:1px solid ${color}55">${_escapeHtml(lbl.he)} · ${_escapeHtml(lbl.en)}</span></td>` +
        `<td class="num">${uptimeCell}</td>` +
        `<td class="num">${p95Cell}</td>` +
        `<td class="num">${errPct}</td>` +
        `<td>${owner}</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    `<section class="svc-section"><h2 class="section-title">${_bilingual('services')}</h2>` +
    `<table class="svc-table" role="table"><thead>${header}</thead><tbody>${body}</tbody></table></section>`
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOOTER WIDGETS
// ═══════════════════════════════════════════════════════════════════

function _renderAlertsWidget(alerts) {
  const a = _arr(alerts);
  if (a.length === 0) {
    return `<div class="widget"><h3>${_bilingual('alerts')}</h3><div class="empty">${_escapeHtml(L.noData.he)}</div></div>`;
  }
  const items = a.slice(0, 8).map((alert) => {
    if (!alert) return '';
    const sev = String(alert.severity || 'info').toLowerCase();
    const color = sev === 'critical' || sev === 'sev1' ? THEME.crit
      : sev === 'high' || sev === 'sev2' ? THEME.warn
      : THEME.info;
    const name = _escapeHtml(alert.name || alert.id || '?');
    const nameHe = _escapeHtml(alert.nameHe || '');
    return `<li><span class="dot" style="background:${color}"></span><span>${name}${nameHe ? ' · ' + nameHe : ''}</span></li>`;
  }).join('');
  return `<div class="widget"><h3>${_bilingual('alerts')}</h3><ul class="w-list">${items}</ul></div>`;
}

function _renderTopErrorsWidget(errors) {
  const e = _arr(errors);
  if (e.length === 0) {
    return `<div class="widget"><h3>${_bilingual('topErrors')}</h3><div class="empty">${_escapeHtml(L.noData.he)}</div></div>`;
  }
  const items = e.slice(0, 6).map((err) => {
    if (!err) return '';
    const msg = _escapeHtml(String(err.message || err.fingerprint || '?').slice(0, 80));
    const cnt = _fmtNum(err.count, 0);
    return `<li><code class="err-msg">${msg}</code><span class="err-cnt">×${cnt}</span></li>`;
  }).join('');
  return `<div class="widget"><h3>${_bilingual('topErrors')}</h3><ul class="w-list err-list">${items}</ul></div>`;
}

function _renderDepsWidget(deps) {
  const d = deps || {};
  if (!deps) {
    return `<div class="widget"><h3>${_bilingual('deps')}</h3><div class="empty">${_escapeHtml(L.noData.he)}</div></div>`;
  }
  const rows = [
    { k: 'critical', v: _num(d.critical, 0), color: THEME.crit },
    { k: 'high', v: _num(d.high, 0), color: THEME.warn },
    { k: 'medium', v: _num(d.medium, 0), color: THEME.info },
    { k: 'low', v: _num(d.low, 0), color: THEME.textDim },
  ];
  const items = rows.map((r) =>
    `<li><span class="dot" style="background:${r.color}"></span>${_bilingual(r.k)}<span class="w-num">${r.v}</span></li>`
  ).join('');
  return `<div class="widget"><h3>${_bilingual('deps')}</h3><ul class="w-list">${items}</ul></div>`;
}

function _renderCanaryWidget(canary) {
  const c = _arr(canary);
  if (c.length === 0) {
    return `<div class="widget"><h3>${_bilingual('canary')}</h3><div class="empty">${_escapeHtml(L.noData.he)}</div></div>`;
  }
  const items = c.slice(0, 6).map((k) => {
    if (!k) return '';
    const color = _statusColor(k.status);
    const name = _escapeHtml(k.name || '?');
    const nameHe = _escapeHtml(k.nameHe || '');
    const lat = k.latencyMs !== undefined ? _fmtNum(k.latencyMs, 0) + ' ms' : '';
    return `<li><span class="dot" style="background:${color}"></span><span>${name}${nameHe ? ' · ' + nameHe : ''}</span>${lat ? `<span class="w-num">${lat}</span>` : ''}</li>`;
  }).join('');
  return `<div class="widget"><h3>${_bilingual('canary')}</h3><ul class="w-list">${items}</ul></div>`;
}

function _renderSourcesWidget(signals) {
  const s = signals || {};
  const keys = [
    ['prom', 'X-51 Prometheus'],
    ['slo', 'X-60 SLO'],
    ['incidents', 'X-61 Incidents'],
    ['errorBudget', 'X-60 Budget'],
    ['alerts', 'X-55 Alerts'],
    ['errors', 'X-54 Errors'],
    ['deps', 'X-58 Deps'],
    ['resources', 'X-63 Resources'],
    ['uptime', 'X-62 Uptime'],
    ['logs', 'X-54 Logs'],
    ['canary', 'X-65 Canary'],
    ['services', 'X-56 Services'],
  ];
  const items = keys.map(([k, label]) => {
    const present = !!(s[k] && (Array.isArray(s[k]) ? s[k].length : Object.keys(s[k]).length));
    const color = present ? THEME.ok : THEME.textMuted;
    const labelText = present ? L.connected : L.missing;
    return `<li><span class="dot" style="background:${color}"></span><span class="src-key">${_escapeHtml(label)}</span><span class="w-num" style="color:${color}">${_escapeHtml(labelText.he)} · ${_escapeHtml(labelText.en)}</span></li>`;
  }).join('');
  return `<div class="widget widget-wide"><h3>${_bilingual('sources')}</h3><ul class="w-list sources-list">${items}</ul></div>`;
}

// ═══════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════

const STYLE = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:${THEME.bg};color:${THEME.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans Hebrew','Alef',sans-serif;font-size:13px;line-height:1.45}
  body{min-height:100vh;padding:16px}
  header.mdh-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 20px;background:${THEME.panel};border:1px solid ${THEME.border};border-radius:10px;margin-bottom:14px}
  header.mdh-header .title{font-size:18px;font-weight:600;color:${THEME.text}}
  header.mdh-header .subtitle{font-size:11px;color:${THEME.textDim};margin-top:2px}
  header.mdh-header .meta{font-size:11px;color:${THEME.textMuted};text-align:end;font-family:monospace}
  .overall-pill{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;font-family:monospace}
  .he{direction:rtl;unicode-bidi:isolate}
  .en{direction:ltr;unicode-bidi:isolate;color:${THEME.textDim}}
  .sep{margin:0 6px;color:${THEME.border}}
  .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px}
  .kpi{background:${THEME.panel};border:1px solid ${THEME.border};border-left:4px solid ${THEME.accent};border-radius:8px;padding:14px 16px}
  .kpi-label{font-size:11px;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
  .kpi-value{font-size:28px;font-weight:700;font-family:monospace;line-height:1.1}
  .kpi-sub{font-size:10px;color:${THEME.textMuted};margin-top:4px;font-family:monospace}
  .charts-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;margin-bottom:14px}
  .chart-card{background:${THEME.panel};border:1px solid ${THEME.border};border-radius:8px;padding:12px 14px}
  .chart-title{font-size:12px;color:${THEME.textDim};margin-bottom:8px;font-weight:600}
  svg.chart{width:100%;height:auto;display:block}
  .svc-section{background:${THEME.panel};border:1px solid ${THEME.border};border-radius:8px;padding:14px 16px;margin-bottom:14px}
  .section-title{font-size:14px;margin:0 0 10px 0;color:${THEME.text};font-weight:600}
  table.svc-table{width:100%;border-collapse:collapse}
  table.svc-table th{text-align:start;font-size:11px;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.5px;padding:8px 10px;border-bottom:1px solid ${THEME.border};font-weight:600}
  table.svc-table td{padding:10px;border-bottom:1px solid ${THEME.grid};font-size:12px;color:${THEME.text}}
  table.svc-table td.num{font-family:monospace;color:${THEME.textDim}}
  table.svc-table tr:last-child td{border-bottom:0}
  .svc-id{font-family:monospace;color:${THEME.accent};font-weight:600;display:block}
  .svc-he{display:block;font-size:11px;color:${THEME.textDim};direction:rtl}
  .svc-en{display:block;font-size:11px;color:${THEME.textMuted}}
  .pill{display:inline-block;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:600;font-family:monospace;text-transform:uppercase;letter-spacing:0.3px}
  .widgets-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px}
  .widget{background:${THEME.panel};border:1px solid ${THEME.border};border-radius:8px;padding:12px 14px}
  .widget-wide{grid-column:span 2}
  .widget h3{font-size:12px;margin:0 0 8px 0;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.5px;font-weight:600}
  ul.w-list{list-style:none;margin:0;padding:0}
  ul.w-list li{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid ${THEME.grid}}
  ul.w-list li:last-child{border-bottom:0}
  ul.w-list .w-num{margin-inline-start:auto;font-family:monospace;color:${THEME.textDim}}
  .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .err-list .err-msg{font-family:monospace;font-size:10px;color:${THEME.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
  .err-list .err-cnt{margin-inline-start:auto;color:${THEME.warn};font-family:monospace}
  .sources-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px}
  .empty{color:${THEME.textMuted};font-style:italic;padding:8px 0;font-size:11px}
  footer.mdh-footer{background:${THEME.panel};border:1px solid ${THEME.border};border-radius:8px;padding:10px 16px;font-size:10px;color:${THEME.textMuted};text-align:center;font-family:monospace}
  footer.mdh-footer .rule{color:${THEME.accent};direction:rtl;display:inline-block;margin-inline-end:12px}
  @media (max-width: 640px){
    .widget-wide{grid-column:span 1}
    .charts-row{grid-template-columns:1fr}
    body{padding:8px}
  }
`;

// ═══════════════════════════════════════════════════════════════════
// MAIN RENDERER
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate the master dashboard HTML string.
 *
 * @param {Object} [signals] All signals are optional. Missing ones render empty.
 * @param {Object} [opts]
 * @param {boolean} [opts.fullDocument=true] If false, returns body fragment only.
 * @param {number}  [opts.refreshSec=30]    Auto-refresh meta tag seconds.
 * @returns {string} HTML string
 */
function generateMasterDashboard(signals, opts) {
  const o = opts || {};
  const full = o.fullDocument !== false;
  const refreshSec = _num(o.refreshSec, 30);
  const sig = signals || {};

  const summary = _computeSummary(sig);
  const overallColor = _statusColor(summary.level);
  const overallLbl = _statusLabel(summary.level);
  const now = Date.now();

  const header =
    `<header class="mdh-header">` +
      `<div>` +
        `<div class="title">${_bilingual('title')}</div>` +
        `<div class="subtitle">${_bilingual('subtitle')}</div>` +
      `</div>` +
      `<div>` +
        `<span class="overall-pill" style="background:${overallColor}22;color:${overallColor};border:1px solid ${overallColor}55">` +
          `${_escapeHtml(overallLbl.he)} · ${_escapeHtml(overallLbl.en)}` +
        `</span>` +
      `</div>` +
      `<div class="meta">` +
        `${_escapeHtml(L.lastUpdate.en)}: ${_escapeHtml(_fmtTime(now))}<br/>` +
        `${_escapeHtml(L.refresh.he)}` +
      `</div>` +
    `</header>`;

  const kpis = _renderKpiCards(summary);

  const charts =
    `<section class="charts-row" aria-label="trend charts">` +
      _renderLatencyChart(sig.prom) +
      _renderErrorChart(sig.prom) +
      _renderResourceChart(sig.resources) +
    `</section>`;

  const services = _renderServiceTable(sig.services);

  const widgets =
    `<section class="widgets-row" aria-label="summary widgets">` +
      _renderAlertsWidget(sig.alerts) +
      _renderTopErrorsWidget(sig.errors) +
      _renderDepsWidget(sig.deps) +
      _renderCanaryWidget(sig.canary) +
      _renderSourcesWidget(sig) +
    `</section>`;

  const footer =
    `<footer class="mdh-footer">` +
      `<span class="rule">${_escapeHtml(L.rule.he)}</span>` +
      `ONYX OPS · ${_escapeHtml(L.agent.en)} X-96 · v${VERSION} · Techno-Kol Uzi` +
    `</footer>`;

  const body = header + kpis + charts + services + widgets + footer;

  if (!full) return body;

  return (
    `<!doctype html>` +
    `<html lang="he" dir="rtl">` +
    `<head>` +
      `<meta charset="utf-8"/>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
      `<meta http-equiv="refresh" content="${refreshSec}"/>` +
      `<title>${_escapeHtml(L.title.he)} · ${_escapeHtml(L.title.en)} — ONYX X-96</title>` +
      `<style>${STYLE}</style>` +
    `</head>` +
    `<body>${body}</body>` +
    `</html>`
  );
}

// ═══════════════════════════════════════════════════════════════════
// JSON OUTPUT (for API consumers)
// ═══════════════════════════════════════════════════════════════════

/**
 * Structured JSON rendering of the dashboard — API consumers / downstream
 * tooling should prefer this over parsing HTML.
 */
function dashboardJSON(signals) {
  const sig = signals || {};
  const summary = _computeSummary(sig);
  const uptime = sig.uptime || {};
  const slo = sig.slo || {};
  const errorBudget = sig.errorBudget || {};

  return {
    version: VERSION,
    agent: 'X-96',
    generatedAt: Date.now(),
    overall: {
      level: summary.level,
      label: _statusLabel(summary.level),
      color: _statusColor(summary.level),
    },
    kpi: {
      uptime_pct: Number.isFinite(summary.uptimePct) ? summary.uptimePct : null,
      slo_burn: Number.isFinite(summary.sloBurn) ? summary.sloBurn : null,
      slo_target: Number.isFinite(summary.sloTarget) ? summary.sloTarget : null,
      incidents_open: summary.openIncidents,
      incidents_sev1: summary.sev1Count,
      incidents_sev2: summary.sev2Count,
      error_budget_remaining_pct: Number.isFinite(summary.budgetRemaining) ? summary.budgetRemaining : null,
      error_budget_consumed_pct: Number.isFinite(summary.budgetConsumed) ? summary.budgetConsumed : null,
    },
    services: _arr(sig.services).map((sv) => ({
      id: sv && sv.id,
      name: sv && sv.name,
      nameHe: sv && sv.nameHe,
      status: (sv && sv.status) || 'unknown',
      uptime_pct: sv && sv.uptime_pct,
      p95_ms: sv && sv.p95_ms,
      error_rate: sv && sv.error_rate,
      owner: sv && sv.owner,
    })),
    alerts_active: _arr(sig.alerts).length,
    incidents_open: summary.openIncidents,
    deps: sig.deps || null,
    uptime,
    slo,
    errorBudget,
    sources_present: {
      prom: !!sig.prom,
      slo: !!sig.slo,
      incidents: !!sig.incidents,
      errorBudget: !!sig.errorBudget,
      alerts: !!sig.alerts,
      errors: !!sig.errors,
      deps: !!sig.deps,
      resources: !!sig.resources,
      uptime: !!sig.uptime,
      logs: !!sig.logs,
      canary: !!sig.canary,
      services: !!sig.services,
    },
    rule: L.rule,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

/**
 * Express middleware mountable at `/ops/dashboard`. Accepts an optional
 * async signal provider. Responds with:
 *   - HTML by default
 *   - JSON when `?format=json` or Accept: application/json
 *   - Never throws: errors are caught and rendered as a safe empty view
 *
 * Usage:
 *   const { middleware } = require('./src/ops/master-dashboard');
 *   app.use('/ops/dashboard', middleware(async () => ({
 *     prom, slo, incidents, resources, services, ...
 *   })));
 */
function middleware(getSignals) {
  return async function masterDashboardHandler(req, res, next) {
    let signals = {};
    try {
      if (typeof getSignals === 'function') {
        const maybe = getSignals(req);
        signals = (maybe && typeof maybe.then === 'function') ? await maybe : maybe;
        if (!signals || typeof signals !== 'object') signals = {};
      }
    } catch (_e) {
      signals = {};
    }

    const wantsJson =
      (req && req.query && (req.query.format === 'json' || req.query.json === '1')) ||
      (req && req.headers && typeof req.headers.accept === 'string' && req.headers.accept.indexOf('application/json') !== -1 && req.headers.accept.indexOf('text/html') === -1);

    try {
      if (wantsJson) {
        const payload = dashboardJSON(signals);
        if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (res.setHeader) res.setHeader('Cache-Control', 'no-store');
        if (res.json) return res.json(payload);
        if (res.end) return res.end(JSON.stringify(payload));
      }
      const html = generateMasterDashboard(signals);
      if (res.setHeader) res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (res.setHeader) res.setHeader('Cache-Control', 'no-store');
      if (res.send) return res.send(html);
      if (res.end) return res.end(html);
    } catch (err) {
      if (typeof next === 'function') return next(err);
      if (res.status) res.status(500);
      if (res.end) return res.end('dashboard error');
    }
  };
}

/**
 * Convenience: mount the middleware onto an Express app at /ops/dashboard.
 * Zero-op if `app` is falsy.
 */
function attach(app, opts) {
  if (!app || typeof app.use !== 'function') return null;
  const o = opts || {};
  const path = o.path || '/ops/dashboard';
  const getSignals = o.getSignals || (() => ({}));
  app.use(path, middleware(getSignals));
  return path;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // Public API
  generateMasterDashboard,
  dashboardJSON,
  middleware,
  attach,

  // Internal (exposed for composition & tests)
  _renderKpiCards,
  _renderLatencyChart,
  _renderErrorChart,
  _renderResourceChart,
  _renderServiceTable,
  _renderAlertsWidget,
  _renderTopErrorsWidget,
  _renderDepsWidget,
  _renderCanaryWidget,
  _renderSourcesWidget,
  _escapeHtml,
  _svgLineChart,
  _computeSummary,
  _statusColor,
  _statusLabel,

  // Constants
  THEME,
  VERSION,
  L,
};
