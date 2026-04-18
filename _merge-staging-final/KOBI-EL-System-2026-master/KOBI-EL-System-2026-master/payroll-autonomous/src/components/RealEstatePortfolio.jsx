/**
 * RealEstatePortfolio — Real Estate Portfolio Dashboard
 * Agent Y-059 / Techno-Kol Uzi mega-ERP 2026
 *
 * Palantir dark theme, Hebrew RTL, bilingual (he + en subtitle).
 * Zero external deps beyond React — all charts are inline SVG.
 *
 * Consumes the output of onyx-procurement/src/realestate/portfolio-dashboard.js.
 * The backend bundle is passed in via the `data` prop so this component stays
 * pure/presentational and unit-testable.
 *
 * Props:
 *   data: {
 *     aggregate:    result of aggregatePortfolio()
 *     performance:  result of performanceByProperty('month' | 'quarter' | 'ytd')
 *     concentration: result of concentrationRisk()
 *     debt:         result of debtSchedule()
 *     vacancy:      result of vacancyTimeline()
 *     capex:        result of capex()
 *   }
 *   period:         'month' | 'quarter' | 'ytd'
 *   onPeriodChange: (period) => void
 *   onPropertyClick: (property) => void
 *   onExportPDF:    () => void
 *   loading:        boolean
 *
 * Layout:
 *   Row 1 — 4 KPI cards (total value, rent roll, cash flow, occupancy)
 *   Row 2 — Concentration pie (by city)     + Top-10 bar (by value)
 *   Row 3 — Vacancy heat map (by month)     + Property type pie
 *   Row 4 — Sortable properties table
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade.
 */

