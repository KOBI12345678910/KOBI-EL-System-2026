/**
 * InventoryAlerts — התראות מלאי
 * Shows materials that are low or out of stock, with reorder actions.
 */
import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

interface Material {
  id: number;
  name: string;
  qty: number;
  min_qty: number;
  unit: string;
  supplier?: string;
  order_qty?: number;
}

// Mock fallback
const MOCK_MATERIALS: Material[] = [
  { id: 1,  name: 'פרופיל 40×40',           qty: 0,   min_qty: 50,  unit: "מ'",  supplier: 'פלדות הצפון',   order_qty: 200 },
  { id: 2,  name: 'פרופיל 50×50',           qty: 12,  min_qty: 30,  unit: "מ'",  supplier: 'פלדות הצפון',   order_qty: 100 },
  { id: 3,  name: 'פח מילוי 1.5mm',         qty: 0,   min_qty: 20,  unit: 'מ"ר', supplier: 'מתכות רמת גן',  order_qty: 80  },
  { id: 4,  name: 'פרופיל אלומיניום 40×40', qty: 85,  min_qty: 40,  unit: "מ'",  supplier: 'אלומיניום ישיר', order_qty: 150 },
  { id: 5,  name: 'ברגים M8',               qty: 150, min_qty: 500, unit: "יח'", supplier: 'אורן כלי עבודה', order_qty: 2000 },
  { id: 6,  name: 'ברגים M6',               qty: 0,   min_qty: 200, unit: "יח'", supplier: 'אורן כלי עבודה', order_qty: 1000 },
  { id: 7,  name: 'אבקה לצביעה שחור',       qty: 8,   min_qty: 15,  unit: 'ק"ג', supplier: 'צבעי ים תיכון',  order_qty: 50  },
  { id: 8,  name: 'זכוכית מחוסמת 8mm',      qty: 22,  min_qty: 10,  unit: 'מ"ר', supplier: 'זכוכית גלבוע',  order_qty: 40  },
  { id: 9,  name: 'ציר כבד',                qty: 5,   min_qty: 20,  unit: "יח'", supplier: 'פרזול גיל',      order_qty: 50  },
  { id: 10, name: 'מנעול',                  qty: 0,   min_qty: 10,  unit: "יח'", supplier: 'פרזול גיל',      order_qty: 30  },
];

type Status = 'out' | 'low' | 'ok';

function getStatus(m: Material): Status {
  if (m.qty === 0) return 'out';
  if (m.qty < m.min_qty) return 'low';
  return 'ok';
}

export function InventoryAlerts() {
  const { data: apiData, loading } = useApi<Material[]>('/api/materials');
  const [ordered, setOrdered] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'out' | 'low'>('all');

  const materials: Material[] = (apiData && apiData.length > 0) ? apiData : MOCK_MATERIALS;

  const filtered = materials.filter(m => {
    const st = getStatus(m);
    if (filter === 'out') return st === 'out';
    if (filter === 'low') return st === 'low';
    return true;
  });

  const outCount = materials.filter(m => getStatus(m) === 'out').length;
  const lowCount = materials.filter(m => getStatus(m) === 'low').length;
  const okCount  = materials.filter(m => getStatus(m) === 'ok').length;
  const pendingAlerts = materials.filter(m => getStatus(m) !== 'ok' && !ordered.has(m.id)).length;

  const handleOrder = (id: number) => setOrdered(prev => new Set([...prev, id]));
  const handleOrderAll = () => {
    const ids = materials.filter(m => getStatus(m) !== 'ok' && !ordered.has(m.id)).map(m => m.id);
    setOrdered(prev => new Set([...prev, ...ids]));
  };

  return (
    <div style={{ direction: 'rtl', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#1e3a5f' }}>
        📦 התראות מלאי
      </h1>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 18px', fontWeight: 700, color: '#b91c1c' }}>
          🔴 {outCount} פריטים אזלו מהמלאי
        </div>
        <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 18px', fontWeight: 700, color: '#92400e' }}>
          🟡 {lowCount} פריטים במלאי נמוך
        </div>
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 18px', fontWeight: 700, color: '#166534' }}>
          🟢 {okCount} פריטים תקינים
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['all', 'out', 'low'] as const).map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid',
              borderColor: filter === f ? '#2563eb' : '#d1d5db',
              background: filter === f ? '#eff6ff' : '#fff',
              color: filter === f ? '#2563eb' : '#374151',
              cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            }}>
            {f === 'all' ? 'הכל' : f === 'out' ? '🔴 אזל' : '🟡 נמוך'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>סטטוס</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>שם חומר</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>כמות נוכחית</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>כמות מינימום</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>יחידה</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>ספק</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>פעולה</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>טוען...</td></tr>
            ) : filtered.map(m => {
              const st = getStatus(m);
              const isOrdered = ordered.has(m.id);
              const rowBg = st === 'out' ? '#fff5f5' : st === 'low' ? '#fffbeb' : undefined;
              const qtyColor = st === 'out' ? '#b91c1c' : st === 'low' ? '#92400e' : '#166534';
              return (
                <tr key={m.id} style={{ background: rowBg }}>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginLeft: 6,
                      background: st === 'out' ? '#ef4444' : st === 'low' ? '#f59e0b' : '#22c55e' }} />
                    {st === 'out' ? 'אזל' : st === 'low' ? 'נמוך' : 'תקין'}
                  </td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6', color: qtyColor, fontWeight: 700 }}>{m.qty}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>{m.min_qty}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>{m.unit}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>{m.supplier ?? '—'}</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    {st === 'ok' ? (
                      <span style={{ color: '#22c55e', fontSize: 13 }}>✓ במלאי</span>
                    ) : isOrdered ? (
                      <span style={{ color: '#22c55e', fontSize: 13, border: '1px solid #86efac', borderRadius: 5, padding: '4px 10px' }}>
                        ✓ הוזמן ({m.order_qty} {m.unit})
                      </span>
                    ) : (
                      <button
                        style={{ padding: '5px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                        onClick={() => handleOrder(m.id)}>
                        הזמן {m.order_qty} {m.unit}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            {pendingAlerts > 0 ? `${pendingAlerts} פריטים ממתינים להזמנה` : 'כל ההתראות טופלו ✓'}
          </span>
          {pendingAlerts > 0 && (
            <button
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
              onClick={handleOrderAll}>
              📦 הזמן הכל ({pendingAlerts} פריטים)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
