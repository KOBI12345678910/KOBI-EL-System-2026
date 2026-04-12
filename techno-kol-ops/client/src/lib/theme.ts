/**
 * Palantir-style dark theme tokens for techno-kol-ops.
 *
 * Mirrors the Onyx Procurement dashboard palette already used across
 * App.tsx / Sidebar.tsx (#1C2127, #252A31, #2F343C, #383E47, #FFA500…).
 * Use these tokens instead of hardcoded hex values.
 *
 * Example:
 *   import { theme } from '@/lib/theme';
 *   <div style={{ background: theme.colors.bg, color: theme.colors.text }} />
 */

export const palantirColors = {
  // Surfaces
  bgDeep: '#14181D',       // page background (deepest)
  bg: '#1C2127',           // main background / sidebar
  bgElevated: '#252A31',   // layout wrapper (matches App.tsx)
  bgCard: '#2F343C',       // card / panel
  bgInput: '#383E47',      // input / control
  bgHover: 'rgba(255,255,255,0.05)',
  bgActive: 'rgba(255,165,0,0.10)',

  // Text
  text: '#F6F7F9',
  textMuted: '#ABB3BF',
  textDim: '#5C7080',
  textDisabled: '#404854',

  // Borders
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',
  borderFocus: '#FFA500',

  // Brand / accents
  accent: '#FFA500',           // Palantir orange
  accentSoft: 'rgba(255,165,0,0.15)',
  accentBorder: '#FFA500',

  // Status
  success: '#32A467',
  successSoft: 'rgba(50,164,103,0.15)',
  warning: '#EC9A3C',
  warningSoft: 'rgba(236,154,60,0.15)',
  danger: '#FC8585',
  dangerSoft: 'rgba(252,133,133,0.15)',
  info: '#4C90F0',
  infoSoft: 'rgba(76,144,240,0.15)',

  // Charts (series palette)
  chart: [
    '#FFA500',
    '#4C90F0',
    '#32A467',
    '#EC9A3C',
    '#AC2F33',
    '#8F398F',
    '#00B3A4',
    '#D1F26D',
  ],
} as const;

export const palantirTypography = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", "Rubik", "Arial Hebrew", sans-serif',
  fontMono:
    '"JetBrains Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace',

  // Font sizes (px)
  size: {
    xxs: 9,
    xs: 10,
    sm: 11,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 26,
    display: 36,
  },

  // Font weights
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line-heights
  lineHeight: {
    tight: 1.15,
    base: 1.4,
    relaxed: 1.6,
  },

  // Letter-spacing
  tracking: {
    normal: '0',
    wide: '0.1em',
    wider: '0.12em',
    widest: '0.15em',
  },
} as const;

export const palantirSpacing = {
  /** 4 */ xxs: 4,
  /** 6 */ xs: 6,
  /** 8 */ sm: 8,
  /** 12 */ md: 12,
  /** 16 */ base: 16,
  /** 20 */ lg: 20,
  /** 24 */ xl: 24,
  /** 32 */ xxl: 32,
  /** 40 */ xxxl: 40,
  /** 48 */ jumbo: 48,
} as const;

export const palantirRadius = {
  none: 0,
  xs: 2,
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 9999,
} as const;

export const palantirShadow = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.4)',
  md: '0 2px 8px rgba(0,0,0,0.45)',
  lg: '0 8px 24px rgba(0,0,0,0.55)',
  glowAccent: '0 0 0 1px rgba(255,165,0,0.4)',
} as const;

export const palantirLayout = {
  navbarHeight: 48,
  sidebarWidth: 240,
  sidebarCollapsedWidth: 0,
  maxContentWidth: 1600,
  dir: 'rtl' as const,
  lang: 'he' as const,
} as const;

export const palantirZ = {
  base: 0,
  dropdown: 50,
  sidebar: 99,
  navbar: 100,
  modal: 200,
  toast: 300,
  tooltip: 400,
} as const;

/**
 * Unified theme object — prefer this as the import root.
 */
export const theme = {
  colors: palantirColors,
  typography: palantirTypography,
  spacing: palantirSpacing,
  radius: palantirRadius,
  shadow: palantirShadow,
  layout: palantirLayout,
  z: palantirZ,
} as const;

export type PalantirTheme = typeof theme;

/**
 * CSS variables map — spread into :root or a container style to expose
 * the tokens to plain CSS / Blueprint overrides.
 */
export const cssVariables: Record<string, string | number> = {
  '--tk-bg-deep': palantirColors.bgDeep,
  '--tk-bg': palantirColors.bg,
  '--tk-bg-elevated': palantirColors.bgElevated,
  '--tk-bg-card': palantirColors.bgCard,
  '--tk-bg-input': palantirColors.bgInput,
  '--tk-text': palantirColors.text,
  '--tk-text-muted': palantirColors.textMuted,
  '--tk-text-dim': palantirColors.textDim,
  '--tk-border': palantirColors.border,
  '--tk-accent': palantirColors.accent,
  '--tk-success': palantirColors.success,
  '--tk-warning': palantirColors.warning,
  '--tk-danger': palantirColors.danger,
  '--tk-info': palantirColors.info,
  '--tk-font-family': palantirTypography.fontFamily,
  '--tk-navbar-height': `${palantirLayout.navbarHeight}px`,
  '--tk-sidebar-width': `${palantirLayout.sidebarWidth}px`,
};

export default theme;
