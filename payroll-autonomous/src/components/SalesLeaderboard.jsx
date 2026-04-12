/**
 * SalesLeaderboard — Sales Leaderboard UI Component
 * Agent Y-022 / Techno-Kol Uzi mega-ERP 2026
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים
 *
 * Zero external deps beyond React. All badges are pure inline SVG.
 *
 * Hebrew RTL, Palantir dark theme:
 *   bg:     #0b0d10
 *   panel:  #13171c
 *   accent: #4a9eff
 *
 * Props:
 *   salespeople: Array<Salesperson>          — current period data
 *   previous:    Array<Salesperson>          — prior period data (for movement)
 *   currentUserId: string|number             — highlight this row
 *   period:      'month' | 'quarter' | 'year'
 *   onPeriodChange: (period) => void
 *   metric:      one of METRICS (initial sort metric)
 *   onMetricChange: (metric) => void
 *   title?:      string (override HE title)
 *   englishTitle?: string
 *
 * The component delegates ALL ranking/movement/badge logic to the engine
 * in onyx-procurement/src/sales/leaderboard.js. When imported from a
 * CommonJS context (tests), require() works; when imported via bundler
 * in the browser the same file is pulled in as an ES module equivalent.
 * We inline a defensive fallback so the component renders correctly even
 * if the engine is not wired yet.
 */

import React, { useMemo, useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/* Engine import with defensive fallback                               */
/* ------------------------------------------------------------------ */
// The engine lives in the procurement backend and is consumed here via
// bundler alias. The try/catch keeps this file importable in isolation
// (e.g. in Storybook or a unit test that mocks the engine).
let engine;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  engine = require('../../../onyx-procurement/src/sales/leaderboard.js');
} catch (err) {
  engine = null;
}

/* Local mirror of metric constants to stay UI-renderable even if the engine
 * isn't resolvable at bundle time. The engine's constants always win when
 * present. */
const LOCAL_METRICS = [
  'revenue',
  'margin',
  'deals-closed',
  'conversion-rate',
  'avg-deal-size',
  'new-customers',
  'attainment',
];

const LOCAL_METRIC_LABELS_HE = {
  'revenue':         'הכנסות',
  'margin':          'רווח גולמי',
  'deals-closed':    'עסקאות שנסגרו',
  'conversion-rate': 'שיעור המרה',
  'avg-deal-size':   'גודל עסקה ממוצע',
  'new-customers':   'לקוחות חדשים',
  'attainment':      'עמידה ביעד',
};

const LOCAL_METRIC_LABELS_EN = {
  'revenue':         'Revenue',
  'margin':          'Margin',
  'deals-closed':    'Deals Closed',
  'conversion-rate': 'Conversion Rate',
  'avg-deal-size':   'Avg Deal Size',
  'new-customers':   'New Customers',
  'attainment':      'Quota Attainment',
};

const LOCAL_PERIODS = ['month', 'quarter', 'year'];
const LOCAL_PERIOD_LABELS_HE = {
  month:   'חודש',
  quarter: 'רבעון',
  year:    'שנה',
};
const LOCAL_PERIOD_LABELS_EN = {
  month:   'Month',
  quarter: 'Quarter',
  year:    'Year',
};

const METRICS         = engine?.METRICS          || LOCAL_METRICS;
const METRIC_LABELS_HE = engine?.METRIC_LABELS_HE || LOCAL_METRIC_LABELS_HE;
const METRIC_LABELS_EN = engine?.METRIC_LABELS_EN || LOCAL_METRIC_LABELS_EN;
const PERIODS          = engine?.PERIODS          || LOCAL_PERIODS;
const PERIOD_LABELS_HE = engine?.PERIOD_LABELS_HE || LOCAL_PERIOD_LABELS_HE;
const PERIOD_LABELS_EN = engine?.PERIOD_LABELS_EN || LOCAL_PERIOD_LABELS_EN;

/* ------------------------------------------------------------------ */
/* Defensive local implementations (mirror of engine, used if engine==null) */
/* ------------------------------------------------------------------ */