import React, { useState, useMemo, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════
// Palantir dark theme  (matches BIDashboard palette)
// ═══════════════════════════════════════════════════════════════
export const REP_THEME = {
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
  palette: [
    '#4a9eff', '#3fb950', '#d29922', '#f85149', '#a371f7',
    '#ff8b5b', '#39c5cf', '#e86bb5', '#f0c674', '#8cb4ff',
    '#ff6b6b', '#6bcb77',
  ],
};

// ═══════════════════════════════════════════════════════════════
// Locale helpers
// ═══════════════════════════════════════════════════════════════
const fmtILS = (n) => {
  const v = Number(n || 0);
  return '\u20AA ' + v.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const fmtILSCompact = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return '\u20AA ' + (v / 1_000_000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + 'M';
  if (abs >= 1_000)     return '\u20AA ' + (v / 1_000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + 'K';
  return '\u20AA ' + v.toLocaleString('he-IL', { maximumFractionDigits: 0 });
};

const fmtPct = (n, digits = 1) =>
  (Number(n || 0) * 100).toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }) + '%';

const propertyTypeHe = {
  apartment:  'מגורים',
  commercial: 'מסחרי',
  office:     'משרדים',
  retail:     'קמעונאי',
  industrial: 'תעשייתי',
  land:       'קרקע',
  other:      'אחר',
};

// ═══════════════════════════════════════════════════════════════
// Scoped CSS
// ═══════════════════════════════════════════════════════════════
const repCSS = `
  .rep-root { direction: rtl; background: ${REP_THEME.bg}; color: ${REP_THEME.text}; font-family: -apple-system, 'Segoe UI', Heebo, Arial, sans-serif; padding: 20px; border-radius: 8px; }
  .rep-root * { box-sizing: border-box; }
  .rep-topbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: ${REP_THEME.panel}; border: 1px solid ${REP_THEME.border}; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; }
  .rep-topbar h2 { margin: 0; font-size: 20px; font-weight: 700; color: ${REP_THEME.text}; }
  .rep-topbar .rep-sub { font-size: 12px; color: ${REP_THEME.textDim}; margin-top: 2px; }
  .rep-spacer { flex: 1; }
  .rep-segmented { display: inline-flex; background: ${REP_THEME.panel2}; border: 1px solid ${REP_THEME.border}; border-radius: 6px; overflow: hidden; }
  .rep-segmented button { background: transparent; color: ${REP_THEME.textDim}; border: 0; padding: 7px 14px; cursor: pointer; font-size: 13px; font-family: inherit; }
  .rep-segmented button:hover { color: ${REP_THEME.text}; }
  .rep-segmented button.active { background: ${REP_THEME.accent}; color: #fff; }
  .rep-btn { background: ${REP_THEME.panel2}; color: ${REP_THEME.text}; border: 1px solid ${REP_THEME.border}; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit; }
  .rep-btn:hover { background: ${REP_THEME.accent}; border-color: ${REP_THEME.accent}; color: #fff; }

  .rep-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
  @media (max-width: 900px) { .rep-kpis { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .rep-kpis { grid-template-columns: 1fr; } }
  .rep-kpi { background: ${REP_THEME.panel}; border: 1px solid ${REP_THEME.border}; border-radius: 8px; padding: 16px 18px; position: relative; overflow: hidden; }
  .rep-kpi:before { content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px; background: ${REP_THEME.accent}; }
  .rep-kpi.success:before { background: ${REP_THEME.success}; }
  .rep-kpi.warning:before { background: ${REP_THEME.warning}; }
  .rep-kpi.danger:before  { background: ${REP_THEME.danger}; }
  .rep-kpi h4 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: ${REP_THEME.textDim}; letter-spacing: 0.03em; text-transform: none; }
  .rep-kpi h4 .rep-kpi-en { display: block; font-size: 10px; color: ${REP_THEME.border}; margin-top: 1px; direction: ltr; text-align: start; }
  .rep-kpi .rep-kpi-val { font-size: 24px; font-weight: 700; color: ${REP_THEME.text}; margin: 4px 0 0; }
  .rep-kpi .rep-kpi-sub { font-size: 11px; color: ${REP_THEME.textDim}; margin-top: 3px; }

  .rep-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; margin-bottom: 16px; }
  .rep-card { background: ${REP_THEME.panel}; border: 1px solid ${REP_THEME.border}; border-radius: 8px; padding: 16px 18px; min-width: 0; }
  .rep-card.span-6 { grid-column: span 6; }
  .rep-card.span-8 { grid-column: span 8; }
  .rep-card.span-4 { grid-column: span 4; }
  .rep-card.span-12 { grid-column: span 12; }
  @media (max-width: 900px) { .rep-card.span-6, .rep-card.span-8, .rep-card.span-4 { grid-column: span 12; } }
  .rep-card h3 { margin: 0 0 2px; font-size: 14px; font-weight: 700; color: ${REP_THEME.text}; }
  .rep-card .rep-card-sub { font-size: 11px; color: ${REP_THEME.textDim}; margin-bottom: 12px; letter-spacing: 0.03em; direction: ltr; text-align: start; }

  .rep-legend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 10px; font-size: 12px; color: ${REP_THEME.textDim}; }
  .rep-legend .rep-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-inline-end: 6px; vertical-align: middle; }

  .rep-svg { width: 100%; height: auto; display: block; overflow: visible; }
  .rep-svg text { fill: ${REP_THEME.textDim}; font-size: 11px; font-family: inherit; }
  .rep-svg .rep-axis-line { stroke: ${REP_THEME.border}; stroke-width: 1; }
  .rep-svg .rep-grid-line { stroke: ${REP_THEME.grid}; stroke-width: 1; stroke-dasharray: 2 3; }
  .rep-svg .rep-hit { cursor: pointer; }
  .rep-svg .rep-hit:hover { opacity: 0.85; }

  .rep-tooltip { position: fixed; pointer-events: none; background: #0e1217; border: 1px solid ${REP_THEME.accent}; color: ${REP_THEME.text}; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-family: inherit; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.6); direction: rtl; }
  .rep-tooltip .rep-t-title { font-weight: 700; margin-bottom: 3px; color: ${REP_THEME.accent}; }

  .rep-table-wrap { overflow-x: auto; }
  .rep-table { width: 100%; border-collapse: collapse; font-size: 13px; color: ${REP_THEME.text}; }
  .rep-table th, .rep-table td { padding: 9px 10px; text-align: start; border-bottom: 1px solid ${REP_THEME.border}; }
  .rep-table th { background: ${REP_THEME.panel2}; color: ${REP_THEME.textDim}; font-weight: 600; font-size: 12px; cursor: pointer; user-select: none; white-space: nowrap; }
  .rep-table th.sorted { color: ${REP_THEME.accent}; }
  .rep-table th .rep-arrow { font-size: 10px; margin-inline-start: 4px; }
  .rep-table tbody tr:hover { background: ${REP_THEME.panel2}; cursor: pointer; }
  .rep-table td.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rep-table td .rep-chip { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: ${REP_THEME.panel2}; border: 1px solid ${REP_THEME.border}; }
  .rep-table td .rep-chip.apartment { color: ${REP_THEME.accent}; border-color: ${REP_THEME.accent}; }
  .rep-table td .rep-chip.commercial { color: ${REP_THEME.warning}; border-color: ${REP_THEME.warning}; }
  .rep-table td .rep-chip.retail { color: ${REP_THEME.success}; border-color: ${REP_THEME.success}; }
  .rep-table td .rep-chip.office { color: #a371f7; border-color: #a371f7; }

  .rep-hhi-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .rep-hhi-badge.low { background: rgba(63,185,80,0.18); color: ${REP_THEME.success}; border: 1px solid ${REP_THEME.success}; }
  .rep-hhi-badge.moderate { background: rgba(210,153,34,0.18); color: ${REP_THEME.warning}; border: 1px solid ${REP_THEME.warning}; }
  .rep-hhi-badge.high { background: rgba(248,81,73,0.18); color: ${REP_THEME.danger}; border: 1px solid ${REP_THEME.danger}; }

  .rep-empty { text-align: center; padding: 36px 20px; color: ${REP_THEME.textDim}; font-size: 13px; }
  .rep-skel { background: linear-gradient(90deg, ${REP_THEME.panel2} 0%, ${REP_THEME.border} 50%, ${REP_THEME.panel2} 100%); background-size: 200% 100%; animation: rep-shimmer 1.4s infinite; border-radius: 4px; }
  @keyframes rep-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

// ═══════════════════════════════════════════════════════════════
// Tooltip hook
// ═══════════════════════════════════════════════════════════════
function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((evt, payload) => {
    setTip({ x: evt.clientX, y: evt.clientY, ...payload });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

function Tooltip({ tip }) {
  if (!tip) return null;
  const style = {
    left: Math.max(8, tip.x + 14),
    top: Math.max(8, tip.y + 14),
  };
  return (
    <div className="rep-tooltip" role="tooltip" style={style}>
      {tip.title && <div className="rep-t-title">{tip.title}</div>}
      {(tip.lines || []).map((ln, i) => (
        <div key={i}>
          {ln[0]}: <strong>{ln[1]}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="rep-empty">{label || 'אין נתונים'}</div>;
}

// ═══════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════
function KpiCard({ labelHe, labelEn, value, sub, tone }) {
  return (
    <div className={`rep-kpi ${tone || ''}`}>
      <h4>
        {labelHe}
        <span className="rep-kpi-en">{labelEn}</span>
      </h4>
      <div className="rep-kpi-val">{value}</div>
      {sub && <div className="rep-kpi-sub">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SVG Pie chart — used for city split + type split
// ═══════════════════════════════════════════════════════════════
function PieChart({ buckets, title, subtitle, valueFormatter, onSliceClick }) {
  const { tip, show, hide } = useTooltip();
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = 92;

  if (!buckets || buckets.length === 0) {
    return <EmptyState label={`אין נתונים עבור ${title}`} />;
  }

  const total = buckets.reduce((a, b) => a + (b.value || b.rent || 0), 0);
  if (total <= 0) return <EmptyState label={`אין נתונים עבור ${title}`} />;

  // Build arcs
  let startAngle = -Math.PI / 2;
  const arcs = buckets.map((b, i) => {
    const val = b.value || b.rent || 0;
    const share = val / total;
    const angle = share * Math.PI * 2;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    // slices near-full circle fall back to a circle
    const pathData = share >= 0.999
      ? `M ${cx} ${cy - r} a ${r} ${r} 0 1 1 0 ${2 * r} a ${r} ${r} 0 1 1 0 ${-2 * r}`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const midAngle = startAngle + angle / 2;
    const color = REP_THEME.palette[i % REP_THEME.palette.length];
    const arc = {
      pathData,
      color,
      key: b.key,
      value: val,
      share,
      midAngle,
      label: propertyTypeHe[b.key] || b.key,
    };
    startAngle = endAngle;
    return arc;
  });

  return (
    <>
      <svg className="rep-svg" viewBox={`0 0 ${size + 200} ${size + 20}`} role="img" aria-label={title}>
        <title>{title}</title>
        <desc>{subtitle}</desc>
        {arcs.map((a) => (
          <path
            key={a.key}
            className="rep-hit"
            d={a.pathData}
            fill={a.color}
            stroke={REP_THEME.bg}
            strokeWidth="2"
            onClick={() => onSliceClick && onSliceClick(a)}
            onMouseMove={(evt) =>
              show(evt, {
                title: a.label,
                lines: [
                  [title, valueFormatter ? valueFormatter(a.value) : fmtILSCompact(a.value)],
                  ['חלק', fmtPct(a.share)],
                ],
              })
            }
            onMouseLeave={hide}
          />
        ))}
        {/* Legend */}
        {arcs.slice(0, 10).map((a, i) => (
          <g key={a.key + '-leg'}
             transform={`translate(${size + 10}, ${14 + i * 20})`}>
            <rect x="0" y="0" width="10" height="10" fill={a.color} rx="2" />
            <text x="16" y="9" style={{ fill: REP_THEME.text, fontSize: 11 }}>
              {a.label} — {fmtPct(a.share)}
            </text>
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Horizontal Bar chart — Top 10 properties by value
// ═══════════════════════════════════════════════════════════════
function TopPropertiesBar({ rows, onBarClick }) {
  const { tip, show, hide } = useTooltip();
  const top = (rows || [])
    .slice()
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 10);

  if (top.length === 0) return <EmptyState label="אין נכסים להצגה" />;

  const width = 620;
  const rowH = 28;
  const height = top.length * rowH + 30;
  const labelW = 160;
  const barW = width - labelW - 90;
  const maxV = Math.max(...top.map((r) => r.value || 0), 1);

  return (
    <>
      <svg className="rep-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="עשרת הנכסים המובילים">
        <title>Top 10 Properties by Value</title>
        {top.map((r, i) => {
          const y = 12 + i * rowH;
          const w = ((r.value || 0) / maxV) * barW;
          const color = REP_THEME.palette[i % REP_THEME.palette.length];
          return (
            <g key={r.id}>
              <text
                x={width - 8}
                y={y + rowH / 2 + 4}
                textAnchor="end"
                style={{ fill: REP_THEME.text, fontSize: 12 }}
              >
                {r.name_he || r.id}
              </text>
              <rect
                className="rep-hit"
                x={width - labelW - w - 20}
                y={y + 4}
                width={Math.max(2, w)}
                height={rowH - 12}
                fill={color}
                rx="2"
                onClick={() => onBarClick && onBarClick(r)}
                onMouseMove={(evt) =>
                  show(evt, {
                    title: r.name_he,
                    lines: [
                      ['שווי', fmtILS(r.value)],
                      ['הון עצמי', fmtILS(r.equity)],
                      ['NOI', fmtILS(r.noi)],
                      ['תפוסה', fmtPct(r.occupancy)],
                    ],
                  })
                }
                onMouseLeave={hide}
              />
              <text
                x={width - labelW - w - 24}
                y={y + rowH / 2 + 4}
                textAnchor="end"
                style={{ fill: REP_THEME.textDim, fontSize: 11 }}
              >
                {fmtILSCompact(r.value)}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Vacancy Heat map — by month
// Maps each month to a coloured cell; darker = lower vacancy.
// ═══════════════════════════════════════════════════════════════
function VacancyHeatMap({ series }) {
  const { tip, show, hide } = useTooltip();
  if (!series || series.length === 0) {
    return <EmptyState label="אין נתוני תפוסה היסטוריים" />;
  }

  const cellSize = 34;
  const cellGap = 4;
  const cols = Math.min(12, series.length);
  const rows = Math.ceil(series.length / cols);
  const width = cols * (cellSize + cellGap) + 80;
  const height = rows * (cellSize + cellGap) + 60;

  // color scale: 0 → green, 0.5 → amber, 1.0 → red
  const colorFor = (v) => {
    if (v <= 0.02) return REP_THEME.success;
    if (v <= 0.08) return '#6bcb77';
    if (v <= 0.15) return REP_THEME.warning;
    if (v <= 0.25) return '#ff8b5b';
    return REP_THEME.danger;
  };

  return (
    <>
      <svg className="rep-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="מפת חום תפוסה">
        <title>Vacancy Heat Map</title>
        {series.map((pt, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const x = 40 + col * (cellSize + cellGap);
          const y = 10 + row * (cellSize + cellGap);
          return (
            <g key={pt.yearMonth}>
              <rect
                className="rep-hit"
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={colorFor(pt.vacancyPct)}
                rx="3"
                onMouseMove={(evt) =>
                  show(evt, {
                    title: pt.yearMonth,
                    lines: [['אחוז פנויות', fmtPct(pt.vacancyPct)]],
                  })
                }
                onMouseLeave={hide}
              />
              <text
                x={x + cellSize / 2}
                y={y + cellSize / 2 + 4}
                textAnchor="middle"
                style={{ fill: '#0b0d10', fontSize: 10, fontWeight: 700 }}
              >
                {fmtPct(pt.vacancyPct, 0)}
              </text>
              <text
                x={x + cellSize / 2}
                y={y + cellSize + 14}
                textAnchor="middle"
                style={{ fill: REP_THEME.textDim, fontSize: 9 }}
              >
                {pt.yearMonth.slice(-2)}
              </text>
            </g>
          );
        })}
        {/* legend */}
        <g transform={`translate(40, ${rows * (cellSize + cellGap) + 28})`}>
          <text x="0" y="4" style={{ fill: REP_THEME.textDim, fontSize: 10 }}>מקרא:</text>
          {[
            { c: REP_THEME.success, l: '≤2%' },
            { c: '#6bcb77', l: '≤8%' },
            { c: REP_THEME.warning, l: '≤15%' },
            { c: '#ff8b5b', l: '≤25%' },
            { c: REP_THEME.danger, l: '>25%' },
          ].map((k, i) => (
            <g key={i} transform={`translate(${45 + i * 60}, -6)`}>
              <rect width="10" height="10" fill={k.c} rx="2" />
              <text x="14" y="9" style={{ fill: REP_THEME.textDim, fontSize: 10 }}>{k.l}</text>
            </g>
          ))}
        </g>
      </svg>
      <Tooltip tip={tip} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sortable properties table
// ═══════════════════════════════════════════════════════════════
function PropertiesTable({ rows, onRowClick }) {
  const [sortKey, setSortKey] = useState('noi');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    if (!rows) return [];
    const out = rows.slice();
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k) {
    if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  }

  function arrow(k) {
    if (k !== sortKey) return null;
    return <span className="rep-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const cols = [
    { k: 'rank',       label: '#' },
    { k: 'name_he',    label: 'שם הנכס' },
    { k: 'city',       label: 'עיר' },
    { k: 'propertyType', label: 'סוג' },
    { k: 'value',      label: 'שווי',        num: true, fmt: fmtILS },
    { k: 'equity',     label: 'הון עצמי',    num: true, fmt: fmtILS },
    { k: 'debt',       label: 'חוב',         num: true, fmt: fmtILS },
    { k: 'rentRoll',   label: 'שכ"ד',        num: true, fmt: fmtILS },
    { k: 'noi',        label: 'NOI',         num: true, fmt: fmtILS },
    { k: 'cashFlow',   label: 'תזרים',       num: true, fmt: fmtILS },
    { k: 'capRate',    label: 'CAP',         num: true, fmt: (v) => fmtPct(v) },
    { k: 'cashOnCash', label: 'תשואה/הון',   num: true, fmt: (v) => fmtPct(v) },
    { k: 'occupancy',  label: 'תפוסה',       num: true, fmt: (v) => fmtPct(v, 0) },
  ];

  if (!rows || rows.length === 0) return <EmptyState label="אין נכסים להצגה" />;

  return (
    <div className="rep-table-wrap">
      <table className="rep-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.k}
                className={c.k === sortKey ? 'sorted' : ''}
                onClick={() => toggleSort(c.k)}
              >
                {c.label}{arrow(c.k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} onClick={() => onRowClick && onRowClick(r)}>
              {cols.map((c) => {
                if (c.k === 'propertyType') {
                  return (
                    <td key={c.k}>
                      <span className={`rep-chip ${r.propertyType || ''}`}>
                        {propertyTypeHe[r.propertyType] || r.propertyType}
                      </span>
                    </td>
                  );
                }
                if (c.num) {
                  return <td key={c.k} className="num">{c.fmt(r[c.k])}</td>;
                }
                return <td key={c.k}>{r[c.k]}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HHI Badge
// ═══════════════════════════════════════════════════════════════
function HhiBadge({ bucket }) {
  if (!bucket || !bucket.classification) return null;
  const lvl = bucket.classification.level;
  return (
    <span className={`rep-hhi-badge ${lvl}`} title={bucket.classification.he}>
      HHI {bucket.hhi} — {bucket.classification.he}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════
export default function RealEstatePortfolio({
  data,
  period = 'month',
  onPeriodChange,
  onPropertyClick,
  onExportPDF,
  loading = false,
}) {
  const {
    aggregate,
    performance,
    concentration,
    debt,
    vacancy,
    capex: capexData,
  } = data || {};

  const periodLabels = { month: 'חודש', quarter: 'רבעון', ytd: 'מתחילת שנה' };

  if (loading) {
    return (
      <div className="rep-root">
        <style>{repCSS}</style>
        <div className="rep-topbar">
          <div className="rep-skel" style={{ width: 240, height: 24 }} />
          <div className="rep-spacer" />
          <div className="rep-skel" style={{ width: 280, height: 32 }} />
        </div>
        <div className="rep-kpis">
          {[1, 2, 3, 4].map((i) => (
            <div className="rep-kpi" key={i}>
              <div className="rep-skel" style={{ width: 100, height: 12, marginBottom: 8 }} />
              <div className="rep-skel" style={{ width: 140, height: 24 }} />
            </div>
          ))}
        </div>
        <div className="rep-card">
          <div className="rep-skel" style={{ width: '100%', height: 220 }} />
        </div>
      </div>
    );
  }

  if (!aggregate) {
    return (
      <div className="rep-root">
        <style>{repCSS}</style>
        <div className="rep-topbar">
          <h2>תיק נדל"ן — Real Estate Portfolio</h2>
        </div>
        <EmptyState label='אין נתוני תיק נדל"ן. יש להזין נכסים דרך ה-backend.' />
      </div>
    );
  }

  const typeBuckets = concentration?.byType?.buckets || [];
  const cityBuckets = concentration?.byCity?.buckets || [];
  const vacancySeries = vacancy?.series || [];
  const perfRows = performance || [];

  return (
    <div className="rep-root">
      <style>{repCSS}</style>

      {/* Top bar */}
      <div className="rep-topbar">
        <div>
          <h2>תיק נדל"ן</h2>
          <div className="rep-sub">Real Estate Portfolio Dashboard</div>
        </div>
        <div className="rep-spacer" />
        <div className="rep-segmented" role="tablist" aria-label="תקופה">
          {['month', 'quarter', 'ytd'].map((p) => (
            <button
              key={p}
              className={p === period ? 'active' : ''}
              onClick={() => onPeriodChange && onPeriodChange(p)}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rep-btn"
          onClick={() => onExportPDF && onExportPDF()}
        >
          ייצוא PDF
        </button>
      </div>

      {/* KPI cards */}
      <div className="rep-kpis">
        <KpiCard
          labelHe="שווי כולל"
          labelEn="Total Value"
          value={fmtILSCompact(aggregate.totalValue)}
          sub={`${aggregate.propertyCount} נכסים · LTV ${fmtPct(aggregate.ltv)}`}
          tone=""
        />
        <KpiCard
          labelHe='הכנסות שכ"ד חודשיות'
          labelEn="Monthly Rent Roll"
          value={fmtILSCompact(aggregate.monthlyRentRoll)}
          sub={`NOI חודשי: ${fmtILSCompact(aggregate.monthlyNOI)}`}
          tone="success"
        />
        <KpiCard
          labelHe="תזרים מזומנים שנתי"
          labelEn="Annual Cash Flow"
          value={fmtILSCompact(aggregate.annualCashFlow)}
          sub={`תשואה על הון: ${fmtPct(aggregate.cashOnCash)}`}
          tone={aggregate.annualCashFlow >= 0 ? 'success' : 'danger'}
        />
        <KpiCard
          labelHe="אחוז תפוסה"
          labelEn="Occupancy %"
          value={fmtPct(aggregate.occupancy, 1)}
          sub={`${aggregate.occupiedUnitCount} מתוך ${aggregate.unitCount} יחידות`}
          tone={aggregate.occupancy >= 0.95 ? 'success' : aggregate.occupancy >= 0.85 ? 'warning' : 'danger'}
        />
      </div>

      {/* Row: pie by city + top-10 bar */}
      <div className="rep-grid">
        <div className="rep-card span-6">
          <h3>ריכוזיות לפי עיר</h3>
          <div className="rep-card-sub">Concentration by City {concentration?.byCity && <HhiBadge bucket={concentration.byCity} />}</div>
          <PieChart
            buckets={cityBuckets}
            title="ריכוזיות עיר"
            subtitle="Portfolio value by city"
            valueFormatter={fmtILSCompact}
          />
        </div>
        <div className="rep-card span-6">
          <h3>עשרת הנכסים המובילים</h3>
          <div className="rep-card-sub">Top 10 Properties by Value</div>
          <TopPropertiesBar rows={perfRows} onBarClick={onPropertyClick} />
        </div>
      </div>

      {/* Row: vacancy heat map + type pie */}
      <div className="rep-grid">
        <div className="rep-card span-8">
          <h3>מפת חום תפוסה</h3>
          <div className="rep-card-sub">
            Vacancy Heat Map
            {vacancy?.stats && (
              <>
                {' '} · ממוצע {fmtPct(vacancy.stats.avg)} · שיא {fmtPct(vacancy.stats.peak)}
              </>
            )}
          </div>
          <VacancyHeatMap series={vacancySeries} />
        </div>
        <div className="rep-card span-4">
          <h3>התפלגות סוגי נכסים</h3>
          <div className="rep-card-sub">By Property Type {concentration?.byType && <HhiBadge bucket={concentration.byType} />}</div>
          <PieChart
            buckets={typeBuckets}
            title="סוג נכס"
            subtitle="By type"
            valueFormatter={fmtILSCompact}
          />
        </div>
      </div>

      {/* Row: properties table */}
      <div className="rep-grid">
        <div className="rep-card span-12">
          <h3>נכסים מדורגים</h3>
          <div className="rep-card-sub">Property Performance ({periodLabels[period]})</div>
          <PropertiesTable rows={perfRows} onRowClick={onPropertyClick} />
        </div>
      </div>

      {/* Row: debt summary + capex */}
      {debt && (
        <div className="rep-grid">
          <div className="rep-card span-6">
            <h3>לוח סילוקין — משכנתאות</h3>
            <div className="rep-card-sub">Debt Schedule — Mortgages</div>
            <div style={{ fontSize: 13, color: REP_THEME.text, lineHeight: 1.8 }}>
              <div>מספר משכנתאות: <strong>{debt.totals.count}</strong></div>
              <div>חוב כולל: <strong>{fmtILS(debt.totals.totalBalance)}</strong></div>
              <div>תשלום חודשי מצטבר: <strong>{fmtILS(debt.totals.totalMonthlyPayment)}</strong></div>
              <div>ריבית צפויה לשילום: <strong>{fmtILS(debt.totals.totalInterestRemaining)}</strong></div>
              <div>ריבית משוקללת ממוצעת: <strong>{fmtPct(debt.totals.weightedAvgRate)}</strong></div>
            </div>
          </div>
          {capexData && (
            <div className="rep-card span-6">
              <h3>הוצאות הוניות (CapEx)</h3>
              <div className="rep-card-sub">Capital Expenditures</div>
              <div style={{ fontSize: 13, color: REP_THEME.text, lineHeight: 1.8 }}>
                <div>סה"כ לכל התקופות: <strong>{fmtILS(capexData.totals.lifetime)}</strong></div>
                <div>מתחילת השנה (YTD): <strong>{fmtILS(capexData.totals.ytd)}</strong></div>
                <div>12 חודשים אחרונים (LTM): <strong>{fmtILS(capexData.totals.ltm)}</strong></div>
                <div>מספר פרויקטים: <strong>{capexData.totals.count}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Also export the presentational sub-components so callers (and tests)
// can render them individually without the full dashboard shell.
export {
  KpiCard,
  PieChart,
  TopPropertiesBar,
  VacancyHeatMap,
  PropertiesTable,
  HhiBadge,
  Tooltip,
  EmptyState,
  fmtILS,
  fmtILSCompact,
  fmtPct,
};
