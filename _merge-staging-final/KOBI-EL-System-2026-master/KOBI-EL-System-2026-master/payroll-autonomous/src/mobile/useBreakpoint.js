/**
 * useBreakpoint — Agent X-20 / Swarm 3 / Techno-Kol Uzi mega-ERP 2026
 * Mobile-responsive breakpoint hook.
 *
 * Zero dependencies. SSR-safe. window.matchMedia powered.
 *
 * Breakpoints:
 *   mobile   : width <  768
 *   tablet   : width >= 768 and width < 1024
 *   desktop  : width >= 1024
 *
 * Returns:
 *   {
 *     bp: 'mobile' | 'tablet' | 'desktop',
 *     width: number,
 *     isMobile: boolean,
 *     isTablet: boolean,
 *     isDesktop: boolean,
 *   }
 *
 * SSR-safe: on the server (no window) it returns a stable default of
 * 'desktop' so server-rendered markup matches the most common case.
 * The hook re-evaluates on mount so the client hydrates correctly.
 *
 * Usage:
 *   const { bp, isMobile } = useBreakpoint();
 *   if (isMobile) return <MobileLayout />;
 */

import { useState, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const BREAKPOINTS = Object.freeze({
  mobile: 0,
  tablet: 768,
  desktop: 1024,
});

export const BP_QUERIES = Object.freeze({
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
});

/* ------------------------------------------------------------------ */
/*  Pure helpers (exported for tests)                                  */
/* ------------------------------------------------------------------ */

/**
 * Pure function — given a width in px, return the breakpoint name.
 * Exported so tests can validate logic without touching window.
 */
export function getBreakpointForWidth(width) {
  const w = Number(width) || 0;
  if (w < BREAKPOINTS.tablet) return 'mobile';
  if (w < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

/**
 * Build the full descriptor object from a width.
 * Pure function for easy testing.
 */
export function describeBreakpoint(width) {
  const bp = getBreakpointForWidth(width);
  return {
    bp,
    width: Number(width) || 0,
    isMobile: bp === 'mobile',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
  };
}

/* SSR-safe default — we assume desktop so server HTML matches the
 * common case; the hook re-evaluates on the client at mount. */
export const SSR_DEFAULT = Object.freeze(describeBreakpoint(1280));

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export default function useBreakpoint() {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined' || !window.innerWidth) {
      return SSR_DEFAULT;
    }
    return describeBreakpoint(window.innerWidth);
  });

  const recompute = useCallback(() => {
    if (typeof window === 'undefined') return;
    setState(describeBreakpoint(window.innerWidth));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    // Immediately sync on mount so SSR → client transitions work.
    recompute();

    const mqls = [
      window.matchMedia(BP_QUERIES.mobile),
      window.matchMedia(BP_QUERIES.tablet),
      window.matchMedia(BP_QUERIES.desktop),
    ];

    const handler = () => recompute();

    mqls.forEach((mql) => {
      // Safari < 14 uses addListener, modern uses addEventListener
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(handler);
      }
    });

    // Fallback: also listen to resize for environments where
    // matchMedia events don't fire (old browsers, test harnesses).
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);

    return () => {
      mqls.forEach((mql) => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handler);
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(handler);
        }
      });
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, [recompute]);

  return state;
}
