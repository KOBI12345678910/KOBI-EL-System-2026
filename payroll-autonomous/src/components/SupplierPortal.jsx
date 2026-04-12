/**
 * SupplierPortal.jsx — Agent X-29 / Swarm 3B
 * ═══════════════════════════════════════════════════════════════════
 * Self-service supplier portal UI for Techno-Kol Uzi mega-ERP.
 * ממשק פורטל הספקים לשירות עצמי — מערכת טכנו-קול אוזי.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Palantir-style dark theme, Hebrew RTL, bilingual labels, inline styles.
 * Zero external UI libraries. Consumes the engine exposed at
 *   onyx-procurement/src/supplier-portal/portal-engine.js
 * via an async `api` prop so the component stays persistence-agnostic
 * and can be rendered in storybooks, production, or tests.
 *
 * Props:
 *   api           — async functions matching the portal-engine surface:
 *                    requestMagicLink(email)
 *                    verifyMagicLink(token)      → session { token, csrf }
 *                    listOpenPOs(supplierId)
 *                    acknowledgePO(supplierId, poId, promiseDate, csrf)
 *                    submitASN(supplierId, data, csrf)
 *                    submitInvoice(supplierId, data, csrf)
 *                    getPaymentHistory(supplierId)
 *                    updateContact(supplierId, data, csrf)
 *                    uploadCertification(supplierId, data, csrf)
 *                    submitTaxClarification(supplierId, data, csrf)
 *                    getSupplier(supplierId)
 *   initialSession — optional pre-authenticated { supplierId, token, csrf }
 *   theme          — "dark" | "light" (default dark)
 *
 * Never deletes. All destructive user intents turn into audit-logged
 * updates on the backend.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme — Palantir dark                                              */
/* ------------------------------------------------------------------ */

const PALANTIR_DARK = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  border: '#232a33',
  borderSoft: '#1a2029',
  accent: '#4a9eff',
  accentSoft: 'rgba(74,158,255,0.12)',
  text: '#e6edf3',
  textDim: '#8b95a5',
  textMuted: '#5a6472',
  info: '#4a9eff',
  warn: '#f5a623',
  critical: '#ff5c5c',
  success: '#3ddc84',
  rowHover: '#1b2028',
  rowSelected: '#1f2730',
};

const PALANTIR_LIGHT = {
  bg: '#f3f4f6',
  panel: '#ffffff',
  panelAlt: '#f8f9fa',
  border: '#d0d7de',
  borderSoft: '#e5e9ef',
  accent: '#0969da',
  accentSoft: 'rgba(9,105,218,0.08)',
  text: '#0b0d10',
  textDim: '#546070',
  textMuted: '#8b95a5',
  info: '#0969da',
  warn: '#bf8700',
  critical: '#cf222e',
  success: '#1f883d',
  rowHover: '#f0f3f7',
  rowSelected: '#e1ebf8',
};

/* ------------------------------------------------------------------ */
/*  Hebrew / English labels                                            */
/* ------------------------------------------------------------------ */

