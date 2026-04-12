/**
 * KanbanBoard.jsx — CRM Sales Pipeline Kanban
 * Agent X-35 / Swarm 3B / Techno-Kol Uzi mega-ERP 2026
 *
 * Horizontal scrolling kanban board with:
 *  - RTL layout (Hebrew-first) with mirrored horizontal scroll
 *  - Bilingual stage labels (HE + EN subtitle)
 *  - Cards with title, value, probability, age indicator, owner, tags
 *  - Native HTML5 drag-and-drop between stages (zero deps)
 *  - Stage totals + weighted totals in header
 *  - Search (title, prospect, owner, tag)
 *  - Filters: owner, date range, tag, stale-only
 *  - Palantir dark theme (matches BIDashboard / AuditTrail)
 *  - Accessibility: keyboard focus, aria-grabbed on drag, aria-drop zones
 *  - No external UI libs. React only.
 *
 * Props:
 *   data          : { stages: [...], totals: {...} }  (from pipelineView())
 *   onStageChange : (dealId, fromStage, toStage) => void
 *   onCardClick   : (dealId) => void
 *   onSearch      : (query) => void              (optional — external filter)
 *   currency      : 'ILS' | 'USD' | 'EUR'        (default 'ILS')
 *   owners        : [{ id, name }]               (dropdown source)
 *   tags          : string[]                      (dropdown source)
 *   loading       : boolean
 *   theme         : 'dark' (default) | 'light'
 *   staleThresholdDays : number                   (default 14)
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme — Palantir dark                                              */
/* ------------------------------------------------------------------ */
const PALANTIR_DARK = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  column: '#121720',
  card: '#1a2028',
  cardHover: '#222a35',
  cardDragging: '#2a3340',
  border: '#232a33',
  borderSoft: '#1a2029',
  accent: '#4a9eff',
  accentSoft: 'rgba(74,158,255,0.15)',
  text: '#e6edf3',
  textDim: '#8b95a5',
  textMuted: '#5a6472',
  success: '#3fb950',
  warning: '#f5a623',
  danger: '#ff5c5c',
  stale: '#d29922',
  dropZone: 'rgba(74,158,255,0.08)',
  dropZoneActive: 'rgba(74,158,255,0.22)',
};

const PALANTIR_LIGHT = {
  bg: '#f5f7fa',
  panel: '#ffffff',
  panelAlt: '#f0f3f7',
  column: '#eef1f5',
  card: '#ffffff',
  cardHover: '#f5f7fa',
  cardDragging: '#e5eaf0',
  border: '#d6dce3',
  borderSoft: '#e4e8ee',
  accent: '#1670e0',
  accentSoft: 'rgba(22,112,224,0.12)',
  text: '#1a1f26',
  textDim: '#5a6472',
  textMuted: '#8a94a3',
  success: '#2a8a3a',
  warning: '#c38200',
  danger: '#c8322a',
  stale: '#b06800',
  dropZone: 'rgba(22,112,224,0.08)',
  dropZoneActive: 'rgba(22,112,224,0.18)',
};

/* ------------------------------------------------------------------ */
/*  Hebrew labels                                                      */
/* ------------------------------------------------------------------ */
const HE = {
  title: 'צנרת מכירות',
  subtitle: 'CRM Sales Pipeline — Kanban',
  search: 'חיפוש',
  searchPlaceholder: 'חיפוש לפי כותרת, לקוח, תגית…',
  filterOwner: 'בעלים',
  filterTag: 'תגית',
  filterFrom: 'מתאריך',
  filterTo: 'עד תאריך',
  filterStale: 'רק עסקאות תקועות',
  reset: 'איפוס',
  total: 'סה״כ',
  weighted: 'משוקלל',
  deals: 'עסקאות',
  noDeals: 'אין עסקאות בשלב זה',
  noResults: 'לא נמצאו תוצאות',
  loading: 'טוען נתונים…',
  daysOld: 'ימים',
  age: 'גיל',
  stage_age: 'בשלב',
  stale: 'תקועה',
  all: 'הכל',
  owner: 'בעלים',
  value: 'ערך',
  probability: 'הסתברות',
  dropHere: 'שחרר כאן',
  ariaGrab: 'גרור כדי להעביר בין שלבים',
  ariaStage: 'עמודת שלב',
};

