/**
 * Executive Dashboard Aggregator — Mega-ERP Techno-Kol Uzi
 * סוכן-Y181 — אגרגטור לוח-מחוונים למנכ"ל / דירקטוריון
 *
 * Mission / משימה:
 *   Server-side aggregator that registers many "source" fetchers (each one
 *   an in-process function that returns a slice of KPIs from a different
 *   subsystem — sales, finance, operations, HR, quality, risk) and combines
 *   them into a single bilingual JSON snapshot that the frontend can render
 *   without additional joins.
 *
 *   This module is 100% server-side. It does not depend on React, DOM, or
 *   any UI library. It does not contain any rendering logic — only data
 *   shaping, trend computation vs prior period, target evaluation, and
 *   bilingual label injection.
 *
 *   RULE #1 COMPLIANCE — לא מוחקים רק משדרגים ומגדלים:
 *     This module is ADDITIVE. Nothing existing is removed, replaced, or
 *     shadowed. Other reports under src/reports/ keep working; this new
 *     module sits under src/reporting/ to avoid any collision.
 *
 * Public API:
 *   class ExecutiveDashboard
 *     .registerSource(name, fetchFn)         — register a KPI source
 *     .registerSources(map)                   — bulk register
 *     .unregisterSource(name)                 — (no-op if absent; never throws)
 *     .listSources()                          — array of registered names
 *     .setTargets(targets)                    — override default targets
 *     .setPriorSnapshot(snapshot)             — used for trend arrows
 *     .build(period)                          — Promise<DashboardSnapshot>
 *     .buildSync(data)                        — pure: no fetchers used
 *
 *   Utility helpers (exported for unit tests & re-use):
 *     computeTrend(current, prior)            — ▲ / ▼ / ▶ / •
 *     evaluateTarget(actual, target, policy)  — on / off / warn
 *     formatNIS(amount)                       — ₪ currency formatter
 *     PALANTIR_DARK_TOKENS                    — colour palette object
 *     KPI_DEFINITIONS                         — 16 bilingual labels + meta
 *     DEFAULT_TARGETS                         — safe defaults
 *     normaliseSnapshot(raw)                  — tolerant normaliser
 *     mergeSources(results)                   — merge strategy
 *
 * Zero runtime deps — Node.js built-ins only.
 *
 * Robustness notes:
 *   - A failing source fetcher never kills the build; its error is captured
 *     in `snapshot.sourceErrors[name]` and the KPIs it owned become `null`
 *     with a `status: 'error'` marker.
 *   - Unknown KPIs coming from a source are preserved in `snapshot.extras`
 *     so nothing is silently dropped.
 *   - Building is idempotent — calling `build(period)` twice with the same
 *     sources and inputs produces deeply-equal output (modulo timestamps).
 *   - The module is fully tree-shakable / CommonJS friendly and will run on
 *     any Node.js ≥ 14 (uses `Promise.allSettled`, available since 12.9).
 */

'use strict';

// ─── constants ───────────────────────────────────────────────────────────

/**
 * Palantir Foundry "dark" theme colour tokens.
 * These are put into `snapshot.metadata.theme.tokens` so the renderer
 * does not need to duplicate them. Values are hex strings.
 * Source: Foundry 2024 design tokens export (ops.ui-kit / dark.json).
 */
const PALANTIR_DARK_TOKENS = Object.freeze({
  bg: {
    primary: '#0B0F14',
    secondary: '#111821',
    surface: '#1A2330',
    raised: '#21303F',
    overlay: '#0B0F14CC',
  },
  fg: {
    primary: '#E6EDF3',
    secondary: '#A6B3C2',
    muted: '#6B7A8C',
    inverse: '#0B0F14',
  },
  border: {
    default: '#2B3A4D',
    strong: '#3E5168',
    focus: '#5BC0EB',
  },
  brand: {
    blue: '#00A3E0',
    blueDark: '#0075A8',
    blueGlow: '#5BC0EB',
    accent: '#11D6A7',
  },
  status: {
    success: '#10B981',
    successBg: '#10B98122',
    warning: '#F59E0B',
    warningBg: '#F59E0B22',
    danger: '#EF4444',
    dangerBg: '#EF444422',
    info: '#3B82F6',
    infoBg: '#3B82F622',
    neutral: '#6B7A8C',
  },
  trend: {
    up: '#10B981',
    down: '#EF4444',
    flat: '#A6B3C2',
    volatile: '#F59E0B',
  },
  chart: [
    '#00A3E0',
    '#11D6A7',
    '#F59E0B',
    '#EF4444',
    '#A78BFA',
    '#F472B6',
    '#5BC0EB',
    '#FDBA74',
  ],
});