const LABELS = {
  title: 'פורטל ספקים • Supplier Portal',
  subtitle: 'שירות עצמי לספקי טכנו-קול • Self-service for Techno-Kol vendors',
  loginTitle: 'כניסה לפורטל • Sign In',
  loginHint:
    'הכניסו את כתובת הדוא״ל הרשומה ונשלח קישור כניסה זמני. ' +
    'Enter your registered email — we will send a time-limited login link.',
  emailLabel: 'דוא״ל • Email',
  sendMagicLink: 'שליחת קישור כניסה • Send magic link',
  tokenLabel: 'אסימון שהגיע בדוא״ל • Token from email',
  verifyToken: 'אימות וכניסה • Verify & sign in',
  logout: 'יציאה • Sign out',
  menu: {
    overview: 'סקירה • Overview',
    pos: 'הזמנות רכש • Purchase Orders',
    asn: 'הודעת משלוח • ASN',
    invoices: 'חשבוניות • Invoices',
    payments: 'תשלומים • Payments',
    contact: 'פרטי קשר • Contact',
    certs: 'אישורים • Certifications',
    tax: 'ניכוי במקור • Tax Withholding',
  },
  openPOs: 'הזמנות פתוחות • Open POs',
  poNumber: 'מס׳ הזמנה',
  poDate: 'תאריך הזמנה',
  poTotal: 'סה״כ',
  poStatus: 'סטטוס',
  acknowledge: 'אישור תאריך • Acknowledge',
  promiseDate: 'תאריך התחייבות • Promise date',
  confirm: 'אישור • Confirm',
  cancel: 'ביטול • Cancel',
  noPOs: 'אין הזמנות פתוחות • No open POs',
  submitASN: 'שליחת הודעת משלוח מראש • Submit ASN',
  shippedAt: 'תאריך משלוח',
  carrier: 'מוביל',
  tracking: 'מספר מעקב',
  submit: 'שליחה • Submit',
  submitInvoice: 'הגשת חשבונית • Submit invoice',
  invoiceNumber: 'מספר חשבונית',
  amount: 'סכום',
  currency: 'מטבע',
  issuedAt: 'תאריך הוצאה',
  file: 'קובץ',
  upload: 'העלאה • Upload',
  paymentHistory: 'היסטוריית תשלומים • Payment history',
  paidAt: 'תאריך תשלום',
  reference: 'אסמכתא',
  updateContact: 'עדכון פרטי קשר • Update contact info',
  contactName: 'איש קשר',
  phone: 'טלפון',
  address: 'כתובת',
  city: 'עיר',
  postalCode: 'מיקוד',
  country: 'מדינה',
  save: 'שמירה • Save',
  uploadCert: 'העלאת אישור • Upload certification',
  certType: 'סוג אישור',
  issuer: 'גוף מנפיק',
  validUntil: 'תוקף עד',
  taxClarification: 'עדכון ניכוי במקור • Tax Withholding Clarification',
  subject: 'נושא',
  message: 'הודעה',
  requestedRate: 'שיעור ניכוי מבוקש (%)',
  loading: 'טוען… • Loading…',
  error: 'שגיאה • Error',
  success: 'בוצע בהצלחה • Done',
  empty: 'אין נתונים • No records',
  selectFile: 'בחירת קובץ • Choose file',
  noFile: 'לא נבחר קובץ',
  welcome: 'שלום',
  lastLogin: 'התחברות אחרונה',
  filesLimit: 'עד 25MB. קבצים מותרים: PDF, PNG, JPG, XLSX, DOCX, CSV, XML.',
};

/* ------------------------------------------------------------------ */
/*  Style helpers                                                       */
/* ------------------------------------------------------------------ */

const baseFont =
  '"Assistant", "Rubik", -apple-system, BlinkMacSystemFont, "Segoe UI", ' +
  'Roboto, "Helvetica Neue", Arial, sans-serif';

