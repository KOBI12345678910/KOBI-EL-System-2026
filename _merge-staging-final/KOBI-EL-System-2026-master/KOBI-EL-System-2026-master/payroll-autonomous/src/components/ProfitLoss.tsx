import React, { useState, useMemo } from 'react';

/* ── Helpers ──────────────────────────────────────────── */
const fmt = (n: number) =>
  '₪' + Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 });

const pct = (a: number, b: number) =>
  b === 0 ? '0%' : (((a / b) * 100).toFixed(1) + '%');

/* ── Mock data ────────────────────────────────────────── */
interface PnlData {
  salesRevenue: number;
  otherRevenue: number;
  rawMaterials: number;
  directLabor: number;
  subcontractors: number;
  mgmtSalary: number;
  rent: number;
  vehicles: number;
  marketing: number;
  insurance: number;
  general: number;
  financing: number;
}

const MONTHLY_DATA: Record<string, PnlData> = {
  '2026-04': { salesRevenue: 312000, otherRevenue: 18500, rawMaterials: 68000, directLabor: 42000, subcontractors: 25000, mgmtSalary: 38000, rent: 12000, vehicles: 8500, marketing: 4200, insurance: 3800, general: 5100, financing: 6200 },
  '2026-03': { salesRevenue: 287000, otherRevenue: 12000, rawMaterials: 59000, directLabor: 40000, subcontractors: 21000, mgmtSalary: 38000, rent: 12000, vehicles: 7800, marketing: 3500, insurance: 3800, general: 4800, financing: 6200 },
  '2026-02': { salesRevenue: 265000, otherRevenue: 9500, rawMaterials: 53000, directLabor: 38000, subcontractors: 18000, mgmtSalary: 38000, rent: 12000, vehicles: 7200, marketing: 3100, insurance: 3800, general: 4500, financing: 6200 },
  '2026-01': { salesRevenue: 295000, otherRevenue: 14000, rawMaterials: 62000, directLabor: 41000, subcontractors: 23000, mgmtSalary: 38000, rent: 12000, vehicles: 8200, marketing: 3800, insurance: 3800, general: 5000, financing: 6200 },
  '2025-12': { salesRevenue: 340000, otherRevenue: 22000, rawMaterials: 74000, directLabor: 45000, subcontractors: 28000, mgmtSalary: 38000, rent: 12000, vehicles: 9100, marketing: 5500, insurance: 3800, general: 5800, financing: 6200 },
};

/* ── Row components ───────────────────────────────────── */
interface RowProps {
  label: string;
  value: number;
  indent?: boolean;
  bold?: boolean;
  color?: string;
  large?: boolean;
  positive?: boolean; // force green/red sign
}

