/**
 * LiveDashboard — Real-time Operations Dashboard (SSE)
 * Agent X-13 (Swarm 3) / Techno-Kol Uzi mega-ERP 2026
 *
 * Pairs with onyx-procurement/src/realtime/sse-hub.js.
 *
 * Zero deps beyond React. Uses the browser's native EventSource
 * (no WebSocket, no polyfill). Manual reconnect with exponential
 * backoff because EventSource's auto-reconnect is too shallow for
 * our monitoring needs (we want jitter, max caps, and a visible
 * state machine).
 *
 * Features:
 *   • Hebrew RTL bilingual layout (HE primary + EN subtitle)
 *   • Palantir dark theme (#0b0d10 / #13171c / #4a9eff)
 *   • Live tiles: today's revenue, open invoices, pending payments,
 *     low stock items, alerts count
 *   • Activity feed with the last 20 events
 *   • Connection status indicator (connecting / live / reconnecting / offline)
 *   • Auto-reconnect with exponential backoff + jitter
 *   • Passes Last-Event-Id via EventSource reconnect (browser-native)
 *   • API key is appended to the URL (X-API-Key can't be set on EventSource;
 *     the server accepts either header or ?key= fallback — see sse-hub.js)
 *
 * Props:
 *   streamUrl   : string  — defaults to "/api/stream/events"
 *   apiKey      : string  — optional, when the hub requires auth
 *   channels    : string[] — defaults to all five channels
 *   initialTiles: object   — optional seed data for the tiles (SSR/hydration)
 *   onEvent     : (event) => void — observer for the parent page
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/* Theme — mirrors BIDashboard for visual consistency                  */
/* ------------------------------------------------------------------ */
export const LIVE_THEME = {
  bg:       '#0b0d10',
  panel:    '#13171c',
  panel2:   '#1a2028',
  border:   '#2a3340',
  text:     '#e6edf3',
  textDim:  '#8b96a5',
  accent:   '#4a9eff',
  success:  '#3fb950',
  warning:  '#d29922',
  danger:   '#f85149',
  grid:     '#232a33',
};

/* ------------------------------------------------------------------ */
/* Locale helpers                                                      */
/* ------------------------------------------------------------------ */
const fmtILS = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  try {
    return new Intl.NumberFormat('he-IL', {
      style:                 'currency',
      currency:              'ILS',
      maximumFractionDigits: 0,
    }).format(num);
  } catch (_e) {
    return `₪ ${Math.round(num).toLocaleString()}`;
  }
};

const fmtInt = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  try {
    return new Intl.NumberFormat('he-IL').format(num);
  } catch (_e) {
    return String(Math.round(num));
  }
};

const fmtTime = (ts) => {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch (_e) {
    return '';
  }
};

/* ------------------------------------------------------------------ */
/* Connection state machine                                            */
/* ------------------------------------------------------------------ */
const STATUS = {
  IDLE:         'idle',
  CONNECTING:   'connecting',
  LIVE:         'live',
  RECONNECTING: 'reconnecting',
  OFFLINE:      'offline',
};

const STATUS_LABEL = {
  [STATUS.IDLE]:         { he: 'ממתין',          en: 'idle'         },
  [STATUS.CONNECTING]:   { he: 'מתחבר...',       en: 'connecting'   },
  [STATUS.LIVE]:         { he: 'מחובר בשידור חי', en: 'live'        },
  [STATUS.RECONNECTING]: { he: 'מתחבר מחדש...',  en: 'reconnecting' },
  [STATUS.OFFLINE]:      { he: 'לא מחובר',        en: 'offline'     },
};

const STATUS_COLOR = {
  [STATUS.IDLE]:         LIVE_THEME.textDim,
  [STATUS.CONNECTING]:   LIVE_THEME.accent,
  [STATUS.LIVE]:         LIVE_THEME.success,
  [STATUS.RECONNECTING]: LIVE_THEME.warning,
  [STATUS.OFFLINE]:      LIVE_THEME.danger,
};

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */
const DEFAULT_CHANNELS = [
  'invoices', 'payments', 'inventory', 'alerts', 'system_health',
];

const INITIAL_TILES = Object.freeze({
  todayRevenue:   0,
  openInvoices:   0,
  pendingPayments: 0,
  lowStockItems:  0,
  alertsCount:    0,
});

const MAX_FEED      = 20;
const BACKOFF_START = 1_000;      // 1 s
const BACKOFF_MAX   = 30_000;     // 30 s

