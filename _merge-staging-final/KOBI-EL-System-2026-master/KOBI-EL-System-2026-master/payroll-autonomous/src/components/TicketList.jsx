/**
 * TicketList.jsx — Agent X-21 (Swarm 3B)
 * ────────────────────────────────────────
 * Customer-support ticket table for Techno-Kol Uzi mega-ERP.
 *
 * Palantir dark theme, Hebrew RTL, bilingual.
 * Zero external UI libs — inline styles only.
 *
 * Props
 * ─────
 *   tickets          : Ticket[]                   (required, authoritative list)
 *   onOpen           : (ticket) => void           click → open detail panel
 *   onStatusChange   : (id, nextStatus) => void   quick status dropdown
 *   onAssign         : (ids, assigneeId) => void  bulk / single assign
 *   onClose          : (ids) => void              bulk close
 *   onTag            : (ids, tag) => void         bulk tag
 *   onRefresh        : () => void                 manual refresh
 *   currentUser      : {id,name}                  for "assign to me"
 *   agents           : [{id,name,avatar?}]        assignee options
 *   theme            : 'dark' (default)
 *
 * Ticket shape (from onyx-procurement/src/support/ticketing.js):
 *   { id, client_id, subject, description, status, priority, category,
 *     assignee, sla_due:{response_due,resolution_due,...}, created_at,
 *     updated_at, tags[], comments[], attachments[], history[] }
 */

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Palantir dark theme tokens                                         */
/* ------------------------------------------------------------------ */

const PALANTIR_DARK = {
  bg:          '#0b0d10',
  panel:       '#13171c',
  panelAlt:    '#181d24',
  border:      '#232a33',
  borderSoft:  '#1a2029',
  accent:      '#4a9eff',
  accentSoft:  'rgba(74,158,255,0.12)',
  text:        '#e6edf3',
  textDim:     '#8b95a5',
  textMuted:   '#5a6472',
  info:        '#4a9eff',
  warn:        '#f5a623',
  critical:    '#ff5c5c',
  success:     '#3ddc84',
  rowHover:    '#1b2028',
  rowSelected: '#1f2730',
  highlight:   '#ffd76a',
};

/* ------------------------------------------------------------------ */
/*  Hebrew labels                                                      */
/* ------------------------------------------------------------------ */

const HE = {
  title:       'מערכת פניות לקוחות',
  subtitle:    'Customer Support Tickets — ניהול וצפייה מרכזית',
  filters:     'סינון',
  search:      'חיפוש',
  searchPh:    'חיפוש לפי נושא, מזהה, תיאור…',
  status:      'סטטוס',
  priority:    'עדיפות',
  category:    'קטגוריה',
  assignee:    'מטפל',
  all:         'הכל',
  unassigned:  'לא משויך',
  tag:         'תגית',
  from:        'מתאריך',
  to:          'עד תאריך',
  apply:       'החל',
  reset:       'איפוס',
  refresh:     'רענן',
  bulkActions: 'פעולות קבוצתיות',
  assignToMe:  'שיוך אליי',
  assignTo:    'שיוך ל…',
  closeBulk:   'סגירת פניות',
  addTag:      'הוספת תגית',
  selected:    'נבחרו',
  of:          'מתוך',
  total:       'סה״כ',
  page:        'עמוד',
  next:        'הבא',
  prev:        'הקודם',
  empty:       'אין פניות התואמות את הסינון',
  emptyHint:   'נסה לאפס את הסינון או ליצור פנייה חדשה',
  columns: {
    select:    '',
    id:        'מזהה',
    subject:   'נושא',
    client:    'לקוח',
    priority:  'עדיפות',
    status:    'סטטוס',
    assignee:  'מטפל',
    category:  'קטגוריה',
    tags:      'תגיות',
    sla:       'SLA',
    updated:   'עודכן',
    created:   'נוצר',
  },
  statusLabels: {
    open:        'פתוח',
    in_progress: 'בטיפול',
    waiting:     'ממתין ללקוח',
    resolved:    'נפתר',
    closed:      'סגור',
  },
  priorityLabels: {
    urgent: 'דחוף',
    high:   'גבוה',
    med:    'בינוני',
    low:    'נמוך',
  },
  slaOk:      'בזמן',
  slaWarn:    'קרוב לסיום',
  slaBreach:  'חריגה',
  slaPaused:  'מושהה',
  justNow:    'ממש עכשיו',
  minAgo:     'לפני {n} דק׳',
  hourAgo:    'לפני {n} שע׳',
  dayAgo:     'לפני {n} ימים',
  weekAgo:    'לפני {n} שבועות',
  ariaTable:  'טבלת פניות לקוחות',
  ariaSelect: 'בחר פנייה',
  ariaSelectAll: 'בחר הכל',
};

