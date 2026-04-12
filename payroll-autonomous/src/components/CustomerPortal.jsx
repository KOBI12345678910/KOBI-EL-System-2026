/**
 * CustomerPortal.jsx — Agent X-30
 * ====================================================================
 * Self-service customer portal for Techno-Kol Uzi mega-ERP.
 *
 * Palantir dark theme, Hebrew RTL, bilingual, mobile-first.
 * Zero external UI libs — inline styles only.
 *
 * Props:
 *   api : {
 *     login        : (email) => Promise<{ok, sent, magicLink?}>
 *     verify       : (token) => Promise<{ok, customerId, session}>
 *     dashboard    : (customerId) => Promise<DashboardSnapshot>
 *     invoices     : (customerId, filters) => Promise<Invoice[]>
 *     invoicePdf   : (customerId, invoiceId) => Promise<{ok, fileRef, fallbackText}>
 *     payInvoice   : (customerId, invoiceId, method) => Promise<{ok, paymentRef}>
 *     openOrders   : (customerId) => Promise<Order[]>
 *     orderHistory : (customerId, filters) => Promise<Order[]>
 *     quoteRequest : (customerId, items) => Promise<{ok, id}>
 *     raiseSupport : (customerId, subject, body, priority) => Promise<{ok, ticketId}>
 *     addresses    : (customerId) => Promise<Address[]>
 *     updateAddress: (customerId, addr) => Promise<{ok}>
 *     updateContact: (customerId, contact) => Promise<{ok}>
 *     statement    : (customerId, period) => Promise<ARStatement>
 *   }
 *   initialCustomerId : (optional) — if set, skips the login screen.
 *   theme             : "dark" (default) | "light"
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';

/* ================================================================== *
 *  Theme — Palantir dark
 * ================================================================== */

const PALANTIR_DARK = {
  bg:        '#0b0d10',
  panel:     '#13171c',
  panelAlt:  '#181d24',
  panelHi:   '#1b212a',
  border:    '#232a33',
  borderSoft:'#1a2029',
  accent:    '#4a9eff',
  accentSoft:'rgba(74,158,255,0.12)',
  text:      '#e6edf3',
  textDim:   '#8b95a5',
  textMuted: '#5a6472',
  info:      '#4a9eff',
  warn:      '#f5a623',
  critical:  '#ff5c5c',
  success:   '#3ddc84',
  rowHover:  '#1b2028',
  highlight: '#ffd76a',
};

const PALANTIR_LIGHT = {
  bg:        '#f4f6f9',
  panel:     '#ffffff',
  panelAlt:  '#f9fbfd',
  panelHi:   '#eef3f8',
  border:    '#d9dee4',
  borderSoft:'#e6ebf0',
  accent:    '#1a66c9',
  accentSoft:'rgba(26,102,201,0.12)',
  text:      '#12171d',
  textDim:   '#5a6472',
  textMuted: '#8b95a5',
  info:      '#1a66c9',
  warn:      '#b36a00',
  critical:  '#c62828',
  success:   '#1f7a3f',
  rowHover:  '#eef3f8',
  highlight: '#c28f00',
};

/* ================================================================== *
 *  Bilingual strings
 * ================================================================== */

