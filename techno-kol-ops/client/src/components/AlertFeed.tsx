import React from 'react';
import { useStore } from '../store/useStore';
import { api } from '../hooks/useApi';
import { formatDateTime } from '../utils/format';

const SEV_COLOR: Record<string, string> = {
  danger: '#FC8585',
  warning: '#FFB366',
  info: '#48AFF0',
  critical: '#FF0000'
};

export function AlertFeed() {
  const { alerts, resolveAlert } = useStore();
  const open = alerts.filter(a => !a.is_resolved).slice(0, 12);

  const handleResolve = async (id: string) => {
    await api.put(`/api/alerts/${id}/resolve`, {});
    resolveAlert(id);
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {open.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#3DCC91', fontSize: 12 }}>
          ✓ אין התראות פתוחות
        </div>
      )}
      {open.map(alert => (
        <div key={alert.id} style={{
          display: 'flex',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          alignItems: 'flex-start'
        }}>
          <div style={{
            width: 3, minHeight: 32, borderRadius: 1,
            background: SEV_COLOR[alert.severity] || '#ABB3BF',
            flexShrink: 0, marginTop: 2
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#F6F7F9', marginBottom: 2, fontWeight: 500 }}>
              {alert.title}
            </div>
            <div style={{ fontSize: 10, color: '#5C7080' }}>{alert.message}</div>
            <div style={{ fontSize: 9, color: '#3D4F6A', marginTop: 3 }}>
              {formatDateTime(alert.created_at)}
            </div>
          </div>
          <button
            onClick={() => handleResolve(alert.id)}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              color: '#5C7080', fontSize: 9, padding: '2px 6px', cursor: 'pointer'
            }}
          >
            ✓
          </button>
        </div>
      ))}
    </div>
  );
}
