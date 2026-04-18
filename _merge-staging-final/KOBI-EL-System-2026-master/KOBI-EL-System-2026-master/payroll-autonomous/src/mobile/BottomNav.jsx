/**
 * BottomNav — Agent X-20 / Swarm 3 / Techno-Kol Uzi mega-ERP 2026
 * Mobile bottom navigation bar.
 *
 * Zero deps. Inline styles. Real JSX.
 *
 * Features:
 *   - 5 tabs: בית / מסמכים / הוספה (FAB) / דוחות / הגדרות
 *   - Active state with accent color (#4a9eff)
 *   - Large touch targets (>= 48px)
 *   - Safe area inset for iPhone notch (env(safe-area-inset-bottom))
 *   - Haptic feedback stub (navigator.vibrate)
 *   - Hebrew RTL, bilingual labels
 *   - Palantir dark theme
 *
 * Props:
 *   activeTab     : 'home' | 'documents' | 'add' | 'reports' | 'settings'
 *   onNavigate    : (tabId) => void
 *   onAdd         : () => void   — invoked when FAB tapped (falls back to onNavigate)
 *   hapticEnabled : boolean      — default true
 *   theme         : object       — override colors (optional)
 */

import React, { useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

export const BOTTOM_NAV_THEME = Object.freeze({
  bg: '#0b0d10',
  panel: '#13171c',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  accentGlow: 'rgba(74, 158, 255, 0.18)',
  fabBg: '#4a9eff',
  fabText: '#ffffff',
});

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

export const BOTTOM_NAV_TABS = Object.freeze([
  {
    id: 'home',
    he: 'בית',
    en: 'Home',
    icon: 'M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z',
  },
  {
    id: 'documents',
    he: 'מסמכים',
    en: 'Documents',
    icon: 'M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1v5h5',
  },
  {
    id: 'add',
    he: 'הוספה',
    en: 'Add',
    icon: 'M12 5v14M5 12h14',
    isFab: true,
  },
  {
    id: 'reports',
    he: 'דוחות',
    en: 'Reports',
    icon: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  },
  {
    id: 'settings',
    he: 'הגדרות',
    en: 'Settings',
    icon:
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 2h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 22h4l.4-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  },
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fires a short haptic pulse if supported.
 * Safe on all platforms — silently no-ops if navigator.vibrate unavailable.
 */
export function triggerHaptic(pattern = 10) {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.vibrate !== 'function') return false;
  try {
    navigator.vibrate(pattern);
    return true;
  } catch (_err) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  SVG Icon                                                           */
/* ------------------------------------------------------------------ */

function NavIcon({ path, size = 24, color, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BottomNav({
  activeTab = 'home',
  onNavigate = () => {},
  onAdd,
  hapticEnabled = true,
  theme = BOTTOM_NAV_THEME,
  tabs = BOTTOM_NAV_TABS,
}) {
  const handleTap = useCallback(
    (tab) => {
      if (hapticEnabled) triggerHaptic(tab.isFab ? [15, 10, 15] : 10);
      if (tab.isFab && typeof onAdd === 'function') {
        onAdd(tab.id);
        return;
      }
      onNavigate(tab.id);
    },
    [hapticEnabled, onAdd, onNavigate]
  );

  const wrapStyle = {
    position: 'fixed',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    bottom: 0,
    direction: 'rtl',
    background: theme.panel,
    borderTop: `1px solid ${theme.border}`,
    boxShadow: '0 -4px 14px rgba(0,0,0,0.35)',
    zIndex: 1000,
    // iPhone notch / home indicator safe area
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingInlineStart: 'env(safe-area-inset-left, 0px)',
    paddingInlineEnd: 'env(safe-area-inset-right, 0px)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", "Rubik", Arial, sans-serif',
  };

  const rowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    minHeight: 64,
  };

  return (
    <nav
      role="navigation"
      aria-label="ניווט ראשי"
      dir="rtl"
      style={wrapStyle}
      data-component="bottom-nav"
    >
      <ul style={{ ...rowStyle, listStyle: 'none', margin: 0, padding: 0 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isFab = !!tab.isFab;

          const itemColor = isActive ? theme.accent : theme.textDim;

          const buttonStyle = {
            appearance: 'none',
            WebkitAppearance: 'none',
            border: 'none',
            background: 'transparent',
            color: itemColor,
            minWidth: 48,
            minHeight: 48,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '8px 4px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            fontWeight: isActive ? 700 : 500,
            position: 'relative',
            transition: 'color 150ms ease',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          };

          const fabWrap = {
            position: 'relative',
            minWidth: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          };

          const fabButton = {
            appearance: 'none',
            WebkitAppearance: 'none',
            border: 'none',
            background: theme.fabBg,
            color: theme.fabText,
            width: 56,
            height: 56,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: `0 6px 18px ${theme.accentGlow}, 0 2px 6px rgba(0,0,0,0.5)`,
            transform: 'translateY(-14px)',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          };

          if (isFab) {
            return (
              <li
                key={tab.id}
                style={fabWrap}
                data-tab={tab.id}
                data-testid={`bottom-nav-item-${tab.id}`}
              >
                <button
                  type="button"
                  aria-label={`${tab.he} (${tab.en})`}
                  onClick={() => handleTap(tab)}
                  style={fabButton}
                  data-fab="true"
                >
                  <NavIcon path={tab.icon} size={28} color={theme.fabText} strokeWidth={2.4} />
                </button>
              </li>
            );
          }

          return (
            <li
              key={tab.id}
              style={{ flex: 1, display: 'flex' }}
              data-tab={tab.id}
              data-active={isActive ? 'true' : 'false'}
              data-testid={`bottom-nav-item-${tab.id}`}
            >
              <button
                type="button"
                aria-label={`${tab.he} (${tab.en})`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleTap(tab)}
                style={buttonStyle}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 0,
                      insetInlineStart: '50%',
                      transform: 'translateX(-50%)',
                      width: 32,
                      height: 3,
                      borderRadius: '0 0 3px 3px',
                      background: theme.accent,
                      boxShadow: `0 0 8px ${theme.accentGlow}`,
                    }}
                  />
                )}
                <NavIcon path={tab.icon} size={22} color={itemColor} />
                <span style={{ lineHeight: 1, marginTop: 2 }}>{tab.he}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