function Row({ label, value, indent, bold, color, large, positive }: RowProps) {
  const col = color || (positive !== undefined ? (value >= 0 ? '#3fb950' : '#f85149') : '#e6edf3');
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: `${large ? 14 : 8}px ${indent ? 28 : 8}px`,
      borderBottom: '1px solid #2a3340',
      fontWeight: bold ? 700 : 400,
      fontSize: large ? 18 : 13,
    }}>
      <span style={{ color: indent ? '#c9d1d9' : '#e6edf3' }}>{label}</span>
      <span style={{ color: col, direction: 'ltr' }}>
        {value < 0 ? '-' : ''}{fmt(value)}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '10px 8px 4px', fontSize: 11, fontWeight: 700,
      color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '2px solid #2a3340', marginTop: 8 }}>
      {title}
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
export default function ProfitLoss() {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [monthKey, setMonthKey] = useState(currentKey);

  const d = MONTHLY_DATA[monthKey] || MONTHLY_DATA['2026-04'];

  const totalRevenue = d.salesRevenue + d.otherRevenue;
  const totalCogs = d.rawMaterials + d.directLabor + d.subcontractors;
  const grossProfit = totalRevenue - totalCogs;
  const grossMarginPct = pct(grossProfit, totalRevenue);
  const totalOpex = d.mgmtSalary + d.rent + d.vehicles + d.marketing + d.insurance + d.general;
  const ebit = grossProfit - totalOpex;
  const ebt = ebit - d.financing;
  const tax = Math.max(0, Math.round(ebt * 0.23));
  const netProfit = ebt - tax;

  const months = Object.keys(MONTHLY_DATA).sort().reverse();
  const monthLabels: Record<string, string> = {
    '2026-04': 'אפריל 2026', '2026-03': 'מרץ 2026', '2026-02': 'פברואר 2026',
    '2026-01': 'ינואר 2026', '2025-12': 'דצמבר 2025',
  };

  const handleExport = () => {
    const rows = [
      ['דוח רווח והפסד', 'טכנו כל עוזי בע"מ', monthLabels[monthKey] || monthKey],
      ['סעיף', 'סכום'],
      ['הכנסות ממכירות', d.salesRevenue],
      ['הכנסות אחרות', d.otherRevenue],
      ['סה"כ הכנסות', totalRevenue],
      ['חומרי גלם', d.rawMaterials],
      ['שכר עבודה ישיר', d.directLabor],
      ['קבלני משנה', d.subcontractors],
      ['סה"כ עלות המכר', totalCogs],
      ['רווח גולמי', grossProfit],
      ['שכר ניהול', d.mgmtSalary],
      ['שכירות', d.rent],
      ['רכב ותחבורה', d.vehicles],
      ['שיווק', d.marketing],
      ['ביטוח', d.insurance],
      ['הוצ\' כלליות', d.general],
      ['סה"כ הוצ\' תפעוליות', totalOpex],
      ['רווח תפעולי (EBIT)', ebit],
      ['מימון', -d.financing],
      ['רווח לפני מס', ebt],
      ['מס חברות (23%)', tax],
      ['רווח נקי', netProfit],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pnl_${monthKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ direction: 'rtl', fontFamily: "-apple-system,'Segoe UI',Heebo,Arial,sans-serif", color: '#e6edf3', maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>דוח רווח והפסד</h2>
          <div style={{ fontSize: 13, color: '#8b96a5' }}>חברה: טכנו כל עוזי בע"מ</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={monthKey} onChange={e => setMonthKey(e.target.value)}
            style={{ background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
              borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
            {months.map(m => (
              <option key={m} value={m}>{monthLabels[m] || m}</option>
            ))}
          </select>
          <button onClick={handleExport}
            style={{ background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
              borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            📊 ייצוא
          </button>
          <button onClick={() => window.print()}
            style={{ background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
              borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            🖨️ הדפס
          </button>
        </div>
      </div>

      {/* P&L card */}
      <div style={{ background: '#1a2028', border: '1px solid #2a3340', borderRadius: 8, overflow: 'hidden' }}>
        <SectionHeader title="הכנסות" />
        <Row label="הכנסות ממכירות" value={d.salesRevenue} indent />
        <Row label="הכנסות אחרות" value={d.otherRevenue} indent />
        <Row label='סה"כ הכנסות' value={totalRevenue} bold color="#4a9eff" />

        <SectionHeader title="עלות המכר (COGS)" />
        <Row label="חומרי גלם" value={d.rawMaterials} indent />
        <Row label="שכר עבודה ישיר" value={d.directLabor} indent />
        <Row label="קבלני משנה" value={d.subcontractors} indent />
        <Row label='סה"כ עלות המכר' value={totalCogs} bold color="#f85149" />

        <div style={{ padding: '12px 8px', borderBottom: '1px solid #2a3340', display: 'flex',
          justifyContent: 'space-between', fontWeight: 700, fontSize: 15, background: 'rgba(63,185,80,0.06)' }}>
          <span>רווח גולמי</span>
          <span style={{ color: grossProfit >= 0 ? '#3fb950' : '#f85149', direction: 'ltr' }}>
            {fmt(grossProfit)}
          </span>
        </div>
        <div style={{ padding: '4px 8px 10px', borderBottom: '2px solid #2a3340',
          fontSize: 12, color: '#8b96a5', textAlign: 'left' }}>
          אחוז רווח גולמי: {grossMarginPct}
        </div>

        <SectionHeader title="הוצאות תפעוליות" />
        <Row label="שכר ניהול" value={d.mgmtSalary} indent />
        <Row label="שכירות" value={d.rent} indent />
        <Row label="רכב ותחבורה" value={d.vehicles} indent />
        <Row label="שיווק" value={d.marketing} indent />
        <Row label="ביטוח" value={d.insurance} indent />
        <Row label="הוצ' כלליות" value={d.general} indent />
      <Row label={'סה"כ הוצ\' תפעוליות'} value={totalOpex} bold color="#f85149" />
        <div style={{ padding: '12px 8px', borderBottom: '1px solid #2a3340', display: 'flex',
          justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
          <span>רווח תפעולי (EBIT)</span>
          <span style={{ color: ebit >= 0 ? '#3fb950' : '#f85149', direction: 'ltr' }}>{fmt(ebit)}</span>
        </div>

        <Row label="מימון" value={-d.financing} indent color="#f85149" />

        <div style={{ padding: '12px 8px', borderBottom: '1px solid #2a3340', display: 'flex',
          justifyContent: 'space-between', fontWeight: 600, fontSize: 14 }}>
          <span>רווח לפני מס</span>
          <span style={{ color: ebt >= 0 ? '#3fb950' : '#f85149', direction: 'ltr' }}>{fmt(ebt)}</span>
        </div>

        <Row label="מס חברות (23%)" value={-tax} indent color="#d29922" />

        {/* Net profit — big */}
        <div style={{ padding: '20px 8px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', background: netProfit >= 0 ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
          borderTop: `2px solid ${netProfit >= 0 ? '#3fb950' : '#f85149'}` }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>רווח נקי</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: netProfit >= 0 ? '#3fb950' : '#f85149',
            direction: 'ltr' }}>
            {fmt(netProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}
