/**
 * NotificationCenter.jsx — Agent X-16 (Swarm 3)
 * Techno-Kol Uzi mega-ERP 2026
 *
 * In-app notification center with bell icon, dropdown panel,
 * tabs (All / Unread / Mentions), category filtering, snooze, archive,
 * mark-as-read, infinite scroll, Hebrew RTL, Palantir dark theme.
 *
 * Zero external dependencies — inline styles, pure React hooks only.
 * Bilingual labels (Hebrew primary, English subtitle).
 *
 * Props:
 *   notifications        : Array<Notification>      Full notification list
 *   unreadCount          : number                    Precomputed unread count (optional)
 *   onMarkRead           : (id) => void
 *   onMarkAllRead        : () => void
 *   onNavigate           : (notification) => void    Click handler
 *   onSnooze             : (id, duration) => void    duration: '1h' | '1d' | '1w'
 *   onArchive            : (id) => void
 *   onLoadMore           : () => Promise<void>       For infinite scroll
 *   hasMore              : boolean                   Are more items available
 *   loading              : boolean
 *   currentUserHandle    : string                    For mentions filter (e.g., '@kobi')
 *   theme                : 'dark' (default)
 *
 * Notification shape:
 *   {
 *     id            : string
 *     title         : string        (Hebrew)
 *     body          : string
 *     category      : 'invoice' | 'payment' | 'alert' | 'system' | 'approval'
 *     severity      : 'info' | 'warning' | 'critical'
 *     read          : boolean
 *     mentioned     : boolean       (did this notification @mention the current user?)
 *     archived      : boolean
 *     snoozedUntil  : number | null (epoch ms)
 *     timestamp     : number        (epoch ms)
 *     href          : string        (optional deep link)
 *     actor         : string        (optional — who caused it)
 *   }
 */

'use strict';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';

/* ================================================================= */
/*  Theme — Palantir dark                                              */
/* ================================================================= */

const PALANTIR_DARK = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  panelHover: '#1b2028',
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
  badge: '#ff3b3b',
  badgeText: '#ffffff',
  unreadDot: '#4a9eff',
  shadow: '0 12px 32px rgba(0,0,0,0.55)',
};

/* ================================================================= */
/*  Hebrew labels                                                      */
/* ================================================================= */

const HE = {
  title: 'מרכז התראות',
  subtitle: 'Notification Center',
  tabAll: 'הכל',
  tabUnread: 'לא נקראו',
  tabMentions: 'אזכורים',
  markAllRead: 'סמן הכל כנקרא',
  markRead: 'סמן כנקרא',
  snooze: 'נודניק',
  snooze1h: 'שעה',
  snooze1d: 'יום',
  snooze1w: 'שבוע',
  archive: 'ארכיון',
  empty: 'אין התראות',
  emptyHint: 'אין התראות חדשות להצגה',
  loading: 'טוען…',
  loadMore: 'טען עוד',
  filter: 'סינון',
  allCategories: 'כל הקטגוריות',
  catInvoice: 'חשבוניות',
  catPayment: 'תשלומים',
  catAlert: 'התראות',
  catSystem: 'מערכת',
  catApproval: 'אישורים',
  agoJustNow: 'ממש עכשיו',
  agoMinute: 'לפני דקה',
  agoMinutes: (n) => `לפני ${n} דקות`,
  agoHour: 'לפני שעה',
  agoHours: (n) => `לפני ${n} שעות`,
  agoDay: 'לפני יום',
  agoDays: (n) => `לפני ${n} ימים`,
  agoWeek: 'לפני שבוע',
  agoWeeks: (n) => `לפני ${n} שבועות`,
  agoMonth: 'לפני חודש',
  agoMonths: (n) => `לפני ${n} חודשים`,
  ariaBell: 'פתח מרכז התראות',
  ariaClose: 'סגור פאנל',
  ariaUnreadBadge: 'התראות שלא נקראו',
  ariaNotificationItem: 'פריט התראה',
  close: 'סגור',
};

