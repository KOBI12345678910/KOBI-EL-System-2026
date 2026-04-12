/**
 * Payroll Autonomous — Full ERP Dashboard
 * All modules wired into sidebar navigation.
 * Default theme: Palantir-style dark, Hebrew RTL.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import AuditTrail from './components/AuditTrail';
import BIDashboard from './components/BIDashboard';
import NotificationCenter from './components/NotificationCenter';
import LiveDashboard from './components/LiveDashboard';
import TicketList from './components/TicketList';
import { Gantt } from './components/Gantt';
import KioskClockIn from './components/KioskClockIn';
import RfqComparison from './components/RfqComparison';
import HelpCenter from './components/HelpCenter';
import SupplierPortal from './components/SupplierPortal';
import ExpenseSubmit from './components/ExpenseSubmit';
import KanbanBoard from './components/KanbanBoard';
import CustomerPortal from './components/CustomerPortal';
import SalesLeaderboard from './components/SalesLeaderboard';
import RealEstatePortfolio from './components/RealEstatePortfolio';
import TenantPortal from './components/TenantPortal';

const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.ONYX_API_URL) ||
  'http://localhost:3100';

const API_KEY =
  import.meta.env.VITE_API_KEY ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('ONYX_API_KEY')) ||
  '';

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let err;
    try { err = JSON.parse(text); } catch { err = { error: text }; }
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const fmtMoney = (n) => '\u20AA ' + Number(n || 0).toLocaleString('he-IL', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const theme = {
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  success: '#3fb950',
  warning: '#d29922',
  danger: '#f85149',
};

/* ─── Navigation ──────────────────────────────────────── */

const NAV_GROUPS = [
  { label: 'שכר', items: [
    { id: 'dashboard', label: 'דשבורד' },
    { id: 'wage-slips', label: 'תלושי שכר' },
    { id: 'compute', label: 'חישוב תלוש' },
    { id: 'employees', label: 'עובדים' },
    { id: 'employers', label: 'מעסיקים' },
    { id: 'clock-in', label: 'שעון נוכחות' },
    { id: 'expenses', label: 'הוצאות' },
  ]},
  { label: 'רכש ומכירות', items: [
    { id: 'rfq', label: 'השוואת הצעות' },
    { id: 'kanban', label: 'קנבאן CRM' },
    { id: 'sales', label: 'לוח מכירות' },
  ]},
  { label: 'ניתוח ומעקב', items: [
    { id: 'bi', label: 'דוח BI' },
    { id: 'live', label: 'דשבורד חי' },
    { id: 'real-estate', label: 'נדל"ן' },
    { id: 'gantt', label: 'גנט' },
    { id: 'audit', label: 'יומן ביקורת' },
  ]},
  { label: 'פורטלים', items: [
    { id: 'supplier-portal', label: 'פורטל ספקים' },
    { id: 'customer-portal', label: 'פורטל לקוחות' },
    { id: 'tenant-portal', label: 'פורטל דיירים' },
  ]},
  { label: 'מערכת', items: [
    { id: 'tickets', label: 'כרטיסי תמיכה' },
    { id: 'notifications', label: 'התראות' },
    { id: 'help', label: 'מרכז עזרה' },
  ]},
];

/* ─── CSS ─────────────────────────────────────────────── */

