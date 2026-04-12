/* ============================================================================
 * Techno-Kol ERP — Petty Cash / Imprest Fund Manager
 * Agent X-44 / Swarm 3C / Onyx Procurement
 * ----------------------------------------------------------------------------
 * מודול קופה קטנה — שיטת ה־Imprest (סכום קבוע)
 *
 *   - קרן בעלת סכום קבוע (צף / float)
 *   - כל הוצאה מגובה בתלוש (voucher) ממוספר סדרתי
 *   - חידוש הקרן כאשר נותר מעט מזומן
 *   - ספירת מזומן יומית
 *   - ביקורת פתע על ידי רואה חשבון / מבקר פנים
 *   - הפרדת סמכויות — הגזבר (custodian) לא יכול לאשר לעצמו
 *
 * Israeli compliance:
 *   - חשבונית מס נדרשת מעל 300 ש"ח לצורך ניכוי מס תשומות
 *   - חוק צמצום השימוש במזומן 2018 — תקרה 6,000 ש"ח לעסקה לעסקים
 *   - VAT / מע"מ ניתן להחזרה רק עם חשבונית מס תקינה
 *
 * RULES:
 *   - NEVER delete data — soft-delete via status transitions only.
 *   - Hebrew bilingual labels on every error / event.
 *   - Zero dependencies — plain JS, runs in Node + browser.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Constants — חוקים ותקרות ישראליים
 * -------------------------------------------------------------------------- */

/** Receipt mandatory above 50 ILS (internal control) */
const RECEIPT_THRESHOLD_ILS = 50;

/** Tax invoice (חשבונית מס) required for VAT deduction above 300 ILS */
const TAX_INVOICE_THRESHOLD_ILS = 300;

/** Cash law maximum per transaction for businesses (חוק צמצום השימוש במזומן 2018) */
const CASH_LAW_LIMIT_ILS = 6000;

/** Default float when not specified */
const DEFAULT_FLOAT_ILS = 3000;

/** VAT rate as of 2026 (17%) — can be overridden per voucher */
const DEFAULT_VAT_RATE = 0.17;

/** Replenishment trigger ratio — when balance < 20% of float */
const REPLENISH_THRESHOLD_RATIO = 0.20;

/** Over-threshold requiring second approver (₪1,000) */
const OVER_THRESHOLD_APPROVAL_ILS = 1000;

/** Voucher status machine */
const VOUCHER_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  PAID: 'paid',
  REPLENISHED: 'replenished',
  VOIDED: 'voided',
  REJECTED: 'rejected'
});

/** Fund status */
const FUND_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CLOSED: 'closed'
});

/** Replenishment request status */
const REPLENISH_STATUS = Object.freeze({
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ISSUED: 'issued',
  POSTED: 'posted'
});

/** Default expense categories (גילאי קופה קטנה) */
const DEFAULT_CATEGORIES = Object.freeze([
  { code: 'OFFICE',    he: 'חומרי משרד',       gl: '5110' },
  { code: 'TRAVEL',    he: 'נסיעות',           gl: '5210' },
  { code: 'MEALS',     he: 'כיבוד',            gl: '5310' },
  { code: 'CLEANING',  he: 'ניקיון',           gl: '5410' },
  { code: 'POSTAGE',   he: 'דואר ומשלוחים',    gl: '5510' },
  { code: 'REPAIRS',   he: 'תיקונים קלים',     gl: '5610' },
  { code: 'MISC',      he: 'שונות',            gl: '5910' }
]);

/** GL accounts used by petty cash */
const GL_ACCOUNTS = Object.freeze({
  PETTY_CASH:    '1110', // Asset
  CASH_IN_BANK:  '1100', // Asset (source of replenishment)
  VAT_INPUT:     '1510', // Asset (recoverable VAT)
  SUSPENSE:      '1900'  // Suspense for variances
});

/* ----------------------------------------------------------------------------
 * In-memory store (pluggable — swap via createStore())
 * -------------------------------------------------------------------------- */

function createMemoryStore() {
  return {
    funds: new Map(),          // fundId -> Fund
    vouchers: new Map(),       // voucherId -> Voucher
    replenishments: new Map(), // replId -> Replenishment
    counts: new Map(),         // countId -> Count
    audits: [],                // append-only audit log
    voucherSeq: new Map(),     // fundId -> next sequential number
    fundSeq: 0,
    replSeq: 0,
    countSeq: 0
  };
}

let _store = createMemoryStore();

/** Replace or reset the store (testing / custom persistence) */
function setStore(newStore) {
  _store = newStore || createMemoryStore();
  return _store;
}

function getStore() {
  return _store;
}

/* ----------------------------------------------------------------------------
 * Helpers — money, id, time, clone, audit log
 * -------------------------------------------------------------------------- */

function round2(n) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

function genFundId(store) {
  store.fundSeq = (store.fundSeq || 0) + 1;
  return `FND-${String(store.fundSeq).padStart(5, '0')}`;
}

function genVoucherId(store, fundId) {
  const seq = (store.voucherSeq.get(fundId) || 0) + 1;
  store.voucherSeq.set(fundId, seq);
  return `${fundId}-V${String(seq).padStart(6, '0')}`;
}

function genReplenishmentId(store) {
  store.replSeq = (store.replSeq || 0) + 1;
  return `REP-${String(store.replSeq).padStart(5, '0')}`;
}

