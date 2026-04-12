/**
 * Expense Reports Manager — מנהל דו"חות הוצאות
 * Agent X-26 (Swarm 3B) — written 2026-04-11
 *
 * Full end-to-end employee expense-report backend for Techno-Kol Uzi
 * mega-ERP. Supports the eight Israeli tax-deductible categories, VAT
 * auto-split (17% default inclusive), per-diem and mileage calculators,
 * multi-currency normalization to ILS, duplicate detection, policy
 * violation flags, auto-categorization by description, approval workflow
 * and PDF export (pdfkit when present, plain-text fallback otherwise).
 *
 * Hebrew RTL + English bilingual labels throughout.
 *
 * Hard rules enforced by this module:
 *   • Zero external npm dependencies.           ← no require() of anything
 *                                                 outside node core + an
 *                                                 OPTIONAL dynamic pdfkit
 *                                                 probe.
 *   • Never deletes a report or line — only     ← status flags / soft
 *     appends to audit trails.                    amendments.
 *   • Append-only audit log per report.
 *   • All amounts stored in the original
 *     currency AND the ILS-converted value at
 *     the line date (historic FX).
 *
 * Public API (what payroll-autonomous & onyx-procurement wire up):
 *
 *   createReport(employeeId, title, period)
 *   addLine(reportId, line)
 *   updateLine(reportId, lineId, patch)              // soft — appends revision
 *   listReports(filter?)
 *   getReport(reportId)
 *   submitReport(reportId)
 *   approveReport(reportId, approverId, comment)
 *   rejectReport(reportId, approverId, reason)
 *   markReimbursed(reportId, reference)
 *   computeReimbursement(reportId)            → { grossIls, deductibleVat,
 *                                                  netIls, byCategory }
 *   validatePolicy(report)                    → violation[]
 *   exportPdf(reportId, outDir?)              → { path, size, engine }
 *
 *   attachReceipt(reportId, lineId, filePath) → line
 *   runOcr(reportId, lineId, ocrBridge?)      → { extracted, confidence }
 *   autoCategorize(description)               → category
 *   findDuplicates(report, candidate)         → duplicate[]
 *   computeMileage(km, engineSize)            → ILS
 *   computePerDiem(days, options?)            → ILS
 *   convertToIls(amount, currency, date, fxTable?) → ILS
 *
 * Constants exported for testing / UI reuse:
 *
 *   CATEGORIES                      — map of category id → {he, en, tax}
 *   DEFAULT_POLICY                  — Israeli-default caps & rates (2026)
 *   STATUS                          — enum draft/submitted/approved/…
 *   VAT_STANDARD                    — 0.17
 *
 *   _internal                       — exposed for the unit-test harness
 */

'use strict';

/* ────────────────────────────────────────────────────────────────
 *  Zero-dep imports (node:* only)
 * ────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ────────────────────────────────────────────────────────────────
 *  Constants — categories, VAT, policy defaults
 * ────────────────────────────────────────────────────────────── */

const VAT_STANDARD = 0.17; // 17% — Israel 2026

/**
 * Israeli tax-deductible expense categories.
 *   tax.vatDeductible   — whether input VAT is claimable (assumes proper
 *                          חשבונית מס with VAT breakdown exists).
 *   tax.incomeDeductible — whether the expense itself is income-tax
 *                          deductible against מס הכנסה.
 *   tax.partial          — optional partial deductibility ratio
 *                          (e.g. meals = 0 for business owner per חוזר
 *                          מס הכנסה 2/2020, but 100% per-diem for
 *                          employees travelling).
 */
