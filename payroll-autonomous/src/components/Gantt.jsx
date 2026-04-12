/**
 * Gantt.jsx — Agent X-24 (Swarm 3B)
 * Pure-SVG Gantt chart for Techno-Kol Uzi mega-ERP.
 *
 *  Features:
 *   - Horizontal time axis with day / week / month zoom
 *   - Vertical task list (label column)
 *   - Task bars colored by status
 *   - Dependency arrows (FS / SS / FF / SF)
 *   - "Today" vertical line
 *   - Milestone diamonds
 *   - Drag-and-drop reschedule (stub event hooks — no dep)
 *   - Hebrew RTL: time flows right-to-left, labels on the right
 *   - Palantir dark theme, zero external libs (no d3, no chart libs)
 *
 *  Props:
 *   tasks       : Array<{
 *                    id, title, title_he, start, end, duration,
 *                    progress, status, assignee, milestone?,
 *                    critical?, dependencies?: [{pred_id,type,lag}]
 *                  }>
 *   milestones? : Array<{ id, name, name_he, date, reached }>
 *   startDate?  : ISO yyyy-mm-dd (defaults to min(task.start))
 *   endDate?    : ISO yyyy-mm-dd (defaults to max(task.end))
 *   zoom?       : "day" | "week" | "month"  (default "day")
 *   language?   : "he" | "en"               (default "he")
 *   onTaskMove? : ({id, start, end}) => void
 *   onTaskClick?: (task) => void
 *   onZoomChange?: (zoom) => void
 *   height?     : number (default auto)
 *   rowHeight?  : number (default 34)
 *   theme?      : object  (overrides Palantir dark)
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Palantir dark theme                                                */
/* ------------------------------------------------------------------ */

const PALANTIR_DARK = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  border: '#232a33',
  borderSoft: '#1a2029',
  axis: '#2a323d',
  text: '#e6edf3',
  textDim: '#8b95a5',
  textMuted: '#5a6472',
  today: '#ffd76a',
  grid: '#1a2029',
  barPlanned: '#4a9eff',
  barActive: '#3ddc84',
  barBlocked: '#ff5c5c',
  barDone: '#7d8fa3',
  barCancelled: '#464f5c',
  barCritical: '#ff5c5c',
  barProgress: 'rgba(255,255,255,0.28)',
  arrow: '#8b95a5',
  arrowCritical: '#ff5c5c',
  milestone: '#ffd76a',
  labelCol: '#10141a',
  hover: '#1f2730',
};

const STATUS_COLORS = {
  planned: PALANTIR_DARK.barPlanned,
  active: PALANTIR_DARK.barActive,
  blocked: PALANTIR_DARK.barBlocked,
  done: PALANTIR_DARK.barDone,
  cancelled: PALANTIR_DARK.barCancelled,
};

const STATUS_LABEL_HE = {
  planned: 'מתוכנן',
  active: 'פעיל',
  blocked: 'חסום',
  done: 'הושלם',
  cancelled: 'בוטל',
};

/* ------------------------------------------------------------------ */
/*  Date helpers — zero deps                                           */
/* ------------------------------------------------------------------ */

const MS = 86400000;

function toDate(s) {
  if (s instanceof Date) return new Date(s.getTime());
  if (typeof s !== 'string') return new Date(NaN);
  return new Date(s.length === 10 ? s + 'T00:00:00Z' : s);
}
function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
function diffDays(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
}
function todayIso() {
  return fmtDate(new Date());
}
function minIso(a, b) { return toDate(a) < toDate(b) ? a : b; }
function maxIso(a, b) { return toDate(a) > toDate(b) ? a : b; }

const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];
const MONTH_NAMES_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/* ------------------------------------------------------------------ */
/*  Layout calc                                                        */
/* ------------------------------------------------------------------ */

const ZOOM_PX = { day: 26, week: 12, month: 5 };

