/**
 * ExpenseSubmit.jsx — מסך הגשת דו"ח הוצאות עובד
 * Agent X-26 (Swarm 3B) — 2026-04-11
 *
 * Mobile-first, Hebrew RTL bilingual expense-submission UI for
 * Techno-Kol Uzi. Zero dependencies beyond React. Pure inline styles
 * (Palantir-dark theme, matching AuditTrail / BIDashboard in this
 * package) so the component stays portable between Vite, Next.js and
 * React-Native-Web shells.
 *
 * Wires into the backend facade exported by
 *   onyx-procurement/src/expenses/expense-manager.js
 * but the backend is injected through an `api` prop — the component
 * never imports it directly, so tests can pass a fake and the
 * payroll-autonomous bundle stays stand-alone.
 *
 * Props:
 *   api       : {
 *                 createReport, addLine, listReports, getReport,
 *                 submitReport, attachReceipt, runOcr,
 *                 autoCategorize, computeReimbursement, validatePolicy,
 *                 CATEGORIES, STATUS
 *               }
 *   employeeId: string — current user
 *   onSubmit  : optional callback after successful submit
 *   theme     : 'dark' (default) | 'light'
 *
 * Features mirrored from the backend spec:
 *   1. Receipt upload       — file input + camera capture hook
 *   2. OCR hook             — calls api.runOcr(report, line)
 *   3. VAT auto-split       — shows net / VAT / gross per line
 *   4. Mileage calculator   — ₪/km by engine size
 *   5. Per-diem builder     — travel days + daily cap
 *   6. Multi-currency       — auto-converts to ILS at line date
 *   7. Duplicate hint       — via api.findDuplicates
 *   8. Policy violations    — running warnings panel
 *   9. Auto-categorize      — on description blur
 *  10. Export PDF           — calls api.exportPdf and shows path
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
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
};

const LIGHT = {
  bg: '#f5f7fa',
  panel: '#ffffff',
  panelAlt: '#f0f3f7',
  border: '#d6dbe3',
  borderSoft: '#e4e8ee',
  accent: '#1f6feb',
  accentSoft: 'rgba(31,111,235,0.12)',
  text: '#1a1f27',
  textDim: '#5a6472',
  textMuted: '#8b95a5',
  info: '#1f6feb',
  warn: '#d47c00',
  critical: '#c72c2c',
  success: '#2aa868',
  rowHover: '#e9eef5',
};

/* ------------------------------------------------------------------ */
/*  Hebrew labels                                                      */
/* ------------------------------------------------------------------ */

const HE = {
  title: 'הגשת דו"ח הוצאות',
  titleEn: 'Submit Expense Report',
  reportTitle: 'כותרת הדו"ח',
  reportTitlePh: 'למשל: נסיעה חיפה 12/04',
  periodFrom: 'מתאריך',
  periodTo: 'עד תאריך',
  newReport: 'דו"ח חדש',
  addLine: 'הוסף שורה',
  category: 'קטגוריה',
  date: 'תאריך',
  description: 'תיאור',
  descriptionPh: 'פרט את ההוצאה (יאתר קטגוריה אוטומטית)',
  amount: 'סכום',
  currency: 'מטבע',
  vendor: 'ספק',
  vendorPh: 'שם העסק / קבלה',
  vatRate: 'שיעור מע"מ',
  hasTaxInvoice: 'יש חשבונית מס',
  receipt: 'קבלה',
  uploadReceipt: 'העלה קבלה',
  camera: 'צלם קבלה',
  runOcr: 'סרוק OCR',
  mileage: 'נסועה',
  km: 'ק"מ',
  engineCc: 'נפח מנוע (סמ"ק)',
  perDiem: 'אש"ל לימי עבודה',
  perDiemDays: 'מספר ימים',
  abroadTrip: 'נסיעה לחו"ל',
  net: 'נטו',
  vat: 'מע"מ',
  gross: 'ברוטו',
  ils: '₪',
  runningTotal: 'סה"כ עד כה',
  submit: 'שלח לאישור',
  save: 'שמור טיוטה',
  exportPdf: 'ייצוא PDF',
  violations: 'חריגות מדיניות',
  duplicates: 'נמצאה כפילות אפשרית',
  empty: 'אין שורות — הוסף הוצאה ראשונה',
  mandatory: 'שדה חובה',
  statusDraft: 'טיוטה',
  statusSubmitted: 'הוגש',
  statusApproved: 'אושר',
  statusRejected: 'נדחה',
  statusReimbursed: 'שולם',
  lines: 'שורות',
  remove: 'הסר',
  cancel: 'ביטול',
  ok: 'אישור',
  sendForApproval: 'שלח לאישור מנהל',
  addAnother: 'הוסף עוד שורה',
  categoryAuto: 'אותר אוטומטית',
  ocrConfidence: 'ביטחון OCR',
  policyOk: 'אין חריגות — מוכן להגשה',
  processing: 'שומר…',
  pdfReady: 'קובץ PDF הופק',
  backToDraft: 'חזור לטיוטה',
};

