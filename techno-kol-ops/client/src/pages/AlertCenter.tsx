import React, { useEffect } from 'react';
import { useApi, api } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { formatDateTime } from '../utils/format';

const SEV_COLOR: any = { danger: '#FC8585', warning: '#FFB366', info: '#48AFF0', critical: '#FF0000' };

export function AlertCenter() {
  const { data: alerts, fetch } = useApi<any[]>('/api/alerts');
  const { resolveAlert } = useStore();

  useEffect(() => { fetch(); }, []);

  const handleResolve = async (id: string) => {
    await api.put(`/api/alerts/${id}/resolve`, {});
    resolveAlert(id);
    fetch();
  };

  const open = (alerts || []).filter(a => !a.is_resolved);
  const resolved = (alerts || []).filter(a => a.is_resolved);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>מרכז התראות</h1>
        <span style={{ marginRight: 12, color: open.length > 0 ? '#FC8585' : '#3DCC91', fontSize: 12 }}>
          {open.length} פתוחות
        </span>
      </div>

      <h2 style={{ color: '#ABB3BF', fontSize: 13, fontWeight: 500, marginBottom: 8, letterSpacing: '0.1em' }}>
        התראות פתוחות
      </h2>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
        {open.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#3DCC91', fontSize: 13 }}>✓ אין התראות פתוחות</div>
        )}
        {open.map((a: any) => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
            <div style={{ width: 3, minHeight: 40, background: SEV_COLOR[a.severity], borderRadius: 1, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500, marginBottom: 4 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: '#ABB3BF', marginBottom: 4 }}>{a.message}</div>
              <div style={{ fontSize: 10, color: '#5C7080' }}>{formatDateTime(a.created_at)}</div>
            </div>
            <span style={{ fontSize: 9, border: `1px solid ${SEV_COLOR[a.severity]}40`, color: SEV_COLOR[a.severity], padding: '2px 7px' }}>
              {a.severity}
            </span>
            <button
              onClick={() => handleResolve(a.id)}
              style={{ background: 'rgba(61,204,145,0.1)', border: '1px solid #3DCC91', color: '#3DCC91', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
            >
              ✓ סגור
            </button>
          </div>
        ))}
      </div>

      <h2 style={{ color: '#5C7080', fontSize: 13, fontWeight: 500, marginBottom: 8, letterSpacing: '0.1em' }}>
        הסטוריה ({resolved.length})
      </h2>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', opacity: 0.6 }}>
        {resolved.slice(0, 20).map((a: any) => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>
            <div style={{ width: 3, height: 24, background: '#383E47', borderRadius: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#5C7080' }}>{a.title}</div>
            </div>
            <span style={{ fontSize: 10, color: '#3DCC91' }}>✓ נסגר</span>
            <span style={{ fontSize: 9, color: '#3D4F6A' }}>{formatDateTime(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
