import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useStore } from '../store/useStore';
import { useApi } from '../hooks/useApi';
import { MetricCard } from '../components/MetricCard';
import { StatusTag } from '../components/StatusTag';
import { AlertFeed } from '../components/AlertFeed';
import { formatCurrency, formatDate, isOverdue, daysUntil } from '../utils/format';

const PIE_COLORS = ['#FC8585', '#FFB366', '#48AFF0', '#9D4EDD', '#3DCC91'];

export function Dashboard() {
  const navigate = useNavigate();
  const { snapshot, setSnapshot, setAlerts } = useStore();
  const { fetch: fetchSnapshot } = useApi<any>('/api/ontology/snapshot');
  const { fetch: fetchMonthly } = useApi<any[]>('/api/financials/monthly');
  const { fetch: fetchAlerts } = useApi<any[]>('/api/alerts');
  const { fetch: fetchProduction } = useApi<any[]>('/api/reports/weekly');
  const { fetch: fetchByCategory } = useApi<any[]>('/api/financials/by-category');
  const [monthly, setMonthly] = useState<any[]>([]);
  const [prodData, setProdData] = useState<any[]>([]);
  const [matMix, setMatMix] = useState<any[]>([]);

  useEffect(() => {
    fetchSnapshot().then(d => { if (d) setSnapshot(d); });
    fetchMonthly().then(d => { if (d) setMonthly(d.slice(-6)); });
    fetchAlerts({ resolved: false }).then(d => { if (d) setAlerts(d); });
    fetchProduction().then(d => { if (d) setProdData(d); });
    fetchByCategory().then(d => {
      if (d) setMatMix(d.map((c: any) => ({ name: c.category, value: parseFloat(c.revenue) || 0 })));
    });
  }, []);

  if (!snapshot) return <Loading />;

  const present = snapshot.attendance.factory + snapshot.attendance.field;
  const alertCount = snapshot.openAlerts.filter((a: any) => !a.is_resolved).length;

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        <MetricCard label="הזמנות פעילות" value={snapshot.activeOrders.length} color="#48AFF0" onClick={() => navigate('/work-orders')} />
        <MetricCard label="הכנסה חודש נוכחי" value={formatCurrency(snapshot.monthlyRevenue)} color="#3DCC91" />
        <MetricCard label="עובדים נוכחים" value={`${present}/${snapshot.attendance.total}`} color="#FFA500" delta={`${snapshot.attendance.field} בשטח`} />
        <MetricCard label="אזהרות פתוחות" value={alertCount} color={alertCount > 0 ? '#FC8585' : '#3DCC91'} onClick={() => navigate('/alerts')} />
        <MetricCard label="ניצולת מפעל" value={`${snapshot.utilizationPct}%`} color="#9D4EDD" />
      </div>

      {/* MAIN ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 8, marginBottom: 8 }}>
        {/* ORDERS TABLE */}
        <Panel title="הזמנות עבודה פעילות" tag="LIVE">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['מזהה', 'לקוח', 'מוצר', 'חומר', 'אספקה', 'התקדמות', 'סטטוס'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.activeOrders.map((o: any) => {
                const overdue = isOverdue(o.delivery_date);
                const days = daysUntil(o.delivery_date);
                return (
                  <tr
                    key={o.id}
                    onClick={() => navigate('/work-orders')}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      background: overdue ? 'rgba(252,133,133,0.04)' : 'transparent'
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#383E47'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = overdue ? 'rgba(252,133,133,0.04)' : 'transparent'}
                  >
                    <td style={{ padding: '8px 12px', color: '#5C7080', fontSize: 10 }}>{o.id}</td>
                    <td style={{ padding: '8px 12px', color: '#F6F7F9', fontWeight: 500 }}>{o.client_name}</td>
                    <td style={{ padding: '8px 12px', color: '#ABB3BF' }}>{o.product}</td>
                    <td style={{ padding: '8px 12px', color: '#ABB3BF' }}>{o.material_primary}</td>
                    <td style={{ padding: '8px 12px', color: overdue ? '#FC8585' : days <= 3 ? '#FFB366' : '#ABB3BF', fontSize: 11 }}>
                      {formatDate(o.delivery_date)}
                      {overdue && <span style={{ marginRight: 4, fontSize: 9 }}>⚠</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 3, background: '#383E47', position: 'relative' }}>
                          <div style={{
                            position: 'absolute', right: 0, top: 0,
                            width: `${o.progress}%`, height: '100%',
                            background: o.progress === 100 ? '#3DCC91' : overdue ? '#FC8585' : '#48AFF0'
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#5C7080', minWidth: 28 }}>{o.progress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}><StatusTag status={o.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* ALERTS */}
        <Panel title="התראות ואירועים" tag="REAL-TIME">
          <AlertFeed />
        </Panel>
      </div>

      {/* CHARTS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Panel title="ייצור שבועי — יחידות">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={prodData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fill: '#5C7080', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5C7080', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }} labelStyle={{ color: '#ABB3BF' }} itemStyle={{ color: '#48AFF0' }} />
              <Bar dataKey="units" fill="#48AFF0" fillOpacity={0.7} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="מיקס חומרי גלם">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <PieChart width={120} height={120}>
              <Pie data={matMix} cx={55} cy={55} innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
                {matMix.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
            </PieChart>
            <div style={{ flex: 1 }}>
              {matMix.map((m, i) => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 8, height: 8, background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 1 }} />
                  <span style={{ fontSize: 10, color: '#ABB3BF', flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 10, color: '#5C7080' }}>{Math.round(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="הכנסות — 6 חודשים">
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="month" tick={{ fill: '#5C7080', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5C7080', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v/1000)}K`} />
              <Tooltip contentStyle={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }} labelStyle={{ color: '#ABB3BF' }} formatter={(v: any) => [formatCurrency(v), 'הכנסה']} />
              <Line type="monotone" dataKey="revenue" stroke="#3DCC91" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#383E47'
      }}>
        <span style={{ fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
        {tag && <span style={{ fontSize: 9, color: '#3DCC91', border: '1px solid rgba(61,204,145,0.3)', padding: '1px 6px' }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#5C7080', fontSize: 13 }}>
      טוען נתונים...
    </div>
  );
}
