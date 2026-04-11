import React, { useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

export function Clients() {
  const { data: clients, fetch } = useApi<any[]>('/api/clients');
  useEffect(() => { fetch(); }, []);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>לקוחות</h1>
        <div style={{ flex: 1 }} />
        <button style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
          + לקוח חדש
        </button>
      </div>

      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#383E47' }}>
              {['שם לקוח', 'סוג', 'הזמנות', 'הכנסה כוללת', 'הזמנה אחרונה', 'מסגרת אשראי', 'יתרה'].map(h => (
                <th key={h} style={{ padding: '7px 14px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(clients || []).map((c: any) => (
              <tr key={c.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#383E47'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{ padding: '9px 14px', color: '#F6F7F9', fontWeight: 500 }}>{c.name}</td>
                <td style={{ padding: '9px 14px', color: '#ABB3BF' }}>{c.type}</td>
                <td style={{ padding: '9px 14px', color: '#48AFF0', textAlign: 'center' }}>{c.total_orders}</td>
                <td style={{ padding: '9px 14px', color: '#3DCC91' }}>{formatCurrency(c.total_revenue)}</td>
                <td style={{ padding: '9px 14px', color: '#5C7080', fontSize: 11 }}>
                  {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('he-IL') : '—'}
                </td>
                <td style={{ padding: '9px 14px', color: '#FFB366' }}>{formatCurrency(c.credit_limit)}</td>
                <td style={{ padding: '9px 14px', color: c.balance_due > 0 ? '#FC8585' : '#3DCC91' }}>
                  {formatCurrency(c.balance_due)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
