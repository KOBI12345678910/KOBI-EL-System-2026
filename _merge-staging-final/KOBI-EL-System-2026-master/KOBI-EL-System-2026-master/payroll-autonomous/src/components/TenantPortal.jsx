/**
 * TenantPortal.jsx — Agent Y-050
 * ====================================================================
 * Self-service tenant portal for Techno-Kol Uzi mega-ERP (Real-Estate).
 *
 *   פורטל דיירים לשירות עצמי — נדל״ן
 *
 * Palantir dark theme, Hebrew RTL, bilingual, mobile-responsive,
 * accessibility AA. Zero external UI libs — inline styles only.
 *
 * Tabs (Hebrew):
 *   דשבורד · תשלומים · תחזוקה · מסמכים · חשבון
 *
 * Props:
 *   api : {
 *     requestMagicLink         : (channel, value) => Promise<{ok, sent, token?, link?}>
 *     verifyMagicLink          : (token) => Promise<{ok, tenantId, session}>
 *     dashboard                : (tenantId) => Promise<DashboardSnapshot>
 *     balance                  : (tenantId) => Promise<BalanceSnapshot>
 *     upcomingRent             : (tenantId) => Promise<UpcomingRent>
 *     paymentHistory           : (tenantId, filters) => Promise<Payment[]>
 *     leaseDetails             : (tenantId) => Promise<Lease>
 *     maintenanceRequests      : (tenantId, filters) => Promise<MaintenanceRequest[]>
 *     submitMaintenanceRequest : (tenantId, data) => Promise<{ok, id}>
 *     uploadMaintenancePhoto   : (tenantId, reqId, file) => Promise<{ok, photoId}>
 *     payRent                  : (tenantId, amount, method) => Promise<{ok, paymentRef}>
 *     requestLeaseRenewal      : (tenantId, opts) => Promise<{ok, id}>
 *     documents                : (tenantId) => Promise<Document[]>
 *     downloadReceipt          : (tenantId, receiptId) => Promise<{ok, fileRef, fallbackText}>
 *     downloadLeasePdf         : (tenantId) => Promise<{ok, fileRef, fallbackText}>
 *   }
 *   initialTenantId : (optional) — if set, skips the login screen.
 *   theme           : "dark" (default) | "light"
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

/* ================================================================== *
 *  Theme — Palantir dark
 * ================================================================== */

const PALANTIR_DARK = {
  bg:         '#0b0d10',
  panel:      '#13171c',
  panelAlt:   '#181d24',
  panelHi:    '#1b212a',
  border:     '#232a33',
  borderSoft: '#1a2029',
  accent:     '#4a9eff',
  accentSoft: 'rgba(74,158,255,0.14)',
  text:       '#e6edf3',
  textDim:    '#8b95a5',
  textMuted:  '#5a6472',
  info:       '#4a9eff',
  warn:       '#f5a623',
  critical:   '#ff5c5c',
  success:    '#3ddc84',
  rowHover:   '#1b2028',
  highlight:  '#ffd76a',
};

const PALANTIR_LIGHT = {
  bg:         '#f4f6f9',
  panel:      '#ffffff',
  panelAlt:   '#f9fbfd',
  panelHi:    '#eef3f8',
  border:     '#d9dee4',
  borderSoft: '#e6ebf0',
  accent:     '#1a66c9',
  accentSoft: 'rgba(26,102,201,0.12)',
  text:       '#12171d',
  textDim:    '#5a6472',
  textMuted:  '#8b95a5',
  info:       '#1a66c9',
  warn:       '#b36a00',
  critical:   '#c62828',
  success:    '#1f7a3f',
  rowHover:   '#eef3f8',
  highlight:  '#c28f00',
};

/* ================================================================== *
 *  Bilingual strings  |  מחרוזות דו־לשוניות
 * ================================================================== */

