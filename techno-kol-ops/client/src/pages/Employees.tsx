import React, { useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

const LOC_COLOR: any = { factory: '#3DCC91', field: '#48AFF0', sick: '#FC8585', vacation: '#FFB366', absent: '#FC8585' };
const LOC_LABEL: any = { factory: 'מפעל', field: 'שטח', sick: 'מחלה', vacation: 'חופש', absent: 'חסר', null: '—' };

export function Employees() {
  const { data: employees, fetch } = useApi<any[]>('/api/employees');

  useEffect(() => { fetch(); }, []);

  const list = employees || [];
  const present = list.filter(e => ['factory', 'field'].includes(e.today_location)).length;

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>עובדים</h1>
        <span style={{ marginRight: 12, color: '#3DCC91', fontSize: 12 }}>{present}/{list.length} נוכחים</span>
        <div style={{ flex: 1 }} />
        <button style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
          + עובד חדש
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <Metric label="עובדים פעילים" value={list.length} color="#48AFF0" />
        <Metric label="נוכחים היום" value={present} color="#3DCC91" />
        <Metric label="עלות שכר חודשית" value={formatCurrency(list.reduce((s, e) => s + parseFloat(e.salary), 0))} color="#FFB366" />
        <Metric label="בשטח עכשיו" value={list.filter(e => e.today_location === 'field').length} color="#48AFF0" />
      </div>

      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#383E47' }}>
              {['שם', 'תפקיד', 'מחלקה', 'שכר ₪', 'הזמנות פעילות', 'מיקום היום', 'נכנס'].map(h => (
                <th key={h} style={{ padding: '7px 14px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((emp: any) => (
              <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#383E47'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{ padding: '9px 14px', color: '#F6F7F9', fontWeight: 500 }}>{emp.name}</td>
                <td style={{ padding: '9px 14px', color: '#ABB3BF' }}>{emp.role}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '2px 7px', fontSize: 10 }}>
                    {emp.department}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', color: '#3DCC91' }}>{formatCurrency(emp.salary)}</td>
                <td style={{ padding: '9px 14px', color: '#48AFF0', textAlign: 'center' }}>{emp.active_orders || 0}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ color: LOC_COLOR[emp.today_location] || '#5C7080', fontSize: 11 }}>
                    ● {LOC_LABEL[emp.today_location] || '—'}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', color: '#5C7080', fontSize: 11 }}>
                  {emp.today_checkin || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px', borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