/* ================================================================= */
/*  Constants                                                          */
/* ================================================================= */

const CATEGORIES = ['invoice', 'payment', 'alert', 'system', 'approval'];

const CATEGORY_LABELS = {
  invoice: HE.catInvoice,
  payment: HE.catPayment,
  alert: HE.catAlert,
  system: HE.catSystem,
  approval: HE.catApproval,
};

const SNOOZE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

/* ================================================================= */
/*  Hebrew "time ago" formatter                                        */
/* ================================================================= */

export function timeAgoHe(timestamp, nowMs) {
  if (!timestamp) return '—';
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));

  if (diffSec < 30) return HE.agoJustNow;
  if (diffSec < 90) return HE.agoMinute;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    if (diffMin === 1) return HE.agoMinute;
    return HE.agoMinutes(diffMin);
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    if (diffHour === 1) return HE.agoHour;
    return HE.agoHours(diffHour);
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    if (diffDay === 1) return HE.agoDay;
    return HE.agoDays(diffDay);
  }
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) {
    if (diffWeek === 1) return HE.agoWeek;
    return HE.agoWeeks(diffWeek);
  }
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth === 1) return HE.agoMonth;
  return HE.agoMonths(diffMonth);
}

/* ================================================================= */
/*  Inline SVG icons (zero deps)                                       */
/* ================================================================= */