const HE = {
  title:        'פורטל דיירים',
  en_title:     'Tenant Portal',
  tagline:      'Techno-Kol Uzi · נדל״ן · שירות עצמי',

  loginPrompt:  'כניסה באמצעות קישור חד־פעמי',
  emailTab:     'דוא״ל',
  smsTab:       'SMS',
  emailLabel:   'כתובת דוא״ל',
  emailPh:      'name@company.co.il',
  phoneLabel:   'מספר טלפון נייד',
  phonePh:      '050-1234567',
  send:         'שלח קישור',
  sending:      'שולח…',
  checkEmail:   'בדוק את תיבת הדוא״ל / SMS',
  checkSub:     'אם הפרטים רשומים אצלנו, נשלח קישור כניסה חד־פעמי בתוקף ל־24 שעות.',

  nav: {
    dashboard:   'דשבורד',
    payments:    'תשלומים',
    maintenance: 'תחזוקה',
    documents:   'מסמכים',
    account:     'חשבון',
    signout:     'יציאה',
  },

  dashboard: {
    balanceDue:    'יתרה לתשלום',
    upcomingRent:  'שכר דירה קרוב',
    dueDate:       'מועד תשלום',
    leaseEnds:     'סיום חוזה',
    openRequests:  'בקשות תחזוקה פתוחות',
    payNow:        'שלם עכשיו',
    noBalance:     'אין יתרה לתשלום',
    quickActions:  'פעולות מהירות',
    newRequest:    'פתיחת בקשת תחזוקה',
    requestRenewal:'בקשת חידוש חוזה',
  },

  payments: {
    history:       'היסטוריית תשלומים',
    amount:        'סכום',
    date:          'תאריך',
    method:        'אמצעי',
    reference:     'אסמכתא',
    status:        'סטטוס',
    empty:         'לא נרשמו תשלומים',
    statuses: {
      paid:     'שולם',
      pending:  'ממתין',
      failed:   'נכשל',
      refunded: 'הוחזר',
    },
    methods: {
      paybox: 'PayBox',
      bit:    'Bit',
      card:   'אשראי',
      masav:  'מסב',
    },
    payRent:       'שלם שכר דירה',
    amountLabel:   'סכום',
    methodLabel:   'אמצעי תשלום',
    confirm:       'אשר תשלום',
    payOk:         'התשלום התקבל',
    payFail:       'התשלום נכשל',
  },

  maintenance: {
    list:          'בקשות תחזוקה',
    newTitle:      'בקשה חדשה',
    category:      'קטגוריה',
    priority:      'דחיפות',
    description:   'תיאור',
    descPh:        'תיאור קצר של התקלה',
    submit:        'שלח בקשה',
    submitting:    'שולח…',
    attached:      'מצורף',
    upload:        'העלאת תמונה',
    empty:         'אין בקשות תחזוקה',
    categories: {
      plumbing:   'אינסטלציה',
      electrical: 'חשמל',
      hvac:       'מיזוג',
      structural: 'מבנה',
      appliance:  'מכשיר חשמלי',
      pest:       'מזיקים',
      common:     'שטחים משותפים',
      other:      'אחר',
    },
    priorities: {
      low:    'נמוכה',
      medium: 'בינונית',
      high:   'גבוהה',
      urgent: 'דחופה',
    },
    statuses: {
      open:       'פתוחה',
      inProgress: 'בטיפול',
      scheduled:  'מתוזמנת',
      resolved:   'הסתיימה',
      closed:     'סגורה',
    },
  },

  documents: {
    list:       'מסמכים',
    empty:      'אין מסמכים',
    download:   'הורדה',
    kinds: {
      lease:   'הסכם שכירות',
      receipt: 'קבלה',
      other:   'מסמך',
    },
  },

  account: {
    leaseDetails:   'פרטי החוזה',
    leaseFrom:      'מתאריך',
    leaseTo:        'עד תאריך',
    monthlyRent:    'שכר דירה חודשי',
    securityDeposit:'פיקדון ביטחון',
    property:       'נכס',
    unit:           'יחידה',
    renewal: {
      title:         'בקשת חידוש',
      termMonths:    'תקופה (חודשים)',
      note:          'הערה',
      proposedRent:  'שכ״ד מוצע',
      submit:        'הגש בקשה',
      pending:       'בקשה בהמתנה',
    },
  },

  errors: {
    generic:    'שגיאה — נסה שוב',
    noSession:  'ההפעלה פגה תוקף — היכנס מחדש',
    rate:       'יותר מדי ניסיונות, נסה שוב בעוד רגע',
  },
};

