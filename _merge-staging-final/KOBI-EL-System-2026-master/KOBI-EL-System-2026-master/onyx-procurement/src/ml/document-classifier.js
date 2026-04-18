/**
 * Smart Document Classifier — Israeli Business Documents
 * ────────────────────────────────────────────────────────
 *
 *  Agent X-01 — Swarm 3 (advanced features) — Techno-Kol Uzi Mega-ERP
 *
 *  Identifies the type of an Israeli business document from raw text
 *  (produced either by OCR or by direct extraction) using a zero-dep
 *  weighted keyword-scoring model.
 *
 *  Hebrew / English bilingual. Israeli compliance aware.
 *  No external dependencies. Pure Node.js.
 *
 *  Supported document types (20):
 *    - tax_invoice             — חשבונית מס
 *    - tax_invoice_receipt     — חשבונית מס/קבלה
 *    - receipt                 — קבלה בלבד
 *    - purchase_order          — הזמנת רכש
 *    - delivery_note           — תעודת משלוח
 *    - proforma                — חשבון עסקה / דרישת תשלום
 *    - wage_slip               — תלוש שכר
 *    - form_106                — טופס 106
 *    - form_161                — טופס 161
 *    - one_time_notice         — הודעה חד-פעמית
 *    - night_batch             — פלט ערב
 *    - quote                   — הצעת מחיר
 *    - financial_report        — דוח חשבונאי
 *    - pnl                     — דוח רווח והפסד
 *    - balance_sheet           — מאזן
 *    - bank_voucher            — פתקית בנק
 *    - contract                — חוזה
 *    - order                   — הזמנה
 *    - service_agreement       — הסכם שירות
 *    - opinion                 — חוות דעת
 *
 *  API:
 *    classify(text, opts?)       → [{type, type_he, confidence, keywords_matched, score}, ...]
 *    classifyBatch(documents[])  → [{id, predictions:[...]}, ...]
 *    getKeywords(type)           → { primary:[{kw,w}], secondary:[{kw,w}], negative:[{kw,w}] }
 *    getSupportedTypes()         → ['tax_invoice', ...]
 *    getTypeLabel(type)          → 'חשבונית מס'
 *
 *  Usage:
 *    const { classify } = require('./document-classifier');
 *    const preds = classify(ocrText);
 *    console.log(preds[0]); // top prediction
 *
 *  Author: Agent X-01
 *  Date:   2026-04-11
 */

'use strict';

// ────────────────────────────────────────────────────────────────────
// 0. Constants
// ────────────────────────────────────────────────────────────────────

/**
 * Relative weight of the "title-zone" position bonus.
 * Matches in the top 20% of the text get multiplied by this factor.
 */
const TITLE_ZONE_BONUS = 2.5;

/**
 * Size of the "title zone" as a fraction of total text length.
 */
const TITLE_ZONE_RATIO = 0.20;

/**
 * Minimum absolute score to be considered a real prediction.
 * Below this threshold, the type is dropped from results.
 */
const MIN_ABSOLUTE_SCORE = 0.5;

/**
 * Maximum number of predictions returned from classify().
 */
const DEFAULT_TOP_N = 3;

// ────────────────────────────────────────────────────────────────────
// 1. Keyword rule book
// ────────────────────────────────────────────────────────────────────
//
//  Each doc type has:
//    primary   — strong indicators; positional bonus applies
//    secondary — supporting evidence; weaker, but confirms context
//    negative  — anti-signals: if present they reduce the score
//
//  Weights are hand-tuned integers in the 1..12 range so the math is
//  fully deterministic (no floats from model weights).
// ────────────────────────────────────────────────────────────────────