const _toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const _safeDiv = (a, b) => {
  const d = _toNum(b);
  if (d === 0) return 0;
  return _toNum(a) / d;
};

function _localMetricValue(sp, m) {
  if (!sp) return 0;
  switch (m) {
    case 'revenue':         return _toNum(sp.revenue);
    case 'margin':          return _toNum(sp.revenue) - _toNum(sp.cogs);
    case 'deals-closed':    return _toNum(sp.dealsClosed);
    case 'conversion-rate': return _safeDiv(sp.dealsClosed, _toNum(sp.dealsClosed) + _toNum(sp.dealsLost));
    case 'avg-deal-size':   return _safeDiv(sp.revenue, sp.dealsClosed);
    case 'new-customers':   return _toNum(sp.newCustomers);
    case 'attainment':      return _safeDiv(sp.revenue, sp.quota);
    default:                return _toNum(sp.revenue);
  }
}

function _localRank(list, metric, period) {
  if (!Array.isArray(list)) return [];
  const m = METRICS.includes(metric) ? metric : 'revenue';
  const p = PERIODS.includes(period) ? period : 'month';
  const enriched = list
    .filter((sp) => sp && sp.id != null)
    .map((sp) => ({ ...sp, metricValue: _localMetricValue(sp, m), metric: m, period: p }));
  enriched.sort((a, b) => {
    if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
    const bRev = _toNum(b.revenue), aRev = _toNum(a.revenue);
    if (bRev !== aRev) return bRev - aRev;
    const bDeals = _toNum(b.dealsClosed), aDeals = _toNum(a.dealsClosed);
    if (bDeals !== aDeals) return bDeals - aDeals;
    const nameCmp = String(a.name || '').localeCompare(String(b.name || ''), 'he-IL');
    if (nameCmp !== 0) return nameCmp;
    return String(a.id).localeCompare(String(b.id));
  });
  let prevVal = null, prevRk = 0;
  enriched.forEach((row, idx) => {
    const pos = idx + 1;
    if (prevVal !== null && row.metricValue === prevVal) row.rank = prevRk;
    else { row.rank = pos; prevRk = pos; prevVal = row.metricValue; }
  });
  return enriched;
}

function _localMovement(current, previous) {
  const result = Object.create(null);
  if (!Array.isArray(current)) return result;
  const prevMap = Object.create(null);
  if (Array.isArray(previous)) {
    for (const row of previous) {
      if (row && row.id != null && Number.isFinite(row.rank)) prevMap[row.id] = row.rank;
    }
  }
  for (const row of current) {
    if (!row || row.id == null || !Number.isFinite(row.rank)) continue;
    const prev = prevMap[row.id];
    if (prev == null) {
      result[row.id] = { direction: 'new', delta: null, previousRank: null, currentRank: row.rank };
      continue;
    }
    const delta = prev - row.rank;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    result[row.id] = { direction, delta, previousRank: prev, currentRank: row.rank };
  }
  return result;
}

function _localBadges(sp) {
  if (!sp) return [];
  const out = [];
  const rev = _toNum(sp.revenue), deals = _toNum(sp.dealsClosed), ws = _toNum(sp.winStreak);
  if (deals >= 1 || sp.firstSaleAt) out.push({ id: 'first-sale', color: '#f0c674', symbol: 'star', name_he: 'מכירה ראשונה' });
  if (deals >= 10)       out.push({ id: 'ten-deals', color: '#4a9eff', symbol: 'trophy', name_he: '10 עסקאות' });
  if (rev >= 100_000)    out.push({ id: 'hundred-k', color: '#3fb950', symbol: 'coin', name_he: '₪100K' });
  if (rev >= 250_000)    out.push({ id: 'quarter-million', color: '#a371f7', symbol: 'gem', name_he: '₪250K' });
  if (rev >= 1_000_000)  out.push({ id: 'million', color: '#e86bb5', symbol: 'crown', name_he: '₪1M' });
  if (_toNum(sp.quota) > 0 && rev / _toNum(sp.quota) >= 1) out.push({ id: 'beat-quota', color: '#39c5cf', symbol: 'target', name_he: 'יעד הושלם' });
  if (ws >= 5)           out.push({ id: 'win-streak', color: '#ff8b5b', symbol: 'flame', name_he: 'רצף ניצחונות' });
  if (ws >= 10)          out.push({ id: 'hot-streak', color: '#f85149', symbol: 'bolt', name_he: 'רצף לוהט' });
  return out;
}

