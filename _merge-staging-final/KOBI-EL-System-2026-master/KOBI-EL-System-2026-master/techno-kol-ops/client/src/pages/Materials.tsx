import React, { useEffect, useState } from 'react';
import { useApi, api } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

const CATEGORIES = [
  { key: 'all', label: 'הכל' },
  { key: 'iron', label: 'ברזל' },
  { key: 'aluminum', label: 'אלומיניום' },
  { key: 'stainless', label: 'נירוסטה' },
  { key: 'glass', label: 'זכוכית' },
  { key: 'consumables', label: 'מתכלים' },
];

export function Materials() {
  const { data: materials, fetch } = useApi<any[]>('/api/materials');
  const [cat, setCat] = useState('all');
  const [showReceive, setShowReceive] = useState<any>(null);

  useEffect(() => { fetch(cat !== 'all' ? { category: cat } : {}); }, [cat]);

  const items = materials || [];
  const alerts = items.filter(m => m.is_low || m.qty <= m.min_threshold);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>מחסן וחומרי גלם</h1>
        <div style={{ flex: 1 }} />
        {alerts.length > 0 && (
          <span style={{ background: 'rgba(252,133,133,0.1)', border: '1px solid #FC8585', color: '#FC8585', padding: '4px 12px', fontSize: 11, marginLeft: 12 }}>
            ⚠ {alerts.length} פריטים מתחת לסף מינימום
          </span>
        )}
        <button onClick={() => setShowReceive({})} style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
          + קבלת סחורה
        </button>
      </div>

      {/* CATEGORY TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
        {CATEGORIES.map(c => (
          <div
            key={c.key}
            onClick={() => setCat(c.key)}
            style={{
              padding: '8px 16px', cursor: 'pointer', fontSize: 12,
              color: cat === c.key ? '#FFA500' : '#ABB3BF',
              borderBottom: cat === c.key ? '2px solid #FFA500' : '2px solid transparent',
              marginBottom: -1
            }}
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <Metric label='סה"כ פריטים' value={items.length} color="#48AFF0" />
        <Metric label="מתחת לסף" value={alerts.length} color={alerts.length > 0 ? '#FC8585' : '#3DCC91'} />
        <Metric label="שווי מלאי" value={formatCurrency(items.reduce((s, i) => s + i.qty * i.cost_per_unit, 0))} color="#3DCC91" />
        <Metric label="ספקים מקושרים" value={new Set(items.map(i => i.supplier_id).filter(Boolean)).size} color="#FFA500" />
      </div>

      {/* TABLE */}
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#383E47' }}>
              {['פריט', 'כמות', 'סף מינ׳', 'מקסימום', 'יחידה', 'עלות/יח', 'ספק', 'סטטוס'].map(h => (
                <th key={h} style={{ padding: '7px 14px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const pct = Math.min(100, Math.round((item.qty / (item.max_stock || item.min_threshold * 2)) * 100));
              const isLow = item.qty <= item.min_threshold;
              const isCritical = item.qty <= item.min_threshold * 0.3;
              return (
                <tr key={item.id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: isCritical ? 'rgba(252,133,133,0.05)' : isLow ? 'rgba(255,179,102,0.03)' : 'transparent'
                }}>
                  <td style={{ padding: '9px 14px', color: '#F6F7F9', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: '#383E47', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', right: 0, top: 0, width: `${pct}%`, height: '100%', background: isCritical ? '#FC8585' : isLow ? '#FFB366' : '#3DCC91' }} />
                      </div>
                      <span style={{ color: isCritical ? '#FC8585' : isLow ? '#FFB366' : '#ABB3BF', fontWeight: 500 }}>
                        {item.qty}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', color: '#5C7080' }}>{item.min_threshold}</td>
                  <td style={{ padding: '9px 14px', color: '#5C7080' }}>{item.max_stock || '—'}</td>
                  <td style={{ padding: '9px 14px', color: '#5C7080' }}>{item.unit}</td>
                  <td style={{ padding: '9px 14px', color: '#3DCC91' }}>₪{item.cost_per_unit}</td>
                  <td style={{ padding: '9px 14px', color: '#ABB3BF', fontSize: 11 }}>{item.supplier_name || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    {isCritical
                      ? <span style={{ color: '#FC8585', border: '1px solid #FC858540', padding: '2px 6px', fontSize: 9 }}>קריטי</span>
                      : isLow
                        ? <span style={{ color: '#FFB366', border: '1px solid #FFB36640', padding: '2px 6px', fontSize: 9 }}>נמוך</span>
                        : <span style={{ color: '#3DCC91', border: '1px solid #3DCC9140', padding: '2px 6px', fontSize: 9 }}>OK</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showReceive && <ReceiveModal onClose={() => { setShowReceive(null); fetch(); }} items={items} />}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px', borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ReceiveModal({ onClose, items }: { onClose: () => void; items: any[] }) {
  const [form, setForm] = useState<any>({ qty: '', cost_per_unit: '' });
  const f = (field: string) => (e: any) => setForm((p: any) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.item_id || !form.qty) return;
    await api.post(`/api/materials/${form.item_id}/receive`, {
      qty: parseFloat(form.qty),
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      notes: form.notes
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.15)', width: 440 }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', background: '#383E47' }}>
          <span style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 12 }}>// קבלת סחורה</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>פריט</label>
            <select onChange={f('item_id')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12 }}>
              <option value="">בחר פריט</option>
              {items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>כמות שהתקבלה</label>
              <input type="number" onChange={f('qty')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>מחיר ליחידה ₪</label>
              <input type="number" onChange={f('cost_per_unit')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>הערות</label>
            <input onChange={f('notes')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <button onClick={handleSubmit} style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '8px 20px', cursor: 'pointer', fontSize: 12 }}>✓ עדכן מלאי</button>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '8px 16px', cursor: 'pointer', fontSize: 12 }}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