const EN = {
  title: 'Tenant Portal',
  nav: {
    dashboard:   'Dashboard',
    payments:    'Payments',
    maintenance: 'Maintenance',
    documents:   'Documents',
    account:     'Account',
    signout:     'Sign out',
  },
};

/* ================================================================== *
 *  Helpers
 * ================================================================== */

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('he-IL');
  } catch (_e) {
    return String(s);
  }
}

function statusColor(theme, status) {
  switch (status) {
    case 'paid':
    case 'resolved':
    case 'closed':
      return theme.success;
    case 'pending':
    case 'inProgress':
    case 'scheduled':
      return theme.warn;
    case 'failed':
      return theme.critical;
    default:
      return theme.info;
  }
}

function cx(...cls) { return cls.filter(Boolean).join(' '); }

/* ================================================================== *
 *  Small UI primitives
 * ================================================================== */

function Card({ theme, title, children, action }) {
  return (
    <section
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
      }}
      aria-label={title}
    >
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          {title && (
            <h2 style={{ margin: 0, fontSize: 15, color: theme.text, fontWeight: 600 }}>
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

function KpiTile({ theme, label, value, sub, tone }) {
  const col = tone || theme.accent;
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        background: theme.panelAlt,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: col, wordBreak: 'break-word' }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

function Button({ theme, onClick, disabled, children, variant = 'primary', type = 'button', ariaLabel }) {
  const base = {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
    fontFamily: 'inherit',
    minHeight: 36,
  };
  const variants = {
    primary: {
      background: theme.accent,
      color: '#fff',
      border: `1px solid ${theme.accent}`,
    },
    ghost: {
      background: 'transparent',
      color: theme.text,
      border: `1px solid ${theme.border}`,
    },
    danger: {
      background: theme.critical,
      color: '#fff',
      border: `1px solid ${theme.critical}`,
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
}

function Input({ theme, label, value, onChange, type = 'text', placeholder, required, id }) {
  const inputId = id || `in_${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
        {label}{required ? ' *' : ''}
      </div>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={required ? 'true' : undefined}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 10px',
          fontSize: 14,
          direction: 'rtl',
          textAlign: 'right',
          background: theme.panelAlt,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </label>
  );
}

function Select({ theme, label, value, onChange, options, id }) {
  const inputId = id || `sel_${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{label}</div>
      <select
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 10px',
          fontSize: 14,
          direction: 'rtl',
          textAlign: 'right',
          background: theme.panelAlt,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ theme, status, label }) {
  const col = statusColor(theme, status);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        background: `${col}22`,
        color: col,
        border: `1px solid ${col}66`,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

/* ================================================================== *
 *  Login Screen
 * ================================================================== */

function LoginScreen({ theme, api, onSuccess, strings }) {
  const [channel, setChannel] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [verifying, setVerifying] = useState(false);

  const onSend = useCallback(async () => {
    setError(null);
    setSending(true);
    try {
      const value = channel === 'email' ? email : phone;
      const r = await api.requestMagicLink(channel, value);
      if (r && r.ok) {
        setSent(true);
        if (r.token) setVerifyToken(r.token);
      } else {
        setError(r && r.label ? r.label.he : strings.errors.generic);
      }
    } catch (err) {
      setError(err && err.label ? err.label.he : strings.errors.generic);
    } finally {
      setSending(false);
    }
  }, [api, channel, email, phone, strings.errors.generic]);

  const onVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const r = await api.verifyMagicLink(verifyToken);
      if (r && r.ok) {
        onSuccess(r.tenantId, r.session);
      } else {
        setError(r && r.label ? r.label.he : strings.errors.generic);
      }
    } catch (err) {
      setError(err && err.label ? err.label.he : strings.errors.generic);
    } finally {
      setVerifying(false);
    }
  }, [api, verifyToken, onSuccess, strings.errors.generic]);

  return (
    <main
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily:
          '"Heebo","Rubik","Assistant",system-ui,-apple-system,"Segoe UI",Arial,sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: theme.text }}>
          {strings.title}
        </h1>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 18 }}>
          {strings.tagline}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} role="tablist">
          {[
            { k: 'email', label: strings.emailTab },
            { k: 'sms',   label: strings.smsTab },
          ].map((o) => {
            const active = channel === o.k;
            return (
              <button
                key={o.k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setChannel(o.k); setSent(false); setError(null); }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  background: active ? theme.accentSoft : 'transparent',
                  color: active ? theme.accent : theme.textDim,
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {!sent ? (
          <>
            <div style={{ fontSize: 13, color: theme.textDim, marginBottom: 10 }}>
              {strings.loginPrompt}
            </div>
            {channel === 'email' ? (
              <Input
                theme={theme}
                label={strings.emailLabel}
                value={email}
                onChange={setEmail}
                type="email"
                placeholder={strings.emailPh}
                required
                id="ten_email"
              />
            ) : (
              <Input
                theme={theme}
                label={strings.phoneLabel}
                value={phone}
                onChange={setPhone}
                type="tel"
                placeholder={strings.phonePh}
                required
                id="ten_phone"
              />
            )}
            {error ? (
              <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>
                {error}
              </div>
            ) : null}
            <Button theme={theme} onClick={onSend} disabled={sending}>
              {sending ? strings.sending : strings.send}
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: theme.success, marginBottom: 6 }}>
              {strings.checkEmail}
            </div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 14 }}>
              {strings.checkSub}
            </div>
            <Input
              theme={theme}
              label="Token"
              value={verifyToken}
              onChange={setVerifyToken}
              placeholder="paste or click from the email"
              id="ten_token"
            />
            {error ? (
              <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>
                {error}
              </div>
            ) : null}
            <Button theme={theme} onClick={onVerify} disabled={verifying || !verifyToken}>
              {verifying ? strings.sending : strings.send}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

/* ================================================================== *
 *  Tabs — Dashboard / Payments / Maintenance / Documents / Account
 * ================================================================== */

function DashboardTab({ theme, api, tenantId, strings, onGoto }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const snap = await api.dashboard(tenantId);
      setData(snap);
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, strings.errors.generic]);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <Card theme={theme} title={strings.nav.dashboard}>
        <div role="alert" style={{ color: theme.critical, fontSize: 14 }}>{err}</div>
      </Card>
    );
  }
  if (!data) return <Card theme={theme} title={strings.nav.dashboard}><div style={{ color: theme.textDim }}>…</div></Card>;

  const balTone = data.balance.balance > 0 ? theme.warn : theme.success;

  return (
    <>
      <Card theme={theme} title={strings.nav.dashboard}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <KpiTile
            theme={theme}
            label={strings.dashboard.balanceDue}
            value={fmtMoney(data.balance.balance)}
            tone={balTone}
          />
          <KpiTile
            theme={theme}
            label={strings.dashboard.upcomingRent}
            value={data.upcomingRent ? fmtMoney(data.upcomingRent.amount) : '—'}
            sub={data.upcomingRent ? `${strings.dashboard.dueDate}: ${fmtDate(data.upcomingRent.dueDate)}` : null}
          />
          <KpiTile
            theme={theme}
            label={strings.dashboard.leaseEnds}
            value={fmtDate(data.leaseEndDate)}
          />
          <KpiTile
            theme={theme}
            label={strings.dashboard.openRequests}
            value={String(data.openMaintenance || 0)}
          />
        </div>
      </Card>

      <Card theme={theme} title={strings.dashboard.quickActions}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button theme={theme} onClick={() => onGoto('payments')}>
            {strings.dashboard.payNow}
          </Button>
          <Button theme={theme} variant="ghost" onClick={() => onGoto('maintenance')}>
            {strings.dashboard.newRequest}
          </Button>
          <Button theme={theme} variant="ghost" onClick={() => onGoto('account')}>
            {strings.dashboard.requestRenewal}
          </Button>
        </div>
      </Card>
    </>
  );
}

