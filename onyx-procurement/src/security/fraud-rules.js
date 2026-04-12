/**
 * Fraud Detection Rules Engine
 * Agent-X03 — Swarm 3 — Techno-Kol Uzi ERP
 *
 * Declarative rules + severity-weighted scoring for procurement / payroll /
 * AP fraud detection. Zero dependencies, bilingual (Hebrew + English),
 * non-destructive (rules can only be added, never removed).
 *
 * Context shape (all fields optional — rules self-guard):
 * {
 *   now: Date | string,                        // evaluation time
 *   approval_threshold: number,                // e.g. 5000
 *   split_threshold: number,                   // e.g. 5000
 *   round_amount_tolerance: number,            // e.g. 100
 *   high_risk_iban_countries: string[],        // ISO-2
 *   vendor: {
 *     id, name, created_at, vat_id, vat_validated,
 *     bank_account, bank_account_changed_at, address,
 *     registration_country, israeli_registered
 *   },
 *   vendor_history: {
 *     recent_round_amounts: number,            // past N days
 *     round_amount_frequency_threshold: number,
 *     recent_invoice_numbers: (string|number)[]
 *   },
 *   invoice: {
 *     id, number, description, amount,
 *     invoice_date, due_date, submitted_at,
 *     has_supporting_docs, supporting_docs_count,
 *     split_batch_id
 *   },
 *   payment: {
 *     initiated_at, amount, destination_iban, destination_country
 *   },
 *   employee: {
 *     id, tz, address, overtime_hours, standard_overtime_hours,
 *     bank_accounts: string[], active_bank_account, expected_bank_account
 *   },
 *   related_employees: [{ id, tz, address }],
 *   related_invoices: [{ id, vendor_id, description, amount, split_batch_id }],
 *   split_batch_total: number
 * }
 *
 * Public API:
 *   - evaluateRules(ctx)   -> { risk_score, triggered_rules, recommended_action }
 *   - addRule(rule)        -> registers a custom rule (id must be unique)
 *   - listRules()          -> shallow copy of all rules
 *   - explainDecision(res) -> { he, en } human-readable summary
 *   - getRuleById(id)      -> rule or null
 *
 * Run: node -e "require('./src/security/fraud-rules')"
 */

'use strict';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safe Date parse. Returns null if invalid. */
function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Difference in hours between a and b (a - b). */
function hoursBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return (da.getTime() - db.getTime()) / 36e5;
}

/** Difference in days (a - b). */
function daysBetween(a, b) {
  const h = hoursBetween(a, b);
  return h == null ? null : h / 24;
}

/** Returns true for Friday/Saturday in Israel (0=Sun..6=Sat). */
function isWeekend(d) {
  const dt = toDate(d);
  if (!dt) return false;
  const day = dt.getDay();
  return day === 5 || day === 6; // Fri or Sat
}

/** Return hour-of-day in 0..23. */
function hourOfDay(d) {
  const dt = toDate(d);
  return dt ? dt.getHours() : null;
}

/** Round amount check: amount ends with lots of zeros within tolerance. */
function isRoundAmount(amount, tolerance) {
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return false;
  const tol = tolerance == null ? 0 : tolerance;
  // "Round" = divisible by 1000 (within tolerance) AND >= 1000
  if (amount < 1000) return false;
  const mod = amount % 1000;
  return mod <= tol || (1000 - mod) <= tol;
}

