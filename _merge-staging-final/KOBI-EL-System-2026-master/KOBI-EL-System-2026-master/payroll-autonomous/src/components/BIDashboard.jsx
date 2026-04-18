/**
 * BIDashboard — Business Intelligence Dashboard
 * Agent 99 / Techno-Kol mega-ERP 2026
 *
 * Interactive BI dashboard with 6 charts rendered as PURE inline SVG.
 * Zero chart libraries. Zero external deps beyond React.
 *
 * - Hebrew RTL, bilingual titles (HE + EN subtitle)
 * - Palantir dark theme (#0b0d10 / #13171c / #4a9eff)
 * - Responsive via viewBox
 * - Hover tooltips with ₪ he-IL locale formatting
 * - RTL-aware legends
 * - Accessible: <title>/<desc> + aria-labels
 * - Period selector (month / quarter / ytd)
 * - Date range picker
 * - Export-to-PDF button (delegates to server via onExportPDF)
 * - Loading skeleton (animated)
 * - No-data empty state
 *
 * Charts:
 *  1. Revenue trend (line)         — last 12 months
 *  2. Revenue vs expenses (bars)   — 2 series
 *  3. Top 10 clients (H-bars)
 *  4. Cash flow waterfall
 *  5. Employee cost distribution   — donut
 *  6. AR aging                     — stacked bar (current/30/60/90+)
 *
 * Props:
 *   data: {
 *     revenue_trend: [{ label, value }]
 *     revenue_expenses: [{ label, revenue, expenses }]
 *     top_clients: [{ name, value }]
 *     cash_flow: [{ label, value, type: 'start'|'in'|'out'|'end' }]
 *     employee_costs: [{ label, value }]
 *     ar_aging: [{ label, current, d30, d60, d90 }]
 *   }
 *   period: "month" | "quarter" | "ytd"
 *   onPeriodChange: (period) => void
 *   onDateRangeChange: ({ from, to }) => void
 *   onDrillDown: (chart, dataPoint) => void
 *   onExportPDF: () => void        // callback to server-side exporter
 *   loading: boolean               // shows skeleton
 *   dateRange: { from, to }
 */

