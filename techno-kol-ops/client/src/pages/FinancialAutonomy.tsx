import React, { useMemo, useState, useEffect, type CSSProperties } from 'react';
import {
  FinancialAutonomyEngine,
} from '../engines/financialAutonomyEngine';
import type {
  Invoice, FinancialAnomaly, CashflowForecast,
} from '../engines/financialAutonomyEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Onyx dark palette (matches HRAutonomy / Procurement / IAS v2)
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  bg: '#252A31', panel: '#2F343C', panelAlt: '#383E47', input: '#383E47',
  border: 'rgba(255,255,255,0.1)', borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F6F7F9', textMuted: '#ABB3BF', textDim: '#5C7080',
  accent: '#FFA500', cyan: '#14CCBB', yellow: '#F6B64A', red: '#FC8585',
  purple: '#8B7FFF', blue: '#48AFF0', green: '#3DCC91',
};

const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'נמוך', color: COLORS.green, bg: 'rgba(61,204,145,0.12)' },
  medium: { label: 'בינוני', color: COLORS.yellow, bg: 'rgba(246,182,74,0.12)' },
  high: { label: 'גבוה', color: COLORS.accent, bg: 'rgba(255,165,0,0.12)' },
  critical: { label: 'קריטי', color: COLORS.red, bg: 'rgba(252,133,133,0.15)' },
};

const SEVERITY_META = {
  critical: { fg: COLORS.red, bg: 'rgba(252,133,133,0.15)', icon: '🔴', label: 'קריטי' },
  warning:  { fg: COLORS.yellow, bg: 'rgba(246,182,74,0.12)', icon: '🟡', label: 'אזהרה' },
  info:     { fg: COLORS.cyan, bg: 'rgba(20,204,187,0.10)', icon: 'ℹ️', label: 'מידע' },
};

const ANOMALY_TYPE_LABEL: Record<FinancialAnomaly['type'], string> = {
  expense_spike: 'הוצאה חריגה',
  revenue_drop: 'ירידת הכנסות',
  margin_erosion: 'שחיקת מרווח',
  cashflow_risk: 'סיכון תזרים',
  budget_overrun: 'חריגה מתקציב',
  payment_delay: 'איחור בתשלום',
  duplicate_payment: 'תשלום כפול',
  unusual_pattern: 'תבנית חריגה',
  concentration_risk: 'ריכוזיות לקוח',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'טיוטה', sent: 'נשלחה', partial: 'שולם חלקית',
  paid: 'שולם', overdue: 'באיחור', void: 'בוטל', written_off: 'נמחק',
};