const RULES = Object.freeze({

  tax_invoice: {
    label_he: 'חשבונית מס',
    label_en: 'Tax Invoice',
    primary: [
      { kw: 'חשבונית מס',        w: 12 },
      { kw: 'Tax Invoice',        w: 10 },
      { kw: 'חשבונית מספר',       w: 8 },
      { kw: 'מס\' חשבונית',        w: 7 },
      { kw: 'invoice no',         w: 6 },
    ],
    secondary: [
      { kw: 'עוסק מורשה',          w: 3 },
      { kw: 'מע"מ',                w: 2 },
      { kw: 'סה"כ לתשלום',         w: 2 },
      { kw: 'תעודת עוסק',          w: 2 },
      { kw: 'לכבוד',               w: 1 },
      { kw: 'פרטי הספק',            w: 1 },
      { kw: 'תאריך חשבונית',        w: 2 },
    ],
    negative: [
      { kw: 'קבלה',                w: 4 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'תעודת משלוח',          w: 5 },
      { kw: 'הצעת מחיר',            w: 4 },
      { kw: 'דרישת תשלום',          w: 3 },
      { kw: 'חשבונית מס/קבלה',      w: 6 },
    ],
  },

  tax_invoice_receipt: {
    label_he: 'חשבונית מס/קבלה',
    label_en: 'Tax Invoice Receipt',
    primary: [
      { kw: 'חשבונית מס/קבלה',     w: 12 },
      { kw: 'חשבונית מס קבלה',     w: 11 },
      { kw: 'חשבונית מס / קבלה',   w: 12 },
      { kw: 'Tax Invoice Receipt', w: 10 },
      { kw: 'חשבונית-קבלה',        w: 9 },
    ],
    secondary: [
      { kw: 'שולם במזומן',         w: 3 },
      { kw: 'שולם בהעברה',          w: 3 },
      { kw: 'אישור תשלום',          w: 3 },
      { kw: 'עוסק מורשה',          w: 2 },
      { kw: 'מע"מ',                w: 2 },
      { kw: 'סה"כ ששולם',           w: 3 },
    ],
    negative: [
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'הזמנת רכש',            w: 5 },
      { kw: 'תעודת משלוח',          w: 5 },
    ],
  },

  receipt: {
    label_he: 'קבלה בלבד',
    label_en: 'Receipt Only',
    primary: [
      { kw: 'קבלה מספר',            w: 10 },
      { kw: 'קבלה מס\'',             w: 10 },
      { kw: 'קבלה בלבד',            w: 11 },
      { kw: 'Receipt No',           w: 8 },
      { kw: 'Receipt #',            w: 7 },
    ],
    secondary: [
      { kw: 'שולם',                 w: 3 },
      { kw: 'התקבל',                w: 3 },
      { kw: 'במזומן',               w: 2 },
      { kw: 'בהעברה בנקאית',         w: 2 },
      { kw: 'בכרטיס אשראי',          w: 2 },
      { kw: 'אישור קבלה',           w: 3 },
      { kw: 'תודה',                 w: 1 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 7 },
      { kw: 'חשבונית מס/קבלה',      w: 10 },
      { kw: 'תלוש שכר',             w: 9 },
      { kw: 'תעודת משלוח',          w: 6 },
    ],
  },

  purchase_order: {
    label_he: 'הזמנת רכש',
    label_en: 'Purchase Order',
    primary: [
      { kw: 'הזמנת רכש',            w: 12 },
      { kw: 'Purchase Order',       w: 10 },
      { kw: 'הזמנת רכש מספר',       w: 9 },
      { kw: 'טופס הזמנת רכש',        w: 9 },
      { kw: 'PO#',                  w: 7 },
      { kw: 'PO No',                w: 7 },
    ],
    secondary: [
      { kw: 'ספק',                  w: 2 },
      { kw: 'תנאי תשלום',           w: 2 },
      { kw: 'מועד אספקה',           w: 3 },
      { kw: 'מבקש',                 w: 2 },
      { kw: 'מרכז עלות',            w: 2 },
      { kw: 'סכום הזמנה',            w: 2 },
    ],
    negative: [
      { kw: 'חשבונית',              w: 4 },
      { kw: 'תלוש שכר',             w: 9 },
      { kw: 'הצעת מחיר',            w: 3 },
      { kw: 'קבלה',                 w: 3 },
    ],
  },

  delivery_note: {
    label_he: 'תעודת משלוח',
    label_en: 'Delivery Note',
    primary: [
      { kw: 'תעודת משלוח',          w: 12 },
      { kw: 'תעודת-משלוח',          w: 11 },
      { kw: 'תעודת משלוח מספר',      w: 10 },
      { kw: 'Delivery Note',        w: 9 },
      { kw: 'Packing Slip',         w: 7 },
    ],
    secondary: [
      { kw: 'מקום מסירה',           w: 3 },
      { kw: 'נהג',                  w: 3 },
      { kw: 'רכב',                  w: 2 },
      { kw: 'חתימת המקבל',          w: 4 },
      { kw: 'יחידות',               w: 1 },
      { kw: 'כמות',                 w: 1 },
      { kw: 'פריט',                 w: 1 },
      { kw: 'אספקה',                w: 2 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תלוש שכר',             w: 9 },
      { kw: 'קבלה',                 w: 4 },
      { kw: 'הצעת מחיר',            w: 4 },
    ],
  },

  proforma: {
    label_he: 'חשבון עסקה',
    label_en: 'Proforma Invoice',
    primary: [
      { kw: 'חשבון עסקה',           w: 12 },
      { kw: 'חשבון עיסקה',          w: 11 },
      { kw: 'דרישת תשלום',          w: 9 },
      { kw: 'Proforma',             w: 9 },
      { kw: 'חשבון-עסקה',           w: 11 },
    ],
    secondary: [
      { kw: 'תוקף',                 w: 2 },
      { kw: 'הצעה',                 w: 2 },
      { kw: 'תנאי תשלום',           w: 2 },
      { kw: 'כתב-התחייבות',         w: 2 },
      { kw: 'מקדמה',                w: 3 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'קבלה',                 w: 4 },
      { kw: 'תלוש שכר',             w: 9 },
      { kw: 'תעודת משלוח',          w: 5 },
    ],
  },

  wage_slip: {
    label_he: 'תלוש שכר',
    label_en: 'Wage Slip',
    primary: [
      { kw: 'תלוש שכר',             w: 12 },
      { kw: 'תלוש משכורת',          w: 11 },
      { kw: 'ספח משכורת',           w: 10 },
      { kw: 'Pay Slip',             w: 9 },
      { kw: 'Payslip',              w: 9 },
    ],
    secondary: [
      { kw: 'ברוטו',                w: 2 },
      { kw: 'נטו',                  w: 2 },
      { kw: 'שכר יסוד',             w: 3 },
      { kw: 'ביטוח לאומי',          w: 4 },
      { kw: 'מס הכנסה',             w: 3 },
      { kw: 'פנסיה',                w: 3 },
      { kw: 'מס בריאות',            w: 3 },
      { kw: 'ימי עבודה',            w: 2 },
      { kw: 'שעות נוספות',          w: 2 },
      { kw: 'הבראה',                w: 2 },
      { kw: 'חופשה',                w: 1 },
      { kw: 'ימי מחלה',             w: 2 },
      { kw: 'קרן השתלמות',          w: 3 },
      { kw: 'תאריך תחילת עבודה',    w: 2 },
      { kw: 'נקודות זיכוי',          w: 3 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 9 },
      { kw: 'תעודת משלוח',          w: 7 },
      { kw: 'הזמנת רכש',            w: 6 },
      { kw: 'הצעת מחיר',            w: 6 },
      { kw: 'חוזה',                 w: 3 },
    ],
  },

  form_106: {
    label_he: 'טופס 106',
    label_en: 'Form 106 (Annual Employee Summary)',
    primary: [
      { kw: 'טופס 106',             w: 12 },
      { kw: 'טופס מספר 106',        w: 12 },
      { kw: '106 לשנת',             w: 11 },
      { kw: 'ריכוז שנתי לעובד',      w: 11 },
      { kw: 'Form 106',             w: 9 },
    ],
    secondary: [
      { kw: 'סה"כ שנתי',            w: 3 },
      { kw: 'שנת המס',              w: 3 },
      { kw: 'ניכוי מס',             w: 3 },
      { kw: 'ביטוח לאומי שנתי',      w: 3 },
      { kw: 'מעסיק',                w: 1 },
      { kw: 'עובד',                 w: 1 },
      { kw: 'ברוטו שנתי',           w: 3 },
    ],
    negative: [
      { kw: 'חשבונית',              w: 5 },
      { kw: 'תעודת משלוח',          w: 5 },
      { kw: 'הזמנת רכש',            w: 5 },
      { kw: 'קבלה',                 w: 3 },
    ],
  },

  form_161: {
    label_he: 'טופס 161',
    label_en: 'Form 161 (Separation Report)',
    primary: [
      { kw: 'טופס 161',             w: 12 },
      { kw: 'טופס מספר 161',        w: 12 },
      { kw: 'הודעה על פרישה',       w: 10 },
      { kw: 'הודעת מעביד על תשלום',  w: 10 },
      { kw: 'Form 161',             w: 9 },
    ],
    secondary: [
      { kw: 'פיצויי פיטורים',       w: 4 },
      { kw: 'פיצויים',              w: 3 },
      { kw: 'מענק פרישה',           w: 3 },
      { kw: 'סיום העסקה',           w: 3 },
      { kw: 'התחלת עבודה',          w: 2 },
      { kw: 'סיום עבודה',           w: 3 },
      { kw: 'מחלקת שכר',            w: 1 },
    ],
    negative: [
      { kw: 'חשבונית',              w: 5 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'הזמנת רכש',            w: 5 },
      { kw: 'הצעת מחיר',            w: 5 },
    ],
  },

  one_time_notice: {
    label_he: 'הודעה חד פעמית',
    label_en: 'One-Time Notice',
    primary: [
      { kw: 'הודעה חד פעמית',       w: 12 },
      { kw: 'הודעה חד-פעמית',       w: 12 },
      { kw: 'הודעה חד פעמי',        w: 10 },
      { kw: 'אירוע חד-פעמי',        w: 9 },
      { kw: 'One-Time Notice',      w: 8 },
    ],
    secondary: [
      { kw: 'חד פעמי',              w: 2 },
      { kw: 'התראה',                w: 2 },
      { kw: 'הודעה',                w: 1 },
      { kw: 'לא חוזר',              w: 2 },
    ],
    negative: [
      { kw: 'תלוש שכר',             w: 6 },
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'הזמנת רכש',            w: 5 },
    ],
  },

  night_batch: {
    label_he: 'פלט ערב',
    label_en: 'Night Batch Report',
    primary: [
      { kw: 'פלט ערב',              w: 12 },
      { kw: 'פלט לילה',             w: 10 },
      { kw: 'ריצת ערב',             w: 10 },
      { kw: 'דוח ריצה לילית',       w: 10 },
      { kw: 'Night Batch',          w: 8 },
      { kw: 'Nightly Run',          w: 7 },
    ],
    secondary: [
      { kw: 'סיכום יום',            w: 3 },
      { kw: 'אצווה',                w: 2 },
      { kw: 'batch id',             w: 3 },
      { kw: 'job id',               w: 2 },
      { kw: 'זמן התחלה',            w: 2 },
      { kw: 'זמן סיום',             w: 2 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 7 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'הזמנת רכש',            w: 6 },
      { kw: 'תעודת משלוח',          w: 5 },
    ],
  },

  quote: {
    label_he: 'הצעת מחיר',
    label_en: 'Quote',
    primary: [
      { kw: 'הצעת מחיר',            w: 12 },
      { kw: 'הצעת-מחיר',            w: 11 },
      { kw: 'Quote',                w: 8 },
      { kw: 'Quotation',            w: 9 },
      { kw: 'הצעה מסחרית',          w: 9 },
    ],
    secondary: [
      { kw: 'תוקף ההצעה',           w: 4 },
      { kw: 'תנאי תשלום',           w: 2 },
      { kw: 'הנחה',                 w: 2 },
      { kw: 'מחיר ליחידה',          w: 2 },
      { kw: 'לכבוד',                w: 1 },
      { kw: 'בכפוף',                w: 2 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'הזמנת רכש',            w: 4 },
      { kw: 'תלוש שכר',             w: 9 },
      { kw: 'קבלה',                 w: 3 },
    ],
  },

  financial_report: {
    label_he: 'דוח חשבונאי',
    label_en: 'Financial Report',
    primary: [
      { kw: 'דוח חשבונאי',          w: 11 },
      { kw: 'דו"ח חשבונאי',         w: 12 },
      { kw: 'דוח כספי',             w: 10 },
      { kw: 'דו"ח כספי',            w: 11 },
      { kw: 'דוחות כספיים',         w: 10 },
      { kw: 'Financial Report',     w: 9 },
    ],
    secondary: [
      { kw: 'רואה חשבון',           w: 3 },
      { kw: 'ביקורת',               w: 2 },
      { kw: 'הון',                  w: 2 },
      { kw: 'הכנסות',               w: 2 },
      { kw: 'הוצאות',               w: 2 },
      { kw: 'ברוטו',                w: 1 },
      { kw: 'חוות דעת רואה חשבון',   w: 3 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 5 },
      { kw: 'תלוש שכר',             w: 7 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'רווח והפסד',           w: 4 },
      { kw: 'מאזן בוחן',            w: 3 },
    ],
  },

  pnl: {
    label_he: 'דוח רווח והפסד',
    label_en: 'Profit and Loss',
    primary: [
      { kw: 'רווח והפסד',           w: 12 },
      { kw: 'דוח רווח והפסד',       w: 12 },
      { kw: 'דו"ח רווח והפסד',      w: 12 },
      { kw: 'P&L',                  w: 8 },
      { kw: 'Profit and Loss',      w: 9 },
    ],
    secondary: [
      { kw: 'הכנסות',               w: 3 },
      { kw: 'הוצאות',               w: 3 },
      { kw: 'רווח תפעולי',          w: 4 },
      { kw: 'רווח נקי',             w: 4 },
      { kw: 'רווח גולמי',           w: 4 },
      { kw: 'עלות המכר',            w: 4 },
    ],
    negative: [
      { kw: 'מאזן',                 w: 5 },
      { kw: 'חשבונית מס',           w: 5 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'תעודת משלוח',          w: 6 },
    ],
  },

  balance_sheet: {
    label_he: 'מאזן',
    label_en: 'Balance Sheet',
    primary: [
      { kw: 'מאזן',                 w: 12 },
      { kw: 'Balance Sheet',        w: 10 },
      { kw: 'מאזן בוחן',            w: 11 },
      { kw: 'מאזן חשבונות',         w: 10 },
      { kw: 'מאזן ליום',            w: 11 },
    ],
    secondary: [
      { kw: 'נכסים',                w: 3 },
      { kw: 'התחייבויות',           w: 3 },
      { kw: 'הון עצמי',             w: 4 },
      { kw: 'רכוש קבוע',            w: 3 },
      { kw: 'רכוש שוטף',            w: 3 },
      { kw: 'סך נכסים',             w: 3 },
    ],
    negative: [
      { kw: 'רווח והפסד',           w: 5 },
      { kw: 'חשבונית מס',           w: 5 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'תעודת משלוח',          w: 6 },
    ],
  },

  bank_voucher: {
    label_he: 'פתקית בנק',
    label_en: 'Bank Voucher',
    primary: [
      { kw: 'פתקית בנק',            w: 12 },
      { kw: 'פתק בנק',              w: 11 },
      { kw: 'אישור בנקאי',          w: 9 },
      { kw: 'Bank Voucher',         w: 9 },
      { kw: 'פתקית הפקדה',          w: 10 },
    ],
    secondary: [
      { kw: 'מס\' חשבון',            w: 2 },
      { kw: 'סניף',                 w: 2 },
      { kw: 'בנק',                  w: 1 },
      { kw: 'הפקדה',                w: 2 },
      { kw: 'משיכה',                w: 2 },
      { kw: 'יתרה',                 w: 2 },
      { kw: 'אסמכתה בנקאית',        w: 3 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תלוש שכר',             w: 6 },
      { kw: 'תעודת משלוח',          w: 5 },
      { kw: 'הזמנת רכש',            w: 5 },
    ],
  },

  contract: {
    label_he: 'חוזה',
    label_en: 'Contract',
    primary: [
      { kw: 'חוזה',                 w: 11 },
      { kw: 'חוזה התקשרות',         w: 12 },
      { kw: 'חוזה שירותים',         w: 12 },
      { kw: 'Contract',             w: 8 },
      { kw: 'חוזה עבודה',           w: 11 },
    ],
    secondary: [
      { kw: 'הצדדים',               w: 3 },
      { kw: 'צד א\'',                w: 3 },
      { kw: 'צד ב\'',                w: 3 },
      { kw: 'בהסכמה',               w: 2 },
      { kw: 'תנאי החוזה',           w: 3 },
      { kw: 'סעיף',                 w: 1 },
      { kw: 'הואיל',                w: 2 },
      { kw: 'בתוקף',                w: 2 },
      { kw: 'חתימה',                w: 2 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תלוש שכר',             w: 6 },
      { kw: 'הצעת מחיר',            w: 4 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'הסכם שירות',           w: 4 },
    ],
  },

  order: {
    label_he: 'הזמנה',
    label_en: 'Order',
    primary: [
      { kw: 'הזמנה מספר',           w: 12 },
      { kw: 'הזמנה מס\'',             w: 11 },
      { kw: 'Order No',             w: 8 },
      { kw: 'Order #',              w: 7 },
      { kw: 'טופס הזמנה',            w: 10 },
    ],
    secondary: [
      { kw: 'כתובת משלוח',          w: 3 },
      { kw: 'פריט',                 w: 1 },
      { kw: 'כמות',                 w: 1 },
      { kw: 'סכום כולל',            w: 2 },
      { kw: 'הזמנה',                w: 2 },
    ],
    negative: [
      { kw: 'הזמנת רכש',            w: 8 },
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'הצעת מחיר',            w: 4 },
    ],
  },

  service_agreement: {
    label_he: 'הסכם שירות',
    label_en: 'Service Agreement',
    primary: [
      { kw: 'הסכם שירות',           w: 12 },
      { kw: 'הסכם שירותים',         w: 12 },
      { kw: 'הסכם התקשרות',         w: 10 },
      { kw: 'Service Agreement',    w: 9 },
      { kw: 'SLA',                  w: 6 },
    ],
    secondary: [
      { kw: 'רמת שירות',            w: 3 },
      { kw: 'זמני תגובה',           w: 3 },
      { kw: 'אחזקה שוטפת',          w: 2 },
      { kw: 'תמיכה טכנית',          w: 2 },
      { kw: 'זמינות',               w: 2 },
      { kw: 'הצדדים',               w: 2 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 6 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'חוזה עבודה',           w: 3 },
      { kw: 'תעודת משלוח',          w: 6 },
    ],
  },

  opinion: {
    label_he: 'חוות דעת',
    label_en: 'Opinion',
    primary: [
      { kw: 'חוות דעת',             w: 12 },
      { kw: 'חוות-דעת',             w: 11 },
      { kw: 'Opinion',              w: 7 },
      { kw: 'חוות דעת מקצועית',     w: 12 },
      { kw: 'חוות דעת משפטית',      w: 12 },
    ],
    secondary: [
      { kw: 'לבקשת',                w: 2 },
      { kw: 'לכבוד',                w: 1 },
      { kw: 'הנני',                 w: 2 },
      { kw: 'לאחר בחינה',           w: 2 },
      { kw: 'מסקנה',                w: 3 },
      { kw: 'בכבוד רב',             w: 2 },
      { kw: 'מומחה',                w: 2 },
      { kw: 'בהתאם',                w: 1 },
    ],
    negative: [
      { kw: 'חשבונית מס',           w: 7 },
      { kw: 'תלוש שכר',             w: 8 },
      { kw: 'תעודת משלוח',          w: 6 },
      { kw: 'הצעת מחיר',            w: 5 },
    ],
  },

});

