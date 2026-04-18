import React, { useState, useEffect } from 'react';

const fmtMoney = (n: number) =>
  '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 0 });

interface KPIData {
  revenue: number;
  revenueTarget: number;
  activeProjects: number;
  completedProjects: number;
  totalEmployees: number;
  presentToday: number;
  cashFlow: number;
  cashFlowTrend: 'up' | 'down';
  grossMarginPct: number;
  grossMarginChange: number;
  avgExecutionDays: number;
  // Real estate
  properties: number;
  activeTenants: number;
  rentalIncome: number;
  occupancyPct: number;
}

const MOCK: KPIData = {
  revenue: 145000,
  revenueTarget: 200000,
  activeProjects: 7,
  completedProjects: 3,
  totalEmployees: 30,
  presentToday: 28,
  cashFlow: 89000,
  cashFlowTrend: 'up',
  grossMarginPct: 38,
  grossMarginChange: 4,
  avgExecutionDays: 12,
  properties: 8,
  activeTenants: 14,
  rentalIncome: 42000,
  occupancyPct: 87,
};

function calcHealthScore(d: KPIData): number {
  const revScore = Math.min((d.revenue / d.revenueTarget) * 100, 100);
  const cashScore = d.cashFlow > 50000 ? 100 : (d.cashFlow / 50000) * 100;
  const projectScore = d.completedProjects >= 3 ? 100 : (d.completedProjects / 3) * 100;
  const staffScore = (d.presentToday / d.totalEmployees) * 100;
  return Math.round((revScore + cashScore + projectScore + staffScore) / 4);
}

function HealthScore({ score }: { score: number }) {
  const color = score > 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const emoji = score > 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: `2px solid ${color}`,
      borderRadius: 16,
      padding: '28px 32px',
      textAlign: 'center',
      marginBottom: 24,
      boxShadow: `0 0 24px ${color}33`,
    }}>
      <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>ציון בריאות העסק</div>
      <div style={{ fontSize: 56, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 20, color: '#64748b', marginTop: 4 }}>/100 {emoji}</div>
      <div style={{ fontSize: 13, color: '#475569', marginTop: 10 }}>
        מחושב לפי: הכנסות, תזרים, ביצוע פרויקטים, כוח אדם
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: '#1e293b', borderRadius: 6, height: 8, marginTop: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 6, transition: 'width 0.6s' }} />
    </div>
  );
}

function KPICard({
  icon, title, main, sub, progress,
}: {
  icon: string; title: string; main: string; sub?: string; progress?: { value: number; max: number };
}) {
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '18px 20px',
      flex: '1 1 0',
      minWidth: 200,
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{main}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
      {progress && (
        <>
          <ProgressBar value={progress.value} max={progress.max} color="#3b82f6" />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {Math.round((progress.value / progress.max) * 100)}% מהיעד
          </div>
        </>
      )}
    </div>
  );
}

