import React, { useEffect, useState } from 'react';
import { useApi, api } from '../hooks/useApi';
import { daysUntil } from '../utils/format';

const COLUMNS = [
  { key: 'pending', label: 'הכנה', color: '#FFB366' },
  { key: 'production', label: 'ייצור', color: '#48AFF0' },
  { key: 'finishing', label: 'גימור', color: '#9D4EDD' },
  { key: 'ready', label: 'מוכן למסירה', color: '#3DCC91' },
  { key: 'delivered', label: 'נמסר', color: '#5C7080' },
];

export function ProductionFloor() {
  const { data: orders, fetch } = useApi<any[]>('/api/work-orders');
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => { fetch(); }, []);

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = (orders || []).filter(o => o.status === col.key);
    return acc;
  }, {} as Record<string, any[]>);

  const handleDrop = async (orderId: string, newStatus: string) => {
    await api.put(`/api/work-orders/${orderId}`, { status: newStatus });
    fetch();
    setDragging(null);
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>ריצפת ייצור</h1>
        <span style={{ marginRight: 12, fontSize: 11, color: '#5C7080' }}>גרור הזמנות בין עמודות לעדכון סטטוס</span>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', minHeight: 'calc(100vh - 160px)' }}>
        {COLUMNS.map(col => (
          <div
            key={col.key}
            style={{ flex: '0 0 240px', minHeight: 200 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const id = e.dataTransfer.getData('orderId');
              if (id) handleDrop(id, col.key);
            }}
          >
            <div style={{
              background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)',
              borderTop: `2px solid ${col.color}`, height: '100%'
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontSize: 11, color: col.color, fontWeight: 600, letterSpacing: '0.08em' }}>{col.label}</span>
                <span style={{ fontSize: 11, color: '#5C7080', background: '#383E47', padding: '1px 7px' }}>
                  {grouped[col.key]?.length || 0}
                </span>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(grouped[col.key] || []).map(order => {
                  const days = daysUntil(order.delivery_date);
                  return (
                    <div
                      key={order.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('orderId', order.id);
                        setDragging(order.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      style={{
                        background: dragging === order.id ? '#4A5568' : '#383E47',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '10px 12px',
                        cursor: 'grab',
                        opacity: dragging === order.id ? 0.5 : 1,
                        transition: 'opacity 0.1s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#5C7080', fontFamily: 'monospace' }}>{order.id}</span>
                        <span style={{
                          fontSize: 9,
                          color: days < 0 ? '#FC8585' : days <= 2 ? '#FFB366' : '#5C7080'
                        }}>
                          {days < 0 ? `${Math.abs(days)} ימים איחור` : `${days} ימים`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#F6F7F9', fontWeight: 500, marginBottom: 2 }}>{order.product}</div>
                      <div style={{ fontSize: 10, color: '#ABB3BF', marginBottom: 8 }}>{order.client_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ flex: 1, height: 3, background: '#2F343C' }}>
                          <div style={{ width: `${order.progress}%`, height: '100%', background: col.color }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#5C7080' }}>{order.progress}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