function genCountId(store) {
  store.countSeq = (store.countSeq || 0) + 1;
  return `CNT-${String(store.countSeq).padStart(5, '0')}`;
}

/**
 * Append-only audit log. Never deleted.
 * @param {string} fundId
 * @param {string} event
 * @param {object} payload
 */
function auditLog(fundId, event, payload) {
  const store = getStore();
  const entry = {
    id: store.audits.length + 1,
    fundId: fundId || null,
    event,
    at: nowIso(),
    actor: (payload && payload.actor) || null,
    data: clone(payload || {})
  };
  store.audits.push(entry);
  return entry;
}

/**
 * Hebrew + English error, never throws raw strings.
 */
function err(code, en, he, extra) {
  const e = new Error(`${code}: ${en} / ${he}`);
  e.code = code;
  e.en = en;
  e.he = he;
  if (extra) e.data = extra;
  return e;
}

/* ----------------------------------------------------------------------------
 * Fund management
 * -------------------------------------------------------------------------- */

/**
 * Create a new imprest petty cash fund.
 * @param {object} fields
 *   - name             : string (required)
 *   - nameHe           : string (Hebrew name)
 *   - floatAmount      : number (required, ILS, > 0, ≤ CASH_LAW_LIMIT)
 *   - custodianId      : string (required — employee responsible)
 *   - location         : string (physical location / branch)
 *   - approverIds      : string[] (at least 1 — cannot include custodian)
 *   - currency         : string (default 'ILS')
 *   - categories       : override default category list
 * @returns {string} fundId
 */
function createFund(fields) {
  const store = getStore();

  if (!fields || typeof fields !== 'object') {
    throw err('ERR_INVALID_INPUT', 'Fields required', 'שדות חובה חסרים');
  }
  const name = String(fields.name || '').trim();
  if (!name) {
    throw err('ERR_NAME_REQUIRED', 'Fund name required', 'שם קופה חובה');
  }
  const floatAmount = round2(fields.floatAmount || DEFAULT_FLOAT_ILS);
  if (!isPositiveNumber(floatAmount)) {
    throw err('ERR_FLOAT_INVALID', 'Float amount must be positive', 'סכום הקרן חייב להיות חיובי');
  }
  if (floatAmount > CASH_LAW_LIMIT_ILS) {
    throw err(
      'ERR_FLOAT_EXCEEDS_CASH_LAW',
      `Float ${floatAmount} exceeds cash law limit ${CASH_LAW_LIMIT_ILS}`,
      `סכום הקרן ${floatAmount} חורג מתקרת חוק צמצום השימוש במזומן ${CASH_LAW_LIMIT_ILS}`
    );
  }
  const custodianId = String(fields.custodianId || '').trim();
  if (!custodianId) {
    throw err('ERR_CUSTODIAN_REQUIRED', 'Custodian required', 'גזבר חובה');
  }
  const approverIds = Array.isArray(fields.approverIds) ? fields.approverIds.slice() : [];
  if (approverIds.length === 0) {
    throw err('ERR_APPROVER_REQUIRED', 'At least one approver required', 'חובה לפחות מאשר אחד');
  }
  if (approverIds.indexOf(custodianId) !== -1) {
    throw err(
      'ERR_SEGREGATION_OF_DUTIES',
      'Custodian cannot be approver (segregation of duties)',
      'הגזבר אינו יכול להיות מאשר (הפרדת סמכויות)'
    );
  }

  const id = genFundId(store);
  const fund = {
    id,
    name,
    nameHe: String(fields.nameHe || name),
    floatAmount,
    currentBalance: floatAmount, // starts fully funded
    custodianId,
    approverIds,
    location: String(fields.location || 'HQ'),
    currency: String(fields.currency || 'ILS'),
    categories: Array.isArray(fields.categories) && fields.categories.length
      ? fields.categories.slice()
      : DEFAULT_CATEGORIES.slice(),
    status: FUND_STATUS.ACTIVE,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastCountAt: null,
    lastReplenishAt: null,
    totalDisbursed: 0,
    totalReplenished: 0
  };
  store.funds.set(id, fund);
  store.voucherSeq.set(id, 0);

  auditLog(id, 'FUND_CREATED', {
    en: 'Petty cash fund created',
    he: 'נפתחה קופה קטנה חדשה',
    fund: clone(fund),
    actor: fields.createdBy || custodianId
  });

  return id;
}

/**
 * Look up fund by id, throws if missing.
 */
function getFund(fundId) {
  const f = getStore().funds.get(fundId);
  if (!f) {
    throw err('ERR_FUND_NOT_FOUND', `Fund ${fundId} not found`, `קופה ${fundId} לא נמצאה`);
  }
  return f;
}

function listFunds() {
  return Array.from(getStore().funds.values()).map(clone);
}

/* ----------------------------------------------------------------------------
 * Voucher / disbursement
 * -------------------------------------------------------------------------- */

function findCategory(fund, code) {
  if (!code) return null;
  const match = fund.categories.find((c) => c.code === code);
  return match ? clone(match) : null;
}

