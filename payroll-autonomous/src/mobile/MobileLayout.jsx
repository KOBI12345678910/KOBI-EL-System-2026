/**
 * MobileLayout — Agent X-20 / Swarm 3 / Techno-Kol Uzi mega-ERP 2026
 * Responsive application shell.
 *
 * Zero deps. Inline styles. Real JSX.
 *
 * Layout:
 *   - mobile  (<768px)     : single-column stack, hamburger top bar, BottomNav
 *   - tablet  (768-1024)   : 2-col grid (sidebar 240 + content), BottomNav optional
 *   - desktop (>=1024)     : 3-col grid (sidebar 260 + content + aside 320)
 *
 * Features:
 *   - Hebrew RTL throughout
 *   - Palantir dark theme
 *   - Top app bar with hamburger button (mobile only)
 *   - Slide-in drawer from inline-end for mobile nav
 *   - ESC closes drawer
 *   - Safe area insets honored
 *
 * Props:
 *   title        : string (header title) — default "מערכת 2026"
 *   subtitle     : string (small subtitle under title)
 *   sidebar      : ReactNode — permanent sidebar content for tablet/desktop
 *   children     : ReactNode — main content
 *   aside        : ReactNode — right aside, desktop only
 *   bottomNav    : ReactNode — renders at the bottom on mobile
 *   onMenuToggle : (isOpen) => void  optional callback
 *   breakpoint   : descriptor from useBreakpoint() — injected so parents can share one instance
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import useBreakpoint from './useBreakpoint.js';

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

export const MOBILE_LAYOUT_THEME = Object.freeze({
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  scrim: 'rgba(0, 0, 0, 0.6)',
});

/* ------------------------------------------------------------------ */
/*  Hamburger Icon                                                     */
/* ------------------------------------------------------------------ */