const rankFn       = engine?.rank           || _localRank;
const movementFn   = engine?.movement       || _localMovement;
const badgesFn     = engine?.generateBadges || _localBadges;
const formatMetric = engine?.formatMetric   || function (v, m) {
  const n = _toNum(v);
  if (m === 'revenue' || m === 'margin' || m === 'avg-deal-size') {
    return '\u20AA ' + n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
  }
  if (m === 'conversion-rate') return (n * 100).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + '%';
  if (m === 'attainment')      return (n * 100).toLocaleString('he-IL', { maximumFractionDigits: 0 }) + '%';
  return n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
};

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export const LEADERBOARD_THEME = {
  bg:      '#0b0d10',
  panel:   '#13171c',
  panel2:  '#1a2028',
  border:  '#2a3340',
  text:    '#e6edf3',
  textDim: '#8b96a5',
  accent:  '#4a9eff',
  success: '#3fb950',
  warning: '#d29922',
  danger:  '#f85149',
  grid:    '#232a33',
  highlightRow: 'rgba(74, 158, 255, 0.14)',
};

const FONT_STACK =
  '"Heebo","Assistant","Rubik","Segoe UI","Helvetica Neue","Arial",sans-serif';

/* ------------------------------------------------------------------ */
/* SVG badge glyphs                                                    */
/* ------------------------------------------------------------------ */

