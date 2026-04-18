/**
 * ReportsDashboard — מרכז דוחות
 * 4 report types: monthly payroll, projects, suppliers, P&L
 * Print-ready with window.print() and CSV export
 */

import React, { useState, useCallback } from 'react';

/* ── Helpers ── */
const fmtMoney = (n: number) =>
  '₪ ' + Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const months = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const bom = '\uFEFF';
  const content = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Mock data ── */
const MOCK_PAYROLL = [
  { id: 1, name: 'ישראל ישראלי', gross: 18000, deductions: 4200, net: 13800, status: 'approved' },
  { id: 2, name: 'שרה לוי', gross: 22000, deductions: 5800, net: 16200, status: 'issued' },
  { id: 3, name: 'משה כהן', gross: 15000, deductions: 3100, net: 11900, status: 'approved' },
  { id: 4, name: 'רחל גולן', gross: 28000, deductions: 8200, net: 19800, status: 'issued' },
  { id: 5, name: 'דוד מזרחי', gross: 12500, deductions: 2400, net: 10100, status: 'computed' },
];

const MOCK_PROJECTS = [
  { id: 1, name: 'בניית משרדים ת"א', client: 'חברת אלפא', start: '2026-01-10', end: '2026-06-30', budget: 850000, actual: 620000, status: 'פעיל' },
  { id: 2, name: 'שיפוץ מחסן דרום', client: 'לוגיסטיקה בע"מ', start: '2025-11-01', end: '2026-03-15', budget: 230000, actual: 238000, status: 'חריגה' },
  { id: 3, name: 'פיתוח תשתית חשמל', client: 'עיריית חיפה', start: '2026-02-01', end: '2026-09-30', budget: 1200000, actual: 310000, status: 'פעיל' },
  { id: 4, name: 'הקמת מרכז מיון', client: 'מגדל קניות', start: '2025-06-01', end: '2025-12-31', budget: 540000, actual: 540000, status: 'הושלם' },
];

const MOCK_SUPPLIERS = [
  { id: 1, name: 'ספק מתכות בע"מ', orders: 34, total: 420000, avgDays: 3.2, score: 94 },
  { id: 2, name: 'חומרי בניה יוסף', orders: 28, total: 380000, avgDays: 4.1, score: 88 },
  { id: 3, name: 'כלי עבודה מתקדמים', orders: 17, total: 95000, avgDays: 2.8, score: 97 },
  { id: 4, name: 'מחסני חומרים', orders: 51, total: 610000, avgDays: 5.3, score: 79 },
  { id: 5, name: 'אלקטרו-טק', orders: 12, total: 72000, avgDays: 6.1, score: 71 },
];

const MOCK_PL = {
  revenue: { label: 'הכנסות ממכירות', amount: 2400000 },
  materials: { label: 'עלות חומרים', amount: 780000 },
  labor: { label: 'שכר עבודה', amount: 620000 },
  general: { label: 'הוצאות כלליות', amount: 210000 },
};