function PaymentsTab({ theme, api, tenantId, strings }) {
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('paybox');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [balance, setBalance] = useState(null);

  const load = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([
        api.paymentHistory(tenantId, {}),
        api.balance(tenantId),
      ]);
      setHistory(h);
      setBalance(b);
      if (b && b.balance > 0 && amount === '') setAmount(String(b.balance));
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, amount, strings.errors.generic]);

  useEffect(() => { load(); }, [load]);

  const onPay = useCallback(async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.payRent(tenantId, Number(amount), method);
      if (r.ok) {
        setMsg(strings.payments.payOk);
        await load();
      } else {
        setErr((r.label && r.label.he) || strings.payments.payFail);
      }
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.payments.payFail);
    } finally {
      setBusy(false);
    }
  }, [api, tenantId, amount, method, load, strings.payments]);

  return (
    <>
      <Card theme={theme} title={strings.payments.payRent}>
        {balance ? (
          <div style={{ fontSize: 13, color: theme.textDim, marginBottom: 10 }}>
            {strings.dashboard.balanceDue}: <strong style={{ color: theme.text }}>{fmtMoney(balance.balance)}</strong>
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input
            theme={theme}
            label={strings.payments.amountLabel}
            value={amount}
            onChange={setAmount}
            type="number"
            id="pay_amount"
          />
          <Select
            theme={theme}
            label={strings.payments.methodLabel}
            value={method}
            onChange={setMethod}
            id="pay_method"
            options={[
              { value: 'paybox', label: strings.payments.methods.paybox },
              { value: 'bit',    label: strings.payments.methods.bit },
              { value: 'card',   label: strings.payments.methods.card },
              { value: 'masav',  label: strings.payments.methods.masav },
            ]}
          />
        </div>
        {msg ? <div role="status" style={{ color: theme.success, fontSize: 13, marginBottom: 10 }}>{msg}</div> : null}
        {err ? <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <Button theme={theme} onClick={onPay} disabled={busy || !amount}>
          {busy ? strings.maintenance.submitting : strings.payments.confirm}
        </Button>
      </Card>

      <Card theme={theme} title={strings.payments.history}>
        {history.length === 0 ? (
          <div style={{ color: theme.textDim, fontSize: 14 }}>{strings.payments.empty}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: theme.textDim, textAlign: 'right' }}>
                  <th style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}>{strings.payments.date}</th>
                  <th style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}>{strings.payments.amount}</th>
                  <th style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}>{strings.payments.method}</th>
                  <th style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}>{strings.payments.reference}</th>
                  <th style={{ padding: 8, borderBottom: `1px solid ${theme.border}` }}>{strings.payments.status}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} style={{ color: theme.text }}>
                    <td style={{ padding: 8, borderBottom: `1px solid ${theme.borderSoft}` }}>{fmtDate(p.paidAt)}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${theme.borderSoft}` }}>{fmtMoney(p.amount)}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${theme.borderSoft}` }}>
                      {(strings.payments.methods[p.method] || p.method) || '—'}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${theme.borderSoft}`, fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>
                      {p.reference || '—'}
                    </td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${theme.borderSoft}` }}>
                      <StatusBadge theme={theme} status={p.status} label={strings.payments.statuses[p.status] || p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function MaintenanceTab({ theme, api, tenantId, strings }) {
  const [list, setList] = useState([]);
  const [category, setCategory] = useState('plumbing');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.maintenanceRequests(tenantId, {});
      setList(rows);
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, strings.errors.generic]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = useCallback(async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.submitMaintenanceRequest(tenantId, { category, priority, description });
      if (r.ok) {
        setDescription('');
        setMsg('✓');
        await load();
      } else {
        setErr((r.label && r.label.he) || strings.errors.generic);
      }
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }, [api, tenantId, category, priority, description, load, strings.errors.generic]);

  const onPhoto = useCallback(async (reqId, ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      await api.uploadMaintenancePhoto(tenantId, reqId, {
        name: file.name,
        mime: file.type,
        size: file.size,
        bytes: typeof Buffer !== 'undefined' && Buffer.from
          ? Buffer.from(buf)
          : new Uint8Array(buf),
      });
      await load();
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, load, strings.errors.generic]);

  return (
    <>
      <Card theme={theme} title={strings.maintenance.newTitle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select
            theme={theme}
            label={strings.maintenance.category}
            value={category}
            onChange={setCategory}
            options={Object.entries(strings.maintenance.categories).map(([k, v]) => ({ value: k, label: v }))}
            id="mnt_cat"
          />
          <Select
            theme={theme}
            label={strings.maintenance.priority}
            value={priority}
            onChange={setPriority}
            options={Object.entries(strings.maintenance.priorities).map(([k, v]) => ({ value: k, label: v }))}
            id="mnt_pri"
          />
        </div>
        <label htmlFor="mnt_desc" style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{strings.maintenance.description}</div>
          <textarea
            id="mnt_desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={strings.maintenance.descPh}
            aria-required="true"
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 10px',
              fontSize: 14,
              direction: 'rtl',
              textAlign: 'right',
              background: theme.panelAlt,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </label>
        {msg ? <div role="status" style={{ color: theme.success, fontSize: 13, marginBottom: 10 }}>{msg}</div> : null}
        {err ? <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        <Button theme={theme} onClick={onSubmit} disabled={busy || !description}>
          {busy ? strings.maintenance.submitting : strings.maintenance.submit}
        </Button>
      </Card>

      <Card theme={theme} title={strings.maintenance.list}>
        {list.length === 0 ? (
          <div style={{ color: theme.textDim, fontSize: 14 }}>{strings.maintenance.empty}</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {list.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: 12,
                  background: theme.panelAlt,
                  border: `1px solid ${theme.borderSoft}`,
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <strong style={{ color: theme.text, fontSize: 14 }}>
                    {strings.maintenance.categories[r.category] || r.category}
                  </strong>
                  <StatusBadge theme={theme} status={r.status} label={strings.maintenance.statuses[r.status] || r.status} />
                </div>
                <div style={{ fontSize: 13, color: theme.textDim, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{r.description}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>
                  {fmtDate(r.createdAt)} · {strings.maintenance.priorities[r.priority] || r.priority}
                </div>
                {Array.isArray(r.photos) && r.photos.length > 0 ? (
                  <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>
                    {strings.maintenance.attached}: {r.photos.length}
                  </div>
                ) : null}
                <label
                  htmlFor={`upl_${r.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '6px 10px',
                    background: 'transparent',
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {strings.maintenance.upload}
                  <input
                    id={`upl_${r.id}`}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => onPhoto(r.id, e)}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function DocumentsTab({ theme, api, tenantId, strings }) {
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState(null);
  const [text, setText] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.documents(tenantId);
      setDocs(rows);
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, strings.errors.generic]);

  useEffect(() => { load(); }, [load]);

  const onDownload = useCallback(async (doc) => {
    setText(null); setErr(null);
    try {
      const r = doc.kind === 'lease' || (doc.id && String(doc.id).startsWith('lease-'))
        ? await api.downloadLeasePdf(tenantId)
        : await api.downloadReceipt(tenantId, doc.id);
      if (r.ok) {
        if (r.fileRef && typeof window !== 'undefined') {
          try {
            window.open(r.fileRef, '_blank', 'noopener,noreferrer');
          } catch (_e) {
            if (r.fallbackText) setText(r.fallbackText);
          }
        } else if (r.fallbackText) {
          setText(r.fallbackText);
        }
      } else {
        setErr((r.label && r.label.he) || strings.errors.generic);
      }
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, strings.errors.generic]);

  return (
    <Card theme={theme} title={strings.documents.list}>
      {err ? <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
      {docs.length === 0 ? (
        <div style={{ color: theme.textDim, fontSize: 14 }}>{strings.documents.empty}</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {docs.map((d) => (
            <li
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                background: theme.panelAlt,
                border: `1px solid ${theme.borderSoft}`,
                borderRadius: 8,
                marginBottom: 10,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: theme.text }}>
                  {d.title || strings.documents.kinds[d.kind] || d.kind}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  {fmtDate(d.createdAt)}
                </div>
              </div>
              <Button theme={theme} variant="ghost" onClick={() => onDownload(d)}>
                {strings.documents.download}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {text ? (
        <pre
          style={{
            background: theme.panelAlt,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: 12,
            color: theme.text,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            marginTop: 12,
            direction: 'rtl',
          }}
        >
          {text}
        </pre>
      ) : null}
    </Card>
  );
}

function AccountTab({ theme, api, tenantId, strings }) {
  const [lease, setLease] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [term, setTerm] = useState('12');
  const [note, setNote] = useState('');
  const [proposed, setProposed] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await api.leaseDetails(tenantId);
      setLease(l);
      if (l && !proposed) setProposed(String(l.monthlyRent || ''));
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    }
  }, [api, tenantId, proposed, strings.errors.generic]);

  useEffect(() => { load(); }, [load]);

  const onRenew = useCallback(async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.requestLeaseRenewal(tenantId, {
        termMonths: Number(term),
        note,
        proposedRent: Number(proposed),
      });
      if (r.ok) {
        setMsg(strings.account.renewal.pending);
        await load();
      } else {
        setErr((r.label && r.label.he) || strings.errors.generic);
      }
    } catch (e) {
      setErr((e && e.label && e.label.he) || strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }, [api, tenantId, term, note, proposed, load, strings.account.renewal.pending, strings.errors.generic]);

  return (
    <>
      <Card theme={theme} title={strings.account.leaseDetails}>
        {err ? <div role="alert" style={{ color: theme.critical, fontSize: 13, marginBottom: 10 }}>{err}</div> : null}
        {!lease ? (
          <div style={{ color: theme.textDim, fontSize: 14 }}>…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <KpiTile theme={theme} label={strings.account.leaseFrom} value={fmtDate(lease.startDate)} />
            <KpiTile theme={theme} label={strings.account.leaseTo} value={fmtDate(lease.endDate)} />
            <KpiTile theme={theme} label={strings.account.monthlyRent} value={fmtMoney(lease.monthlyRent)} />
            <KpiTile theme={theme} label={strings.account.securityDeposit} value={fmtMoney(lease.securityDeposit)} />
          </div>
        )}
      </Card>

      <Card theme={theme} title={strings.account.renewal.title}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input theme={theme} label={strings.account.renewal.termMonths} value={term} onChange={setTerm} type="number" id="rn_term" />
          <Input theme={theme} label={strings.account.renewal.proposedRent} value={proposed} onChange={setProposed} type="number" id="rn_prop" />
        </div>
        <Input theme={theme} label={strings.account.renewal.note} value={note} onChange={setNote} id="rn_note" />
        {msg ? <div role="status" style={{ color: theme.success, fontSize: 13, marginBottom: 10 }}>{msg}</div> : null}
        <Button theme={theme} onClick={onRenew} disabled={busy}>
          {busy ? strings.maintenance.submitting : strings.account.renewal.submit}
        </Button>
      </Card>
    </>
  );
}

/* ================================================================== *
 *  Shell
 * ================================================================== */

const TABS = ['dashboard', 'payments', 'maintenance', 'documents', 'account'];

function TenantShell({ theme, api, tenantId, onSignout, strings }) {
  const [active, setActive] = useState('dashboard');

  const content = useMemo(() => {
    switch (active) {
      case 'payments':    return <PaymentsTab theme={theme} api={api} tenantId={tenantId} strings={strings} />;
      case 'maintenance': return <MaintenanceTab theme={theme} api={api} tenantId={tenantId} strings={strings} />;
      case 'documents':   return <DocumentsTab theme={theme} api={api} tenantId={tenantId} strings={strings} />;
      case 'account':     return <AccountTab theme={theme} api={api} tenantId={tenantId} strings={strings} />;
      case 'dashboard':
      default:            return <DashboardTab theme={theme} api={api} tenantId={tenantId} strings={strings} onGoto={setActive} />;
    }
  }, [active, theme, api, tenantId, strings]);

  return (
    <div
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily:
          '"Heebo","Rubik","Assistant",system-ui,-apple-system,"Segoe UI",Arial,sans-serif',
      }}
    >
      <header
        role="banner"
        style={{
          background: theme.panel,
          borderBottom: `1px solid ${theme.border}`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, color: theme.text }}>{strings.title}</h1>
          <div style={{ fontSize: 12, color: theme.textDim }}>{strings.tagline}</div>
        </div>
        <Button theme={theme} variant="ghost" onClick={onSignout} ariaLabel={strings.nav.signout}>
          {strings.nav.signout}
        </Button>
      </header>

      <nav
        role="tablist"
        aria-label={strings.title}
        style={{
          background: theme.panelAlt,
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => {
          const isActive = active === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`pnl_${t}`}
              id={`tab_${t}`}
              onClick={() => setActive(t)}
              style={{
                flex: '0 0 auto',
                padding: '12px 18px',
                background: isActive ? theme.accentSoft : 'transparent',
                color: isActive ? theme.accent : theme.textDim,
                border: 'none',
                borderBottom: `2px solid ${isActive ? theme.accent : 'transparent'}`,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {strings.nav[t]}
            </button>
          );
        })}
      </nav>

      <main
        id={`pnl_${active}`}
        role="tabpanel"
        aria-labelledby={`tab_${active}`}
        style={{
          padding: 16,
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        {content}
      </main>
    </div>
  );
}

/* ================================================================== *
 *  Root export
 * ================================================================== */

export default function TenantPortal({ api, initialTenantId, theme = 'dark' }) {
  const t = theme === 'light' ? PALANTIR_LIGHT : PALANTIR_DARK;
  const strings = HE;
  const [tenantId, setTenantId] = useState(initialTenantId || null);

  const onSuccess = useCallback((tid /* , session */) => {
    setTenantId(tid);
  }, []);

  const onSignout = useCallback(() => {
    setTenantId(null);
  }, []);

  if (!tenantId) {
    return <LoginScreen theme={t} api={api} onSuccess={onSuccess} strings={strings} />;
  }
  return (
    <TenantShell
      theme={t}
      api={api}
      tenantId={tenantId}
      onSignout={onSignout}
      strings={strings}
    />
  );
}

/* Named exports for tests / composition */
export { LoginScreen, TenantShell, DashboardTab, PaymentsTab, MaintenanceTab, DocumentsTab, AccountTab, HE as TENANT_HE, EN as TENANT_EN };