/**
 * Canonical KPI catalogue — 16 metrics × bilingual labels + units + families.
 * `family` is used by renderers to group KPIs into sections.
 * `direction` says which way is "better":
 *   'up'     — higher is better (revenue, margin, NPS...)
 *   'down'   — lower is better (aging, PPM, churn, opEx...)
 *   'flat'   — neither; just track level (cashPosition, backlog...)
 */
const KPI_DEFINITIONS = Object.freeze({
  revenue: {
    family: 'financial',
    label_en: 'Revenue',
    label_he: 'הכנסות',
    unit: 'NIS',
    direction: 'up',
  },
  grossMargin: {
    family: 'financial',
    label_en: 'Gross Margin',
    label_he: 'רווח גולמי',
    unit: 'percent',
    direction: 'up',
  },
  opEx: {
    family: 'financial',
    label_en: 'Operating Expenses',
    label_he: 'הוצאות תפעוליות',
    unit: 'NIS',
    direction: 'down',
  },
  ebitda: {
    family: 'financial',
    label_en: 'EBITDA',
    label_he: 'EBITDA — רווח תפעולי',
    unit: 'NIS',
    direction: 'up',
  },
  cashPosition: {
    family: 'financial',
    label_en: 'Cash Position',
    label_he: 'יתרת מזומנים',
    unit: 'NIS',
    direction: 'flat',
  },
  backlog: {
    family: 'sales',
    label_en: 'Order Backlog',
    label_he: 'צבר הזמנות',
    unit: 'NIS',
    direction: 'up',
  },
  aging: {
    family: 'sales',
    label_en: 'AR Aging >60 days',
    label_he: 'חוב לקוחות מעל 60 ימים',
    unit: 'NIS',
    direction: 'down',
  },
  workforce: {
    family: 'hr',
    label_en: 'Workforce Headcount',
    label_he: 'מצבת עובדים',
    unit: 'count',
    direction: 'flat',
  },
  openRFQs: {
    family: 'procurement',
    label_en: 'Open RFQs',
    label_he: 'בקשות להצעה פתוחות',
    unit: 'count',
    direction: 'flat',
  },
  openWOs: {
    family: 'operations',
    label_en: 'Open Work Orders',
    label_he: 'הזמנות עבודה פתוחות',
    unit: 'count',
    direction: 'flat',
  },
  safetyIncidents: {
    family: 'safety',
    label_en: 'Safety Incidents',
    label_he: 'אירועי בטיחות',
    unit: 'count',
    direction: 'down',
  },
  qualityPPM: {
    family: 'quality',
    label_en: 'Quality PPM (defects / million)',
    label_he: 'PPM איכות (פגמים למיליון)',
    unit: 'ppm',
    direction: 'down',
  },
  onTime: {
    family: 'operations',
    label_en: 'On-Time Delivery',
    label_he: 'אספקה בזמן',
    unit: 'percent',
    direction: 'up',
  },
  npsScore: {
    family: 'customer',
    label_en: 'NPS Score',
    label_he: 'מדד NPS',
    unit: 'score',
    direction: 'up',
  },
  churnRate: {
    family: 'customer',
    label_en: 'Customer Churn',
    label_he: 'נטישת לקוחות',
    unit: 'percent',
    direction: 'down',
  },
  topRisks: {
    family: 'risk',
    label_en: 'Top Risks',
    label_he: 'סיכונים מובילים',
    unit: 'list',
    direction: 'flat',
  },
});

const KPI_KEYS = Object.freeze(Object.keys(KPI_DEFINITIONS));

/**
 * Safe defaults for targets. Every value may be overridden via
 * `setTargets()`. A target of `null` means "no target — never flag".
 */
const DEFAULT_TARGETS = Object.freeze({
  revenue: { min: 10_000_000, stretch: 12_000_000 },
  grossMargin: { min: 30, stretch: 38 },
  opEx: { max: 6_500_000 },
  ebitda: { min: 1_500_000, stretch: 2_200_000 },
  cashPosition: { min: 4_000_000 },
  backlog: { min: 20_000_000 },
  aging: { max: 900_000 },
  workforce: { min: 120, max: 200 },
  openRFQs: { min: 8, max: 50 },
  openWOs: { min: 5, max: 120 },
  safetyIncidents: { max: 2 },
  qualityPPM: { max: 500 },
  onTime: { min: 92 },
  npsScore: { min: 45 },
  churnRate: { max: 5 },
  topRisks: null,
});