/** Check if number string is "nearly sequential" — differs by 1..3. */
function countSequential(nums) {
  if (!Array.isArray(nums) || nums.length < 2) return 0;
  const ints = nums
    .map((n) => {
      if (n == null) return null;
      const m = String(n).match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  let seq = 0;
  for (let i = 1; i < ints.length; i++) {
    if (ints[i] - ints[i - 1] <= 3) seq++;
  }
  return seq;
}

/** Normalize address for comparison: trim, lowercase, remove extra spaces. */
function normAddr(a) {
  if (!a || typeof a !== 'string') return '';
  return a.toLowerCase().replace(/[\s,.-]+/g, ' ').trim();
}

/** Israeli ID (ת.ז) validity check via Luhn-like algorithm. */
function isValidTZ(tz) {
  if (tz == null) return false;
  const s = String(tz).replace(/\D/g, '');
  if (s.length === 0 || s.length > 9) return false;
  const padded = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = parseInt(padded[i], 10) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Red-flag keywords in vendor names (when no Israeli registration). */
const RED_FLAG_NAME_TOKENS = [
  'ltd',
  'limited',
  'holdings',
  'holding',
  'consulting',
  'consultancy',
  'offshore',
  'international',
  'global',
  'enterprises',
  'trust',
];

/** Default high-risk IBAN country list (ISO-2). */
const DEFAULT_HIGH_RISK_COUNTRIES = [
  'RU', // Russia
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'VE', // Venezuela
  'BY', // Belarus
  'CU', // Cuba
  'SS', // South Sudan
  'MM', // Myanmar
  'AF', // Afghanistan
];

/** Pull country code from IBAN or from explicit field. */
function ibanCountry(iban) {
  if (!iban || typeof iban !== 'string') return null;
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 2) return null;
  const cc = clean.slice(0, 2);
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

// ---------------------------------------------------------------------------
// Built-in rules (FR-001 .. FR-030+)
// ---------------------------------------------------------------------------
// Severity is on a 1..10 scale. Total risk_score is weighted sum capped to 100.

const BUILTIN_RULES = [
  // ---------- Vendor / onboarding ----------
  {
    id: 'FR-001',
    name_he: 'סכום סמוך לתקרת אישור',
    name_en: 'Amount just below approval threshold',
    severity: 7,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const limit = ctx && ctx.approval_threshold;
      if (!inv || typeof inv.amount !== 'number' || typeof limit !== 'number') return false;
      const diff = limit - inv.amount;
      return diff > 0 && diff <= limit * 0.02; // within 2% below limit
    },
    message_he: 'סכום החשבונית נמוך במעט מתקרת האישור — ייתכן ניסיון עקיפה.',
    message_en: 'Invoice amount is just below the approval threshold — possible evasion attempt.',
  },
  {
    id: 'FR-002',
    name_he: 'ספק חדש + חשבונית תוך 24 שעות',
    name_en: 'New vendor + invoice within 24 hours',
    severity: 8,
    check(ctx) {
      const v = ctx && ctx.vendor;
      const inv = ctx && ctx.invoice;
      if (!v || !inv) return false;
      const h = hoursBetween(inv.submitted_at || inv.invoice_date, v.created_at);
      return h != null && h >= 0 && h <= 24;
    },
    message_he: 'ספק חדש הונפקה עבורו חשבונית תוך פחות מ-24 שעות מיצירתו.',
    message_en: 'Invoice issued for a newly created vendor within 24 hours.',
  },
  {
    id: 'FR-003',
    name_he: 'חשבון בנק של ספק שונה לאחרונה + תשלום',
    name_en: 'Vendor bank account changed recently + payment initiated',
    severity: 9,
    check(ctx) {
      const v = ctx && ctx.vendor;
      const p = ctx && ctx.payment;
      if (!v || !p) return false;
      const changed = v.bank_account_changed_at;
      if (!changed || !p.initiated_at) return false;
      const d = daysBetween(p.initiated_at, changed);
      return d != null && d >= 0 && d <= 7;
    },
    message_he: 'חשבון הבנק של הספק עודכן בשבוע האחרון ובוצע תשלום — סיכון הונאה גבוה.',
    message_en: 'Vendor bank account was modified within the last 7 days and a payment was initiated — high fraud risk.',
  },
  {
    id: 'FR-004',
    name_he: 'מספר ע"מ לא אומת',
    name_en: 'VAT ID not yet validated',
    severity: 4,
    check(ctx) {
      const v = ctx && ctx.vendor;
      if (!v) return false;
      return !!v.vat_id && v.vat_validated === false;
    },
    message_he: 'ספק קיים עם מספר עוסק מורשה שלא אומת מול רשות המסים.',
    message_en: 'Vendor has a VAT ID that has not been validated with the tax authority.',
  },
  {
    id: 'FR-005',
    name_he: 'ספק ללא רישום ישראלי ושם עם מילות-דגל',
    name_en: 'Non-Israeli vendor name contains red-flag keywords',
    severity: 5,
    check(ctx) {
      const v = ctx && ctx.vendor;
      if (!v || !v.name) return false;
      if (v.israeli_registered === true) return false;
      const lower = String(v.name).toLowerCase();
      return RED_FLAG_NAME_TOKENS.some((t) => new RegExp(`\\b${t}\\b`).test(lower));
    },
    message_he: 'שם הספק מכיל מונחים מחשידים (כגון Ltd / Holdings / Consulting) ללא רישום ישראלי.',
    message_en: 'Vendor name contains red-flag tokens (Ltd / Holdings / Consulting) without Israeli registration.',
  },

  // ---------- Invoice / amount patterns ----------
  {
    id: 'FR-006',
    name_he: 'סכום עגול בתדירות גבוהה',
    name_en: 'Round amounts above frequency threshold',
    severity: 4,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const h = ctx && ctx.vendor_history;
      if (!inv || !h) return false;
      const tol = ctx.round_amount_tolerance != null ? ctx.round_amount_tolerance : 0;
      if (!isRoundAmount(inv.amount, tol)) return false;
      const freq = typeof h.recent_round_amounts === 'number' ? h.recent_round_amounts : 0;
      const limit = typeof h.round_amount_frequency_threshold === 'number'
        ? h.round_amount_frequency_threshold
        : 3;
      return freq >= limit;
    },
    message_he: 'סכום עגול חוזר בתדירות גבוהה מספק זה.',
    message_en: 'Round-number invoice amount repeats at high frequency for this vendor.',
  },
  {
    id: 'FR-007',
    name_he: 'מספרי חשבוניות עוקבים מאותו ספק',
    name_en: 'Sequential invoice numbers from same vendor',
    severity: 6,
    check(ctx) {
      const h = ctx && ctx.vendor_history;
      if (!h || !Array.isArray(h.recent_invoice_numbers)) return false;
      return countSequential(h.recent_invoice_numbers) >= 2;
    },
    message_he: 'מספרי חשבוניות רצופים/קרובים מאותו ספק — ייתכן זיוף.',
    message_en: 'Sequential invoice numbers from the same vendor — possible forgery.',
  },
  {
    id: 'FR-008',
    name_he: 'פיצול חשבונית לעקיפת סף אישור',
    name_en: 'Invoice split to evade approval threshold',
    severity: 9,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const limit = ctx && ctx.split_threshold;
      const batchTotal = ctx && ctx.split_batch_total;
      if (!inv || typeof limit !== 'number') return false;
      if (inv.split_batch_id && typeof batchTotal === 'number') {
        return batchTotal > limit && inv.amount < limit;
      }
      // Fallback: check related_invoices same batch
      if (inv.split_batch_id && Array.isArray(ctx.related_invoices)) {
        const sum = ctx.related_invoices
          .filter((r) => r.split_batch_id === inv.split_batch_id)
          .reduce((a, r) => a + (typeof r.amount === 'number' ? r.amount : 0), 0);
        return sum > limit && inv.amount < limit;
      }
      return false;
    },
    message_he: 'חשבונית מפוצלת שכל אחת מתחת לסף האישור אך הסכום הכולל חורג.',
    message_en: 'Invoice split into sub-amounts, each below approval threshold while total exceeds it.',
  },
  {
    id: 'FR-009',
    name_he: 'תיאור כפול מספק אחר',
    name_en: 'Duplicate description with different vendor',
    severity: 6,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const v = ctx && ctx.vendor;
      if (!inv || !v || !inv.description) return false;
      if (!Array.isArray(ctx.related_invoices)) return false;
      const desc = String(inv.description).trim().toLowerCase();
      return ctx.related_invoices.some(
        (r) =>
          r &&
          r.vendor_id !== v.id &&
          typeof r.description === 'string' &&
          r.description.trim().toLowerCase() === desc
      );
    },
    message_he: 'תיאור החשבונית זהה לחשבונית אחרת מספק שונה.',
    message_en: 'Invoice description matches another invoice from a different vendor.',
  },
  {
    id: 'FR-010',
    name_he: 'תאריך חשבונית עתידי',
    name_en: 'Invoice date is in the future',
    severity: 7,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const now = ctx && ctx.now;
      if (!inv || !now) return false;
      const id = toDate(inv.invoice_date);
      const n = toDate(now);
      if (!id || !n) return false;
      return id.getTime() > n.getTime() + 12 * 3600 * 1000;
    },
    message_he: 'תאריך החשבונית הוא בעתיד.',
    message_en: 'Invoice date is set in the future.',
  },
  {
    id: 'FR-011',
    name_he: 'תשלום לפני תאריך החשבונית',
    name_en: 'Payment before invoice date',
    severity: 7,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const p = ctx && ctx.payment;
      if (!inv || !p) return false;
      const h = hoursBetween(inv.invoice_date, p.initiated_at);
      return h != null && h > 1; // invoice_date later than payment by > 1h
    },
    message_he: 'התשלום בוצע לפני תאריך החשבונית.',
    message_en: 'Payment was initiated before the invoice date.',
  },
  {
    id: 'FR-012',
    name_he: 'חסרים מסמכים תומכים',
    name_en: 'Missing supporting documents',
    severity: 5,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      if (!inv) return false;
      if (inv.has_supporting_docs === false) return true;
      if (typeof inv.supporting_docs_count === 'number' && inv.supporting_docs_count === 0) {
        return true;
      }
      return false;
    },
    message_he: 'לא צורפו מסמכים תומכים לחשבונית.',
    message_en: 'No supporting documents were attached to the invoice.',
  },

  // ---------- Vendor/employee relationship ----------
  {
    id: 'FR-013',
    name_he: 'כתובת הספק תואמת לכתובת עובד',
    name_en: 'Vendor address matches employee address',
    severity: 9,
    check(ctx) {
      const v = ctx && ctx.vendor;
      if (!v || !v.address) return false;
      const va = normAddr(v.address);
      if (!va) return false;
      if (ctx.employee && normAddr(ctx.employee.address) === va) return true;
      if (Array.isArray(ctx.related_employees)) {
        return ctx.related_employees.some((e) => e && normAddr(e.address) === va);
      }
      return false;
    },
    message_he: 'כתובת הספק זהה לכתובת של עובד במערכת.',
    message_en: 'Vendor address matches an employee address.',
  },
  {
    id: 'FR-014',
    name_he: 'חשבון IBAN במדינה בסיכון',
    name_en: 'IBAN from high-risk country',
    severity: 9,
    check(ctx) {
      const p = ctx && ctx.payment;
      if (!p) return false;
      const list = Array.isArray(ctx.high_risk_iban_countries) && ctx.high_risk_iban_countries.length
        ? ctx.high_risk_iban_countries
        : DEFAULT_HIGH_RISK_COUNTRIES;
      const cc = (p.destination_country || ibanCountry(p.destination_iban) || '').toUpperCase();
      return !!cc && list.indexOf(cc) !== -1;
    },
    message_he: 'יעד התשלום הוא חשבון במדינה בסיכון גבוה.',
    message_en: 'Payment destination is an account in a high-risk country.',
  },

  // ---------- Time-of-day / calendar ----------
  {
    id: 'FR-015',
    name_he: 'פעולה בסוף שבוע',
    name_en: 'Weekend transaction',
    severity: 3,
    check(ctx) {
      const t = ctx && (ctx.payment && ctx.payment.initiated_at) ||
        (ctx && ctx.invoice && ctx.invoice.submitted_at);
      return isWeekend(t);
    },
    message_he: 'הפעולה בוצעה בסוף השבוע.',
    message_en: 'Transaction was initiated on the weekend.',
  },
  {
    id: 'FR-016',
    name_he: 'פעולה מחוץ לשעות העבודה',
    name_en: 'Out-of-hours transaction',
    severity: 4,
    check(ctx) {
      const t = (ctx && ctx.payment && ctx.payment.initiated_at) ||
        (ctx && ctx.invoice && ctx.invoice.submitted_at);
      const h = hourOfDay(t);
      if (h == null) return false;
      return h < 6 || h >= 22;
    },
    message_he: 'הפעולה בוצעה מחוץ לשעות העבודה (לפני 06:00 או אחרי 22:00).',
    message_en: 'Transaction was initiated outside business hours (before 06:00 or after 22:00).',
  },
  {
    id: 'FR-017',
    name_he: 'פעולה ביום חג',
    name_en: 'Holiday transaction',
    severity: 3,
    check(ctx) {
      const t = (ctx && ctx.payment && ctx.payment.initiated_at) ||
        (ctx && ctx.invoice && ctx.invoice.submitted_at);
      const dt = toDate(t);
      if (!dt) return false;
      if (!Array.isArray(ctx.holidays)) return false;
      const iso = dt.toISOString().slice(0, 10);
      return ctx.holidays.some((h) => {
        const hd = toDate(h);
        return hd && hd.toISOString().slice(0, 10) === iso;
      });
    },
    message_he: 'הפעולה בוצעה ביום חג.',
    message_en: 'Transaction was initiated on a holiday.',
  },

  // ---------- Payroll-specific ----------
  {
    id: 'FR-018',
    name_he: 'עובד עם מספר חשבונות בנק',
    name_en: 'Employee has multiple bank accounts',
    severity: 5,
    check(ctx) {
      const e = ctx && ctx.employee;
      if (!e || !Array.isArray(e.bank_accounts)) return false;
      const uniq = new Set(e.bank_accounts.filter((x) => typeof x === 'string' && x.trim()));
      return uniq.size >= 2;
    },
    message_he: 'לעובד מוגדרים יותר מחשבון בנק אחד.',
    message_en: 'Employee has more than one bank account configured.',
  },
  {
    id: 'FR-019',
    name_he: 'משכורת משולמת לחשבון לא נכון',
    name_en: 'Salary paid to wrong employee bank account',
    severity: 10,
    check(ctx) {
      const e = ctx && ctx.employee;
      if (!e) return false;
      if (!e.active_bank_account || !e.expected_bank_account) return false;
      return String(e.active_bank_account).trim() !== String(e.expected_bank_account).trim();
    },
    message_he: 'המשכורת מועברת לחשבון בנק שאינו החשבון הצפוי של העובד.',
    message_en: 'Salary is being paid to a bank account that differs from the employee\'s expected account.',
  },
  {
    id: 'FR-020',
    name_he: 'ת.ז. כפולה בין עובדים',
    name_en: 'Duplicate TZ across employees',
    severity: 10,
    check(ctx) {
      const e = ctx && ctx.employee;
      if (!e || !e.tz) return false;
      if (!Array.isArray(ctx.related_employees)) return false;
      const tz = String(e.tz).replace(/\D/g, '');
      if (!tz) return false;
      return ctx.related_employees.some(
        (x) => x && x.id !== e.id && String(x.tz || '').replace(/\D/g, '') === tz
      );
    },
    message_he: 'קיימים שני עובדים או יותר עם אותה תעודת זהות.',
    message_en: 'Two or more employees share the same national ID.',
  },
  {
    id: 'FR-021',
    name_he: 'שעות נוספות גבוהות באופן חריג',
    name_en: 'Unusually high overtime',
    severity: 5,
    check(ctx) {
      const e = ctx && ctx.employee;
      if (!e) return false;
      const ot = typeof e.overtime_hours === 'number' ? e.overtime_hours : null;
      const std = typeof e.standard_overtime_hours === 'number' ? e.standard_overtime_hours : null;
      if (ot == null) return false;
      if (std != null) return ot > std * 2;
      return ot > 80; // hard cap fallback
    },
    message_he: 'שעות נוספות גבוהות מהרגיל לעובד זה.',
    message_en: 'Overtime hours are unusually high for this employee.',
  },
  {
    id: 'FR-022',
    name_he: 'ת.ז. לא תקינה לפי ספרת ביקורת',
    name_en: 'Invalid TZ check digit',
    severity: 6,
    check(ctx) {
      const e = ctx && ctx.employee;
      if (!e || !e.tz) return false;
      return !isValidTZ(e.tz);
    },
    message_he: 'תעודת הזהות של העובד אינה עוברת בדיקת ספרת ביקורת.',
    message_en: 'Employee national ID fails checksum validation.',
  },

  // ---------- Additional vendor / compliance ----------
  {
    id: 'FR-023',
    name_he: 'ספק ללא מספר ע"מ כלל',
    name_en: 'Vendor has no VAT ID at all',
    severity: 5,
    check(ctx) {
      const v = ctx && ctx.vendor;
      if (!v) return false;
      return !v.vat_id || String(v.vat_id).trim() === '';
    },
    message_he: 'לספק אין מספר עוסק מורשה במערכת.',
    message_en: 'Vendor has no VAT ID registered in the system.',
  },
  {
    id: 'FR-024',
    name_he: 'סכום חשבונית שלילי או אפס',
    name_en: 'Invoice amount non-positive',
    severity: 6,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      if (!inv) return false;
      if (typeof inv.amount !== 'number') return false;
      return inv.amount <= 0;
    },
    message_he: 'סכום החשבונית אינו חיובי.',
    message_en: 'Invoice amount is zero or negative.',
  },
  {
    id: 'FR-025',
    name_he: 'מספר חשבונית חוזר מאותו ספק',
    name_en: 'Duplicate invoice number from same vendor',
    severity: 8,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const h = ctx && ctx.vendor_history;
      if (!inv || !h || !Array.isArray(h.recent_invoice_numbers)) return false;
      const num = String(inv.number || '').trim();
      if (!num) return false;
      const occurrences = h.recent_invoice_numbers.filter(
        (n) => String(n).trim() === num
      ).length;
      return occurrences >= 1; // current invoice repeats a past number
    },
    message_he: 'מספר החשבונית כבר שומש בעבר על ידי אותו ספק.',
    message_en: 'Invoice number was already used by this vendor in the past.',
  },
  {
    id: 'FR-026',
    name_he: 'חריגה גבוהה מעל תקרת אישור',
    name_en: 'Invoice far exceeds approval threshold',
    severity: 4,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const limit = ctx && ctx.approval_threshold;
      if (!inv || typeof inv.amount !== 'number' || typeof limit !== 'number') return false;
      return inv.amount >= limit * 10;
    },
    message_he: 'סכום החשבונית גדול פי 10 לפחות מתקרת האישור.',
    message_en: 'Invoice amount is at least 10× the approval threshold.',
  },
  {
    id: 'FR-027',
    name_he: 'תיאור חשבונית ריק או גנרי',
    name_en: 'Blank or generic invoice description',
    severity: 3,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      if (!inv) return false;
      const d = String(inv.description || '').trim().toLowerCase();
      if (d === '') return true;
      return /^(misc|miscellaneous|other|n\/a|service|services|consulting|שונות)$/.test(d);
    },
    message_he: 'תיאור החשבונית ריק או גנרי מדי.',
    message_en: 'Invoice description is blank or too generic.',
  },
  {
    id: 'FR-028',
    name_he: 'תשלום בסכום שונה מסכום החשבונית',
    name_en: 'Payment amount differs from invoice amount',
    severity: 7,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      const p = ctx && ctx.payment;
      if (!inv || !p) return false;
      if (typeof inv.amount !== 'number' || typeof p.amount !== 'number') return false;
      if (inv.amount === 0) return false;
      const diff = Math.abs(p.amount - inv.amount);
      return diff / inv.amount > 0.01; // > 1% mismatch
    },
    message_he: 'סכום התשלום שונה מסכום החשבונית ביותר מאחוז אחד.',
    message_en: 'Payment amount deviates from invoice amount by more than 1%.',
  },
  {
    id: 'FR-029',
    name_he: 'חשבונית ישנה מאוד הוגשה כעת',
    name_en: 'Very old invoice submitted now',
    severity: 4,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      if (!inv) return false;
      const d = daysBetween(inv.submitted_at || ctx.now, inv.invoice_date);
      return d != null && d > 180;
    },
    message_he: 'החשבונית הוגשה יותר מ-180 יום לאחר תאריך החשבונית.',
    message_en: 'Invoice was submitted more than 180 days after its invoice date.',
  },
  {
    id: 'FR-030',
    name_he: 'ספק הוקם על ידי אותו משתמש שאישר חשבונית',
    name_en: 'Vendor created and invoice approved by same user',
    severity: 8,
    check(ctx) {
      const v = ctx && ctx.vendor;
      const inv = ctx && ctx.invoice;
      if (!v || !inv) return false;
      if (!v.created_by || !inv.approved_by) return false;
      return v.created_by === inv.approved_by;
    },
    message_he: 'אותו משתמש יצר את הספק וגם אישר את החשבונית — הפרדת תפקידים.',
    message_en: 'Same user both created the vendor and approved the invoice — segregation of duties violation.',
  },
  {
    id: 'FR-031',
    name_he: 'חשבון בנק של עובד תואם חשבון של ספק',
    name_en: 'Employee bank account matches vendor bank account',
    severity: 10,
    check(ctx) {
      const v = ctx && ctx.vendor;
      const e = ctx && ctx.employee;
      if (!v || !e || !v.bank_account) return false;
      const vb = String(v.bank_account).replace(/\s/g, '');
      if (!vb) return false;
      if (e.active_bank_account && String(e.active_bank_account).replace(/\s/g, '') === vb) return true;
      if (Array.isArray(e.bank_accounts)) {
        return e.bank_accounts.some(
          (b) => typeof b === 'string' && b.replace(/\s/g, '') === vb
        );
      }
      return false;
    },
    message_he: 'חשבון הבנק של הספק זהה לחשבון בנק של עובד.',
    message_en: 'Vendor bank account matches an employee bank account.',
  },
  {
    id: 'FR-032',
    name_he: 'חשבונית ללא קישור להזמנת רכש',
    name_en: 'Invoice has no linked purchase order',
    severity: 4,
    check(ctx) {
      const inv = ctx && ctx.invoice;
      if (!inv) return false;
      if (ctx.require_po === false) return false;
      return inv.purchase_order_id == null || inv.purchase_order_id === '';
    },
    message_he: 'החשבונית אינה מקושרת להזמנת רכש.',
    message_en: 'Invoice is not linked to any purchase order.',
  },
];