function IconBell({ size = 20, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || PALANTIR_DARK.text}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconInvoice({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.accent} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconPayment({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.success} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IconAlert({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.critical} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconSystem({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.textDim} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconApproval({ size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.warn} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconClose({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.textDim} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconClock({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.textDim} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconArchive({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.textDim} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconCheck({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || PALANTIR_DARK.success} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const CATEGORY_ICONS = {
  invoice: IconInvoice,
  payment: IconPayment,
  alert: IconAlert,
  system: IconSystem,
  approval: IconApproval,
};

/* ================================================================= */
/*  Styles (inline — zero deps)                                        */
/* ================================================================= */

const styles = {
  root: {
    position: 'relative',
    direction: 'rtl',
    fontFamily: '"Segoe UI", "Assistant", "Heebo", -apple-system, sans-serif',
    color: PALANTIR_DARK.text,
  },
  bellButton: {
    position: 'relative',
    background: 'transparent',
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 8,
    width: 40,
    height: 40,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: PALANTIR_DARK.text,
    transition: 'background 120ms',
  },
  bellButtonHover: {
    background: PALANTIR_DARK.panelHover,
  },
  badge: {
    position: 'absolute',
    // RTL-positioned: badge sits on the LEFT side of the bell
    top: -4,
    left: -4,
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    background: PALANTIR_DARK.badge,
    color: PALANTIR_DARK.badgeText,
    borderRadius: 9,
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${PALANTIR_DARK.bg}`,
    lineHeight: 1,
    fontFamily: 'monospace',
  },
  panel: {
    position: 'absolute',
    top: 48,
    // RTL: panel opens to the RIGHT of the bell (which is at top-right of screen)
    left: 0,
    width: 420,
    maxHeight: 560,
    background: PALANTIR_DARK.panel,
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 10,
    boxShadow: PALANTIR_DARK.shadow,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 1000,
  },
  header: {
    padding: '14px 16px 12px',
    borderBottom: `1px solid ${PALANTIR_DARK.borderSoft}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexShrink: 0,
  },
  headerTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: PALANTIR_DARK.text,
  },
  headerSubtitle: {
    fontSize: 10,
    color: PALANTIR_DARK.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  markAllButton: {
    background: 'transparent',
    border: `1px solid ${PALANTIR_DARK.border}`,
    color: PALANTIR_DARK.accent,
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabs: {
    display: 'flex',
    borderBottom: `1px solid ${PALANTIR_DARK.borderSoft}`,
    background: PALANTIR_DARK.panelAlt,
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    color: PALANTIR_DARK.textDim,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: '2px solid transparent',
    transition: 'all 120ms',
  },
  tabActive: {
    color: PALANTIR_DARK.accent,
    borderBottomColor: PALANTIR_DARK.accent,
    background: PALANTIR_DARK.accentSoft,
  },
  tabCount: {
    marginInlineStart: 6,
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 8,
    background: PALANTIR_DARK.border,
    color: PALANTIR_DARK.text,
  },
  filterBar: {
    padding: '8px 12px',
    borderBottom: `1px solid ${PALANTIR_DARK.borderSoft}`,
    background: PALANTIR_DARK.panel,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 0,
  },
  chip: {
    background: 'transparent',
    border: `1px solid ${PALANTIR_DARK.border}`,
    color: PALANTIR_DARK.textDim,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  chipActive: {
    background: PALANTIR_DARK.accentSoft,
    borderColor: PALANTIR_DARK.accent,
    color: PALANTIR_DARK.accent,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 200,
    maxHeight: 380,
  },
  item: {
    display: 'flex',
    padding: '12px 16px',
    gap: 12,
    borderBottom: `1px solid ${PALANTIR_DARK.borderSoft}`,
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 120ms',
  },
  itemUnread: {
    background: 'rgba(74,158,255,0.04)',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemRow1: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: PALANTIR_DARK.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
  },
  itemTime: {
    fontSize: 10,
    color: PALANTIR_DARK.textMuted,
    whiteSpace: 'nowrap',
    marginInlineStart: 8,
  },
  itemText: {
    fontSize: 12,
    color: PALANTIR_DARK.textDim,
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  itemActions: {
    display: 'flex',
    gap: 4,
    marginTop: 6,
    opacity: 0.8,
  },
  actionBtn: {
    background: 'transparent',
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 4,
    color: PALANTIR_DARK.textDim,
    padding: '3px 6px',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  },
  unreadDot: {
    position: 'absolute',
    // RTL: dot on the right side (start of row)
    right: 6,
    top: 18,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: PALANTIR_DARK.unreadDot,
  },
  snoozeMenu: {
    position: 'absolute',
    background: PALANTIR_DARK.panelAlt,
    border: `1px solid ${PALANTIR_DARK.border}`,
    borderRadius: 6,
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: 10,
    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
  },
  snoozeMenuItem: {
    background: 'transparent',
    border: 'none',
    color: PALANTIR_DARK.text,
    padding: '6px 12px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'right',
    borderRadius: 3,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: PALANTIR_DARK.textMuted,
  },
  emptyTitle: {
    fontSize: 14,
    color: PALANTIR_DARK.textDim,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 11,
    color: PALANTIR_DARK.textMuted,
  },
  footer: {
    padding: '10px 16px',
    borderTop: `1px solid ${PALANTIR_DARK.borderSoft}`,
    textAlign: 'center',
    fontSize: 11,
    color: PALANTIR_DARK.textMuted,
    flexShrink: 0,
  },
};

/* ================================================================= */
/*  Sub-component: NotificationItem                                    */
/* ================================================================= */

function NotificationItem({
  notification,
  onMarkRead,
  onNavigate,
  onSnooze,
  onArchive,
  nowMs,
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const Icon = CATEGORY_ICONS[notification.category] || IconSystem;
  const timeStr = timeAgoHe(notification.timestamp, nowMs);

  const itemStyle = {
    ...styles.item,
    ...(!notification.read ? styles.itemUnread : {}),
    ...(hover ? { background: PALANTIR_DARK.panelHover } : {}),
  };

  const stop = (e) => e.stopPropagation();

  const handleClick = () => {
    if (!notification.read && onMarkRead) onMarkRead(notification.id);
    if (onNavigate) onNavigate(notification);
  };

  const handleSnooze = (duration) => {
    setSnoozeOpen(false);
    if (onSnooze) onSnooze(notification.id, duration);
  };

  return (
    <div
      role="listitem"
      aria-label={HE.ariaNotificationItem}
      style={itemStyle}
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      tabIndex={0}
    >
      {!notification.read && <span style={styles.unreadDot} aria-hidden="true" />}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <Icon size={18} />
      </div>
      <div style={styles.itemBody}>
        <div style={styles.itemRow1}>
          <span style={styles.itemTitle} title={notification.title}>
            {notification.title}
          </span>
          <span style={styles.itemTime} title={new Date(notification.timestamp).toISOString()}>
            {timeStr}
          </span>
        </div>
        <div style={styles.itemText}>{notification.body}</div>
        {hover && (
          <div style={styles.itemActions} onClick={stop}>
            {!notification.read && (
              <button
                type="button"
                style={styles.actionBtn}
                onClick={(e) => {
                  stop(e);
                  if (onMarkRead) onMarkRead(notification.id);
                }}
                aria-label={HE.markRead}
              >
                <IconCheck size={11} />
                <span>{HE.markRead}</span>
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                style={styles.actionBtn}
                onClick={(e) => {
                  stop(e);
                  setSnoozeOpen((v) => !v);
                }}
                aria-label={HE.snooze}
              >
                <IconClock size={11} />
                <span>{HE.snooze}</span>
              </button>
              {snoozeOpen && (
                <div style={styles.snoozeMenu} onClick={stop}>
                  <button type="button" style={styles.snoozeMenuItem}
                    onClick={() => handleSnooze('1h')}>{HE.snooze1h}</button>
                  <button type="button" style={styles.snoozeMenuItem}
                    onClick={() => handleSnooze('1d')}>{HE.snooze1d}</button>
                  <button type="button" style={styles.snoozeMenuItem}
                    onClick={() => handleSnooze('1w')}>{HE.snooze1w}</button>
                </div>
              )}
            </div>
            <button
              type="button"
              style={styles.actionBtn}
              onClick={(e) => {
                stop(e);
                if (onArchive) onArchive(notification.id);
              }}
              aria-label={HE.archive}
            >
              <IconArchive size={11} />
              <span>{HE.archive}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================= */
/*  Main component                                                     */
/* ================================================================= */

export default function NotificationCenter(props) {
  const {
    notifications = [],
    unreadCount: unreadCountProp,
    onMarkRead,
    onMarkAllRead,
    onNavigate,
    onSnooze,
    onArchive,
    onLoadMore,
    hasMore = false,
    loading = false,
    currentUserHandle = '',
  } = props || {};

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'unread' | 'mentions'
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [bellHover, setBellHover] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const rootRef = useRef(null);
  const listRef = useRef(null);

  /* ─── update "now" every 30 seconds for fresh time ago strings ─── */
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  /* ─── click outside closes panel ─── */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ─── ESC key closes panel ─── */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  /* ─── filtering logic ─── */
  const visible = useMemo(() => {
    const now = nowMs;
    const active = (notifications || []).filter((n) => {
      if (!n) return false;
      if (n.archived) return false;
      if (n.snoozedUntil && n.snoozedUntil > now) return false;
      return true;
    });

    let filtered = active;
    if (tab === 'unread') filtered = filtered.filter((n) => !n.read);
    if (tab === 'mentions') filtered = filtered.filter((n) => n.mentioned === true);
    if (categoryFilter) filtered = filtered.filter((n) => n.category === categoryFilter);

    // newest first
    return filtered.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [notifications, tab, categoryFilter, nowMs]);

  /* ─── counts ─── */
  const { unreadCount, mentionsCount } = useMemo(() => {
    const now = nowMs;
    let u = 0;
    let m = 0;
    for (const n of notifications || []) {
      if (!n || n.archived) continue;
      if (n.snoozedUntil && n.snoozedUntil > now) continue;
      if (!n.read) u += 1;
      if (n.mentioned && !n.read) m += 1;
    }
    return {
      unreadCount: typeof unreadCountProp === 'number' ? unreadCountProp : u,
      mentionsCount: m,
    };
  }, [notifications, nowMs, unreadCountProp]);

  /* ─── infinite scroll handler ─── */
  const handleScroll = useCallback(
    async (e) => {
      const el = e.currentTarget;
      if (!el || !hasMore || loadingMore || !onLoadMore) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 80) {
        setLoadingMore(true);
        try {
          await onLoadMore();
        } finally {
          setLoadingMore(false);
        }
      }
    },
    [hasMore, loadingMore, onLoadMore]
  );

  /* ─── render ─── */
  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={rootRef} style={styles.root} dir="rtl">
      <button
        type="button"
        aria-label={HE.ariaBell}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ ...styles.bellButton, ...(bellHover ? styles.bellButtonHover : {}) }}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setBellHover(true)}
        onMouseLeave={() => setBellHover(false)}
      >
        <IconBell size={20} />
        {unreadCount > 0 && (
          <span
            style={styles.badge}
            aria-label={`${HE.ariaUnreadBadge} ${unreadCount}`}
            data-testid="notif-badge"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={HE.title} style={styles.panel}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerTitleBlock}>
              <span style={styles.headerTitle}>{HE.title}</span>
              <span style={styles.headerSubtitle}>{HE.subtitle}</span>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                style={styles.markAllButton}
                onClick={() => { if (onMarkAllRead) onMarkAllRead(); }}
              >
                {HE.markAllRead}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div role="tablist" style={styles.tabs}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              style={{ ...styles.tab, ...(tab === 'all' ? styles.tabActive : {}) }}
              onClick={() => setTab('all')}
            >
              {HE.tabAll}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'unread'}
              style={{ ...styles.tab, ...(tab === 'unread' ? styles.tabActive : {}) }}
              onClick={() => setTab('unread')}
            >
              {HE.tabUnread}
              {unreadCount > 0 && <span style={styles.tabCount}>{unreadCount}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'mentions'}
              style={{ ...styles.tab, ...(tab === 'mentions' ? styles.tabActive : {}) }}
              onClick={() => setTab('mentions')}
            >
              {HE.tabMentions}
              {mentionsCount > 0 && <span style={styles.tabCount}>{mentionsCount}</span>}
            </button>
          </div>

          {/* Category filter */}
          <div style={styles.filterBar} aria-label={HE.filter}>
            <button
              type="button"
              style={{
                ...styles.chip,
                ...(categoryFilter === null ? styles.chipActive : {}),
              }}
              onClick={() => setCategoryFilter(null)}
            >
              {HE.allCategories}
            </button>
            {CATEGORIES.map((cat) => {
              const IconCat = CATEGORY_ICONS[cat];
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                  onClick={() => setCategoryFilter(active ? null : cat)}
                >
                  <IconCat size={12} color={active ? PALANTIR_DARK.accent : PALANTIR_DARK.textDim} />
                  <span>{CATEGORY_LABELS[cat]}</span>
                </button>
              );
            })}
          </div>

          {/* List */}
          <div
            ref={listRef}
            role="list"
            style={styles.list}
            onScroll={handleScroll}
            data-testid="notif-list"
          >
            {loading && visible.length === 0 && (
              <div style={styles.empty}>
                <div style={styles.emptyTitle}>{HE.loading}</div>
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div style={styles.empty}>
                <div style={styles.emptyTitle}>{HE.empty}</div>
                <div style={styles.emptyHint}>{HE.emptyHint}</div>
              </div>
            )}

            {visible.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={onMarkRead}
                onNavigate={onNavigate}
                onSnooze={onSnooze}
                onArchive={onArchive}
                nowMs={nowMs}
              />
            ))}

            {loadingMore && (
              <div style={{ ...styles.empty, padding: 20 }}>
                <div style={styles.emptyHint}>{HE.loading}</div>
              </div>
            )}
          </div>

          {/* Footer */}
          {visible.length > 0 && (
            <div style={styles.footer}>
              {visible.length} {visible.length === 1 ? 'פריט' : 'פריטים'}
              {hasMore && !loadingMore && ' · גלול לעוד'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================= */
/*  Named exports for testing                                          */
/* ================================================================= */

export {
  PALANTIR_DARK,
  CATEGORIES,
  CATEGORY_LABELS,
  SNOOZE_DURATIONS,
  HE as NOTIFICATION_CENTER_HE,
  NotificationItem,
};