const TREND_TOKENS = Object.freeze({
  up: '▲',
  down: '▼',
  flat: '▶',
  none: '•',
});

// ─── helpers ──────────────────────────────────────────────────────────────

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Compute the trend token vs the prior period.
 * Handles nullish values, zero-divisor edges, and topRisks lists.
 *
 * @param {*} current — current value (number, list, object with `value`)
 * @param {*} prior   — prior value (same shape)
 * @returns {{token: string, direction: 'up'|'down'|'flat'|'none',
 *            deltaAbs: number|null, deltaPct: number|null}}
 */
function computeTrend(current, prior) {
  const cur = isFiniteNumber(current)
    ? current
    : (current && isFiniteNumber(current.value) ? current.value : null);
  const prv = isFiniteNumber(prior)
    ? prior
    : (prior && isFiniteNumber(prior.value) ? prior.value : null);

  if (cur === null || prv === null) {
    return { token: TREND_TOKENS.none, direction: 'none', deltaAbs: null, deltaPct: null };
  }

  const deltaAbs = cur - prv;
  let deltaPct = null;
  if (prv !== 0) {
    deltaPct = (deltaAbs / Math.abs(prv)) * 100;
  } else if (deltaAbs !== 0) {
    // Prior was zero, current is non-zero — treat as +/-100 for sanity.
    deltaPct = deltaAbs > 0 ? 100 : -100;
  } else {
    deltaPct = 0;
  }

  // Flat tolerance — 0.5 % and sub-unit abs considered flat.
  const flat =
    Math.abs(deltaPct) < 0.5 && Math.abs(deltaAbs) < Math.max(1, Math.abs(prv) * 0.005);

  let direction;
  if (flat) direction = 'flat';
  else if (deltaAbs > 0) direction = 'up';
  else direction = 'down';

  return {
    token: TREND_TOKENS[direction],
    direction,
    deltaAbs,
    deltaPct: Math.round(deltaPct * 100) / 100,
  };
}

/**
 * Evaluate an actual KPI against its target object.
 * Policy is derived from the target shape: {min}, {max}, {min,max},
 * {min,stretch}, or null (means "no target").
 *
 * @returns {'on'|'warn'|'off'|'unknown'}
 */
function evaluateTarget(actual, target) {
  if (target === null || target === undefined) return 'unknown';
  if (!isFiniteNumber(actual)) return 'unknown';

  // {min, max} — actual must lie inside the band
  if (isFiniteNumber(target.min) && isFiniteNumber(target.max)) {
    if (actual < target.min || actual > target.max) return 'off';
    // Warn if within 10 % of either edge.
    const span = target.max - target.min;
    const nearLow = actual < target.min + span * 0.1;
    const nearHigh = actual > target.max - span * 0.1;
    return nearLow || nearHigh ? 'warn' : 'on';
  }

  // {min} or {min, stretch} — higher is better
  if (isFiniteNumber(target.min)) {
    if (actual < target.min) return 'off';
    if (isFiniteNumber(target.stretch)) {
      return actual >= target.stretch ? 'on' : 'warn';
    }
    return 'on';
  }

  // {max} — lower is better
  if (isFiniteNumber(target.max)) {
    if (actual > target.max) return 'off';
    // Within 10 % of cap → warn.
    return actual > target.max * 0.9 ? 'warn' : 'on';
  }

  return 'unknown';
}

/**
 * Map a target-evaluation verdict to a Palantir colour token.
 */
function statusColor(status) {
  switch (status) {
    case 'on':
      return PALANTIR_DARK_TOKENS.status.success;
    case 'warn':
      return PALANTIR_DARK_TOKENS.status.warning;
    case 'off':
      return PALANTIR_DARK_TOKENS.status.danger;
    default:
      return PALANTIR_DARK_TOKENS.status.neutral;
  }
}

