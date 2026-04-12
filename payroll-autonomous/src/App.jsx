/**
 * Payroll Autonomous — thin dashboard over onyx-procurement /api/payroll/*
 * Wave 1.5 — B-08 rebuild
 *
 * This UI is intentionally thin: all tax/salary/wage-slip logic lives server-side
 * in src/payroll/wage-slip-calculator.js so it can be audited, tested, and
 * complies with חוק הגנת השכר תיקון 24.
 *
 * Default theme: Palantir-style dark, Hebrew RTL.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';

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

const fmtMoney = (n) => '₪ ' + Number(n || 0).toLocaleString('he-IL', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtHours = (n) => Number(n || 0).toLocaleString('he-IL', {
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
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid ${theme.border}; margin-bottom: 20px; }
  .tab { padding: 12px 20px; cursor: pointer; color: ${theme.textDim}; border-bottom: 2px solid transparent; }
  .tab.active { color: ${theme.accent}; border-bottom-color: ${theme.accent}; }
  .stat { padding: 16px; background: ${theme.panel2}; border-radius: 6px; border: 1px solid ${theme.border}; }
  .stat-label { font-size: 11px; color: ${theme.textDim}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .stat-value { font-size: 22px; font-weight: 700; color: ${theme.text}; }
  .error-banner { background: #3a1818; color: ${theme.danger}; padding: 12px; border-radius: 4px; border: 1px solid ${theme.danger}; margin-bottom: 16px; }
`;

const TABS = [
  { id: 'dashboard', label: 'דשבורד' },
  { id: 'wage-slips', label: 'תלושי שכר' },
  { id: 'compute', label: 'חישוב תלוש חדש' },
  { id: 'employees', label: 'עובדים' },
  { id: 'employers', label: 'מעסיקים' },
];

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
            <option value="">בחר עובד…</option>
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
        <div>פנסיה {fmtMoney(slip.pension_employer)} · פיצויים {fmtMoney(slip.severance_employer)} · ביטוח לאומי {fmtMoney(slip.bituach_leumi_employer)}</div>
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
                <option value="">בחר…</option>
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
            <div><label>שכר בסיס (₪)</label><input type="number" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: Number(e.target.value) }))} /></div>
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
              <td>{e.position || '—'}</td>
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
              <td>{e.bituach_leumi_number || '—'}</td>
              <td>{e.address || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  return (
    <>
      <style>{css}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Payroll Autonomous — שכר אוטונומי</h1>
          <div style={{ color: theme.textDim, fontSize: 13 }}>
            טכנו-קול עוזי | מנוע שכר ישראלי 2026 | תלושי שכר חוק הגנת השכר תיקון 24
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="tabs">
          {TABS.map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </div>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab wageSlips={wageSlips} employees={employees} />}
        {tab === 'wage-slips' && <WageSlipsTab wageSlips={wageSlips} onApprove={handleApprove} onIssue={handleIssue} onView={handleView} />}
        {tab === 'compute' && <ComputeTab employees={employees} onCreated={loadAll} />}
        {tab === 'employees' && <EmployeesTab employees={employees} employers={employers} onReload={loadAll} />}
        {tab === 'employers' && <EmployersTab employers={employers} onReload={loadAll} />}
      </div>
    </>
  );
}