const HE = {
  title:          'פורטל לקוחות',
  en_title:       'Customer Portal',
  tagline:        'Techno-Kol Uzi · שירות עצמי',
  loginPrompt:    'כניסה לפורטל באמצעות קישור דוא״ל',
  email:          'כתובת דוא״ל',
  emailPh:        'name@company.co.il',
  send:           'שלח קישור',
  sending:        'שולח…',
  checkEmail:     'בדוק את תיבת הדוא״ל שלך',
  checkEmailSub:  'אם הכתובת רשומה אצלנו, נשלח אליה קישור כניסה חד־פעמי.',
  nav: {
    dashboard: 'לוח בקרה',
    invoices:  'חשבוניות',
    orders:    'הזמנות',
    quote:     'בקשת הצעת מחיר',
    support:   'תמיכה',
    statement: 'דף חשבון',
    profile:   'פרופיל',
    signout:   'יציאה',
  },
  dashboard: {
    balanceDue:   'יתרה לתשלום',
    overdue:      'באיחור',
    unpaid:       'לא שולם',
    openOrders:   'הזמנות פתוחות',
    recent:       'הזמנות אחרונות',
    noOrders:     'אין הזמנות אחרונות',
    openTickets:  'פניות תמיכה פתוחות',
  },
  invoices: {
    number:     'מספר',
    issueDate:  'תאריך הנפקה',
    dueDate:    'תאריך פירעון',
    total:      'סכום',
    paid:       'שולם',
    balance:    'יתרה',
    status:     'סטטוס',
    action:     'פעולות',
    pdf:        'הורדת PDF',
    pay:        'תשלום מקוון',
    paying:     'מעבד תשלום…',
    all:        'כל החשבוניות',
    filterPaid: 'שולם',
    filterUnpaid: 'לא שולם',
    filterOverdue: 'באיחור',
    empty:      'לא נמצאו חשבוניות',
    payOk:      'התשלום התקבל בהצלחה',
    payFail:    'התשלום נכשל',
    statuses: {
      paid:          'שולם',
      unpaid:        'לא שולם',
      overdue:       'באיחור',
      partiallyPaid: 'שולם חלקית',
      draft:         'טיוטה',
      cancelled:     'בוטל',
    },
  },
  orders: {
    number:    'הזמנה',
    createdAt: 'תאריך',
    status:    'סטטוס',
    amount:    'סכום',
    eta:       'צפוי להגעה',
    empty:     'אין הזמנות פעילות',
  },
  quote: {
    title:     'בקשת הצעת מחיר',
    sku:       'מק״ט',
    desc:      'תיאור',
    qty:       'כמות',
    unit:      'יחידה',
    addRow:    'הוסף שורה',
    send:      'שלח בקשה',
    sending:   'שולח בקשה…',
    sent:      'הבקשה נשלחה בהצלחה',
    err:       'נא למלא לפחות שורה אחת',
  },
  support: {
    title:       'פתיחת פנייה לתמיכה',
    subject:     'נושא',
    description: 'תיאור הבעיה',
    priority:    'דחיפות',
    priorities: {
      low:    'נמוכה',
      normal: 'רגילה',
      high:   'גבוהה',
      urgent: 'דחופה',
    },
    send:    'שלח פנייה',
    sending: 'שולח…',
    sent:    'הפנייה נרשמה',
    err:     'נא להזין נושא ותיאור',
    ticketId:'מזהה פנייה',
  },
  statement: {
    title:     'דף חשבון',
    from:      'מתאריך',
    to:        'עד תאריך',
    load:      'הפק דף חשבון',
    opening:   'יתרת פתיחה',
    closing:   'יתרת סגירה',
    charges:   'חיובים',
    payments:  'תשלומים',
    date:      'תאריך',
    ref:       'אסמכתא',
    debit:     'חובה',
    credit:    'זכות',
    balance:   'יתרה',
    kind:      'סוג',
    invoice:   'חשבונית',
    payment:   'תשלום',
    empty:     'אין תנועות בתקופה שנבחרה',
  },
  profile: {
    contactName: 'איש קשר',
    phone:       'טלפון',
    email:       'דוא״ל',
    save:        'שמור שינויים',
    saved:       'השינויים נשמרו',
    addresses:   'כתובות מסירה',
    street:      'רחוב ומספר',
    city:        'עיר',
    zip:         'מיקוד',
    country:     'מדינה',
    label:       'תווית',
    addAddress:  'הוסף / עדכן כתובת',
    addrSaved:   'כתובת נשמרה',
    primary:     'ראשית',
  },
  common: {
    loading:  'טוען…',
    retry:    'נסה שוב',
    close:    'סגירה',
    cancel:   'ביטול',
    save:     'שמור',
    back:     'חזרה',
    ok:       'בוצע',
    error:    'שגיאה',
  },
};

/* ================================================================== *
 *  Helpers
 * ================================================================== */

const JERUSALEM_TZ = 'Asia/Jerusalem';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: JERUSALEM_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(d));
  } catch (_) { return String(d); }
}

function fmtMoney(n, currency) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency || 'ILS',
      maximumFractionDigits: 2,
    }).format(v);
  } catch (_) {
    return v.toFixed(2) + ' ' + (currency || 'ILS');
  }
}

function statusColor(theme, status) {
  switch (status) {
    case 'paid':          return theme.success;
    case 'overdue':       return theme.critical;
    case 'partiallyPaid': return theme.warn;
    case 'unpaid':        return theme.warn;
    case 'draft':         return theme.textMuted;
    case 'cancelled':     return theme.textMuted;
    default:              return theme.textDim;
  }
}

