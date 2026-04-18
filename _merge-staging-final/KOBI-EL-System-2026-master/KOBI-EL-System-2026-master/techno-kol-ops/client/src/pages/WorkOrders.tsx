import React, { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useApi, api } from '../hooks/useApi';
import { formatCurrency, formatDate, isOverdue, daysUntil, materialCategoryHe } from '../utils/format';

export function WorkOrders() {
  const { data: orders, fetch, loading } = useApi<any[]>('/api/work-orders');
  const [selected, setSelected] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { fetch(); }, []);

  const filtered = (orders || []).filter(o =>
    !search || o.id.includes(search) || o.client_name?.includes(search) || o.product?.includes(search)
  );

  const colDefs = [
    { field: 'id', headerName: 'מזהה', width: 90, cellStyle: { color: '#5C7080', fontSize: 11 } },
    { field: 'client_name', headerName: 'לקוח', flex: 1, cellStyle: { color: '#F6F7F9', fontWeight: 500 } },
    { field: 'product', headerName: 'מוצר', flex: 1.5, cellStyle: { color: '#ABB3BF' } },
    {
      field: 'material_primary', headerName: 'חומר', width: 100,
      cellRenderer: (p: any) => {
        const colors: any = { iron: '#FC8585', aluminum: '#FFB366', stainless: '#48AFF0', glass: '#9D4EDD' };
        return `<span style="color:${colors[p.value] || '#ABB3BF'}">${materialCategoryHe[p.value] || p.value}</span>`;
      }
    },
    { field: 'price', headerName: 'שווי', width: 100, cellRenderer: (p: any) => formatCurrency(p.value), cellStyle: { color: '#3DCC91' } },
    {
      field: 'delivery_date', headerName: 'אספקה', width: 100,
      cellRenderer: (p: any) => {
        const over = isOverdue(p.value);
        const d = daysUntil(p.value);
        return `<span style="color:${over ? '#FC8585' : d <= 3 ? '#FFB366' : '#ABB3BF'}">${formatDate(p.value)}${over ? ' ⚠' : ''}</span>`;
      }
    },
    {
      field: 'progress', headerName: 'התקדמות', width: 130,
      cellRenderer: (p: any) => `
        <div style="display:flex;align-items:center;gap:6px;height:100%">
          <div style="width:70px;height:3px;background:#383E47;position:relative;flex-shrink:0">
            <div style="position:absolute;right:0;top:0;width:${p.value}%;height:100%;background:${p.value===100?'#3DCC91':'#48AFF0'}"></div>
          </div>
          <span style="color:#5C7080;font-size:10px">${p.value}%</span>
        </div>`
    },
    {
      field: 'status', headerName: 'סטטוס', width: 90,
      cellRenderer: (p: any) => {
        const labels: any = { pending: 'הכנה', production: 'ייצור', finishing: 'גימור', ready: 'מוכן', delivered: 'נמסר' };
        const colors: any = { pending: '#FFB366', production: '#48AFF0', finishing: '#9D4EDD', ready: '#3DCC91', delivered: '#5C7080' };
        return `<span style="color:${colors[p.value]||'#ABB3BF'};font-size:10px;border:1px solid ${colors[p.value]||'#5C7080'}40;padding:2px 6px">${labels[p.value]||p.value}</span>`;
      }
    },
  ];

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>הזמנות עבודה</h1>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש..."
          style={{
            background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)',
            color: '#F6F7F9', padding: '6px 12px', fontSize: 12,
            outline: 'none', width: 220
          }}
        />
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'transparent', border: '1px solid #FFA500',
            color: '#FFA500', padding: '6px 14px', cursor: 'pointer', fontSize: 12
          }}
        >
          + הזמנה חדשה
        </button>
        <button
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#ABB3BF', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
        >
          ייצוא Excel
        </button>
      </div>

      <div className="ag-theme-alpine-dark" style={{ height: 'calc(100vh - 180px)', width: '100%' }}>
        <AgGridReact
          rowData={filtered}
          columnDefs={colDefs as any}
          rowSelection="single"
          onRowClicked={(e) => setSelected(e.data)}
          animateRows
          suppressCellFocus
          rowHeight={40}
          headerHeight={36}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
        />
      </div>

      {/* ORDER DETAIL SIDE PANEL */}
      {selected && (
        <div style={{
          position: 'fixed', right: 0, top: 48, bottom: 0, width: 420,
          background: '#1C2127', borderLeft: '1px solid rgba(255,255,255,0.1)',
          zIndex: 200, overflowY: 'auto', padding: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 13 }}>// {selected.id}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#F6F7F9', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{selected.product}</div>
            <div style={{ color: '#ABB3BF', fontSize: 12 }}>{selected.client_name}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              ['שווי', formatCurrency(selected.price)],
              ['חומר', materialCategoryHe[selected.material_primary] || selected.material_primary],
              ['אספקה', formatDate(selected.delivery_date)],
              ['התקדמות', `${selected.progress}%`],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#2F343C', padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#5C7080', marginBottom: 3, letterSpacing: '0.1em' }}>{k}</div>
                <div style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Progress update */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 6, letterSpacing: '0.1em' }}>
              עדכן התקדמות
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="range" min={0} max={100} step={5}
                defaultValue={selected.progress}
                style={{ flex: 1 }}
                onChange={async (e) => {
                  const p = parseInt(e.target.value);
                  await api.put(`/api/work-orders/${selected.id}/progress`, { progress: p });
                  fetch();
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '8px', cursor: 'pointer', fontSize: 12 }}>
              עדכן סטטוס
            </button>
            <button style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#ABB3BF', padding: '8px', cursor: 'pointer', fontSize: 12 }}>
              הדפס
            </button>
          </div>
        </div>
      )}

      {/* NEW ORDER MODAL */}
      {showModal && <NewOrderModal onClose={() => { setShowModal(false); fetch(); }} />}
    </div>
  );
}

function NewOrderModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<any>({});
  const { data: clients, fetch: fetchClients } = useApi<any[]>('/api/clients');

  useEffect(() => { fetchClients(); }, []);

  const handleSubmit = async () => {
    const id = `TK-${Date.now().toString().slice(-4)}`;
    await api.post('/api/work-orders', { ...form, id });
    onClose();
  };

  const f = (field: string) => (e: any) => setForm((p: any) => ({ ...p, [field]: e.target.value }));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500
    }}>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.15)', width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#383E47' }}>
          <span style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 12 }}>// הזמנת עבודה חדשה</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>לקוח</label>
            <select onChange={f('client_id')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12 }}>
              <option value="">בחר לקוח</option>
              {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>תיאור המוצר</label>
            <input onChange={f('product')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} placeholder="מעקות נירוסטה, שערים פנדולום..." />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>חומר ראשי</label>
            <select onChange={f('material_primary')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12 }}>
              <option value="iron">ברזל</option>
              <option value="aluminum">אלומיניום</option>
              <option value="stainless">נירוסטה</option>
              <option value="glass">זכוכית</option>
              <option value="mixed">מעורב</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>קטגוריה</label>
            <select onChange={f('category')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12 }}>
              <option value="railings">מעקות</option>
              <option value="gates">שערים</option>
              <option value="fences">גדרות</option>
              <option value="pergolas">פרגולות</option>
              <option value="stairs">מדרגות</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>שווי ₪</label>
            <input type="number" onChange={f('price')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} placeholder="0" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>מקדמה ₪</label>
            <input type="number" onChange={f('advance_paid')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} placeholder="0" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>תאריך אספקה</label>
            <input type="date" onChange={f('delivery_date')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>עדיפות</label>
            <select onChange={f('priority')} style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '7px 10px', fontSize: 12 }}>
              <option value="normal">רגילה</option>
              <option value="high">גבוהה</option>
              <option value="urgent">דחופה</option>
            </select>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <button onClick={handleSubmit} style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '8px 20px', cursor: 'pointer', fontSize: 12 }}>✓ שמור הזמנה</button>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '8px 16px', cursor: 'pointer', fontSize: 12 }}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