const EN = {
  title: 'Sales Pipeline',
  subtitle: 'CRM Sales Pipeline — Kanban',
  search: 'Search',
  searchPlaceholder: 'Search by title, prospect, tag…',
  filterOwner: 'Owner',
  filterTag: 'Tag',
  filterFrom: 'From',
  filterTo: 'To',
  filterStale: 'Stale only',
  reset: 'Reset',
  total: 'Total',
  weighted: 'Weighted',
  deals: 'deals',
  noDeals: 'No deals in this stage',
  noResults: 'No results',
  loading: 'Loading…',
  daysOld: 'd',
  age: 'age',
  stage_age: 'in stage',
  stale: 'stale',
  all: 'All',
  owner: 'Owner',
  value: 'Value',
  probability: 'Prob.',
  dropHere: 'Drop here',
  ariaGrab: 'Drag to move between stages',
  ariaStage: 'Stage column',
};

/* ------------------------------------------------------------------ */
/*  Formatting                                                          */
/* ------------------------------------------------------------------ */
function formatCurrency(value, currency) {
  if (!Number.isFinite(value)) return '—';
  const c = currency || 'ILS';
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: c,
      maximumFractionDigits: 0,
    }).format(value);
  } catch (_e) {
    return (c === 'ILS' ? '₪' : c + ' ') + Math.round(value).toLocaleString('he-IL');
  }
}

function formatPercent(p) {
  if (!Number.isFinite(p)) return '—';
  return Math.round(p * 100) + '%';
}