const INVOICE_STATUS_COLOR: Record<string, string> = {
  draft: COLORS.textDim, sent: COLORS.blue, partial: COLORS.yellow,
  paid: COLORS.green, overdue: COLORS.red, void: COLORS.textDim, written_off: COLORS.textDim,
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif';

const s: Record<string, CSSProperties> = {
  page: { direction: 'rtl', fontFamily: FONT, background: COLORS.bg, color: COLORS.text, minHeight: '100vh', padding: 20, boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap', gap: 10 },
  headerTitleWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontSize: 26, fontWeight: 700, color: COLORS.text, margin: 0, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  liveDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLORS.cyan, marginLeft: 6, boxShadow: `0 0 6px ${COLORS.cyan}` },
  headerActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },

  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 },
  kpiCard: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  kpiLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: 500, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  kpiValue: { fontSize: 22, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 },
  kpiHint: { fontSize: 10, color: COLORS.textDim },

  tabBar: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}`, flexWrap: 'wrap' },
  tabBtn: { background: 'transparent', color: COLORS.textMuted, border: 'none', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: 'inherit', transition: 'all 0.15s ease' },
  tabBtnActive: { color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` },

  panel: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 14 },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  panelTitle: { fontSize: 15, fontWeight: 600, color: COLORS.text, margin: 0 },
  panelMeta: { fontSize: 12, color: COLORS.textMuted },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: COLORS.panelAlt },
  th: { textAlign: 'right' as const, padding: '10px 12px', fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: '10px 12px', color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` },
  tdNum: { padding: '10px 12px', color: COLORS.text, borderBottom: `1px solid ${COLORS.border}`, textAlign: 'left' as const, fontVariantNumeric: 'tabular-nums' as const },

  chip: { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },

  btn: { background: COLORS.accent, color: '#1a1a1a', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnGreen: { background: COLORS.cyan, color: '#1a1a1a', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  threeCol: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },

  subCard: { background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 },

  // P&L / balance sheet rows
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${COLORS.border}`, fontSize: 13 },
  rowLabel: { color: COLORS.textMuted },
  rowValue: { color: COLORS.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' as const },
  rowTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${COLORS.borderStrong}`, marginTop: 6, fontSize: 14 },
  rowTotalLabel: { color: COLORS.text, fontWeight: 700 },
  rowTotalValue: { color: COLORS.accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const },

  // Aging bar
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { width: 80, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' as const },
  barTrack: { flex: 1, height: 18, background: COLORS.panelAlt, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  barAmount: { width: 90, fontSize: 12, fontWeight: 600, color: COLORS.text, textAlign: 'left' as const, fontVariantNumeric: 'tabular-nums' as const },

  // Anomaly card
  anomalyCard: { padding: 12, borderRadius: 8, marginBottom: 10, border: `1px solid ${COLORS.border}` },
  anomalyHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  anomalyTitle: { fontSize: 13, fontWeight: 700, color: COLORS.text, margin: 0 },
  anomalyDesc: { fontSize: 12, color: COLORS.textMuted, whiteSpace: 'pre-wrap' as const, margin: '4px 0' },
  anomalyRec: { fontSize: 11, color: COLORS.cyan, marginTop: 6, fontStyle: 'italic' as const },

  emptyState: { padding: 24, textAlign: 'center' as const, color: COLORS.textDim, fontSize: 13 },
  banner: { padding: '12px 16px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 },

  // Cashflow sparkline (SVG)
  sparkWrap: { width: '100%', height: 90, background: COLORS.panelAlt, borderRadius: 6, padding: 8, boxSizing: 'border-box' },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const fmtILS = (n: number): string => `₪${Math.round(n).toLocaleString('he-IL')}`;
const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;
const todayStr = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];

// ═══════════════════════════════════════════════════════════════════════════
// DEMO SEED — מזריק נתונים אמיתיים לדוגמה כדי שהדשבורד יתמלא
// ═══════════════════════════════════════════════════════════════════════════

function seedDemoData(engine: FinancialAutonomyEngine): void {
  // 1. יתרת בנק פותחת — דרך פקודת יומן ישירה
  engine.ledger.post({
    date: todayStr(-45),
    lines: [
      { accountCode: '1030', accountName: 'בנק הפועלים', debit: 450000, credit: 0, currency: 'ILS' },
      { accountCode: '3100', accountName: 'הון מניות', debit: 0, credit: 450000, currency: 'ILS' },
    ],
    description: 'יתרה פותחת — בנק הפועלים',
    source: 'manual',
    createdBy: 'system',
  });

  // 2. חשבוניות הכנסה — לקוחות שונים
  const clients = [
    { id: 'c1', name: 'אלקטרה תעשיות בע"מ', project: 'מתקן סינון #412', amount: 185000, days: -20, due: 10 },
    { id: 'c2', name: 'דן רכב שירותים',     project: 'מכל כימיקלים',      amount: 92000,  days: -35, due: -5 }, // overdue
    { id: 'c3', name: 'תנובה מרכזית',        project: 'מערכת צנרת',         amount: 67500,  days: -12, due: 18 },
    { id: 'c4', name: 'חברת חשמל',           project: 'תחנת המרה #7',       amount: 320000, days: -50, due: -20 }, // overdue
    { id: 'c5', name: 'ישקר כלי חיתוך',      project: 'מעבד CNC',           amount: 48000,  days: -8,  due: 22 },
  ];

  for (const c of clients) {
    const inv = engine.invoices.create({
      type: 'receivable',
      counterparty: { id: c.id, name: c.name, type: 'client' },
      date: todayStr(c.days),
      dueDate: todayStr(c.due),
      lines: [{
        description: c.project, quantity: 1, unitPrice: c.amount,
        total: c.amount, accountCode: '4100', vatRate: 18,
      }],
      projectId: `p_${c.id}`, projectName: c.project,
      createdBy: 'demo',
    });
    engine.invoices.issue(inv.id, 'demo');
  }

  // 3. חשבוניות הוצאה — ספקים
  const suppliers = [
    { id: 's1', name: 'פלדות מרכז',        item: 'פלדה SS316',     amount: 72000, days: -15, due: 15, acc: '5100' },
    { id: 's2', name: 'ESAB ישראל',         item: 'חוטי ריתוך',      amount: 18500, days: -10, due: 20, acc: '5110' },
    { id: 's3', name: 'איתוראן ציוד כבד',    item: 'מנוף ידני',        amount: 34000, days: -22, due: 8,  acc: '5200' },
  ];

  for (const sup of suppliers) {
    const inv = engine.invoices.create({
      type: 'payable',
      counterparty: { id: sup.id, name: sup.name, type: 'supplier' },
      date: todayStr(sup.days),
      dueDate: todayStr(sup.due),
      lines: [{
        description: sup.item, quantity: 1, unitPrice: sup.amount,
        total: sup.amount, accountCode: sup.acc, vatRate: 18,
      }],
      createdBy: 'demo',
    });
    engine.invoices.issue(inv.id, 'demo');
  }

  // 4. תשלומים שהתקבלו — חלק מהלקוחות שילמו (ההכנסה תגיע לבנק וחשבון הלקוחות יקטן)
  const paidClients = engine.invoices.getAll()
    .filter(i => i.type === 'receivable' && ['c1', 'c3'].includes(i.counterparty.id));
  for (const inv of paidClients) {
    engine.invoices.recordPayment(inv.id, {
      date: todayStr(-3),
      amount: inv.total,
      method: 'bank_transfer',
      reference: `WIRE-${inv.number}`,
      bankAccountCode: '1030',
      recordedBy: 'demo',
    });
  }

  // 5. הוצאות תפעוליות (שכר + שכירות + חשמל) — כדי למלא את ה־opex
  engine.ledger.post({
    date: todayStr(-9),
    lines: [
      { accountCode: '6100', accountName: 'שכר עובדים', debit: 180000, credit: 0, currency: 'ILS' },
      { accountCode: '1030', accountName: 'בנק',          debit: 0,      credit: 180000, currency: 'ILS' },
    ],
    description: 'תשלום שכר חודשי',
    source: 'payroll', createdBy: 'demo',
  });

  engine.ledger.post({
    date: todayStr(-30),
    lines: [
      { accountCode: '6210', accountName: 'שכירות מפעל', debit: 25000, credit: 0, currency: 'ILS' },
      { accountCode: '1030', accountName: 'בנק',          debit: 0,     credit: 25000, currency: 'ILS' },
    ],
    description: 'שכירות חודש',
    source: 'manual', createdBy: 'demo',
  });

  engine.ledger.post({
    date: todayStr(-5),
    lines: [
      { accountCode: '6220', accountName: 'חשמל', debit: 8200, credit: 0, currency: 'ILS' },
      { accountCode: '1030', accountName: 'בנק',  debit: 0,    credit: 8200, currency: 'ILS' },
    ],
    description: 'חשבון חשמל',
    source: 'manual', createdBy: 'demo',
  });

  // 6. עדכן איחורים כדי ש־daysOverdue יתמלא
  engine.invoices.updateOverdue();
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: color ?? COLORS.text }}>{value}</div>
      {hint && <div style={s.kpiHint}>{hint}</div>}
    </div>
  );
}

function PnLRow({ label, value, bold, color, negative }: { label: string; value: number; bold?: boolean; color?: string; negative?: boolean }) {
  const sign = negative && value > 0 ? '-' : '';
  return (
    <div style={bold ? s.rowTotal : s.row}>
      <span style={bold ? s.rowTotalLabel : s.rowLabel}>{label}</span>
      <span style={{ ...(bold ? s.rowTotalValue : s.rowValue), color: color ?? (bold ? COLORS.accent : COLORS.text) }}>
        {sign}{fmtILS(Math.abs(value))}
      </span>
    </div>
  );
}

function AgingBar({ label, amount, max, color }: { label: string; amount: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (amount / max) * 100) : 0;
  return (
    <div style={s.barRow}>
      <div style={s.barLabel}>{label}</div>
      <div style={s.barTrack}>
        <div style={{ ...s.barFill, width: `${pct}%`, background: color }} />
      </div>
      <div style={s.barAmount}>{fmtILS(amount)}</div>
    </div>
  );
}

function CashflowSparkline({ forecast }: { forecast: CashflowForecast }) {
  if (!forecast.daily.length) return null;
  const w = 100, h = 30;
  const balances = forecast.daily.map(d => d.closingBalance);
  const min = Math.min(...balances, 0);
  const max = Math.max(...balances, 1);
  const range = max - min || 1;
  const points = balances.map((b, i) => {
    const x = (i / (balances.length - 1)) * w;
    const y = h - ((b - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const zeroY = h - ((0 - min) / range) * h;
  const lastColor = balances[balances.length - 1] < 0 ? COLORS.red : balances[balances.length - 1] < forecast.currentBalance ? COLORS.yellow : COLORS.green;

  return (
    <div style={s.sparkWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
        {min < 0 && (
          <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke={COLORS.red} strokeWidth="0.3" strokeDasharray="1,1" />
        )}
        <polyline points={points} fill="none" stroke={lastColor} strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function FinancialAutonomy() {
  const engine = useMemo(() => new FinancialAutonomyEngine(), []);
  const [seeded, setSeeded] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'invoices' | 'cashflow' | 'anomalies'>('dashboard');
  const [tick, setTick] = useState(0); // force re-render after actions
  const [lastScan, setLastScan] = useState<{ anomalies: number; overdue: number; risk: string } | null>(null);

  // Seed demo data on first mount so dashboard shows real numbers
  useEffect(() => {
    if (!seeded) {
      seedDemoData(engine);
      setSeeded(true);
      setTick(t => t + 1);
    }
  }, [engine, seeded]);

  // Compute dashboard + supporting data
  const dashboard = useMemo(() => engine.getDashboard() as any, [engine, tick, seeded]);
  const forecast = useMemo(() => engine.cashflow.forecast(30), [engine, tick, seeded]);
  const monthly = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return engine.reporting.incomeStatement(monthStart, todayStr(0));
  }, [engine, tick, seeded]);
  const balanceSheet = useMemo(() => engine.reporting.balanceSheet(), [engine, tick, seeded]);
  const invoiceSummary = useMemo(() => engine.invoices.getSummary(), [engine, tick, seeded]);
  const receivables = useMemo(() => engine.invoices.getReceivables().sort((a, b) => b.daysOverdue - a.daysOverdue), [engine, tick, seeded]);
  const payables = useMemo(() => engine.invoices.getPayables().sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()), [engine, tick, seeded]);
  const anomalies = useMemo(() => engine.intelligence.getAnomalies(false), [engine, tick, seeded]);

  const risk = RISK_META[(dashboard?.cashflow as any)?.risk ?? 'low'] ?? RISK_META.low;

  const handleDailyScan = async () => {
    const result = await engine.dailyScan();
    setLastScan({
      anomalies: result.anomalies.length,
      overdue: result.overdueInvoices.length,
      risk: result.cashflowRisk,
    });
    setTick(t => t + 1);
  };

  const handleRecordPayment = (inv: Invoice) => {
    engine.invoices.recordPayment(inv.id, {
      date: todayStr(0),
      amount: inv.amountDue,
      method: 'bank_transfer',
      reference: `MANUAL-${inv.number}`,
      bankAccountCode: '1030',
      recordedBy: 'ui',
    });
    setTick(t => t + 1);
  };

  const handleResetDemo = () => {
    // Can't reset engine state directly, but we can ack all anomalies and re-scan
    for (const a of engine.intelligence.getAnomalies()) engine.intelligence.acknowledgeAnomaly(a.id);
    setLastScan(null);
    setTick(t => t + 1);
  };

  const maxReceivableAging = Math.max(...Object.values(invoiceSummary.receivables.aging), 1);

  return (
    <div style={s.page}>
      {/* ═══ HEADER ═══ */}
      <div style={s.header}>
        <div style={s.headerTitleWrap}>
          <h1 style={s.title}>
            💰 פיננסים אוטונומיים · Financial Autonomy Engine
            <span style={s.liveDot} />
          </h1>
          <p style={s.subtitle}>
            ספר ראשי כפול · מע"מ ישראלי · חיזוי תזרים 30 יום · גילוי אנומליות AI · דוחות רוו"ה ומאזן
          </p>
        </div>
        <div style={s.headerActions}>
          <button style={s.btnGhost} onClick={handleResetDemo}>🔄 אישור כל האנומליות</button>
          <button style={s.btnGreen} onClick={handleDailyScan}>🔍 סריקה יומית</button>
        </div>
      </div>

      {/* ═══ LAST SCAN BANNER ═══ */}
      {lastScan && (
        <div style={{
          ...s.banner,
          border: `1px solid ${lastScan.risk === 'critical' ? COLORS.red : COLORS.cyan}`,
          background: lastScan.risk === 'critical' ? 'rgba(252,133,133,0.10)' : 'rgba(20,204,187,0.10)',
          color: lastScan.risk === 'critical' ? COLORS.red : COLORS.cyan,
        }}>
          סריקה יומית הושלמה: {lastScan.anomalies} אנומליות חדשות ·
          {' '}{lastScan.overdue} חשבוניות באיחור ·
          {' '}סיכון תזרים: <b>{RISK_META[lastScan.risk]?.label ?? lastScan.risk}</b>
        </div>
      )}

      {/* ═══ KPI STRIP ═══ */}
      <div style={s.kpiStrip}>
        <KpiCard
          label="יתרת מזומן"
          value={fmtILS((dashboard?.cashflow as any)?.currentBalance ?? 0)}
          hint={`נקודה נמוכה: ${fmtILS((dashboard?.cashflow as any)?.lowestBalance ?? 0)}`}
          color={COLORS.cyan}
        />
        <KpiCard
          label="סיכון תזרים"
          value={risk.label}
          hint={(dashboard?.cashflow as any)?.daysUntilNegative < 30 ? `שלילי בעוד ${(dashboard?.cashflow as any)?.daysUntilNegative} ימים` : 'יציב 30+ ימים'}
          color={risk.color}
        />
        <KpiCard
          label="הכנסות חודש"
          value={fmtILS((dashboard?.monthly as any)?.revenue ?? 0)}
          hint={`רווח נקי: ${fmtPct((dashboard?.monthly as any)?.netMargin ?? 0)}`}
          color={COLORS.accent}
        />
        <KpiCard
          label="רווח נקי חודש"
          value={fmtILS((dashboard?.monthly as any)?.netProfit ?? 0)}
          hint={`מרווח גולמי: ${fmtPct((dashboard?.monthly as any)?.grossMargin ?? 0)}`}
          color={((dashboard?.monthly as any)?.netProfit ?? 0) >= 0 ? COLORS.green : COLORS.red}
        />
        <KpiCard
          label="לגבייה"
          value={fmtILS(invoiceSummary.receivables.total)}
          hint={`באיחור: ${fmtILS(invoiceSummary.receivables.overdue)} · ${invoiceSummary.receivables.overdueCount} חשבוניות`}
          color={COLORS.blue}
        />
        <KpiCard
          label="לתשלום"
          value={fmtILS(invoiceSummary.payables.total)}
          hint={`השבוע: ${fmtILS(invoiceSummary.payables.dueThisWeek)}`}
          color={COLORS.purple}
        />
        <KpiCard
          label="סך נכסים"
          value={fmtILS((dashboard?.balanceSheet as any)?.totalAssets ?? 0)}
          hint={(dashboard?.balanceSheet as any)?.balanced ? '✓ מאזן מאוזן' : '⚠ מאזן לא מאוזן'}
          color={(dashboard?.balanceSheet as any)?.balanced ? COLORS.green : COLORS.red}
        />
        <KpiCard
          label="אנומליות AI"
          value={String(anomalies.length)}
          hint={`${anomalies.filter(a => a.severity === 'critical').length} קריטיות`}
          color={anomalies.filter(a => a.severity === 'critical').length > 0 ? COLORS.red : COLORS.textMuted}
        />
      </div>

      {/* ═══ TABS ═══ */}
      <div style={s.tabBar}>
        <button style={{ ...s.tabBtn, ...(tab === 'dashboard' ? s.tabBtnActive : {}) }} onClick={() => setTab('dashboard')}>📊 דשבורד</button>
        <button style={{ ...s.tabBtn, ...(tab === 'invoices' ? s.tabBtnActive : {}) }} onClick={() => setTab('invoices')}>🧾 חשבוניות</button>
        <button style={{ ...s.tabBtn, ...(tab === 'cashflow' ? s.tabBtnActive : {}) }} onClick={() => setTab('cashflow')}>🌊 תזרים 30 יום</button>
        <button style={{ ...s.tabBtn, ...(tab === 'anomalies' ? s.tabBtnActive : {}) }} onClick={() => setTab('anomalies')}>🚨 אנומליות AI</button>
      </div>

      {/* ═══ DASHBOARD TAB ═══ */}
      {tab === 'dashboard' && (
        <>
          <div style={s.twoCol}>
            {/* Monthly P&L */}
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>רווח והפסד · חודש שוטף</h3>
                <span style={s.panelMeta}>{dashboard?.period?.monthStart} – {dashboard?.period?.today}</span>
              </div>
              <PnLRow label="סך הכנסות" value={monthly.totalRevenue} color={COLORS.green} />
              <PnLRow label="עלות מכר" value={monthly.totalCOGS} negative color={COLORS.red} />
              <PnLRow label={`רווח גולמי (${fmtPct(monthly.grossMargin)})`} value={monthly.grossProfit} bold />
              <PnLRow label="הוצאות תפעוליות" value={monthly.totalOpex} negative color={COLORS.red} />
              <PnLRow label={`רווח תפעולי (${fmtPct(monthly.operatingMargin)})`} value={monthly.operatingProfit} bold />
              <PnLRow label="הוצאות מימון" value={monthly.financialExpenses} negative color={COLORS.textMuted} />
              <PnLRow label="מסים" value={monthly.taxExpenses} negative color={COLORS.textMuted} />
              <PnLRow label={`רווח נקי (${fmtPct(monthly.netMargin)})`} value={monthly.netProfit} bold color={monthly.netProfit >= 0 ? COLORS.green : COLORS.red} />
            </div>

            {/* Balance Sheet */}
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>מאזן · תמונה נוכחית</h3>
                <span style={{ ...s.panelMeta, color: balanceSheet.balanced ? COLORS.green : COLORS.red }}>
                  {balanceSheet.balanced ? '✓ מאוזן' : '⚠ לא מאוזן'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>נכסים</div>
              <PnLRow label="נכסים שוטפים" value={balanceSheet.assets.current.reduce((s, a) => s + a.balance, 0)} />
              <PnLRow label="רכוש קבוע" value={balanceSheet.assets.fixed.reduce((s, a) => s + a.balance, 0)} />
              <PnLRow label="סך נכסים" value={balanceSheet.assets.totalAssets} bold />

              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 16, marginBottom: 6 }}>התחייבויות + הון</div>
              <PnLRow label="התחייבויות שוטפות" value={balanceSheet.liabilities.current.reduce((s, l) => s + l.balance, 0)} />
              <PnLRow label="התחייבויות ארוכות טווח" value={balanceSheet.liabilities.longTerm.reduce((s, l) => s + l.balance, 0)} />
              <PnLRow label="הון עצמי" value={balanceSheet.totalEquity} />
              <PnLRow
                label="סך התחייבויות + הון"
                value={balanceSheet.liabilities.totalLiabilities + balanceSheet.totalEquity}
                bold
              />
            </div>
          </div>

          {/* Receivables Aging */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>גיול יתרות לגבייה (Receivables Aging)</h3>
              <span style={s.panelMeta}>{receivables.length} חשבוניות פתוחות · סה"כ {fmtILS(invoiceSummary.receivables.total)}</span>
            </div>
            <div>
              <AgingBar label="שוטף" amount={invoiceSummary.receivables.aging['שוטף']} max={maxReceivableAging} color={COLORS.green} />
              <AgingBar label="1-30 ימים" amount={invoiceSummary.receivables.aging['30-1']} max={maxReceivableAging} color={COLORS.yellow} />
              <AgingBar label="31-60 ימים" amount={invoiceSummary.receivables.aging['60-31']} max={maxReceivableAging} color={COLORS.accent} />
              <AgingBar label="61-90 ימים" amount={invoiceSummary.receivables.aging['90-61']} max={maxReceivableAging} color="#E8A341" />
              <AgingBar label="90+ ימים" amount={invoiceSummary.receivables.aging['90+']} max={maxReceivableAging} color={COLORS.red} />
            </div>
          </div>
        </>
      )}

      {/* ═══ INVOICES TAB ═══ */}
      {tab === 'invoices' && (
        <div style={s.twoCol}>
          {/* Receivables */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>🟢 חשבוניות לגבייה</h3>
              <span style={s.panelMeta}>{receivables.length} פעילות</span>
            </div>
            {receivables.length === 0 ? (
              <div style={s.emptyState}>אין חשבוניות פתוחות לגבייה</div>
            ) : (
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>מס'</th>
                    <th style={s.th}>לקוח</th>
                    <th style={s.th}>תאריך פירעון</th>
                    <th style={s.th}>סטטוס</th>
                    <th style={{ ...s.th, textAlign: 'left' }}>סכום</th>
                    <th style={{ ...s.th, textAlign: 'left' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map(inv => (
                    <tr key={inv.id}>
                      <td style={s.td}>{inv.number}</td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{inv.counterparty.name}</div>
                        {inv.projectName && <div style={{ fontSize: 11, color: COLORS.textDim }}>{inv.projectName}</div>}
                      </td>
                      <td style={s.td}>
                        {inv.dueDate}
                        {inv.daysOverdue > 0 && (
                          <div style={{ fontSize: 11, color: COLORS.red }}>באיחור {inv.daysOverdue} ימים</div>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{
                          ...s.chip,
                          background: `${INVOICE_STATUS_COLOR[inv.status]}22`,
                          color: INVOICE_STATUS_COLOR[inv.status],
                          border: `1px solid ${INVOICE_STATUS_COLOR[inv.status]}`,
                        }}>
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </td>
                      <td style={s.tdNum}>{fmtILS(inv.amountDue)}</td>
                      <td style={s.tdNum}>
                        <button style={s.btnGreen} onClick={() => handleRecordPayment(inv)}>סמן שולם</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Payables */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>🔴 חשבוניות לתשלום</h3>
              <span style={s.panelMeta}>{payables.length} פעילות · השבוע {fmtILS(invoiceSummary.payables.dueThisWeek)}</span>
            </div>
            {payables.length === 0 ? (
              <div style={s.emptyState}>אין חשבוניות פתוחות לתשלום</div>
            ) : (
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>מס'</th>
                    <th style={s.th}>ספק</th>
                    <th style={s.th}>תאריך פירעון</th>
                    <th style={s.th}>סטטוס</th>
                    <th style={{ ...s.th, textAlign: 'left' }}>סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map(inv => (
                    <tr key={inv.id}>
                      <td style={s.td}>{inv.number}</td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{inv.counterparty.name}</div>
                        {inv.lines[0] && <div style={{ fontSize: 11, color: COLORS.textDim }}>{inv.lines[0].description}</div>}
                      </td>
                      <td style={s.td}>
                        {inv.dueDate}
                        {inv.daysOverdue > 0 && (
                          <div style={{ fontSize: 11, color: COLORS.red }}>באיחור {inv.daysOverdue} ימים</div>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{
                          ...s.chip,
                          background: `${INVOICE_STATUS_COLOR[inv.status]}22`,
                          color: INVOICE_STATUS_COLOR[inv.status],
                          border: `1px solid ${INVOICE_STATUS_COLOR[inv.status]}`,
                        }}>
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </td>
                      <td style={s.tdNum}>{fmtILS(inv.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ CASHFLOW TAB ═══ */}
      {tab === 'cashflow' && (
        <>
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>תחזית תזרים — 30 ימים קדימה</h3>
              <span style={{ ...s.panelMeta, color: risk.color }}>
                סיכון: {risk.label} · נקודה נמוכה: {fmtILS(forecast.summary.lowestBalance)} ב־{forecast.summary.lowestBalanceDate}
              </span>
            </div>
            <div style={s.threeCol}>
              <div style={s.subCard}>
                <div style={s.kpiLabel}>יתרה נוכחית</div>
                <div style={{ ...s.kpiValue, color: COLORS.cyan }}>{fmtILS(forecast.currentBalance)}</div>
              </div>
              <div style={s.subCard}>
                <div style={s.kpiLabel}>תזרים פנימה (30 יום)</div>
                <div style={{ ...s.kpiValue, color: COLORS.green }}>{fmtILS(forecast.summary.totalInflows)}</div>
              </div>
              <div style={s.subCard}>
                <div style={s.kpiLabel}>תזרים החוצה (30 יום)</div>
                <div style={{ ...s.kpiValue, color: COLORS.red }}>{fmtILS(forecast.summary.totalOutflows)}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <CashflowSparkline forecast={forecast} />
            </div>
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>פירוט יומי</h3>
              <span style={s.panelMeta}>{forecast.daily.filter(d => d.inflows > 0 || d.outflows > 0).length} ימי פעילות</span>
            </div>
            <table style={s.table}>
              <thead style={s.thead}>
                <tr>
                  <th style={s.th}>תאריך</th>
                  <th style={{ ...s.th, textAlign: 'left' }}>יתרת פתיחה</th>
                  <th style={{ ...s.th, textAlign: 'left' }}>פנימה</th>
                  <th style={{ ...s.th, textAlign: 'left' }}>החוצה</th>
                  <th style={{ ...s.th, textAlign: 'left' }}>יתרת סגירה</th>
                </tr>
              </thead>
              <tbody>
                {forecast.daily.filter(d => d.inflows > 0 || d.outflows > 0).slice(0, 20).map(d => (
                  <tr key={d.date}>
                    <td style={s.td}>{d.date}</td>
                    <td style={s.tdNum}>{fmtILS(d.openingBalance)}</td>
                    <td style={{ ...s.tdNum, color: COLORS.green }}>{d.inflows > 0 ? `+${fmtILS(d.inflows)}` : '—'}</td>
                    <td style={{ ...s.tdNum, color: COLORS.red }}>{d.outflows > 0 ? `-${fmtILS(d.outflows)}` : '—'}</td>
                    <td style={{ ...s.tdNum, color: d.closingBalance < 0 ? COLORS.red : COLORS.text }}>
                      {fmtILS(d.closingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ANOMALIES TAB ═══ */}
      {tab === 'anomalies' && (
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>אנומליות פיננסיות — AI Detection</h3>
            <span style={s.panelMeta}>{anomalies.length} פתוחות · {anomalies.filter(a => a.severity === 'critical').length} קריטיות</span>
          </div>
          {anomalies.length === 0 ? (
            <div style={s.emptyState}>
              אין אנומליות פתוחות. לחץ על "סריקה יומית" כדי להריץ סריקת AI חדשה.
            </div>
          ) : (
            anomalies.map(a => {
              const sev = SEVERITY_META[a.severity];
              return (
                <div key={a.id} style={{
                  ...s.anomalyCard,
                  background: sev.bg,
                  borderColor: sev.fg,
                }}>
                  <div style={s.anomalyHeader}>
                    <div>
                      <h4 style={s.anomalyTitle}>
                        {sev.icon} {a.title}
                      </h4>
                      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                        {ANOMALY_TYPE_LABEL[a.type]} · {new Date(a.timestamp).toLocaleString('he-IL')}
                      </div>
                    </div>
                    <span style={{ ...s.chip, background: sev.fg, color: '#1a1a1a' }}>
                      {sev.label}
                    </span>
                  </div>
                  <div style={s.anomalyDesc}>{a.description}</div>
                  <div style={s.anomalyRec}>💡 המלצה: {a.recommendation}</div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      style={s.btnGhost}
                      onClick={() => {
                        engine.intelligence.acknowledgeAnomaly(a.id);
                        setTick(t => t + 1);
                      }}
                    >
                      ✓ אשר טיפול
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default FinancialAutonomy;
