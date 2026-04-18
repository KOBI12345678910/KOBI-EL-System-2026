/**
 * AuditTrail.jsx — Agent 98
 * Read-only timeline of system actions for Techno-Kol Uzi mega-ERP.
 *
 * Palantir dark theme, Hebrew RTL, bilingual.
 * Zero external UI libs — inline styles only.
 *
 * Props:
 *   fetchEvents : async ({from,to,user,action,resource,search,page,limit}) =>
 *                 { events: AuditEvent[], total: number, page: number }
 *   onExport    : async (filters) => void
 *   theme       : "dark" (default) | "light"
 *
 * AuditEvent shape (expected from backend /api/audit/events):
 *   {
 *     id, timestamp, actorName, actorIdLast4, actionType, resourceType,
 *     resourceId, severity, ip, userAgent, before, after, message
 *   }
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Theme — Palantir dark                                              */
/* ------------------------------------------------------------------ */

const PALANTIR_DARK = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  border: '#232a33',
  borderSoft: '#1a2029',
  accent: '#4a9eff',
  accentSoft: 'rgba(74,158,255,0.12)',
  text: '#e6edf3',
  textDim: '#8b95a5',
  textMuted: '#5a6472',
  info: '#4a9eff',
  warn: '#f5a623',
  critical: '#ff5c5c',
  success: '#3ddc84',
  rowHover: '#1b2028',
  rowSelected: '#1f2730',
  highlight: '#ffd76a',
};

/* ------------------------------------------------------------------ */
/*  Hebrew labels                                                      */
/* ------------------------------------------------------------------ */

const HE = {
  title: 'יומן ביקורת מערכתי',
  subtitle: 'Audit Trail — תיעוד מלא של כל הפעולות במערכת',
  filters: 'סינון',
  from: 'מתאריך',
  to: 'עד תאריך',
  user: 'משתמש',
  action: 'סוג פעולה',
  resource: 'משאב',
  search: 'חיפוש חופשי',
  searchPlaceholder: 'חיפוש בטקסט, שם משתמש, מזהה…',
  apply: 'החל',
  reset: 'איפוס',
  export: 'ייצוא ל־CSV',
  exporting: 'מייצא…',
  loading: 'טוען רישומים…',
  empty: 'אין רישומי ביקורת',
  emptyHint: 'לא נמצאו רישומים התואמים את הסינון הנוכחי',
  error: 'שגיאה בטעינת הנתונים',
  retry: 'נסה שוב',
  total: 'סה״כ רישומים',
  showing: 'מציג',
  of: 'מתוך',
  page: 'עמוד',
  next: 'הבא',
  prev: 'הקודם',
  expand: 'הרחב לצפייה מלאה',
  collapse: 'סגור',
  before: 'לפני (before)',
  after: 'אחרי (after)',
  diff: 'השוואת שינויים',
  actor: 'מבצע',
  idLast4: 'ת.ז סיום',
  when: 'מועד',
  ip: 'כתובת IP',
  ua: 'דפדפן / מכשיר',
  severity: 'חומרה',
  info: 'מידע',
  warning: 'אזהרה',
  critical: 'קריטי',
  all: 'הכל',
  create: 'יצירה',
  update: 'עדכון',
  delete: 'מחיקה',
  view: 'צפייה',
  invoice: 'חשבונית',
  wageSlip: 'תלוש שכר',
  employee: 'עובד',
  report: 'דוח',
  config: 'הגדרות',
  ariaTimeline: 'ציר זמן של פעולות מערכת',
  ariaFilter: 'סינון רישומי ביקורת',
  ariaRow: 'שורת רישום',
  ariaExpanded: 'שורה פתוחה',
  ariaCollapsed: 'שורה סגורה',
};

/* ------------------------------------------------------------------ */
/*  Enum option lists                                                  */
/* ------------------------------------------------------------------ */

const ACTION_OPTIONS = [
  { value: '', label: HE.all },
  { value: 'create', label: HE.create },
  { value: 'update', label: HE.update },
  { value: 'delete', label: HE.delete },
  { value: 'view', label: HE.view },
];

const RESOURCE_OPTIONS = [
  { value: '', label: HE.all },
  { value: 'invoice', label: HE.invoice },
  { value: 'wage-slip', label: HE.wageSlip },
  { value: 'employee', label: HE.employee },
  { value: 'report', label: HE.report },
  { value: 'config', label: HE.config },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const JERUSALEM_TZ = 'Asia/Jerusalem';

function fmtJerusalem(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: JERUSALEM_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return String(ts);
  }
}

