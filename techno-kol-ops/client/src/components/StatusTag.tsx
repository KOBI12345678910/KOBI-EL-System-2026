import React from 'react';

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending:    { bg: 'rgba(255,184,0,0.15)',  color: '#FFB366', label: 'הכנה' },
  production: { bg: 'rgba(72,175,240,0.15)', color: '#48AFF0', label: 'ייצור' },
  finishing:  { bg: 'rgba(157,78,221,0.15)', color: '#C99EEC', label: 'גימור' },
  ready:      { bg: 'rgba(61,204,145,0.15)', color: '#3DCC91', label: 'מוכן' },
  delivered:  { bg: 'rgba(255,255,255,0.05)',color: '#5C7080', label: 'נמסר' },
  cancelled:  { bg: 'rgba(252,133,133,0.1)', color: '#FC8585', label: 'בוטל' },
};

export function StatusTag({ status }: { status: string }) {
  const cfg = STATUS_COLORS[status] || { bg: 'rgba(255,255,255,0.05)', color: '#5C7080', label: status };
  return (
    <span style={{
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      padding: '2px 8px',
      fontSize: 10,
      letterSpacing: '0.08em',
      borderRadius: 2,
      whiteSpace: 'nowrap',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      {cfg.label}
    </span>
  );
}