// Deep-freeze each built-in rule so callers cannot mutate them.
for (const r of BUILTIN_RULES) Object.freeze(r);

// ---------------------------------------------------------------------------
// Registry (never delete; can only add)
// ---------------------------------------------------------------------------

const _rules = BUILTIN_RULES.slice();

function _validateRule(rule) {
  if (!rule || typeof rule !== 'object') throw new TypeError('rule must be an object');
  const required = ['id', 'name_he', 'name_en', 'severity', 'check', 'message_he', 'message_en'];
  for (const k of required) {
    if (!(k in rule)) throw new TypeError(`rule missing field: ${k}`);
  }
  if (typeof rule.id !== 'string' || !rule.id.trim()) throw new TypeError('rule.id must be non-empty string');
  if (typeof rule.check !== 'function') throw new TypeError('rule.check must be a function');
  if (typeof rule.severity !== 'number' || rule.severity < 1 || rule.severity > 10) {
    throw new RangeError('rule.severity must be in 1..10');
  }
  if (_rules.some((r) => r.id === rule.id)) {
    throw new Error(`rule id already exists: ${rule.id}`);
  }
}

function addRule(rule) {
  _validateRule(rule);
  const frozen = Object.freeze({ ...rule });
  _rules.push(frozen);
  return frozen;
}