function styles(theme) {
  return {
    root: {
      direction: 'rtl',
      fontFamily: baseFont,
      background: theme.bg,
      color: theme.text,
      minHeight: '100vh',
      padding: '24px',
      boxSizing: 'border-box',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px',
      paddingBottom: '16px',
      borderBottom: `1px solid ${theme.border}`,
    },
    title: {
      fontSize: '22px',
      fontWeight: 700,
      margin: 0,
    },
    subtitle: {
      fontSize: '13px',
      color: theme.textDim,
      marginTop: '4px',
    },
    layout: {
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '16px',
      alignItems: 'flex-start',
    },
    nav: {
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '8px',
    },
    navBtn: (active) => ({
      display: 'block',
      width: '100%',
      textAlign: 'right',
      padding: '10px 12px',
      background: active ? theme.accentSoft : 'transparent',
      color: active ? theme.accent : theme.text,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontFamily: baseFont,
      fontSize: '14px',
      marginBottom: '4px',
      fontWeight: active ? 600 : 400,
    }),
    panel: {
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '20px',
      minHeight: '240px',
    },
    panelTitle: {
      fontSize: '16px',
      fontWeight: 600,
      marginBottom: '16px',
      paddingBottom: '10px',
      borderBottom: `1px solid ${theme.borderSoft}`,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      textAlign: 'right',
      padding: '10px 8px',
      borderBottom: `1px solid ${theme.border}`,
      color: theme.textDim,
      fontWeight: 600,
    },
    td: {
      padding: '10px 8px',
      borderBottom: `1px solid ${theme.borderSoft}`,
      color: theme.text,
    },
    input: {
      width: '100%',
      padding: '8px 10px',
      background: theme.panelAlt,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      color: theme.text,
      fontFamily: baseFont,
      fontSize: '13px',
      boxSizing: 'border-box',
    },
    label: {
      display: 'block',
      fontSize: '12px',
      color: theme.textDim,
      marginBottom: '4px',
      marginTop: '10px',
    },
    btn: (variant = 'primary') => ({
      padding: '8px 16px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontFamily: baseFont,
      fontSize: '13px',
      fontWeight: 600,
      background: variant === 'primary' ? theme.accent : theme.panelAlt,
      color: variant === 'primary' ? '#ffffff' : theme.text,
      marginLeft: '8px',
    }),
    error: {
      color: theme.critical,
      fontSize: '13px',
      padding: '10px',
      background: 'rgba(255,92,92,0.08)',
      borderRadius: '6px',
      marginTop: '10px',
    },
    success: {
      color: theme.success,
      fontSize: '13px',
      padding: '10px',
      background: 'rgba(61,220,132,0.08)',
      borderRadius: '6px',
      marginTop: '10px',
    },
    statusBadge: (status) => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      background:
        status === 'open' ? theme.accentSoft :
        status === 'acknowledged' ? 'rgba(61,220,132,0.12)' :
        status === 'shipped' ? 'rgba(245,166,35,0.12)' :
        theme.panelAlt,
      color:
        status === 'open' ? theme.accent :
        status === 'acknowledged' ? theme.success :
        status === 'shipped' ? theme.warn :
        theme.textDim,
    }),
    loginBox: {
      maxWidth: '420px',
      margin: '80px auto',
      padding: '32px',
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: '10px',
    },
    hint: {
      fontSize: '12px',
      color: theme.textMuted,
      marginTop: '8px',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export default function SupplierPortal({ api, initialSession = null, theme = 'dark' }) {
  const palette = theme === 'light' ? PALANTIR_LIGHT : PALANTIR_DARK;
  const s = useMemo(() => styles(palette), [palette]);

  const [session, setSession] = useState(initialSession);
  const [supplier, setSupplier] = useState(null);
  const [view, setView] = useState('overview');
  const [banner, setBanner] = useState(null); // { type: 'error'|'success', text }

  // Auth state
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  // Data state
  const [pos, setPOs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [contactForm, setContactForm] = useState({});

  /* ---------- helpers ---------- */
  const showError = useCallback((err) => {
    const msg = err && err.message ? err.message : String(err || LABELS.error);
    setBanner({ type: 'error', text: msg });
  }, []);
  const showSuccess = useCallback((msg) => {
    setBanner({ type: 'success', text: msg });
  }, []);
  const clearBanner = useCallback(() => setBanner(null), []);

  /* ---------- session bootstrap ---------- */
  useEffect(() => {
    if (!session || !api || !api.getSupplier) return;
    let cancelled = false;
    (async () => {
      try {
        const sup = await api.getSupplier(session.supplierId);
        if (!cancelled) {
          setSupplier(sup);
          setContactForm({
            contactName: sup.contactName || '',
            phone: sup.phone || '',
            address: sup.address || '',
            city: sup.city || '',
            postalCode: sup.postalCode || '',
            country: sup.country || '',
          });
        }
      } catch (err) {
        if (!cancelled) showError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [session, api, showError]);

  /* ---------- data loading per view ---------- */
  useEffect(() => {
    if (!session || !api) return;
    let cancelled = false;
    (async () => {
      try {
        if (view === 'pos' || view === 'overview') {
          const list = await api.listOpenPOs(session.supplierId);
          if (!cancelled) setPOs(Array.isArray(list) ? list : []);
        }
        if (view === 'payments') {
          const list = await api.getPaymentHistory(session.supplierId);
          if (!cancelled) setPayments(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        if (!cancelled) showError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [view, session, api, showError]);

  /* ---------- auth handlers ---------- */
  const handleRequestLink = useCallback(async () => {
    clearBanner();
    if (!email) {
      showError(new Error('Email required'));
      return;
    }
    setLoading(true);
    try {
      await api.requestMagicLink(email);
      showSuccess('קישור כניסה נשלח • Magic link sent');
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [api, email, clearBanner, showError, showSuccess]);

  const handleVerifyToken = useCallback(async () => {
    clearBanner();
    if (!token) {
      showError(new Error('Token required'));
      return;
    }
    setLoading(true);
    try {
      const sess = await api.verifyMagicLink(token);
      if (!sess || !sess.supplierId) throw new Error('Invalid response');
      setSession(sess);
      showSuccess(LABELS.success);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [api, token, clearBanner, showError, showSuccess]);

  const handleLogout = useCallback(() => {
    setSession(null);
    setSupplier(null);
    setPOs([]);
    setPayments([]);
    setToken('');
    setEmail('');
    setView('overview');
    clearBanner();
  }, [clearBanner]);

  /* ---------- PO acknowledge ---------- */
  const [ackState, setAckState] = useState({}); // poId → promiseDate

  const handleAcknowledge = useCallback(async (poId) => {
    clearBanner();
    const promiseDate = ackState[poId];
    if (!promiseDate) {
      showError(new Error('Promise date required'));
      return;
    }
    try {
      await api.acknowledgePO(session.supplierId, poId, promiseDate, session.csrf);
      showSuccess('אושר בהצלחה • Acknowledged');
      const list = await api.listOpenPOs(session.supplierId);
      setPOs(list || []);
    } catch (err) {
      showError(err);
    }
  }, [api, session, ackState, clearBanner, showError, showSuccess]);

  /* ---------- contact update ---------- */
  const handleContactSave = useCallback(async () => {
    clearBanner();
    try {
      await api.updateContact(session.supplierId, contactForm, session.csrf);
      showSuccess(LABELS.success);
    } catch (err) {
      showError(err);
    }
  }, [api, session, contactForm, clearBanner, showError, showSuccess]);

  /* ---------- ASN submit ---------- */
  const [asnForm, setAsnForm] = useState({ poId: '', shippedAt: '', carrier: '', trackingNumber: '' });
  const handleASNSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearBanner();
    try {
      await api.submitASN(session.supplierId, asnForm, session.csrf);
      showSuccess(LABELS.success);
      setAsnForm({ poId: '', shippedAt: '', carrier: '', trackingNumber: '' });
    } catch (err) {
      showError(err);
    }
  }, [api, session, asnForm, clearBanner, showError, showSuccess]);

  /* ---------- Invoice submit ---------- */
  const [invoiceForm, setInvoiceForm] = useState({
    poId: '', invoiceNumber: '', amount: '', currency: 'ILS', issuedAt: '',
  });
  const handleInvoiceSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearBanner();
    try {
      const data = { ...invoiceForm, amount: Number(invoiceForm.amount) };
      await api.submitInvoice(session.supplierId, data, session.csrf);
      showSuccess(LABELS.success);
      setInvoiceForm({ poId: '', invoiceNumber: '', amount: '', currency: 'ILS', issuedAt: '' });
    } catch (err) {
      showError(err);
    }
  }, [api, session, invoiceForm, clearBanner, showError, showSuccess]);

  /* ---------- Certification upload ---------- */
  const [certForm, setCertForm] = useState({ certType: '', issuer: '', validUntil: '' });
  const [certFile, setCertFile] = useState(null);
  const handleCertSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearBanner();
    try {
      if (!certFile) throw new Error('קובץ חובה • File required');
      await api.uploadCertification(
        session.supplierId,
        { ...certForm, file: certFile },
        session.csrf,
      );
      showSuccess(LABELS.success);
      setCertForm({ certType: '', issuer: '', validUntil: '' });
      setCertFile(null);
    } catch (err) {
      showError(err);
    }
  }, [api, session, certForm, certFile, clearBanner, showError, showSuccess]);

  /* ---------- Tax clarification ---------- */
  const [taxForm, setTaxForm] = useState({ subject: '', message: '', requestedRate: '' });
  const handleTaxSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    clearBanner();
    try {
      const data = {
        subject: taxForm.subject,
        message: taxForm.message,
        requestedRate: taxForm.requestedRate === '' ? null : Number(taxForm.requestedRate),
      };
      await api.submitTaxClarification(session.supplierId, data, session.csrf);
      showSuccess(LABELS.success);
      setTaxForm({ subject: '', message: '', requestedRate: '' });
    } catch (err) {
      showError(err);
    }
  }, [api, session, taxForm, clearBanner, showError, showSuccess]);

  /* ---------- File input helper ---------- */
  const onFileChange = useCallback((e, setter) => {
    const f = e.target.files && e.target.files[0];
    if (!f) { setter(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setter({
        filename: f.name,
        mimeType: f.type || 'application/octet-stream',
        size: f.size,
        content: reader.result,
      });
    };
    reader.readAsText(f);
  }, []);

  /* ---------- Login view ---------- */
  if (!session) {
    return (
      <div style={s.root}>
        <div style={s.loginBox}>
          <h1 style={s.title}>{LABELS.loginTitle}</h1>
          <p style={s.hint}>{LABELS.loginHint}</p>

          <label style={s.label}>{LABELS.emailLabel}</label>
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="supplier@example.com"
            autoComplete="email"
          />
          <div style={{ marginTop: '12px' }}>
            <button
              style={s.btn('primary')}
              onClick={handleRequestLink}
              disabled={loading}
              type="button"
            >
              {loading ? LABELS.loading : LABELS.sendMagicLink}
            </button>
          </div>

          <label style={s.label}>{LABELS.tokenLabel}</label>
          <input
            style={s.input}
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="xxxxxxxx"
            autoComplete="off"
          />
          <div style={{ marginTop: '12px' }}>
            <button
              style={s.btn('primary')}
              onClick={handleVerifyToken}
              disabled={loading}
              type="button"
            >
              {loading ? LABELS.loading : LABELS.verifyToken}
            </button>
          </div>

          {banner && (
            <div style={banner.type === 'error' ? s.error : s.success}>
              {banner.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Authenticated layout ---------- */
  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>{LABELS.title}</h1>
          <div style={s.subtitle}>
            {LABELS.welcome} {supplier ? (supplier.nameHe || supplier.name || '') : ''} ·{' '}
            {LABELS.subtitle}
          </div>
        </div>
        <button style={s.btn('secondary')} onClick={handleLogout} type="button">
          {LABELS.logout}
        </button>
      </div>

      <div style={s.layout}>
        <nav style={s.nav}>
          {Object.entries(LABELS.menu).map(([key, label]) => (
            <button
              key={key}
              type="button"
              style={s.navBtn(view === key)}
              onClick={() => { clearBanner(); setView(key); }}
            >
              {label}
            </button>
          ))}
        </nav>

        <section style={s.panel}>
          {banner && (
            <div style={banner.type === 'error' ? s.error : s.success}>
              {banner.text}
            </div>
          )}

          {view === 'overview' && (
            <>
              <div style={s.panelTitle}>{LABELS.menu.overview}</div>
              <div style={{ fontSize: '13px', color: palette.textDim }}>
                {LABELS.openPOs}: <strong style={{ color: palette.text }}>{pos.length}</strong>
              </div>
            </>
          )}

          {view === 'pos' && (
            <>
              <div style={s.panelTitle}>{LABELS.openPOs}</div>
              {pos.length === 0 ? (
                <div style={{ color: palette.textDim }}>{LABELS.noPOs}</div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>{LABELS.poNumber}</th>
                      <th style={s.th}>{LABELS.poDate}</th>
                      <th style={s.th}>{LABELS.poTotal}</th>
                      <th style={s.th}>{LABELS.poStatus}</th>
                      <th style={s.th}>{LABELS.promiseDate}</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map((po) => (
                      <tr key={po.id}>
                        <td style={s.td}>{po.poNumber || po.id}</td>
                        <td style={s.td}>{po.orderDate || ''}</td>
                        <td style={s.td}>{po.total} {po.currency || ''}</td>
                        <td style={s.td}>
                          <span style={s.statusBadge(po.status)}>{po.status}</span>
                        </td>
                        <td style={s.td}>
                          <input
                            style={{ ...s.input, width: '140px' }}
                            type="date"
                            value={ackState[po.id] || ''}
                            onChange={(e) =>
                              setAckState((p) => ({ ...p, [po.id]: e.target.value }))
                            }
                          />
                        </td>
                        <td style={s.td}>
                          <button
                            type="button"
                            style={s.btn('primary')}
                            onClick={() => handleAcknowledge(po.id)}
                          >
                            {LABELS.acknowledge}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {view === 'asn' && (
            <form onSubmit={handleASNSubmit}>
              <div style={s.panelTitle}>{LABELS.submitASN}</div>
              <label style={s.label}>{LABELS.poNumber}</label>
              <input
                style={s.input}
                value={asnForm.poId}
                onChange={(e) => setAsnForm({ ...asnForm, poId: e.target.value })}
              />
              <label style={s.label}>{LABELS.shippedAt}</label>
              <input
                style={s.input}
                type="date"
                value={asnForm.shippedAt}
                onChange={(e) => setAsnForm({ ...asnForm, shippedAt: e.target.value })}
              />
              <label style={s.label}>{LABELS.carrier}</label>
              <input
                style={s.input}
                value={asnForm.carrier}
                onChange={(e) => setAsnForm({ ...asnForm, carrier: e.target.value })}
              />
              <label style={s.label}>{LABELS.tracking}</label>
              <input
                style={s.input}
                value={asnForm.trackingNumber}
                onChange={(e) => setAsnForm({ ...asnForm, trackingNumber: e.target.value })}
              />
              <div style={{ marginTop: '16px' }}>
                <button type="submit" style={s.btn('primary')}>{LABELS.submit}</button>
              </div>
            </form>
          )}

          {view === 'invoices' && (
            <form onSubmit={handleInvoiceSubmit}>
              <div style={s.panelTitle}>{LABELS.submitInvoice}</div>
              <label style={s.label}>{LABELS.poNumber}</label>
              <input
                style={s.input}
                value={invoiceForm.poId}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, poId: e.target.value })}
              />
              <label style={s.label}>{LABELS.invoiceNumber}</label>
              <input
                style={s.input}
                value={invoiceForm.invoiceNumber}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
              />
              <label style={s.label}>{LABELS.amount}</label>
              <input
                style={s.input}
                type="number"
                value={invoiceForm.amount}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
              />
              <label style={s.label}>{LABELS.currency}</label>
              <input
                style={s.input}
                maxLength={3}
                value={invoiceForm.currency}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
              />
              <label style={s.label}>{LABELS.issuedAt}</label>
              <input
                style={s.input}
                type="date"
                value={invoiceForm.issuedAt}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, issuedAt: e.target.value })}
              />
              <div style={{ marginTop: '16px' }}>
                <button type="submit" style={s.btn('primary')}>{LABELS.submit}</button>
              </div>
            </form>
          )}

          {view === 'payments' && (
            <>
              <div style={s.panelTitle}>{LABELS.paymentHistory}</div>
              {payments.length === 0 ? (
                <div style={{ color: palette.textDim }}>{LABELS.empty}</div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>{LABELS.paidAt}</th>
                      <th style={s.th}>{LABELS.reference}</th>
                      <th style={s.th}>{LABELS.amount}</th>
                      <th style={s.th}>{LABELS.poNumber}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td style={s.td}>{p.paidAt}</td>
                        <td style={s.td}>{p.reference || p.id}</td>
                        <td style={s.td}>{p.amount} {p.currency || ''}</td>
                        <td style={s.td}>{p.poId || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {view === 'contact' && (
            <>
              <div style={s.panelTitle}>{LABELS.updateContact}</div>
              {['contactName','phone','address','city','postalCode','country'].map((key) => (
                <React.Fragment key={key}>
                  <label style={s.label}>{LABELS[key]}</label>
                  <input
                    style={s.input}
                    value={contactForm[key] || ''}
                    onChange={(e) => setContactForm({ ...contactForm, [key]: e.target.value })}
                  />
                </React.Fragment>
              ))}
              <div style={{ marginTop: '16px' }}>
                <button type="button" style={s.btn('primary')} onClick={handleContactSave}>
                  {LABELS.save}
                </button>
              </div>
            </>
          )}

          {view === 'certs' && (
            <form onSubmit={handleCertSubmit}>
              <div style={s.panelTitle}>{LABELS.uploadCert}</div>
              <label style={s.label}>{LABELS.certType}</label>
              <input
                style={s.input}
                value={certForm.certType}
                onChange={(e) => setCertForm({ ...certForm, certType: e.target.value })}
                placeholder="ISO 9001"
              />
              <label style={s.label}>{LABELS.issuer}</label>
              <input
                style={s.input}
                value={certForm.issuer}
                onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
              />
              <label style={s.label}>{LABELS.validUntil}</label>
              <input
                style={s.input}
                type="date"
                value={certForm.validUntil}
                onChange={(e) => setCertForm({ ...certForm, validUntil: e.target.value })}
              />
              <label style={s.label}>{LABELS.file}</label>
              <input
                style={s.input}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.xml"
                onChange={(e) => onFileChange(e, setCertFile)}
              />
              <div style={s.hint}>{LABELS.filesLimit}</div>
              {certFile && (
                <div style={{ ...s.hint, color: palette.success }}>
                  {certFile.filename} ({Math.round(certFile.size / 1024)} KB)
                </div>
              )}
              <div style={{ marginTop: '16px' }}>
                <button type="submit" style={s.btn('primary')}>{LABELS.upload}</button>
              </div>
            </form>
          )}

          {view === 'tax' && (
            <form onSubmit={handleTaxSubmit}>
              <div style={s.panelTitle}>{LABELS.taxClarification}</div>
              <label style={s.label}>{LABELS.subject}</label>
              <input
                style={s.input}
                value={taxForm.subject}
                onChange={(e) => setTaxForm({ ...taxForm, subject: e.target.value })}
              />
              <label style={s.label}>{LABELS.message}</label>
              <textarea
                style={{ ...s.input, minHeight: '120px', resize: 'vertical' }}
                value={taxForm.message}
                onChange={(e) => setTaxForm({ ...taxForm, message: e.target.value })}
              />
              <label style={s.label}>{LABELS.requestedRate}</label>
              <input
                style={s.input}
                type="number"
                step="0.01"
                value={taxForm.requestedRate}
                onChange={(e) => setTaxForm({ ...taxForm, requestedRate: e.target.value })}
              />
              <div style={{ marginTop: '16px' }}>
                <button type="submit" style={s.btn('primary')}>{LABELS.submit}</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

export { PALANTIR_DARK, PALANTIR_LIGHT, LABELS as SUPPLIER_PORTAL_LABELS };