/**
 * Disburse cash from a fund against a voucher.
 * @param {string} fundId
 * @param {object} voucherData
 *   - payee          : string (required — vendor or employee)
 *   - amount         : number (required, gross, ILS)
 *   - category       : string (required — must exist in fund.categories)
 *   - date           : ISO date (default today)
 *   - description    : string
 *   - descriptionHe  : string
 *   - receiptRef     : string (file id / url — required over ₪50)
 *   - taxInvoiceRef  : string (required over ₪300 for VAT)
 *   - vatAmount      : number (VAT component in the gross amount)
 *   - vatRate        : number (decimal, default 0.17)
 *   - custodianPin   : string (authorisation — custodian must sign)
 *   - approverId     : string (required over OVER_THRESHOLD_APPROVAL)
 *   - issuedBy       : string (current user id)
 * @returns {string} voucherId
 */
function disburse(fundId, voucherData) {
  const store = getStore();
  const fund = getFund(fundId);

  if (fund.status !== FUND_STATUS.ACTIVE) {
    throw err(
      'ERR_FUND_NOT_ACTIVE',
      `Fund ${fundId} status=${fund.status}`,
      `קופה ${fundId} אינה פעילה (${fund.status})`
    );
  }
  if (!voucherData || typeof voucherData !== 'object') {
    throw err('ERR_INVALID_INPUT', 'Voucher data required', 'נדרש מידע על התלוש');
  }

  const payee = String(voucherData.payee || '').trim();
  if (!payee) {
    throw err('ERR_PAYEE_REQUIRED', 'Payee required', 'שם מקבל התשלום חובה');
  }

  const amount = round2(voucherData.amount);
  if (!isPositiveNumber(amount)) {
    throw err('ERR_AMOUNT_INVALID', 'Amount must be positive', 'הסכום חייב להיות חיובי');
  }

  // ---- Cash law 2018 ----
  if (amount > CASH_LAW_LIMIT_ILS) {
    throw err(
      'ERR_CASH_LAW_EXCEEDED',
      `Amount ${amount} exceeds cash law limit ${CASH_LAW_LIMIT_ILS}`,
      `הסכום ${amount} חורג מתקרת חוק צמצום השימוש במזומן ${CASH_LAW_LIMIT_ILS}`
    );
  }

  // ---- Category required ----
  const category = findCategory(fund, voucherData.category);
  if (!category) {
    throw err(
      'ERR_CATEGORY_UNKNOWN',
      `Unknown category ${voucherData.category}`,
      `קטגוריה לא מוכרת ${voucherData.category}`
    );
  }

  // ---- Receipt required over ₪50 ----
  const receiptRef = voucherData.receiptRef ? String(voucherData.receiptRef) : '';
  if (amount > RECEIPT_THRESHOLD_ILS && !receiptRef) {
    throw err(
      'ERR_RECEIPT_REQUIRED',
      `Receipt mandatory above ${RECEIPT_THRESHOLD_ILS} ILS`,
      `קבלה חובה מעל ${RECEIPT_THRESHOLD_ILS} ש"ח`
    );
  }

  // ---- Tax invoice required over ₪300 for VAT deduction ----
  const taxInvoiceRef = voucherData.taxInvoiceRef ? String(voucherData.taxInvoiceRef) : '';
  const vatRate = typeof voucherData.vatRate === 'number' ? voucherData.vatRate : DEFAULT_VAT_RATE;
  let vatAmount = round2(voucherData.vatAmount || 0);
  let vatRecoverable = false;

  if (amount > TAX_INVOICE_THRESHOLD_ILS) {
    if (!taxInvoiceRef) {
      throw err(
        'ERR_TAX_INVOICE_REQUIRED',
        `Tax invoice mandatory above ${TAX_INVOICE_THRESHOLD_ILS} ILS`,
        `חשבונית מס חובה מעל ${TAX_INVOICE_THRESHOLD_ILS} ש"ח`
      );
    }
    vatRecoverable = true;
    if (vatAmount === 0 && vatRate > 0) {
      // Derive VAT from gross: gross = net * (1 + vatRate); vat = gross - net
      const net = amount / (1 + vatRate);
      vatAmount = round2(amount - net);
    }
  }

  // ---- Custodian authorisation ----
  if (!voucherData.custodianPin) {
    throw err(
      'ERR_CUSTODIAN_PIN_REQUIRED',
      'Custodian PIN / signature required',
      'נדרשת חתימה / קוד גזבר'
    );
  }
  // (In production, compare hash. For demo, require non-empty.)

  // ---- Issuer separation ----
  const issuedBy = String(voucherData.issuedBy || '').trim();
  if (!issuedBy) {
    throw err('ERR_ISSUER_REQUIRED', 'Issuer required', 'חובה לציין את מבצע הפעולה');
  }

  // ---- Second approver over threshold ----
  let approverId = voucherData.approverId ? String(voucherData.approverId) : null;
  if (amount >= OVER_THRESHOLD_APPROVAL_ILS) {
    if (!approverId) {
      throw err(
        'ERR_APPROVER_REQUIRED_OVER_THRESHOLD',
        `Second approver required above ${OVER_THRESHOLD_APPROVAL_ILS}`,
        `נדרש מאשר שני מעל ${OVER_THRESHOLD_APPROVAL_ILS} ש"ח`
      );
    }
    if (fund.approverIds.indexOf(approverId) === -1) {
      throw err(
        'ERR_APPROVER_NOT_AUTHORISED',
        `${approverId} not authorised for fund ${fundId}`,
        `${approverId} אינו מורשה לאשר עבור קופה ${fundId}`
      );
    }
    if (approverId === fund.custodianId) {
      throw err(
        'ERR_SEGREGATION_OF_DUTIES',
        'Custodian cannot approve own disbursement',
        'הגזבר אינו יכול לאשר הוצאה לעצמו'
      );
    }
  }

  // ---- Cannot exceed float / current balance ----
  if (amount > fund.currentBalance) {
    throw err(
      'ERR_INSUFFICIENT_BALANCE',
      `Amount ${amount} exceeds current balance ${fund.currentBalance}`,
      `הסכום ${amount} חורג מיתרת הקופה ${fund.currentBalance}`
    );
  }

  // ---- Create voucher ----
  const voucherId = genVoucherId(store, fundId);
  const voucher = {
    id: voucherId,
    fundId,
    sequenceNo: store.voucherSeq.get(fundId),
    date: String(voucherData.date || todayIso()),
    payee,
    amount,
    net: round2(amount - vatAmount),
    vatAmount,
    vatRate,
    vatRecoverable,
    category: category.code,
    categoryHe: category.he,
    glAccount: category.gl,
    description: String(voucherData.description || ''),
    descriptionHe: String(voucherData.descriptionHe || ''),
    receiptRef,
    taxInvoiceRef,
    issuedBy,
    approverId,
    custodianSig: true, // PIN verified above
    status: VOUCHER_STATUS.PAID,
    createdAt: nowIso(),
    postedAt: null,
    replenishmentId: null
  };
  store.vouchers.set(voucherId, voucher);

  // ---- Update fund balance ----
  fund.currentBalance = round2(fund.currentBalance - amount);
  fund.totalDisbursed = round2(fund.totalDisbursed + amount);
  fund.updatedAt = nowIso();

  auditLog(fundId, 'VOUCHER_DISBURSED', {
    en: `Disbursed ${amount} to ${payee}`,
    he: `שולם סך ${amount} ל־${payee}`,
    voucherId,
    amount,
    balanceAfter: fund.currentBalance,
    actor: issuedBy
  });

  return voucherId;
}

