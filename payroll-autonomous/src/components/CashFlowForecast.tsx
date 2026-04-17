import React, { useState, useMemo } from 'react';

/* ── Helpers ──────────────────────────────────────────── */
const fmt = (n: number) =>
  '₪' + Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 });

function addDays(base: Date, d: number): Date {
  const r = new Date(base);
  r.setDate(r.getDate() + d);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

/* ── Types ────────────────────────────────────────────── */
interface CashEvent {
  date: Date;
  type: 'income' | 'expense';
  description: string;
  amount: number;
}

/* ── Mock data generator ──────────────────────────────── */
function generateEvents(from: Date, days: number): CashEvent[] {
  const events: CashEvent[] = [];

  for (let m = 0; m < 3; m++) {
    const firstOfMonth = new Date(from.getFullYear(), from.getMonth() + m, 1);
    if (firstOfMonth > addDays(from, days)) break;

    const push = (date: Date, type: 'income' | 'expense', desc: string, amount: number) => {
      if (date >= from && date <= addDays(from, days)) {
        events.push({ date, type, description: desc, amount });
      }
    };

    // Fixed monthly expenses
    push(new Date(firstOfMonth), 'expense', 'שכר עובדים', 85000);
    push(new Date(firstOfMonth), 'expense', 'שכירות משרד', 12000);

    // POs (3-5 per month)
    const poCount = 3 + (m % 2 === 0 ? 2 : 1);
    for (let p = 0; p < poCount; p++) {
      const day = 5 + p * 6;
      const amount = 8000 + Math.floor((p * 3317 + m * 5923) % 17000);
      const suppliers = ['ספקי מתכות בע"מ', 'חומרים תעשייתיים', 'טכנו חלקים', 'מחסני עץ', 'פלדות ישראל'];
      push(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day),
        'expense', `PO ספק — ${suppliers[p % suppliers.length]}`, amount);
    }

    // Customer payments (4-8 per month)
    const payCount = 4 + (m % 3 === 0 ? 4 : 2);
    for (let c = 0; c < payCount; c++) {
      const day = 2 + c * 4;
      const amount = 15000 + Math.floor((c * 7411 + m * 2931) % 45000);
      const invoices = ['1234', '1235', '1289', '1301', '1345', '1367', '1389', '1412'];
      const customers = ['פרויקט Y', 'לקוח אלפא', 'בניה חדשה בע"מ', 'קבוצת יהלום', 'טכנולוגיות ביתא', 'פרויקט Z'];
      push(new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day),
        'income', `חשבונית #${invoices[c % invoices.length]} — ${customers[c % customers.length]}`, amount);
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ── Weekly bar chart ─────────────────────────────────── */
interface Week {
  label: string;
  income: number;
  expenses: number;
}

function buildWeeks(events: CashEvent[], from: Date, days: number): Week[] {
  const numWeeks = Math.ceil(days / 7);
  const weeks: Week[] = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = addDays(from, w * 7);
    const weekEnd = addDays(from, w * 7 + 6);
    const label = fmtDate(weekStart);
    let income = 0, expenses = 0;
    events.forEach(e => {
      if (e.date >= weekStart && e.date <= weekEnd) {
        if (e.type === 'income') income += e.amount;
        else expenses += e.amount;
      }
    });
    weeks.push({ label, income, expenses });
  }
  return weeks;
}

/* ── KPI bar ──────────────────────────────────────────── */
interface KpiProps {
  current: number;
  income: number;
  expenses: number;
}

function KpiBar({ current, income, expenses }: KpiProps) {
  const final = current + income - expenses;
  const cards = [
    { icon: '💰', label: 'יתרה נוכחית', value: fmt(current), color: '#4a9eff' },
    { icon: '📈', label: 'הכנסות צפויות', value: fmt(income), color: '#3fb950' },
    { icon: '📉', label: 'הוצאות צפויות', value: fmt(expenses), color: '#f85149' },
    { icon: '📊', label: 'יתרה סופית', value: fmt(final), color: final >= 0 ? '#3fb950' : '#f85149' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: '#1a2028', border: '1px solid #2a3340', borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: '#8b96a5', marginBottom: 6 }}>{c.icon} {c.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Bar chart ────────────────────────────────────────── */
function BarChart({ weeks }: { weeks: Week[] }) {
  const maxVal = Math.max(...weeks.flatMap(w => [w.income, w.expenses]), 1);
  const BAR_MAX = 140;

  return (
    <div style={{ background: '#1a2028', border: '1px solid #2a3340', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: '#8b96a5', marginBottom: 12 }}>
        תחזית שבועית{' '}
        <span style={{ color: '#4a9eff', marginRight: 12 }}>■ הכנסות</span>
        <span style={{ color: '#f85149' }}>■ הוצאות</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {weeks.map((w, i) => {
          const incH = Math.round((w.income / maxVal) * BAR_MAX);
          const expH = Math.round((w.expenses / maxVal) * BAR_MAX);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_MAX }}>
                <div title={`הכנסות: ${fmt(w.income)}`} style={{
                  width: 22, height: incH, background: '#4a9eff', borderRadius: '3px 3px 0 0',
                  transition: 'height 0.3s',
                }} />
                <div title={`הוצאות: ${fmt(w.expenses)}`} style={{
                  width: 22, height: expH, background: '#f85149', borderRadius: '3px 3px 0 0',
                  transition: 'height 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 10, color: '#8b96a5', marginTop: 4, whiteSpace: 'nowrap' }}>{w.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Events table ─────────────────────────────────────── */
function EventsTable({ events }: { events: CashEvent[] }) {
  return (
    <div style={{ background: '#1a2028', border: '1px solid #2a3340', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#e6edf3' }}>אירועי מזומן קרובים</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['תאריך', 'סוג', 'תיאור', 'סכום'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11,
                color: '#8b96a5', fontWeight: 600, borderBottom: '1px solid #2a3340', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 15).map((e, i) => (
            <tr key={i} style={{ background: e.type === 'income' ? 'rgba(63,185,80,0.06)' : 'rgba(248,81,73,0.06)' }}>
              <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #2a3340' }}>{fmtDate(e.date)}</td>
              <td style={{ padding: '8px 10px', fontSize: 12, borderBottom: '1px solid #2a3340',
                color: e.type === 'income' ? '#3fb950' : '#f85149' }}>
                {e.type === 'income' ? 'הכנסה' : 'הוצאה'}
              </td>
              <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #2a3340' }}>{e.description}</td>
              <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #2a3340',
                color: e.type === 'income' ? '#3fb950' : '#f85149', textAlign: 'left', direction: 'ltr' }}>
                {e.type === 'income' ? '+' : '-'}{fmt(e.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Risk indicators ──────────────────────────────────── */
function RiskIndicators({ events, currentBalance }: { events: CashEvent[]; currentBalance: number }) {
  const risks: { icon: string; msg: string; color: string }[] = [];

  let runningBalance = currentBalance;
  let minBalance = currentBalance;
  let minDate: Date | null = null;

  events.forEach(e => {
    runningBalance += e.type === 'income' ? e.amount : -e.amount;
    if (runningBalance < minBalance) {
      minBalance = runningBalance;
      minDate = e.date;
    }
  });

  if (minBalance < 0 && minDate) {
    risks.push({ icon: '🔴', msg: `מחסור צפוי ב-${fmtDate(minDate)}`, color: '#f85149' });
  } else if (minBalance < 20000 && minDate) {
    risks.push({ icon: '🟡', msg: `יתרה נמוכה ב-${fmtDate(minDate)} (${fmt(minBalance)})`, color: '#d29922' });
  } else {
    risks.push({ icon: '🟢', msg: 'תזרים יציב', color: '#3fb950' });
  }

  return (
    <div style={{ background: '#1a2028', border: '1px solid #2a3340', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#e6edf3' }}>מדדי סיכון</h3>
      {risks.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
          fontSize: 14, color: r.color, fontWeight: 600 }}>
          <span>{r.icon}</span>
          <span>{r.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
export default function CashFlowForecast() {
  const [period, setPeriod] = useState<30 | 60 | 90>(30);
  const currentBalance = 145000;
  const today = useMemo(() => new Date(), []);

  const events = useMemo(() => generateEvents(today, period), [today, period]);
  const weeks = useMemo(() => buildWeeks(events, today, period), [events, today, period]);

  const totalIncome = events.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalExpenses = events.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

  const handleExport = () => {
    const rows = [
      ['תאריך', 'סוג', 'תיאור', 'סכום'],
      ...events.map(e => [fmtDate(e.date), e.type === 'income' ? 'הכנסה' : 'הוצאה', e.description,
        (e.type === 'income' ? '' : '-') + e.amount]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cashflow_${period}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ direction: 'rtl', fontFamily: "-apple-system,'Segoe UI',Heebo,Arial,sans-serif", color: '#e6edf3' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>תחזית תזרים מזומנים</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport}
            style={{ background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
              borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
            📊 ייצוא לאקסל
          </button>
          <button onClick={() => window.print()}
            style={{ background: '#1a2028', border: '1px solid #2a3340', color: '#e6edf3',
              borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
            🖨️ הדפס
          </button>
        </div>
      </div>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {([30, 60, 90] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{
              background: period === p ? '#4a9eff' : '#1a2028',
              border: `1px solid ${period === p ? '#4a9eff' : '#2a3340'}`,
              color: period === p ? '#fff' : '#8b96a5',
              borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
            {p} יום
          </button>
        ))}
      </div>

      {/* KPIs */}
      <KpiBar current={currentBalance} income={totalIncome} expenses={totalExpenses} />

      {/* Bar chart */}
      <BarChart weeks={weeks} />

      {/* Events table */}
      <EventsTable events={events} />

      {/* Risk indicators */}
      <RiskIndicators events={events} currentBalance={currentBalance} />
    </div>
  );
}
