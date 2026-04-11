import React, { useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useApi } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

export function Intelligence() {
  const { data: kpis, fetch: fetchKpis } = useApi<any>('/api/intelligence/kpis');
  const { data: forecast, fetch: fetchForecast } = useApi<any>('/api/intelligence/forecast/revenue');
  const { data: anomalies, fetch: fetchAnomalies } = useApi<any[]>('/api/intelligence/anomalies');
  const { data: empRoi, fetch: fetchEmpRoi } = useApi<any[]>('/api/intelligence/roi/employees');
  const { data: clients, fetch: fetchClients } = useApi<any[]>('/api/intelligence/scoring/clients');
  const { data: cashflow, fetch: fetchCashflow } = useApi<any>('/api/intelligence/cashflow');
  const { data: matForecast, fetch: fetchMatForecast } = useApi<any[]>('/api/intelligence/forecast/materials');

  useEffect(() => {
    fetchKpis();
    fetchForecast();
    fetchAnomalies();
    fetchEmpRoi();
    fetchClients();
    fetchCashflow();
    fetchMatForecast();
    const interval = setInterval(fetchKpis, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>Intelligence Center</h1>
          <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginTop: 2 }}>
            AI · PREDICTIONS · ANOMALY DETECTION · REAL-TIME KPIs
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DCC91', boxShadow: '0 0 8px #3DCC91' }} />
          <span style={{ fontSize: 10, color: '#3DCC91' }}>LIVE INTELLIGENCE</span>
        </div>
      </div>

      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          <KPI label="הזמנות פעילות" value={kpis.activeOrders} color="#48AFF0" />
          <KPI label="הכנסה החודש" value={formatCurrency(kpis.monthlyRevenue || 0)} color="#3DCC91" />
          <KPI label="עובדים נוכחים" value={kpis.employeesPresent} color="#FFA500" />
          <KPI label="התראות מלאי" value={kpis.materialAlerts} color={kpis.materialAlerts > 0 ? '#FC8585' : '#3DCC91'} />
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div style={{ background: 'rgba(252,133,133,0.05)', border: '1px solid rgba(252,133,133,0.2)', padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#FC8585', letterSpacing: '0.15em', marginBottom: 10 }}>
            ⚠ AI ANOMALY DETECTION — {anomalies.length} חריגות זוהו
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {anomalies.slice(0, 6).map((a: any, i: number) => (
              <div key={i} style={{
                background: '#2F343C', padding: '10px 12px',
                borderRight: `3px solid ${a.severity === 'critical' ? '#FC8585' : '#FFB366'}`
              }}>
                <div style={{ fontSize: 11, color: '#F6F7F9', fontWeight: 500, marginBottom: 3 }}>{a.type}</div>
                <div style={{ fontSize: 10, color: '#5C7080' }}>{a.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Panel title="תחזית הכנסות — 3 חודשים" tag="AI FORECAST">
          {forecast && (
            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: 22, color: '#3DCC91', fontWeight: 700 }}>
                {formatCurrency(forecast.forecastNext30 || 0)}
              </div>
              <div style={{ fontSize: 10, color: '#5C7080', marginTop: 4 }}>30 ימים הבאים</div>
              <div style={{ fontSize: 14, color: '#48AFF0', marginTop: 10 }}>
                {formatCurrency(forecast.forecastNext90 || 0)}
              </div>
              <div style={{ fontSize: 10, color: '#5C7080', marginTop: 2 }}>
                90 ימים · confidence {Math.round((forecast.confidence || 0) * 100)}%
              </div>
            </div>
          )}
        </Panel>

        <Panel title="תזרים מזומנים" tag="PREDICTIVE">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cashflow?.history || []} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3DCC91" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3DCC91" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: '#5C7080', fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5C7080', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${Math.round(v/1000)}K`} />
              <Tooltip contentStyle={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }}
                formatter={(v: any) => [formatCurrency(v)]} />
              <ReferenceLine y={0} stroke="rgba(252,133,133,0.4)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="amount" stroke="#3DCC91" fill="url(#cashGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Panel title="ROI עובדים">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['עובד', 'שכר', 'שעות', 'הכנסה', 'יחס'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(empRoi || []).slice(0, 8).map((e: any) => (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px', color: '#F6F7F9', fontWeight: 500 }}>{e.name}</td>
                  <td style={{ padding: '8px 12px', color: '#ABB3BF' }}>{formatCurrency(e.salary)}</td>
                  <td style={{ padding: '8px 12px', color: '#48AFF0' }}>{Math.round(e.hoursThisMonth || 0)}</td>
                  <td style={{ padding: '8px 12px', color: '#3DCC91' }}>{formatCurrency(e.revenueContributed || 0)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      color: e.roiRatio > 3 ? '#3DCC91' : e.roiRatio > 1.5 ? '#FFB366' : '#FC8585',
                      fontWeight: 700
                    }}>
                      {(e.roiRatio || 0).toFixed(1)}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="ניקוד לקוחות">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['לקוח', 'ציון', 'הכנסה', 'יתרה', 'דירוג'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(clients || []).slice(0, 8).map((c: any) => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px', color: '#F6F7F9', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 4, background: '#383E47' }}>
                        <div style={{
                          width: `${c.score || 0}%`, height: '100%',
                          background: c.score > 70 ? '#3DCC91' : c.score > 40 ? '#FFB366' : '#FC8585'
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#ABB3BF' }}>{c.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#3DCC91' }}>{formatCurrency(c.total_revenue || 0)}</td>
                  <td style={{ padding: '8px 12px', color: c.balance_due > 0 ? '#FC8585' : '#5C7080' }}>
                    {formatCurrency(c.balance_due || 0)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 9, color: c.tier === 'gold' ? '#FFA500' : c.tier === 'silver' ? '#ABB3BF' : '#8B5E34',
                      border: '1px solid currentColor', padding: '2px 7px'
                    }}>
                      {c.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="תחזית מלאי — AI Demand Forecast">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#383E47' }}>
              {['חומר', 'מלאי', 'צריכה יומית', 'ימים נותרים', 'המלצה'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(matForecast || []).slice(0, 12).map((m: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '8px 12px', color: '#F6F7F9', fontWeight: 500 }}>{m.name}</td>
                <td style={{ padding: '8px 12px', color: '#ABB3BF' }}>{m.qty}</td>
                <td style={{ padding: '8px 12px', color: '#48AFF0' }}>{(m.dailyConsumption || 0).toFixed(2)}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    color: m.daysLeft < 7 ? '#FC8585' : m.daysLeft < 14 ? '#FFB366' : '#3DCC91',
                    fontWeight: 600
                  }}>
                    {m.daysLeft === 999 ? '∞' : m.daysLeft}
                  </span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: 9,
                    color: m.action === 'reorder_now' ? '#FC8585' : m.action === 'reorder_soon' ? '#FFB366' : '#3DCC91',
                    border: '1px solid currentColor', padding: '2px 6px'
                  }}>
                    {m.action === 'reorder_now' ? 'הזמן מיד' : m.action === 'reorder_soon' ? 'הזמן השבוע' : 'OK'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function KPI({ label, value, color }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.06)', borderTop: `2px solid ${color}`, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Panel({ title, tag, children }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#383E47', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
        {tag && <span style={{ fontSize: 9, color: '#9D4EDD', border: '1px solid rgba(157,78,221,0.3)', padding: '1px 7px' }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}
