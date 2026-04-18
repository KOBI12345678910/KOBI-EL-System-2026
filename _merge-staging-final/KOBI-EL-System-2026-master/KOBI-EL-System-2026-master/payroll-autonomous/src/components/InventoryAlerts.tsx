/**
 * InventoryAlerts — התראות מלאי
 * Shows materials that are low or out of stock, with reorder actions.
 */
import React, { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
interface Material {
  id: number;
  name: string;
  qty: number;
  minQty: number;
  unit: string;
  supplier: string;
  orderQty: number;
}

// ── Mock data (fallback when API unavailable) ─────────────────────────────
const MOCK_MATERIALS: Material[] = [
  { id: 1,  name: 'פרופיל 40×40',           qty: 0,   minQty: 50,  unit: "מ'",  supplier: 'פלדות הצפון',   orderQty: 200 },
  { id: 2,  name: 'פרופיל 50×50',           qty: 12,  minQty: 30,  unit: "מ'",  supplier: 'פלדות הצפון',   orderQty: 100 },
  { id: 3,  name: 'פח מילוי 1.5mm',         qty: 0,   minQty: 20,  unit: 'מ"ר', supplier: 'מתכות רמת גן',  orderQty: 80  },
  { id: 4,  name: 'פרופיל אלומיניום 40×40', qty: 85,  minQty: 40,  unit: "מ'",  supplier: 'אלומיניום ישיר', orderQty: 150 },
  { id: 5,  name: 'ברגים M8',               qty: 150, minQty: 500, unit: "יח'", supplier: 'אורן כלי עבודה', orderQty: 2000 },
  { id: 6,  name: 'ברגים M6',               qty: 0,   minQty: 200, unit: "יח'", supplier: 'אורן כלי עבודה', orderQty: 1000 },
  { id: 7,  name: 'אבקה לצביעה שחור',       qty: 8,   minQty: 15,  unit: 'ק"ג', supplier: 'צבעי ים תיכון',  orderQty: 50  },
  { id: 8,  name: 'זכוכית מחוסמת 8mm',      qty: 22,  minQty: 10,  unit: 'מ"ר', supplier: 'זכוכית גלבוע',  orderQty: 40  },
  { id: 9,  name: 'ציר כבד',                qty: 5,   minQty: 20,  unit: "יח'", supplier: 'פרזול גיל',      orderQty: 50  },
  { id: 10, name: 'מנעול',                  qty: 0,   minQty: 10,  unit: "יח'", supplier: 'פרזול גיל',      orderQty: 30  },
];

type Status = 'out' | 'low' | 'ok';

function getStatus(m: Material): Status {
  if (m.qty === 0) return 'out';
  if (m.qty < m.minQty) return 'low';
  return 'ok';
}

// ── Styles ────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrap: { direction: 'rtl', padding: 24, fontFamily: 'Segoe UI, Arial, sans-serif', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#58a6ff' },
  summaryRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const },
  badge: { borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 },
  badgeRed: { background: '#2d1117', border: '1px solid #f85149', color: '#f85149' },
  badgeYellow: { background: '#2d2100', border: '1px solid #d29922', color: '#d29922' },
  badgeGreen: { background: '#12261e', border: '1px solid #3fb950', color: '#3fb950' },
  card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { background: '#21262d', padding: '9px 14px', textAlign: 'right' as const, color: '#8b96a5', fontWeight: 600, borderBottom: '1px solid #30363d' },
  td: { padding: '9px 14px', borderBottom: '1px solid #21262d', textAlign: 'right' as const, verticalAlign: 'middle' as const },
  dot: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginLeft: 6 },
  dotRed: { background: '#f85149' },
  dotYellow: { background: '#d29922' },
  dotGreen: { background: '#3fb950' },
  btnOrder: { padding: '5px 14px', background: '#238636', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnOrdered: { padding: '5px 14px', background: '#21262d', color: '#3fb950', border: '1px solid #3fb950', borderRadius: 5, cursor: 'default', fontSize: 13 },
  btnAll: { padding: '9px 22px', background: '#0f3460', color: '#58a6ff', border: '1px solid #1f6feb', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  footer: { padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#21262d' },
  filter: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const },
  filterBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid #30363d', background: '#21262d', color: '#8b96a5', cursor: 'pointer', fontSize: 13 },
  filterActive: { background: '#1f6feb22', borderColor: '#58a6ff', color: '#58a6ff' },
};

// ── Component ─────────────────────────────────────────────────────────────
export default function InventoryAlerts() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [ordered, setOrdered] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'out' | 'low'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3100';
        const res = await fetch(`${apiUrl}/api/materials`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          setMaterials(Array.isArray(data) ? data : data.items ?? MOCK_MATERIALS);
        } else {
          setMaterials(MOCK_MATERIALS);
        }
      } catch {
        setMaterials(MOCK_MATERIALS);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleOrder = (id: number) => {
    setOrdered(prev => new Set([...prev, id]));
  };

  const handleOrderAll = () => {
    const alertIds = materials
      .filter(m => getStatus(m) !== 'ok' && !ordered.has(m.id))
      .map(m => m.id);
    setOrdered(prev => new Set([...prev, ...alertIds]));
  };

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

  if (loading) {
    return (
      <div style={s.wrap}>
        <div style={s.title}>📦 התראות מלאי</div>
        <div style={{ color: '#8b96a5', padding: 40, textAlign: 'center' }}>טוען נתוני מלאי...</div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.title}>📦 התראות מלאי</div>

      {/* Summary badges */}
      <div style={s.summaryRow}>
        <div style={{ ...s.badge, ...s.badgeRed }}>
          <span>🔴</span>
          <span>{outCount} פריטים אזלו מהמלאי</span>
        </div>
        <div style={{ ...s.badge, ...s.badgeYellow }}>
          <span>🟡</span>
          <span>{lowCount} פריטים במלאי נמוך</span>
        </div>
        <div style={{ ...s.badge, ...s.badgeGreen }}>
          <span>🟢</span>
          <span>{okCount} פריטים תקינים</span>
        </div>
      </div>

      {/* Filter buttons */}
      <div style={s.filter}>
        {(['all', 'out', 'low'] as const).map(f => (
          <button key={f} style={{ ...s.filterBtn, ...(filter === f ? s.filterActive : {}) }}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'הכל' : f === 'out' ? '🔴 אזל' : '🟡 נמוך'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>סטטוס</th>
              <th style={s.th}>שם חומר</th>
              <th style={s.th}>כמות נוכחית</th>
              <th style={s.th}>כמות מינימום</th>
              <th style={s.th}>יחידה</th>
              <th style={s.th}>ספק</th>
              <th style={s.th}>פעולה</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const st = getStatus(m);
              const isOrdered = ordered.has(m.id);
              return (
                <tr key={m.id} style={{ background: st === 'out' ? '#1a0a0a' : st === 'low' ? '#1a1600' : undefined }}>
                  <td style={s.td}>
                    <span style={{ ...s.dot, ...(st === 'out' ? s.dotRed : st === 'low' ? s.dotYellow : s.dotGreen) }} />
                    {st === 'out' ? 'אזל' : st === 'low' ? 'נמוך' : 'תקין'}
                  </td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ ...s.td, color: st === 'out' ? '#f85149' : st === 'low' ? '#d29922' : '#3fb950' }}>
                    {m.qty}
                  </td>
                  <td style={s.td}>{m.minQty}</td>
                  <td style={s.td}>{m.unit}</td>
                  <td style={s.td}>{m.supplier}</td>
                  <td style={s.td}>
                    {st === 'ok' ? (
                      <span style={{ color: '#3fb950', fontSize: 13 }}>✓ במלאי</span>
                    ) : isOrdered ? (
                      <span style={s.btnOrdered}>✓ הוזמן ({m.orderQty} {m.unit})</span>
                    ) : (
                      <button style={s.btnOrder} onClick={() => handleOrder(m.id)}>
                        הזמן {m.orderQty} {m.unit}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={s.footer}>
          <span style={{ color: '#8b96a5', fontSize: 13 }}>
            {pendingAlerts > 0
              ? `${pendingAlerts} פריטים ממתינים להזמנה`
              : 'כל ההתראות טופלו ✓'}
          </span>
          {pendingAlerts > 0 && (
            <button style={s.btnAll} onClick={handleOrderAll}>
              📦 הזמן הכל ({pendingAlerts} פריטים)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