const TYPE_LIST = Object.freeze(Object.keys(RULES));

// ────────────────────────────────────────────────────────────────────
// 2. Text normalisation helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Collapse whitespace, normalise common unicode quirks that show up in
 * OCR output from Israeli documents (RTL marks, soft-hyphens,
 * non-breaking spaces, curly quotes, common dash variants).
 */
function normalize(text) {
  if (text == null) return '';
  const str = String(text);
  return str
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '') // bidi marks
    .replace(/\u00ad/g, '')              // soft hyphen
    .replace(/\u00a0/g, ' ')             // nbsp
    .replace(/[\u2013\u2014]/g, '-')     // en/em dash → hyphen
    .replace(/[\u201c\u201d]/g, '"')     // curly double quote → straight
    .replace(/[\u2018\u2019]/g, "'")     // curly single quote → straight
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Count non-overlapping occurrences of `needle` inside `haystack`.
 * Case-insensitive for Latin characters (Hebrew is unicameral).
 * Pure string scan — no regex construction per call, no deps.
 */
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (n.length > h.length) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = h.indexOf(n, idx);
    if (found === -1) break;
    count += 1;
    idx = found + n.length;
  }
  return count;
}

/**
 * Return the index of the first occurrence of needle in haystack,
 * or -1 if absent. Case-insensitive.
 */