const STATUS_LIST   = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
const PRIORITY_LIST = ['urgent', 'high', 'med', 'low'];

const PRIORITY_COLOURS = {
  urgent: '#ff5c5c',
  high:   '#ff9f43',
  med:    '#f5a623',
  low:    '#4a9eff',
};

const STATUS_COLOURS = {
  open:        '#4a9eff',
  in_progress: '#3ddc84',
  waiting:     '#f5a623',
  resolved:    '#8b95a5',
  closed:      '#5a6472',
};

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
      year:   'numeric',
      month:  '2-digit',
      day:    '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return String(ts);
  }
}

function timeAgo(ts) {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60)             return HE.justNow;
  const min = Math.round(sec / 60);
  if (min < 60)             return HE.minAgo.replace('{n}', String(min));
  const hr = Math.round(min / 60);
  if (hr < 24)              return HE.hourAgo.replace('{n}', String(hr));
  const day = Math.round(hr / 24);
  if (day < 7)              return HE.dayAgo.replace('{n}', String(day));
  const wk = Math.round(day / 7);
  return HE.weekAgo.replace('{n}', String(wk));
}

function slaBadge(ticket) {
  if (!ticket || !ticket.sla_due) return { label: '—', colour: PALANTIR_DARK.textMuted };
  if (ticket.status === 'waiting')  return { label: HE.slaPaused, colour: PALANTIR_DARK.textDim };
  if (ticket.status === 'closed')   return { label: HE.statusLabels.closed, colour: PALANTIR_DARK.textMuted };
  const now = Date.now();
  const res = new Date(ticket.sla_due.resolution_due).getTime();
  if (!Number.isFinite(res)) return { label: '—', colour: PALANTIR_DARK.textMuted };
  if (now > res)  return { label: HE.slaBreach, colour: PALANTIR_DARK.critical };
  const remaining = res - now;
  const oneHour = 60 * 60 * 1000;
  if (remaining < oneHour)  return { label: HE.slaWarn, colour: PALANTIR_DARK.warn };
  return { label: HE.slaOk, colour: PALANTIR_DARK.success };
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColour(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const colours = ['#4a9eff', '#3ddc84', '#f5a623', '#b36bd4', '#ff5c5c', '#56c6d4'];
  return colours[h % colours.length];
}

/* ------------------------------------------------------------------ */
/*  Styles (inline, theme-aware)                                       */
/* ------------------------------------------------------------------ */

function buildStyles(theme) {
  const T = theme === 'dark' ? PALANTIR_DARK : PALANTIR_DARK;
  return {
    root: {
      direction: 'rtl',
      fontFamily:
        "'Heebo','Assistant','Rubik',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      background: T.bg,
      color: T.text,
      padding: 20,
      minHeight: '100%',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 16,
      borderBottom: `1px solid ${T.borderSoft}`,
      paddingBottom: 12,
    },
    titleBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
    title: { fontSize: 22, fontWeight: 700, letterSpacing: 0.2 },
    subtitle: { fontSize: 12, color: T.textDim },
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: 10,
      marginBottom: 12,
    },
    input: {
      background: T.panelAlt,
      border: `1px solid ${T.border}`,
      color: T.text,
      padding: '6px 10px',
      borderRadius: 4,
      fontSize: 13,
      fontFamily: 'inherit',
      direction: 'rtl',
      minWidth: 160,
    },
    select: {
      background: T.panelAlt,
      border: `1px solid ${T.border}`,
      color: T.text,
      padding: '6px 8px',
      borderRadius: 4,
      fontSize: 13,
      fontFamily: 'inherit',
    },
    btn: {
      background: T.panelAlt,
      border: `1px solid ${T.border}`,
      color: T.text,
      padding: '6px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 13,
      fontFamily: 'inherit',
    },
    btnPrimary: {
      background: T.accent,
      border: `1px solid ${T.accent}`,
      color: '#fff',
      padding: '6px 14px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 600,
      fontFamily: 'inherit',
    },
    btnDanger: {
      background: 'rgba(255,92,92,0.15)',
      border: `1px solid ${T.critical}`,
      color: T.critical,
      padding: '6px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 13,
      fontFamily: 'inherit',
    },
    tableWrap: {
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      overflow: 'hidden',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
      direction: 'rtl',
    },
    thead: {
      background: T.panelAlt,
      borderBottom: `1px solid ${T.border}`,
      textAlign: 'right',
    },
    th: {
      padding: '10px 12px',
      fontWeight: 600,
      color: T.textDim,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      cursor: 'pointer',
      userSelect: 'none',
      textAlign: 'right',
    },
    td: {
      padding: '10px 12px',
      borderBottom: `1px solid ${T.borderSoft}`,
      verticalAlign: 'middle',
      textAlign: 'right',
    },
    row: {
      cursor: 'pointer',
    },
    rowHover: {
      background: T.rowHover,
    },
    rowSelected: {
      background: T.rowSelected,
    },
    priorityDot: (p) => ({
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: PRIORITY_COLOURS[p] || T.textMuted,
      marginInlineStart: 6,
      verticalAlign: 'middle',
    }),
    priorityPill: (p) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      background: `${PRIORITY_COLOURS[p] || T.textMuted}22`,
      color: PRIORITY_COLOURS[p] || T.textMuted,
      border: `1px solid ${PRIORITY_COLOURS[p] || T.textMuted}44`,
    }),
    statusPill: (s) => ({
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      background: `${STATUS_COLOURS[s] || T.textMuted}22`,
      color: STATUS_COLOURS[s] || T.textMuted,
      border: `1px solid ${STATUS_COLOURS[s] || T.textMuted}44`,
    }),
    avatarRow: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
    },
    avatar: (seed) => ({
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: avatarColour(seed),
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: 0.5,
    }),
    tagsBar: {
      display: 'inline-flex',
      flexWrap: 'wrap',
      gap: 4,
    },
    tagChip: {
      background: T.accentSoft,
      border: `1px solid ${T.accent}44`,
      color: T.accent,
      padding: '1px 6px',
      borderRadius: 8,
      fontSize: 10,
      fontFamily: 'monospace',
    },
    slaBadge: (colour) => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 10,
      fontWeight: 600,
      background: `${colour}22`,
      color: colour,
      border: `1px solid ${colour}44`,
    }),
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 10,
      color: T.textDim,
      fontSize: 12,
      borderTop: `1px solid ${T.borderSoft}`,
    },
    bulkBar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: T.rowSelected,
      border: `1px solid ${T.accent}44`,
      borderRadius: 6,
      marginBottom: 8,
      fontSize: 13,
    },
    empty: {
      padding: 40,
      textAlign: 'center',
      color: T.textDim,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TicketList(props) {
  const {
    tickets = [],
    onOpen = () => {},
    onStatusChange = () => {},
    onAssign = () => {},
    onClose = () => {},
    onTag = () => {},
    onRefresh = () => {},
    currentUser = null,
    agents = [],
    theme = 'dark',
  } = props;

  const styles = useMemo(() => buildStyles(theme), [theme]);

  const [filters, setFilters] = useState({
    search:   '',
    status:   '',
    priority: '',
    assignee: '',
    tag:      '',
  });
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [selected, setSelected] = useState(() => new Set());
  const [hoverRow, setHoverRow] = useState(null);
  const [tagDraft, setTagDraft] = useState('');
  const [, forceTick] = useState(0);

  // Re-render every minute so "time ago" labels & SLA badges stay live.
  useEffect(() => {
    const iv = setInterval(() => forceTick((x) => x + 1), 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  /* ----------------- filtering ----------------- */
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filters.status   && t.status   !== filters.status)   return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.assignee) {
        if (filters.assignee === '__none__' && t.assignee) return false;
        if (filters.assignee !== '__none__' && t.assignee !== filters.assignee) return false;
      }
      if (filters.tag && !(t.tags || []).includes(filters.tag.toLowerCase())) return false;
      if (q) {
        const hay = [t.id, t.subject, t.description, t.client_id].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, filters]);

  /* ----------------- sorting ----------------- */
  const sorted = useMemo(() => {
    const rank = { urgent: 4, high: 3, med: 2, low: 1 };
    const arr = filtered.slice();
    arr.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'priority') { av = rank[a.priority] || 0; bv = rank[b.priority] || 0; }
      if (typeof av === 'string' && /_at$/.test(sortKey)) {
        av = new Date(av).getTime(); bv = new Date(bv).getTime();
      }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 :  1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  /* ----------------- pagination ----------------- */
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, pages);
  const pageStart = (pageSafe - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  /* ----------------- handlers ----------------- */
  const toggleSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  const toggleRow = useCallback((id, e) => {
    if (e) e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === pageRows.length) return new Set();
      return new Set(pageRows.map((r) => r.id));
    });
  }, [pageRows]);

  const resetFilters = useCallback(() => {
    setFilters({ search: '', status: '', priority: '', assignee: '', tag: '' });
    setPage(1);
  }, []);

  const handleFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const handleQuickStatus = useCallback((id, nextStatus, e) => {
    if (e) e.stopPropagation();
    onStatusChange(id, nextStatus);
  }, [onStatusChange]);

  const bulkAssignToMe = useCallback(() => {
    if (!currentUser || selected.size === 0) return;
    onAssign(Array.from(selected), currentUser.id);
    setSelected(new Set());
  }, [currentUser, selected, onAssign]);

  const bulkAssignToAgent = useCallback((agentId) => {
    if (!agentId || selected.size === 0) return;
    onAssign(Array.from(selected), agentId);
    setSelected(new Set());
  }, [selected, onAssign]);

  const bulkClose = useCallback(() => {
    if (selected.size === 0) return;
    onClose(Array.from(selected));
    setSelected(new Set());
  }, [selected, onClose]);

  const bulkTag = useCallback(() => {
    if (!tagDraft.trim() || selected.size === 0) return;
    onTag(Array.from(selected), tagDraft.trim().toLowerCase());
    setTagDraft('');
    setSelected(new Set());
  }, [tagDraft, selected, onTag]);

  /* ----------------- agent lookup ----------------- */
  const agentById = useMemo(() => {
    const m = {};
    for (const a of agents || []) m[a.id] = a;
    return m;
  }, [agents]);

  const assigneeName = useCallback((id) => {
    if (!id) return HE.unassigned;
    const a = agentById[id];
    return a ? a.name : id;
  }, [agentById]);

  /* ----------------- render ----------------- */
  return (
    <div
      dir="rtl"
      lang="he"
      style={styles.root}
      aria-label={HE.title}
    >
      {/* header */}
      <div style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.title}>{HE.title}</div>
          <div style={styles.subtitle}>{HE.subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={styles.btn} onClick={onRefresh}>
            {HE.refresh}
          </button>
        </div>
      </div>

      {/* toolbar / filters */}
      <div style={styles.toolbar} role="search" aria-label={HE.filters}>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => handleFilter('search', e.target.value)}
          placeholder={HE.searchPh}
          style={{ ...styles.input, minWidth: 220 }}
          aria-label={HE.search}
        />
        <select
          value={filters.status}
          onChange={(e) => handleFilter('status', e.target.value)}
          style={styles.select}
          aria-label={HE.status}
        >
          <option value="">{HE.status}: {HE.all}</option>
          {STATUS_LIST.map((s) => (
            <option key={s} value={s}>{HE.statusLabels[s]}</option>
          ))}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => handleFilter('priority', e.target.value)}
          style={styles.select}
          aria-label={HE.priority}
        >
          <option value="">{HE.priority}: {HE.all}</option>
          {PRIORITY_LIST.map((p) => (
            <option key={p} value={p}>{HE.priorityLabels[p]}</option>
          ))}
        </select>
        <select
          value={filters.assignee}
          onChange={(e) => handleFilter('assignee', e.target.value)}
          style={styles.select}
          aria-label={HE.assignee}
        >
          <option value="">{HE.assignee}: {HE.all}</option>
          <option value="__none__">{HE.unassigned}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={filters.tag}
          onChange={(e) => handleFilter('tag', e.target.value)}
          placeholder={HE.tag}
          style={{ ...styles.input, minWidth: 120 }}
          aria-label={HE.tag}
        />
        <button type="button" style={styles.btn} onClick={resetFilters}>
          {HE.reset}
        </button>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div style={styles.bulkBar} role="toolbar" aria-label={HE.bulkActions}>
          <span>
            {HE.selected}: <strong>{selected.size}</strong> {HE.of} {total}
          </span>
          {currentUser && (
            <button type="button" style={styles.btn} onClick={bulkAssignToMe}>
              {HE.assignToMe}
            </button>
          )}
          <select
            style={styles.select}
            onChange={(e) => {
              if (e.target.value) bulkAssignToAgent(e.target.value);
              e.target.value = '';
            }}
            defaultValue=""
          >
            <option value="">{HE.assignTo}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder={HE.addTag}
            style={styles.input}
          />
          <button type="button" style={styles.btn} onClick={bulkTag} disabled={!tagDraft.trim()}>
            {HE.addTag}
          </button>
          <button type="button" style={styles.btnDanger} onClick={bulkClose}>
            {HE.closeBulk}
          </button>
        </div>
      )}

      {/* table */}
      <div style={styles.tableWrap}>
        <table style={styles.table} aria-label={HE.ariaTable}>
          <thead style={styles.thead}>
            <tr>
              <th style={{ ...styles.th, width: 32 }}>
                <input
                  type="checkbox"
                  aria-label={HE.ariaSelectAll}
                  checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                  onChange={toggleAll}
                />
              </th>
              <th style={styles.th} onClick={() => toggleSort('id')}>
                {HE.columns.id} {sortKey === 'id' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={styles.th} onClick={() => toggleSort('subject')}>
                {HE.columns.subject} {sortKey === 'subject' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={styles.th} onClick={() => toggleSort('client_id')}>
                {HE.columns.client}
              </th>
              <th style={styles.th} onClick={() => toggleSort('priority')}>
                {HE.columns.priority} {sortKey === 'priority' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={styles.th} onClick={() => toggleSort('status')}>
                {HE.columns.status} {sortKey === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={styles.th} onClick={() => toggleSort('assignee')}>
                {HE.columns.assignee}
              </th>
              <th style={styles.th}>{HE.columns.tags}</th>
              <th style={styles.th}>{HE.columns.sla}</th>
              <th style={styles.th} onClick={() => toggleSort('updated_at')}>
                {HE.columns.updated} {sortKey === 'updated_at' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={styles.th} onClick={() => toggleSort('created_at')}>
                {HE.columns.created} {sortKey === 'created_at' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td style={styles.empty} colSpan={11}>
                  <div style={{ fontSize: 16, marginBottom: 6 }}>{HE.empty}</div>
                  <div style={{ fontSize: 12 }}>{HE.emptyHint}</div>
                </td>
              </tr>
            )}
            {pageRows.map((t) => {
              const isSelected = selected.has(t.id);
              const isHover    = hoverRow === t.id;
              const sla = slaBadge(t);
              return (
                <tr
                  key={t.id}
                  style={{
                    ...styles.row,
                    ...(isHover ? styles.rowHover : {}),
                    ...(isSelected ? styles.rowSelected : {}),
                  }}
                  onMouseEnter={() => setHoverRow(t.id)}
                  onMouseLeave={() => setHoverRow((x) => (x === t.id ? null : x))}
                  onClick={() => onOpen(t)}
                  aria-selected={isSelected}
                >
                  <td
                    style={styles.td}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={HE.ariaSelect}
                      checked={isSelected}
                      onChange={(e) => toggleRow(t.id, e)}
                    />
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 11, color: PALANTIR_DARK.textDim }}>
                    {t.id.length > 14 ? t.id.slice(0, 14) + '…' : t.id}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject}
                  </td>
                  <td style={styles.td}>
                    <span style={{ color: PALANTIR_DARK.textDim, fontFamily: 'monospace', fontSize: 11 }}>
                      {t.client_id}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.priorityPill(t.priority)}>
                      <span style={styles.priorityDot(t.priority)} />
                      {HE.priorityLabels[t.priority] || t.priority}
                    </span>
                  </td>
                  <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.status}
                      onChange={(e) => handleQuickStatus(t.id, e.target.value, e)}
                      style={{
                        ...styles.statusPill(t.status),
                        background: `${STATUS_COLOURS[t.status] || PALANTIR_DARK.textMuted}22`,
                        appearance: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                      aria-label={HE.status}
                    >
                      {STATUS_LIST.map((s) => (
                        <option key={s} value={s}>{HE.statusLabels[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    {t.assignee ? (
                      <span style={styles.avatarRow}>
                        <span style={styles.avatar(t.assignee)} aria-hidden>
                          {initials(assigneeName(t.assignee))}
                        </span>
                        <span>{assigneeName(t.assignee)}</span>
                      </span>
                    ) : (
                      <span style={{ color: PALANTIR_DARK.textMuted, fontStyle: 'italic' }}>
                        {HE.unassigned}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.tagsBar}>
                      {(t.tags || []).slice(0, 3).map((tg) => (
                        <span key={tg} style={styles.tagChip}>#{tg}</span>
                      ))}
                      {(t.tags || []).length > 3 && (
                        <span style={{ color: PALANTIR_DARK.textMuted, fontSize: 10 }}>
                          +{(t.tags || []).length - 3}
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.slaBadge(sla.colour)}>{sla.label}</span>
                  </td>
                  <td style={{ ...styles.td, color: PALANTIR_DARK.textDim, fontSize: 11 }}>
                    <time dateTime={t.updated_at} title={fmtJerusalem(t.updated_at)}>
                      {timeAgo(t.updated_at)}
                    </time>
                  </td>
                  <td style={{ ...styles.td, color: PALANTIR_DARK.textDim, fontSize: 11 }}>
                    <time dateTime={t.created_at} title={fmtJerusalem(t.created_at)}>
                      {timeAgo(t.created_at)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* footer / pagination */}
        <div style={styles.footer}>
          <div>
            {HE.total}: <strong>{total}</strong>
            {selected.size > 0 && (
              <>
                {' · '}
                {HE.selected}: <strong>{selected.size}</strong>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              style={styles.btn}
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {HE.prev}
            </button>
            <span>
              {HE.page} <strong>{pageSafe}</strong> {HE.of} {pages}
            </span>
            <button
              type="button"
              style={styles.btn}
              disabled={pageSafe >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              {HE.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketList;
export { TicketList, PALANTIR_DARK, HE, STATUS_LIST, PRIORITY_LIST };