function getVoucher(voucherId) {
  const v = getStore().vouchers.get(voucherId);
  if (!v) {
    throw err('ERR_VOUCHER_NOT_FOUND', `Voucher ${voucherId} not found`, `תלוש ${voucherId} לא נמצא`);
  }
  return v;
}

function listVouchersByFund(fundId, filter) {
  const f = filter || {};
  return Array.from(getStore().vouchers.values())
    .filter((v) => {
      if (v.fundId !== fundId) return false;
      if (f.status && v.status !== f.status) return false;
      if (f.from && v.date < f.from) return false;
      if (f.to && v.date > f.to) return false;
      if (f.category && v.category !== f.category) return false;
      return true;
    })
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map(clone);
}

/**
 * Void a voucher (never delete). Requires approver (not custodian).
 */
function voidVoucher(voucherId, approverId, reason) {
  const store = getStore();
  const voucher = getVoucher(voucherId);
  const fund = getFund(voucher.fundId);

  if (voucher.status === VOUCHER_STATUS.VOIDED) {
    throw err('ERR_ALREADY_VOIDED', 'Already voided', 'כבר בוטל');
  }
  if (voucher.status === VOUCHER_STATUS.REPLENISHED) {
    throw err(
      'ERR_ALREADY_REPLENISHED',
      'Cannot void a replenished voucher — post a reversal JE',
      'לא ניתן לבטל תלוש שחודש — יש לרשום פקודת יומן הפוכה'
    );
  }
  if (!approverId || fund.approverIds.indexOf(approverId) === -1) {
    throw err('ERR_APPROVER_NOT_AUTHORISED', 'Approver not authorised', 'המאשר אינו מורשה');
  }
  if (approverId === fund.custodianId) {
    throw err(
      'ERR_SEGREGATION_OF_DUTIES',
      'Custodian cannot void',
      'הגזבר אינו יכול לבטל'
    );
  }

  voucher.status = VOUCHER_STATUS.VOIDED;
  voucher.voidedAt = nowIso();
  voucher.voidedBy = approverId;
  voucher.voidReason = String(reason || '');

  // Return cash to the fund
  fund.currentBalance = round2(fund.currentBalance + voucher.amount);
  fund.totalDisbursed = round2(fund.totalDisbursed - voucher.amount);
  fund.updatedAt = nowIso();

  auditLog(fund.id, 'VOUCHER_VOIDED', {
    en: `Voided voucher ${voucherId} — ${reason || ''}`,
    he: `בוטל תלוש ${voucherId} — ${reason || ''}`,
    voucherId,
    amount: voucher.amount,
    balanceAfter: fund.currentBalance,
    actor: approverId
  });

  return clone(voucher);
}

/* ----------------------------------------------------------------------------
 * Replenishment workflow
 * -------------------------------------------------------------------------- */

/**
 * Request replenishment — gathers all PAID vouchers since last replenish.
 * @param {string} fundId
 * @param {string} requesterId  (typically the custodian)
 * @returns {string} replenishmentId
 */