function downloadBlob(bytesOrText, filename, mime) {
  try {
    const blob = new Blob(
      [bytesOrText instanceof Uint8Array ? bytesOrText : String(bytesOrText || '')],
      { type: mime || 'application/octet-stream' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_) {}
    }, 200);
  } catch (_) { /* graceful no-op in non-DOM environments */ }
}

/* ================================================================== *
 *  Tiny presentational primitives (no external libs)
 * ================================================================== */

function Button({ theme, onClick, disabled, variant, children, ariaLabel, full }) {
  const base = {
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    width: full ? '100%' : 'auto',
    transition: 'background 120ms ease, border 120ms ease',
  };
  const styles = {
    primary:   { ...base, background: theme.accent,      color: '#fff',        borderColor: theme.accent },
    secondary: { ...base, background: theme.panelAlt,    color: theme.text,     borderColor: theme.border },
    ghost:     { ...base, background: 'transparent',     color: theme.text,     borderColor: theme.border },
    danger:    { ...base, background: theme.critical,    color: '#fff',        borderColor: theme.critical },
  };
  return (
    <button
      type="button"
      style={styles[variant || 'secondary']}
      onClick={disabled ? undefined : onClick}
      disabled={!!disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function Input({ theme, value, onChange, placeholder, type, ariaLabel, style }) {
  return (
    <input
      type={type || 'text'}
      value={value == null ? '' : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{
        direction: 'rtl',
        textAlign: 'right',
        padding: '10px 12px',
        borderRadius: 6,
        background: theme.panelAlt,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        fontSize: 14,
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
        ...(style || {}),
      }}
    />
  );
}

function Textarea({ theme, value, onChange, placeholder, ariaLabel }) {
  return (
    <textarea
      value={value == null ? '' : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      rows={6}
      style={{
        direction: 'rtl',
        textAlign: 'right',
        padding: '10px 12px',
        borderRadius: 6,
        background: theme.panelAlt,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        fontSize: 14,
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
      }}
    />
  );
}

function Select({ theme, value, onChange, options, ariaLabel }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{
        direction: 'rtl',
        textAlign: 'right',
        padding: '10px 12px',
        borderRadius: 6,
        background: theme.panelAlt,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        fontSize: 14,
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Panel({ theme, title, children, actions }) {
  return (
    <section
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 20,
        marginBottom: 18,
      }}
    >
      {(title || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {title && (
            <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>
              {title}
            </h2>
          )}
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

function Kpi({ theme, label, value, tone }) {
  return (
    <div
      style={{
        flex: '1 1 180px',
        minWidth: 160,
        background: theme.panelAlt,
        border: `1px solid ${theme.borderSoft}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: tone || theme.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ theme, status, text }) {
  const color = statusColor(theme, status);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `${color}1f`,
        border: `1px solid ${color}55`,
      }}
    >
      {text}
    </span>
  );
}

function Toast({ theme, kind, children }) {
  if (!children) return null;
  const color =
    kind === 'error'   ? theme.critical :
    kind === 'warn'    ? theme.warn :
    kind === 'success' ? theme.success :
    theme.accent;
  return (
    <div
      role="status"
      style={{
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        color,
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 12,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================== *
 *  Sub-screens
 * ================================================================== */

function LoginScreen({ theme, api, onSent }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr]   = useState(null);

  const onSubmit = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await api.login(email.trim());
      if (res && res.ok) {
        setSent(true);
        if (onSent) onSent(res);
      } else {
        setErr(HE.common.error);
      }
    } catch (_) {
      setErr(HE.common.error);
    } finally {
      setBusy(false);
    }
  }, [api, email, onSent]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: theme.bg,
      }}
    >
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          padding: 28,
          width: '100%',
          maxWidth: 420,
          direction: 'rtl',
        }}
      >
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 6 }}>
          {HE.tagline}
        </div>
        <h1 style={{ margin: 0, fontSize: 22, color: theme.text }}>
          {HE.title}
          <span
            style={{
              fontSize: 12,
              color: theme.textMuted,
              marginInlineStart: 10,
              fontWeight: 400,
            }}
          >
            {HE.en_title}
          </span>
        </h1>
        <p style={{ color: theme.textDim, fontSize: 14, marginTop: 10 }}>
          {HE.loginPrompt}
        </p>

        {err && <Toast theme={theme} kind="error">{err}</Toast>}
        {sent ? (
          <Toast theme={theme} kind="success">
            <div style={{ fontWeight: 700 }}>{HE.checkEmail}</div>
            <div style={{ marginTop: 4 }}>{HE.checkEmailSub}</div>
          </Toast>
        ) : (
          <>
            <label
              style={{
                display: 'block',
                color: theme.textDim,
                fontSize: 12,
                margin: '12px 0 6px',
              }}
            >
              {HE.email}
            </label>
            <Input
              theme={theme}
              value={email}
              onChange={setEmail}
              placeholder={HE.emailPh}
              type="email"
              ariaLabel={HE.email}
            />
            <div style={{ marginTop: 14 }}>
              <Button
                theme={theme}
                variant="primary"
                onClick={onSubmit}
                disabled={busy || !email}
                full
              >
                {busy ? HE.sending : HE.send}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dashboard({ theme, api, customerId }) {
  const [data, setData] = useState(null);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.dashboard(customerId);
        if (alive) setData(d);
      } catch (_) { if (alive) setErr(HE.common.error); }
    })();
    return () => { alive = false; };
  }, [api, customerId]);

  if (err) return <Toast theme={theme} kind="error">{err}</Toast>;
  if (!data) return <div style={{ color: theme.textDim }}>{HE.common.loading}</div>;

  const hasOverdue = data.overdueCount > 0;

  return (
    <>
      <Panel theme={theme} title={HE.nav.dashboard}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Kpi
            theme={theme}
            label={HE.dashboard.balanceDue}
            value={fmtMoney(data.balanceDue)}
            tone={data.balanceDue > 0 ? theme.warn : theme.success}
          />
          <Kpi
            theme={theme}
            label={HE.dashboard.overdue}
            value={String(data.overdueCount || 0)}
            tone={hasOverdue ? theme.critical : theme.text}
          />
          <Kpi
            theme={theme}
            label={HE.dashboard.unpaid}
            value={String(data.unpaidCount || 0)}
          />
          <Kpi
            theme={theme}
            label={HE.dashboard.openOrders}
            value={String(data.openOrders || 0)}
          />
          <Kpi
            theme={theme}
            label={HE.dashboard.openTickets}
            value={String(data.openTickets || 0)}
          />
        </div>
      </Panel>

      <Panel theme={theme} title={HE.dashboard.recent}>
        {(!data.recentOrders || data.recentOrders.length === 0) && (
          <div style={{ color: theme.textDim, fontSize: 14 }}>
            {HE.dashboard.noOrders}
          </div>
        )}
        {data.recentOrders && data.recentOrders.length > 0 && (
          <OrderTable theme={theme} rows={data.recentOrders} />
        )}
      </Panel>
    </>
  );
}

function OrderTable({ theme, rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          direction: 'rtl',
          fontSize: 14,
          color: theme.text,
        }}
      >
        <thead>
          <tr style={{ color: theme.textDim }}>
            <th style={thStyle(theme)}>{HE.orders.number}</th>
            <th style={thStyle(theme)}>{HE.orders.createdAt}</th>
            <th style={thStyle(theme)}>{HE.orders.status}</th>
            <th style={thStyle(theme)}>{HE.orders.amount}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
              <td style={tdStyle(theme)}>{o.number || o.id}</td>
              <td style={tdStyle(theme)}>{fmtDate(o.createdAt)}</td>
              <td style={tdStyle(theme)}>
                <StatusPill
                  theme={theme}
                  status={o.status}
                  text={HE.nav.orders + ' · ' + (o.status || '—')}
                />
              </td>
              <td style={tdStyle(theme)}>{fmtMoney(o.total, o.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(theme) {
  return {
    textAlign: 'right',
    padding: '8px 6px',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: `1px solid ${theme.border}`,
  };
}

function tdStyle(theme) {
  return {
    textAlign: 'right',
    padding: '10px 6px',
    verticalAlign: 'top',
  };
}

function InvoicesScreen({ theme, api, customerId }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.invoices(customerId, status ? { status } : {});
      setRows(r);
    } catch (_) { /* ignore */ }
    finally { setLoading(false); }
  }, [api, customerId, status]);

  useEffect(() => { load(); }, [load]);

  const onPay = useCallback(async (inv) => {
    setPayingId(inv.id);
    setToast(null);
    try {
      const res = await api.payInvoice(customerId, inv.id, 'card');
      if (res && res.ok) {
        setToast({ kind: 'success', text: HE.invoices.payOk });
        await load();
      } else {
        setToast({ kind: 'error', text: HE.invoices.payFail });
      }
    } catch (_) {
      setToast({ kind: 'error', text: HE.invoices.payFail });
    } finally {
      setPayingId(null);
    }
  }, [api, customerId, load]);

  const onPdf = useCallback(async (inv) => {
    try {
      const res = await api.invoicePdf(customerId, inv.id);
      if (res && res.ok) {
        downloadBlob(
          res.bytes || res.fallbackText || '',
          (inv.number || inv.id) + '.pdf',
          res.mime || 'application/pdf'
        );
      }
    } catch (_) { /* swallow */ }
  }, [api, customerId]);

  return (
    <>
      {toast && <Toast theme={theme} kind={toast.kind}>{toast.text}</Toast>}
      <Panel
        theme={theme}
        title={HE.nav.invoices}
        actions={
          <div style={{ minWidth: 180 }}>
            <Select
              theme={theme}
              value={status}
              onChange={setStatus}
              options={[
                { value: '',         label: HE.invoices.all },
                { value: 'paid',     label: HE.invoices.filterPaid },
                { value: 'unpaid',   label: HE.invoices.filterUnpaid },
                { value: 'overdue',  label: HE.invoices.filterOverdue },
              ]}
              ariaLabel={HE.invoices.status}
            />
          </div>
        }
      >
        {loading && <div style={{ color: theme.textDim }}>{HE.common.loading}</div>}
        {!loading && rows.length === 0 && (
          <div style={{ color: theme.textDim, fontSize: 14 }}>{HE.invoices.empty}</div>
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                direction: 'rtl',
                fontSize: 14,
                color: theme.text,
              }}
            >
              <thead>
                <tr style={{ color: theme.textDim }}>
                  <th style={thStyle(theme)}>{HE.invoices.number}</th>
                  <th style={thStyle(theme)}>{HE.invoices.issueDate}</th>
                  <th style={thStyle(theme)}>{HE.invoices.dueDate}</th>
                  <th style={thStyle(theme)}>{HE.invoices.total}</th>
                  <th style={thStyle(theme)}>{HE.invoices.balance}</th>
                  <th style={thStyle(theme)}>{HE.invoices.status}</th>
                  <th style={thStyle(theme)}>{HE.invoices.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const statusKey = inv.status;
                  const statusText = HE.invoices.statuses[statusKey] || statusKey;
                  return (
                    <tr key={inv.id} style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
                      <td style={tdStyle(theme)}>{inv.number || inv.id}</td>
                      <td style={tdStyle(theme)}>{fmtDate(inv.issueDate)}</td>
                      <td style={tdStyle(theme)}>{fmtDate(inv.dueDate)}</td>
                      <td style={tdStyle(theme)}>{fmtMoney(inv.total, inv.currency)}</td>
                      <td style={tdStyle(theme)}>{fmtMoney(inv.balance, inv.currency)}</td>
                      <td style={tdStyle(theme)}>
                        <StatusPill theme={theme} status={statusKey} text={statusText} />
                      </td>
                      <td style={tdStyle(theme)}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button theme={theme} variant="ghost" onClick={() => onPdf(inv)}>
                            {HE.invoices.pdf}
                          </Button>
                          {(statusKey === 'unpaid' ||
                            statusKey === 'overdue' ||
                            statusKey === 'partiallyPaid') && (
                            <Button
                              theme={theme}
                              variant="primary"
                              onClick={() => onPay(inv)}
                              disabled={payingId === inv.id}
                            >
                              {payingId === inv.id ? HE.invoices.paying : HE.invoices.pay}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function OrdersScreen({ theme, api, customerId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.orderHistory(customerId, {});
        if (alive) setRows(r);
      } catch (_) { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [api, customerId]);

  return (
    <Panel theme={theme} title={HE.nav.orders}>
      {loading && <div style={{ color: theme.textDim }}>{HE.common.loading}</div>}
      {!loading && rows.length === 0 && (
        <div style={{ color: theme.textDim, fontSize: 14 }}>{HE.orders.empty}</div>
      )}
      {!loading && rows.length > 0 && <OrderTable theme={theme} rows={rows} />}
    </Panel>
  );
}

function QuoteScreen({ theme, api, customerId }) {
  const [items, setItems] = useState([
    { sku: '', description: '', quantity: 1, unit: 'ea' },
  ]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const update = (idx, field, val) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  };
  const addRow = () =>
    setItems((prev) => prev.concat({ sku: '', description: '', quantity: 1, unit: 'ea' }));

  const onSubmit = async () => {
    const valid = items.filter(
      (it) => (it.description || it.sku) && Number(it.quantity) > 0
    );
    if (valid.length === 0) {
      setToast({ kind: 'error', text: HE.quote.err });
      return;
    }
    setBusy(true); setToast(null);
    try {
      const res = await api.quoteRequest(customerId, valid);
      if (res && res.ok) {
        setToast({ kind: 'success', text: HE.quote.sent + ' · ' + res.id });
        setItems([{ sku: '', description: '', quantity: 1, unit: 'ea' }]);
      } else {
        setToast({ kind: 'error', text: HE.common.error });
      }
    } catch (_) {
      setToast({ kind: 'error', text: HE.common.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title={HE.quote.title}>
      {toast && <Toast theme={theme} kind={toast.kind}>{toast.text}</Toast>}
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
              padding: 10,
              border: `1px solid ${theme.borderSoft}`,
              borderRadius: 6,
              background: theme.panelAlt,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
                {HE.quote.sku}
              </div>
              <Input
                theme={theme}
                value={it.sku}
                onChange={(v) => update(idx, 'sku', v)}
                ariaLabel={HE.quote.sku}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
                {HE.quote.desc}
              </div>
              <Input
                theme={theme}
                value={it.description}
                onChange={(v) => update(idx, 'description', v)}
                ariaLabel={HE.quote.desc}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
                {HE.quote.qty}
              </div>
              <Input
                theme={theme}
                value={it.quantity}
                onChange={(v) => update(idx, 'quantity', v)}
                type="number"
                ariaLabel={HE.quote.qty}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
                {HE.quote.unit}
              </div>
              <Input
                theme={theme}
                value={it.unit}
                onChange={(v) => update(idx, 'unit', v)}
                ariaLabel={HE.quote.unit}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button theme={theme} variant="ghost" onClick={addRow}>
          {HE.quote.addRow}
        </Button>
        <Button theme={theme} variant="primary" onClick={onSubmit} disabled={busy}>
          {busy ? HE.quote.sending : HE.quote.send}
        </Button>
      </div>
    </Panel>
  );
}

function SupportScreen({ theme, api, customerId }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const onSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      setToast({ kind: 'error', text: HE.support.err });
      return;
    }
    setBusy(true); setToast(null);
    try {
      const res = await api.raiseSupport(customerId, subject.trim(), body.trim(), priority);
      if (res && res.ok) {
        setToast({ kind: 'success', text: HE.support.sent + ' · ' + res.ticketId });
        setSubject(''); setBody('');
      } else {
        setToast({ kind: 'error', text: HE.common.error });
      }
    } catch (_) {
      setToast({ kind: 'error', text: HE.common.error });
    } finally { setBusy(false); }
  };

  return (
    <Panel theme={theme} title={HE.support.title}>
      {toast && <Toast theme={theme} kind={toast.kind}>{toast.text}</Toast>}
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
            {HE.support.subject}
          </div>
          <Input theme={theme} value={subject} onChange={setSubject} ariaLabel={HE.support.subject} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
            {HE.support.priority}
          </div>
          <Select
            theme={theme}
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low',    label: HE.support.priorities.low },
              { value: 'normal', label: HE.support.priorities.normal },
              { value: 'high',   label: HE.support.priorities.high },
              { value: 'urgent', label: HE.support.priorities.urgent },
            ]}
            ariaLabel={HE.support.priority}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>
            {HE.support.description}
          </div>
          <Textarea theme={theme} value={body} onChange={setBody} ariaLabel={HE.support.description} />
        </div>
        <div>
          <Button theme={theme} variant="primary" onClick={onSubmit} disabled={busy}>
            {busy ? HE.support.sending : HE.support.send}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function StatementScreen({ theme, api, customerId }) {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const d = await api.statement(customerId, { from, to });
      setData(d);
    } catch (_) { /* ignore */ }
    finally { setBusy(false); }
  };

  return (
    <Panel theme={theme} title={HE.statement.title}>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.statement.from}</div>
          <Input theme={theme} value={from} onChange={setFrom} type="date" />
        </div>
        <div>
          <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.statement.to}</div>
          <Input theme={theme} value={to} onChange={setTo} type="date" />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Button theme={theme} variant="primary" onClick={run} disabled={busy}>
            {busy ? HE.common.loading : HE.statement.load}
          </Button>
        </div>
      </div>

      {data && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <Kpi theme={theme} label={HE.statement.opening}  value={fmtMoney(data.opening)} />
            <Kpi theme={theme} label={HE.statement.charges}  value={fmtMoney(data.totalCharges)} />
            <Kpi theme={theme} label={HE.statement.payments} value={fmtMoney(data.totalPayments)} />
            <Kpi theme={theme} label={HE.statement.closing}  value={fmtMoney(data.closing)} tone={data.closing > 0 ? theme.warn : theme.success} />
          </div>
          {data.rows.length === 0 ? (
            <div style={{ color: theme.textDim, fontSize: 14 }}>{HE.statement.empty}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  direction: 'rtl',
                  fontSize: 14,
                  color: theme.text,
                }}
              >
                <thead>
                  <tr style={{ color: theme.textDim }}>
                    <th style={thStyle(theme)}>{HE.statement.date}</th>
                    <th style={thStyle(theme)}>{HE.statement.kind}</th>
                    <th style={thStyle(theme)}>{HE.statement.ref}</th>
                    <th style={thStyle(theme)}>{HE.statement.debit}</th>
                    <th style={thStyle(theme)}>{HE.statement.credit}</th>
                    <th style={thStyle(theme)}>{HE.statement.balance}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
                      <td style={tdStyle(theme)}>{r.date}</td>
                      <td style={tdStyle(theme)}>
                        {r.kind === 'invoice' ? HE.statement.invoice : HE.statement.payment}
                      </td>
                      <td style={tdStyle(theme)}>{r.ref}</td>
                      <td style={tdStyle(theme)}>{r.debit  ? fmtMoney(r.debit)  : '—'}</td>
                      <td style={tdStyle(theme)}>{r.credit ? fmtMoney(r.credit) : '—'}</td>
                      <td style={tdStyle(theme)}>{fmtMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ProfileScreen({ theme, api, customerId }) {
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [street, setStreet] = useState('');
  const [city, setCity]     = useState('');
  const [zip, setZip]       = useState('');
  const [label, setLabel]   = useState('Main');
  const [toast, setToast]   = useState(null);
  const [busy, setBusy]     = useState(false);

  const loadAddresses = useCallback(async () => {
    try {
      const a = await api.addresses(customerId);
      setAddresses(a || []);
    } catch (_) { /* ignore */ }
  }, [api, customerId]);

  useEffect(() => { loadAddresses(); }, [loadAddresses]);

  const saveContact = async () => {
    setBusy(true); setToast(null);
    try {
      const res = await api.updateContact(customerId, { contactName, phone, email });
      if (res && res.ok) setToast({ kind: 'success', text: HE.profile.saved });
      else setToast({ kind: 'error', text: HE.common.error });
    } catch (_) {
      setToast({ kind: 'error', text: HE.common.error });
    } finally { setBusy(false); }
  };

  const saveAddress = async () => {
    if (!street || !city) {
      setToast({ kind: 'error', text: HE.common.error });
      return;
    }
    setBusy(true); setToast(null);
    try {
      const res = await api.updateAddress(customerId, { street, city, zip, label });
      if (res && res.ok) {
        setToast({ kind: 'success', text: HE.profile.addrSaved });
        setStreet(''); setCity(''); setZip(''); setLabel('Main');
        await loadAddresses();
      } else {
        setToast({ kind: 'error', text: HE.common.error });
      }
    } catch (_) {
      setToast({ kind: 'error', text: HE.common.error });
    } finally { setBusy(false); }
  };

  return (
    <>
      {toast && <Toast theme={theme} kind={toast.kind}>{toast.text}</Toast>}

      <Panel theme={theme} title={HE.nav.profile}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.contactName}</div>
            <Input theme={theme} value={contactName} onChange={setContactName} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.phone}</div>
            <Input theme={theme} value={phone} onChange={setPhone} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.email}</div>
            <Input theme={theme} value={email} onChange={setEmail} type="email" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button theme={theme} variant="primary" onClick={saveContact} disabled={busy}>
            {HE.profile.save}
          </Button>
        </div>
      </Panel>

      <Panel theme={theme} title={HE.profile.addresses}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.label}</div>
            <Input theme={theme} value={label} onChange={setLabel} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.street}</div>
            <Input theme={theme} value={street} onChange={setStreet} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.city}</div>
            <Input theme={theme} value={city} onChange={setCity} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 4 }}>{HE.profile.zip}</div>
            <Input theme={theme} value={zip} onChange={setZip} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button theme={theme} variant="primary" onClick={saveAddress} disabled={busy}>
            {HE.profile.addAddress}
          </Button>
        </div>
        {addresses.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 14 }}>
            {addresses.map((a) => (
              <li
                key={a.id}
                style={{
                  padding: 10,
                  border: `1px solid ${theme.borderSoft}`,
                  borderRadius: 6,
                  marginBottom: 6,
                  background: theme.panelAlt,
                  color: theme.text,
                  fontSize: 14,
                }}
              >
                <b>{a.label}</b> — {a.street}, {a.city} {a.zip || ''}
                {a.isPrimary && (
                  <span
                    style={{
                      marginInlineStart: 8,
                      color: theme.accent,
                      fontSize: 12,
                    }}
                  >
                    · {HE.profile.primary}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ================================================================== *
 *  Main component
 * ================================================================== */

const SCREENS = {
  dashboard: Dashboard,
  invoices:  InvoicesScreen,
  orders:    OrdersScreen,
  quote:     QuoteScreen,
  support:   SupportScreen,
  statement: StatementScreen,
  profile:   ProfileScreen,
};

function CustomerPortal(props) {
  const theme = (props && props.theme === 'light') ? PALANTIR_LIGHT : PALANTIR_DARK;
  const api = props && props.api;

  const [customerId, setCustomerId] = useState(
    (props && props.initialCustomerId) || null
  );
  const [screen, setScreen] = useState('dashboard');

  const NAV = useMemo(() => ([
    { key: 'dashboard', label: HE.nav.dashboard },
    { key: 'invoices',  label: HE.nav.invoices },
    { key: 'orders',    label: HE.nav.orders },
    { key: 'quote',     label: HE.nav.quote },
    { key: 'support',   label: HE.nav.support },
    { key: 'statement', label: HE.nav.statement },
    { key: 'profile',   label: HE.nav.profile },
  ]), []);

  if (!api) {
    return (
      <div style={{ color: theme.critical, padding: 20 }}>
        CustomerPortal: missing `api` prop.
      </div>
    );
  }

  if (!customerId) {
    return (
      <LoginScreen
        theme={theme}
        api={api}
        onSent={(res) => {
          // In dev/stub flow the engine returns a magic link directly.
          // A real deployment would verify via e-mail click.
          if (res && res.token) {
            (async () => {
              try {
                const v = await api.verify(res.token);
                if (v && v.ok) setCustomerId(v.customerId);
              } catch (_) { /* ignore */ }
            })();
          }
        }}
      />
    );
  }

  const ScreenComp = SCREENS[screen] || Dashboard;

  return (
    <div
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        fontFamily: "'Segoe UI', 'Heebo', Arial, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          background: theme.panel,
          borderBottom: `1px solid ${theme.border}`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: theme.textDim }}>{HE.tagline}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
            {HE.title}
            <span
              style={{
                fontSize: 12,
                color: theme.textMuted,
                fontWeight: 400,
                marginInlineStart: 8,
              }}
            >
              {HE.en_title}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button theme={theme} variant="ghost" onClick={() => setCustomerId(null)}>
            {HE.nav.signout}
          </Button>
        </div>
      </header>

      {/* Nav tabs — scrollable on mobile */}
      <nav
        style={{
          background: theme.panelAlt,
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          overflowX: 'auto',
          gap: 2,
          padding: '0 8px',
        }}
        aria-label="Portal navigation"
      >
        {NAV.map((n) => {
          const active = n.key === screen;
          return (
            <button
              type="button"
              key={n.key}
              onClick={() => setScreen(n.key)}
              style={{
                background: active ? theme.accentSoft : 'transparent',
                color: active ? theme.accent : theme.textDim,
                border: 'none',
                borderBottom: active
                  ? `2px solid ${theme.accent}`
                  : '2px solid transparent',
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: '1 1 auto',
          padding: 16,
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <ScreenComp theme={theme} api={api} customerId={customerId} />
      </main>

      <footer
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: theme.textMuted,
          padding: 12,
          borderTop: `1px solid ${theme.borderSoft}`,
        }}
      >
        Techno-Kol Uzi · Agent X-30 · Customer Portal
      </footer>
    </div>
  );
}

export default CustomerPortal;
export { CustomerPortal, PALANTIR_DARK, PALANTIR_LIGHT, HE };