function listRules() {
  return _rules.slice();
}

function getRuleById(id) {
  return _rules.find((r) => r.id === id) || null;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
/**
 * Evaluate all rules against a context.
 * @param {object} ctx
 * @returns {{ risk_score: number, triggered_rules: Array, recommended_action: 'allow'|'review'|'block' }}
 */
function evaluateRules(ctx) {
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  const triggered = [];
  let rawScore = 0;
  const maxRaw = _rules.reduce((a, r) => a + r.severity, 0);

  for (const rule of _rules) {
    let hit = false;
    let err = null;
    try {
      hit = !!rule.check(context);
    } catch (e) {
      err = e && e.message ? String(e.message) : String(e);
    }
    if (hit) {
      rawScore += rule.severity;
      triggered.push({
        id: rule.id,
        name_he: rule.name_he,
        name_en: rule.name_en,
        severity: rule.severity,
        message_he: rule.message_he,
        message_en: rule.message_en,
        error: err || undefined,
      });
    }
  }

  // Scale to 0..100. Use sqrt-ish weighting so one severe rule still
  // contributes meaningfully without requiring every rule to trigger for 100.
  let risk = 0;
  if (maxRaw > 0) {
    const linear = (rawScore / maxRaw) * 100;
    // Boost: a single severity-10 should already flag review (~40).
    const boost = Math.min(100, rawScore * 4);
    risk = Math.max(linear, boost);
    if (risk > 100) risk = 100;
  }
  risk = Math.round(risk * 100) / 100;

  let action = 'allow';
  if (risk >= 60) action = 'block';
  else if (risk >= 25) action = 'review';

  return {
    risk_score: risk,
    triggered_rules: triggered,
    recommended_action: action,
  };
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

function _actionLabelHe(a) {
  if (a === 'block') return 'חסימה';
  if (a === 'review') return 'בדיקה ידנית';
  return 'אישור אוטומטי';
}
function _actionLabelEn(a) {
  if (a === 'block') return 'BLOCK';
  if (a === 'review') return 'REVIEW';
  return 'ALLOW';
}

/**
 * Build a bilingual human-readable explanation of an evaluation result.
 * @param {object} result  output of evaluateRules
 * @returns {{ he: string, en: string, summary: object }}
 */
function explainDecision(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('explainDecision: result must be an object');
  }
  const triggered = Array.isArray(result.triggered_rules) ? result.triggered_rules : [];
  const score = typeof result.risk_score === 'number' ? result.risk_score : 0;
  const action = result.recommended_action || 'allow';

  const heLines = [
    `ציון סיכון: ${score} / 100`,
    `המלצה: ${_actionLabelHe(action)}`,
    `כללים שזוהו: ${triggered.length}`,
  ];
  const enLines = [
    `Risk score: ${score} / 100`,
    `Recommendation: ${_actionLabelEn(action)}`,
    `Triggered rules: ${triggered.length}`,
  ];

  if (triggered.length > 0) {
    heLines.push('פירוט:');
    enLines.push('Details:');
    for (const t of triggered) {
      heLines.push(`  - [${t.id}] (חומרה ${t.severity}) ${t.name_he}: ${t.message_he}`);
      enLines.push(`  - [${t.id}] (severity ${t.severity}) ${t.name_en}: ${t.message_en}`);
    }
  }

  return {
    he: heLines.join('\n'),
    en: enLines.join('\n'),
    summary: {
      risk_score: score,
      recommended_action: action,
      triggered_count: triggered.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  evaluateRules,
  addRule,
  listRules,
  getRuleById,
  explainDecision,
  // Exposed helpers (for advanced callers / tests)
  _internals: {
    isValidTZ,
    isRoundAmount,
    countSequential,
    normAddr,
    ibanCountry,
    isWeekend,
    hourOfDay,
    hoursBetween,
    daysBetween,
    DEFAULT_HIGH_RISK_COUNTRIES,
    RED_FLAG_NAME_TOKENS,
  },
};