const CATEGORIES = Object.freeze({
  meals: Object.freeze({
    id: 'meals',
    he: 'אש"ל',
    en: 'Meals & Per-diem',
    tax: Object.freeze({
      vatDeductible: false, // business-owner meals not deductible
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([
      'אוכל', 'מסעדה', 'ארוחה', 'קפה', 'אש"ל', 'אשל', 'שף',
      'restaurant', 'lunch', 'dinner', 'breakfast', 'meal', 'food',
      'cafe', 'coffee',
    ]),
  }),
  fuel: Object.freeze({
    id: 'fuel',
    he: 'דלק',
    en: 'Fuel',
    tax: Object.freeze({
      vatDeductible: true, // full VAT when on company vehicle
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([
      'דלק', 'בנזין', 'סולר', 'תחנת', 'פז', 'דור אלון', 'סונול', 'יפה נוף',
      'fuel', 'gas', 'petrol', 'diesel', 'paz', 'sonol', 'delek',
    ]),
  }),
  travel: Object.freeze({
    id: 'travel',
    he: 'נסיעות',
    en: 'Travel',
    tax: Object.freeze({
      vatDeductible: true,
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([
      'מונית', 'רכבת', 'אוטובוס', 'טיסה', 'גט', 'רב-קו', 'נסיעה',
      'taxi', 'bus', 'train', 'flight', 'airport', 'uber', 'gett',
      'rav-kav', 'ride',
    ]),
  }),
  lodging: Object.freeze({
    id: 'lodging',
    he: 'לינה',
    en: 'Lodging',
    tax: Object.freeze({
      vatDeductible: true,
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([
      'מלון', 'לינה', 'אירוח', 'צימר', 'אכסניה', 'דירות נופש',
      'hotel', 'motel', 'lodging', 'hostel', 'airbnb', 'booking',
    ]),
  }),
  equipment: Object.freeze({
    id: 'equipment',
    he: 'ציוד',
    en: 'Equipment',
    tax: Object.freeze({
      vatDeductible: true,
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([
      'ציוד', 'כלים', 'מחשב', 'מקלדת', 'עכבר', 'מסך', 'כיסא', 'חומרה',
      'equipment', 'hardware', 'tool', 'tools', 'laptop', 'keyboard',
      'monitor', 'chair', 'supplies',
    ]),
  }),
  hospitality: Object.freeze({
    id: 'hospitality',
    he: 'כיבוד',
    en: 'Hospitality',
    tax: Object.freeze({
      vatDeductible: false, // per תקנות מע"מ 15(א)
      incomeDeductible: true,
      partial: 0.8, // 80% deductible per מס הכנסה 2/2020
    }),
    keywords: Object.freeze([
      'כיבוד', 'מינרלים', 'עוגה', 'פירות', 'שתייה לאורחים', 'קייטרינג',
      'hospitality', 'snacks', 'catering', 'refreshments',
    ]),
  }),
  donation: Object.freeze({
    id: 'donation',
    he: 'תרומה',
    en: 'Donation',
    tax: Object.freeze({
      vatDeductible: false,
      incomeDeductible: true,
      partial: 0.35, // סעיף 46א — 35% tax credit
      requires46A: true,
    }),
    keywords: Object.freeze([
      'תרומה', 'עמותה', '46א', 'ארגון צדקה', 'קרן',
      'donation', 'charity', 'ngo', 'foundation',
    ]),
  }),
  other: Object.freeze({
    id: 'other',
    he: 'אחר',
    en: 'Other',
    tax: Object.freeze({
      vatDeductible: false,
      incomeDeductible: true,
      partial: 1.0,
    }),
    keywords: Object.freeze([]),
  }),
});

const CATEGORY_IDS = Object.freeze(Object.keys(CATEGORIES));

/**
 * Status enum for reports. Mutations are one-directional apart from
 * rejected→draft (employee re-edits and resubmits).
 */
const STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REIMBURSED: 'reimbursed',
});

/**
 * Allowed state transitions. Any attempt to move outside this table
 * throws an ExpenseError rather than silently updating the store.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['submitted']),
  submitted: Object.freeze(['approved', 'rejected']),
  approved: Object.freeze(['reimbursed']),
  rejected: Object.freeze(['draft', 'submitted']),
  reimbursed: Object.freeze([]),
});

/**
 * Israeli-default policy (April 2026). Callers may override per-report
 * or per-employee at run-time via createReport(…, { policy }).
 */
const DEFAULT_POLICY = Object.freeze({
  meals: Object.freeze({
    dailyCapIls: 150,
  }),
  lodging: Object.freeze({
    localNightCapIls: 600,
    abroadNightCapIls: 1200,
  }),
  mileage: Object.freeze({
    smallEngineRate: 2.50, // ≤1600cc
    largeEngineRate: 3.00, // >1600cc
    engineCutoffCc: 1600,
    dailyKmCap: 600,
  }),
  perDiem: Object.freeze({
    localDailyIls: 200,
    abroadDailyIls: 450,
    maxDays: 60,
  }),
  donation: Object.freeze({
    requires46A: true,
  }),
  general: Object.freeze({
    requireReceiptAboveIls: 325, // מס הכנסה — חובת תיעוד
    maxBackdateDays: 180,
    currency: 'ILS',
  }),
});

/* ────────────────────────────────────────────────────────────────
 *  Errors
 * ────────────────────────────────────────────────────────────── */

class ExpenseError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'ExpenseError';
    this.code = code || 'EXPENSE_ERROR';
    this.details = details || null;
  }
}

/* ────────────────────────────────────────────────────────────────
 *  ID helpers
 * ────────────────────────────────────────────────────────────── */

function newId(prefix) {
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

/* ────────────────────────────────────────────────────────────────
 *  FX table — historic rates for ILS conversion.
 *  Pre-seeded with a handful of common currencies (April 2026). The
 *  engine returns the rate for the closest date ≤ target; if nothing
 *  matches it falls back to the oldest known rate. In production a
 *  Bank of Israel feed would replace the seed — the interface stays
 *  the same.
 * ────────────────────────────────────────────────────────────── */

const DEFAULT_FX = Object.freeze({
  ILS: Object.freeze([{ date: '2020-01-01', rate: 1.0 }]),
  USD: Object.freeze([
    { date: '2020-01-01', rate: 3.50 },
    { date: '2023-01-01', rate: 3.60 },
    { date: '2025-01-01', rate: 3.70 },
    { date: '2026-01-01', rate: 3.65 },
  ]),
  EUR: Object.freeze([
    { date: '2020-01-01', rate: 3.90 },
    { date: '2023-01-01', rate: 3.85 },
    { date: '2025-01-01', rate: 3.95 },
    { date: '2026-01-01', rate: 4.00 },
  ]),
  GBP: Object.freeze([
    { date: '2020-01-01', rate: 4.50 },
    { date: '2023-01-01', rate: 4.45 },
    { date: '2025-01-01', rate: 4.60 },
    { date: '2026-01-01', rate: 4.65 },
  ]),
});

function lookupFx(currency, date, fxTable) {
  const table = fxTable || DEFAULT_FX;
  const code = (currency || 'ILS').toUpperCase();
  if (code === 'ILS') return 1.0;

  const rows = table[code];
  if (!rows || rows.length === 0) {
    throw new ExpenseError(
      `Unknown currency ${code}`,
      'FX_UNKNOWN_CURRENCY',
      { currency: code }
    );
  }

  // Pick the newest rate ≤ date; fall back to newest overall.
  const target = new Date(date || Date.now()).getTime();
  let best = rows[0];
  for (const row of rows) {
    const rt = new Date(row.date).getTime();
    if (rt <= target && rt >= new Date(best.date).getTime()) {
      best = row;
    }
  }
  return best.rate;
}

function convertToIls(amount, currency, date, fxTable) {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    throw new ExpenseError('Amount must be a finite number', 'BAD_AMOUNT');
  }
  const rate = lookupFx(currency, date, fxTable);
  return round2(n * rate);
}

/* ────────────────────────────────────────────────────────────────
 *  Math helpers
 * ────────────────────────────────────────────────────────────── */

function round2(n) {
  // Round half-up to 2 decimals without floating-point bite.
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * VAT auto-split — assumes the stored amount is VAT-INCLUDED (Israeli
 * convention for receipts). Returns {net, vat} both rounded to agorot.
 * If the caller passes vatRate=0 we return all of it as net.
 */
function splitVat(grossIncl, vatRate) {
  const rate = vatRate == null ? VAT_STANDARD : Number(vatRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new ExpenseError('VAT rate must be a non-negative number', 'BAD_VAT');
  }
  if (rate === 0) return { net: round2(grossIncl), vat: 0 };
  const net = round2(grossIncl / (1 + rate));
  const vat = round2(grossIncl - net);
  return { net, vat };
}

/* ────────────────────────────────────────────────────────────────
 *  Mileage & per-diem calculators
 * ────────────────────────────────────────────────────────────── */

function computeMileage(km, engineSize, policy) {
  const pol = (policy && policy.mileage) || DEFAULT_POLICY.mileage;
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0) {
    throw new ExpenseError('km must be non-negative number', 'BAD_KM');
  }
  const cc = Number(engineSize) || 1400;
  const rate = cc > pol.engineCutoffCc ? pol.largeEngineRate : pol.smallEngineRate;
  return round2(n * rate);
}

function computePerDiem(days, options) {
  const pol = (options && options.policy && options.policy.perDiem) ||
              DEFAULT_POLICY.perDiem;
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) {
    throw new ExpenseError('days must be non-negative number', 'BAD_DAYS');
  }
  const abroad = options && options.abroad === true;
  const cappedDays = Math.min(n, pol.maxDays);
  const rate = abroad ? pol.abroadDailyIls : pol.localDailyIls;
  return round2(cappedDays * rate);
}

/* ────────────────────────────────────────────────────────────────
 *  Auto-categorization — cheap keyword classifier over the
 *  description string (Hebrew & English). Returns 'other' when
 *  nothing matches. Case- and RTL-insensitive.
 * ────────────────────────────────────────────────────────────── */

function autoCategorize(description) {
  if (!description) return 'other';
  const hay = String(description).toLowerCase();
  let bestId = 'other';
  let bestScore = 0;
  for (const cat of Object.values(CATEGORIES)) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (hay.indexOf(kw.toLowerCase()) !== -1) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = cat.id;
    }
  }
  return bestId;
}

/* ────────────────────────────────────────────────────────────────
 *  Duplicate detection — matches on
 *      same employee + same category + same date (±1 day)
 *      + same vendor + amount within 1%.
 *  Returns an array of matching existing lines across ALL reports
 *  passed in the store.
 * ────────────────────────────────────────────────────────────── */

function findDuplicates(store, employeeId, candidate) {
  if (!candidate) return [];
  const out = [];
  const candDate = new Date(candidate.date).getTime();
  const candAmt = Number(candidate.amount);
  const candVendor = (candidate.vendor || '').trim().toLowerCase();
  const candCat = candidate.category || '';
  const candRepId = candidate.report_id || null;
  const candLineId = candidate.id || null;

  for (const rep of store.reports.values()) {
    if (rep.employee_id !== employeeId) continue;
    for (const line of rep.lines) {
      if (candLineId && line.id === candLineId) continue;
      if (line.category !== candCat) continue;
      if (candVendor && (line.vendor || '').trim().toLowerCase() !== candVendor) continue;
      const ldate = new Date(line.date).getTime();
      const diffDays = Math.abs(ldate - candDate) / 86400000;
      if (diffDays > 1) continue;
      const lamt = Number(line.amount);
      if (!Number.isFinite(lamt) || !Number.isFinite(candAmt)) continue;
      const pct = lamt === 0 ? 0 : Math.abs(lamt - candAmt) / Math.abs(lamt);
      if (pct > 0.01) continue;
      out.push({
        report_id: rep.id,
        line_id: line.id,
        match_reason: 'same employee/category/vendor/date/amount',
      });
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────
 *  Policy validation — returns an array of violation objects rather
 *  than throwing; UI displays them as warnings and the approver
 *  decides.
 * ────────────────────────────────────────────────────────────── */

function validatePolicy(report, policy) {
  const pol = policy || DEFAULT_POLICY;
  const violations = [];
  if (!report || !Array.isArray(report.lines)) return violations;

  // Aggregate meals per calendar date
  const mealsByDate = new Map();

  for (const line of report.lines) {
    const amtIls = Number(line.amount_ils != null ? line.amount_ils : line.amount);
    const when = (line.date || '').slice(0, 10);

    // Receipt required over threshold
    if (
      amtIls >= pol.general.requireReceiptAboveIls &&
      !line.receipt_ref &&
      line.category !== 'mileage'
    ) {
      violations.push({
        line_id: line.id,
        code: 'NO_RECEIPT',
        severity: 'error',
        he: `נדרשת קבלה מעל ${pol.general.requireReceiptAboveIls} ₪`,
        en: `Receipt required above ₪${pol.general.requireReceiptAboveIls}`,
      });
    }

    // Lodging cap
    if (line.category === 'lodging') {
      const cap = line.abroad
        ? pol.lodging.abroadNightCapIls
        : pol.lodging.localNightCapIls;
      if (amtIls > cap) {
        violations.push({
          line_id: line.id,
          code: 'LODGING_OVER_CAP',
          severity: 'warn',
          he: `לינה מעל התקרה (${cap} ₪/לילה)`,
          en: `Lodging above cap (₪${cap}/night)`,
          cap,
          actual: amtIls,
        });
      }
    }

    // Meals daily cap — aggregate
    if (line.category === 'meals' && when) {
      mealsByDate.set(when, (mealsByDate.get(when) || 0) + amtIls);
    }

    // Mileage daily km cap
    if (line.category === 'fuel' && line.mileage) {
      const km = Number(line.mileage.km);
      if (km > pol.mileage.dailyKmCap) {
        violations.push({
          line_id: line.id,
          code: 'MILEAGE_OVER_DAILY_KM',
          severity: 'warn',
          he: `נסועה מעל ${pol.mileage.dailyKmCap} ק"מ ליום`,
          en: `Mileage above daily ${pol.mileage.dailyKmCap} km cap`,
        });
      }
    }

    // 46א for donations
    if (line.category === 'donation' && pol.donation.requires46A) {
      const has46a = !!(line.meta && line.meta.receipt46a);
      if (!has46a) {
        violations.push({
          line_id: line.id,
          code: 'DONATION_NO_46A',
          severity: 'error',
          he: 'תרומה ללא אישור 46א',
          en: 'Donation missing 46A certificate',
        });
      }
    }

    // Backdate
    if (line.date) {
      const age = (Date.now() - new Date(line.date).getTime()) / 86400000;
      if (age > pol.general.maxBackdateDays) {
        violations.push({
          line_id: line.id,
          code: 'TOO_OLD',
          severity: 'warn',
          he: `הוצאה ישנה מ־${pol.general.maxBackdateDays} ימים`,
          en: `Expense older than ${pol.general.maxBackdateDays} days`,
        });
      }
    }

    // Future date
    if (line.date && new Date(line.date).getTime() > Date.now() + 86400000) {
      violations.push({
        line_id: line.id,
        code: 'FUTURE_DATE',
        severity: 'error',
        he: 'תאריך עתידי',
        en: 'Future-dated expense',
      });
    }
  }

  // Meals daily cap
  for (const [day, total] of mealsByDate) {
    if (total > pol.meals.dailyCapIls) {
      violations.push({
        code: 'MEALS_OVER_DAILY_CAP',
        severity: 'warn',
        day,
        he: `אש"ל מעל התקרה היומית (${pol.meals.dailyCapIls} ₪)`,
        en: `Meals above daily cap (₪${pol.meals.dailyCapIls})`,
        cap: pol.meals.dailyCapIls,
        actual: round2(total),
      });
    }
  }

  return violations;
}

/* ────────────────────────────────────────────────────────────────
 *  Reimbursement calculator — pure function over a report
 * ────────────────────────────────────────────────────────────── */

function computeReimbursement(report) {
  if (!report) throw new ExpenseError('Missing report', 'NO_REPORT');
  let grossIls = 0;
  let deductibleVat = 0;
  const byCategory = {};

  for (const line of report.lines || []) {
    const ilsAmount = Number(
      line.amount_ils != null ? line.amount_ils : line.amount
    );
    if (!Number.isFinite(ilsAmount)) continue;
    grossIls += ilsAmount;

    const cat = CATEGORIES[line.category] || CATEGORIES.other;
    const vatPortion = Number(line.vat_ils || 0);
    if (cat.tax.vatDeductible && line.has_tax_invoice === true && vatPortion > 0) {
      deductibleVat += vatPortion;
    }

    const bucket = (byCategory[line.category] || { gross: 0, vat: 0, net: 0 });
    bucket.gross = round2(bucket.gross + ilsAmount);
    bucket.vat = round2(bucket.vat + (vatPortion || 0));
    bucket.net = round2(bucket.gross - bucket.vat);
    byCategory[line.category] = bucket;
  }

  grossIls = round2(grossIls);
  deductibleVat = round2(deductibleVat);
  const netIls = round2(grossIls - deductibleVat);

  return {
    grossIls,
    deductibleVat,
    netIls,
    byCategory,
  };
}

/* ────────────────────────────────────────────────────────────────
 *  Store — in-memory reference implementation. Production callers
 *  can pass an adapter with the same {reports, put, get} shape
 *  backed by SQLite / Postgres.
 * ────────────────────────────────────────────────────────────── */

function createStore() {
  return {
    reports: new Map(), // id → report
    auditLog: [], // global append-only
  };
}

/* ────────────────────────────────────────────────────────────────
 *  Audit trail — appends to report.audit AND global log.
 * ────────────────────────────────────────────────────────────── */

function auditAppend(store, report, event) {
  const entry = Object.assign({
    id: newId('aud'),
    report_id: report ? report.id : null,
    ts: nowIso(),
  }, event);
  if (report) {
    if (!Array.isArray(report.audit)) report.audit = [];
    report.audit.push(entry);
  }
  store.auditLog.push(entry);
  return entry;
}

/* ────────────────────────────────────────────────────────────────
 *  Core mutations
 * ────────────────────────────────────────────────────────────── */

function createReport(store, employeeId, title, period, options) {
  if (!employeeId) throw new ExpenseError('employeeId required', 'NO_EMPLOYEE');
  if (!title) throw new ExpenseError('title required', 'NO_TITLE');
  if (!period || !period.from || !period.to) {
    throw new ExpenseError(
      'period { from, to } required',
      'NO_PERIOD'
    );
  }
  const id = newId('rep');
  const report = {
    id,
    employee_id: String(employeeId),
    title: String(title),
    period: { from: period.from, to: period.to },
    status: STATUS.DRAFT,
    total: 0,
    total_ils: 0,
    currency: (options && options.currency) || 'ILS',
    policy: (options && options.policy) || null, // null → use default
    lines: [],
    approvals: [],
    audit: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.reports.set(id, report);
  auditAppend(store, report, {
    type: 'report.created',
    actor: employeeId,
    title: report.title,
  });
  return report;
}

function recalcTotals(report) {
  let total = 0;
  let totalIls = 0;
  for (const line of report.lines) {
    total += Number(line.amount || 0);
    totalIls += Number(line.amount_ils != null ? line.amount_ils : line.amount || 0);
  }
  report.total = round2(total);
  report.total_ils = round2(totalIls);
}

function addLine(store, reportId, rawLine, options) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  if (report.status !== STATUS.DRAFT && report.status !== STATUS.REJECTED) {
    throw new ExpenseError(
      `Cannot add line to report in status ${report.status}`,
      'BAD_STATUS'
    );
  }
  if (!rawLine || typeof rawLine !== 'object') {
    throw new ExpenseError('line object required', 'NO_LINE');
  }

  const category = rawLine.category || autoCategorize(rawLine.description);
  if (!CATEGORIES[category]) {
    throw new ExpenseError(`Unknown category ${category}`, 'BAD_CATEGORY');
  }
  const currency = (rawLine.currency || report.currency || 'ILS').toUpperCase();
  const amount = Number(rawLine.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ExpenseError('amount must be non-negative number', 'BAD_AMOUNT');
  }
  const date = rawLine.date || nowIso().slice(0, 10);

  // FX conversion to ILS (historic)
  const fxTable = (options && options.fxTable) || DEFAULT_FX;
  const amountIls = convertToIls(amount, currency, date, fxTable);

  // VAT split
  const vatRate = rawLine.vat_rate != null ? Number(rawLine.vat_rate) : VAT_STANDARD;
  const hasTaxInvoice = rawLine.has_tax_invoice === true;
  const { vat } = splitVat(amount, vatRate);
  const vatIls = convertToIls(vat, currency, date, fxTable);

  // Mileage auto-compute for fuel + mileage-only lines
  let mileageComputed = null;
  if (rawLine.mileage && Number.isFinite(Number(rawLine.mileage.km))) {
    const pol = report.policy || DEFAULT_POLICY;
    mileageComputed = computeMileage(
      rawLine.mileage.km,
      rawLine.mileage.engine_cc,
      pol
    );
  }

  const line = {
    id: newId('ln'),
    report_id: reportId,
    date,
    category,
    description: rawLine.description || '',
    amount,
    currency,
    amount_ils: amountIls,
    vat,
    vat_ils: vatIls,
    vat_rate: vatRate,
    has_tax_invoice: hasTaxInvoice,
    receipt_ref: rawLine.receipt_ref || null,
    vendor: rawLine.vendor || null,
    mileage: rawLine.mileage || null,
    mileage_ils: mileageComputed,
    abroad: rawLine.abroad === true,
    meta: rawLine.meta || {},
    revisions: [],
    created_at: nowIso(),
  };

  // If this is an explicit mileage line with no cash amount, fold the
  // computed reimbursement into the amount fields.
  if (line.category === 'fuel' && line.amount === 0 && mileageComputed != null) {
    line.amount = mileageComputed;
    line.amount_ils = mileageComputed;
  }

  report.lines.push(line);
  recalcTotals(report);
  report.updated_at = nowIso();
  auditAppend(store, report, {
    type: 'line.added',
    line_id: line.id,
    category: line.category,
    amount: line.amount,
    currency: line.currency,
  });
  return line;
}

function updateLine(store, reportId, lineId, patch) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  if (report.status !== STATUS.DRAFT && report.status !== STATUS.REJECTED) {
    throw new ExpenseError(
      `Cannot update line in status ${report.status}`,
      'BAD_STATUS'
    );
  }
  const line = report.lines.find((l) => l.id === lineId);
  if (!line) throw new ExpenseError('Line not found', 'NO_LINE');
  const before = JSON.parse(JSON.stringify(line));
  // Soft revision — never discard old values.
  line.revisions.push({ ts: nowIso(), before });
  for (const k of Object.keys(patch || {})) {
    if (k === 'id' || k === 'report_id' || k === 'revisions') continue;
    line[k] = patch[k];
  }
  // Recompute derived fields if money changed
  if (patch && ('amount' in patch || 'currency' in patch || 'date' in patch)) {
    line.amount_ils = convertToIls(line.amount, line.currency, line.date);
    const { vat } = splitVat(line.amount, line.vat_rate);
    line.vat = vat;
    line.vat_ils = convertToIls(vat, line.currency, line.date);
  }
  recalcTotals(report);
  report.updated_at = nowIso();
  auditAppend(store, report, {
    type: 'line.updated',
    line_id: lineId,
    patch_keys: Object.keys(patch || {}),
  });
  return line;
}

function listReports(store, filter) {
  const out = [];
  for (const r of store.reports.values()) {
    if (!filter) { out.push(r); continue; }
    if (filter.employee_id && r.employee_id !== filter.employee_id) continue;
    if (filter.status && r.status !== filter.status) continue;
    out.push(r);
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function getReport(store, reportId) {
  const r = store.reports.get(reportId);
  if (!r) throw new ExpenseError('Report not found', 'NO_REPORT');
  return r;
}

function _transition(store, reportId, next, actor, extra) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  const allowed = ALLOWED_TRANSITIONS[report.status] || [];
  if (allowed.indexOf(next) === -1) {
    throw new ExpenseError(
      `Illegal transition ${report.status} → ${next}`,
      'BAD_TRANSITION',
      { from: report.status, to: next }
    );
  }
  const prev = report.status;
  report.status = next;
  report.updated_at = nowIso();
  auditAppend(store, report, Object.assign({
    type: 'status.changed',
    actor,
    from: prev,
    to: next,
  }, extra || {}));
  return report;
}

function submitReport(store, reportId) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  if (report.lines.length === 0) {
    throw new ExpenseError('Cannot submit empty report', 'EMPTY_REPORT');
  }
  // Block submission on hard (error) violations
  const violations = validatePolicy(report, report.policy || DEFAULT_POLICY);
  const errors = violations.filter((v) => v.severity === 'error');
  if (errors.length > 0) {
    throw new ExpenseError(
      'Report has blocking policy violations',
      'POLICY_VIOLATION',
      { violations: errors }
    );
  }
  _transition(store, reportId, STATUS.SUBMITTED, report.employee_id, {
    violations_warn: violations.length - errors.length,
  });
  return report;
}

function _appendApproval(report, step, approverId, decision, comment) {
  report.approvals.push({
    report_id: report.id,
    step,
    approver: String(approverId),
    decision, // 'approve' | 'reject'
    comment: comment || '',
    timestamp: nowIso(),
  });
}

function approveReport(store, reportId, approverId, comment) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  if (report.status !== STATUS.SUBMITTED) {
    throw new ExpenseError('Report not in submitted state', 'BAD_STATUS');
  }
  _appendApproval(report, report.approvals.length + 1, approverId, 'approve', comment);
  _transition(store, reportId, STATUS.APPROVED, approverId, { comment });
  return report;
}

function rejectReport(store, reportId, approverId, reason) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  if (report.status !== STATUS.SUBMITTED) {
    throw new ExpenseError('Report not in submitted state', 'BAD_STATUS');
  }
  if (!reason) throw new ExpenseError('Reject reason required', 'NO_REASON');
  _appendApproval(report, report.approvals.length + 1, approverId, 'reject', reason);
  _transition(store, reportId, STATUS.REJECTED, approverId, { reason });
  return report;
}

function markReimbursed(store, reportId, reference) {
  const report = store.reports.get(reportId);
  if (!report) throw new ExpenseError('Report not found', 'NO_REPORT');
  _transition(store, reportId, STATUS.REIMBURSED, 'system', {
    reference: reference || null,
  });
  return report;
}

/* ────────────────────────────────────────────────────────────────
 *  Receipt attach + OCR stub
 * ────────────────────────────────────────────────────────────── */

function attachReceipt(store, reportId, lineId, filePath) {
  const report = getReport(store, reportId);
  const line = report.lines.find((l) => l.id === lineId);
  if (!line) throw new ExpenseError('Line not found', 'NO_LINE');
  if (!filePath) throw new ExpenseError('filePath required', 'NO_PATH');
  // Sanity — just record the path; do NOT copy/delete files.
  line.receipt_ref = String(filePath);
  line.receipt_filename = path.basename(filePath);
  recalcTotals(report); // a no-op but keeps updated_at fresh below
  report.updated_at = nowIso();
  auditAppend(store, report, {
    type: 'receipt.attached',
    line_id: lineId,
    path: line.receipt_ref,
  });
  return line;
}

/**
 * OCR stub — hooks into onyx-procurement Agent 88 (invoice-ocr.js) when
 * present, otherwise returns an empty low-confidence placeholder so the
 * rest of the pipeline still resolves. Caller may inject a custom
 * `ocrBridge` function for testing.
 */
function runOcr(store, reportId, lineId, ocrBridge) {
  const report = getReport(store, reportId);
  const line = report.lines.find((l) => l.id === lineId);
  if (!line) throw new ExpenseError('Line not found', 'NO_LINE');
  if (!line.receipt_ref) {
    throw new ExpenseError('No receipt attached', 'NO_RECEIPT');
  }

  let extracted = null;
  let confidence = 0;
  let engine = 'stub';

  const bridge = ocrBridge || _tryResolveOcrBridge();
  if (bridge) {
    try {
      const result = bridge({
        path: line.receipt_ref,
        hint: { category: line.category, vendor: line.vendor },
      });
      extracted = (result && result.extracted) || result || null;
      confidence = (result && result.confidence) || 0.5;
      engine = (result && result.engine) || 'bridged';
    } catch (_) {
      // Fall through to stub result.
    }
  }

  if (!extracted) {
    extracted = {
      vendor: line.vendor || null,
      date: line.date,
      total: line.amount,
      currency: line.currency,
      vat_rate: line.vat_rate,
    };
    confidence = 0.0;
  }

  auditAppend(store, report, {
    type: 'ocr.run',
    line_id: lineId,
    engine,
    confidence,
  });
  return { extracted, confidence, engine };
}

function _tryResolveOcrBridge() {
  try {
    // Lazy-require so the test harness can run without the invoice-ocr
    // module being on disk.
    // eslint-disable-next-line global-require
    const mod = require('../ocr/invoice-ocr.js');
    if (mod && typeof mod.scanInvoice === 'function') {
      return ({ path: p }) => {
        const raw = mod.scanInvoice({ path: p, backend: 'mock' });
        return {
          extracted: raw && raw.invoice ? raw.invoice : raw,
          confidence: (raw && raw.confidence) || 0.5,
          engine: 'agent-88',
        };
      };
    }
  } catch (_) {
    // invoice-ocr not available — that's fine.
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
 *  PDF export — uses pdfkit when present, otherwise writes a plain
 *  text .pdf.txt fallback so archive workflows still succeed.
 * ────────────────────────────────────────────────────────────── */

function exportPdf(store, reportId, outDir, options) {
  const report = getReport(store, reportId);
  const dir = outDir || path.join(
    process.cwd(), '_exports', 'expense-reports'
  );
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }

  const reimbursement = computeReimbursement(report);
  const violations = validatePolicy(report, report.policy || DEFAULT_POLICY);

  // Default = synchronous text fallback so callers never deal with a
  // promise. Opt-in to pdfkit binary rendering via
  // options.usePdfKit = true — in that mode the function returns a
  // Promise because pdfkit emits data asynchronously.
  let pdfkit = null;
  if (options && options.usePdfKit) {
    try {
      // eslint-disable-next-line global-require
      pdfkit = require('pdfkit');
    } catch (_) { pdfkit = null; }
  }

  if (pdfkit) {
    const outPath = path.join(dir, `${report.id}.pdf`);
    return new Promise((resolve, reject) => {
      try {
        const doc = new pdfkit({ size: 'A4', margin: 40 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => {
          try {
            const buf = Buffer.concat(chunks);
            fs.writeFileSync(outPath, buf);
            resolve({ path: outPath, size: buf.length, engine: 'pdfkit' });
          } catch (e) { reject(e); }
        });
        doc.on('error', reject);

        doc.fontSize(18).text('דו"ח הוצאות / Expense Report', { align: 'right' });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`ID: ${report.id}`, { align: 'left' });
        doc.text(`עובד / Employee: ${report.employee_id}`, { align: 'right' });
        doc.text(`תקופה / Period: ${report.period.from} → ${report.period.to}`, { align: 'right' });
        doc.text(`סטטוס / Status: ${report.status}`, { align: 'right' });
        doc.moveDown(0.5);

        for (const line of report.lines) {
          const cat = CATEGORIES[line.category];
          doc.text(
            `${line.date}  ${cat.he} / ${cat.en}  ${line.description}  ${line.amount} ${line.currency} (₪${line.amount_ils})`,
            { align: 'right' }
          );
        }
        doc.moveDown(0.5);
        doc.text(`סה״כ ברוטו / Gross: ₪${reimbursement.grossIls}`, { align: 'right' });
        doc.text(`מע"מ להחזר / Deductible VAT: ₪${reimbursement.deductibleVat}`, { align: 'right' });
        doc.text(`נטו להחזר / Net reimbursement: ₪${reimbursement.netIls}`, { align: 'right' });

        if (violations.length) {
          doc.moveDown(0.5);
          doc.text('חריגות מדיניות / Policy violations:', { align: 'right' });
          for (const v of violations) {
            doc.text(` • ${v.he} / ${v.en}`, { align: 'right' });
          }
        }
        doc.end();
      } catch (e) { reject(e); }
    });
  }

  // Fallback: plain-text PDF stand-in
  const outPath = path.join(dir, `${report.id}.pdf.txt`);
  const lines = [];
  lines.push('דו"ח הוצאות / Expense Report');
  lines.push(`ID: ${report.id}`);
  lines.push(`עובד / Employee: ${report.employee_id}`);
  lines.push(`תקופה / Period: ${report.period.from} → ${report.period.to}`);
  lines.push(`סטטוס / Status: ${report.status}`);
  lines.push('');
  lines.push('שורות / Lines:');
  for (const line of report.lines) {
    const cat = CATEGORIES[line.category];
    lines.push(
      ` - ${line.date} | ${cat.he}/${cat.en} | ${line.description} | ` +
      `${line.amount} ${line.currency} (₪${line.amount_ils}) | ` +
      `vendor=${line.vendor || '-'}`
    );
  }
  lines.push('');
  lines.push(`סה״כ ברוטו / Gross: ₪${reimbursement.grossIls}`);
  lines.push(`מע"מ להחזר / Deductible VAT: ₪${reimbursement.deductibleVat}`);
  lines.push(`נטו להחזר / Net reimbursement: ₪${reimbursement.netIls}`);
  if (violations.length) {
    lines.push('');
    lines.push('חריגות מדיניות / Policy violations:');
    for (const v of violations) {
      lines.push(` * [${v.severity}] ${v.code} — ${v.he} / ${v.en}`);
    }
  }
  const content = lines.join('\n');
  fs.writeFileSync(outPath, content, 'utf8');
  return { path: outPath, size: Buffer.byteLength(content, 'utf8'), engine: 'text-fallback' };
}

/* ────────────────────────────────────────────────────────────────
 *  High-level facade — returns an object that binds a private store.
 *  Makes the module easy to embed inside procurement orchestrators
 *  or drop into a REST adapter.
 * ────────────────────────────────────────────────────────────── */

function createExpenseManager(options) {
  const store = (options && options.store) || createStore();
  const policy = (options && options.policy) || DEFAULT_POLICY;
  const fxTable = (options && options.fxTable) || DEFAULT_FX;

  return {
    store,
    policy,

    createReport: (employeeId, title, period, opts) =>
      createReport(store, employeeId, title, period, Object.assign({ policy }, opts)),
    addLine: (reportId, line) => addLine(store, reportId, line, { fxTable }),
    updateLine: (reportId, lineId, patch) => updateLine(store, reportId, lineId, patch),
    listReports: (filter) => listReports(store, filter),
    getReport: (reportId) => getReport(store, reportId),

    submitReport: (reportId) => submitReport(store, reportId),
    approveReport: (reportId, approverId, comment) =>
      approveReport(store, reportId, approverId, comment),
    rejectReport: (reportId, approverId, reason) =>
      rejectReport(store, reportId, approverId, reason),
    markReimbursed: (reportId, ref) => markReimbursed(store, reportId, ref),

    attachReceipt: (reportId, lineId, filePath) =>
      attachReceipt(store, reportId, lineId, filePath),
    runOcr: (reportId, lineId, bridge) => runOcr(store, reportId, lineId, bridge),

    computeReimbursement: (reportId) =>
      computeReimbursement(getReport(store, reportId)),
    validatePolicy: (reportId) =>
      validatePolicy(getReport(store, reportId), policy),
    findDuplicates: (employeeId, candidate) =>
      findDuplicates(store, employeeId, candidate),
    exportPdf: (reportId, outDir) => exportPdf(store, reportId, outDir),

    // helpers exposed for UI
    autoCategorize,
    computeMileage: (km, cc) => computeMileage(km, cc, policy),
    computePerDiem: (days, opts) =>
      computePerDiem(days, Object.assign({ policy }, opts)),
    convertToIls: (amount, currency, date) =>
      convertToIls(amount, currency, date, fxTable),
  };
}

/* ────────────────────────────────────────────────────────────────
 *  Exports
 * ────────────────────────────────────────────────────────────── */

module.exports = {
  // facade
  createExpenseManager,

  // top-level functional API (thin wrappers)
  createReport,
  addLine,
  updateLine,
  submitReport,
  approveReport,
  rejectReport,
  markReimbursed,
  computeReimbursement,
  validatePolicy,
  exportPdf,
  attachReceipt,
  runOcr,
  autoCategorize,
  computeMileage,
  computePerDiem,
  convertToIls,
  findDuplicates,
  splitVat,
  createStore,
  listReports,
  getReport,

  // constants
  CATEGORIES,
  CATEGORY_IDS,
  STATUS,
  ALLOWED_TRANSITIONS,
  DEFAULT_POLICY,
  VAT_STANDARD,
  DEFAULT_FX,

  // errors
  ExpenseError,

  // for tests
  _internal: {
    lookupFx,
    round2,
    _tryResolveOcrBridge,
    _transition,
    recalcTotals,
    newId,
  },
};