function severityColor(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical' || s === 'error') return PALANTIR_DARK.critical;
  if (s === 'warning' || s === 'warn') return PALANTIR_DARK.warn;
  return PALANTIR_DARK.info;
}

function severityLabel(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical' || s === 'error') return HE.critical;
  if (s === 'warning' || s === 'warn') return HE.warning;
  return HE.info;
}

// Detect Hebrew characters for inline highlight
const HEBREW_RE = /[\u0590-\u05FF]+/g;

function highlightHebrew(text) {
  if (text == null) return null;
  const str = String(text);
  if (!HEBREW_RE.test(str)) return str;
  HEBREW_RE.lastIndex = 0;
  const parts = [];
  let last = 0;
  let m;
  const re = /[\u0590-\u05FF]+/g;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    parts.push(
      <span
        key={`he-${m.index}`}
        style={{
          color: PALANTIR_DARK.highlight,
          fontWeight: 600,
          direction: 'rtl',
        }}
      >
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

function buildCSV(events) {
  const header = [
    'id',
    'timestamp_jerusalem',
    'actor_name',
    'actor_id_last4',
    'action_type',
    'resource_type',
    'resource_id',
    'severity',
    'ip',
    'user_agent',
    'message',
  ];
  const rows = events.map((e) =>
    [
      e.id,
      fmtJerusalem(e.timestamp),
      e.actorName || '',
      e.actorIdLast4 || '',
      e.actionType || '',
      e.resourceType || '',
      e.resourceId || '',
      e.severity || 'info',
      e.ip || '',
      (e.userAgent || '').replace(/"/g, "'"),
      (e.message || '').replace(/"/g, "'"),
    ]
      .map((c) => `"${String(c).replace(/\n/g, ' ')}"`)
      .join(',')
  );
  return '\uFEFF' + [header.join(','), ...rows].join('\n');
}

function downloadCSV(csv, filename = 'audit-trail.csv') {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AuditTrail] CSV download failed', err);
  }
}

/* ------------------------------------------------------------------ */
/*  Built-in mock fetcher — used when no fetchEvents prop is given    */
/* ------------------------------------------------------------------ */

function mockActor(i) {
  const names = [
    'קובי אלבז',
    'שרה כהן',
    'דוד לוי',
    'רחל מזרחי',
    'משה פרץ',
    'נועה בר',
  ];
  return names[i % names.length];
}

function mockAction(i) {
  return ['create', 'update', 'delete', 'view'][i % 4];
}

function mockResource(i) {
  return ['invoice', 'wage-slip', 'employee', 'report', 'config'][i % 5];
}

function mockSeverity(i) {
  return ['info', 'info', 'info', 'warning', 'critical'][i % 5];
}

function makeMockEvent(i) {
  const action = mockAction(i);
  const resource = mockResource(i);
  const sev = mockSeverity(i);
  const base = Date.now() - i * 60_000;
  return {
    id: `evt-${10000 + i}`,
    timestamp: new Date(base).toISOString(),
    actorName: mockActor(i),
    actorIdLast4: String(1000 + (i % 9000)).slice(-4),
    actionType: action,
    resourceType: resource,
    resourceId: `${resource}-${1000 + i}`,
    severity: sev,
    ip: `10.0.${(i * 7) % 255}.${(i * 13) % 255}`,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechnoKol/2026',
    message: `${action === 'create' ? 'נוצר' : action === 'update' ? 'עודכן' : action === 'delete' ? 'נמחק' : 'נצפה'} ${resource} #${1000 + i}`,
    before:
      action === 'create'
        ? null
        : { status: 'draft', amount: 1000 + i, note: 'טיוטה ראשונית' },
    after:
      action === 'delete'
        ? null
        : {
            status: 'approved',
            amount: 1000 + i + 250,
            note: 'אושר סופית',
          },
  };
}

async function defaultMockFetch({
  from,
  to,
  user,
  action,
  resource,
  search,
  page = 1,
  limit = 50,
}) {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 180));
  const total = 10234;
  const all = Array.from({ length: 500 }, (_, i) => makeMockEvent(i));
  const filtered = all.filter((e) => {
    if (action && e.actionType !== action) return false;
    if (resource && e.resourceType !== resource) return false;
    if (user && !(e.actorName + e.actorIdLast4).includes(user)) return false;
    if (search) {
      const needle = String(search).toLowerCase();
      const hay = JSON.stringify(e).toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (from) {
      if (new Date(e.timestamp) < new Date(from)) return false;
    }
    if (to) {
      if (new Date(e.timestamp) > new Date(to)) return false;
    }
    return true;
  });
  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit);
  return { events: slice, total, page };
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Filter bar                                          */
/* ------------------------------------------------------------------ */

function FilterBar({ filters, setFilters, onApply, onReset, onExport, exporting }) {
  const input = {
    background: PALANTIR_DARK.panelAlt,
    color: PALANTIR_DARK.text,
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    minWidth: 120,
    direction: 'rtl',
    textAlign: 'right',
  };
  const label = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11,
    color: PALANTIR_DARK.textDim,
  };
  const btn = {
    background: PALANTIR_DARK.accent,
    color: '#ffffff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  };
  const btnGhost = {
    ...btn,
    background: 'transparent',
    color: PALANTIR_DARK.textDim,
    border: `1px solid ${PALANTIR_DARK.border}`,
  };

  return (
    <section
      role="region"
      aria-label={HE.ariaFilter}
      style={{
        background: PALANTIR_DARK.panel,
        border: `1px solid ${PALANTIR_DARK.border}`,
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-end',
      }}
    >
      <label style={label}>
        {HE.from}
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          style={input}
          aria-label={HE.from}
        />
      </label>
      <label style={label}>
        {HE.to}
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          style={input}
          aria-label={HE.to}
        />
      </label>
      <label style={label}>
        {HE.user}
        <input
          type="text"
          value={filters.user}
          onChange={(e) => setFilters({ ...filters, user: e.target.value })}
          style={input}
          placeholder="שם / ת.ז"
          aria-label={HE.user}
        />
      </label>
      <label style={label}>
        {HE.action}
        <select
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          style={input}
          aria-label={HE.action}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label style={label}>
        {HE.resource}
        <select
          value={filters.resource}
          onChange={(e) => setFilters({ ...filters, resource: e.target.value })}
          style={input}
          aria-label={HE.resource}
        >
          {RESOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...label, flex: 1, minWidth: 200 }}>
        {HE.search}
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          style={{ ...input, minWidth: 180, width: '100%' }}
          placeholder={HE.searchPlaceholder}
          aria-label={HE.search}
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onApply} style={btn} aria-label={HE.apply}>
          {HE.apply}
        </button>
        <button
          type="button"
          onClick={onReset}
          style={btnGhost}
          aria-label={HE.reset}
        >
          {HE.reset}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          style={{
            ...btn,
            background: exporting ? PALANTIR_DARK.textMuted : PALANTIR_DARK.success,
            cursor: exporting ? 'wait' : 'pointer',
          }}
          aria-label={HE.export}
        >
          {exporting ? HE.exporting : HE.export}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Diff viewer                                         */
/* ------------------------------------------------------------------ */

function DiffBlock({ title, data, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: PALANTIR_DARK.bg,
        border: `1px solid ${PALANTIR_DARK.borderSoft}`,
        borderRadius: 6,
        padding: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color,
          marginBottom: 6,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: PALANTIR_DARK.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          direction: 'ltr',
          textAlign: 'left',
          maxHeight: 260,
          overflowY: 'auto',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {data == null ? '— (null) —' : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function ExpandedDetails({ event }) {
  return (
    <div
      role="region"
      aria-label={HE.ariaExpanded}
      style={{
        background: PALANTIR_DARK.panelAlt,
        borderTop: `1px solid ${PALANTIR_DARK.border}`,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <Kv k={HE.actor} v={highlightHebrew(event.actorName)} />
        <Kv k={HE.idLast4} v={event.actorIdLast4 || '—'} />
        <Kv k={HE.when} v={fmtJerusalem(event.timestamp)} />
        <Kv k={HE.ip} v={event.ip || '—'} />
        <Kv k={HE.ua} v={event.userAgent || '—'} mono />
        <Kv k={HE.severity} v={severityLabel(event.severity)} color={severityColor(event.severity)} />
      </div>

      <div
        style={{
          fontSize: 11,
          color: PALANTIR_DARK.textDim,
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {HE.diff}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <DiffBlock
          title={HE.before}
          data={event.before}
          color={PALANTIR_DARK.warn}
        />
        <DiffBlock
          title={HE.after}
          data={event.after}
          color={PALANTIR_DARK.success}
        />
      </div>
    </div>
  );
}

function Kv({ k, v, color, mono }) {
  return (
    <div>
      <div style={{ color: PALANTIR_DARK.textDim, fontSize: 10, marginBottom: 2 }}>
        {k}
      </div>
      <div
        style={{
          color: color || PALANTIR_DARK.text,
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
            : 'inherit',
          wordBreak: 'break-word',
          fontSize: mono ? 11 : 12,
        }}
      >
        {v}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Virtual scroll helpers                                             */
/* ------------------------------------------------------------------ */

const ROW_HEIGHT = 56; // collapsed
const ROW_HEIGHT_EXPANDED = 440;
const OVERSCAN = 6;

function useVirtual(rowCount, expandedSet) {
  const scrollerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewport(el.clientHeight || 600);
    el.addEventListener('scroll', onScroll, { passive: true });
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Compute cumulative offsets respecting expanded rows
  const offsets = useMemo(() => {
    const arr = new Array(rowCount + 1);
    arr[0] = 0;
    for (let i = 0; i < rowCount; i++) {
      const h = expandedSet.has(i) ? ROW_HEIGHT_EXPANDED : ROW_HEIGHT;
      arr[i + 1] = arr[i] + h;
    }
    return arr;
  }, [rowCount, expandedSet]);

  const totalHeight = offsets[rowCount] || 0;

  const startIdx = useMemo(() => {
    // binary search for scrollTop
    let lo = 0;
    let hi = rowCount;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] < scrollTop) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1 - OVERSCAN);
  }, [offsets, scrollTop, rowCount]);

  const endIdx = useMemo(() => {
    const viewBottom = scrollTop + viewport;
    let lo = startIdx;
    let hi = rowCount;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] < viewBottom) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(rowCount, lo + OVERSCAN);
  }, [offsets, scrollTop, viewport, startIdx, rowCount]);

  return { scrollerRef, offsets, totalHeight, startIdx, endIdx };
}

/* ------------------------------------------------------------------ */
/*  Sub-component: Row                                                 */
/* ------------------------------------------------------------------ */

function EventRow({
  event,
  index,
  expanded,
  focused,
  onToggle,
  onFocus,
  offsetTop,
}) {
  const sevColor = severityColor(event.severity);
  const actionBadge = {
    create: { bg: 'rgba(61,220,132,0.15)', color: '#3ddc84' },
    update: { bg: 'rgba(74,158,255,0.15)', color: '#4a9eff' },
    delete: { bg: 'rgba(255,92,92,0.15)', color: '#ff5c5c' },
    view: { bg: 'rgba(139,149,165,0.15)', color: '#8b95a5' },
  }[event.actionType] || { bg: 'rgba(139,149,165,0.15)', color: '#8b95a5' };

  return (
    <div
      role="row"
      aria-label={HE.ariaRow}
      aria-expanded={expanded}
      tabIndex={focused ? 0 : -1}
      data-row-index={index}
      onClick={() => onToggle(index)}
      onFocus={() => onFocus(index)}
      style={{
        position: 'absolute',
        top: offsetTop,
        left: 0,
        right: 0,
        background: focused ? PALANTIR_DARK.rowSelected : PALANTIR_DARK.panel,
        borderBottom: `1px solid ${PALANTIR_DARK.borderSoft}`,
        borderRight: `3px solid ${sevColor}`,
        cursor: 'pointer',
        transition: 'background 0.1s',
        outline: focused ? `1px solid ${PALANTIR_DARK.accent}` : 'none',
      }}
    >
      {/* Collapsed row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          height: ROW_HEIGHT - 1,
          boxSizing: 'border-box',
        }}
      >
        {/* Timeline dot */}
        <div
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: sevColor,
            boxShadow: `0 0 0 3px ${PALANTIR_DARK.bg}, 0 0 0 4px ${sevColor}55`,
            flexShrink: 0,
          }}
        />

        {/* Timestamp */}
        <div
          style={{
            fontSize: 11,
            color: PALANTIR_DARK.textDim,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            minWidth: 150,
            direction: 'ltr',
            textAlign: 'left',
          }}
        >
          {fmtJerusalem(event.timestamp)}
        </div>

        {/* Action badge */}
        <span
          style={{
            background: actionBadge.bg,
            color: actionBadge.color,
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            minWidth: 52,
            textAlign: 'center',
          }}
        >
          {event.actionType}
        </span>

        {/* Resource */}
        <span
          style={{
            color: PALANTIR_DARK.accent,
            fontSize: 12,
            fontWeight: 600,
            minWidth: 90,
          }}
        >
          {event.resourceType}
        </span>

        {/* Message */}
        <div
          style={{
            flex: 1,
            color: PALANTIR_DARK.text,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {highlightHebrew(event.message)}
        </div>

        {/* Actor */}
        <div
          style={{
            color: PALANTIR_DARK.textDim,
            fontSize: 11,
            minWidth: 140,
            textAlign: 'left',
          }}
        >
          {highlightHebrew(event.actorName)}{' '}
          <span style={{ color: PALANTIR_DARK.textMuted }}>
            (***{event.actorIdLast4})
          </span>
        </div>

        {/* Expand chevron */}
        <div
          aria-hidden="true"
          style={{
            color: PALANTIR_DARK.textDim,
            fontSize: 14,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            width: 16,
            textAlign: 'center',
          }}
        >
          ▸
        </div>
      </div>

      {/* Expanded content */}
      {expanded && <ExpandedDetails event={event} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label={HE.loading} style={{ padding: 14 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 44,
            marginBottom: 8,
            background: `linear-gradient(90deg, ${PALANTIR_DARK.panel} 0%, ${PALANTIR_DARK.panelAlt} 50%, ${PALANTIR_DARK.panel} 100%)`,
            backgroundSize: '200% 100%',
            borderRadius: 6,
            animation: 'auditShimmer 1.4s ease-in-out infinite',
            border: `1px solid ${PALANTIR_DARK.borderSoft}`,
            opacity: 1 - i * 0.08,
          }}
        />
      ))}
      <style>
        {`@keyframes auditShimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }`}
      </style>
      <div
        style={{
          textAlign: 'center',
          color: PALANTIR_DARK.textDim,
          fontSize: 12,
          marginTop: 8,
        }}
      >
        {HE.loading}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty / Error                                                      */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div
      role="status"
      style={{
        padding: 48,
        textAlign: 'center',
        color: PALANTIR_DARK.textDim,
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 10 }} aria-hidden="true">
        ◯
      </div>
      <div style={{ fontSize: 16, color: PALANTIR_DARK.text, fontWeight: 600 }}>
        {HE.empty}
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}>{HE.emptyHint}</div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div
      role="alert"
      style={{
        padding: 32,
        textAlign: 'center',
        color: PALANTIR_DARK.critical,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 10 }} aria-hidden="true">
        ⚠
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{HE.error}</div>
      <div
        style={{
          fontSize: 12,
          color: PALANTIR_DARK.textDim,
          marginTop: 6,
          direction: 'ltr',
        }}
      >
        {String(message || '')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 14,
          background: PALANTIR_DARK.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '8px 18px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
        aria-label={HE.retry}
      >
        {HE.retry}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_FILTERS = {
  from: '',
  to: '',
  user: '',
  action: '',
  resource: '',
  search: '',
};

const PAGE_LIMIT = 100;

export default function AuditTrail({
  fetchEvents,
  onExport,
  theme = 'dark',
}) {
  // theme arg reserved — Palantir dark is the canonical look
  void theme;

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [exporting, setExporting] = useState(false);

  const effectiveFetch = fetchEvents || defaultMockFetch;

  const load = useCallback(
    async (p = 1, f = appliedFilters) => {
      setLoading(true);
      setError(null);
      try {
        const res = await effectiveFetch({
          ...f,
          page: p,
          limit: PAGE_LIMIT,
        });
        setEvents(Array.isArray(res?.events) ? res.events : []);
        setTotal(Number(res?.total || 0));
        setPage(Number(res?.page || p));
      } catch (err) {
        setError(err?.message || String(err));
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [effectiveFetch, appliedFilters]
  );

  useEffect(() => {
    load(1, DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = useCallback(() => {
    setAppliedFilters(filters);
    setExpanded(new Set());
    setFocusedIdx(0);
    load(1, filters);
  }, [filters, load]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setExpanded(new Set());
    setFocusedIdx(0);
    load(1, DEFAULT_FILTERS);
  }, [load]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      if (onExport) {
        await onExport(appliedFilters);
      } else {
        const csv = buildCSV(events);
        downloadCSV(csv, `audit-trail-${Date.now()}.csv`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AuditTrail] export failed', err);
    } finally {
      setExporting(false);
    }
  }, [onExport, events, appliedFilters]);

  const toggleExpand = useCallback((index) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Keyboard navigation (arrow keys, enter/space)
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onKey = (e) => {
      if (!events.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(events.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpand(focusedIdx);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIdx(events.length - 1);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [events.length, focusedIdx, toggleExpand]);

  // Virtual scroll
  const { scrollerRef, offsets, totalHeight, startIdx, endIdx } = useVirtual(
    events.length,
    expanded
  );

  const visibleRows = useMemo(() => {
    const rows = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (!events[i]) continue;
      rows.push(
        <EventRow
          key={events[i].id || i}
          event={events[i]}
          index={i}
          expanded={expanded.has(i)}
          focused={focusedIdx === i}
          onToggle={toggleExpand}
          onFocus={setFocusedIdx}
          offsetTop={offsets[i]}
        />
      );
    }
    return rows;
  }, [events, startIdx, endIdx, expanded, focusedIdx, offsets, toggleExpand]);

  const pageMax = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  /* ---------------- render ---------------- */

  return (
    <div
      dir="rtl"
      lang="he"
      ref={containerRef}
      role="application"
      aria-label={HE.ariaTimeline}
      style={{
        background: PALANTIR_DARK.bg,
        color: PALANTIR_DARK.text,
        minHeight: '100%',
        padding: 18,
        fontFamily:
          '"Segoe UI", "Arial Hebrew", Arial, Tahoma, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: PALANTIR_DARK.text,
            }}
          >
            {HE.title}
          </h2>
          <div
            style={{
              fontSize: 12,
              color: PALANTIR_DARK.textDim,
              marginTop: 3,
            }}
          >
            {HE.subtitle}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: PALANTIR_DARK.textDim,
          }}
        >
          <span style={{ color: PALANTIR_DARK.accent, fontWeight: 700 }}>
            {total.toLocaleString('he-IL')}
          </span>{' '}
          {HE.total}
        </div>
      </header>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onApply={handleApply}
        onReset={handleReset}
        onExport={handleExport}
        exporting={exporting}
      />

      {/* Timeline body */}
      <section
        aria-label={HE.ariaTimeline}
        style={{
          flex: 1,
          background: PALANTIR_DARK.panel,
          border: `1px solid ${PALANTIR_DARK.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 480,
        }}
      >
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(page, appliedFilters)} />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            ref={scrollerRef}
            role="list"
            aria-label={HE.ariaTimeline}
            style={{
              flex: 1,
              overflowY: 'auto',
              position: 'relative',
              minHeight: 480,
            }}
          >
            <div
              style={{
                position: 'relative',
                height: totalHeight,
                width: '100%',
              }}
            >
              {visibleRows}
            </div>
          </div>
        )}
      </section>

      {/* Pager */}
      {!loading && !error && events.length > 0 && (
        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: PALANTIR_DARK.textDim,
          }}
        >
          <div>
            {HE.showing}{' '}
            <strong style={{ color: PALANTIR_DARK.text }}>
              {events.length.toLocaleString('he-IL')}
            </strong>{' '}
            {HE.of}{' '}
            <strong style={{ color: PALANTIR_DARK.text }}>
              {total.toLocaleString('he-IL')}
            </strong>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => load(page - 1, appliedFilters)}
              disabled={page <= 1}
              style={pagerBtn(page <= 1)}
              aria-label={HE.prev}
            >
              {HE.prev}
            </button>
            <span>
              {HE.page} {page} / {pageMax}
            </span>
            <button
              type="button"
              onClick={() => load(page + 1, appliedFilters)}
              disabled={page >= pageMax}
              style={pagerBtn(page >= pageMax)}
              aria-label={HE.next}
            >
              {HE.next}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function pagerBtn(disabled) {
  return {
    background: disabled ? 'transparent' : PALANTIR_DARK.panelAlt,
    color: disabled ? PALANTIR_DARK.textMuted : PALANTIR_DARK.text,
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 4,
    padding: '5px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  };
}

/* ------------------------------------------------------------------ */
/*  Named exports for unit testing                                     */
/* ------------------------------------------------------------------ */

export {
  PALANTIR_DARK,
  HE as AUDIT_TRAIL_LABELS,
  buildCSV,
  highlightHebrew,
  fmtJerusalem,
  severityColor,
  severityLabel,
  defaultMockFetch,
};