function firstIndex(haystack, needle) {
  if (!needle) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

/**
 * Is `position` inside the "title zone"?
 * Title zone = first TITLE_ZONE_RATIO of text length, min 120 chars.
 */
function isInTitleZone(position, textLength) {
  if (position < 0) return false;
  const zone = Math.max(120, Math.floor(textLength * TITLE_ZONE_RATIO));
  return position < zone;
}

// ────────────────────────────────────────────────────────────────────
// 3. Scoring engine
// ────────────────────────────────────────────────────────────────────

/**
 * Score a single (type, text) pair.
 * Returns:
 *   {
 *     score: number,
 *     primary_hits: number,
 *     hits: [{kw, w, count, title_bonus: bool}, ...],
 *   }
 *
 * The final score is:
 *   Σ(primary_hits × w × (title_bonus ? TITLE_ZONE_BONUS : 1))
 * + Σ(secondary_hits × w)
 * - Σ(negative_hits  × w)
 */
function scoreType(typeKey, text) {
  const rule = RULES[typeKey];
  if (!rule) throw new Error(`Unknown document type: ${typeKey}`);

  const hits = [];
  let primaryHitCount = 0;
  let score = 0;

  // primary — with positional bonus
  for (const { kw, w } of rule.primary) {
    const count = countOccurrences(text, kw);
    if (count === 0) continue;
    const firstPos = firstIndex(text, kw);
    const titleBonus = isInTitleZone(firstPos, text.length);
    const multiplier = titleBonus ? TITLE_ZONE_BONUS : 1;
    const contribution = count * w * multiplier;
    score += contribution;
    primaryHitCount += count;
    hits.push({
      kw,
      w,
      count,
      title_bonus: titleBonus,
      kind: 'primary',
      contribution,
    });
  }

  // secondary — supporting evidence, no positional bonus
  for (const { kw, w } of rule.secondary) {
    const count = countOccurrences(text, kw);
    if (count === 0) continue;
    const contribution = count * w;
    score += contribution;
    hits.push({ kw, w, count, title_bonus: false, kind: 'secondary', contribution });
  }

  // negative — explicit anti-signals
  for (const { kw, w } of rule.negative) {
    const count = countOccurrences(text, kw);
    if (count === 0) continue;
    const contribution = -count * w;
    score += contribution;
    hits.push({ kw, w, count, title_bonus: false, kind: 'negative', contribution });
  }

  return { score, primary_hits: primaryHitCount, hits };
}

/**
 * Convert raw scores into a normalised confidence in [0,1].
 * We use a soft normalisation:
 *    confidence = score / (score + mean_of_others + eps)
 * This keeps the winning type's confidence between ~0.3 and ~0.95
 * and never returns NaN.
 */
function computeConfidence(score, otherScores) {
  if (score <= 0) return 0;
  const positiveOthers = otherScores.filter((s) => s > 0);
  const sumOthers = positiveOthers.reduce((a, b) => a + b, 0);
  const mean = positiveOthers.length ? sumOthers / positiveOthers.length : 0;
  const eps = 1;
  const raw = score / (score + mean + eps);
  // clamp to [0, 0.99] — we never claim 100% from a keyword model
  return Math.max(0, Math.min(0.99, raw));
}

// ────────────────────────────────────────────────────────────────────
// 4. Public API
// ────────────────────────────────────────────────────────────────────

/**
 * Classify a document text blob.
 *
 * @param {string} text  — raw OCR or document text.
 * @param {object} [opts]
 * @param {number} [opts.topN=3]      — how many predictions to return
 * @param {number} [opts.minScore=0.5] — absolute score threshold
 * @returns {Array<{
 *   type: string,
 *   type_he: string,
 *   type_en: string,
 *   confidence: number,
 *   score: number,
 *   keywords_matched: string[],
 *   primary_hits: number,
 * }>}
 */
function classify(text, opts = {}) {
  const topN = Number.isFinite(opts.topN) ? Math.max(1, Math.floor(opts.topN)) : DEFAULT_TOP_N;
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : MIN_ABSOLUTE_SCORE;

  const normalized = normalize(text);
  if (!normalized) return [];

  // score every type
  const raw = TYPE_LIST.map((typeKey) => {
    const r = scoreType(typeKey, normalized);
    return { typeKey, ...r };
  });

  // rank by score desc, then primary_hits desc (tie-breaker)
  raw.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.primary_hits - a.primary_hits;
  });

  const allScores = raw.map((r) => r.score);

  const results = [];
  for (const r of raw) {
    if (r.score < minScore) continue;
    if (r.primary_hits === 0 && r.score < minScore * 2) continue;

    const otherScores = allScores.filter((s) => s !== r.score);
    const confidence = computeConfidence(r.score, otherScores);

    const matchedKeywords = r.hits
      .filter((h) => h.kind !== 'negative' && h.count > 0)
      .map((h) => h.kw);

    results.push({
      type: r.typeKey,
      type_he: RULES[r.typeKey].label_he,
      type_en: RULES[r.typeKey].label_en,
      confidence: Math.round(confidence * 10000) / 10000,
      score: Math.round(r.score * 100) / 100,
      keywords_matched: matchedKeywords,
      primary_hits: r.primary_hits,
    });

    if (results.length >= topN) break;
  }

  return results;
}

