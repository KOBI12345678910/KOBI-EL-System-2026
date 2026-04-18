// Palantir dark theme tokens
export const COLORS = {
  bg: '#10161A',
  bgAlt: '#1C2127',
  bgCard: '#252A31',
  border: 'rgba(255,255,255,0.08)',
  text: '#F5F8FA',
  textMuted: '#8A9BA8',
  accent: '#2D72D2',
  accentHover: '#388BFD',
  success: '#3DCC91',
  warning: '#FFA500',
  danger: '#FF7373',
  info: '#48AFF0',
};

export const FONT = {
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'Inter', 'Segoe UI', sans-serif",
};

export const CARD_STYLE: React.CSSProperties = {
  background: COLORS.bgCard,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: 20,
};

import React from 'react';
export default { COLORS, FONT, CARD_STYLE };

export const theme = { COLORS, FONT, CARD_STYLE };