function BadgeGlyph({ symbol, color, size = 16, title = '' }) {
  const s = size;
  const half = s / 2;
  const common = {
    width:  s,
    height: s,
    viewBox: '0 0 24 24',
    role:   'img',
    'aria-label': title,
    focusable: 'false',
  };
  switch (symbol) {
    case 'star':
      return (
        <svg {...common}>
          <title>{title}</title>
          <polygon
            points="12,2 14.9,8.6 22,9.3 16.6,14.1 18.2,21 12,17.3 5.8,21 7.4,14.1 2,9.3 9.1,8.6"
            fill={color}
            stroke={color}
            strokeWidth="0.5"
          />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path
            d="M7 4h10v3a5 5 0 0 1-10 0V4zm-3 1h3v2a3 3 0 0 1-3-3V5zm13 0h3a0 0 0 0 1 0 0 3 3 0 0 1-3 3V5zM10 14h4v3h2v2H8v-2h2v-3z"
            fill={color}
          />
        </svg>
      );
    case 'coin':
      return (
        <svg {...common}>
          <title>{title}</title>
          <circle cx={half} cy={half} r="10" fill={color} />
          <text
            x={half}
            y={half + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#0b0d10"
            fontFamily="serif"
          >
            ₪
          </text>
        </svg>
      );
    case 'gem':
      return (
        <svg {...common}>
          <title>{title}</title>
          <polygon points="12,2 22,9 12,22 2,9" fill={color} />
          <polygon points="12,2 17,9 12,14 7,9" fill="#ffffff22" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path d="M3 8l4 4 5-7 5 7 4-4v10H3V8z" fill={color} />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <title>{title}</title>
          <circle cx={half} cy={half} r="10" fill="none" stroke={color} strokeWidth="2" />
          <circle cx={half} cy={half} r="6"  fill="none" stroke={color} strokeWidth="2" />
          <circle cx={half} cy={half} r="2"  fill={color} />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path
            d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 2 3 3-3z"
            fill={color}
          />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <title>{title}</title>
          <polygon points="13,2 4,13 11,13 9,22 20,10 13,10" fill={color} />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path d="M12 2l9 3v6c0 5-4 10-9 11-5-1-9-6-9-11V5l9-3z" fill={color} />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path
            d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM20 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"
            fill={color}
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <title>{title}</title>
          <circle cx={half} cy={half} r="8" fill={color} />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Movement arrow                                                      */
/* ------------------------------------------------------------------ */

function MovementArrow({ info }) {
  const th = LEADERBOARD_THEME;
  if (!info) {
    return (
      <span style={{ color: th.textDim, fontSize: 12 }} aria-label="אין נתוני תנועה">
        —
      </span>
    );
  }
  const { direction, delta } = info;

  if (direction === 'new') {
    return (
      <span
        style={{
          color: th.accent,
          fontSize: 11,
          fontWeight: 700,
          border: `1px solid ${th.accent}`,
          borderRadius: 10,
          padding: '1px 6px',
          direction: 'rtl',
        }}
        aria-label="חדש בלוח"
      >
        חדש
      </span>
    );
  }

  if (direction === 'same') {
    return (
      <span
        style={{ color: th.textDim, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3 }}
        aria-label="ללא שינוי"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="11" width="16" height="2" fill={th.textDim} />
        </svg>
        <span>0</span>
      </span>
    );
  }

  if (direction === 'up') {
    return (
      <span
        style={{ color: th.success, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3, direction: 'ltr' }}
        aria-label={`עלייה של ${Math.abs(delta)} מקומות`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polygon points="12,4 20,16 4,16" fill={th.success} />
        </svg>
        <span>{Math.abs(delta)}</span>
      </span>
    );
  }

  // down
  return (
    <span
      style={{ color: th.danger, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3, direction: 'ltr' }}
      aria-label={`ירידה של ${Math.abs(delta)} מקומות`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon points="12,20 4,8 20,8" fill={th.danger} />
      </svg>
      <span>{Math.abs(delta)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rank medal                                                          */
/* ------------------------------------------------------------------ */

function RankMedal({ rank }) {
  const th = LEADERBOARD_THEME;
  const medalColor =
    rank === 1 ? '#f0c674' :
    rank === 2 ? '#c0c8d4' :
    rank === 3 ? '#cd7f32' : null;
  if (!medalColor) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: th.panel2,
          color: th.textDim,
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          border: `1px solid ${th.border}`,
        }}
        aria-label={`מקום ${rank}`}
      >
        {rank}
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: medalColor,
        color: '#0b0d10',
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: `0 0 0 2px ${th.bg}, 0 0 0 3px ${medalColor}`,
      }}
      aria-label={`מדליה — מקום ${rank}`}
    >
      {rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Period selector                                                     */
/* ------------------------------------------------------------------ */

function PeriodSelector({ value, onChange }) {
  const th = LEADERBOARD_THEME;
  return (
    <div
      role="tablist"
      aria-label="בחירת תקופה"
      style={{
        display: 'inline-flex',
        background: th.panel2,
        border: `1px solid ${th.border}`,
        borderRadius: 8,
        padding: 3,
        gap: 2,
      }}
    >
      {PERIODS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange && onChange(p)}
            style={{
              background: active ? th.accent : 'transparent',
              color: active ? '#0b0d10' : th.text,
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
              minWidth: 60,
            }}
          >
            <span>{PERIOD_LABELS_HE[p]}</span>
            <span style={{ display: 'block', fontSize: 10, opacity: 0.7, direction: 'ltr' }}>
              {PERIOD_LABELS_EN[p]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function SalesLeaderboard(props) {
  const {
    salespeople = [],
    previous = [],
    currentUserId = null,
    period: periodProp,
    onPeriodChange,
    metric: metricProp,
    onMetricChange,
    title = 'לוח מובילי המכירות',
    englishTitle = 'Sales Leaderboard',
  } = props;

  const th = LEADERBOARD_THEME;

  // Local state falls back to prop, but stays responsive if parent is uncontrolled
  const [periodState, setPeriodState] = useState(periodProp || 'month');
  const [sortMetric, setSortMetric]   = useState(metricProp || 'revenue');

  const period = periodProp || periodState;
  const metric = metricProp || sortMetric;

  const handlePeriodChange = useCallback(
    (p) => {
      setPeriodState(p);
      if (onPeriodChange) onPeriodChange(p);
    },
    [onPeriodChange],
  );

  const handleMetricClick = useCallback(
    (m) => {
      setSortMetric(m);
      if (onMetricChange) onMetricChange(m);
    },
    [onMetricChange],
  );

  const ranked = useMemo(() => rankFn(salespeople, metric, period), [salespeople, metric, period]);
  const prevRanked = useMemo(() => rankFn(previous, metric, period), [previous, metric, period]);
  const moveMap = useMemo(() => movementFn(ranked, prevRanked), [ranked, prevRanked]);

  const myRow = useMemo(
    () => (currentUserId != null ? ranked.find((r) => r.id === currentUserId) : null),
    [ranked, currentUserId],
  );

  const sortableMetrics = METRICS;

  const headerCell = (m) => {
    const active = m === metric;
    return (
      <th
        key={m}
        scope="col"
        onClick={() => handleMetricClick(m)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleMetricClick(m);
          }
        }}
        tabIndex={0}
        role="columnheader"
        aria-sort={active ? 'descending' : 'none'}
        style={{
          textAlign: 'right',
          padding: '10px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: active ? th.accent : th.textDim,
          cursor: 'pointer',
          borderBottom: `1px solid ${th.border}`,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          background: th.panel,
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
        title={METRIC_LABELS_EN[m]}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {METRIC_LABELS_HE[m]}
          {active ? (
            <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <polygon points="12,20 4,8 20,8" fill={th.accent} />
            </svg>
          ) : null}
        </span>
        <div style={{ fontSize: 9, color: th.textDim, fontWeight: 400, direction: 'ltr' }}>
          {METRIC_LABELS_EN[m]}
        </div>
      </th>
    );
  };

  return (
    <div
      dir="rtl"
      style={{
        background: th.bg,
        color: th.text,
        minHeight: '100%',
        padding: '20px 24px',
        fontFamily: FONT_STACK,
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label="לוח מובילי מכירות"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: th.text, fontWeight: 700 }}>
            {title}
          </h2>
          <div style={{ fontSize: 12, color: th.textDim, direction: 'ltr' }}>
            {englishTitle}
          </div>
        </div>

        <PeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* Your rank banner */}
      {myRow ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: `linear-gradient(90deg, ${th.accent}22 0%, ${th.panel} 70%)`,
            border: `1px solid ${th.accent}66`,
            borderRadius: 10,
            padding: '12px 18px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: th.textDim,
              textTransform: 'none',
            }}
          >
            המיקום שלך
            <div style={{ fontSize: 10, direction: 'ltr' }}>Your rank</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: th.accent }}>
            #{myRow.rank}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, color: th.text }}>
            {myRow.name}
            <div style={{ fontSize: 11, color: th.textDim }}>
              {METRIC_LABELS_HE[metric]}: <strong style={{ color: th.text }}>{formatMetric(myRow.metricValue, metric)}</strong>
            </div>
          </div>
        </div>
      ) : currentUserId != null ? (
        <div
          role="status"
          style={{
            background: th.panel,
            border: `1px dashed ${th.border}`,
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 14,
            fontSize: 12,
            color: th.textDim,
          }}
        >
          לא נמצאו נתוני מכירות עבור המשתמש הנוכחי בתקופה זו
          <div style={{ fontSize: 10, direction: 'ltr' }}>
            No sales data for current user in this period
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div
        style={{
          background: th.panel,
          border: `1px solid ${th.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
          <table
            role="table"
            aria-label="טבלת מובילי מכירות"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              direction: 'rtl',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: th.textDim,
                    borderBottom: `1px solid ${th.border}`,
                    background: th.panel,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    width: 68,
                  }}
                >
                  דירוג
                  <div style={{ fontSize: 9, color: th.textDim, fontWeight: 400, direction: 'ltr' }}>
                    Rank
                  </div>
                </th>
                <th
                  scope="col"
                  style={{
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: th.textDim,
                    borderBottom: `1px solid ${th.border}`,
                    background: th.panel,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  שם
                  <div style={{ fontSize: 9, color: th.textDim, fontWeight: 400, direction: 'ltr' }}>
                    Name
                  </div>
                </th>
                <th
                  scope="col"
                  style={{
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: th.textDim,
                    borderBottom: `1px solid ${th.border}`,
                    background: th.panel,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    width: 80,
                  }}
                >
                  תנועה
                  <div style={{ fontSize: 9, color: th.textDim, fontWeight: 400, direction: 'ltr' }}>
                    Movement
                  </div>
                </th>
                {sortableMetrics.map((m) => headerCell(m))}
                <th
                  scope="col"
                  style={{
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: th.textDim,
                    borderBottom: `1px solid ${th.border}`,
                    background: th.panel,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  תגים
                  <div style={{ fontSize: 9, color: th.textDim, fontWeight: 400, direction: 'ltr' }}>
                    Badges
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + sortableMetrics.length}
                    style={{ textAlign: 'center', padding: 40, color: th.textDim }}
                  >
                    אין נתוני מכירות להצגה
                    <div style={{ fontSize: 11, direction: 'ltr' }}>No sales data</div>
                  </td>
                </tr>
              ) : (
                ranked.map((row, idx) => {
                  const isMe = currentUserId != null && row.id === currentUserId;
                  const earnedBadges = badgesFn(row);
                  return (
                    <tr
                      key={row.id}
                      aria-current={isMe ? 'true' : undefined}
                      style={{
                        background: isMe
                          ? th.highlightRow
                          : idx % 2 === 0
                          ? th.panel
                          : th.panel2,
                        borderBottom: `1px solid ${th.border}`,
                        transition: 'background 120ms',
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <RankMedal rank={row.rank} />
                      </td>
                      <td style={{ padding: '10px 12px', color: th.text, fontWeight: isMe ? 700 : 500 }}>
                        {row.name || '—'}
                        {isMe ? (
                          <span
                            style={{
                              marginInlineStart: 6,
                              fontSize: 10,
                              color: th.accent,
                              border: `1px solid ${th.accent}`,
                              borderRadius: 10,
                              padding: '1px 6px',
                            }}
                          >
                            אני
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <MovementArrow info={moveMap[row.id]} />
                      </td>
                      {sortableMetrics.map((m) => {
                        const val = engine?.metricValue ? engine.metricValue(row, m) : _localMetricValue(row, m);
                        const active = m === metric;
                        return (
                          <td
                            key={m}
                            style={{
                              padding: '10px 12px',
                              color: active ? th.accent : th.text,
                              fontWeight: active ? 700 : 400,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatMetric(val, m)}
                          </td>
                        );
                      })}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                          {earnedBadges.length === 0 ? (
                            <span style={{ color: th.textDim, fontSize: 11 }}>—</span>
                          ) : (
                            earnedBadges.map((b) => (
                              <BadgeGlyph
                                key={b.id}
                                symbol={b.symbol}
                                color={b.color}
                                size={18}
                                title={b.name_he}
                              />
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer legend */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 11,
          color: th.textDim,
        }}
      >
        <span>
          לוח זה מבוסס על מנוע <code style={{ color: th.text }}>sales/leaderboard.js</code>
        </span>
        <span style={{ direction: 'ltr' }}>
          Period: {PERIOD_LABELS_EN[period]} · Metric: {METRIC_LABELS_EN[metric]} · N={ranked.length}
        </span>
      </div>
    </div>
  );
}

/* named exports so tests / storybooks can reach internals */
export {
  BadgeGlyph,
  MovementArrow,
  RankMedal,
  PeriodSelector,
};
