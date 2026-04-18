import React, { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

export function Finance() {
  const { data: summary, fetch: fetchSummary } = useApi<any>('/api/financials/summary');
  const { data: monthly, fetch: fetchMonthly } = useApi<any[]>('/api/financials/monthly');
  const { data: byCategory, fetch: fetchCategory } = useApi<any[]>('/api/financials/by-category');
  const { data: transactions, fetch: fetchTx } = useApi<any[]>('/api/financials');

  useEffect(() => {
    fetchSummary();
    fetchMonthly();
    fetchCategory();
    fetchTx();
  }, []);

  const grossMargin = summary
    ? Math.round(((summary.revenue - summary.material_costs - summary.salary_costs) / Math.max(summary.revenue, 1)) * 100)
    : 0;

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>פיננסים ורווחיות</h1>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        <Metric label="הכנסה חודש נוכחי" value={formatCurrency(summary?.revenue || 0)} color="#3DCC91" />
        <Metric label="עלויות חומרים" value={formatCurrency(summary?.material_costs || 0)} color="#FC8585" />
        <Metric label="עלויות שכר" value={formatCurrency(summary?.salary_costs || 0)} color="#FFB366" />
        <Metric label="רווח גולמי" value={`${grossMargin}%`} color="#48AFF0" />
        <Metric label="הזמנות שחויבו" value={summary?.orders_billed || 0} color="#FFA500" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {/* MONTHLY REVENUE */}
        <Panel title="הכנסות — 12 חודשים">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly || []} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <XAxis dataKey="month" tick={{ fill: '#5C7080', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5C7080', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}K`} />
              <Tooltip contentStyle={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, fontSize: 11 }} formatter={(v: any) => [formatCurrency(v)]} />
              <Bar dataKey="revenue" fill="#3DCC91" fillOpacity={0.7} radius={[1, 1, 0, 0]} />
              <Bar dataKey="costs" fill="#FC8585" fillOpacity={0.5} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, padding: '0 16px 10px', fontSize: 10 }}>
            <span style={{ color: '#3DCC91' }}>● הכנסות</span>
            <span style={{ color: '#FC8585' }}>● עלויות</span>
          </div>
        </Panel>

        {/* BY CATEGORY */}
        <Panel title="הכנסות לפי קטגוריה">
          <div style={{ padding: '8px 0' }}>
            {(byCategory || []).map((c: any) => {
              const total = byCategory?.reduce((s: number, x: any) => s + parseFloat(x.revenue), 0) || 1;
              const pct = Math.round((parseFloat(c.revenue) / total) * 100);
              return (
                <div key={c.category} style={{ padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#ABB3BF' }}>{c.category}</span>
                    <span style={{ fontSize: 11, color: '#3DCC91' }}>{formatCurrency(c.revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 3, background: '#383E47' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#48AFF0' }} />
                    </div>
                    <span style={{ fontSize: 9, color: '#5C7080', minWidth: 28 }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* TRANSACTIONS */}
      <Panel title="תנועות אחרונות">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#383E47' }}>
              {['תאריך', 'לקוח', 'הזמנה', 'סוג', 'תיאור', 'סכום'].map(h => (
                <th key={h} style={{ padding: '7px 14px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(transactions || []).slice(0, 20).map((tx: any) => (
              <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '8px 14px', color: '#5C7080', fontSize: 11 }}>{new Date(tx.date).toLocaleDateString('he-IL')}</td>
                <td style={{ padding: '8px 14px', color: '#ABB3BF' }}>{tx.client_name || '—'}</td>
                <td style={{ padding: '8px 14px', color: '#5C7080', fontSize: 10 }}>{tx.order_id || '—'}</td>
                <td style={{ padding: '8px 14px' }}>
                  <span style={{ color: tx.type === 'income' || tx.type === 'advance' ? '#3DCC91' : '#FC8585', fontSize: 10 }}>
                    {tx.type}
                  </span>
                </td>
                <td style={{ padding: '8px 14px', color: '#ABB3BF' }}>{tx.description}</td>
                <td style={{ padding: '8px 14px', color: tx.type === 'income' || tx.type === 'advance' ? '#3DCC91' : '#FC8585', fontWeight: 600 }}>
                  {tx.type === 'income' || tx.type === 'advance' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#383E47' }}>
        <span style={{ fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, color }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px', borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