function replenish(fundId, requesterId) {
  const store = getStore();
  const fund = getFund(fundId);
  if (!requesterId) {
    throw err('ERR_REQUESTER_REQUIRED', 'Requester required', 'חובה לציין מגיש בקשה');
  }

  const batch = listVouchersByFund(fundId, { status: VOUCHER_STATUS.PAID });
  if (batch.length === 0) {
    throw err('ERR_NO_VOUCHERS_TO_REPLENISH', 'No paid vouchers to replenish', 'אין תלושים לחידוש');
  }
  const totalAmount = round2(batch.reduce((s, v) => s + v.amount, 0));

  // Allocate by category
  const byCategory = {};
  for (const v of batch) {
    if (!byCategory[v.category]) {
      byCategory[v.category] = {
        code: v.category,
        he: v.categoryHe,
        glAccount: v.glAccount,
        amount: 0,
        net: 0,
        vat: 0,
        count: 0
      };
    }
    const entry = byCategory[v.category];
    entry.amount = round2(entry.amount + v.amount);
    entry.net = round2(entry.net + v.net);
    entry.vat = round2(entry.vat + v.vatAmount);
    entry.count++;
  }

  const replId = genReplenishmentId(store);
  const replenishment = {
    id: replId,
    fundId,
    requesterId,
    requestedAt: nowIso(),
    amount: totalAmount,
    vouchersBatch: batch.map((v) => v.id),
    allocation: byCategory,
    status: REPLENISH_STATUS.REQUESTED,
    approverId: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    issuedAt: null,
    postedAt: null,
    journalEntry: null
  };
  store.replenishments.set(replId, replenishment);

  auditLog(fundId, 'REPLENISH_REQUESTED', {
    en: `Replenishment request ${replId} for ${totalAmount}`,
    he: `בקשת חידוש ${replId} על סך ${totalAmount}`,
    replenishmentId: replId,
    amount: totalAmount,
    voucherCount: batch.length,
    actor: requesterId
  });

  return replId;
}

/**
 * Approve a pending replenishment (finance).
 */
function approveReplenishment(replId, approverId) {
  const store = getStore();
  const repl = store.replenishments.get(replId);
  if (!repl) {
    throw err('ERR_REPL_NOT_FOUND', `Replenishment ${replId} not found`, `בקשת חידוש ${replId} לא נמצאה`);
  }
  if (repl.status !== REPLENISH_STATUS.REQUESTED) {
    throw err(
      'ERR_REPL_STATE',
      `Replenishment state=${repl.status}`,
      `מצב הבקשה ${repl.status}`
    );
  }
  const fund = getFund(repl.fundId);
  // Segregation of duties: check identity-based conflicts BEFORE authorisation list
  if (approverId === fund.custodianId) {
    throw err(
      'ERR_SEGREGATION_OF_DUTIES',
      'Custodian cannot approve replenishment',
      'הגזבר אינו יכול לאשר חידוש'
    );
  }
  if (!approverId || fund.approverIds.indexOf(approverId) === -1) {
    throw err('ERR_APPROVER_NOT_AUTHORISED', 'Approver not authorised', 'המאשר אינו מורשה');
  }
  if (approverId === repl.requesterId) {
    throw err(
      'ERR_SELF_APPROVAL',
      'Requester cannot approve own replenishment',
      'המבקש אינו יכול לאשר את בקשתו'
    );
  }

  repl.status = REPLENISH_STATUS.APPROVED;
  repl.approverId = approverId;
  repl.approvedAt = nowIso();

  auditLog(fund.id, 'REPLENISH_APPROVED', {
    en: `Approved replenishment ${replId}`,
    he: `אושר חידוש ${replId}`,
    replenishmentId: replId,
    amount: repl.amount,
    actor: approverId
  });

  return clone(repl);
}

/**
 * Reject a replenishment (with reason). Vouchers remain PAID.
 */
function rejectReplenishment(replId, approverId, reason) {
  const store = getStore();
  const repl = store.replenishments.get(replId);
  if (!repl) {
    throw err('ERR_REPL_NOT_FOUND', `Replenishment ${replId} not found`, `בקשת חידוש ${replId} לא נמצאה`);
  }
  if (repl.status !== REPLENISH_STATUS.REQUESTED) {
    throw err('ERR_REPL_STATE', `State=${repl.status}`, `מצב ${repl.status}`);
  }
  const fund = getFund(repl.fundId);
  if (!approverId || fund.approverIds.indexOf(approverId) === -1) {
    throw err('ERR_APPROVER_NOT_AUTHORISED', 'Approver not authorised', 'המאשר אינו מורשה');
  }
  repl.status = REPLENISH_STATUS.REJECTED;
  repl.rejectedAt = nowIso();
  repl.rejectionReason = String(reason || '');
  repl.approverId = approverId;

  auditLog(fund.id, 'REPLENISH_REJECTED', {
    en: `Rejected ${replId}: ${reason || ''}`,
    he: `נדחה ${replId}: ${reason || ''}`,
    replenishmentId: replId,
    actor: approverId
  });
  return clone(repl);
}

/**
 * Cash issued from bank to custodian → posts JE, closes vouchers.
 * Creates a double-entry journal:
 *   DR Petty Cash           (sum of net + vat = gross total)
 *       (implicit via expense posting at voucher time)
 *   DR Expense accounts     (per category, net amounts)
 *   DR VAT Input            (sum of vatRecoverable vat amounts)
 *       CR Cash in Bank     (sum of all vouchers)
 */