/* ------------------------------------------------------------------ */
/* useLiveStream — SSE hook with exponential backoff                   */
/* ------------------------------------------------------------------ */
function useLiveStream({ streamUrl, apiKey, channels, onEvent }) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [lastEventAt, setLastEventAt] = useState(null);
  const esRef        = useRef(null);
  const backoffRef   = useRef(BACKOFF_START);
  const retryTimer   = useRef(null);
  const mountedRef   = useRef(true);
  const onEventRef   = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const buildUrl = useCallback(() => {
    const base = streamUrl || '/api/stream/events';
    const params = [];
    if (channels && channels.length) {
      params.push(`channels=${encodeURIComponent(channels.join(','))}`);
    }
    if (apiKey) {
      // EventSource can't send custom headers, so fall back to ?key=
      params.push(`key=${encodeURIComponent(apiKey)}`);
    }
    if (!params.length) return base;
    return base + (base.includes('?') ? '&' : '?') + params.join('&');
  }, [streamUrl, apiKey, channels]);

  const teardown = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (esRef.current) {
      try { esRef.current.close(); } catch (_e) { /* ignore */ }
      esRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((connectFn) => {
    if (!mountedRef.current) return;
    const base = backoffRef.current;
    const jitter = Math.floor(Math.random() * (base / 2));
    const delay = Math.min(BACKOFF_MAX, base + jitter);
    backoffRef.current = Math.min(BACKOFF_MAX, base * 2);
    setStatus(STATUS.RECONNECTING);
    retryTimer.current = setTimeout(connectFn, delay);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    teardown();
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      setStatus(STATUS.OFFLINE);
      return;
    }
    setStatus(STATUS.CONNECTING);

    let es;
    try {
      es = new window.EventSource(buildUrl(), { withCredentials: false });
    } catch (_err) {
      scheduleReconnect(connect);
      return;
    }
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      backoffRef.current = BACKOFF_START; // reset on success
      setStatus(STATUS.LIVE);
    };

    const handleMessage = (rawEvt) => {
      if (!mountedRef.current) return;
      let parsed = null;
      try {
        parsed = rawEvt.data ? JSON.parse(rawEvt.data) : null;
      } catch (_e) {
        parsed = { raw: rawEvt.data };
      }
      const envelope = {
        id:      rawEvt.lastEventId || null,
        type:    rawEvt.type || 'message',
        ts:      Date.now(),
        data:    parsed,
      };
      setLastEventAt(envelope.ts);
      if (typeof onEventRef.current === 'function') {
        try { onEventRef.current(envelope); } catch (_e) { /* ignore */ }
      }
    };

    // Catch-all
    es.onmessage = handleMessage;

    // Named events: invoices.*, payments.*, etc.
    const names = [
      'invoices.created', 'invoices.updated', 'invoices.paid',
      'payments.received', 'payments.reconciled', 'payments.failed',
      'inventory.changed', 'inventory.low_stock',
      'alerts.raised',
      'system_health.heartbeat', 'system_health.status',
    ];
    for (const n of names) es.addEventListener(n, handleMessage);

    es.onerror = () => {
      if (!mountedRef.current) return;
      teardown();
      scheduleReconnect(connect);
    };
  }, [buildUrl, scheduleReconnect, teardown]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [connect, teardown]);

  return { status, lastEventAt };
}