import React, { useState, useMemo, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */
export const BI_THEME = {
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
  grid: '#232a33',
  palette: [
    '#4a9eff', // accent blue
    '#3fb950', // green
    '#d29922', // amber
    '#f85149', // red
    '#a371f7', // purple
    '#ff8b5b', // orange
    '#39c5cf', // teal
    '#e86bb5', // pink
    '#f0c674', // sand
    '#8cb4ff', // light blue
  ],
};

/* ------------------------------------------------------------------ */
/* Locale helpers                                                      */
/* ------------------------------------------------------------------ */
export const fmtILS = (n) => {
  const v = Number(n || 0);
  return '₪ ' + v.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const fmtILSCompact = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return '₪ ' + (v / 1_000_000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + 'M';
  if (abs >= 1_000)     return '₪ ' + (v / 1_000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + 'K';
  return '₪ ' + v.toLocaleString('he-IL', { maximumFractionDigits: 0 });
};

const fmtPct = (n) => Number(n || 0).toLocaleString('he-IL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
}) + '%';

/* ------------------------------------------------------------------ */
/* CSS (scoped via <style>)                                            */
/* ------------------------------------------------------------------ */
const biCSS = `
  .bi-root { direction: rtl; background: ${BI_THEME.bg}; color: ${BI_THEME.text}; font-family: -apple-system, 'Segoe UI', Heebo, Arial, sans-serif; padding: 20px; border-radius: 8px; }
  .bi-root * { box-sizing: border-box; }
  .bi-topbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: ${BI_THEME.panel}; border: 1px solid ${BI_THEME.border}; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; }
  .bi-topbar h2 { margin: 0; font-size: 20px; font-weight: 700; color: ${BI_THEME.text}; }
  .bi-topbar .bi-sub { font-size: 12px; color: ${BI_THEME.textDim}; margin-top: 2px; }
  .bi-topbar .bi-spacer { flex: 1; }
  .bi-segmented { display: inline-flex; background: ${BI_THEME.panel2}; border: 1px solid ${BI_THEME.border}; border-radius: 6px; overflow: hidden; }
  .bi-segmented button { background: transparent; color: ${BI_THEME.textDim}; border: 0; padding: 7px 14px; cursor: pointer; font-size: 13px; font-family: inherit; }
  .bi-segmented button:hover { color: ${BI_THEME.text}; }
  .bi-segmented button.active { background: ${BI_THEME.accent}; color: #fff; }
  .bi-daterange { display: inline-flex; gap: 6px; align-items: center; background: ${BI_THEME.panel2}; border: 1px solid ${BI_THEME.border}; border-radius: 6px; padding: 4px 8px; }
  .bi-daterange input { background: transparent; color: ${BI_THEME.text}; border: 0; font-size: 13px; font-family: inherit; outline: none; width: 130px; }
  .bi-daterange span { color: ${BI_THEME.textDim}; font-size: 12px; }
  .bi-btn { background: ${BI_THEME.panel2}; color: ${BI_THEME.text}; border: 1px solid ${BI_THEME.border}; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit; }
  .bi-btn:hover { background: ${BI_THEME.accent}; border-color: ${BI_THEME.accent}; color: #fff; }
  .bi-btn.primary { background: ${BI_THEME.accent}; border-color: ${BI_THEME.accent}; color: #fff; }
  .bi-grid { display: grid; gap: 16px; grid-template-columns: repeat(12, 1fr); }
  .bi-card { background: ${BI_THEME.panel}; border: 1px solid ${BI_THEME.border}; border-radius: 8px; padding: 16px 18px; }
  .bi-card.span-6 { grid-column: span 6; }
  .bi-card.span-12 { grid-column: span 12; }
  .bi-card.span-4 { grid-column: span 4; }
  .bi-card.span-8 { grid-column: span 8; }
  @media (max-width: 900px) {
    .bi-card.span-4, .bi-card.span-6, .bi-card.span-8 { grid-column: span 12; }
  }
  .bi-card h3 { margin: 0 0 2px; font-size: 14px; font-weight: 700; color: ${BI_THEME.text}; }
  .bi-card .bi-card-sub { font-size: 11px; color: ${BI_THEME.textDim}; margin-bottom: 12px; letter-spacing: 0.03em; }
  .bi-legend { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-top: 10px; font-size: 12px; color: ${BI_THEME.textDim}; }
  .bi-legend .bi-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-inline-end: 6px; vertical-align: middle; }
  .bi-tooltip { position: fixed; pointer-events: none; background: #0e1217; border: 1px solid ${BI_THEME.accent}; color: ${BI_THEME.text}; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-family: inherit; z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.6); direction: rtl; pointer-events: none; }
  .bi-tooltip .bi-t-title { font-weight: 700; margin-bottom: 3px; color: ${BI_THEME.accent}; }
  .bi-empty { text-align: center; padding: 40px 20px; color: ${BI_THEME.textDim}; font-size: 13px; }
  .bi-empty .bi-empty-icon { font-size: 36px; margin-bottom: 8px; color: ${BI_THEME.border}; }
  .bi-skeleton { background: linear-gradient(90deg, ${BI_THEME.panel2} 0%, ${BI_THEME.border} 50%, ${BI_THEME.panel2} 100%); background-size: 200% 100%; animation: bi-shimmer 1.4s infinite; border-radius: 4px; }
  @keyframes bi-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .bi-svg { width: 100%; height: auto; display: block; overflow: visible; }
  .bi-svg text { fill: ${BI_THEME.textDim}; font-size: 11px; font-family: inherit; }
  .bi-svg .bi-axis-line { stroke: ${BI_THEME.border}; stroke-width: 1; }
  .bi-svg .bi-grid-line { stroke: ${BI_THEME.grid}; stroke-width: 1; stroke-dasharray: 2 3; }
  .bi-svg .bi-hit { cursor: pointer; }
  .bi-svg .bi-hit:hover { opacity: 0.85; }
`;

/* ------------------------------------------------------------------ */
/* Shared hooks                                                        */
/* ------------------------------------------------------------------ */
function useTooltip() {
  const [tip, setTip] = useState(null); // { x, y, title, lines: [[label, value]] }
  const show = useCallback((evt, payload) => {
    // clientX/Y so we position in viewport coordinates
    setTip({ x: evt.clientX, y: evt.clientY, ...payload });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

function Tooltip({ tip }) {
  if (!tip) return null;
  const style = {
    left: Math.max(8, tip.x + 14),
    top:  Math.max(8, tip.y + 14),
  };
  return (
    <div className="bi-tooltip" role="tooltip" style={style}>
      {tip.title && <div className="bi-t-title">{tip.title}</div>}
      {(tip.lines || []).map((ln, i) => (
        <div key={i}>
          {ln[0]}: <strong>{ln[1]}</strong>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Axis helper: "nice" ticks                                           */
/* ------------------------------------------------------------------ */
function niceTicks(min, max, count = 5) {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    return [0, 1, 2, 3, 4].map(i => (min || 0) + i);
  }
  const range = max - min;
  const roughStep = range / count;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.abs(roughStep) || 1)));
  const norm = roughStep / pow;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  step *= pow;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(v);
  return ticks;
}

/* ------------------------------------------------------------------ */
/* 1. Revenue Trend — line chart                                       */
/* ------------------------------------------------------------------ */
function RevenueTrendChart({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();
  const width = 620, height = 260;
  const margin = { top: 16, right: 30, bottom: 34, left: 70 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני מגמת הכנסות" />;
  }

  const values = data.map(d => Number(d.value || 0));
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const ticks = niceTicks(minV, maxV, 5);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const xStep = data.length > 1 ? iw / (data.length - 1) : iw / 2;

  // In RTL charts, first item sits on the RIGHT. We flip x visually:
  const x = (i) => margin.left + iw - i * xStep;
  const y = (v) => margin.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const areaPath = `${path} L ${x(data.length - 1)} ${margin.top + ih} L ${x(0)} ${margin.top + ih} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="מגמת הכנסות 12 חודשים"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>מגמת הכנסות — 12 חודשים אחרונים</title>
        <desc>Revenue trend line chart showing the last 12 months.</desc>

        {/* grid + y labels */}
        {ticks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line className="bi-grid-line" x1={margin.left} x2={margin.left + iw} y1={yy} y2={yy} />
              <text x={margin.left - 8} y={yy + 4} textAnchor="end">{fmtILSCompact(t)}</text>
            </g>
          );
        })}
        {/* x labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={margin.top + ih + 18}
            textAnchor="middle"
          >{d.label}</text>
        ))}
        {/* axes */}
        <line className="bi-axis-line" x1={margin.left} x2={margin.left + iw} y1={margin.top + ih} y2={margin.top + ih} />
        <line className="bi-axis-line" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + ih} />

        {/* area fill */}
        <defs>
          <linearGradient id="bi-area-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={BI_THEME.accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BI_THEME.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#bi-area-rev)" />

        {/* line */}
        <path d={path} fill="none" stroke={BI_THEME.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* points */}
        {data.map((d, i) => (
          <circle
            key={i}
            className="bi-hit"
            cx={x(i)}
            cy={y(d.value)}
            r="5"
            fill={BI_THEME.bg}
            stroke={BI_THEME.accent}
            strokeWidth="2.5"
            tabIndex={0}
            aria-label={`${d.label}: ${fmtILS(d.value)}`}
            onMouseMove={(e) => show(e, {
              title: d.label,
              lines: [['הכנסות', fmtILS(d.value)]],
            })}
            onMouseLeave={hide}
            onClick={() => onDrillDown && onDrillDown('revenue_trend', d)}
            onKeyDown={(e) => { if (e.key === 'Enter' && onDrillDown) onDrillDown('revenue_trend', d); }}
          />
        ))}
      </svg>
      <Tooltip tip={tip} />
      <div className="bi-legend">
        <span><span className="bi-sw" style={{ background: BI_THEME.accent }} />הכנסות חודשיות</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Revenue vs Expenses — grouped bars                               */
/* ------------------------------------------------------------------ */
function RevenueExpensesChart({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();
  const width = 620, height = 260;
  const margin = { top: 16, right: 20, bottom: 34, left: 70 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני הכנסות מול הוצאות" />;
  }

  const maxV = Math.max(...data.flatMap(d => [Number(d.revenue || 0), Number(d.expenses || 0)]), 0);
  const ticks = niceTicks(0, maxV, 5);
  const yMax = ticks[ticks.length - 1];

  const groupW = iw / data.length;
  const barW = Math.max(6, groupW * 0.35);

  // RTL: first group at the RIGHT
  const groupX = (i) => margin.left + iw - (i + 0.5) * groupW;
  const y = (v) => margin.top + ih - (v / (yMax || 1)) * ih;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="הכנסות מול הוצאות"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>הכנסות מול הוצאות</title>
        <desc>Grouped bar chart comparing revenue and expenses per period.</desc>

        {ticks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line className="bi-grid-line" x1={margin.left} x2={margin.left + iw} y1={yy} y2={yy} />
              <text x={margin.left - 8} y={yy + 4} textAnchor="end">{fmtILSCompact(t)}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = groupX(i);
          const rev = Number(d.revenue || 0);
          const exp = Number(d.expenses || 0);
          const yR = y(rev);
          const yE = y(exp);
          const hR = margin.top + ih - yR;
          const hE = margin.top + ih - yE;
          return (
            <g key={i}>
              <rect
                className="bi-hit"
                x={cx - barW - 2}
                y={yR}
                width={barW}
                height={Math.max(0, hR)}
                fill={BI_THEME.accent}
                rx="2"
                tabIndex={0}
                aria-label={`${d.label} הכנסות: ${fmtILS(rev)}`}
                onMouseMove={(e) => show(e, {
                  title: d.label,
                  lines: [['הכנסות', fmtILS(rev)], ['הוצאות', fmtILS(exp)], ['רווח', fmtILS(rev - exp)]],
                })}
                onMouseLeave={hide}
                onClick={() => onDrillDown && onDrillDown('revenue_expenses', d)}
              />
              <rect
                className="bi-hit"
                x={cx + 2}
                y={yE}
                width={barW}
                height={Math.max(0, hE)}
                fill={BI_THEME.warning}
                rx="2"
                tabIndex={0}
                aria-label={`${d.label} הוצאות: ${fmtILS(exp)}`}
                onMouseMove={(e) => show(e, {
                  title: d.label,
                  lines: [['הכנסות', fmtILS(rev)], ['הוצאות', fmtILS(exp)], ['רווח', fmtILS(rev - exp)]],
                })}
                onMouseLeave={hide}
                onClick={() => onDrillDown && onDrillDown('revenue_expenses', d)}
              />
              <text x={cx} y={margin.top + ih + 18} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}

        <line className="bi-axis-line" x1={margin.left} x2={margin.left + iw} y1={margin.top + ih} y2={margin.top + ih} />
        <line className="bi-axis-line" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + ih} />
      </svg>
      <Tooltip tip={tip} />
      <div className="bi-legend">
        <span><span className="bi-sw" style={{ background: BI_THEME.accent }} />הכנסות</span>
        <span><span className="bi-sw" style={{ background: BI_THEME.warning }} />הוצאות</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Top 10 clients — horizontal bars                                 */
/* ------------------------------------------------------------------ */
function TopClientsChart({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני לקוחות מובילים" />;
  }

  const rows = [...data].sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(0, 10);
  const width = 620;
  const rowH = 26;
  const margin = { top: 8, right: 30, bottom: 10, left: 160 };
  const ih = rows.length * rowH;
  const height = margin.top + ih + margin.bottom;
  const iw = width - margin.left - margin.right;
  const maxV = Math.max(...rows.map(r => Number(r.value || 0)), 1);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="עשרת הלקוחות המובילים לפי הכנסות"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>10 לקוחות מובילים</title>
        <desc>Top 10 clients by revenue, horizontal bar chart.</desc>

        {rows.map((r, i) => {
          const w = (Number(r.value || 0) / maxV) * iw;
          const yy = margin.top + i * rowH + 4;
          const color = BI_THEME.palette[i % BI_THEME.palette.length];
          // RTL: bars grow from RIGHT (x-axis starts at right edge of plot area)
          const xRight = margin.left + iw;
          return (
            <g key={i}>
              <text x={xRight + 8} y={yy + rowH / 2 - 2} textAnchor="start">
                {truncate(r.name || '—', 20)}
              </text>
              <rect
                className="bi-hit"
                x={xRight - w}
                y={yy}
                width={w}
                height={rowH - 10}
                fill={color}
                rx="2"
                tabIndex={0}
                aria-label={`${r.name}: ${fmtILS(r.value)}`}
                onMouseMove={(e) => show(e, {
                  title: r.name,
                  lines: [['הכנסות', fmtILS(r.value)], ['אחוז מהסה"כ', fmtPct((r.value / rows.reduce((s, x) => s + Number(x.value || 0), 0)) * 100)]],
                })}
                onMouseLeave={hide}
                onClick={() => onDrillDown && onDrillDown('top_clients', r)}
              />
              <text
                x={xRight - w - 6}
                y={yy + rowH / 2 - 2}
                textAnchor="end"
                fill={BI_THEME.text}
                fontWeight="600"
              >{fmtILSCompact(r.value)}</text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/* ------------------------------------------------------------------ */
/* 4. Cash Flow Waterfall                                              */
/* ------------------------------------------------------------------ */
function CashFlowWaterfall({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();
  const width = 620, height = 260;
  const margin = { top: 16, right: 20, bottom: 40, left: 80 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני תזרים מזומנים" />;
  }

  // Compute running totals
  let run = 0;
  const bars = data.map((d) => {
    const v = Number(d.value || 0);
    if (d.type === 'start') {
      run = v;
      return { ...d, from: 0, to: v, end: v };
    }
    if (d.type === 'end') {
      return { ...d, from: 0, to: v, end: v };
    }
    const from = run;
    run += v; // in positive, out negative
    return { ...d, from, to: run, end: run };
  });

  const allVals = bars.flatMap(b => [b.from, b.to, b.end]);
  const maxV = Math.max(...allVals, 0);
  const minV = Math.min(...allVals, 0);
  const ticks = niceTicks(minV, maxV, 5);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const y = (v) => margin.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const groupW = iw / bars.length;
  const barW = Math.max(8, groupW * 0.55);
  // RTL: first bar at the RIGHT
  const cx = (i) => margin.left + iw - (i + 0.5) * groupW;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="תזרים מזומנים — תרשים מפל"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>תזרים מזומנים</title>
        <desc>Cash flow waterfall chart showing start, inflows, outflows, and end balance.</desc>

        {ticks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line className="bi-grid-line" x1={margin.left} x2={margin.left + iw} y1={yy} y2={yy} />
              <text x={margin.left - 8} y={yy + 4} textAnchor="end">{fmtILSCompact(t)}</text>
            </g>
          );
        })}

        {bars.map((b, i) => {
          let fill = BI_THEME.accent;
          if (b.type === 'in')    fill = BI_THEME.success;
          if (b.type === 'out')   fill = BI_THEME.danger;
          if (b.type === 'start') fill = BI_THEME.accent;
          if (b.type === 'end')   fill = BI_THEME.accent;
          const top = y(Math.max(b.from, b.to));
          const bot = y(Math.min(b.from, b.to));
          const h = Math.max(1, bot - top);
          return (
            <g key={i}>
              <rect
                className="bi-hit"
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                fill={fill}
                rx="2"
                tabIndex={0}
                aria-label={`${b.label}: ${fmtILS(b.value)}`}
                onMouseMove={(e) => show(e, {
                  title: b.label,
                  lines: [
                    ['סוג', translateType(b.type)],
                    ['סכום', fmtILS(b.value)],
                    ['יתרה', fmtILS(b.end)],
                  ],
                })}
                onMouseLeave={hide}
                onClick={() => onDrillDown && onDrillDown('cash_flow', b)}
              />
              {/* connector to next bar */}
              {i < bars.length - 1 && bars[i + 1].type !== 'start' && bars[i + 1].type !== 'end' && (
                <line
                  x1={cx(i) - barW / 2}
                  x2={cx(i + 1) + barW / 2}
                  y1={y(b.end)}
                  y2={y(b.end)}
                  stroke={BI_THEME.border}
                  strokeDasharray="2 3"
                />
              )}
              <text x={cx(i)} y={margin.top + ih + 18} textAnchor="middle">{truncate(b.label, 10)}</text>
            </g>
          );
        })}

        <line className="bi-axis-line" x1={margin.left} x2={margin.left + iw} y1={margin.top + ih} y2={margin.top + ih} />
        <line className="bi-axis-line" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + ih} />
      </svg>
      <Tooltip tip={tip} />
      <div className="bi-legend">
        <span><span className="bi-sw" style={{ background: BI_THEME.accent  }} />יתרה</span>
        <span><span className="bi-sw" style={{ background: BI_THEME.success }} />כניסות</span>
        <span><span className="bi-sw" style={{ background: BI_THEME.danger  }} />יציאות</span>
      </div>
    </div>
  );
}

function translateType(t) {
  switch (t) {
    case 'start': return 'יתרת פתיחה';
    case 'in':    return 'כניסה';
    case 'out':   return 'יציאה';
    case 'end':   return 'יתרת סגירה';
    default:      return t || '';
  }
}

/* ------------------------------------------------------------------ */
/* 5. Employee Cost Distribution — donut                               */
/* ------------------------------------------------------------------ */
function EmployeeCostsDonut({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();
  const size = 280;
  const cx = size / 2, cy = size / 2;
  const outerR = 110;
  const innerR = 64;

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני עלויות עובדים" />;
  }

  const total = data.reduce((s, d) => s + Number(d.value || 0), 0);
  let startAngle = -Math.PI / 2; // start at top

  const segments = data.map((d, i) => {
    const v = Number(d.value || 0);
    const portion = total > 0 ? v / total : 0;
    const angle = portion * Math.PI * 2;
    const endAngle = startAngle + angle;
    const path = donutPath(cx, cy, innerR, outerR, startAngle, endAngle);
    const color = BI_THEME.palette[i % BI_THEME.palette.length];
    const seg = { ...d, path, color, portion, angle, startAngle, endAngle };
    startAngle = endAngle;
    return seg;
  });

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="התפלגות עלויות עובדים"
        preserveAspectRatio="xMidYMid meet"
        style={{ maxWidth: size, flexShrink: 0 }}
      >
        <title>עלויות עובדים — התפלגות</title>
        <desc>Donut chart of employee cost distribution by category.</desc>

        {segments.map((s, i) => (
          <path
            key={i}
            className="bi-hit"
            d={s.path}
            fill={s.color}
            stroke={BI_THEME.bg}
            strokeWidth="2"
            tabIndex={0}
            aria-label={`${s.label}: ${fmtILS(s.value)} (${fmtPct(s.portion * 100)})`}
            onMouseMove={(e) => show(e, {
              title: s.label,
              lines: [['סכום', fmtILS(s.value)], ['אחוז', fmtPct(s.portion * 100)]],
            })}
            onMouseLeave={hide}
            onClick={() => onDrillDown && onDrillDown('employee_costs', s)}
          />
        ))}
        {/* center total */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={BI_THEME.textDim} fontSize="11">סה"כ</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill={BI_THEME.text} fontSize="16" fontWeight="700">
          {fmtILSCompact(total)}
        </text>
      </svg>

      <div className="bi-legend" style={{ flexDirection: 'column', gap: 6, minWidth: 160 }}>
        {segments.map((s, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="bi-sw" style={{ background: s.color }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <span style={{ color: BI_THEME.text, fontWeight: 600 }}>{fmtPct(s.portion * 100)}</span>
          </span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

function donutPath(cx, cy, rIn, rOut, a0, a1) {
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const x0o = cx + rOut * Math.cos(a0), y0o = cy + rOut * Math.sin(a0);
  const x1o = cx + rOut * Math.cos(a1), y1o = cy + rOut * Math.sin(a1);
  const x0i = cx + rIn  * Math.cos(a1), y0i = cy + rIn  * Math.sin(a1);
  const x1i = cx + rIn  * Math.cos(a0), y1i = cy + rIn  * Math.sin(a0);
  return `M ${x0o} ${y0o}
          A ${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o}
          L ${x0i} ${y0i}
          A ${rIn} ${rIn} 0 ${large} 0 ${x1i} ${y1i}
          Z`;
}

/* ------------------------------------------------------------------ */
/* 6. AR Aging — stacked bars                                          */
/* ------------------------------------------------------------------ */
function ARAgingChart({ data, onDrillDown }) {
  const { tip, show, hide } = useTooltip();
  const width = 620, height = 260;
  const margin = { top: 16, right: 20, bottom: 40, left: 80 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  if (!data || data.length === 0) {
    return <EmptyState label="אין נתוני גיול חובות" />;
  }

  const totals = data.map(d =>
    Number(d.current || 0) + Number(d.d30 || 0) + Number(d.d60 || 0) + Number(d.d90 || 0)
  );
  const maxV = Math.max(...totals, 0);
  const ticks = niceTicks(0, maxV, 5);
  const yMax = ticks[ticks.length - 1];

  const groupW = iw / data.length;
  const barW = Math.max(10, groupW * 0.55);
  const cx = (i) => margin.left + iw - (i + 0.5) * groupW;
  const y = (v) => margin.top + ih - (v / (yMax || 1)) * ih;
  const h = (v) => (v / (yMax || 1)) * ih;

  const colors = {
    current: BI_THEME.success,
    d30:     BI_THEME.accent,
    d60:     BI_THEME.warning,
    d90:     BI_THEME.danger,
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="bi-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="גיול חובות לקוחות"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>גיול חובות</title>
        <desc>AR aging stacked bar chart: current, 30 days, 60 days, 90+ days.</desc>

        {ticks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line className="bi-grid-line" x1={margin.left} x2={margin.left + iw} y1={yy} y2={yy} />
              <text x={margin.left - 8} y={yy + 4} textAnchor="end">{fmtILSCompact(t)}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const segs = [
            { key: 'current', val: Number(d.current || 0), label: 'נוכחי' },
            { key: 'd30',     val: Number(d.d30     || 0), label: '30 יום' },
            { key: 'd60',     val: Number(d.d60     || 0), label: '60 יום' },
            { key: 'd90',     val: Number(d.d90     || 0), label: '90+ יום' },
          ];
          let cursor = 0;
          const total = segs.reduce((s, x) => s + x.val, 0);
          return (
            <g key={i}>
              {segs.map((s, si) => {
                const yTop = y(cursor + s.val);
                const hh = h(s.val);
                cursor += s.val;
                return (
                  <rect
                    key={si}
                    className="bi-hit"
                    x={cx(i) - barW / 2}
                    y={yTop}
                    width={barW}
                    height={Math.max(0, hh)}
                    fill={colors[s.key]}
                    tabIndex={0}
                    aria-label={`${d.label} ${s.label}: ${fmtILS(s.val)}`}
                    onMouseMove={(e) => show(e, {
                      title: d.label,
                      lines: [
                        ['נוכחי',   fmtILS(d.current)],
                        ['30 יום',  fmtILS(d.d30)],
                        ['60 יום',  fmtILS(d.d60)],
                        ['90+ יום', fmtILS(d.d90)],
                        ['סה"כ',   fmtILS(total)],
                      ],
                    })}
                    onMouseLeave={hide}
                    onClick={() => onDrillDown && onDrillDown('ar_aging', { ...d, segment: s.key })}
                  />
                );
              })}
              <text x={cx(i)} y={margin.top + ih + 18} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}

        <line className="bi-axis-line" x1={margin.left} x2={margin.left + iw} y1={margin.top + ih} y2={margin.top + ih} />
        <line className="bi-axis-line" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + ih} />
      </svg>
      <Tooltip tip={tip} />
      <div className="bi-legend">
        <span><span className="bi-sw" style={{ background: colors.current }} />נוכחי</span>
        <span><span className="bi-sw" style={{ background: colors.d30 }} />30 יום</span>
        <span><span className="bi-sw" style={{ background: colors.d60 }} />60 יום</span>
        <span><span className="bi-sw" style={{ background: colors.d90 }} />90+ יום</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Common: empty state + skeleton                                      */
/* ------------------------------------------------------------------ */
function EmptyState({ label }) {
  return (
    <div className="bi-empty" role="status">
      <div className="bi-empty-icon" aria-hidden="true">∅</div>
      <div>{label}</div>
      <div style={{ fontSize: 11, marginTop: 4, color: BI_THEME.textDim }}>No data available</div>
    </div>
  );
}

function ChartSkeleton({ height = 220 }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="bi-skeleton" style={{ height, width: '100%' }} />
      <div className="bi-skeleton" style={{ height: 10, width: '40%', marginTop: 10 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card wrapper                                                        */
/* ------------------------------------------------------------------ */
function Card({ title, subtitle, span = 6, children }) {
  return (
    <div className={`bi-card span-${span}`} role="region" aria-label={title}>
      <h3>{title}</h3>
      {subtitle && <div className="bi-card-sub">{subtitle}</div>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function BIDashboard({
  data,
  period = 'month',
  onPeriodChange,
  onDateRangeChange,
  onDrillDown,
  onExportPDF,
  loading = false,
  dateRange,
}) {
  const safeData = data || {};
  const [localPeriod, setLocalPeriod] = useState(period);
  const [localRange, setLocalRange] = useState(dateRange || { from: '', to: '' });

  const handlePeriod = useCallback((p) => {
    setLocalPeriod(p);
    if (onPeriodChange) onPeriodChange(p);
  }, [onPeriodChange]);

  const handleRange = useCallback((field, value) => {
    const next = { ...localRange, [field]: value };
    setLocalRange(next);
    if (onDateRangeChange) onDateRangeChange(next);
  }, [localRange, onDateRangeChange]);

  const handleExport = useCallback(() => {
    if (onExportPDF) onExportPDF();
  }, [onExportPDF]);

  const hasAnyData = useMemo(() => {
    const keys = ['revenue_trend', 'revenue_expenses', 'top_clients', 'cash_flow', 'employee_costs', 'ar_aging'];
    return keys.some(k => Array.isArray(safeData[k]) && safeData[k].length > 0);
  }, [safeData]);

  return (
    <div className="bi-root" data-testid="bi-dashboard" dir="rtl">
      <style>{biCSS}</style>

      {/* Top bar */}
      <div className="bi-topbar" role="toolbar" aria-label="בקרת דשבורד">
        <div>
          <h2>דשבורד BI — בינה עסקית</h2>
          <div className="bi-sub">Business Intelligence Dashboard · Techno-Kol</div>
        </div>
        <div className="bi-spacer" />

        <div
          className="bi-segmented"
          role="group"
          aria-label="בחירת תקופה"
        >
          <button
            className={localPeriod === 'month' ? 'active' : ''}
            onClick={() => handlePeriod('month')}
            aria-pressed={localPeriod === 'month'}
          >חודש</button>
          <button
            className={localPeriod === 'quarter' ? 'active' : ''}
            onClick={() => handlePeriod('quarter')}
            aria-pressed={localPeriod === 'quarter'}
          >רבעון</button>
          <button
            className={localPeriod === 'ytd' ? 'active' : ''}
            onClick={() => handlePeriod('ytd')}
            aria-pressed={localPeriod === 'ytd'}
          >מתחילת השנה</button>
        </div>

        <div className="bi-daterange" aria-label="טווח תאריכים">
          <span>מ־</span>
          <input
            type="date"
            value={localRange.from || ''}
            onChange={(e) => handleRange('from', e.target.value)}
            aria-label="מתאריך"
          />
          <span>עד</span>
          <input
            type="date"
            value={localRange.to || ''}
            onChange={(e) => handleRange('to', e.target.value)}
            aria-label="עד תאריך"
          />
        </div>

        <button
          className="bi-btn primary"
          onClick={handleExport}
          aria-label="ייצוא דשבורד ל-PDF"
        >ייצוא PDF</button>
      </div>

      {/* Grid */}
      {!hasAnyData && !loading ? (
        <div className="bi-card" role="status">
          <EmptyState label="אין נתונים להצגה בטווח הנבחר" />
        </div>
      ) : (
        <div className="bi-grid">
          <Card title="מגמת הכנסות" subtitle="Revenue trend · last 12 months" span={12}>
            {loading ? <ChartSkeleton height={240} /> :
              <RevenueTrendChart data={safeData.revenue_trend} onDrillDown={onDrillDown} />}
          </Card>

          <Card title="הכנסות מול הוצאות" subtitle="Revenue vs expenses" span={6}>
            {loading ? <ChartSkeleton /> :
              <RevenueExpensesChart data={safeData.revenue_expenses} onDrillDown={onDrillDown} />}
          </Card>

          <Card title="10 לקוחות מובילים" subtitle="Top 10 clients by revenue" span={6}>
            {loading ? <ChartSkeleton /> :
              <TopClientsChart data={safeData.top_clients} onDrillDown={onDrillDown} />}
          </Card>

          <Card title="תזרים מזומנים" subtitle="Cash flow waterfall" span={6}>
            {loading ? <ChartSkeleton /> :
              <CashFlowWaterfall data={safeData.cash_flow} onDrillDown={onDrillDown} />}
          </Card>

          <Card title="עלויות עובדים" subtitle="Employee cost distribution" span={6}>
            {loading ? <ChartSkeleton height={280} /> :
              <EmployeeCostsDonut data={safeData.employee_costs} onDrillDown={onDrillDown} />}
          </Card>

          <Card title="גיול חובות (AR Aging)" subtitle="Current / 30d / 60d / 90d+" span={12}>
            {loading ? <ChartSkeleton /> :
              <ARAgingChart data={safeData.ar_aging} onDrillDown={onDrillDown} />}
          </Card>
        </div>
      )}
    </div>
  );
}

/* Named exports for targeted testing */
export {
  RevenueTrendChart,
  RevenueExpensesChart,
  TopClientsChart,
  CashFlowWaterfall,
  EmployeeCostsDonut,
  ARAgingChart,
  EmptyState,
  ChartSkeleton,
  niceTicks,
};
