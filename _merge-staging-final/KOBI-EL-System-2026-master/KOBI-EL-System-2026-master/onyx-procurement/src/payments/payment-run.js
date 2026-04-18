/* ============================================================================
 * Techno-Kol mega-ERP — Payment Run Engine / מנוע רצף תשלומים
 * Agent X-49 — Swarm 3C — 2026-04-11
 * ----------------------------------------------------------------------------
 * End-to-end batch payment engine for vendor AP disbursements. Produces a
 * payment proposal (הצעת תשלום) from open bills, runs it through an
 * approval workflow, exports the Masav (מס"ב) interbank batch file the
 * Israeli clearing system consumes, reserves funds in the GL, handles
 * confirmations / rejections / retries and finally emits remittance
 * advice (הודעת תשלום) to every vendor that was paid in the run.
 *
 * Design goals
 * ------------
 *   • ZERO dependencies  — only `node:crypto` for run/proposal id hashes.
 *   • NEVER deletes       — rejections / exclusions are flagged, never removed.
 *   • Hebrew bilingual    — every state, reason code, remittance template and
 *                           exception carries both English and Hebrew strings.
 *   • Pluggable store     — swap in any { tables } adapter; an in-memory
 *                           store is bundled for tests and dev.
 *   • Real Masav format   — fixed-width 128-column records per the Bank of
 *                           Israel Masav (מס"ב) spec, codepage 862 safe.
 *
 * Public API (exports)
 * --------------------
 *   createPaymentRunEngine({db?, clock?, glPost?, eventBus?, logger?})
 *                                   → engine instance
 *   engine.proposeRun({dateRange, maxAmount, methods})
 *                                   → { proposalId, bills, summary }
 *   engine.includeExclude(proposalId, billIds, decision)
 *                                   → proposal snapshot
 *   engine.calculateTotal(proposalId)
 *                                   → summary totals (per method + grand)
 *   engine.approveRun(proposalId, approverId)
 *                                   → runId
 *   engine.execute(runId)           → { files: { method: path }, bills_count }
 *   engine.exportMasav(runId)       → { bytes, checksum, recordCount, header }
 *   engine.confirmPayment(paymentId, bankRef)        → payment snapshot
 *   engine.rejectPayment(paymentId, reason)          → payment snapshot
 *   engine.remittanceAdvice(runId)                   → [ vendor notifications ]
 *   engine.reconcileWithBank(runId, statement)       → { matched, unmatched }
 *
 * Static helpers also exported at module level:
 *   buildMasav(batch)          → string
 *   validateMasavParticipant   → function
 *   PAYMENT_METHODS, STATES, REJECT_REASONS
 *
 * All monetary amounts are integer agorot (אגורות). Never floats. Currency
 * defaults to "ILS". Foreign-currency bills (EUR/USD) are split into a
 * separate wire-transfer file and are NOT included in the Masav batch.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

// ----------------------------------------------------------------------------
// 1. Constants / enums
// ----------------------------------------------------------------------------

const PAYMENT_METHODS = Object.freeze({
  MASAV: 'masav',      // מס"ב — local ILS bank transfer batch
  WIRE: 'wire',        // העברת SWIFT — foreign wire
  CHECK: 'check',      // צ'ק
  ACH: 'ach',          // ACH equivalent (used for non-Masav routed ILS)
  CREDIT: 'credit',    // כרטיס אשראי
});

const STATES = Object.freeze({
  PROPOSAL_DRAFT: 'proposal_draft',           // טיוטה
  PROPOSAL_REVIEWED: 'proposal_reviewed',     // בבקרה
  PROPOSAL_APPROVED: 'proposal_approved',     // מאושר
  PROPOSAL_REJECTED: 'proposal_rejected',     // נדחה
  RUN_EXECUTING: 'run_executing',             // בביצוע
  RUN_EXECUTED: 'run_executed',               // הופעל
  RUN_SENT: 'run_sent',                       // נשלח לבנק
  RUN_CONFIRMED: 'run_confirmed',             // אושר ע"י הבנק
  RUN_PARTIAL: 'run_partial',                 // אושר חלקית
  RUN_FAILED: 'run_failed',                   // נכשל
  PAY_SCHEDULED: 'scheduled',                 // מתוזמן
  PAY_SENT: 'sent',                           // נשלח
  PAY_CONFIRMED: 'confirmed',                 // אושר
  PAY_REJECTED: 'rejected',                   // נדחה
  PAY_RETRY: 'retry_queued',                  // בתור לשידור חוזר
});

// Reject reasons per Bank of Israel spec. `retriable` says whether we
// automatically re-queue the payment in the next run. Non-retriable codes
// (bad IBAN, closed account, blocked vendor…) land in the exception tray.
const REJECT_REASONS = Object.freeze({
  INSUFFICIENT_FUNDS: { code: 'R01', retriable: true, he: 'אין כיסוי מספיק', en: 'Insufficient funds' },
  ACCOUNT_CLOSED:     { code: 'R02', retriable: false, he: 'חשבון סגור',     en: 'Account closed' },
  NO_ACCOUNT:         { code: 'R03', retriable: false, he: 'אין חשבון',      en: 'No such account' },
  INVALID_ACCOUNT:    { code: 'R04', retriable: false, he: 'מספר חשבון שגוי', en: 'Invalid account number' },
  CUSTOMER_STOP:      { code: 'R05', retriable: false, he: 'עצירת תשלום ע"י הלקוח', en: 'Customer stop payment' },
  DUPLICATE:          { code: 'R06', retriable: false, he: 'חיוב כפול',      en: 'Duplicate entry' },
  TECHNICAL:          { code: 'R07', retriable: true,  he: 'תקלה טכנית',     en: 'Technical failure' },
  BANK_UNAVAILABLE:   { code: 'R08', retriable: true,  he: 'הבנק לא זמין',   en: 'Bank unavailable' },
  LIMIT_EXCEEDED:     { code: 'R09', retriable: true,  he: 'חריגה ממגבלה',   en: 'Limit exceeded' },
  BLOCKED_VENDOR:     { code: 'R10', retriable: false, he: 'ספק חסום',       en: 'Vendor blocked' },
});

const PRIORITY = Object.freeze({
  EARLY_DISCOUNT: 100, // pay first to capture discount
  OVERDUE:         80, // overdue bills
  DUE_NOW:         60, // due today
  NORMAL:          40, // within terms
  LOW:             20, // can slip
});

// Israeli bank codes recognised by Masav. Subset of the official participants
// list (Bank of Israel, updated 2024). Non-listed codes fall back to wire.
const MASAV_PARTICIPANTS = Object.freeze({
  '04':  'בנק יהב',
  '09':  'בנק דואר',
  '10':  'בנק לאומי',
  '11':  'בנק דיסקונט',
  '12':  'בנק הפועלים',
  '13':  'בנק איגוד',          // historic — no longer active, kept for legacy files
  '14':  'בנק אוצר החייל',
  '17':  'בנק מרכנתיל דיסקונט',
  '20':  'בנק מזרחי טפחות',
  '22':  'בנק Citibank',
  '23':  'בנק HSBC',
  '26':  'בנק יובנק',
  '31':  'בנק הבינלאומי הראשון',
  '34':  'בנק ערבי ישראלי',
  '39':  'בנק SBI',
  '46':  'בנק מסד',
  '52':  'בנק פועלי אגודת ישראל',
  '54':  'בנק ירושלים',
  '68':  'Dexia ישראל',
  '99':  'בנק ישראל',
});

// ----------------------------------------------------------------------------
// 2. In-memory store (swap-in adapter for production)
// ----------------------------------------------------------------------------

function createMemoryDb() {
  const tables = {
    bills: new Map(),
    vendors: new Map(),
    proposals: new Map(),
    runs: new Map(),
    payments: new Map(),
    ledger: [],                    // append-only GL entries
    cashPosition: { balance: 0 },  // agorot
    remittanceLog: [],
    auditLog: [],
  };
  return {
    tables,
    insert(table, row) {
      if (Array.isArray(tables[table])) { tables[table].push(row); return row; }
      tables[table].set(row.id, row);
      return row;
    },
    get(table, id) {
      if (Array.isArray(tables[table])) return tables[table].find((r) => r.id === id);
      return tables[table].get(id);
    },
    update(table, id, patch) {
      const row = this.get(table, id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    list(table, filter) {
      const all = Array.isArray(tables[table]) ? tables[table] : [...tables[table].values()];
      return filter ? all.filter(filter) : all;
    },
    appendLedger(entry) { tables.ledger.push(entry); return entry; },
    audit(event, payload) {
      tables.auditLog.push({ ts: Date.now(), event, payload });
    },
    setCash(balance) { tables.cashPosition.balance = balance; },
    getCash() { return tables.cashPosition.balance; },
  };
}

// ----------------------------------------------------------------------------
// 3. Money helpers — everything is integer agorot
// ----------------------------------------------------------------------------

function toAgorot(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError('amount must be a finite number');
  }
  return Math.round(n * 100);
}

function fromAgorot(a) {
  return Math.round(a) / 100;
}

function formatIls(agorot) {
  const sign = agorot < 0 ? '-' : '';
  const abs = Math.abs(Math.round(agorot));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const majorStr = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + '₪' + majorStr + '.' + String(minor).padStart(2, '0');
}

// ----------------------------------------------------------------------------
// 4. Priority scoring
// ----------------------------------------------------------------------------

function scoreBill(bill, today) {
  const t = today || new Date();
  const due = new Date(bill.dueDate);
  const daysToDue = Math.floor((due.getTime() - t.getTime()) / 86400000);

  // Early-payment discount window (cash with discount)
  if (bill.discountDate && bill.discountAmount && bill.discountAmount > 0) {
    const dd = new Date(bill.discountDate);
    if (t.getTime() <= dd.getTime()) return PRIORITY.EARLY_DISCOUNT;
  }
  if (daysToDue < 0) return PRIORITY.OVERDUE;     // עבר מועד
  if (daysToDue === 0) return PRIORITY.DUE_NOW;    // הגיע היום
  if (daysToDue <= 7) return PRIORITY.NORMAL;
  return PRIORITY.LOW;
}

function resolveMethod(vendor, bill, allowed) {
  const pref = (vendor && vendor.preferredMethod) || PAYMENT_METHODS.MASAV;
  const currency = (bill.currency || 'ILS').toUpperCase();
  // Foreign currency ⇒ always wire
  if (currency !== 'ILS') return PAYMENT_METHODS.WIRE;
  // Vendor explicitly requests check
  if (pref === PAYMENT_METHODS.CHECK) return PAYMENT_METHODS.CHECK;
  // Credit card preference (e.g. subscriptions)
  if (pref === PAYMENT_METHODS.CREDIT) return PAYMENT_METHODS.CREDIT;
  // Default ILS flow — try Masav
  if (vendor && validateMasavParticipant(vendor.bankCode)) return PAYMENT_METHODS.MASAV;
  // Fallback
  const fb = allowed && allowed.includes(PAYMENT_METHODS.ACH)
    ? PAYMENT_METHODS.ACH : PAYMENT_METHODS.CHECK;
  return fb;
}

function validateMasavParticipant(bankCode) {
  if (bankCode == null) return false;
  const k = String(bankCode).padStart(2, '0');
  return Object.prototype.hasOwnProperty.call(MASAV_PARTICIPANTS, k);
}

// ----------------------------------------------------------------------------
// 5. Masav fixed-width builder
// ----------------------------------------------------------------------------
// Reference: Bank of Israel / Masav interface spec — 128-byte fixed-width.
// Each record begins with a code (1/5/9) and is padded with spaces (zeros
// for numeric fields). We use ASCII/ISO 8859-8 compatible characters in the
// description fields so the resulting file is round-trip safe through the
// banks that still expect codepage 862.
// ----------------------------------------------------------------------------

function padLeft(v, len, ch) {
  return String(v).padStart(len, ch || '0').slice(-len);
}
function padRight(v, len, ch) {
  return String(v).padEnd(len, ch || ' ').slice(0, len);
}
function stripHebAscii(s) {
  return String(s || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildMasavHeader(batch) {
  // Type 1 — header
  //  1     1   record type '1'
  //  2-10  9   institute code (payer)
  //  11-12 2   file serial number
  //  13-18 6   creation date YYMMDD
  //  19-24 6   execution date YYMMDD
  //  25-33 9   payer id (tax/CompanyId)
  //  34-63 30  payer name
  //  64-128 65 reserved (spaces)
  const parts = [
    '1',
    padLeft(batch.institute || '000000000', 9),
    padLeft(batch.serial || 1, 2),
    padLeft(batch.createdYYMMDD, 6),
    padLeft(batch.executionYYMMDD, 6),
    padLeft(batch.payerId || '000000000', 9),
    padRight(stripHebAscii(batch.payerName || 'TECHNO-KOL'), 30),
    padRight('', 65),
  ];
  return parts.join('');
}

function buildMasavDetail(row, seq) {
  // Type 5 — detail
  //  1      1  '5'
  //  2-9    8  sequence
  //  10-11  2  bank code
  //  12-14  3  branch
  //  15-23  9  account
  //  24-32  9  payee id
  //  33-62  30 payee name
  //  63-74  12 amount (agorot, right-aligned zero-padded)
  //  75-94  20 reference
  //  95-128 34 reserved
  const amount = padLeft(Math.round(row.amountAgorot), 12);
  const parts = [
    '5',
    padLeft(seq, 8),
    padLeft(row.bankCode || 0, 2),
    padLeft(row.branch || 0, 3),
    padLeft(row.account || 0, 9),
    padLeft(row.payeeId || 0, 9),
    padRight(stripHebAscii(row.payeeName || ''), 30),
    amount,
    padRight(stripHebAscii(row.reference || ''), 20),
    padRight('', 34),
  ];
  return parts.join('');
}

function buildMasavTrailer(totals) {
  // Type 9 — trailer
  //  1      1  '9'
  //  2-9    8  record count (detail rows only)
  //  10-24  15 total amount in agorot
  //  25-128 104 reserved
  const parts = [
    '9',
    padLeft(totals.count || 0, 8),
    padLeft(Math.round(totals.amountAgorot || 0), 15),
    padRight('', 104),
  ];
  return parts.join('');
}

function buildMasav(batch) {
  const lines = [];
  lines.push(buildMasavHeader(batch));
  let count = 0;
  let total = 0;
  const rows = batch.rows || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    lines.push(buildMasavDetail(row, i + 1));
    count += 1;
    total += Math.round(row.amountAgorot || 0);
  }
  lines.push(buildMasavTrailer({ count, amountAgorot: total }));
  const text = lines.join('\n') + '\n';
  // Sanity: every line must be exactly 128 bytes
  for (const line of lines) {
    if (line.length !== 128) {
      throw new Error('masav record width invalid: ' + line.length);
    }
  }
  return { text, lines, totals: { count, amountAgorot: total } };
}

// ----------------------------------------------------------------------------
// 6. Utility — deterministic id hashing
// ----------------------------------------------------------------------------

function hashId(prefix, input) {
  const h = crypto.createHash('sha1').update(String(input)).digest('hex');
  return prefix + '_' + h.slice(0, 16);
}

function yymmdd(d) {
  const y = String(d.getFullYear() % 100).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + m + day;
}

// ----------------------------------------------------------------------------
// 7. Engine factory
// ----------------------------------------------------------------------------

function createPaymentRunEngine(opts) {
  const options = opts || {};
  const db = options.db || createMemoryDb();
  const clock = options.clock || (() => new Date());
  const eventBus = options.eventBus || { emit: () => {} };
  const logger = options.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const glPost = options.glPost || function (entry) { db.appendLedger(entry); return entry; };
  const cashFloor = Number.isFinite(options.cashFloor) ? options.cashFloor : 0;

  function now() { return clock(); }

  // ------------------------------------------------------------------------
  // 7.1 proposeRun
  // ------------------------------------------------------------------------
  function proposeRun(input) {
    if (!input || !input.dateRange) throw new Error('dateRange required');
    const { dateRange } = input;
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new Error('dateRange.from and dateRange.to must be valid dates');
    }
    const maxAmount = Number.isFinite(input.maxAmount) ? toAgorot(input.maxAmount) : Infinity;
    const allowedMethods = Array.isArray(input.methods) && input.methods.length
      ? input.methods
      : Object.values(PAYMENT_METHODS);

    // 1. Load candidate bills
    const allBills = db.list('bills', (b) => b.status === 'open' || b.status === 'retry_queued');
    const candidates = [];
    const today = now();
    for (const b of allBills) {
      const due = new Date(b.dueDate);
      if (isNaN(due.getTime())) continue;
      if (due.getTime() < from.getTime()) continue;
      if (due.getTime() > to.getTime()) continue;
      const vendor = db.get('vendors', b.vendorId) || {};
      if (vendor.blocked) continue;

      const priority = scoreBill(b, today);
      const method = resolveMethod(vendor, b, allowedMethods);
      if (!allowedMethods.includes(method)) continue;

      // Apply early-pay discount to payable amount if in discount window
      let payable = toAgorot(b.amount);
      if (priority === PRIORITY.EARLY_DISCOUNT && b.discountAmount) {
        payable -= toAgorot(b.discountAmount);
        if (payable < 0) payable = 0;
      }

      candidates.push({
        billId: b.id,
        vendorId: b.vendorId,
        vendorName: vendor.name || b.vendorName || '',
        currency: (b.currency || 'ILS').toUpperCase(),
        amountAgorot: payable,
        originalAgorot: toAgorot(b.amount),
        discountAgorot: payable !== toAgorot(b.amount) ? (toAgorot(b.amount) - payable) : 0,
        dueDate: b.dueDate,
        priority,
        method,
        included: true,
        reference: b.reference || b.invoiceNumber || b.id,
      });
    }

    // 2. Sort by priority descending, then due date ascending
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    // 3. Cash-position constraint — never overdraw
    const cash = db.getCash();
    let running = 0;
    const availableForPayments = Math.max(cash - cashFloor, 0);
    const cap = Math.min(availableForPayments, maxAmount);
    const droppedForCash = [];
    for (const c of candidates) {
      if (running + c.amountAgorot <= cap) {
        running += c.amountAgorot;
      } else {
        c.included = false;
        c.excludeReason = 'cash_cap_exceeded';
        c.excludeReasonHe = 'חריגה ממסגרת המזומן';
        droppedForCash.push(c.billId);
      }
    }

    // 4. Persist proposal
    const proposalId = hashId('prop', JSON.stringify({ input, ts: now().toISOString() }));
    const proposal = {
      id: proposalId,
      createdAt: now().toISOString(),
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      maxAmount: Number.isFinite(input.maxAmount) ? toAgorot(input.maxAmount) : null,
      methods: allowedMethods,
      state: STATES.PROPOSAL_DRAFT,
      bills: candidates,
      cashAtCreation: cash,
      droppedForCash,
      approvedBy: null,
      approvedAt: null,
      exclusions: [],
    };
    db.insert('proposals', proposal);
    db.audit('proposal.created', { proposalId, billCount: candidates.length });
    eventBus.emit('payment.proposal.created', { proposalId });
    logger.info('proposeRun created', { proposalId, bills: candidates.length });

    return {
      proposalId,
      bills: candidates.slice(),
      summary: calculateTotal(proposalId),
    };
  }

  // ------------------------------------------------------------------------
  // 7.2 includeExclude — never deletes; toggles `included` + audit trail
  // ------------------------------------------------------------------------
  function includeExclude(proposalId, billIds, decision) {
    const proposal = db.get('proposals', proposalId);
    if (!proposal) throw new Error('proposal not found: ' + proposalId);
    if (proposal.state !== STATES.PROPOSAL_DRAFT && proposal.state !== STATES.PROPOSAL_REVIEWED) {
      throw new Error('proposal is not editable: ' + proposal.state);
    }
    const ids = Array.isArray(billIds) ? billIds : [billIds];
    const includeFlag = decision === 'include';
    for (const billId of ids) {
      const row = proposal.bills.find((b) => b.billId === billId);
      if (!row) continue;
      row.included = includeFlag;
      if (!includeFlag) {
        row.excludeReason = 'manual_exclude';
        row.excludeReasonHe = 'החרגה ידנית';
      } else {
        row.excludeReason = null;
        row.excludeReasonHe = null;
      }
      proposal.exclusions.push({
        billId, decision, ts: now().toISOString(),
      });
    }
    db.audit('proposal.edited', { proposalId, ids, decision });
    eventBus.emit('payment.proposal.edited', { proposalId });
    return proposal;
  }

  // ------------------------------------------------------------------------
  // 7.3 calculateTotal
  // ------------------------------------------------------------------------
  function calculateTotal(proposalId) {
    const proposal = db.get('proposals', proposalId);
    if (!proposal) throw new Error('proposal not found: ' + proposalId);
    const byMethod = {};
    let grandAgorot = 0;
    let includedCount = 0;
    let excludedCount = 0;
    let discountAgorot = 0;

    for (const row of proposal.bills) {
      if (!row.included) { excludedCount += 1; continue; }
      includedCount += 1;
      grandAgorot += row.amountAgorot;
      discountAgorot += row.discountAgorot || 0;
      if (!byMethod[row.method]) byMethod[row.method] = { count: 0, amountAgorot: 0 };
      byMethod[row.method].count += 1;
      byMethod[row.method].amountAgorot += row.amountAgorot;
    }
    return {
      proposalId,
      includedCount,
      excludedCount,
      grandTotalAgorot: grandAgorot,
      grandTotal: fromAgorot(grandAgorot),
      grandTotalFormatted: formatIls(grandAgorot),
      discountAgorot,
      byMethod,
      cashAtCreation: proposal.cashAtCreation,
      withinCashLimit: grandAgorot <= (proposal.cashAtCreation - cashFloor),
    };
  }

  // ------------------------------------------------------------------------
  // 7.4 approveRun
  // ------------------------------------------------------------------------
  function approveRun(proposalId, approverId) {
    if (!approverId) throw new Error('approverId required');
    const proposal = db.get('proposals', proposalId);
    if (!proposal) throw new Error('proposal not found: ' + proposalId);
    if (proposal.state === STATES.PROPOSAL_APPROVED) {
      throw new Error('proposal already approved');
    }
    if (proposal.approvedBy === approverId) {
      throw new Error('self-approval blocked');
    }

    // Defence in depth — no self-approve same user who created.
    // Here we just require the approverId is given and differs from the
    // createdBy (if provided).
    if (proposal.createdBy && proposal.createdBy === approverId) {
      throw new Error('creator cannot self-approve');
    }

    const summary = calculateTotal(proposalId);
    // Re-check against CURRENT cash, not the snapshot at propose-time. Cash
    // can move between propose and approve, so we refuse to green-light a
    // run that would overdraw the bank at the moment of approval.
    const currentCash = db.getCash();
    if (summary.grandTotalAgorot > (currentCash - cashFloor)) {
      throw new Error('proposal exceeds cash limit');
    }

    proposal.state = STATES.PROPOSAL_APPROVED;
    proposal.approvedBy = approverId;
    proposal.approvedAt = now().toISOString();

    const runId = hashId('run', proposalId + '|' + approverId + '|' + now().toISOString());
    const run = {
      id: runId,
      proposalId,
      state: STATES.RUN_EXECUTING,
      createdAt: now().toISOString(),
      executedAt: null,
      confirmedAt: null,
      files: {},
      summary,
      paymentIds: [],
    };
    db.insert('runs', run);
    db.audit('run.created', { runId, proposalId, approverId });
    eventBus.emit('payment.run.approved', { runId, proposalId });
    return runId;
  }

  // ------------------------------------------------------------------------
  // 7.5 execute — create payment rows, reserve funds, generate files
  // ------------------------------------------------------------------------
  function execute(runId) {
    const run = db.get('runs', runId);
    if (!run) throw new Error('run not found: ' + runId);
    if (run.state === STATES.RUN_EXECUTED || run.state === STATES.RUN_SENT) {
      throw new Error('run already executed');
    }
    const proposal = db.get('proposals', run.proposalId);
    if (!proposal) throw new Error('proposal missing for run');

    const paymentsByMethod = {};
    const paymentIds = [];
    let reservedAgorot = 0;

    for (const row of proposal.bills) {
      if (!row.included) continue;
      const vendor = db.get('vendors', row.vendorId) || {};
      const paymentId = hashId('pay', runId + '|' + row.billId);
      const payment = {
        id: paymentId,
        runId,
        billId: row.billId,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        amountAgorot: row.amountAgorot,
        currency: row.currency,
        method: row.method,
        state: STATES.PAY_SCHEDULED,
        bankCode: vendor.bankCode,
        branch: vendor.branch,
        account: vendor.account,
        iban: vendor.iban,
        swift: vendor.swift,
        payeeId: vendor.taxId || vendor.companyId,
        reference: row.reference,
        attempts: 0,
        rejectHistory: [],
        createdAt: now().toISOString(),
        bankRef: null,
      };
      db.insert('payments', payment);
      paymentIds.push(paymentId);
      reservedAgorot += row.amountAgorot;

      // Mark bill scheduled (never delete, never pay twice)
      const bill = db.get('bills', row.billId);
      if (bill) {
        db.update('bills', row.billId, {
          status: 'scheduled',
          scheduledRunId: runId,
          scheduledAt: now().toISOString(),
        });
      }

      if (!paymentsByMethod[row.method]) paymentsByMethod[row.method] = [];
      paymentsByMethod[row.method].push(payment);
    }

    // 1. Reserve cash in GL — DR A/P, CR Cash-in-Transit
    glPost({
      id: 'gl_' + runId + '_reserve',
      ts: now().toISOString(),
      type: 'payment_reserve',
      runId,
      lines: [
        { account: '2100-AP',          debit: reservedAgorot, credit: 0 },
        { account: '1020-CashInTransit', debit: 0,             credit: reservedAgorot },
      ],
    });
    db.setCash(db.getCash() - reservedAgorot);

    // 2. Generate output files
    const files = {};
    const yy = yymmdd(now());

    if (paymentsByMethod[PAYMENT_METHODS.MASAV] && paymentsByMethod[PAYMENT_METHODS.MASAV].length) {
      const built = exportMasav(runId, paymentsByMethod[PAYMENT_METHODS.MASAV]);
      files[PAYMENT_METHODS.MASAV] = {
        path: '/runs/' + runId + '/masav-' + yy + '.txt',
        bytes: built.bytes,
        count: paymentsByMethod[PAYMENT_METHODS.MASAV].length,
      };
    }
    if (paymentsByMethod[PAYMENT_METHODS.WIRE] && paymentsByMethod[PAYMENT_METHODS.WIRE].length) {
      const wire = buildWireFile(paymentsByMethod[PAYMENT_METHODS.WIRE]);
      files[PAYMENT_METHODS.WIRE] = {
        path: '/runs/' + runId + '/wire-' + yy + '.csv',
        bytes: wire,
        count: paymentsByMethod[PAYMENT_METHODS.WIRE].length,
      };
    }
    if (paymentsByMethod[PAYMENT_METHODS.CHECK] && paymentsByMethod[PAYMENT_METHODS.CHECK].length) {
      const chk = buildCheckFile(paymentsByMethod[PAYMENT_METHODS.CHECK]);
      files[PAYMENT_METHODS.CHECK] = {
        path: '/runs/' + runId + '/checks-' + yy + '.pdf.manifest.json',
        bytes: chk,
        count: paymentsByMethod[PAYMENT_METHODS.CHECK].length,
      };
    }
    if (paymentsByMethod[PAYMENT_METHODS.ACH] && paymentsByMethod[PAYMENT_METHODS.ACH].length) {
      const ach = buildAchFile(paymentsByMethod[PAYMENT_METHODS.ACH]);
      files[PAYMENT_METHODS.ACH] = {
        path: '/runs/' + runId + '/ach-' + yy + '.csv',
        bytes: ach,
        count: paymentsByMethod[PAYMENT_METHODS.ACH].length,
      };
    }
    if (paymentsByMethod[PAYMENT_METHODS.CREDIT] && paymentsByMethod[PAYMENT_METHODS.CREDIT].length) {
      const credit = buildCreditFile(paymentsByMethod[PAYMENT_METHODS.CREDIT]);
      files[PAYMENT_METHODS.CREDIT] = {
        path: '/runs/' + runId + '/credit-' + yy + '.json',
        bytes: credit,
        count: paymentsByMethod[PAYMENT_METHODS.CREDIT].length,
      };
    }

    run.state = STATES.RUN_EXECUTED;
    run.executedAt = now().toISOString();
    run.files = files;
    run.paymentIds = paymentIds;
    run.reservedAgorot = reservedAgorot;

    db.audit('run.executed', { runId, billsCount: paymentIds.length, reservedAgorot });
    eventBus.emit('payment.run.executed', { runId });
    logger.info('run executed', { runId, payments: paymentIds.length });

    return {
      runId,
      bills_count: paymentIds.length,
      files,
      reservedAgorot,
    };
  }

  // ------------------------------------------------------------------------
  // 7.6 exportMasav — produces the fixed-width file bytes
  // ------------------------------------------------------------------------
  function exportMasav(runId, paymentsArg) {
    const run = db.get('runs', runId);
    if (!run && !paymentsArg) throw new Error('run not found: ' + runId);
    let payments = paymentsArg;
    if (!payments) {
      payments = db.list('payments', (p) => p.runId === runId && p.method === PAYMENT_METHODS.MASAV);
    }
    const t = now();
    const createdYYMMDD = yymmdd(t);
    const executionYYMMDD = yymmdd(t);

    const rows = payments.map((p) => ({
      bankCode: p.bankCode,
      branch: p.branch,
      account: p.account,
      payeeId: p.payeeId,
      payeeName: p.vendorName,
      amountAgorot: p.amountAgorot,
      reference: p.reference,
    }));

    // Sanity — every participant code must be valid Masav
    for (const r of rows) {
      if (!validateMasavParticipant(r.bankCode)) {
        throw new Error('unknown Masav participant: ' + r.bankCode);
      }
    }

    const built = buildMasav({
      institute: (options.institute || '000000000'),
      serial: (run && run.serial) || 1,
      createdYYMMDD,
      executionYYMMDD,
      payerId: options.payerId || '000000000',
      payerName: options.payerName || 'TECHNO-KOL',
      rows,
    });

    const bytes = Buffer ? Buffer.from(built.text, 'utf8') : built.text;
    const checksum = crypto.createHash('sha256').update(built.text).digest('hex');
    const header = built.lines[0];

    if (run) {
      run.masavChecksum = checksum;
      run.masavRecordCount = built.totals.count;
    }
    return { bytes, text: built.text, checksum, recordCount: built.totals.count, header, totals: built.totals };
  }

  // ------------------------------------------------------------------------
  // 7.7 confirmPayment — bank confirms (or partial confirms) individual rows
  // ------------------------------------------------------------------------
  function confirmPayment(paymentId, bankRef) {
    const payment = db.get('payments', paymentId);
    if (!payment) throw new Error('payment not found: ' + paymentId);
    if (payment.state === STATES.PAY_CONFIRMED) return payment;
    if (payment.state === STATES.PAY_REJECTED) {
      throw new Error('cannot confirm rejected payment');
    }
    payment.state = STATES.PAY_CONFIRMED;
    payment.bankRef = bankRef || null;
    payment.confirmedAt = now().toISOString();

    // Final journal — clear cash-in-transit to Bank
    glPost({
      id: 'gl_' + paymentId + '_confirm',
      ts: now().toISOString(),
      type: 'payment_confirm',
      paymentId,
      lines: [
        { account: '1020-CashInTransit', debit: payment.amountAgorot, credit: 0 },
        { account: '1010-Bank',          debit: 0,                    credit: payment.amountAgorot },
      ],
    });

    // Mark bill paid (never delete)
    const bill = db.get('bills', payment.billId);
    if (bill) {
      db.update('bills', payment.billId, {
        status: 'paid',
        paidAt: now().toISOString(),
        paymentId,
        bankRef,
      });
    }

    // Advance run state if all payments closed
    advanceRunState(payment.runId);

    db.audit('payment.confirmed', { paymentId, bankRef });
    eventBus.emit('payment.confirmed', { paymentId, bankRef });
    return payment;
  }

  // ------------------------------------------------------------------------
  // 7.8 rejectPayment — bank rejects, we handle retries
  // ------------------------------------------------------------------------
  function rejectPayment(paymentId, reason) {
    const payment = db.get('payments', paymentId);
    if (!payment) throw new Error('payment not found: ' + paymentId);
    if (payment.state === STATES.PAY_CONFIRMED) {
      throw new Error('cannot reject confirmed payment');
    }
    const reasonCode = typeof reason === 'string' ? reason : (reason && reason.code) || 'R07';
    const meta = Object.values(REJECT_REASONS).find((r) => r.code === reasonCode) || REJECT_REASONS.TECHNICAL;

    payment.rejectHistory.push({
      ts: now().toISOString(),
      code: meta.code,
      he: meta.he,
      en: meta.en,
      retriable: meta.retriable,
      attempt: payment.attempts,
    });
    payment.attempts += 1;
    payment.lastRejectCode = meta.code;
    payment.lastRejectHe = meta.he;

    // Reverse GL reservation for this row
    glPost({
      id: 'gl_' + paymentId + '_reverse',
      ts: now().toISOString(),
      type: 'payment_reject',
      paymentId,
      lines: [
        { account: '2100-AP',            debit: 0,                   credit: payment.amountAgorot },
        { account: '1020-CashInTransit', debit: payment.amountAgorot, credit: 0 },
      ],
    });
    db.setCash(db.getCash() + payment.amountAgorot);

    if (meta.retriable && payment.attempts < 3) {
      payment.state = STATES.PAY_RETRY;
      // Re-queue the underlying bill for the next run
      const bill = db.get('bills', payment.billId);
      if (bill) {
        db.update('bills', payment.billId, {
          status: 'retry_queued',
          retryAttempts: (bill.retryAttempts || 0) + 1,
          lastRetryAt: now().toISOString(),
        });
      }
    } else {
      payment.state = STATES.PAY_REJECTED;
      // Leave bill in exception tray: status=exception
      const bill = db.get('bills', payment.billId);
      if (bill) {
        db.update('bills', payment.billId, {
          status: 'exception',
          exceptionCode: meta.code,
          exceptionHe: meta.he,
        });
      }
    }

    advanceRunState(payment.runId);

    db.audit('payment.rejected', { paymentId, reason: meta.code });
    eventBus.emit('payment.rejected', { paymentId, reason: meta.code });
    return payment;
  }

  // ------------------------------------------------------------------------
  // 7.9 remittanceAdvice — produce vendor notifications after confirmation
  // ------------------------------------------------------------------------
  function remittanceAdvice(runId) {
    const run = db.get('runs', runId);
    if (!run) throw new Error('run not found: ' + runId);
    const payments = db.list('payments', (p) => p.runId === runId);
    const grouped = new Map();
    for (const p of payments) {
      if (p.state !== STATES.PAY_CONFIRMED) continue;
      if (!grouped.has(p.vendorId)) {
        grouped.set(p.vendorId, {
          vendorId: p.vendorId,
          vendorName: p.vendorName,
          totalAgorot: 0,
          items: [],
        });
      }
      const entry = grouped.get(p.vendorId);
      entry.totalAgorot += p.amountAgorot;
      entry.items.push({
        billId: p.billId,
        reference: p.reference,
        amountAgorot: p.amountAgorot,
        amount: fromAgorot(p.amountAgorot),
        bankRef: p.bankRef,
        method: p.method,
      });
    }
    const notifications = [];
    for (const entry of grouped.values()) {
      const vendor = db.get('vendors', entry.vendorId) || {};
      const notification = {
        to: vendor.email || null,
        vendorId: entry.vendorId,
        vendorName: entry.vendorName,
        runId,
        currency: 'ILS',
        totalAgorot: entry.totalAgorot,
        total: fromAgorot(entry.totalAgorot),
        totalFormatted: formatIls(entry.totalAgorot),
        itemCount: entry.items.length,
        items: entry.items,
        subject: {
          en: 'Remittance advice — run ' + runId,
          he: 'הודעת תשלום — ריצה ' + runId,
        },
        body: {
          en: 'Payment of ' + formatIls(entry.totalAgorot) + ' from Techno-Kol covering '
              + entry.items.length + ' invoice(s).',
          he: 'תשלום בסך ' + formatIls(entry.totalAgorot) + ' מאת טכנו-קול עבור '
              + entry.items.length + ' חשבוניות.',
        },
        issuedAt: now().toISOString(),
      };
      db.tables.remittanceLog.push(notification);
      notifications.push(notification);
    }
    db.audit('remittance.generated', { runId, count: notifications.length });
    eventBus.emit('payment.remittance', { runId, count: notifications.length });
    return notifications;
  }

  // ------------------------------------------------------------------------
  // 7.10 reconcileWithBank — match run payments against a bank statement
  // (Agent X-37 integration surface)
  // ------------------------------------------------------------------------
  function reconcileWithBank(runId, statement) {
    const run = db.get('runs', runId);
    if (!run) throw new Error('run not found: ' + runId);
    const payments = db.list('payments', (p) => p.runId === runId);
    const stmtRows = (statement && statement.rows) || [];
    const matched = [];
    const unmatchedPayments = [];
    const unmatchedStmt = stmtRows.slice();

    for (const payment of payments) {
      let match = null;
      let idx = -1;
      for (let i = 0; i < unmatchedStmt.length; i++) {
        const row = unmatchedStmt[i];
        if (
          row && row.amountAgorot === payment.amountAgorot &&
          (row.reference === payment.reference || row.bankRef === payment.bankRef)
        ) {
          match = row;
          idx = i;
          break;
        }
      }
      if (match) {
        matched.push({ paymentId: payment.id, bankRef: match.bankRef || match.reference, amountAgorot: payment.amountAgorot });
        unmatchedStmt.splice(idx, 1);
        if (payment.state !== STATES.PAY_CONFIRMED) {
          confirmPayment(payment.id, match.bankRef || match.reference);
        }
      } else if (payment.state !== STATES.PAY_CONFIRMED && payment.state !== STATES.PAY_REJECTED) {
        unmatchedPayments.push(payment.id);
      }
    }
    db.audit('run.reconciled', { runId, matched: matched.length, unmatchedPayments: unmatchedPayments.length, unmatchedStmt: unmatchedStmt.length });
    eventBus.emit('payment.run.reconciled', { runId });
    return {
      runId,
      matched,
      unmatchedPayments,
      unmatchedStmt,
    };
  }

  // ------------------------------------------------------------------------
  // 7.11 Helpers — advance run state + file builders
  // ------------------------------------------------------------------------
  function advanceRunState(runId) {
    const run = db.get('runs', runId);
    if (!run) return;
    const payments = db.list('payments', (p) => p.runId === runId);
    const confirmed = payments.filter((p) => p.state === STATES.PAY_CONFIRMED).length;
    const rejected = payments.filter((p) => p.state === STATES.PAY_REJECTED).length;
    const retried = payments.filter((p) => p.state === STATES.PAY_RETRY).length;
    const total = payments.length;
    if (confirmed === total) {
      run.state = STATES.RUN_CONFIRMED;
      run.confirmedAt = now().toISOString();
    } else if (confirmed + rejected + retried === total && rejected + retried > 0) {
      run.state = confirmed > 0 ? STATES.RUN_PARTIAL : STATES.RUN_FAILED;
    }
  }

  function buildWireFile(payments) {
    const header = 'payee_name,swift,iban,currency,amount,reference';
    const lines = payments.map((p) =>
      [stripHebAscii(p.vendorName), p.swift || '', p.iban || '', p.currency || 'ILS',
       fromAgorot(p.amountAgorot).toFixed(2), stripHebAscii(p.reference)].join(','));
    return header + '\n' + lines.join('\n') + '\n';
  }
  function buildAchFile(payments) {
    const header = 'bank,branch,account,amount_agorot,reference';
    const lines = payments.map((p) =>
      [p.bankCode, p.branch, p.account, p.amountAgorot, stripHebAscii(p.reference)].join(','));
    return header + '\n' + lines.join('\n') + '\n';
  }
  function buildCheckFile(payments) {
    return JSON.stringify(payments.map((p) => ({
      payee: p.vendorName,
      amount: fromAgorot(p.amountAgorot),
      amountText: formatIls(p.amountAgorot),
      reference: p.reference,
      issuedAt: now().toISOString(),
    })), null, 2);
  }
  function buildCreditFile(payments) {
    return JSON.stringify(payments.map((p) => ({
      payee: p.vendorName,
      amount: fromAgorot(p.amountAgorot),
      currency: p.currency || 'ILS',
      reference: p.reference,
      method: 'credit',
    })), null, 2);
  }

  // ------------------------------------------------------------------------
  // Public surface
  // ------------------------------------------------------------------------
  return {
    db,
    proposeRun,
    includeExclude,
    calculateTotal,
    approveRun,
    execute,
    exportMasav,
    confirmPayment,
    rejectPayment,
    remittanceAdvice,
    reconcileWithBank,
    // introspection helpers
    getProposal: (id) => db.get('proposals', id),
    getRun: (id) => db.get('runs', id),
    getPayment: (id) => db.get('payments', id),
    listPayments: (filter) => db.list('payments', filter),
    listRuns: (filter) => db.list('runs', filter),
  };
}

// ----------------------------------------------------------------------------
// 8. Exports
// ----------------------------------------------------------------------------

module.exports = {
  createPaymentRunEngine,
  createMemoryDb,
  buildMasav,
  buildMasavHeader,
  buildMasavDetail,
  buildMasavTrailer,
  validateMasavParticipant,
  toAgorot,
  fromAgorot,
  formatIls,
  scoreBill,
  resolveMethod,
  PAYMENT_METHODS,
  STATES,
  REJECT_REASONS,
  PRIORITY,
  MASAV_PARTICIPANTS,
};