/* ------------------------------------------------------------------ */
/*  Minimal fallback for categories (if api.CATEGORIES missing)        */
/* ------------------------------------------------------------------ */

const FALLBACK_CATEGORIES = {
  meals:       { id: 'meals',       he: 'אש"ל',    en: 'Meals' },
  fuel:        { id: 'fuel',        he: 'דלק',      en: 'Fuel' },
  travel:      { id: 'travel',      he: 'נסיעות',   en: 'Travel' },
  lodging:     { id: 'lodging',     he: 'לינה',     en: 'Lodging' },
  equipment:   { id: 'equipment',   he: 'ציוד',     en: 'Equipment' },
  hospitality: { id: 'hospitality', he: 'כיבוד',    en: 'Hospitality' },
  donation:    { id: 'donation',    he: 'תרומה',    en: 'Donation' },
  other:       { id: 'other',       he: 'אחר',      en: 'Other' },
};

const DEFAULT_POLICY_FOR_UI = {
  meals: { dailyCapIls: 150 },
  lodging: { localNightCapIls: 600, abroadNightCapIls: 1200 },
  mileage: {
    smallEngineRate: 2.50,
    largeEngineRate: 3.00,
    engineCutoffCc: 1600,
  },
  perDiem: { localDailyIls: 200, abroadDailyIls: 450, maxDays: 60 },
};

/* ------------------------------------------------------------------ */
/*  Small shared helpers                                               */
/* ------------------------------------------------------------------ */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const splitVat = (gross, rate) => {
  const r = Number(rate) || 0;
  if (r === 0) return { net: round2(gross), vat: 0 };
  const net = round2(gross / (1 + r));
  return { net, vat: round2(gross - net) };
};