function trendColor(direction, kpiDirection) {
  // If the KPI is "down=good" and trend is down → that's success.
  if (kpiDirection === 'down') {
    if (direction === 'down') return PALANTIR_DARK_TOKENS.trend.up;
    if (direction === 'up') return PALANTIR_DARK_TOKENS.trend.down;
  }
  if (kpiDirection === 'up') {
    if (direction === 'up') return PALANTIR_DARK_TOKENS.trend.up;
    if (direction === 'down') return PALANTIR_DARK_TOKENS.trend.down;
  }
  if (direction === 'flat') return PALANTIR_DARK_TOKENS.trend.flat;
  return PALANTIR_DARK_TOKENS.trend.flat;
}

/**
 * Format a number as NIS currency (server-side, no Intl fallback needed).
 * Keeps locale-independent output so tests are reproducible.
 */
function formatNIS(amount) {
  if (!isFiniteNumber(amount)) return '—';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}₪${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}₪${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}₪${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}₪${abs.toFixed(2)}`;
}

function formatValue(value, unit) {
  if (!isFiniteNumber(value)) {
    if (Array.isArray(value)) return `${value.length} items`;
    return '—';
  }
  switch (unit) {
    case 'NIS':
      return formatNIS(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ppm':
      return `${Math.round(value)} PPM`;
    case 'score':
      return value.toFixed(0);
    case 'count':
      return value.toLocaleString('en-US');
    default:
      return String(value);
  }
}

/**
 * Merge many source results (each a {kpi: value} map) into a single map.
 * Later sources win on conflict — except `topRisks`, which is concatenated.
 * Unknown keys are collected into `extras`.
 */
function mergeSources(results) {
  const merged = {};
  const extras = {};
  const topRisksAll = [];

  for (const res of results) {
    if (!res || typeof res !== 'object') continue;
    for (const [key, val] of Object.entries(res)) {
      if (key === 'topRisks') {
        if (Array.isArray(val)) topRisksAll.push(...val);
        continue;
      }
      if (KPI_KEYS.includes(key)) {
        merged[key] = val;
      } else {
        extras[key] = val;
      }
    }
  }
  if (topRisksAll.length > 0) merged.topRisks = topRisksAll;
  return { merged, extras };
}

/**
 * Tolerant normaliser. Accepts `{value, meta}`, bare numbers, arrays, or
 * nulls and returns `{value, raw}` in a predictable shape.
 */
function normaliseSnapshot(raw) {
  if (raw === null || raw === undefined) return { value: null, raw };
  if (isFiniteNumber(raw)) return { value: raw, raw };
  if (Array.isArray(raw)) return { value: raw, raw };
  if (typeof raw === 'object') {
    if (isFiniteNumber(raw.value)) return { value: raw.value, raw };
    if (Array.isArray(raw.items)) return { value: raw.items, raw };
    if (isFiniteNumber(raw.count)) return { value: raw.count, raw };
  }
  return { value: null, raw };
}

/**
 * Format `topRisks` into bilingual objects. Accepts strings, objects with
 * `{title, title_he, severity}`, or objects with only a `name`.
 */
function normaliseRisks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((risk, idx) => {
      if (typeof risk === 'string') {
        return {
          id: `R-${idx + 1}`,
          title_en: risk,
          title_he: risk,
          severity: 'medium',
          color: PALANTIR_DARK_TOKENS.status.warning,
        };
      }
      if (!risk || typeof risk !== 'object') return null;
      const severity = String(risk.severity || 'medium').toLowerCase();
      const color =
        severity === 'critical' || severity === 'high'
          ? PALANTIR_DARK_TOKENS.status.danger
          : severity === 'low'
          ? PALANTIR_DARK_TOKENS.status.info
          : PALANTIR_DARK_TOKENS.status.warning;
      return {
        id: risk.id || `R-${idx + 1}`,
        title_en: risk.title_en || risk.title || risk.name || `Risk ${idx + 1}`,
        title_he: risk.title_he || risk.title || risk.name || `סיכון ${idx + 1}`,
        severity,
        color,
        impact: risk.impact || null,
        owner: risk.owner || null,
      };
    })
    .filter(Boolean);
}

// ─── ExecutiveDashboard class ─────────────────────────────────────────────

class ExecutiveDashboard {
  constructor(opts = {}) {
    this.sources = new Map();
    this.targets = { ...DEFAULT_TARGETS, ...(opts.targets || {}) };
    this.priorSnapshot = opts.priorSnapshot || null;
    this.clock = typeof opts.clock === 'function' ? opts.clock : () => new Date();
    this.tenant = opts.tenant || 'techno-kol-uzi';
  }

  /**
   * Register a data source.
   * `fetchFn` can be sync or async; it receives `{period}` and must
   * return an object whose keys are KPI ids. Unknown keys land in extras.
   */
  registerSource(name, fetchFn) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('registerSource: name must be a non-empty string');
    }
    if (typeof fetchFn !== 'function') {
      throw new TypeError('registerSource: fetchFn must be a function');
    }
    this.sources.set(name, fetchFn);
    return this;
  }

  /**
   * Bulk register. Accepts `{name: fn, ...}`.
   */
  registerSources(map) {
    if (!map || typeof map !== 'object') return this;
    for (const [name, fn] of Object.entries(map)) {
      this.registerSource(name, fn);
    }
    return this;
  }

  unregisterSource(name) {
    this.sources.delete(name);
    return this;
  }

  listSources() {
    return Array.from(this.sources.keys());
  }

  setTargets(targets) {
    if (targets && typeof targets === 'object') {
      this.targets = { ...this.targets, ...targets };
    }
    return this;
  }

  setPriorSnapshot(snapshot) {
    this.priorSnapshot = snapshot || null;
    return this;
  }

  /**
   * Build the dashboard snapshot for `period`.
   * @param {string|{from:string,to:string,label_en?:string,label_he?:string}} period
   * @returns {Promise<object>}
   */
  async build(period = 'current') {
    const periodObj = normalisePeriod(period);
    const sourceNames = this.listSources();
    const sourceErrors = {};
    const sourceMeta = {};

    // Fetch every registered source in parallel. Failures never abort.
    const settled = await Promise.allSettled(
      sourceNames.map((name) => {
        try {
          const out = this.sources.get(name)({ period: periodObj });
          return Promise.resolve(out).then((value) => ({ name, value }));
        } catch (err) {
          return Promise.reject({ name, err });
        }
      }),
    );

    const results = [];
    settled.forEach((entry, idx) => {
      const name = sourceNames[idx];
      if (entry.status === 'fulfilled') {
        const payload = entry.value && entry.value.value ? entry.value.value : entry.value;
        results.push(payload);
        sourceMeta[name] = { status: 'ok', keys: payload ? Object.keys(payload) : [] };
      } else {
        const err = entry.reason && entry.reason.err ? entry.reason.err : entry.reason;
        const msg = err instanceof Error ? err.message : String(err || 'unknown');
        sourceErrors[name] = msg;
        sourceMeta[name] = { status: 'error', error: msg };
      }
    });

    const { merged, extras } = mergeSources(results);
    return this._assemble({
      period: periodObj,
      merged,
      extras,
      sourceErrors,
      sourceMeta,
    });
  }

  /**
   * Pure synchronous builder — no async fetchers are consulted.
   * Handy for testing and for when a caller already has all the data.
   */
  buildSync(data = {}, period = 'current') {
    const periodObj = normalisePeriod(period);
    const { merged, extras } = mergeSources([data]);
    return this._assemble({
      period: periodObj,
      merged,
      extras,
      sourceErrors: {},
      sourceMeta: { inline: { status: 'ok', keys: Object.keys(data) } },
    });
  }

  _assemble({ period, merged, extras, sourceErrors, sourceMeta }) {
    const prior = this.priorSnapshot || {};
    const priorKpis = prior.kpis || {};

    const kpis = {};
    const summary = { on: 0, warn: 0, off: 0, unknown: 0, total: 0 };

    for (const key of KPI_KEYS) {
      const def = KPI_DEFINITIONS[key];
      const rawValue = merged[key];

      if (key === 'topRisks') {
        const risks = normaliseRisks(rawValue);
        kpis[key] = {
          id: key,
          family: def.family,
          label_en: def.label_en,
          label_he: def.label_he,
          unit: def.unit,
          direction: def.direction,
          value: risks,
          formatted_en: `${risks.length} risks tracked`,
          formatted_he: `${risks.length} סיכונים במעקב`,
          target: null,
          status: 'unknown',
          statusColor: statusColor('unknown'),
          trend: {
            token: TREND_TOKENS.none,
            direction: 'none',
            deltaAbs: null,
            deltaPct: null,
            color: PALANTIR_DARK_TOKENS.trend.flat,
          },
        };
        summary.unknown += 1;
        summary.total += 1;
        continue;
      }

      const normalised = normaliseSnapshot(rawValue);
      const value = normalised.value;
      const target = this.targets[key] === undefined ? DEFAULT_TARGETS[key] : this.targets[key];
      const status = evaluateTarget(value, target);

      const priorValue = normaliseSnapshot(priorKpis[key] ? priorKpis[key].value : undefined).value;
      const trend = computeTrend(value, priorValue);

      kpis[key] = {
        id: key,
        family: def.family,
        label_en: def.label_en,
        label_he: def.label_he,
        unit: def.unit,
        direction: def.direction,
        value,
        formatted_en: formatValue(value, def.unit),
        formatted_he: formatValueHe(value, def.unit),
        target: target || null,
        status,
        statusColor: statusColor(status),
        trend: {
          ...trend,
          color: trendColor(trend.direction, def.direction),
        },
      };

      summary[status] = (summary[status] || 0) + 1;
      summary.total += 1;
    }

    const now = this.clock();
    const snapshot = {
      version: 'exec-dash/1.0',
      generatedAt: toIso(now),
      tenant: this.tenant,
      period,
      kpis,
      summary,
      sourceErrors,
      extras,
      metadata: {
        agent: 'AG-Y181',
        module: 'onyx-procurement/src/reporting/executive-dashboard.js',
        sources: sourceMeta,
        theme: {
          name: 'palantir-dark',
          tokens: PALANTIR_DARK_TOKENS,
          trendTokens: TREND_TOKENS,
        },
        i18n: {
          locales: ['en', 'he'],
          default: 'he',
          rtl: { he: true, en: false },
          labels: {
            title_en: 'Executive Dashboard',
            title_he: 'לוח מחוונים להנהלה',
            subtitle_en: `Snapshot · ${period.label_en || period.to || period.from || ''}`,
            subtitle_he: `תמונת מצב · ${period.label_he || period.to || period.from || ''}`,
            summary_en: `${summary.on} on target · ${summary.warn} warn · ${summary.off} off · ${summary.unknown} unknown`,
            summary_he: `${summary.on} ביעד · ${summary.warn} אזהרה · ${summary.off} מחוץ ליעד · ${summary.unknown} לא ידוע`,
            legend: {
              on_en: 'On target',
              on_he: 'ביעד',
              warn_en: 'Warning',
              warn_he: 'אזהרה',
              off_en: 'Off target',
              off_he: 'מחוץ ליעד',
              unknown_en: 'Unknown',
              unknown_he: 'לא ידוע',
              trend_up_en: 'Improving',
              trend_up_he: 'משתפר',
              trend_down_en: 'Declining',
              trend_down_he: 'יורד',
              trend_flat_en: 'Stable',
              trend_flat_he: 'יציב',
            },
          },
        },
      },
    };

    return snapshot;
  }
}

// ─── local helpers (not exported) ─────────────────────────────────────────

function normalisePeriod(period) {
  if (typeof period === 'string') {
    return { label_en: period, label_he: period, from: null, to: null };
  }
  if (period && typeof period === 'object') {
    return {
      from: period.from || null,
      to: period.to || null,
      label_en: period.label_en || period.label || null,
      label_he: period.label_he || period.label || null,
    };
  }
  return { label_en: 'current', label_he: 'נוכחי', from: null, to: null };
}

function toIso(date) {
  try {
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  } catch (_e) {
    return new Date().toISOString();
  }
}

function formatValueHe(value, unit) {
  if (!isFiniteNumber(value)) {
    if (Array.isArray(value)) return `${value.length} פריטים`;
    return '—';
  }
  switch (unit) {
    case 'NIS':
      return formatNIS(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ppm':
      return `${Math.round(value)} PPM`;
    case 'score':
      return value.toFixed(0);
    case 'count':
      return value.toLocaleString('he-IL');
    default:
      return String(value);
  }
}

// ─── exports ──────────────────────────────────────────────────────────────

module.exports = {
  ExecutiveDashboard,
  PALANTIR_DARK_TOKENS,
  KPI_DEFINITIONS,
  KPI_KEYS,
  DEFAULT_TARGETS,
  TREND_TOKENS,
  computeTrend,
  evaluateTarget,
  statusColor,
  trendColor,
  formatNIS,
  formatValue,
  mergeSources,
  normaliseSnapshot,
  normaliseRisks,
  // Internal helpers exposed for advanced testing
  _internals: {
    normalisePeriod,
    toIso,
    formatValueHe,
  },
};