function HamburgerIcon({ color, size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon({ color, size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function MobileLayout({
  title = 'מערכת 2026',
  subtitle = 'Techno-Kol ERP',
  sidebar,
  aside,
  bottomNav,
  children,
  onMenuToggle,
  breakpoint: breakpointProp,
  theme = MOBILE_LAYOUT_THEME,
}) {
  const bpHook = useBreakpoint();
  const bp = breakpointProp || bpHook;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  const toggleDrawer = useCallback(
    (nextVal) => {
      setDrawerOpen((prev) => {
        const next = typeof nextVal === 'boolean' ? nextVal : !prev;
        if (typeof onMenuToggle === 'function') onMenuToggle(next);
        return next;
      });
    },
    [onMenuToggle]
  );

  // Auto-close the drawer when we leave mobile
  useEffect(() => {
    if (!bp.isMobile && drawerOpen) setDrawerOpen(false);
  }, [bp.isMobile, drawerOpen]);

  // ESC closes drawer
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') toggleDrawer(false);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKey);
      }
    };
  }, [drawerOpen, toggleDrawer]);

  /* -------------------- styles -------------------- */

  const shellStyle = {
    direction: 'rtl',
    minHeight: '100vh',
    background: theme.bg,
    color: theme.text,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", "Rubik", Arial, sans-serif',
    WebkitFontSmoothing: 'antialiased',
    paddingInlineStart: 'env(safe-area-inset-left, 0px)',
    paddingInlineEnd: 'env(safe-area-inset-right, 0px)',
  };

  const topBarStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 800,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    background: theme.panel,
    borderBottom: `1px solid ${theme.border}`,
    minHeight: 56,
  };

  const titleBlockStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    lineHeight: 1.1,
  };

  const titleStyle = {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: theme.text,
  };

  const subtitleStyle = {
    margin: 0,
    fontSize: 11,
    fontWeight: 500,
    color: theme.textDim,
    letterSpacing: 0.3,
  };

  const hamburgerStyle = {
    appearance: 'none',
    WebkitAppearance: 'none',
    border: `1px solid ${theme.border}`,
    background: theme.panel2,
    color: theme.text,
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  };

  // Grid layout for tablet/desktop
  const contentContainerStyle = bp.isMobile
    ? {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        paddingBottom: bottomNav ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : 0,
      }
    : bp.isTablet
    ? {
        display: 'grid',
        gridTemplateColumns: '240px minmax(0, 1fr)',
        gap: 16,
        padding: 16,
        alignItems: 'start',
      }
    : {
        display: 'grid',
        gridTemplateColumns: '260px minmax(0, 1fr) 320px',
        gap: 16,
        padding: 24,
        alignItems: 'start',
      };

  const sidebarBoxStyle = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: 14,
    minHeight: 200,
    position: 'sticky',
    top: 72,
  };

  const mainBoxStyle = {
    background: bp.isMobile ? theme.bg : theme.panel,
    border: bp.isMobile ? 'none' : `1px solid ${theme.border}`,
    borderRadius: bp.isMobile ? 0 : 10,
    padding: bp.isMobile ? '14px 14px 24px' : 18,
    minHeight: 200,
    minWidth: 0,
  };

  const asideBoxStyle = {
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: 14,
    minHeight: 200,
    position: 'sticky',
    top: 72,
  };

  /* -------------------- drawer (mobile only) -------------------- */

  const drawerStyle = {
    position: 'fixed',
    top: 0,
    bottom: 0,
    insetInlineEnd: 0,
    width: 'min(82vw, 320px)',
    background: theme.panel,
    borderInlineStart: `1px solid ${theme.border}`,
    zIndex: 1100,
    transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    boxShadow: drawerOpen ? '-6px 0 18px rgba(0,0,0,0.45)' : 'none',
    padding: 16,
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
    direction: 'rtl',
    overflowY: 'auto',
  };

  const scrimStyle = {
    position: 'fixed',
    inset: 0,
    background: theme.scrim,
    opacity: drawerOpen ? 1 : 0,
    pointerEvents: drawerOpen ? 'auto' : 'none',
    transition: 'opacity 200ms ease',
    zIndex: 1050,
  };

  /* -------------------- render -------------------- */

  return (
    <div
      style={shellStyle}
      dir="rtl"
      lang="he"
      data-component="mobile-layout"
      data-breakpoint={bp.bp}
    >
      <header role="banner" style={topBarStyle}>
        {bp.isMobile ? (
          <button
            type="button"
            onClick={() => toggleDrawer()}
            aria-label="פתח תפריט"
            aria-expanded={drawerOpen ? 'true' : 'false'}
            aria-controls="mobile-layout-drawer"
            style={hamburgerStyle}
          >
            <HamburgerIcon color={theme.text} />
          </button>
        ) : (
          <div style={{ width: 44 }} aria-hidden="true" />
        )}

        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle && <small style={subtitleStyle}>{subtitle}</small>}
        </div>
      </header>

      <div style={contentContainerStyle} data-role="content-grid">
        {!bp.isMobile && sidebar && (
          <aside style={sidebarBoxStyle} aria-label="ניווט צדדי" data-role="sidebar">
            {sidebar}
          </aside>
        )}

        <main role="main" style={mainBoxStyle} data-role="main">
          {children}
        </main>

        {bp.isDesktop && aside && (
          <aside style={asideBoxStyle} aria-label="מידע נוסף" data-role="aside">
            {aside}
          </aside>
        )}
      </div>

      {/* Mobile drawer */}
      {bp.isMobile && (
        <>
          <div
            style={scrimStyle}
            onClick={() => toggleDrawer(false)}
            aria-hidden="true"
            data-role="scrim"
          />
          <aside
            ref={drawerRef}
            id="mobile-layout-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="תפריט ראשי"
            style={drawerStyle}
            data-open={drawerOpen ? 'true' : 'false'}
            data-role="drawer"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: 15, color: theme.text }}>תפריט</strong>
              <button
                type="button"
                onClick={() => toggleDrawer(false)}
                aria-label="סגור תפריט"
                style={{ ...hamburgerStyle, width: 40, height: 40, minWidth: 40, minHeight: 40 }}
              >
                <CloseIcon color={theme.text} size={20} />
              </button>
            </div>
            {sidebar || (
              <p style={{ color: theme.textDim, fontSize: 13 }}>
                אין תוכן לתפריט. העבר sidebar prop.
              </p>
            )}
          </aside>
        </>
      )}

      {bp.isMobile && bottomNav && (
        <div data-role="bottom-nav-slot">
          {bottomNav}
        </div>
      )}
    </div>
  );
}