function issueReplenishmentCash(replId, issuerId) {
  const store = getStore();
  const repl = store.replenishments.get(replId);
  if (!repl) {
    throw err('ERR_REPL_NOT_FOUND', `Replenishment ${replId} not found`, `בקשת חידוש ${replId} לא נמצאה`);
  }
  if (repl.status !== REPLENISH_STATUS.APPROVED) {
    throw err(
      'ERR_REPL_NOT_APPROVED',
      `Cannot issue — state=${repl.status}`,
      `לא ניתן להוציא מזומן — מצב ${repl.status}`
    );
  }
  if (!issuerId) {
    throw err('ERR_ISSUER_REQUIRED', 'Issuer required', 'חובה מבצע');
  }

  const fund = getFund(repl.fundId);

  // Build journal entry
  const lines = [];
  let totalDebit = 0;
  let totalCredit = 0;

  // Per-category expense debits (net) and VAT input debit
  let totalVatInput = 0;
  for (const code of Object.keys(repl.allocation)) {
    const alloc = repl.allocation[code];
    const net = alloc.net;
    if (net > 0) {
      lines.push({
        account: alloc.glAccount,
        description: `Petty cash expense — ${alloc.he}`,
        descriptionHe: `הוצאת קופה קטנה — ${alloc.he}`,
        debit: net,
        credit: 0
      });
      totalDebit = round2(totalDebit + net);
    }
    totalVatInput = round2(totalVatInput + alloc.vat);
  }

  if (totalVatInput > 0) {
    lines.push({
      account: GL_ACCOUNTS.VAT_INPUT,
      description: 'VAT Input (recoverable)',
      descriptionHe: 'מע"מ תשומות',
      debit: totalVatInput,
      credit: 0
    });
    totalDebit = round2(totalDebit + totalVatInput);
  }

  // Credit cash in bank
  lines.push({
    account: GL_ACCOUNTS.CASH_IN_BANK,
    description: 'Cash issued to petty cash custodian',
    descriptionHe: 'מזומן שהועבר לגזבר הקופה הקטנה',
    debit: 0,
    credit: repl.amount
  });
  totalCredit = round2(totalCredit + repl.amount);

  // Invariant
  if (totalDebit !== totalCredit) {
    throw err(
      'ERR_JE_IMBALANCE',
      `JE imbalance debit=${totalDebit} credit=${totalCredit}`,
      `פקודת יומן אינה מאוזנת`
    );
  }

  const journal = {
    ref: `JE-${replId}`,
    date: todayIso(),
    narration: `Petty cash replenishment — ${fund.name}`,
    narrationHe: `חידוש קופה קטנה — ${fund.nameHe}`,
    lines,
    totalDebit,
    totalCredit
  };

  // Mark all batched vouchers as replenished
  for (const vId of repl.vouchersBatch) {
    const v = store.vouchers.get(vId);
    if (v && v.status === VOUCHER_STATUS.PAID) {
      v.status = VOUCHER_STATUS.REPLENISHED;
      v.replenishmentId = replId;
      v.postedAt = nowIso();
    }
  }

  // Bring fund balance back up to the float
  fund.currentBalance = round2(fund.currentBalance + repl.amount);
  if (fund.currentBalance > fund.floatAmount) {
    // Safety net — should be exactly floatAmount after correct workflow
    fund.currentBalance = fund.floatAmount;
  }
  fund.totalReplenished = round2(fund.totalReplenished + repl.amount);
  fund.lastReplenishAt = nowIso();
  fund.updatedAt = nowIso();

  repl.status = REPLENISH_STATUS.POSTED;
  repl.issuedAt = nowIso();
  repl.postedAt = nowIso();
  repl.journalEntry = journal;

  auditLog(fund.id, 'REPLENISH_POSTED', {
    en: `Cash issued + JE posted for ${replId}`,
    he: `מזומן הוצא + נרשמה פקודת יומן ל־${replId}`,
    replenishmentId: replId,
    amount: repl.amount,
    balanceAfter: fund.currentBalance,
    actor: issuerId
  });

  return clone(repl);
}

/* ----------------------------------------------------------------------------
 * Daily count / reconciliation
 * -------------------------------------------------------------------------- */

/**
 * Daily cash count — records counted amount vs expected balance.
 * @param {string} fundId
 * @param {number|object} counted  — either a number or a breakdown by denomination
 *   Denomination breakdown example:
 *     { '200': 10, '100': 5, '50': 4, '20': 3, '10': 2, '5': 1, '1': 0, coins: 1.5 }
 * @param {object} [opts]  — { auditorId, surprise, date }
 * @returns {{countId, counted, expected, variance, status}}
 */
