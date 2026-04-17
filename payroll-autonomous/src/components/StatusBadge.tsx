import React from 'react';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  approved:  { color: '#3DCC91', label: 'אושר' },
  pending:   { color: '#FFA500', label: 'ממתין' },
  rejected:  { color: '#FF7373', label: 'נדחה' },
  paid:      { color: '#48AFF0', label: 'שולם' },
  cancelled: { color: '#8A9BA8', label: 'בוטל' },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { color: '#8A9BA8', label: status };
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      style={{
        color: cfg.color,
        border: `1px solid ${cfg.color}60`,
        background: `${cfg.color}18`,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {cfg.label}
    </span>
  );
}

export default StatusBadge;