function formatDate(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

function formatAge(days) {
  if (!Number.isFinite(days)) return '—';
  const d = Math.floor(days);
  return d + '';
}

/* ------------------------------------------------------------------ */
/*  Card                                                                 */
/* ------------------------------------------------------------------ */
function DealCard(props) {
  const {
    deal, theme, currency, onDragStart, onDragEnd, onClick,
    isDragging, staleThresholdDays, labels,
  } = props;

  const isStale = deal.stage_age_days >= (staleThresholdDays || 14);
  const owner = deal.owner || '—';
  const ageDays = Math.max(0, Math.floor(deal.age_days || 0));
  const stageAgeDays = Math.max(0, Math.floor(deal.stage_age_days || 0));

  const cardStyle = {
    background: isDragging ? theme.cardDragging : theme.card,
    border: '1px solid ' + (isStale ? theme.stale : theme.border),
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '8px',
    cursor: 'grab',
    transition: 'background 0.12s, border-color 0.12s, transform 0.12s',
    boxShadow: isDragging
      ? '0 6px 14px rgba(0,0,0,0.45)'
      : '0 1px 2px rgba(0,0,0,0.25)',
    opacity: isDragging ? 0.65 : 1,
    transform: isDragging ? 'scale(0.98)' : 'none',
    userSelect: 'none',
  };

  const titleStyle = {
    color: theme.text,
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '6px',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    direction: 'rtl',
    textAlign: 'right',
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    color: theme.textDim,
    marginTop: '4px',
    direction: 'rtl',
  };

  const valueStyle = {
    color: theme.accent,
    fontWeight: 700,
    fontSize: '13px',
  };

  const ageStyle = {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    background: isStale ? 'rgba(210,153,34,0.18)' : theme.accentSoft,
    color: isStale ? theme.stale : theme.accent,
    fontWeight: 600,
  };

  const tagsStyle = {
    marginTop: '6px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    direction: 'rtl',
  };

  const tagStyle = {
    background: theme.panelAlt,
    color: theme.textDim,
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '3px',
    border: '1px solid ' + theme.borderSoft,
  };

  const handleKey = function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick) onClick(deal.id);
    }
  };

  return (
    <div
      role="article"
      tabIndex={0}
      draggable="true"
      aria-grabbed={isDragging ? 'true' : 'false'}
      aria-label={labels.ariaGrab + ': ' + deal.title}
      style={cardStyle}
      onDragStart={function (e) { onDragStart(e, deal); }}
      onDragEnd={onDragEnd}
      onClick={function () { if (onClick) onClick(deal.id); }}
      onKeyDown={handleKey}
    >
      <span style={titleStyle} title={deal.title}>{deal.title}</span>
      <div style={rowStyle}>
        <span style={valueStyle}>{formatCurrency(deal.value, currency || deal.currency)}</span>
        <span style={{ fontSize: '11px', color: theme.textMuted }}>
          {formatPercent(deal.probability)}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: theme.textDim }}>{owner}</span>
        <span style={ageStyle} title={labels.stage_age + ' ' + stageAgeDays + ' ' + labels.daysOld}>
          {isStale ? labels.stale + ' ' : ''}{stageAgeDays}{labels.daysOld}
        </span>
      </div>
      {Array.isArray(deal.tags) && deal.tags.length > 0 && (
        <div style={tagsStyle}>
          {deal.tags.map(function (t, i) {
            return <span key={i} style={tagStyle}>#{t}</span>;
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Column                                                              */
/* ------------------------------------------------------------------ */
function StageColumn(props) {
  const {
    stage, theme, currency, labels, draggingOver, draggingId,
    onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
    onCardClick, staleThresholdDays,
  } = props;

  const [ownDragOver, setOwnDragOver] = useState(false);

  const colStyle = {
    minWidth: '300px',
    width: '300px',
    background: theme.column,
    border: '1px solid ' + theme.borderSoft,
    borderRadius: '8px',
    margin: '0 6px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    direction: 'rtl',
  };

  const headerStyle = {
    padding: '12px 14px',
    borderBottom: '1px solid ' + theme.borderSoft,
    background: theme.panelAlt,
    borderRadius: '8px 8px 0 0',
  };

  const titleStyle = {
    color: theme.text,
    fontSize: '14px',
    fontWeight: 700,
    margin: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    direction: 'rtl',
  };

  const subtitleStyle = {
    color: theme.textMuted,
    fontSize: '11px',
    margin: '2px 0 0 0',
    direction: 'ltr',
    textAlign: 'right',
  };

  const totalsStyle = {
    color: theme.accent,
    fontSize: '12px',
    marginTop: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    direction: 'rtl',
  };

  const bodyStyle = {
    padding: '10px',
    flex: 1,
    overflowY: 'auto',
    background: ownDragOver ? theme.dropZoneActive : theme.column,
    minHeight: '120px',
    transition: 'background 0.12s',
    border: ownDragOver ? '2px dashed ' + theme.accent : '2px solid transparent',
  };

  const countBadge = {
    background: theme.accentSoft,
    color: theme.accent,
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '10px',
  };

  return (
    <div
      role="region"
      aria-label={labels.ariaStage + ': ' + stage.label_en}
      style={colStyle}
    >
      <div style={headerStyle}>
        <h3 style={titleStyle}>
          <span>{stage.label_he}</span>
          <span style={countBadge}>{stage.count}</span>
        </h3>
        <p style={subtitleStyle}>{stage.label_en}</p>
        <div style={totalsStyle}>
          <span>{labels.total}: {formatCurrency(stage.total_value, currency)}</span>
          <span>{labels.weighted}: {formatCurrency(stage.weighted_value, currency)}</span>
        </div>
      </div>
      <div
        style={bodyStyle}
        onDragOver={function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!ownDragOver) setOwnDragOver(true);
          if (onDragOver) onDragOver(stage.stage);
        }}
        onDragLeave={function () {
          setOwnDragOver(false);
          if (onDragLeave) onDragLeave(stage.stage);
        }}
        onDrop={function (e) {
          e.preventDefault();
          setOwnDragOver(false);
          if (onDrop) onDrop(e, stage.stage);
        }}
      >
        {stage.deals.length === 0 && (
          <div style={{
            color: theme.textMuted,
            textAlign: 'center',
            fontSize: '12px',
            padding: '24px 8px',
            border: '1px dashed ' + theme.borderSoft,
            borderRadius: '4px',
          }}>
            {labels.noDeals}
          </div>
        )}
        {stage.deals.map(function (deal) {
          return (
            <DealCard
              key={deal.id}
              deal={deal}
              theme={theme}
              currency={currency}
              isDragging={draggingId === deal.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={onCardClick}
              staleThresholdDays={staleThresholdDays}
              labels={labels}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter bar                                                          */
/* ------------------------------------------------------------------ */
function FilterBar(props) {
  const {
    theme, labels, query, setQuery, ownerFilter, setOwnerFilter,
    tagFilter, setTagFilter, dateFrom, setDateFrom, dateTo, setDateTo,
    staleOnly, setStaleOnly, owners, tags, onReset,
  } = props;

  const barStyle = {
    background: theme.panel,
    border: '1px solid ' + theme.borderSoft,
    borderRadius: '6px',
    padding: '10px 14px',
    margin: '0 0 12px 0',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'center',
    direction: 'rtl',
  };

  const inputStyle = {
    background: theme.panelAlt,
    color: theme.text,
    border: '1px solid ' + theme.border,
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '12px',
    direction: 'rtl',
    minWidth: '120px',
  };

  const labelStyle = {
    color: theme.textDim,
    fontSize: '11px',
    marginInlineEnd: '4px',
  };

  const btnStyle = {
    background: theme.accentSoft,
    color: theme.accent,
    border: '1px solid ' + theme.accent,
    borderRadius: '4px',
    padding: '6px 14px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 600,
  };

  return (
    <div role="toolbar" aria-label="filters" style={barStyle}>
      <input
        type="text"
        placeholder={labels.searchPlaceholder}
        value={query}
        onChange={function (e) { setQuery(e.target.value); }}
        style={Object.assign({}, inputStyle, { minWidth: '220px', flex: 1 })}
        aria-label={labels.search}
      />
      <label style={labelStyle}>{labels.filterOwner}
        <select
          value={ownerFilter}
          onChange={function (e) { setOwnerFilter(e.target.value); }}
          style={Object.assign({}, inputStyle, { marginInlineStart: '6px' })}
          aria-label={labels.filterOwner}
        >
          <option value="">{labels.all}</option>
          {owners.map(function (o) {
            return <option key={o.id} value={o.id}>{o.name}</option>;
          })}
        </select>
      </label>
      <label style={labelStyle}>{labels.filterTag}
        <select
          value={tagFilter}
          onChange={function (e) { setTagFilter(e.target.value); }}
          style={Object.assign({}, inputStyle, { marginInlineStart: '6px' })}
          aria-label={labels.filterTag}
        >
          <option value="">{labels.all}</option>
          {tags.map(function (t) {
            return <option key={t} value={t}>{t}</option>;
          })}
        </select>
      </label>
      <label style={labelStyle}>{labels.filterFrom}
        <input
          type="date"
          value={dateFrom}
          onChange={function (e) { setDateFrom(e.target.value); }}
          style={Object.assign({}, inputStyle, { marginInlineStart: '6px', minWidth: '140px' })}
        />
      </label>
      <label style={labelStyle}>{labels.filterTo}
        <input
          type="date"
          value={dateTo}
          onChange={function (e) { setDateTo(e.target.value); }}
          style={Object.assign({}, inputStyle, { marginInlineStart: '6px', minWidth: '140px' })}
        />
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={staleOnly}
          onChange={function (e) { setStaleOnly(e.target.checked); }}
          style={{ marginInlineEnd: '4px' }}
        />
        {labels.filterStale}
      </label>
      <button
        type="button"
        style={btnStyle}
        onClick={onReset}
        aria-label={labels.reset}
      >
        {labels.reset}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter a pipelineView data structure in-place copy                  */
/* ------------------------------------------------------------------ */
function applyFilters(data, opts) {
  if (!data || !Array.isArray(data.stages)) return { stages: [], totals: { total_value: 0, weighted_value: 0, count: 0 } };
  const q = (opts.query || '').trim().toLowerCase();
  const ownerF = opts.ownerFilter || '';
  const tagF = opts.tagFilter || '';
  const from = opts.dateFrom ? Date.parse(opts.dateFrom) : null;
  const to = opts.dateTo ? Date.parse(opts.dateTo) : null;
  const staleOnly = !!opts.staleOnly;
  const staleThreshold = opts.staleThresholdDays || 14;

  const stages = data.stages.map(function (st) {
    const filtered = st.deals.filter(function (d) {
      if (ownerF && d.owner !== ownerF) return false;
      if (tagF && !(Array.isArray(d.tags) && d.tags.indexOf(tagF) >= 0)) return false;
      if (Number.isFinite(from) && Number.isFinite(d.created_at) && d.created_at < from) return false;
      if (Number.isFinite(to)   && Number.isFinite(d.created_at) && d.created_at > to)   return false;
      if (staleOnly && (d.stage_age_days || 0) < staleThreshold) return false;
      if (q) {
        const hay = (
          (d.title || '') + ' ' +
          (d.prospect_name || '') + ' ' +
          (d.owner || '') + ' ' +
          (Array.isArray(d.tags) ? d.tags.join(' ') : '') + ' ' +
          (d.source || '')
        ).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    let tv = 0, wv = 0;
    for (let i = 0; i < filtered.length; i += 1) {
      tv += filtered[i].value;
      wv += filtered[i].value * filtered[i].probability;
    }
    return Object.assign({}, st, {
      deals: filtered,
      count: filtered.length,
      total_value: tv,
      weighted_value: wv,
    });
  });

  let total = 0, weighted = 0, count = 0;
  for (let i = 0; i < stages.length; i += 1) {
    total    += stages[i].total_value;
    weighted += stages[i].weighted_value;
    count    += stages[i].count;
  }
  return { stages: stages, totals: { total_value: total, weighted_value: weighted, count: count } };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function KanbanBoard(props) {
  const {
    data, onStageChange, onCardClick, onSearch,
    currency, owners, tags, loading, theme: themeName,
    staleThresholdDays,
  } = props;

  const theme = themeName === 'light' ? PALANTIR_LIGHT : PALANTIR_DARK;
  const labels = HE; // primary RTL

  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [draggingFrom, setDraggingFrom] = useState(null);
  const [draggingOver, setDraggingOver] = useState(null);

  const dragRef = useRef(null);

  const filtered = useMemo(function () {
    return applyFilters(data, {
      query: query,
      ownerFilter: ownerFilter,
      tagFilter: tagFilter,
      dateFrom: dateFrom,
      dateTo: dateTo,
      staleOnly: staleOnly,
      staleThresholdDays: staleThresholdDays,
    });
  }, [data, query, ownerFilter, tagFilter, dateFrom, dateTo, staleOnly, staleThresholdDays]);

  const handleDragStart = useCallback(function (e, deal) {
    setDraggingId(deal.id);
    setDraggingFrom(deal.stage);
    dragRef.current = { id: deal.id, from: deal.stage };
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        dealId: deal.id,
        fromStage: deal.stage,
      }));
    } catch (_err) { /* jsdom */ }
  }, []);

  const handleDragEnd = useCallback(function () {
    setDraggingId(null);
    setDraggingFrom(null);
    setDraggingOver(null);
    dragRef.current = null;
  }, []);

  const handleDragOver = useCallback(function (stageKey) {
    setDraggingOver(stageKey);
  }, []);

  const handleDragLeave = useCallback(function () {
    setDraggingOver(null);
  }, []);

  const handleDrop = useCallback(function (e, stageKey) {
    let payload = null;
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) payload = JSON.parse(raw);
    } catch (_err) { /* fall back */ }
    if (!payload && dragRef.current) payload = { dealId: dragRef.current.id, fromStage: dragRef.current.from };
    if (!payload || !payload.dealId) return;
    if (payload.fromStage === stageKey) return;
    if (typeof onStageChange === 'function') {
      onStageChange(payload.dealId, payload.fromStage, stageKey);
    }
    handleDragEnd();
  }, [onStageChange, handleDragEnd]);

  const handleReset = useCallback(function () {
    setQuery('');
    setOwnerFilter('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
    setStaleOnly(false);
  }, []);

  const rootStyle = {
    background: theme.bg,
    color: theme.text,
    padding: '16px 18px',
    minHeight: '100%',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    direction: 'rtl',
  };

  const headerStyle = {
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    direction: 'rtl',
  };

  const titleStyle = {
    fontSize: '20px',
    fontWeight: 700,
    color: theme.text,
    margin: 0,
  };

  const subtitleStyle = {
    fontSize: '12px',
    color: theme.textMuted,
    margin: '4px 0 0 0',
    direction: 'ltr',
    textAlign: 'right',
  };

  const totalsStyle = {
    textAlign: 'left',
    direction: 'ltr',
  };

  const totalsMain = {
    fontSize: '18px',
    fontWeight: 700,
    color: theme.accent,
  };

  const totalsSub = {
    fontSize: '11px',
    color: theme.textMuted,
  };

  const boardScroll = {
    display: 'flex',
    flexDirection: 'row',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: '14px',
    minHeight: '480px',
    alignItems: 'stretch',
    direction: 'rtl', // RTL horizontal scrolling
  };

  return (
    <div style={rootStyle} dir="rtl">
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>{labels.title}</h2>
          <p style={subtitleStyle}>{labels.subtitle}</p>
        </div>
        <div style={totalsStyle}>
          <div style={totalsMain}>
            {formatCurrency(filtered.totals.total_value, currency)}
          </div>
          <div style={totalsSub}>
            {labels.weighted}: {formatCurrency(filtered.totals.weighted_value, currency)}
            {' · '}
            {filtered.totals.count} {labels.deals}
          </div>
        </div>
      </div>

      <FilterBar
        theme={theme}
        labels={labels}
        query={query}
        setQuery={function (v) { setQuery(v); if (typeof onSearch === 'function') onSearch(v); }}
        ownerFilter={ownerFilter}
        setOwnerFilter={setOwnerFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        staleOnly={staleOnly}
        setStaleOnly={setStaleOnly}
        owners={Array.isArray(owners) ? owners : []}
        tags={Array.isArray(tags) ? tags : []}
        onReset={handleReset}
      />

      {loading ? (
        <div style={{ textAlign: 'center', color: theme.textDim, padding: '40px' }}>
          {labels.loading}
        </div>
      ) : (
        <div style={boardScroll} role="list" aria-label={labels.title}>
          {filtered.stages.map(function (stage) {
            return (
              <StageColumn
                key={stage.stage}
                stage={stage}
                theme={theme}
                currency={currency}
                labels={labels}
                draggingOver={draggingOver === stage.stage}
                draggingId={draggingId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onCardClick={onCardClick}
                staleThresholdDays={staleThresholdDays}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export { PALANTIR_DARK, PALANTIR_LIGHT, HE, EN, applyFilters, formatCurrency, formatPercent };