/* ── Print styles injected once ── */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area { position: fixed; top: 0; left: 0; right: 0; width: 100%; padding: 20px; }
  .no-print { display: none !important; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 8px; font-size: 12px; }
  @page { size: A4; margin: 20mm; }
}
`;

/* ══════════════════════════════════════
   Report 1: דוח שכר חודשי
══════════════════════════════════════ */
function PayrollReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const totalGross = MOCK_PAYROLL.reduce((s, r) => s + r.gross, 0);
  const totalDed = MOCK_PAYROLL.reduce((s, r) => s + r.deductions, 0);
  const totalNet = MOCK_PAYROLL.reduce((s, r) => s + r.net, 0);

  const handlePrint = () => window.print();

  const handleCSV = () => downloadCSV(
    `payroll-${year}-${month}.csv`,
    MOCK_PAYROLL.map(r => [r.name, String(r.gross), String(r.deductions), String(r.net), r.status]),
    ['עובד', 'שכר ברוטו', 'ניכויים', 'נטו', 'סטטוס'],
  );

  return (
    <div>
      {/* Filters */}
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>חודש</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>שנה</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={handlePrint} style={btnStyle}>🖨️ הדפס</button>
        <button onClick={handleCSV} style={btnStyle}>📊 ייצוא CSV</button>
        <button onClick={handlePrint} style={{ ...btnStyle, background: '#1f3a1f', borderColor: '#3fb950', color: '#3fb950' }}>הורד PDF</button>
      </div>

      {/* Print area */}
      <div className="print-area">
        <div style={reportHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: '#4a9eff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>TK</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>טכנו-קול אופס בע"מ</div>
              <div style={{ fontSize: 12, color: '#8b96a5' }}>מערכת שכר 2026</div>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>דוח שכר חודשי</div>
            <div style={{ fontSize: 12, color: '#8b96a5' }}>{months[month - 1]} {year}</div>
          </div>
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              {['עובד', 'שכר ברוטו', 'ניכויים', 'נטו', 'סטטוס'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_PAYROLL.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #2a3340' }}>
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>{fmtMoney(r.gross)}</td>
                <td style={{ ...tdStyle, color: '#f85149' }}>{fmtMoney(r.deductions)}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtMoney(r.net)}</td>
                <td style={tdStyle}>
                  <span style={{ ...badgeStyle, ...(r.status === 'issued' ? badgeGreen : r.status === 'approved' ? badgeBlue : badgeGray) }}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(74,158,255,0.06)', fontWeight: 700 }}>
              <td style={tdStyle}>סה"כ</td>
              <td style={tdStyle}>{fmtMoney(totalGross)}</td>
              <td style={{ ...tdStyle, color: '#f85149' }}>{fmtMoney(totalDed)}</td>
              <td style={{ ...tdStyle, color: '#3fb950' }}>{fmtMoney(totalNet)}</td>
              <td style={tdStyle}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Report 2: דוח פרויקטים
══════════════════════════════════════ */
function ProjectsReport() {
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-12-31');

  const totalBudget = MOCK_PROJECTS.reduce((s, r) => s + r.budget, 0);
  const totalActual = MOCK_PROJECTS.reduce((s, r) => s + r.actual, 0);

  const statusColor = (s: string) =>
    s === 'הושלם' ? badgeGreen : s === 'חריגה' ? { background: '#3a1818', color: '#f85149' } : badgeBlue;

  const handleCSV = () => downloadCSV(
    `projects-${dateFrom}-${dateTo}.csv`,
    MOCK_PROJECTS.map(r => [r.name, r.client, r.start, r.end, String(r.budget), String(r.actual), r.status]),
    ['פרויקט', 'לקוח', 'תאריך התחלה', 'תאריך סיום', 'תקציב', 'בפועל', 'סטטוס'],
  );

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>מתאריך</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>עד תאריך</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={() => window.print()} style={btnStyle}>🖨️ הדפס</button>
        <button onClick={handleCSV} style={btnStyle}>📊 ייצוא CSV</button>
        <button onClick={() => window.print()} style={{ ...btnStyle, background: '#1f3a1f', borderColor: '#3fb950', color: '#3fb950' }}>הורד PDF</button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <div style={statCard}><div style={statLabel}>סה"כ תקציב</div><div style={statValue}>{fmtMoney(totalBudget)}</div></div>
        <div style={statCard}><div style={statLabel}>סה"כ בפועל</div><div style={statValue}>{fmtMoney(totalActual)}</div></div>
        <div style={{ ...statCard, borderColor: totalActual > totalBudget ? '#f85149' : '#3fb950' }}>
          <div style={statLabel}>חריגה / חיסכון</div>
          <div style={{ ...statValue, color: totalActual > totalBudget ? '#f85149' : '#3fb950' }}>
            {fmtMoney(Math.abs(totalActual - totalBudget))} {totalActual > totalBudget ? '▲' : '▼'}
          </div>
        </div>
      </div>

      <div className="print-area">
        <div style={reportHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>טכנו-קול אופס בע"מ — דוח פרויקטים</div>
          <div style={{ fontSize: 12, color: '#8b96a5' }}>{dateFrom} — {dateTo}</div>
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              {['פרויקט', 'לקוח', 'התחלה', 'סיום', 'תקציב', 'בפועל', 'סטטוס'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_PROJECTS.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #2a3340' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                <td style={tdStyle}>{r.client}</td>
                <td style={tdStyle}>{r.start}</td>
                <td style={tdStyle}>{r.end}</td>
                <td style={tdStyle}>{fmtMoney(r.budget)}</td>
                <td style={{ ...tdStyle, color: r.actual > r.budget ? '#f85149' : '#3fb950' }}>{fmtMoney(r.actual)}</td>
                <td style={tdStyle}>
                  <span style={{ ...badgeStyle, ...statusColor(r.status) }}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Report 3: דוח ספקים
══════════════════════════════════════ */
function SuppliersReport() {
  const sorted = [...MOCK_SUPPLIERS].sort((a, b) => b.total - a.total);

  const handleCSV = () => downloadCSV(
    'suppliers-report.csv',
    sorted.map(r => [r.name, String(r.orders), String(r.total), String(r.avgDays), String(r.score)]),
    ['ספק', 'מספר הזמנות', 'סה"כ רכישות', 'ממוצע זמן אספקה (ימים)', 'ציון'],
  );

  const scoreColor = (s: number) => s >= 90 ? '#3fb950' : s >= 75 ? '#d29922' : '#f85149';

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button onClick={() => window.print()} style={btnStyle}>🖨️ הדפס</button>
        <button onClick={handleCSV} style={btnStyle}>📊 ייצוא CSV</button>
        <button onClick={() => window.print()} style={{ ...btnStyle, background: '#1f3a1f', borderColor: '#3fb950', color: '#3fb950' }}>הורד PDF</button>
      </div>

      <div className="print-area">
        <div style={reportHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>טכנו-קול אופס בע"מ — דוח ספקים</div>
          <div style={{ fontSize: 12, color: '#8b96a5' }}>ממוין לפי סה"כ רכישות</div>
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              {['#', 'ספק', 'הזמנות', 'סה"כ רכישות', 'זמן אספקה ממוצע', 'ציון'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #2a3340' }}>
                <td style={{ ...tdStyle, color: '#8b96a5' }}>{i + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                <td style={tdStyle}>{r.orders}</td>
                <td style={tdStyle}>{fmtMoney(r.total)}</td>
                <td style={tdStyle}>{r.avgDays} ימים</td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 700, color: scoreColor(r.score) }}>{r.score}</span>
                  <span style={{ fontSize: 10, color: '#8b96a5', marginRight: 4 }}>/100</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Report 4: דוח הכנסות/הוצאות (P&L)
══════════════════════════════════════ */
function PLReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const pl = MOCK_PL;
  const totalExpenses = pl.materials.amount + pl.labor.amount + pl.general.amount;
  const netProfit = pl.revenue.amount - totalExpenses;
  const maxAmount = pl.revenue.amount;

  const bars = [
    { label: pl.revenue.label, amount: pl.revenue.amount, color: '#4a9eff' },
    { label: pl.materials.label, amount: pl.materials.amount, color: '#f85149' },
    { label: pl.labor.label, amount: pl.labor.amount, color: '#d29922' },
    { label: pl.general.label, amount: pl.general.amount, color: '#8b96a5' },
  ];

  const handleCSV = () => downloadCSV(
    `pl-${year}-${month}.csv`,
    [
      [pl.revenue.label, String(pl.revenue.amount), 'הכנסה'],
      [pl.materials.label, String(pl.materials.amount), 'הוצאה'],
      [pl.labor.label, String(pl.labor.amount), 'הוצאה'],
      [pl.general.label, String(pl.general.amount), 'הוצאה'],
      ['רווח נקי', String(netProfit), ''],
    ],
    ['קטגוריה', 'סכום', 'סוג'],
  );

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>חודש</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>שנה</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => window.print()} style={btnStyle}>🖨️ הדפס</button>
        <button onClick={handleCSV} style={btnStyle}>📊 ייצוא CSV</button>
        <button onClick={() => window.print()} style={{ ...btnStyle, background: '#1f3a1f', borderColor: '#3fb950', color: '#3fb950' }}>הורד PDF</button>
      </div>

      <div className="print-area">
        <div style={reportHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>טכנו-קול אופס בע"מ — דוח הכנסות/הוצאות</div>
          <div style={{ fontSize: 12, color: '#8b96a5' }}>{months[month - 1]} {year}</div>
        </div>

        {/* Bar chart */}
        <div style={{ margin: '24px 0' }}>
          {bars.map(b => (
            <div key={b.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{b.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtMoney(b.amount)}</span>
              </div>
              <div style={{ background: '#1a2028', borderRadius: 4, height: 22, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(b.amount / maxAmount) * 100}%`,
                  background: b.color,
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* P&L table */}
        <table style={tableStyle}>
          <thead>
            <tr>
              {['קטגוריה', 'סכום', 'אחוז מהכנסות'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #2a3340' }}>
              <td style={{ ...tdStyle, color: '#4a9eff', fontWeight: 600 }}>{pl.revenue.label}</td>
              <td style={{ ...tdStyle, color: '#4a9eff', fontWeight: 600 }}>{fmtMoney(pl.revenue.amount)}</td>
              <td style={tdStyle}>100%</td>
            </tr>
            {[pl.materials, pl.labor, pl.general].map(cat => (
              <tr key={cat.label} style={{ borderBottom: '1px solid #2a3340' }}>
                <td style={tdStyle}>{cat.label}</td>
                <td style={{ ...tdStyle, color: '#f85149' }}>({fmtMoney(cat.amount)})</td>
                <td style={tdStyle}>{((cat.amount / pl.revenue.amount) * 100).toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(63,185,80,0.08)', fontWeight: 700 }}>
              <td style={tdStyle}>רווח נקי</td>
              <td style={{ ...tdStyle, color: '#3fb950', fontSize: 15 }}>{fmtMoney(netProfit)}</td>
              <td style={{ ...tdStyle, color: '#3fb950' }}>{((netProfit / pl.revenue.amount) * 100).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Main ReportsDashboard
══════════════════════════════════════ */
type ReportType = 'payroll' | 'projects' | 'suppliers' | 'pl';

const REPORT_TABS: { id: ReportType; label: string; icon: string }[] = [
  { id: 'payroll',   label: 'דוח שכר חודשי',        icon: '💰' },
  { id: 'projects',  label: 'דוח פרויקטים',          icon: '📋' },
  { id: 'suppliers', label: 'דוח ספקים',              icon: '🏭' },
  { id: 'pl',        label: 'הכנסות / הוצאות',        icon: '📈' },
];

export default function ReportsDashboard() {
  const [active, setActive] = useState<ReportType>('payroll');

  return (
    <div style={{ direction: 'rtl', fontFamily: '-apple-system, "Segoe UI", Heebo, Arial, sans-serif' }}>
      <style>{PRINT_CSS}</style>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e6edf3' }}>📊 מרכז דוחות</h2>
        <p style={{ margin: '4px 0 0', color: '#8b96a5', fontSize: 13 }}>
          הפקת דוחות מקצועיים עם אפשרויות הדפסה וייצוא
        </p>
      </div>

      {/* Tab selector */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {REPORT_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: '10px 18px',
              background: active === t.id ? '#4a9eff' : '#1a2028',
              border: `1px solid ${active === t.id ? '#4a9eff' : '#2a3340'}`,
              color: active === t.id ? '#fff' : '#8b96a5',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'inherit',
              fontWeight: active === t.id ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div style={{ background: '#13171c', border: '1px solid #2a3340', borderRadius: 8, padding: 24 }}>
        {active === 'payroll'   && <PayrollReport />}
        {active === 'projects'  && <ProjectsReport />}
        {active === 'suppliers' && <SuppliersReport />}
        {active === 'pl'        && <PLReport />}
      </div>
    </div>
  );
}

/* ── Shared styles ── */
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#8b96a5', display: 'block', marginBottom: 4, letterSpacing: '0.05em',
};
const selectStyle: React.CSSProperties = {
  background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340',
  padding: '7px 10px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
};
const inputStyle: React.CSSProperties = {
  background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340',
  padding: '7px 10px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
};
const btnStyle: React.CSSProperties = {
  background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
  padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
  fontFamily: 'inherit',
};
const reportHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  paddingBottom: 16, borderBottom: '1px solid #2a3340', marginBottom: 20,
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', color: '#8b96a5',
  fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid #2a3340',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontSize: 13 };
const badgeStyle: React.CSSProperties = {
  display: 'inline-block', padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
};
const badgeGreen: React.CSSProperties = { background: '#1f3321', color: '#3fb950' };
const badgeBlue: React.CSSProperties  = { background: '#1f2f3f', color: '#4a9eff' };
const badgeGray: React.CSSProperties  = { background: '#1a2028', color: '#8b96a5' };
const statCard: React.CSSProperties = {
  padding: 16, background: '#1a2028', borderRadius: 6, border: '1px solid #2a3340',
};
const statLabel: React.CSSProperties = {
  fontSize: 11, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
};
const statValue: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#e6edf3' };