function dailyCount(fundId, counted, opts) {
  const store = getStore();
  const fund = getFund(fundId);
  const o = opts || {};

  let countedAmount;
  let breakdown = null;
  if (typeof counted === 'number') {
    countedAmount = round2(counted);
  } else if (counted && typeof counted === 'object') {
    breakdown = {};
    let sum = 0;
    for (const key of Object.keys(counted)) {
      const qty = counted[key];
      if (key === 'coins') {
        sum += Number(qty) || 0;
        breakdown.coins = Number(qty) || 0;
      } else {
        const denom = Number(key);
        if (isFinite(denom) && denom > 0) {
          const n = Number(qty) || 0;
          sum += denom * n;
          breakdown[String(denom)] = n;
        }
      }
    }
    countedAmount = round2(sum);
  } else {
    throw err('ERR_COUNTED_INVALID', 'counted must be number or breakdown', 'סכום ספירה לא תקין');
  }

  const expected = fund.currentBalance;
  const variance = round2(countedAmount - expected);
  const absVariance = Math.abs(variance);
  // Tolerance: 1 ILS or 0.1% of float, whichever greater
  const tolerance = Math.max(1, round2(fund.floatAmount * 0.001));
  let status = 'ok';
  if (absVariance > tolerance && absVariance <= tolerance * 5) status = 'minor_variance';
  else if (absVariance > tolerance * 5) status = 'major_variance';

  const countId = genCountId(store);
  const record = {
    id: countId,
    fundId,
    date: o.date || todayIso(),
    countedAmount,
    breakdown,
    expected,
    variance,
    tolerance,
    status,
    auditorId: o.auditorId || null,
    surprise: !!o.surprise,
    notes: o.notes || '',
    createdAt: nowIso()
  };
  store.counts.set(countId, record);

  fund.lastCountAt = nowIso();
  fund.updatedAt = nowIso();

  auditLog(fundId, 'DAILY_COUNT', {
    en: `Counted ${countedAmount}, expected ${expected}, variance ${variance} (${status})`,
    he: `נספר ${countedAmount}, צפוי ${expected}, הפרש ${variance} (${status})`,
    countId,
    variance,
    status,
    surprise: !!o.surprise,
    actor: o.auditorId || 'unknown'
  });

  // Escalate major variance
  if (status === 'major_variance') {
    auditLog(fundId, 'VARIANCE_ESCALATED', {
      en: `Major variance ${variance} requires investigation`,
      he: `הפרש משמעותי ${variance} דורש בדיקה`,
      countId,
      variance,
      actor: 'system'
    });
  }

  return {
    countId,
    counted: countedAmount,
    expected,
    variance,
    tolerance,
    status,
    surprise: record.surprise
  };
}

/**
 * Investigate a variance — links count to root cause, optionally writes it off.
 */
function investigateVariance(countId, investigation) {
  const store = getStore();
  const record = store.counts.get(countId);
  if (!record) {
    throw err('ERR_COUNT_NOT_FOUND', `Count ${countId} not found`, `ספירה ${countId} לא נמצאה`);
  }
  const inv = investigation || {};
  record.investigation = {
    rootCause: String(inv.rootCause || ''),
    rootCauseHe: String(inv.rootCauseHe || ''),
    investigator: String(inv.investigator || ''),
    writeOff: !!inv.writeOff,
    suspenseEntry: inv.writeOff ? {
      account: GL_ACCOUNTS.SUSPENSE,
      debit: record.variance < 0 ? Math.abs(record.variance) : 0,
      credit: record.variance > 0 ? record.variance : 0,
      narration: `Petty cash variance write-off — ${inv.rootCause || ''}`
    } : null,
    closedAt: nowIso()
  };
  auditLog(record.fundId, 'VARIANCE_INVESTIGATED', {
    en: `Investigation for ${countId} — ${inv.rootCause || ''}`,
    he: `חקירה לספירה ${countId} — ${inv.rootCause || ''}`,
    countId,
    rootCause: inv.rootCause,
    writeOff: !!inv.writeOff,
    actor: inv.investigator
  });
  return clone(record);
}

/* ----------------------------------------------------------------------------
 * Reconciliation / reporting
 * -------------------------------------------------------------------------- */

/**
 * Reconcile a fund for a period (monthly).
 * @param {string} fundId
 * @param {object} period  { from, to } ISO dates
 */
function reconcile(fundId, period) {
  const fund = getFund(fundId);
  const p = period || {};
  const from = p.from || '0000-00-00';
  const to = p.to || '9999-12-31';

  const vouchers = Array.from(getStore().vouchers.values())
    .filter((v) => v.fundId === fundId && v.date >= from && v.date <= to);

  const counts = Array.from(getStore().counts.values())
    .filter((c) => c.fundId === fundId && c.date >= from && c.date <= to);

  const replenishments = Array.from(getStore().replenishments.values())
    .filter((r) => r.fundId === fundId && r.requestedAt >= from);

  const totals = {
    disbursed: 0,
    voided: 0,
    replenished: 0,
    vatRecoverable: 0,
    voucherCount: vouchers.length,
    byCategory: {}
  };

  for (const v of vouchers) {
    if (v.status === VOUCHER_STATUS.VOIDED) {
      totals.voided = round2(totals.voided + v.amount);
      continue;
    }
    totals.disbursed = round2(totals.disbursed + v.amount);
    if (v.vatRecoverable) totals.vatRecoverable = round2(totals.vatRecoverable + v.vatAmount);
    if (!totals.byCategory[v.category]) {
      totals.byCategory[v.category] = {
        code: v.category,
        he: v.categoryHe,
        amount: 0,
        count: 0
      };
    }
    totals.byCategory[v.category].amount = round2(totals.byCategory[v.category].amount + v.amount);
    totals.byCategory[v.category].count++;
  }

  for (const r of replenishments) {
    if (r.status === REPLENISH_STATUS.POSTED) {
      totals.replenished = round2(totals.replenished + r.amount);
    }
  }

  // Variances summary
  const variances = counts.map((c) => ({
    countId: c.id,
    date: c.date,
    variance: c.variance,
    status: c.status,
    investigated: !!c.investigation
  }));
  const majorCount = variances.filter((v) => v.status === 'major_variance').length;
  const minorCount = variances.filter((v) => v.status === 'minor_variance').length;

  // Imprest invariant check:
  //   float = currentBalance + pending disbursements not yet replenished
  const pendingVouchers = vouchers.filter((v) => v.status === VOUCHER_STATUS.PAID);
  const pendingSum = round2(pendingVouchers.reduce((s, v) => s + v.amount, 0));
  const imprestCheck = round2(fund.currentBalance + pendingSum);
  const imprestOk = imprestCheck === fund.floatAmount;

  return {
    fundId,
    fundName: fund.name,
    fundNameHe: fund.nameHe,
    period: { from, to },
    floatAmount: fund.floatAmount,
    currentBalance: fund.currentBalance,
    pendingSum,
    imprestCheck,
    imprestOk,
    totals,
    variances,
    varianceSummary: {
      total: variances.length,
      ok: variances.length - majorCount - minorCount,
      minor: minorCount,
      major: majorCount
    },
    vouchers: vouchers.map(clone),
    replenishments: replenishments.map(clone),
    counts: counts.map(clone),
    generatedAt: nowIso()
  };
}