/* ------------------------------------------------------------------ */
/* Aggregator — folds stream events into the tile state                */
/* ------------------------------------------------------------------ */
function reduceTiles(prev, evt) {
  if (!evt || !evt.data) return prev;
  const d     = evt.data;
  const type  = (evt.type || '').toLowerCase();
  const next  = { ...prev };

  // INVOICES
  if (type === 'invoices.created') {
    next.openInvoices = (prev.openInvoices || 0) + 1;
    if (Number.isFinite(+d.totalILS))   next.todayRevenue   = (prev.todayRevenue   || 0) + Number(d.totalILS);
    else if (Number.isFinite(+d.amount)) next.todayRevenue  = (prev.todayRevenue   || 0) + Number(d.amount);
  } else if (type === 'invoices.paid') {
    next.openInvoices = Math.max(0, (prev.openInvoices || 0) - 1);
  }

  // PAYMENTS
  if (type === 'payments.received') {
    next.pendingPayments = Math.max(0, (prev.pendingPayments || 0) - 1);
  } else if (type === 'payments.failed') {
    next.pendingPayments = (prev.pendingPayments || 0) + 1;
  }

  // INVENTORY
  if (type === 'inventory.low_stock') {
    next.lowStockItems = (prev.lowStockItems || 0) + 1;
  } else if (type === 'inventory.restocked') {
    next.lowStockItems = Math.max(0, (prev.lowStockItems || 0) - 1);
  }

  // ALERTS
  if (type === 'alerts.raised') {
    next.alertsCount = (prev.alertsCount || 0) + 1;
  } else if (type === 'alerts.cleared') {
    next.alertsCount = Math.max(0, (prev.alertsCount || 0) - 1);
  }

  // Server snapshot — overwrite if provided explicitly
  if (d && typeof d === 'object') {
    if (Number.isFinite(+d.snapshot_today_revenue))    next.todayRevenue    = Number(d.snapshot_today_revenue);
    if (Number.isFinite(+d.snapshot_open_invoices))    next.openInvoices    = Number(d.snapshot_open_invoices);
    if (Number.isFinite(+d.snapshot_pending_payments)) next.pendingPayments = Number(d.snapshot_pending_payments);
    if (Number.isFinite(+d.snapshot_low_stock))        next.lowStockItems   = Number(d.snapshot_low_stock);
    if (Number.isFinite(+d.snapshot_alerts_count))     next.alertsCount     = Number(d.snapshot_alerts_count);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */
function Tile({ title, subtitle, value, accent }) {
  return (
    <div
      role="group"
      aria-label={`${title} - ${subtitle}`}
      style={{
        background:    LIVE_THEME.panel,
        border:        `1px solid ${LIVE_THEME.border}`,
        borderRadius:  8,
        padding:       '16px 18px',
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
        minHeight:     96,
        boxShadow:     '0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        color:         LIVE_THEME.textDim,
        fontSize:      12,
      }}>
        <span style={{
          display:     'inline-block',
          width:       8,
          height:      8,
          borderRadius: 999,
          background:  accent || LIVE_THEME.accent,
        }} />
        <span>{title}</span>
        <span style={{ opacity: 0.6, direction: 'ltr', marginInlineStart: 'auto' }}>{subtitle}</span>
      </div>
      <div style={{
        color:      LIVE_THEME.text,
        fontSize:   26,
        fontWeight: 600,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

function ConnectionBadge({ status, lastEventAt }) {
  const label = STATUS_LABEL[status] || STATUS_LABEL[STATUS.IDLE];
  const color = STATUS_COLOR[status] || LIVE_THEME.textDim;
  const pulse = status === STATUS.LIVE;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           10,
        padding:       '6px 12px',
        borderRadius:  999,
        background:    LIVE_THEME.panel2,
        border:        `1px solid ${LIVE_THEME.border}`,
        color:         LIVE_THEME.text,
        fontSize:      13,
      }}
    >
      <span style={{
        display:      'inline-block',
        width:        10,
        height:       10,
        borderRadius: 999,
        background:   color,
        boxShadow:    pulse ? `0 0 0 4px ${color}22` : 'none',
      }} />
      <span>{label.he}</span>
      <span style={{ color: LIVE_THEME.textDim, direction: 'ltr' }}>{label.en}</span>
      {lastEventAt ? (
        <span style={{
          color:    LIVE_THEME.textDim,
          fontSize: 11,
          marginInlineStart: 6,
          direction: 'ltr',
        }}>
          {fmtTime(lastEventAt)}
        </span>
      ) : null}
    </div>
  );
}

function ActivityFeed({ events }) {
  if (!events.length) {
    return (
      <div style={{
        color:     LIVE_THEME.textDim,
        padding:   24,
        textAlign: 'center',
        fontSize:  13,
      }}>
        אין עדיין אירועים • waiting for events
      </div>
    );
  }
  return (
    <ul style={{
      listStyle: 'none',
      margin:    0,
      padding:   0,
      maxHeight: 360,
      overflowY: 'auto',
    }}>
      {events.map((e, idx) => (
        <li
          key={`${e.id || idx}-${e.ts}`}
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           12,
            padding:       '8px 14px',
            borderBottom:  `1px solid ${LIVE_THEME.border}`,
            color:         LIVE_THEME.text,
            fontSize:      13,
          }}
        >
          <span style={{
            color:    LIVE_THEME.textDim,
            fontSize: 11,
            direction: 'ltr',
            minWidth: 70,
          }}>
            {fmtTime(e.ts)}
          </span>
          <span style={{
            background:   LIVE_THEME.panel2,
            border:       `1px solid ${LIVE_THEME.border}`,
            borderRadius: 4,
            padding:      '2px 8px',
            fontSize:     11,
            color:        LIVE_THEME.accent,
            direction:    'ltr',
            whiteSpace:   'nowrap',
          }}>
            {e.type}
          </span>
          <span style={{ flex: 1, color: LIVE_THEME.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summarize(e)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function summarize(evt) {
  const d = evt && evt.data;
  if (!d) return '';
  if (typeof d === 'string') return d;
  // Prefer human-readable keys
  if (d.message_he) return String(d.message_he);
  if (d.message)    return String(d.message);
  if (d.id && d.totalILS != null) return `${d.id} • ${fmtILS(d.totalILS)}`;
  if (d.id && d.amount != null)   return `${d.id} • ${fmtILS(d.amount)}`;
  if (d.sku)     return `SKU ${d.sku}`;
  if (d.code)    return `code ${d.code}`;
  // Fallback — compact JSON
  try { return JSON.stringify(d).slice(0, 120); } catch (_e) { return ''; }
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function LiveDashboard({
  streamUrl    = '/api/stream/events',
  apiKey       = '',
  channels     = DEFAULT_CHANNELS,
  initialTiles = INITIAL_TILES,
  onEvent,
}) {
  const [tiles, setTiles] = useState(() => ({ ...INITIAL_TILES, ...initialTiles }));
  const [feed,  setFeed]  = useState([]);

  const handleEvent = useCallback((evt) => {
    setTiles(prev => reduceTiles(prev, evt));
    setFeed(prev => {
      const next = [evt, ...prev];
      return next.length > MAX_FEED ? next.slice(0, MAX_FEED) : next;
    });
    if (typeof onEvent === 'function') onEvent(evt);
  }, [onEvent]);

  const { status, lastEventAt } = useLiveStream({
    streamUrl,
    apiKey,
    channels,
    onEvent: handleEvent,
  });

  const tileDefs = useMemo(() => ([
    {
      title:    'הכנסות היום',
      subtitle: "today's revenue",
      value:    fmtILS(tiles.todayRevenue),
      accent:   LIVE_THEME.success,
    },
    {
      title:    'חשבוניות פתוחות',
      subtitle: 'open invoices',
      value:    fmtInt(tiles.openInvoices),
      accent:   LIVE_THEME.accent,
    },
    {
      title:    'תשלומים ממתינים',
      subtitle: 'pending payments',
      value:    fmtInt(tiles.pendingPayments),
      accent:   LIVE_THEME.warning,
    },
    {
      title:    'פריטים במלאי נמוך',
      subtitle: 'low stock items',
      value:    fmtInt(tiles.lowStockItems),
      accent:   LIVE_THEME.warning,
    },
    {
      title:    'התראות פעילות',
      subtitle: 'active alerts',
      value:    fmtInt(tiles.alertsCount),
      accent:   tiles.alertsCount > 0 ? LIVE_THEME.danger : LIVE_THEME.textDim,
    },
  ]), [tiles]);

  return (
    <section
      dir="rtl"
      aria-label="לוח בקרה בזמן אמת"
      style={{
        background:    LIVE_THEME.bg,
        color:         LIVE_THEME.text,
        fontFamily:    'system-ui, -apple-system, "Segoe UI", "Heebo", "Assistant", sans-serif',
        padding:       24,
        minHeight:     '100%',
        direction:     'rtl',
      }}
    >
      <header
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   20,
          gap:            16,
          flexWrap:       'wrap',
        }}
      >
        <div>
          <h2 style={{
            margin:     0,
            fontSize:   22,
            fontWeight: 700,
            color:      LIVE_THEME.text,
          }}>
            לוח בקרה בזמן אמת
          </h2>
          <div style={{
            color:     LIVE_THEME.textDim,
            fontSize:  12,
            marginTop: 4,
            direction: 'ltr',
            textAlign: 'start',
          }}>
            Techno-Kol Uzi • Real-time Operations Dashboard (SSE)
          </div>
        </div>
        <ConnectionBadge status={status} lastEventAt={lastEventAt} />
      </header>

      <div
        role="group"
        aria-label="Live tiles"
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap:                 14,
          marginBottom:        24,
        }}
      >
        {tileDefs.map(t => (
          <Tile
            key={t.subtitle}
            title={t.title}
            subtitle={t.subtitle}
            value={t.value}
            accent={t.accent}
          />
        ))}
      </div>

      <div
        style={{
          background:   LIVE_THEME.panel,
          border:       `1px solid ${LIVE_THEME.border}`,
          borderRadius: 8,
          overflow:     'hidden',
        }}
      >
        <div
          style={{
            padding:        '12px 16px',
            borderBottom:   `1px solid ${LIVE_THEME.border}`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            background:     LIVE_THEME.panel2,
          }}
        >
          <div>
            <strong>פיד אירועים</strong>
            <span style={{
              color:     LIVE_THEME.textDim,
              fontSize:  12,
              marginInlineStart: 8,
              direction: 'ltr',
            }}>
              activity feed • last {MAX_FEED}
            </span>
          </div>
          <span style={{
            color:     LIVE_THEME.textDim,
            fontSize:  12,
            direction: 'ltr',
          }}>
            {feed.length}/{MAX_FEED}
          </span>
        </div>
        <ActivityFeed events={feed} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Named exports for tests / reuse                                     */
/* ------------------------------------------------------------------ */
export { STATUS, STATUS_LABEL, reduceTiles, fmtILS, fmtInt, fmtTime, summarize };
