import React from 'react';

interface Props {
  label: string;
  value: string | number;
  delta?: string;
  color?: string;
  onClick?: () => void;
}

export function MetricCard({ label, value, delta, color = '#FFA500', onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#2F343C',
        border: '1px solid rgba(255,255,255,0.1)',
        borderTop: `2px solid ${color}`,
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}
      onMouseEnter={e => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.background = '#383E47';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = '#2F343C';
      }}
    >
      <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 11, color: '#5C7080' }}>{delta}</div>
      )}
    </div>
  );
}
