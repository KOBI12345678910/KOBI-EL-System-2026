import React, { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar } from 'recharts';
import { useApi } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';

// ════════════════════════════════════════════════════════════════
// SUPPLY CHAIN — the most important page in the whole system
// 9 professional metrics, all computed live from the database.
// Supplier scorecard · EOQ · Bottlenecks · Lead-time variance ·
// Stockout risk · ABC analysis · Carrying cost · Turnover · Dead stock
// ════════════════════════════════════════════════════════════════

export function SupplyChain() {
  const { data, fetch, loading } = useApi<any>('/api/supply-chain/dashboard');

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 80, color: '#5C7080' }}>טוען אינטליגנציית שרשרת אספקה...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>שרשרת אספקה — Intelligence Center</h1>
          <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginTop: 2 }}>
            SUPPLIER SCORING · EOQ · BOTTLENECKS · LEAD TIME · ABC · TURNOVER · DEAD STOCK
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DCC91' }} />
          <span style={{ fontSize: 10, color: '#3DCC91' }}>LIVE · מתעדכן אוטומטית</span>
        </div>
      </div>

      {/* TOP KPI STRIP — the 6 numbers that matter most */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        <KPI
          label="שווי מלאי"
          value={formatCurrency(data.carryingCost?.stockValue || 0)}
          sub="Capital tied up"
          color="#3DCC91"
        />
        <KPI
          label="עלות החזקה שנתית"
          value={formatCurrency(data.carryingCost?.annualCarryingCost || 0)}
          sub={`${data.carryingCost?.annualCarryingCostPct}% מהמלאי`}
          color="#FC8585"
        />
        <KPI
          label="Inventory Turnover"
          value={`${data.turnover?.turnoverRate || 0}×`}
          sub={data.turnover?.verdict}
          color={data.turnover?.turnoverRate >= 6 ? '#3DCC91' : data.turnover?.turnoverRate >= 3 ? '#FFB366' : '#FC8585'}
        />
        <KPI
          label="Days of Inventory"
          value={data.turnover?.daysOfInventory === 999 ? '∞' : `${data.turnover?.daysOfInventory || 0} ימים`}
          sub="קצב מחזור"
          color="#48AFF0"
        />
        <KPI
          label="מלאי מת"
          value={formatCurrency(data.deadStock?.totalTiedUp || 0)}
          sub={`${data.deadStock?.count || 0} פריטים 90+ ימים`}
          color="#FFB366"
        />
        <KPI
          label="ספקים אסטרטגיים"
          value={(data.suppliers || []).filter((s: any) => s.tier === 'strategic').length}
          sub={`מתוך ${(data.suppliers || []).length}`}
          color="#9D4EDD"
        />
      </div>

      {/* ROW 1: SUPPLIER SCORECARD + BOTTLENECKS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8, marginBottom: 8 }}>
        <Panel title="ניקוד ספקים — Multi-Factor Scorecard" tag="SCORING">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['ספק', 'קטגוריה', 'סה"כ הוצאה', 'נפח', 'זמן אספקה', 'רעננות', 'ציון', 'Tier'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.suppliers || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 10px', color: '#F6F7F9', fontWeight: 500 }}>{s.name}</td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{s.category}</td>
                  <td style={{ padding: '8px 10px', color: '#3DCC91' }}>{formatCurrency(s.totalSpend)}</td>
                  <ScoreCell score={s.scores?.volume} />
                  <ScoreCell score={s.scores?.leadTime} />
                  <ScoreCell score={s.scores?.freshness} />
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: s.scores?.overall >= 80 ? '#3DCC91' : s.scores?.overall >= 60 ? '#FFB366' : '#FC8585' }}>
                    {s.scores?.overall}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <TierTag tier={s.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="צווארי בקבוק — Pipeline Choke Points" tag="BOTTLENECKS">
          <div style={{ padding: '8px 0' }}>
            {(data.bottlenecks || []).map((b: any) => (
              <div key={b.stage} style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: b.isBottleneck ? 'rgba(252,133,133,0.04)' : 'transparent'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#F6F7F9', fontWeight: 500 }}>{b.stage}</span>
                  <span style={{ fontSize: 11, color: b.isBottleneck ? '#FC8585' : '#5C7080', fontWeight: 600 }}>
                    {b.count} פרוייקטים
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, height: 4, background: '#383E47' }}>
                    <div style={{
                      width: `${b.pctOfPipeline}%`,
                      height: '100%',
                      background: b.isBottleneck ? '#FC8585' : '#48AFF0'
                    }} />
                  </div>
                  <span style={{ fontSize: 9, color: '#5C7080', minWidth: 36 }}>{b.pctOfPipeline}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5C7080' }}>
                  <span>₪{Math.round(b.valueStuck).toLocaleString('he-IL')} ערך תקוע</span>
                  <span style={{ color: b.avgDaysStuck > 3 ? '#FFB366' : '#5C7080' }}>
                    {b.avgDaysStuck} ימים ממוצע
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ROW 2: EOQ + ABC */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Panel title="EOQ — Economic Order Quantity" tag="OPTIMIZED">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['פריט', 'מלאי', 'EOQ', 'Reorder Point', 'סטטוס'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.eoq || []).slice(0, 10).map((item: any) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 10px', color: '#F6F7F9', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{item.currentStock}</td>
                  <td style={{ padding: '8px 10px', color: '#48AFF0', fontWeight: 600 }}>{item.eoq}</td>
                  <td style={{ padding: '8px 10px', color: '#FFA500' }}>{item.reorderPoint}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {item.shouldReorderNow
                      ? <span style={{ color: '#FC8585', border: '1px solid #FC858540', padding: '2px 7px', fontSize: 9 }}>הזמן עכשיו</span>
                      : <span style={{ color: '#3DCC91', border: '1px solid #3DCC9140', padding: '2px 7px', fontSize: 9 }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="ABC Analysis — Pareto" tag="CLASSIFICATION">
          <div style={{ padding: '8px 0' }}>
            {['A', 'B', 'C'].map((cat) => {
              const items = (data.abc || []).filter((i: any) => i.abcCategory === cat);
              const totalValue = items.reduce((s: number, i: any) => s + (i.totalValue || 0), 0);
              const totalStock = data.abc?.reduce((s: number, i: any) => s + (i.totalValue || 0), 0) || 1;
              const pct = Math.round((totalValue / totalStock) * 100);
              return (
                <div key={cat} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: cat === 'A' ? '#FC8585' : cat === 'B' ? '#FFB366' : '#48AFF0' }}>
                      Category {cat}
                    </span>
                    <span style={{ fontSize: 11, color: '#ABB3BF' }}>
                      {items.length} פריטים · {pct}% מהערך
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#383E47', marginBottom: 4 }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: cat === 'A' ? '#FC8585' : cat === 'B' ? '#FFB366' : '#48AFF0'
                    }} />
                  </div>
                  <div style={{ fontSize: 9, color: '#5C7080' }}>
                    ערך: {formatCurrency(totalValue)}
                    {' · '}
                    {cat === 'A' ? 'מעקב צמוד — 80% מההון' : cat === 'B' ? 'בקרה בינונית' : 'בקרה רופפת'}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ROW 3: LEAD TIME VARIANCE + STOCKOUT RISK */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8, marginBottom: 8 }}>
        <Panel title="Lead Time Variance — Promise vs Reality" tag="ANALYTICS">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['חומר', 'קטגוריה', 'N', 'הובטח', 'בפועל', 'סטיה', 'On-Time', 'המלצה'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.leadTime || []).map((l: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 10px', color: '#F6F7F9' }}>{l.material}</td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{l.category}</td>
                  <td style={{ padding: '8px 10px', color: '#5C7080' }}>{l.sampleSize}</td>
                  <td style={{ padding: '8px 10px', color: '#48AFF0' }}>{l.avgPromisedDays}</td>
                  <td style={{ padding: '8px 10px', color: l.promiseGap > 0 ? '#FC8585' : '#3DCC91', fontWeight: 600 }}>
                    {l.avgActualDays}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#FFB366' }}>±{l.stdDeviation}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ color: l.onTimeRate >= 90 ? '#3DCC91' : l.onTimeRate >= 70 ? '#FFB366' : '#FC8585' }}>
                      {l.onTimeRate}%
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF', fontSize: 10 }}>{l.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="סיכון Stockout" tag="RISK">
          <div style={{ padding: '8px 0' }}>
            {(data.stockoutRisk || []).map((r: any, i: number) => (
              <div key={i} style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: r.riskLevel === 'critical' ? 'rgba(252,133,133,0.06)' : r.riskLevel === 'high' ? 'rgba(255,179,102,0.04)' : 'transparent'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500 }}>{r.material}</span>
                  <RiskBadge level={r.riskLevel} />
                </div>
                <div style={{ fontSize: 10, color: '#5C7080', marginBottom: 3 }}>
                  {r.openOrders} הזמנות פתוחות · צריכה {r.totalNeeded} · מלאי {r.currentStock}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 3, background: '#383E47' }}>
                    <div style={{
                      width: `${Math.min(100, r.coverRatio * 33)}%`,
                      height: '100%',
                      background: r.riskLevel === 'critical' ? '#FC8585' : r.riskLevel === 'high' ? '#FFB366' : '#3DCC91'
                    }} />
                  </div>
                  <span style={{ fontSize: 9, color: '#5C7080', minWidth: 44 }}>
                    {r.coverRatio}× cover
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ROW 4: CARRYING COST BREAKDOWN + DEAD STOCK */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8 }}>
        <Panel title="Carrying Cost Breakdown" tag="FINANCIAL">
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: '#5C7080', marginBottom: 12 }}>
              עלות שנתית לאחזקת המלאי — {formatCurrency(data.carryingCost?.annualCarryingCost || 0)}
            </div>
            {[
              { label: 'אחסון', key: 'storage', color: '#48AFF0' },
              { label: 'ביטוח', key: 'insurance', color: '#9D4EDD' },
              { label: 'עלות הון', key: 'capital', color: '#FFA500' },
              { label: 'התיישנות', key: 'obsolescence', color: '#FC8585' },
            ].map(item => {
              const value = data.carryingCost?.breakdown?.[item.key] || 0;
              const total = data.carryingCost?.annualCarryingCost || 1;
              const pct = Math.round((value / total) * 100);
              return (
                <div key={item.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: '#ABB3BF' }}>{item.label}</span>
                    <span style={{ color: item.color, fontWeight: 600 }}>
                      {formatCurrency(value)} · {pct}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#383E47' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: item.color }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: '#5C7080' }}>חודשי</div>
                <div style={{ fontSize: 14, color: '#FC8585', fontWeight: 600 }}>
                  {formatCurrency(data.carryingCost?.monthlyCarryingCost || 0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#5C7080' }}>יומי</div>
                <div style={{ fontSize: 14, color: '#FC8585', fontWeight: 600 }}>
                  {formatCurrency(data.carryingCost?.dailyCarryingCost || 0)}
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title={`מלאי מת (90+ ימים ללא תנועה) — ${data.deadStock?.count || 0} פריטים`} tag="WASTE">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['פריט', 'קטגוריה', 'כמות', 'עלות ליח', 'ערך תקוע', 'ספק'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.deadStock?.items || []).slice(0, 10).map((item: any) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 10px', color: '#F6F7F9' }}>{item.name}</td>
                  <td style={{ padding: '8px 10px', color: '#5C7080' }}>{item.category}</td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{item.qty}</td>
                  <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>₪{item.cost_per_unit}</td>
                  <td style={{ padding: '8px 10px', color: '#FC8585', fontWeight: 600 }}>{formatCurrency(item.tiedUp)}</td>
                  <td style={{ padding: '8px 10px', color: '#5C7080', fontSize: 10 }}>{item.supplier_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#383E47', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#5C7080' }}>סה"כ הון קפוא במלאי מת</span>
            <span style={{ fontSize: 13, color: '#FC8585', fontWeight: 700 }}>
              {formatCurrency(data.deadStock?.totalTiedUp || 0)}
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Small helper components ──

function KPI({ label, value, sub, color }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.06)', borderTop: `2px solid ${color}`, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#5C7080' }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, tag, children }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#383E47', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
        {tag && <span style={{ fontSize: 9, color: '#9D4EDD', border: '1px solid rgba(157,78,221,0.3)', padding: '1px 7px' }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function ScoreCell({ score }: { score: number }) {
  const color = score >= 80 ? '#3DCC91' : score >= 60 ? '#FFB366' : '#FC8585';
  return (
    <td style={{ padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 40, height: 3, background: '#383E47' }}>
          <div style={{ width: `${score}%`, height: '100%', background: color }} />
        </div>
        <span style={{ fontSize: 10, color, minWidth: 22 }}>{score}</span>
      </div>
    </td>
  );
}

function TierTag({ tier }: { tier: string }) {
  const config: any = {
    strategic:     { color: '#FFA500', bg: 'rgba(255,165,0,0.12)', label: 'אסטרטגי' },
    preferred:     { color: '#3DCC91', bg: 'rgba(61,204,145,0.12)', label: 'מועדף' },
    transactional: { color: '#48AFF0', bg: 'rgba(72,175,240,0.12)', label: 'שגרתי' },
    probation:     { color: '#FC8585', bg: 'rgba(252,133,133,0.12)', label: 'בעייתי' },
  };
  const c = config[tier] || { color: '#5C7080', bg: 'transparent', label: tier };
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}40`,
      padding: '2px 8px',
      fontSize: 9,
      letterSpacing: '0.08em',
    }}>
      {c.label}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const config: any = {
    critical: { color: '#FC8585', label: 'קריטי' },
    high:     { color: '#FFB366', label: 'גבוה' },
    medium:   { color: '#FFA500', label: 'בינוני' },
    low:      { color: '#3DCC91', label: 'נמוך' },
  };
  const c = config[level] || { color: '#5C7080', label: level };
  return (
    <span style={{
      color: c.color,
      border: `1px solid ${c.color}40`,
      padding: '2px 7px',
      fontSize: 9,
      letterSpacing: '0.08em',
    }}>
      {c.label}
    </span>
  );
}