const css = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body, html, #root { margin: 0; padding: 0; background: ${theme.bg}; color: ${theme.text}; font-family: -apple-system, 'Segoe UI', Heebo, Arial, sans-serif; direction: rtl; }
  button { background: ${theme.panel2}; color: ${theme.text}; border: 1px solid ${theme.border}; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; font-family: inherit; margin: 2px; }
  button:hover { background: ${theme.accent}; border-color: ${theme.accent}; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.primary { background: ${theme.accent}; border-color: ${theme.accent}; color: #fff; }
  button.danger { background: #3a1818; border-color: ${theme.danger}; color: ${theme.danger}; }
  input, select { background: ${theme.panel2}; color: ${theme.text}; border: 1px solid ${theme.border}; padding: 8px 10px; border-radius: 4px; font-size: 14px; font-family: inherit; width: 100%; }
  input:focus, select:focus { outline: none; border-color: ${theme.accent}; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid ${theme.border}; font-size: 13px; }
  th { color: ${theme.textDim}; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
  .panel { background: ${theme.panel}; border: 1px solid ${theme.border}; border-radius: 6px; padding: 20px; margin-bottom: 16px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-draft { background: ${theme.panel2}; color: ${theme.textDim}; }
  .badge-computed { background: #1f2f3f; color: ${theme.accent}; }
  .badge-approved { background: #1f3321; color: ${theme.success}; }
  .badge-issued { background: #1f3a1f; color: ${theme.success}; }
  .badge-voided { background: #3a1f1f; color: ${theme.danger}; }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .form-row { display: grid; gap: 12px; margin-bottom: 12px; }
  .form-row label { font-size: 12px; color: ${theme.textDim}; display: block; margin-bottom: 4px; }
  .stat { padding: 16px; background: ${theme.panel2}; border-radius: 6px; border: 1px solid ${theme.border}; }
  .stat-label { font-size: 11px; color: ${theme.textDim}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .stat-value { font-size: 22px; font-weight: 700; color: ${theme.text}; }
  .error-banner { background: #3a1818; color: ${theme.danger}; padding: 12px; border-radius: 4px; border: 1px solid ${theme.danger}; margin-bottom: 16px; }

  /* Sidebar */
  .app-layout { display: flex; min-height: 100vh; }
  .sidebar { width: 220px; background: ${theme.panel}; border-left: 1px solid ${theme.border}; padding: 16px 0; overflow-y: auto; flex-shrink: 0; }
  .sidebar-group { margin-bottom: 8px; }
  .sidebar-group-label { padding: 8px 20px 4px; font-size: 10px; color: ${theme.textDim}; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
  .sidebar-item { display: block; width: 100%; text-align: right; padding: 9px 20px; cursor: pointer; color: ${theme.textDim}; font-size: 13px; border: none; background: none; font-family: inherit; border-radius: 0; margin: 0; transition: all 0.15s; }
  .sidebar-item:hover { background: ${theme.panel2}; color: ${theme.text}; }
  .sidebar-item.active { color: ${theme.accent}; background: rgba(74, 158, 255, 0.08); border-right: 3px solid ${theme.accent}; font-weight: 600; }
  .main-content { flex: 1; padding: 24px; overflow-x: hidden; min-width: 0; }

  @media (max-width: 768px) {
    .app-layout { flex-direction: column; }
    .sidebar { width: 100%; border-left: none; border-bottom: 1px solid ${theme.border}; padding: 8px 0; display: flex; overflow-x: auto; flex-shrink: 0; }
    .sidebar-group { display: contents; }
    .sidebar-group-label { display: none; }
    .sidebar-item { white-space: nowrap; padding: 8px 14px; font-size: 12px; }
    .main-content { padding: 16px; }
  }
`;

/* ─── Payroll Tab Components (existing) ───────────────── */

function DashboardTab({ wageSlips, employees }) {
  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const thisMonth = new Date().getMonth() + 1;
    const currentSlips = wageSlips.filter(s =>
      s.period_year === thisYear && s.period_month === thisMonth);
    const totalGross = currentSlips.reduce((s, x) => s + Number(x.gross_pay || 0), 0);
    const totalNet = currentSlips.reduce((s, x) => s + Number(x.net_pay || 0), 0);
    return {
      activeEmployees: employees.filter(e => e.is_active).length,
      slipsThisMonth: currentSlips.length,
      totalGross, totalNet,
    };
  }, [wageSlips, employees]);

  return (
    <div className="grid grid-4">
      <div className="stat"><div className="stat-label">עובדים פעילים</div><div className="stat-value">{stats.activeEmployees}</div></div>
      <div className="stat"><div className="stat-label">תלושים החודש</div><div className="stat-value">{stats.slipsThisMonth}</div></div>
      <div className="stat"><div className="stat-label">ברוטו חודשי</div><div className="stat-value">{fmtMoney(stats.totalGross)}</div></div>
      <div className="stat"><div className="stat-label">נטו חודשי</div><div className="stat-value">{fmtMoney(stats.totalNet)}</div></div>
    </div>
  );
}

function WageSlipsTab({ wageSlips, onApprove, onIssue, onView }) {
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>תלושי שכר ({wageSlips.length})</h3>
      <table>
        <thead>
          <tr><th>תקופה</th><th>עובד</th><th>ת.ז</th><th>ברוטו</th><th>ניכויים</th><th>נטו</th><th>סטטוס</th><th>פעולות</th></tr>
        </thead>
        <tbody>
          {wageSlips.map(slip => (
            <tr key={slip.id}>
              <td>{slip.period_label}</td>
              <td>{slip.employee_name}</td>
              <td>{slip.employee_national_id}</td>
              <td>{fmtMoney(slip.gross_pay)}</td>
              <td>{fmtMoney(slip.total_deductions)}</td>
              <td><strong>{fmtMoney(slip.net_pay)}</strong></td>
              <td><span className={`badge badge-${slip.status}`}>{slip.status}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button onClick={() => onView(slip)}>צפה</button>
                {slip.status === 'computed' && <button className="primary" onClick={() => onApprove(slip.id)}>אשר</button>}
                {slip.status === 'approved' && <button className="primary" onClick={() => onIssue(slip.id)}>הנפק PDF</button>}
                {slip.status === 'issued' && <button onClick={async () => {
                  const headers = { 'X-API-Key': API_KEY };
                  const res = await fetch(`${API_URL}/api/payroll/wage-slips/${slip.id}/pdf`, { headers });
                  if (!res.ok) return alert('שגיאה בהורדת PDF');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                }}>PDF</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComputeTab({ employees, onCreated }) {
  const now = new Date();
  const [form, setForm] = useState({
    employee_id: '',
    period: { year: now.getFullYear(), month: now.getMonth() + 1, pay_date: now.toISOString().slice(0, 10) },
    timesheet: {
      hours_regular: 182, hours_overtime_125: 0, hours_overtime_150: 0,
      hours_overtime_175: 0, hours_overtime_200: 0,
      hours_vacation: 0, hours_sick: 0, hours_absence: 0,
      bonuses: 0, commissions: 0,
      allowances_meal: 0, allowances_travel: 0, allowances_clothing: 0, allowances_phone: 0,
    },
  });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const setT = (key, value) => setForm(f => ({ ...f, timesheet: { ...f.timesheet, [key]: Number(value) || 0 } }));

  const handlePreview = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await api('/api/payroll/wage-slips/compute', { method: 'POST', body: form });
      setPreview(res.wage_slip);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [form]);

  const handleSave = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await api('/api/payroll/wage-slips', { method: 'POST', body: form });
      onCreated(res.wage_slip);
      setPreview(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [form, onCreated]);

  return (
    <div className="grid grid-2">
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>חישוב תלוש חדש</h3>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-row">
          <label>עובד</label>
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: Number(e.target.value) }))}>
            <option value="">בחר עובד...</option>
            {employees.filter(e => e.is_active).map(e =>
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_number})</option>)}
          </select>
        </div>
        <div className="form-row grid-3">
          <div><label>שנה</label><input type="number" value={form.period.year} onChange={e => setForm(f => ({ ...f, period: { ...f.period, year: Number(e.target.value) } }))} /></div>
          <div><label>חודש</label><input type="number" min="1" max="12" value={form.period.month} onChange={e => setForm(f => ({ ...f, period: { ...f.period, month: Number(e.target.value) } }))} /></div>
          <div><label>תאריך תשלום</label><input type="date" value={form.period.pay_date} onChange={e => setForm(f => ({ ...f, period: { ...f.period, pay_date: e.target.value } }))} /></div>
        </div>
        <h4>שעות</h4>
        <div className="form-row grid-2">
          <div><label>רגילות</label><input type="number" value={form.timesheet.hours_regular} onChange={e => setT('hours_regular', e.target.value)} /></div>
          <div><label>נוספות 125%</label><input type="number" value={form.timesheet.hours_overtime_125} onChange={e => setT('hours_overtime_125', e.target.value)} /></div>
          <div><label>נוספות 150%</label><input type="number" value={form.timesheet.hours_overtime_150} onChange={e => setT('hours_overtime_150', e.target.value)} /></div>
          <div><label>נוספות 175%</label><input type="number" value={form.timesheet.hours_overtime_175} onChange={e => setT('hours_overtime_175', e.target.value)} /></div>
          <div><label>חופשה</label><input type="number" value={form.timesheet.hours_vacation} onChange={e => setT('hours_vacation', e.target.value)} /></div>
          <div><label>מחלה</label><input type="number" value={form.timesheet.hours_sick} onChange={e => setT('hours_sick', e.target.value)} /></div>
        </div>
        <h4>תוספות</h4>
        <div className="form-row grid-2">
          <div><label>בונוסים</label><input type="number" value={form.timesheet.bonuses} onChange={e => setT('bonuses', e.target.value)} /></div>
          <div><label>עמלות</label><input type="number" value={form.timesheet.commissions} onChange={e => setT('commissions', e.target.value)} /></div>
          <div><label>ארוחה</label><input type="number" value={form.timesheet.allowances_meal} onChange={e => setT('allowances_meal', e.target.value)} /></div>
          <div><label>נסיעות</label><input type="number" value={form.timesheet.allowances_travel} onChange={e => setT('allowances_travel', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={handlePreview} disabled={!form.employee_id || loading}>חשב תצוגה מקדימה</button>
          <button className="primary" onClick={handleSave} disabled={!form.employee_id || loading}>שמור תלוש</button>
        </div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>תצוגה מקדימה</h3>
        {!preview ? (
          <div style={{ color: theme.textDim, textAlign: 'center', padding: 40 }}>
            בחר עובד, מלא שעות ולחץ "חשב תצוגה מקדימה"
          </div>
        ) : <PreviewSlip slip={preview} />}
      </div>
    </div>
  );
}

function PreviewSlip({ slip }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}><strong>{slip.employee_name}</strong> — {slip.period_label}</div>
      <table>
        <tbody>
          <tr><td>שכר יסוד</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.base_pay)}</td></tr>
          {slip.overtime_pay > 0 && <tr><td>שעות נוספות</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.overtime_pay)}</td></tr>}
          {slip.vacation_pay > 0 && <tr><td>דמי חופשה</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.vacation_pay)}</td></tr>}
          {slip.sick_pay > 0 && <tr><td>דמי מחלה</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.sick_pay)}</td></tr>}
          {slip.bonuses > 0 && <tr><td>בונוסים</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.bonuses)}</td></tr>}
          <tr style={{ fontWeight: 700 }}><td>ברוטו</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.gross_pay)}</td></tr>
          <tr><td colSpan="2" style={{ borderTop: `2px solid ${theme.border}`, paddingTop: 8 }}>ניכויים</td></tr>
          <tr><td>מס הכנסה</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.income_tax)}</td></tr>
          <tr><td>ביטוח לאומי</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.bituach_leumi)}</td></tr>
          <tr><td>מס בריאות</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.health_tax)}</td></tr>
          <tr><td>פנסיה</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.pension_employee)}</td></tr>
          {slip.study_fund_employee > 0 && <tr><td>קרן השתלמות</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.study_fund_employee)}</td></tr>}
          <tr style={{ fontWeight: 700 }}><td>סה"כ ניכויים</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.total_deductions)}</td></tr>
          <tr style={{ fontSize: 18, fontWeight: 700, color: theme.success }}>
            <td>נטו</td><td style={{ textAlign: 'left' }}>{fmtMoney(slip.net_pay)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12, padding: 12, background: theme.panel2, borderRadius: 4, fontSize: 12, color: theme.textDim }}>
        <div>הפרשות מעסיק (אינפורמטיבי):</div>
        <div>פנסיה {fmtMoney(slip.pension_employer)} | פיצויים {fmtMoney(slip.severance_employer)} | ביטוח לאומי {fmtMoney(slip.bituach_leumi_employer)}</div>
      </div>
    </div>
  );
}

function EmployeesTab({ employees, employers, onReload }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    employer_id: employers[0]?.id || '',
    employee_number: '', national_id: '', first_name: '', last_name: '',
    start_date: new Date().toISOString().slice(0, 10),
    employment_type: 'monthly', base_salary: 10000,
    hours_per_month: 182, work_percentage: 100, tax_credits: 2.25,
    position: '', department: '',
  });
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await api('/api/payroll/employees', { method: 'POST', body: form });
      setShowForm(false);
      onReload();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>עובדים ({employees.length})</h3>
        <button className="primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'ביטול' : '+ עובד חדש'}</button>
      </div>
      {showForm && (
        <div className="panel" style={{ marginTop: 16 }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-row grid-3">
            <div><label>מעסיק</label>
              <select value={form.employer_id} onChange={e => setForm(f => ({ ...f, employer_id: Number(e.target.value) }))}>
                <option value="">בחר...</option>
                {employers.map(e => <option key={e.id} value={e.id}>{e.legal_name}</option>)}
              </select>
            </div>
            <div><label>מס' עובד</label><input value={form.employee_number} onChange={e => setForm(f => ({ ...f, employee_number: e.target.value }))} /></div>
            <div><label>ת.ז</label><input value={form.national_id} onChange={e => setForm(f => ({ ...f, national_id: e.target.value }))} /></div>
            <div><label>שם פרטי</label><input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
            <div><label>שם משפחה</label><input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
            <div><label>תאריך התחלה</label><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><label>סוג העסקה</label>
              <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
                <option value="monthly">חודשי</option><option value="hourly">שעתי</option>
                <option value="daily">יומי</option><option value="freelance">עצמאי</option>
              </select>
            </div>
            <div><label>שכר בסיס</label><input type="number" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: Number(e.target.value) }))} /></div>
            <div><label>אחוז משרה</label><input type="number" value={form.work_percentage} onChange={e => setForm(f => ({ ...f, work_percentage: Number(e.target.value) }))} /></div>
            <div><label>נקודות זיכוי</label><input type="number" step="0.25" value={form.tax_credits} onChange={e => setForm(f => ({ ...f, tax_credits: Number(e.target.value) }))} /></div>
            <div><label>תפקיד</label><input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} /></div>
            <div><label>מחלקה</label><input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></div>
          </div>
          <button className="primary" onClick={handleSubmit}>שמור</button>
        </div>
      )}
      <table style={{ marginTop: 16 }}>
        <thead><tr><th>מס' עובד</th><th>שם</th><th>ת.ז</th><th>סוג</th><th>שכר</th><th>משרה</th><th>תפקיד</th></tr></thead>
        <tbody>
          {employees.map(e => (
            <tr key={e.id}>
              <td>{e.employee_number}</td>
              <td>{e.first_name} {e.last_name}</td>
              <td>{e.national_id}</td>
              <td>{e.employment_type}</td>
              <td>{fmtMoney(e.base_salary)}</td>
              <td>{e.work_percentage}%</td>
              <td>{e.position || '\u2014'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployersTab({ employers, onReload }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    legal_name: '', company_id: '', tax_file_number: '', bituach_leumi_number: '',
    address: '', city: '', phone: '',
  });
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    try {
      await api('/api/payroll/employers', { method: 'POST', body: form });
      setShowForm(false);
      onReload();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>מעסיקים ({employers.length})</h3>
        <button className="primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'ביטול' : '+ מעסיק חדש'}</button>
      </div>
      {showForm && (
        <div className="panel" style={{ marginTop: 16 }}>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-row grid-2">
            <div><label>שם מעסיק</label><input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} /></div>
            <div><label>ח.פ / ע.מ</label><input value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} /></div>
            <div><label>תיק ניכויים</label><input value={form.tax_file_number} onChange={e => setForm(f => ({ ...f, tax_file_number: e.target.value }))} /></div>
            <div><label>מס' ביטוח לאומי</label><input value={form.bituach_leumi_number} onChange={e => setForm(f => ({ ...f, bituach_leumi_number: e.target.value }))} /></div>
            <div><label>כתובת</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><label>עיר</label><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          </div>
          <button className="primary" onClick={handleSubmit}>שמור</button>
        </div>
      )}
      <table style={{ marginTop: 16 }}>
        <thead><tr><th>שם</th><th>ח.פ</th><th>תיק ניכויים</th><th>ביטוח לאומי</th><th>כתובת</th></tr></thead>
        <tbody>
          {employers.map(e => (
            <tr key={e.id}>
              <td>{e.legal_name}</td>
              <td>{e.company_id}</td>
              <td>{e.tax_file_number}</td>
              <td>{e.bituach_leumi_number || '\u2014'}</td>
              <td>{e.address || '\u2014'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Module Wrappers ─────────────────────────────────── */

function AuditTab() {
  const fetchEvents = useCallback(async ({ page = 1, limit = 50, filters = {} } = {}) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
      const res = await api(`/api/audit?${params}`);
      return { events: res.events || res.audit_log || [], total: res.total || 0 };
    } catch {
      return { events: [], total: 0 };
    }
  }, []);
  return <AuditTrail fetchEvents={fetchEvents} theme="dark" />;
}

function BITab() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [savings, bySupplier, byCategory] = await Promise.all([
          api('/api/analytics/savings').catch(() => ({})),
          api('/api/analytics/spend-by-supplier').catch(() => ({ data: [] })),
          api('/api/analytics/spend-by-category').catch(() => ({ data: [] })),
        ]);
        setData({
          revenue: { current: savings.total_savings || 0, previous: 0, target: 100000, history: [] },
          expenses: { current: savings.total_spend || 0, byCategory: byCategory.data || [], history: [] },
          customers: { active: bySupplier.data?.length || 0, new: 0, churn: 0, history: [] },
          cashflow: { inflow: savings.total_savings || 0, outflow: savings.total_spend || 0, net: (savings.total_savings || 0) - (savings.total_spend || 0), history: [] },
          employeeCost: { total: 0, perEmployee: 0, history: [] },
          ar: { total: 0, overdue: 0, aging: [], history: [] },
        });
      } catch { setData(null); }
      finally { setLoading(false); }
    })();
  }, [period]);

  if (loading) return <div className="panel" style={{ textAlign: 'center', padding: 40 }}>טוען נתוני BI...</div>;
  if (!data) return <div className="panel" style={{ textAlign: 'center', padding: 40, color: theme.textDim }}>לא נמצאו נתונים</div>;
  return <BIDashboard data={data} period={period} onPeriodChange={setPeriod} loading={loading} />;
}

function LiveTab() {
  return <LiveDashboard streamUrl={`${API_URL}/api/stream/events`} apiKey={API_KEY} channels={['payroll', 'procurement', 'alerts']} />;
}

function NotificationsTab() {
  const [notifications, setNotifications] = useState([]);
  return (
    <NotificationCenter
      notifications={notifications}
      unreadCount={notifications.filter(n => !n.read).length}
      onMarkRead={(id) => setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))}
      onMarkAllRead={() => setNotifications(ns => ns.map(n => ({ ...n, read: true })))}
      onNavigate={() => {}}
      onSnooze={() => {}}
      onArchive={(id) => setNotifications(ns => ns.filter(n => n.id !== id))}
      onLoadMore={() => {}}
      hasMore={false}
      loading={false}
      theme="dark"
    />
  );
}

function TicketsTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/api/tickets').catch(() => null);
        setTickets(res?.tickets || []);
      } catch { /* no tickets endpoint yet */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="panel" style={{ textAlign: 'center', padding: 40 }}>טוען...</div>;
  return (
    <TicketList
      tickets={tickets}
      onOpen={() => {}}
      onStatusChange={() => {}}
      onAssign={() => {}}
      onClose={() => {}}
      onTag={() => {}}
      onRefresh={() => {}}
      currentUser="admin"
      agents={[]}
      theme="dark"
    />
  );
}

function GanttTab() {
  const now = new Date();
  const [tasks] = useState([
    { id: '1', name: 'הקמת מערכת ERP', start: '2026-01-01', end: '2026-06-30', progress: 85, color: theme.accent, dependencies: [] },
    { id: '2', name: 'מודול שכר', start: '2026-01-15', end: '2026-03-30', progress: 100, color: theme.success, dependencies: ['1'] },
    { id: '3', name: 'מודול רכש', start: '2026-02-01', end: '2026-04-30', progress: 90, color: theme.success, dependencies: ['1'] },
    { id: '4', name: 'מודול AI', start: '2026-03-01', end: '2026-05-30', progress: 75, color: theme.warning, dependencies: ['1'] },
    { id: '5', name: 'בדיקות QA', start: '2026-04-01', end: '2026-05-15', progress: 60, color: theme.warning, dependencies: ['2', '3'] },
    { id: '6', name: 'דיפלוי לפרודקשן', start: '2026-04-10', end: '2026-04-30', progress: 20, color: theme.danger, dependencies: ['5'] },
  ]);
  return (
    <Gantt
      tasks={tasks}
      milestones={[{ id: 'm1', name: 'Go Live', date: '2026-04-30' }]}
      startDate="2026-01-01"
      endDate="2026-06-30"
      language="he"
      theme="dark"
    />
  );
}

function ClockInTab({ employees }) {
  return (
    <KioskClockIn
      employees={employees.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, number: e.employee_number, pin: '0000', photo: null }))}
      jobCodes={[{ code: 'REG', label: 'רגיל' }, { code: 'OT', label: 'שעות נוספות' }]}
      authMode="id"
      onEvent={() => {}}
    />
  );
}

function RfqTab() {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/api/rfqs');
        const rfqs = res.rfqs || [];
        if (rfqs.length > 0) {
          const detail = await api(`/api/rfq/${rfqs[0].id}`);
          setMatrix(detail);
        }
      } catch { /* no data yet */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="panel" style={{ textAlign: 'center', padding: 40 }}>טוען הצעות...</div>;
  if (!matrix) return (
    <div className="panel" style={{ textAlign: 'center', padding: 40, color: theme.textDim }}>
      אין הצעות מחיר פתוחות. צור בקשת רכש חדשה דרך API הרכש.
    </div>
  );
  return <RfqComparison matrix={matrix} scores={[]} weights={{}} onWeightsChange={() => {}} onAward={() => {}} onExport={() => {}} onClose={() => {}} theme="dark" />;
}

function KanbanTab() {
  const [data, setData] = useState({ stages: ['ליד', 'פגישה', 'הצעה', 'משא ומתן', 'סגור'], deals: [] });

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/api/purchase-requests');
        const requests = res.purchase_requests || [];
        const deals = requests.map((r, i) => ({
          id: r.id || `deal-${i}`,
          title: r.item || r.description || `בקשה ${i + 1}`,
          value: r.estimated_cost || r.amount || 0,
          stage: r.status === 'approved' ? 'סגור' : r.status === 'pending' ? 'ליד' : 'הצעה',
          owner: r.requester || 'מערכת',
          updatedAt: r.created_at || new Date().toISOString(),
          tags: [r.category || 'כללי'],
        }));
        setData(d => ({ ...d, deals }));
      } catch { /* no data */ }
    })();
  }, []);

  return <KanbanBoard data={data} onStageChange={() => {}} onCardClick={() => {}} currency="ILS" theme="dark" />;
}

function SalesTab() {
  return (
    <SalesLeaderboard
      salespeople={[]}
      previous={[]}
      period="month"
      onPeriodChange={() => {}}
      metric="revenue"
      onMetricChange={() => {}}
      title="לוח מכירות"
    />
  );
}

function ExpensesTab() {
  const expenseApi = useMemo(() => ({
    createReport: (data) => api('/api/expense-reports', { method: 'POST', body: data }),
    addLine: (id, line) => api(`/api/expense-reports/${id}/lines`, { method: 'POST', body: line }),
    listReports: () => api('/api/expense-reports').catch(() => ({ reports: [] })),
    getReport: (id) => api(`/api/expense-reports/${id}`),
    submitReport: (id) => api(`/api/expense-reports/${id}/submit`, { method: 'POST' }),
    attachReceipt: async () => ({ url: '' }),
    runOcr: async () => ({ vendor: '', amount: 0, date: '', category: '' }),
    autoCategorize: async () => ({ category: 'general' }),
    computeReimbursement: async () => ({ total: 0, vat: 0 }),
    validatePolicy: async () => ({ valid: true, violations: [] }),
    CATEGORIES: ['נסיעות', 'אירוח', 'ציוד', 'תוכנה', 'שונות'],
    STATUS: ['draft', 'submitted', 'approved', 'rejected', 'paid'],
  }), []);
  return <ExpenseSubmit api={expenseApi} employeeId="1" onSubmit={() => {}} theme="dark" />;
}

function SupplierPortalTab() {
  const portalApi = useMemo(() => ({
    requestMagicLink: async () => ({ sent: true }),
    verifyMagicLink: async () => ({ session: { supplierId: 'demo', name: 'ספק לדוגמה' } }),
    listOpenPOs: () => api('/api/purchase-orders').then(r => r.purchase_orders || []).catch(() => []),
    acknowledgePO: (id) => api(`/api/purchase-orders/${id}/approve`, { method: 'POST' }),
    submitASN: async () => ({ ok: true }),
    submitInvoice: async () => ({ ok: true }),
    getPaymentHistory: async () => ({ payments: [] }),
    updateContact: async () => ({ ok: true }),
    uploadCertification: async () => ({ ok: true }),
    submitTaxClarification: async () => ({ ok: true }),
    getSupplier: () => api('/api/suppliers/1').catch(() => ({ supplier: { name: 'ספק לדוגמה' } })),
  }), []);
  return <SupplierPortal api={portalApi} theme="dark" />;
}

function CustomerPortalTab() {
  const portalApi = useMemo(() => ({
    login: async () => ({ ok: true }),
    verify: async () => ({ customer: { id: 'demo', name: 'לקוח לדוגמה' } }),
    dashboard: async () => ({ balance: 0, openOrders: 0, recentInvoices: [] }),
    invoices: async () => ({ invoices: [] }),
    invoicePdf: async () => ({ url: '' }),
    payInvoice: async () => ({ ok: true }),
    openOrders: async () => ({ orders: [] }),
    orderHistory: async () => ({ orders: [] }),
    quoteRequest: async () => ({ ok: true }),
    raiseSupport: async () => ({ ticketId: 'T-001' }),
    addresses: async () => ({ addresses: [] }),
    updateAddress: async () => ({ ok: true }),
    updateContact: async () => ({ ok: true }),
    statement: async () => ({ entries: [] }),
  }), []);
  return <CustomerPortal api={portalApi} theme="dark" />;
}

function TenantPortalTab() {
  const portalApi = useMemo(() => ({
    requestMagicLink: async () => ({ sent: true }),
    verifyMagicLink: async () => ({ tenant: { id: 'demo', name: 'דייר לדוגמה' } }),
    dashboard: async () => ({ balance: 0, nextRent: null }),
    balance: async () => ({ balance: 0 }),
    upcomingRent: async () => ({ payments: [] }),
    paymentHistory: async () => ({ payments: [] }),
    leaseDetails: async () => ({ lease: {} }),
    maintenanceRequests: async () => ({ requests: [] }),
    submitMaintenanceRequest: async () => ({ ok: true }),
    uploadMaintenancePhoto: async () => ({ url: '' }),
    payRent: async () => ({ ok: true }),
    requestLeaseRenewal: async () => ({ ok: true }),
    documents: async () => ({ documents: [] }),
    downloadReceipt: async () => ({ url: '' }),
    downloadLeasePdf: async () => ({ url: '' }),
  }), []);
  return <TenantPortal api={portalApi} theme="dark" />;
}

function RealEstateTab() {
  const [period, setPeriod] = useState('month');
  const data = useMemo(() => ({
    summary: { totalProperties: 0, totalUnits: 0, occupancyRate: 0, monthlyIncome: 0, monthlyExpenses: 0, noi: 0 },
    properties: [],
    incomeHistory: [],
    occupancyHistory: [],
    expenseBreakdown: [],
    rentRoll: [],
  }), []);
  return <RealEstatePortfolio data={data} period={period} onPeriodChange={setPeriod} onPropertyClick={() => {}} loading={false} />;
}

function HelpTab() {
  const kb = useMemo(() => ({
    listCategories: async () => ([
      { id: '1', name: 'שכר', icon: null, articleCount: 3 },
      { id: '2', name: 'רכש', icon: null, articleCount: 2 },
      { id: '3', name: 'מערכת', icon: null, articleCount: 2 },
    ]),
    getCategory: async (id) => ({
      id, name: id === '1' ? 'שכר' : id === '2' ? 'רכש' : 'מערכת',
      articles: [
        { id: 'a1', title: 'איך מחשבים תלוש שכר?', summary: 'מדריך חישוב תלוש שכר במערכת' },
        { id: 'a2', title: 'הוספת עובד חדש', summary: 'צעדים להוספת עובד למערכת' },
      ],
    }),
    getArticle: async (id) => ({
      id, title: 'מדריך למערכת', body: '<p>ברוכים הבאים למערכת ERP. כאן תוכלו למצוא מידע על שימוש במודולים השונים.</p>',
      helpful: 0, notHelpful: 0,
    }),
    searchKB: async (query) => ([{ id: 'a1', title: 'תוצאת חיפוש', summary: `תוצאות עבור: ${query}` }]),
    markHelpful: async () => ({ ok: true }),
  }), []);
  return <HelpCenter kb={kb} lang="he" onLangChange={() => {}} onOpenArticle={() => {}} />;
}

/* ─── Sidebar Navigation ──────────────────────────────── */

function Sidebar({ activeTab, onTabChange }) {
  return (
    <nav className="sidebar">
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="sidebar-group">
          <div className="sidebar-group-label">{group.label}</div>
          {group.items.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ─── Main App ────────────────────────────────────────── */

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [wageSlips, setWageSlips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [wsRes, eRes, erRes] = await Promise.all([
        api('/api/payroll/wage-slips'),
        api('/api/payroll/employees'),
        api('/api/payroll/employers'),
      ]);
      setWageSlips(wsRes.wage_slips || []);
      setEmployees(eRes.employees || []);
      setEmployers(erRes.employers || []);
      setError(null);
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleApprove = async (id) => {
    try { await api(`/api/payroll/wage-slips/${id}/approve`, { method: 'POST' }); loadAll(); }
    catch (err) { setError(err.message); }
  };
  const handleIssue = async (id) => {
    try { await api(`/api/payroll/wage-slips/${id}/issue`, { method: 'POST' }); loadAll(); }
    catch (err) { setError(err.message); }
  };
  const handleView = (slip) => {
    alert(`${slip.employee_name} ${slip.period_label}\n\nברוטו: ${fmtMoney(slip.gross_pay)}\nנטו: ${fmtMoney(slip.net_pay)}`);
  };

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <DashboardTab wageSlips={wageSlips} employees={employees} />;
      case 'wage-slips': return <WageSlipsTab wageSlips={wageSlips} onApprove={handleApprove} onIssue={handleIssue} onView={handleView} />;
      case 'compute': return <ComputeTab employees={employees} onCreated={loadAll} />;
      case 'employees': return <EmployeesTab employees={employees} employers={employers} onReload={loadAll} />;
      case 'employers': return <EmployersTab employers={employers} onReload={loadAll} />;
      case 'clock-in': return <ClockInTab employees={employees} />;
      case 'expenses': return <ExpensesTab />;
      case 'rfq': return <RfqTab />;
      case 'kanban': return <KanbanTab />;
      case 'sales': return <SalesTab />;
      case 'bi': return <BITab />;
      case 'live': return <LiveTab />;
      case 'real-estate': return <RealEstateTab />;
      case 'gantt': return <GanttTab />;
      case 'audit': return <AuditTab />;
      case 'supplier-portal': return <SupplierPortalTab />;
      case 'customer-portal': return <CustomerPortalTab />;
      case 'tenant-portal': return <TenantPortalTab />;
      case 'tickets': return <TicketsTab />;
      case 'notifications': return <NotificationsTab />;
      case 'help': return <HelpTab />;
      default: return <DashboardTab wageSlips={wageSlips} employees={employees} />;
    }
  };

  const currentLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === tab)?.label || tab;

  return (
    <>
      <style>{css}</style>
      <div className="app-layout">
        <Sidebar activeTab={tab} onTabChange={setTab} />
        <div className="main-content">
          <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>KOBI EL System 2026</h1>
              <div style={{ color: theme.textDim, fontSize: 12 }}>
                {currentLabel} | טכנו-קול עוזי | מנוע ERP ישראלי
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadAll} style={{ fontSize: 12 }}>רענן</button>
            </div>
          </header>

          {error && <div className="error-banner">{error}</div>}

          {renderTab()}
        </div>
      </div>
    </>
  );
}