/**
 * Full audit trail for a fund in a period.
 */
function auditTrail(fundId, period) {
  const p = period || {};
  const from = p.from || '0000';
  const to = p.to || '9999';
  return getStore().audits
    .filter((a) => {
      if (a.fundId !== fundId) return false;
      const day = String(a.at).slice(0, 10);
      if (day < from) return false;
      if (day > to) return false;
      return true;
    })
    .map(clone);
}

/* ----------------------------------------------------------------------------
 * Unannounced audit scheduler
 * -------------------------------------------------------------------------- */

/**
 * Schedule surprise audits over a date range.
 * Does not actually sleep — returns a list of recommended dates using a
 * deterministic PRNG based on fundId + year so tests are reproducible.
 */
function scheduleSurpriseAudits(fundId, opts) {
  const fund = getFund(fundId);
  const o = opts || {};
  const year = Number(o.year) || new Date().getFullYear();
  const count = Math.max(1, Math.min(12, Number(o.count) || 4));

  // Deterministic pseudo-random: mix fundId + year
  let seed = 0;
  const str = `${fundId}-${year}`;
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  function rand() {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed & 0x7fffffff) / 0x7fffffff;
  }

  const dates = new Set();
  // Aim for roughly even distribution across the year
  for (let i = 0; i < count * 3 && dates.size < count; i++) {
    const monthPart = Math.floor((dates.size / count) * 12);
    const month = Math.min(11, monthPart + Math.floor(rand() * 3));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = 1 + Math.floor(rand() * daysInMonth);
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.add(date);
  }
  const sorted = Array.from(dates).sort();
  auditLog(fundId, 'SURPRISE_AUDITS_SCHEDULED', {
    en: `Scheduled ${sorted.length} surprise audits for ${year}`,
    he: `תוזמנו ${sorted.length} ביקורות פתע לשנת ${year}`,
    dates: sorted,
    actor: 'system'
  });
  return sorted;
}

/* ----------------------------------------------------------------------------
 * Helper: does this fund need replenishment?
 * -------------------------------------------------------------------------- */
function needsReplenishment(fundId) {
  const fund = getFund(fundId);
  const threshold = round2(fund.floatAmount * REPLENISH_THRESHOLD_RATIO);
  return fund.currentBalance <= threshold;
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */

const api = {
  // Constants / enums
  VOUCHER_STATUS,
  FUND_STATUS,
  REPLENISH_STATUS,
  DEFAULT_CATEGORIES,
  GL_ACCOUNTS,
  RECEIPT_THRESHOLD_ILS,
  TAX_INVOICE_THRESHOLD_ILS,
  CASH_LAW_LIMIT_ILS,
  OVER_THRESHOLD_APPROVAL_ILS,
  REPLENISH_THRESHOLD_RATIO,
  DEFAULT_VAT_RATE,

  // Store
  createMemoryStore,
  setStore,
  getStore,

  // Fund
  createFund,
  getFund,
  listFunds,

  // Voucher
  disburse,
  getVoucher,
  listVouchersByFund,
  voidVoucher,

  // Replenishment
  replenish,
  approveReplenishment,
  rejectReplenishment,
  issueReplenishmentCash,

  // Count & variance
  dailyCount,
  investigateVariance,

  // Reporting
  reconcile,
  auditTrail,

  // Controls
  scheduleSurpriseAudits,
  needsReplenishment,

  // Helpers
  round2
};

/* dual-export: CommonJS + ESM */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
  module.exports.default = api;
}

export {
  // Enums
  VOUCHER_STATUS,
  FUND_STATUS,
  REPLENISH_STATUS,
  DEFAULT_CATEGORIES,
  GL_ACCOUNTS,
  RECEIPT_THRESHOLD_ILS,
  TAX_INVOICE_THRESHOLD_ILS,
  CASH_LAW_LIMIT_ILS,
  OVER_THRESHOLD_APPROVAL_ILS,
  REPLENISH_THRESHOLD_RATIO,
  DEFAULT_VAT_RATE,
  // Store
  createMemoryStore,
  setStore,
  getStore,
  // Fund
  createFund,
  getFund,
  listFunds,
  // Voucher
  disburse,
  getVoucher,
  listVouchersByFund,
  voidVoucher,
  // Replenish
  replenish,
  approveReplenishment,
  rejectReplenishment,
  issueReplenishmentCash,
  // Count
  dailyCount,
  investigateVariance,
  // Reporting
  reconcile,
  auditTrail,
  // Controls
  scheduleSurpriseAudits,
  needsReplenishment,
  round2
};
export default api;