function WinsSection() {
  const items = [
    { ok: true, text: '3 פרויקטים הושלמו בזמן' },
    { ok: true, text: '₪45,000 תשלומים נגבו' },
    { ok: true, text: '2 לקוחות חדשים נוספו' },
    { ok: false, text: 'PO אחד מאחר ב-3 ימים' },
  ];
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 16px', color: '#f1f5f9', fontSize: 16 }}>🏆 הישגים השבוע</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{item.ok ? '✅' : '⚠️'}</span>
            <span style={{ fontSize: 14, color: item.ok ? '#86efac' : '#fbbf24' }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RealEstateMini({ d }: { d: KPIData }) {
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 16px', color: '#f1f5f9', fontSize: 16 }}>🏢 נדל"ן — סקירה מהירה</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {[
          { label: 'נכסים מנוהלים', value: String(d.properties) },
          { label: 'דיירים פעילים', value: String(d.activeTenants) },
          { label: 'הכנסת שכירות החודש', value: fmtMoney(d.rentalIncome) },
          { label: 'תפוסה', value: `${d.occupancyPct}%` },
        ].map((item, i) => (
          <div key={i} style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{item.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', marginTop: 4 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextActions() {
  const actions = [
    { icon: '📞', text: 'התקשר לדן פרידמן — הצעת מחיר ממתינה', urgency: 'high' },
    { icon: '✅', text: 'אשר PO #1234 — ₪22,000', urgency: 'medium' },
    { icon: '📋', text: 'סקור תלוש שכר לחודש אפריל', urgency: 'low' },
  ];
  const urgencyColor: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '20px 24px' }}>
      <h3 style={{ margin: '0 0 16px', color: '#f1f5f9', fontSize: 16 }}>⚡ פעולות הבאות</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {actions.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#0f172a', borderRadius: 8, padding: '12px 14px',
            borderRight: `3px solid ${urgencyColor[a.urgency]}`,
          }}>
            <span style={{ fontSize: 18 }}>{a.icon}</span>
            <span style={{ fontSize: 13, color: '#cbd5e1', flex: 1 }}>{a.text}</span>
            <button style={{
              background: urgencyColor[a.urgency] + '22',
              border: `1px solid ${urgencyColor[a.urgency]}`,
              color: urgencyColor[a.urgency],
              borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            }}>בצע</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [data, setData] = useState<KPIData>(MOCK);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate slight data variation
      setData(prev => ({
        ...prev,
        cashFlow: prev.cashFlow + Math.floor((Math.random() - 0.5) * 2000),
        presentToday: Math.min(prev.totalEmployees, Math.max(25, prev.presentToday + Math.floor((Math.random() - 0.5) * 2))),
      }));
      setLastUpdate(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const score = calcHealthScore(data);
  const revPct = Math.round((data.revenue / data.revenueTarget) * 100);

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, direction: 'rtl', fontFamily: '-apple-system, Segoe UI, Heebo, Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>
            👔 דשבורד מנכ"ל — טכנו כל עוזי + נדל"ן
          </h1>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            עודכן לאחרונה: {lastUpdate.toLocaleTimeString('he-IL')}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#475569', background: '#1e293b', padding: '8px 14px', borderRadius: 8, border: '1px solid #334155' }}>
          אפריל 2026
        </div>
      </div>

      {/* Section 1: Health Score */}
      <HealthScore score={score} />

      {/* Section 2: KPI Cards Row 1 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <KPICard
          icon="💰"
          title="הכנסות החודש"
          main={fmtMoney(data.revenue)}
          sub={`יעד: ${fmtMoney(data.revenueTarget)} (${revPct}%)`}
          progress={{ value: data.revenue, max: data.revenueTarget }}
        />
        <KPICard
          icon="📋"
          title="פרויקטים"
          main={`${data.activeProjects} פעילים`}
          sub={`${data.completedProjects} הושלמו החודש`}
        />
        <KPICard
          icon="👥"
          title="כוח אדם"
          main={`${data.presentToday}/${data.totalEmployees}`}
          sub="נוכחים היום / סה״כ עובדים"
          progress={{ value: data.presentToday, max: data.totalEmployees }}
        />
      </div>

      {/* Section 2: KPI Cards Row 2 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <KPICard
          icon="💵"
          title="תזרים מזומנים"
          main={fmtMoney(data.cashFlow)}
          sub={`מגמה 30 יום: ${data.cashFlowTrend === 'up' ? '↑ עלייה' : '↓ ירידה'}`}
        />
        <KPICard
          icon="📈"
          title="רווח גולמי"
          main={`${data.grossMarginPct}%`}
          sub={`לעומת חודש שעבר: ${data.grossMarginChange > 0 ? '+' : ''}${data.grossMarginChange}%`}
        />
        <KPICard
          icon="⏱️"
          title="זמן ביצוע ממוצע"
          main={`${data.avgExecutionDays} ימים`}
          sub="לפרויקט"
        />
      </div>

      {/* Section 3: Wins */}
      <WinsSection />

      {/* Section 4: Real Estate */}
      <RealEstateMini d={data} />

      {/* Section 5: Next Actions */}
      <NextActions />
    </div>
  );
}