const statusLabel = (s) => {
  switch (s) {
    case 'draft':      return HE.statusDraft;
    case 'submitted':  return HE.statusSubmitted;
    case 'approved':   return HE.statusApproved;
    case 'rejected':   return HE.statusRejected;
    case 'reimbursed': return HE.statusReimbursed;
    default:           return s || '';
  }
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ExpenseSubmit(props) {
  const {
    api,
    employeeId = 'emp_current',
    onSubmit,
    theme = 'dark',
  } = props || {};

  const T = theme === 'light' ? LIGHT : PALANTIR_DARK;
  const CATEGORIES = (api && api.CATEGORIES) || FALLBACK_CATEGORIES;
  const CAT_KEYS = Object.keys(CATEGORIES);

  /* ------------- state ----------------------------------------- */
  const [report, setReport] = useState(null); // backend report obj
  const [reportTitle, setReportTitle] = useState('');
  const [periodFrom, setPeriodFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [periodTo, setPeriodTo] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState([]);     // local working copies
  const [violations, setViolations] = useState([]);
  const [duplicates, setDuplicates] = useState({}); // lineIndex → []
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pdfPath, setPdfPath] = useState(null);
  const [draft, setDraft] = useState(makeBlankLine());

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  /* ------------- derived totals -------------------------------- */
  const totals = useMemo(() => {
    let gross = 0;
    let vat = 0;
    for (const l of lines) {
      const g = Number(l.amount_ils || l.amount || 0);
      gross += g;
      const split = splitVat(Number(l.amount || 0), l.vat_rate);
      if (l.has_tax_invoice && (CATEGORIES[l.category]?.tax?.vatDeductible)) {
        vat += Number(l.vat_ils || split.vat || 0);
      }
    }
    gross = round2(gross);
    vat = round2(vat);
    return { gross, vat, net: round2(gross - vat) };
  }, [lines, CATEGORIES]);

  /* ------------- effects: validate on change ------------------- */
  useEffect(() => {
    if (!api || typeof api.validatePolicy !== 'function') {
      setViolations(clientSideValidate(lines));
      return;
    }
    if (!report) {
      setViolations(clientSideValidate(lines));
      return;
    }
    try {
      const v = api.validatePolicy(report.id);
      setViolations(v || []);
    } catch (_) {
      setViolations(clientSideValidate(lines));
    }
  }, [lines, report, api]);

  /* ------------- handlers -------------------------------------- */

  const ensureReport = useCallback(() => {
    if (report) return report;
    if (!api || typeof api.createReport !== 'function') {
      // Local stub report object (test/offline mode)
      const rep = {
        id: `rep_local_${Date.now()}`,
        employee_id: employeeId,
        title: reportTitle || 'טיוטה',
        period: { from: periodFrom, to: periodTo },
        status: 'draft',
        lines: [],
      };
      setReport(rep);
      return rep;
    }
    const rep = api.createReport(
      employeeId,
      reportTitle || 'טיוטה',
      { from: periodFrom, to: periodTo }
    );
    setReport(rep);
    return rep;
  }, [api, report, employeeId, reportTitle, periodFrom, periodTo]);

  const handleDescriptionBlur = useCallback(() => {
    if (!draft.description) return;
    let cat = draft.category;
    if (!cat || cat === 'other') {
      if (api && typeof api.autoCategorize === 'function') {
        cat = api.autoCategorize(draft.description);
      } else {
        cat = autoCategorizeLocal(draft.description);
      }
      setDraft((d) => ({ ...d, category: cat, categoryAuto: true }));
    }
  }, [draft, api]);

  const handleAddLine = useCallback(() => {
    setError(null);
    if (!draft.description) { setError(HE.mandatory + ': ' + HE.description); return; }
    if (!(Number(draft.amount) >= 0)) { setError(HE.mandatory + ': ' + HE.amount); return; }

    const rep = ensureReport();
    const lineObj = {
      date: draft.date,
      category: draft.category || 'other',
      description: draft.description,
      amount: Number(draft.amount),
      currency: draft.currency || 'ILS',
      vendor: draft.vendor || null,
      vat_rate: Number(draft.vat_rate != null ? draft.vat_rate : 0.17),
      has_tax_invoice: !!draft.has_tax_invoice,
      mileage: draft.mileage && draft.mileage.km ? draft.mileage : null,
      abroad: !!draft.abroad,
      receipt_ref: draft.receipt_ref || null,
    };

    let added;
    try {
      if (api && typeof api.addLine === 'function') {
        added = api.addLine(rep.id, lineObj);
      } else {
        // local stub
        const split = splitVat(lineObj.amount, lineObj.vat_rate);
        added = {
          id: `ln_local_${Date.now()}`,
          report_id: rep.id,
          ...lineObj,
          amount_ils: lineObj.currency === 'ILS' ? lineObj.amount : lineObj.amount * 3.65,
          vat: split.vat,
          vat_ils: split.vat,
          created_at: new Date().toISOString(),
        };
      }
    } catch (e) {
      setError((e && e.message) || String(e));
      return;
    }
    setLines((cur) => cur.concat(added));
    setDraft(makeBlankLine());

    // Duplicate check
    if (api && typeof api.findDuplicates === 'function') {
      try {
        const dups = api.findDuplicates(employeeId, added);
        if (dups && dups.length) {
          setDuplicates((cur) => ({ ...cur, [added.id]: dups }));
        }
      } catch (_) { /* ignore */ }
    }
  }, [api, draft, ensureReport, employeeId]);

  const handleRemoveLineLocal = useCallback((idx) => {
    // Never deletes the backend line — just hides from local UI draft
    setLines((cur) => cur.filter((_, i) => i !== idx));
  }, []);

  const handleReceiptUpload = useCallback((e, source) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const filePath = file.path || file.name;
    setDraft((d) => ({ ...d, receipt_ref: filePath, receipt_source: source }));
  }, []);

  const handleRunOcr = useCallback(async () => {
    if (!draft.receipt_ref) {
      setError('העלה קבלה תחילה / Upload a receipt first');
      return;
    }
    if (!api || typeof api.runOcr !== 'function') {
      setError('OCR not wired');
      return;
    }
    const rep = ensureReport();
    try {
      setBusy(true);
      // Need a line to attach OCR to — spawn a scratch line first
      const tmp = api.addLine(rep.id, {
        date: draft.date,
        category: draft.category || 'other',
        description: draft.description || '(OCR scan)',
        amount: Number(draft.amount || 0),
        currency: draft.currency || 'ILS',
        vendor: draft.vendor || null,
        vat_rate: 0.17,
        receipt_ref: draft.receipt_ref,
      });
      const { extracted, confidence } = api.runOcr(rep.id, tmp.id);
      if (extracted) {
        setDraft((d) => ({
          ...d,
          vendor: extracted.vendor || d.vendor,
          amount: extracted.total != null ? extracted.total : d.amount,
          currency: extracted.currency || d.currency,
          vat_rate: extracted.vat_rate != null ? extracted.vat_rate : d.vat_rate,
          _ocrConfidence: confidence,
        }));
      }
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, draft, ensureReport]);

  const handleAddPerDiem = useCallback((days, abroad) => {
    setError(null);
    const pol = DEFAULT_POLICY_FOR_UI.perDiem;
    const rate = abroad ? pol.abroadDailyIls : pol.localDailyIls;
    const n = Math.max(0, Math.min(Number(days) || 0, pol.maxDays));
    if (n <= 0) { setError('מספר ימים לא תקין'); return; }
    const total = round2(n * rate);
    const rep = ensureReport();
    const line = {
      date: new Date().toISOString().slice(0, 10),
      category: 'meals',
      description: `אש"ל ${n} ימים × ${rate}₪${abroad ? ' (חו"ל)' : ''}`,
      amount: total,
      currency: 'ILS',
      abroad: !!abroad,
      vat_rate: 0,
      has_tax_invoice: false,
    };
    let added;
    try {
      added = api && api.addLine
        ? api.addLine(rep.id, line)
        : { id: `ln_local_${Date.now()}`, ...line, amount_ils: total, vat: 0, vat_ils: 0 };
    } catch (e) {
      setError((e && e.message) || String(e));
      return;
    }
    setLines((cur) => cur.concat(added));
  }, [api, ensureReport]);

  const handleAddMileageLine = useCallback((km, engineCc) => {
    setError(null);
    const pol = DEFAULT_POLICY_FOR_UI.mileage;
    const n = Math.max(0, Number(km) || 0);
    if (n <= 0) { setError('ק"מ לא תקין'); return; }
    const rate = (Number(engineCc) || 1400) > pol.engineCutoffCc
      ? pol.largeEngineRate
      : pol.smallEngineRate;
    const total = round2(n * rate);
    const rep = ensureReport();
    const line = {
      date: new Date().toISOString().slice(0, 10),
      category: 'fuel',
      description: `נסועה ${n} ק"מ × ${rate}₪`,
      amount: total,
      currency: 'ILS',
      mileage: { km: n, engine_cc: Number(engineCc) || 1400 },
      vat_rate: 0,
      has_tax_invoice: false,
    };
    let added;
    try {
      added = api && api.addLine
        ? api.addLine(rep.id, line)
        : { id: `ln_local_${Date.now()}`, ...line, amount_ils: total, vat: 0, vat_ils: 0 };
    } catch (e) {
      setError((e && e.message) || String(e));
      return;
    }
    setLines((cur) => cur.concat(added));
  }, [api, ensureReport]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!report || lines.length === 0) {
      setError(HE.empty);
      return;
    }
    if (!api || typeof api.submitReport !== 'function') {
      setError('Backend missing submitReport');
      return;
    }
    try {
      setBusy(true);
      const updated = api.submitReport(report.id);
      setReport(updated);
      if (typeof onSubmit === 'function') onSubmit(updated);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, report, lines, onSubmit]);

  const handleExportPdf = useCallback(() => {
    if (!api || typeof api.exportPdf !== 'function' || !report) return;
    try {
      const res = api.exportPdf(report.id);
      setPdfPath(res && res.path);
    } catch (e) {
      setError((e && e.message) || String(e));
    }
  }, [api, report]);

  /* ------------- styles ---------------------------------------- */
  const st = stylesFor(T);

  /* ------------- render ---------------------------------------- */
  return (
    <div dir="rtl" lang="he" style={st.page}>
      <header style={st.header}>
        <div style={st.titleBar}>
          <div>
            <h1 style={st.title}>{HE.title}</h1>
            <div style={st.subtitle}>{HE.titleEn}</div>
          </div>
          {report && (
            <span style={{ ...st.badge, ...badgeColorFor(T, report.status) }}>
              {statusLabel(report.status)}
            </span>
          )}
        </div>
      </header>

      {/* Report meta */}
      <section style={st.card}>
        <label style={st.label}>
          {HE.reportTitle}
          <input
            type="text"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder={HE.reportTitlePh}
            style={st.input}
            dir="rtl"
          />
        </label>
        <div style={st.row2}>
          <label style={st.label}>
            {HE.periodFrom}
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              style={st.input}
            />
          </label>
          <label style={st.label}>
            {HE.periodTo}
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              style={st.input}
            />
          </label>
        </div>
      </section>

      {/* Draft line form */}
      <section style={st.card}>
        <div style={st.sectionHeader}>{HE.addLine}</div>

        <label style={st.label}>
          {HE.description}
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            onBlur={handleDescriptionBlur}
            placeholder={HE.descriptionPh}
            style={st.input}
            dir="rtl"
          />
        </label>

        <div style={st.row2}>
          <label style={st.label}>
            {HE.category}
            {draft.categoryAuto && (
              <span style={st.autoTag}>{HE.categoryAuto}</span>
            )}
            <select
              value={draft.category || ''}
              onChange={(e) => setDraft({
                ...draft, category: e.target.value, categoryAuto: false,
              })}
              style={st.input}
              dir="rtl"
            >
              <option value="">—</option>
              {CAT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORIES[k].he} / {CATEGORIES[k].en}
                </option>
              ))}
            </select>
          </label>
          <label style={st.label}>
            {HE.date}
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              style={st.input}
            />
          </label>
        </div>

        <div style={st.row2}>
          <label style={st.label}>
            {HE.amount}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              style={st.input}
            />
          </label>
          <label style={st.label}>
            {HE.currency}
            <select
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              style={st.input}
            >
              <option value="ILS">ILS ₪</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
              <option value="GBP">GBP £</option>
            </select>
          </label>
        </div>

        <label style={st.label}>
          {HE.vendor}
          <input
            type="text"
            value={draft.vendor}
            onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
            placeholder={HE.vendorPh}
            style={st.input}
            dir="rtl"
          />
        </label>

        <div style={st.row2}>
          <label style={st.label}>
            {HE.vatRate}
            <select
              value={String(draft.vat_rate)}
              onChange={(e) => setDraft({ ...draft, vat_rate: Number(e.target.value) })}
              style={st.input}
            >
              <option value="0.17">17%</option>
              <option value="0">0% / פטור</option>
            </select>
          </label>
          <label style={{ ...st.label, ...st.checkboxLabel }}>
            <input
              type="checkbox"
              checked={!!draft.has_tax_invoice}
              onChange={(e) => setDraft({ ...draft, has_tax_invoice: e.target.checked })}
              style={{ marginLeft: 8 }}
            />
            {HE.hasTaxInvoice}
          </label>
        </div>

        {/* Receipt upload row */}
        <div style={st.receiptRow}>
          <button type="button" style={st.secondaryBtn} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            {HE.uploadReceipt}
          </button>
          <button type="button" style={st.secondaryBtn} onClick={() => cameraInputRef.current && cameraInputRef.current.click()}>
            {HE.camera}
          </button>
          <button type="button" style={st.secondaryBtn} disabled={!draft.receipt_ref} onClick={handleRunOcr}>
            {HE.runOcr}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleReceiptUpload(e, 'file')}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => handleReceiptUpload(e, 'camera')}
          />
        </div>
        {draft.receipt_ref && (
          <div style={st.receiptPath}>
            {HE.receipt}: {draft.receipt_ref}
            {draft._ocrConfidence != null && (
              <span style={st.confidence}>
                {' '}• {HE.ocrConfidence}: {Math.round((draft._ocrConfidence || 0) * 100)}%
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          style={st.primaryBtn}
          disabled={busy}
          onClick={handleAddLine}
        >
          {HE.addLine}
        </button>

        {error && <div style={st.errorBox}>{error}</div>}
      </section>

      {/* Quick-add: per-diem + mileage */}
      <section style={st.card}>
        <div style={st.sectionHeader}>{HE.perDiem}</div>
        <PerDiemQuickAdd
          st={st}
          onAdd={handleAddPerDiem}
        />
      </section>
      <section style={st.card}>
        <div style={st.sectionHeader}>{HE.mileage}</div>
        <MileageQuickAdd
          st={st}
          onAdd={handleAddMileageLine}
        />
      </section>

      {/* Lines list */}
      <section style={st.card}>
        <div style={st.sectionHeader}>{HE.lines} ({lines.length})</div>
        {lines.length === 0 && <div style={st.empty}>{HE.empty}</div>}
        {lines.map((ln, idx) => {
          const cat = CATEGORIES[ln.category] || { he: ln.category, en: ln.category };
          const dup = duplicates[ln.id];
          return (
            <div key={ln.id || idx} style={st.lineCard}>
              <div style={st.lineHeader}>
                <span style={st.lineCat}>{cat.he} / {cat.en}</span>
                <span style={st.lineAmount}>
                  ₪{round2(ln.amount_ils || ln.amount)}
                </span>
              </div>
              <div style={st.lineMeta}>
                {ln.date} • {ln.vendor || '—'} • {ln.description}
              </div>
              {(ln.has_tax_invoice || Number(ln.vat_ils || ln.vat) > 0) && (
                <div style={st.vatSplit}>
                  {HE.net}: ₪{round2((ln.amount_ils || ln.amount) - (ln.vat_ils || ln.vat || 0))} •{' '}
                  {HE.vat}: ₪{round2(ln.vat_ils || ln.vat || 0)}
                </div>
              )}
              {ln.receipt_ref && (
                <div style={st.lineReceipt}>{HE.receipt}: {ln.receipt_ref}</div>
              )}
              {dup && dup.length > 0 && (
                <div style={st.dupWarn}>
                  {HE.duplicates} ({dup.length})
                </div>
              )}
              <button
                type="button"
                style={st.removeBtn}
                onClick={() => handleRemoveLineLocal(idx)}
              >
                {HE.remove}
              </button>
            </div>
          );
        })}
      </section>

      {/* Violations */}
      {violations.length > 0 && (
        <section style={{ ...st.card, ...st.warnCard }}>
          <div style={st.sectionHeader}>{HE.violations}</div>
          <ul style={st.violationList}>
            {violations.map((v, i) => (
              <li key={i} style={v.severity === 'error' ? st.errorItem : st.warnItem}>
                {v.he} / {v.en}
              </li>
            ))}
          </ul>
        </section>
      )}
      {violations.length === 0 && lines.length > 0 && (
        <section style={{ ...st.card, ...st.okCard }}>
          <div>{HE.policyOk}</div>
        </section>
      )}

      {/* Running total + actions */}
      <footer style={st.footer}>
        <div style={st.totalLine}>
          <span>{HE.runningTotal}</span>
          <span style={st.totalAmount}>₪{totals.gross}</span>
        </div>
        <div style={st.totalSubLine}>
          {HE.net}: ₪{totals.net} • {HE.vat}: ₪{totals.vat}
        </div>
        <div style={st.actions}>
          <button
            type="button"
            style={st.primaryBtn}
            disabled={busy || lines.length === 0 || (report && report.status !== 'draft')}
            onClick={handleSubmit}
          >
            {busy ? HE.processing : HE.sendForApproval}
          </button>
          <button
            type="button"
            style={st.secondaryBtn}
            disabled={!report}
            onClick={handleExportPdf}
          >
            {HE.exportPdf}
          </button>
        </div>
        {pdfPath && (
          <div style={st.pdfReady}>
            {HE.pdfReady}: {pdfPath}
          </div>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PerDiemQuickAdd({ st, onAdd }) {
  const [days, setDays] = useState('');
  const [abroad, setAbroad] = useState(false);
  return (
    <div>
      <div style={st.row2}>
        <label style={st.label}>
          {HE.perDiemDays}
          <input
            type="number" min="0" step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            style={st.input}
          />
        </label>
        <label style={{ ...st.label, ...st.checkboxLabel }}>
          <input
            type="checkbox"
            checked={abroad}
            onChange={(e) => setAbroad(e.target.checked)}
            style={{ marginLeft: 8 }}
          />
          {HE.abroadTrip}
        </label>
      </div>
      <button
        type="button"
        style={st.secondaryBtn}
        onClick={() => { onAdd(days, abroad); setDays(''); }}
      >
        {HE.addLine}
      </button>
    </div>
  );
}

function MileageQuickAdd({ st, onAdd }) {
  const [km, setKm] = useState('');
  const [cc, setCc] = useState('1400');
  return (
    <div>
      <div style={st.row2}>
        <label style={st.label}>
          {HE.km}
          <input
            type="number" min="0" step="0.1"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            style={st.input}
          />
        </label>
        <label style={st.label}>
          {HE.engineCc}
          <input
            type="number" min="0" step="100"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            style={st.input}
          />
        </label>
      </div>
      <button
        type="button"
        style={st.secondaryBtn}
        onClick={() => { onAdd(km, cc); setKm(''); }}
      >
        {HE.addLine}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Local helpers                                                      */
/* ------------------------------------------------------------------ */

function makeBlankLine() {
  return {
    description: '',
    category: '',
    categoryAuto: false,
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    currency: 'ILS',
    vendor: '',
    vat_rate: 0.17,
    has_tax_invoice: false,
    receipt_ref: null,
    mileage: null,
    abroad: false,
  };
}

function autoCategorizeLocal(desc) {
  const s = String(desc || '').toLowerCase();
  const table = [
    { id: 'fuel',        kws: ['דלק','בנזין','פז','סונול','דור אלון','fuel','gas','petrol'] },
    { id: 'meals',       kws: ['אוכל','מסעדה','ארוחה','קפה','אש"ל','restaurant','lunch','dinner','food'] },
    { id: 'travel',      kws: ['מונית','רכבת','אוטובוס','טיסה','taxi','bus','train','flight'] },
    { id: 'lodging',     kws: ['מלון','לינה','צימר','hotel','lodging','airbnb'] },
    { id: 'equipment',   kws: ['ציוד','מחשב','מקלדת','hardware','laptop'] },
    { id: 'hospitality', kws: ['כיבוד','קייטרינג','catering','snacks'] },
    { id: 'donation',    kws: ['תרומה','46א','donation','charity'] },
  ];
  for (const row of table) {
    for (const kw of row.kws) {
      if (s.indexOf(kw.toLowerCase()) !== -1) return row.id;
    }
  }
  return 'other';
}

function clientSideValidate(lines) {
  const out = [];
  // Aggregate meals
  const mealsByDate = {};
  for (const l of lines) {
    const amt = Number(l.amount_ils || l.amount || 0);
    if (l.category === 'meals' && l.date) {
      mealsByDate[l.date] = (mealsByDate[l.date] || 0) + amt;
    }
    if (l.category === 'lodging') {
      const cap = l.abroad ? 1200 : 600;
      if (amt > cap) {
        out.push({
          line_id: l.id, severity: 'warn', code: 'LODGING_OVER_CAP',
          he: `לינה מעל התקרה (${cap} ₪/לילה)`,
          en: `Lodging above cap (₪${cap}/night)`,
        });
      }
    }
    if (l.category === 'donation' && !(l.meta && l.meta.receipt46a)) {
      out.push({
        line_id: l.id, severity: 'error', code: 'DONATION_NO_46A',
        he: 'תרומה ללא אישור 46א',
        en: 'Donation missing 46A certificate',
      });
    }
  }
  for (const d of Object.keys(mealsByDate)) {
    if (mealsByDate[d] > 150) {
      out.push({
        severity: 'warn', code: 'MEALS_OVER_DAILY_CAP',
        he: `אש"ל מעל התקרה היומית (150 ₪)`,
        en: 'Meals above daily cap (₪150)',
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

function stylesFor(T) {
  return {
    page: {
      direction: 'rtl',
      fontFamily: '"Segoe UI","Arial Hebrew","Helvetica Neue",sans-serif',
      background: T.bg,
      color: T.text,
      minHeight: '100vh',
      padding: '12px 14px 120px',
      boxSizing: 'border-box',
      maxWidth: 760,
      margin: '0 auto',
    },
    header: { marginBottom: 12 },
    titleBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    title: { margin: 0, fontSize: 22, fontWeight: 600 },
    subtitle: { fontSize: 12, color: T.textDim, marginTop: 2 },
    badge: {
      fontSize: 12,
      padding: '4px 10px',
      borderRadius: 999,
      border: `1px solid ${T.border}`,
      background: T.panelAlt,
    },
    card: {
      background: T.panel,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
      boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
    },
    warnCard: { borderColor: T.warn },
    okCard: { borderColor: T.success, color: T.success },
    sectionHeader: {
      fontSize: 14,
      fontWeight: 600,
      marginBottom: 8,
      color: T.textDim,
    },
    label: {
      display: 'flex',
      flexDirection: 'column',
      fontSize: 12,
      color: T.textDim,
      marginBottom: 8,
      flex: 1,
    },
    input: {
      marginTop: 4,
      background: T.panelAlt,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      color: T.text,
      padding: '8px 10px',
      fontSize: 14,
      fontFamily: 'inherit',
      direction: 'rtl',
    },
    row2: { display: 'flex', gap: 8, flexDirection: 'row' },
    checkboxLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 18,
    },
    autoTag: {
      fontSize: 10,
      color: T.accent,
      marginRight: 6,
    },
    receiptRow: { display: 'flex', gap: 6, margin: '8px 0' },
    receiptPath: { fontSize: 11, color: T.textDim, marginBottom: 8, wordBreak: 'break-all' },
    confidence: { color: T.accent },
    primaryBtn: {
      width: '100%',
      background: T.accent,
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      padding: '12px 14px',
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      marginTop: 6,
    },
    secondaryBtn: {
      background: T.panelAlt,
      color: T.text,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: '10px 12px',
      fontSize: 13,
      cursor: 'pointer',
      flex: 1,
    },
    removeBtn: {
      background: 'transparent',
      color: T.critical,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 12,
      cursor: 'pointer',
      marginTop: 6,
    },
    errorBox: {
      marginTop: 8,
      background: 'rgba(255,92,92,0.12)',
      border: `1px solid ${T.critical}`,
      color: T.critical,
      padding: '8px 10px',
      borderRadius: 6,
      fontSize: 13,
    },
    empty: { color: T.textMuted, fontSize: 13, textAlign: 'center', padding: 8 },
    lineCard: {
      background: T.panelAlt,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
    },
    lineHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    lineCat: { fontSize: 12, color: T.accent, fontWeight: 600 },
    lineAmount: { fontSize: 15, fontWeight: 600 },
    lineMeta: { fontSize: 12, color: T.textDim, marginTop: 2 },
    vatSplit: { fontSize: 11, color: T.textMuted, marginTop: 4 },
    lineReceipt: { fontSize: 11, color: T.info, marginTop: 4, wordBreak: 'break-all' },
    dupWarn: {
      fontSize: 11,
      color: T.warn,
      marginTop: 4,
      padding: '4px 6px',
      background: 'rgba(245,166,35,0.12)',
      borderRadius: 4,
    },
    violationList: { margin: 0, paddingInlineStart: 18 },
    warnItem: { color: T.warn, fontSize: 12, marginBottom: 2 },
    errorItem: { color: T.critical, fontSize: 12, marginBottom: 2 },
    footer: {
      position: 'sticky',
      bottom: 0,
      background: T.panel,
      borderTop: `1px solid ${T.border}`,
      padding: 12,
      marginTop: 12,
      borderRadius: 10,
    },
    totalLine: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 14,
      color: T.textDim,
    },
    totalAmount: { fontSize: 22, color: T.text, fontWeight: 700 },
    totalSubLine: { fontSize: 11, color: T.textMuted, marginTop: 2 },
    actions: { display: 'flex', gap: 8, marginTop: 10 },
    pdfReady: {
      fontSize: 11, color: T.success, marginTop: 8, wordBreak: 'break-all',
    },
  };
}

function badgeColorFor(T, status) {
  switch (status) {
    case 'approved':   return { color: T.success, borderColor: T.success };
    case 'rejected':   return { color: T.critical, borderColor: T.critical };
    case 'submitted':  return { color: T.info, borderColor: T.info };
    case 'reimbursed': return { color: T.accent, borderColor: T.accent };
    default:           return { color: T.textDim };
  }
}

/* Named export for testing convenience */
export {
  PerDiemQuickAdd,
  MileageQuickAdd,
  autoCategorizeLocal,
  clientSideValidate,
  splitVat,
  round2,
};