/**
 * Classify a batch of documents.
 *
 * @param {Array<{id?: string, text: string}|string>} documents
 * @param {object} [opts]
 * @returns {Array<{id: string, predictions: Array}>}
 */
function classifyBatch(documents, opts = {}) {
  if (!Array.isArray(documents)) {
    throw new TypeError('classifyBatch expects an array');
  }
  return documents.map((doc, idx) => {
    if (typeof doc === 'string') {
      return { id: `doc-${idx + 1}`, predictions: classify(doc, opts) };
    }
    if (doc && typeof doc === 'object') {
      const id = doc.id || `doc-${idx + 1}`;
      const text = doc.text || '';
      return { id, predictions: classify(text, opts) };
    }
    return { id: `doc-${idx + 1}`, predictions: [] };
  });
}

/**
 * Inspect the keyword rules for a given type.
 *
 * @param {string} type
 * @returns {{label_he:string, label_en:string, primary:Array, secondary:Array, negative:Array}|null}
 */
function getKeywords(type) {
  const rule = RULES[type];
  if (!rule) return null;
  // deep-ish copy to keep callers from mutating our frozen rule set
  return {
    label_he: rule.label_he,
    label_en: rule.label_en,
    primary: rule.primary.map((x) => ({ ...x })),
    secondary: rule.secondary.map((x) => ({ ...x })),
    negative: rule.negative.map((x) => ({ ...x })),
  };
}

/**
 * List every supported type key.
 * @returns {string[]}
 */
function getSupportedTypes() {
  return [...TYPE_LIST];
}

/**
 * Pretty Hebrew label for a type key.
 * @param {string} type
 * @returns {string|null}
 */
function getTypeLabel(type) {
  return RULES[type] ? RULES[type].label_he : null;
}

// ────────────────────────────────────────────────────────────────────
// 5. Exports
// ────────────────────────────────────────────────────────────────────

module.exports = {
  classify,
  classifyBatch,
  getKeywords,
  getSupportedTypes,
  getTypeLabel,
  // exported for white-box unit tests
  _internal: {
    normalize,
    countOccurrences,
    firstIndex,
    isInTitleZone,
    scoreType,
    computeConfidence,
    RULES,
    TYPE_LIST,
    TITLE_ZONE_BONUS,
    TITLE_ZONE_RATIO,
    MIN_ABSOLUTE_SCORE,
    DEFAULT_TOP_N,
  },
};