function useChartGeom(tasks, props) {
  return useMemo(() => {
    const rowH = props.rowHeight || 34;
    const zoom = props.zoom || 'day';
    const pxPerDay = ZOOM_PX[zoom] || ZOOM_PX.day;

    const validTasks = tasks.filter((t) => t.start && t.end);
    if (!validTasks.length) {
      return {
        rowH, zoom, pxPerDay,
        start: props.startDate || todayIso(),
        end: props.endDate || todayIso(),
        days: 1, gridW: pxPerDay, gridH: rowH,
      };
    }

    let start = validTasks[0].start;
    let end = validTasks[0].end;
    for (const t of validTasks) {
      start = minIso(start, t.start);
      end = maxIso(end, t.end);
    }
    if (props.startDate) start = minIso(start, props.startDate);
    if (props.endDate) end = maxIso(end, props.endDate);

    // pad
    start = addDays(start, -2);
    end = addDays(end, 3);
    const days = Math.max(1, diffDays(start, end));

    return {
      rowH, zoom, pxPerDay,
      start, end, days,
      gridW: days * pxPerDay,
      gridH: tasks.length * rowH,
    };
  }, [tasks, props.rowHeight, props.zoom, props.startDate, props.endDate]);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function Gantt(props) {
  const {
    tasks = [],
    milestones = [],
    language = 'he',
    onTaskMove,
    onTaskClick,
    onZoomChange,
    theme: themeOverride,
    labelColWidth: lcw = 260,
  } = props;

  const theme = { ...PALANTIR_DARK, ...(themeOverride || {}) };
  const rtl = language === 'he';
  const isHe = language === 'he';

  const [zoom, setZoom] = useState(props.zoom || 'day');
  const [hoverId, setHoverId] = useState(null);
  const [drag, setDrag] = useState(null); // {id, startX, origStart, origEnd}

  const geom = useChartGeom(tasks, { ...props, zoom });
  const { rowH, pxPerDay, start, days, gridW, gridH } = geom;

  const headerH = 56;
  const chartW = Math.max(200, gridW);
  const chartH = Math.max(rowH, gridH) + headerH;

  const svgW = lcw + chartW + 4;
  const svgH = chartH + 4;

  /* ── Coordinate helpers (RTL aware) ─────────────────────── */
  //  In RTL mode, day 0 is at the RIGHT edge of the chart area.
  //  In LTR mode, day 0 is at the LEFT edge.
  const dayToX = useCallback((isoDate) => {
    const d = diffDays(start, isoDate);
    if (rtl) return lcw + chartW - d * pxPerDay;
    return lcw + d * pxPerDay;
  }, [start, pxPerDay, rtl, lcw, chartW]);

  const xToDay = useCallback((x) => {
    if (rtl) return Math.round((lcw + chartW - x) / pxPerDay);
    return Math.round((x - lcw) / pxPerDay);
  }, [pxPerDay, rtl, lcw, chartW]);

  /* ── Drag handlers (stub — emit onTaskMove) ────────────── */
  const onMouseDown = (e, t) => {
    if (!onTaskMove) return;
    const x = e.clientX;
    setDrag({ id: t.id, startX: x, origStart: t.start, origEnd: t.end });
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dDays = Math.round((rtl ? -dx : dx) / pxPerDay);
    if (dDays === 0) return;
    const preview = {
      id: drag.id,
      start: addDays(drag.origStart, dDays),
      end: addDays(drag.origEnd, dDays),
    };
    // live preview only — final commit on mouseup
    setDrag({ ...drag, preview });
  };
  const onMouseUp = () => {
    if (drag && drag.preview && onTaskMove) {
      onTaskMove(drag.preview);
    }
    setDrag(null);
  };

  /* ── Zoom buttons ──────────────────────────────────────── */
  const setZ = (z) => {
    setZoom(z);
    if (onZoomChange) onZoomChange(z);
  };

  /* ── Header ticks ──────────────────────────────────────── */
  const ticks = useMemo(() => {
    const out = [];
    if (zoom === 'day') {
      for (let i = 0; i <= days; i++) {
        const iso = addDays(start, i);
        const d = toDate(iso);
        out.push({
          iso,
          major: d.getUTCDate() === 1,
          label: d.getUTCDate().toString(),
          sub: isHe
            ? `${MONTH_NAMES_HE[d.getUTCMonth()]}`
            : `${MONTH_NAMES_EN[d.getUTCMonth()]}`,
        });
      }
    } else if (zoom === 'week') {
      for (let i = 0; i <= days; i += 7) {
        const iso = addDays(start, i);
        const d = toDate(iso);
        out.push({
          iso, major: true,
          label: (isHe ? 'שבוע ' : 'W') + Math.ceil((d.getUTCDate()) / 7),
          sub: isHe ? MONTH_NAMES_HE[d.getUTCMonth()] : MONTH_NAMES_EN[d.getUTCMonth()],
        });
      }
    } else {
      let d = toDate(start);
      d.setUTCDate(1);
      while (d < toDate(addDays(start, days))) {
        const iso = fmtDate(d);
        out.push({
          iso, major: true,
          label: isHe ? MONTH_NAMES_HE[d.getUTCMonth()] : MONTH_NAMES_EN[d.getUTCMonth()],
          sub: d.getUTCFullYear().toString(),
        });
        d.setUTCMonth(d.getUTCMonth() + 1);
      }
    }
    return out;
  }, [zoom, days, start, isHe]);

  /* ── Container styles ──────────────────────────────────── */
  const containerStyle = {
    direction: rtl ? 'rtl' : 'ltr',
    background: theme.bg,
    color: theme.text,
    fontFamily: isHe
      ? "'Segoe UI', 'Noto Sans Hebrew', 'Arial Hebrew', Arial, sans-serif"
      : "'Segoe UI', 'Inter', Arial, sans-serif",
    fontSize: 12,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    overflow: 'auto',
    position: 'relative',
    maxHeight: props.height || 600,
    maxWidth: '100%',
  };

  const toolbarStyle = {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    background: theme.panel,
    borderBottom: `1px solid ${theme.border}`,
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 5,
  };
  const btn = (active) => ({
    background: active ? theme.barPlanned : theme.panelAlt,
    color: active ? '#fff' : theme.text,
    border: `1px solid ${active ? theme.barPlanned : theme.border}`,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    borderRadius: 4,
    fontFamily: 'inherit',
  });

  /* ── Task rows (WBS list on the right in RTL) ───────────── */
  const rows = tasks.map((t, i) => {
    const y = headerH + i * rowH;
    const effStart = drag && drag.preview && drag.id === t.id ? drag.preview.start : t.start;
    const effEnd = drag && drag.preview && drag.id === t.id ? drag.preview.end : t.end;
    const x1 = dayToX(effStart);
    const x2 = dayToX(effEnd);
    const barX = Math.min(x1, x2);
    const barW = Math.max(pxPerDay * 0.4, Math.abs(x2 - x1));
    const isHover = hoverId === t.id;
    const color = t.critical
      ? theme.barCritical
      : (STATUS_COLORS[t.status] || theme.barPlanned);

    const label = isHe ? (t.title_he || t.title) : t.title;

    return {
      task: t, i, y, x1, x2, barX, barW,
      color, isHover, label,
    };
  });

  /* ── Dependency arrow paths ───────────────────────────── */
  const taskById = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.task.id, r));
    return m;
  }, [rows]);

  const arrows = [];
  for (const r of rows) {
    const deps = r.task.dependencies || [];
    for (const d of deps) {
      const predRow = taskById.get(d.pred_id || d);
      if (!predRow) continue;
      const type = (d.type || 'FS').toUpperCase();

      // In RTL mode the "right" side of a bar (later time) is its start in x-space → x1.
      // In LTR mode the "right" side (later time) is x2.
      // Use start/end in x-space independent of orientation.
      const predStartX = Math.min(predRow.x1, predRow.x2);
      const predEndX = Math.max(predRow.x1, predRow.x2);
      const succStartX = Math.min(r.x1, r.x2);
      const succEndX = Math.max(r.x1, r.x2);

      const predMidY = predRow.y + rowH / 2;
      const succMidY = r.y + rowH / 2;

      let fromX, toX;
      if (rtl) {
        // RTL: time flows right→left. Bar "end" (later time) is on the LEFT visually.
        const predVisEnd = predStartX;   // smaller x = later time
        const predVisStart = predEndX;
        const succVisStart = succEndX;
        const succVisEnd = succStartX;
        switch (type) {
          case 'FS': fromX = predVisEnd; toX = succVisStart; break;
          case 'SS': fromX = predVisStart; toX = succVisStart; break;
          case 'FF': fromX = predVisEnd; toX = succVisEnd; break;
          case 'SF': fromX = predVisStart; toX = succVisEnd; break;
          default: fromX = predVisEnd; toX = succVisStart;
        }
      } else {
        switch (type) {
          case 'FS': fromX = predEndX; toX = succStartX; break;
          case 'SS': fromX = predStartX; toX = succStartX; break;
          case 'FF': fromX = predEndX; toX = succEndX; break;
          case 'SF': fromX = predStartX; toX = succEndX; break;
          default: fromX = predEndX; toX = succStartX;
        }
      }

      const color = predRow.task.critical && r.task.critical
        ? theme.arrowCritical : theme.arrow;
      arrows.push({
        key: `${predRow.task.id}->${r.task.id}-${type}`,
        fromX, toX, fromY: predMidY, toY: succMidY, color,
      });
    }
  }

  /* ── Today line ──────────────────────────────────────── */
  const today = todayIso();
  const todayX = (() => {
    const d = diffDays(start, today);
    if (d < 0 || d > days) return null;
    return dayToX(today);
  })();

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div
      style={containerStyle}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      dir={rtl ? 'rtl' : 'ltr'}
    >
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <div style={{ color: theme.textDim, fontWeight: 600 }}>
          {isHe ? 'תרשים גאנט — פרויקטים' : 'Gantt — Projects'}
          <span style={{ color: theme.textMuted, marginInlineStart: 8, fontWeight: 400 }}>
            ({tasks.length} {isHe ? 'משימות' : 'tasks'})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btn(zoom === 'day')} onClick={() => setZ('day')}>
            {isHe ? 'יום' : 'Day'}
          </button>
          <button style={btn(zoom === 'week')} onClick={() => setZ('week')}>
            {isHe ? 'שבוע' : 'Week'}
          </button>
          <button style={btn(zoom === 'month')} onClick={() => setZ('month')}>
            {isHe ? 'חודש' : 'Month'}
          </button>
        </div>
      </div>

      {/* SVG chart */}
      <svg
        width={svgW}
        height={svgH}
        style={{ display: 'block', background: theme.bg }}
      >
        <defs>
          <marker
            id="gantt-arrow-head"
            markerWidth="8" markerHeight="8"
            refX="6" refY="4" orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L6,4 L0,8 Z" fill={theme.arrow} />
          </marker>
          <marker
            id="gantt-arrow-head-critical"
            markerWidth="8" markerHeight="8"
            refX="6" refY="4" orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L6,4 L0,8 Z" fill={theme.arrowCritical} />
          </marker>
          <pattern id="gantt-stripe" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="transparent" />
            <path d="M0,6 L6,0" stroke={theme.barProgress} strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Label column (task list) */}
        <rect
          x={rtl ? chartW : 0}
          y={0}
          width={lcw}
          height={chartH}
          fill={theme.labelCol}
          stroke={theme.border}
        />
        <text
          x={(rtl ? chartW : 0) + 10}
          y={20}
          fill={theme.textDim}
          fontSize={11}
          fontWeight={600}
        >
          {isHe ? 'WBS' : 'WBS'}
        </text>
        <text
          x={(rtl ? chartW : 0) + 56}
          y={20}
          fill={theme.textDim}
          fontSize={11}
          fontWeight={600}
        >
          {isHe ? 'משימה' : 'Task'}
        </text>
        <text
          x={(rtl ? chartW : 0) + lcw - 60}
          y={20}
          fill={theme.textDim}
          fontSize={11}
          fontWeight={600}
        >
          %
        </text>

        {/* Row backgrounds */}
        {rows.map((r) => (
          <g key={`row-bg-${r.task.id}`}>
            <rect
              x={0}
              y={r.y}
              width={svgW}
              height={rowH}
              fill={r.i % 2 === 0 ? theme.bg : theme.panelAlt}
              opacity={0.5}
            />
            {r.isHover && (
              <rect
                x={0} y={r.y}
                width={svgW} height={rowH}
                fill={theme.hover}
                opacity={0.6}
              />
            )}
          </g>
        ))}

        {/* Row labels */}
        {rows.map((r) => (
          <g key={`label-${r.task.id}`}>
            <text
              x={(rtl ? chartW : 0) + 10}
              y={r.y + rowH / 2 + 4}
              fill={theme.textDim}
              fontSize={10}
            >
              {r.task.wbs || ''}
            </text>
            <text
              x={(rtl ? chartW : 0) + 56}
              y={r.y + rowH / 2 + 4}
              fill={theme.text}
              fontSize={12}
            >
              {truncate(r.label, 22)}
            </text>
            <text
              x={(rtl ? chartW : 0) + lcw - 60}
              y={r.y + rowH / 2 + 4}
              fill={theme.textDim}
              fontSize={11}
            >
              {Math.round(r.task.progress || 0)}%
            </text>
          </g>
        ))}

        {/* Header band */}
        <rect
          x={rtl ? 0 : lcw}
          y={0}
          width={chartW}
          height={headerH}
          fill={theme.panel}
          stroke={theme.border}
        />
        {ticks.map((t, i) => {
          const x = dayToX(t.iso);
          return (
            <g key={`tick-${i}`}>
              <line
                x1={x} y1={0}
                x2={x} y2={chartH}
                stroke={t.major ? theme.axis : theme.grid}
                strokeWidth={t.major ? 1 : 0.5}
              />
              <text
                x={x + (rtl ? -4 : 4)}
                y={22}
                fill={theme.text}
                fontSize={11}
                fontWeight={t.major ? 600 : 400}
                textAnchor={rtl ? 'end' : 'start'}
              >
                {t.label}
              </text>
              {t.sub && (
                <text
                  x={x + (rtl ? -4 : 4)}
                  y={40}
                  fill={theme.textMuted}
                  fontSize={9}
                  textAnchor={rtl ? 'end' : 'start'}
                >
                  {t.sub}
                </text>
              )}
            </g>
          );
        })}

        {/* Today line */}
        {todayX != null && (
          <g>
            <line
              x1={todayX} y1={0}
              x2={todayX} y2={chartH}
              stroke={theme.today}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={todayX + (rtl ? -6 : 6)}
              y={52}
              fill={theme.today}
              fontSize={10}
              fontWeight={600}
              textAnchor={rtl ? 'end' : 'start'}
            >
              {isHe ? 'היום' : 'Today'}
            </text>
          </g>
        )}

        {/* Task bars */}
        {rows.map((r) => {
          const { task } = r;
          if (task.milestone) {
            const cx = (r.barX + r.barW / 2);
            const cy = r.y + rowH / 2;
            const s = 10;
            return (
              <g
                key={`ms-${task.id}`}
                onMouseEnter={() => setHoverId(task.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => onTaskClick && onTaskClick(task)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
                  fill={theme.milestone}
                  stroke={theme.text}
                  strokeWidth={1}
                />
                <title>
                  {(isHe ? 'אבן דרך: ' : 'Milestone: ') + r.label}
                </title>
              </g>
            );
          }
          return (
            <g
              key={`bar-${task.id}`}
              onMouseEnter={() => setHoverId(task.id)}
              onMouseLeave={() => setHoverId(null)}
              onMouseDown={(e) => onMouseDown(e, task)}
              onClick={() => onTaskClick && onTaskClick(task)}
              style={{ cursor: onTaskMove ? 'grab' : 'pointer' }}
            >
              <rect
                x={r.barX}
                y={r.y + 6}
                width={r.barW}
                height={rowH - 12}
                rx={3}
                fill={r.color}
                stroke={task.critical ? theme.barCritical : theme.border}
                strokeWidth={task.critical ? 1.5 : 0.5}
                opacity={task.status === 'cancelled' ? 0.4 : 0.92}
              />
              {/* Progress overlay */}
              {task.progress > 0 && (
                <rect
                  x={r.barX}
                  y={r.y + 6}
                  width={r.barW * clamp(task.progress / 100, 0, 1)}
                  height={rowH - 12}
                  rx={3}
                  fill="url(#gantt-stripe)"
                  pointerEvents="none"
                />
              )}
              {/* In-bar text */}
              <text
                x={r.barX + (rtl ? r.barW - 6 : 6)}
                y={r.y + rowH / 2 + 4}
                fill="#0b0d10"
                fontSize={10}
                fontWeight={600}
                textAnchor={rtl ? 'end' : 'start'}
                pointerEvents="none"
              >
                {truncate(r.label, Math.max(4, Math.floor(r.barW / 7)))}
              </text>
              <title>
                {`${r.label}\n${task.start} → ${task.end}\n` +
                  (isHe ? 'סטטוס: ' : 'Status: ') +
                  (isHe ? (STATUS_LABEL_HE[task.status] || task.status) : task.status) +
                  `\n${isHe ? 'התקדמות' : 'Progress'}: ${Math.round(task.progress || 0)}%` +
                  (task.critical ? (isHe ? '\n*** נתיב קריטי ***' : '\n*** Critical Path ***') : '')}
              </title>
            </g>
          );
        })}

        {/* Dependency arrows — drawn on top */}
        {arrows.map((a) => {
          const midY = (a.fromY + a.toY) / 2;
          const d = `M${a.fromX},${a.fromY}
                     L${a.fromX},${midY}
                     L${a.toX},${midY}
                     L${a.toX},${a.toY}`;
          return (
            <path
              key={a.key}
              d={d}
              fill="none"
              stroke={a.color}
              strokeWidth={1.3}
              markerEnd={`url(#gantt-arrow-head${a.color === theme.arrowCritical ? '-critical' : ''})`}
              opacity={0.85}
            />
          );
        })}

        {/* External milestones layer (date-based deliverables) */}
        {milestones.map((m) => {
          const x = dayToX(m.date);
          return (
            <g key={`extm-${m.id}`}>
              <line
                x1={x} y1={headerH}
                x2={x} y2={chartH}
                stroke={theme.milestone}
                strokeWidth={0.8}
                strokeDasharray="2 2"
                opacity={0.55}
              />
              <polygon
                points={`${x},${headerH - 6} ${x + 6},${headerH} ${x},${headerH + 6} ${x - 6},${headerH}`}
                fill={m.reached ? theme.barActive : theme.milestone}
                stroke={theme.text}
                strokeWidth={0.8}
              />
              <title>
                {(isHe ? 'אבן דרך: ' : 'Milestone: ') +
                  (isHe ? (m.name_he || m.name) : m.name) +
                  ` (${m.date})` +
                  (m.reached ? (isHe ? ' — הושג' : ' — reached') : '')}
              </title>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{
        padding: '6px 12px',
        borderTop: `1px solid ${theme.border}`,
        display: 'flex',
        gap: 14,
        fontSize: 11,
        color: theme.textDim,
        background: theme.panel,
        flexWrap: 'wrap',
      }}>
        <LegendChip color={STATUS_COLORS.planned} label={isHe ? 'מתוכנן' : 'Planned'} />
        <LegendChip color={STATUS_COLORS.active} label={isHe ? 'פעיל' : 'Active'} />
        <LegendChip color={STATUS_COLORS.blocked} label={isHe ? 'חסום' : 'Blocked'} />
        <LegendChip color={STATUS_COLORS.done} label={isHe ? 'הושלם' : 'Done'} />
        <LegendChip color={theme.barCritical} label={isHe ? 'נתיב קריטי' : 'Critical path'} />
        <LegendChip color={theme.milestone} label={isHe ? 'אבן דרך' : 'Milestone'} diamond />
        <LegendChip color={theme.today} label={isHe ? 'היום' : 'Today'} line />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend chip (pure CSS)                                             */
/* ------------------------------------------------------------------ */

function LegendChip({ color, label, diamond, line }) {
  const sw = {
    width: 14, height: 10,
    background: color,
    borderRadius: 2,
    display: 'inline-block',
    marginInlineEnd: 4,
    verticalAlign: 'middle',
  };
  const swDiamond = {
    width: 10, height: 10,
    background: color,
    transform: 'rotate(45deg)',
    display: 'inline-block',
    marginInlineEnd: 6,
    verticalAlign: 'middle',
  };
  const swLine = {
    display: 'inline-block',
    width: 18, height: 0,
    borderTop: `2px dashed ${color}`,
    marginInlineEnd: 4,
    verticalAlign: 'middle',
  };
  return (
    <span>
      <span style={diamond ? swDiamond : (line ? swLine : sw)} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Tiny utils                                                         */
/* ------------------------------------------------------------------ */

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

export default Gantt;
export { Gantt, PALANTIR_DARK, STATUS_COLORS };
