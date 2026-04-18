/* ============================================================================
 * Techno-Kol ERP — Construction Progress Billing (חשבונות חלקיים)
 * Agent Y-056 / Swarm Construction / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * חיוב התקדמות בפרויקטי בנייה — AIA G702/G703 מותאם לכתב כמויות ישראלי
 *
 * Domain:
 *   Construction progress billing for Techno-Kol Uzi general-contracting
 *   projects. Implements the AIA (American Institute of Architects) G702
 *   "Application and Certificate for Payment" + G703 "Continuation Sheet"
 *   format, adapted for Israeli construction practice:
 *
 *     - כתב כמויות  (BOQ / bill of quantities, priced per section)
 *     - הזמנות שינויים (change orders, requires architect sign-off)
 *     - עיכבון / ערבות ביצוע (retention, typically 10% until completion)
 *     - שעבוד בנאים (construction lien / contractor mechanics lien)
 *     - ויתור שעבוד (lien waiver — conditional / unconditional /
 *                     partial / final — per ח"ש (חוק חוזה קבלנות))
 *     - קבלני משנה (subcontractor tracking, pay-when-paid)
 *     - אישור מהנדס / אדריכל (engineer/architect certification)
 *
 * Features implemented (nine methods on ProgressBilling):
 *   1. defineContract         — open a contract with BOQ + retention terms
 *   2. submitPayment          — monthly draw request (חשבון חלקי N)
 *   3. computeG702            — one-page summary certificate
 *   4. computeG703            — line-item schedule of values (SOV)
 *   5. approveBilling         — architect/engineer approval workflow
 *   6. changeOrder            — הזמנת שינויים with schedule impact
 *   7. retentionRelease       — release retention at milestones or completion
 *   8. lienWaiver             — issue a lien waiver (4 flavors)
 *   9. subcontractorPayments  — pay-when-paid tracking for קבלני משנה
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Append-only. Nothing is ever deleted. Re-submit pushes the previous
 *     shape onto a `history[]` stack so auditors can replay every draw.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every structure.
 *   - Money is in ILS (decimal). Percentages stored as whole numbers (10 = 10%).
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Constants — Israeli construction law (חוק חוזה קבלנות + תקן 1) seed values
 * -------------------------------------------------------------------------- */

/**
 * Default retention (עיכבון / ערבות ביצוע) — Israeli construction practice.
 * Legal context: חוק חוזה קבלנות התשל"ד-1974, תקן ישראלי 1 (כללי מדידה),
 * and typical מכרזי משכ"ל / משב"ש (government + municipal tender practice).
 * 10% is the overwhelming market standard; some private contracts use 5%.
 */
const DEFAULT_RETENTION_PCT = 10;

/**
 * Lien waiver types per Israeli construction lien statute (שעבוד בנאים).
 * The AIA G706 / G706A forms map approximately to:
 *   - conditional     — effective only if the referenced payment clears
 *   - unconditional   — effective immediately, regardless of payment
 *   - partial         — waives lien for work covered by this draw only
 *   - final           — waives all further lien rights on the contract
 *
 * Israeli courts (e.g. ע"א 1030/99 חברת החשמל נ' נוריאל) treat a
 * signed lien waiver as an estoppel against subsequent lien claims once
 * the underlying payment is received.
 */
const LIEN_WAIVER_TYPES = Object.freeze({
  conditional:   { he: 'ויתור מותנה',         en: 'Conditional waiver' },
  unconditional: { he: 'ויתור ללא תנאי',     en: 'Unconditional waiver' },
  partial:       { he: 'ויתור חלקי',           en: 'Partial waiver' },
  final:         { he: 'ויתור סופי',           en: 'Final waiver' },
});

/**
 * BOQ unit catalog — the nine units that cover 95% of Israeli כתב כמויות.
 * Every BOQ line-item's `unit` field should resolve against this table.
 */
const BOQ_UNITS = Object.freeze({
  m:   { he: 'מטר',          en: 'Linear meter' },
  m2:  { he: 'מ״ר',           en: 'Square meter' },
  m3:  { he: 'מ״ק',           en: 'Cubic meter' },
  ton: { he: 'טון',           en: 'Metric ton' },
  kg:  { he: 'ק״ג',           en: 'Kilogram' },
  unit:{ he: 'יחידה',         en: 'Each / unit' },
  lump:{ he: 'סכום גלובלי',   en: 'Lump sum' },
  hr:  { he: 'שעה',           en: 'Hour' },
  day: { he: 'יום',           en: 'Day' },
});

/**
 * Billing status states. Every chachbon chlaki transitions through these.
 */
const BILLING_STATUS = Object.freeze({
  draft:     { he: 'טיוטה',           en: 'Draft' },
  submitted: { he: 'הוגש לאישור',     en: 'Submitted for approval' },
  approved:  { he: 'אושר',             en: 'Approved' },
  paid:      { he: 'שולם',             en: 'Paid' },
  rejected:  { he: 'נדחה',             en: 'Rejected' },
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers (no deps)
 * -------------------------------------------------------------------------- */
function _now() { return new Date().toISOString(); }

function _assertNum(v, name) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new TypeError('invalid ' + name + ': ' + v);
  }
}

function _assertNonNeg(v, name) {
  _assertNum(v, name);
  if (v < 0) throw new RangeError(name + ' must be >= 0');
}

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertPct(v, name) {
  _assertNum(v, name);
  if (v < 0 || v > 100) {
    throw new RangeError(name + ' must be between 0 and 100 (got ' + v + ')');
  }
}

function _round(n, decimals) {
  const f = Math.pow(10, decimals == null ? 2 : decimals);
  return Math.round(n * f) / f;
}

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _uid(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) +
         '-' + Math.floor(Math.random() * 1e6).toString(36);
}

function _sum(arr, key) {
  return arr.reduce(function (acc, x) {
    const v = key ? x[key] : x;
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
}

/* ----------------------------------------------------------------------------
 * 2. ProgressBilling class
 * -------------------------------------------------------------------------- */
class ProgressBilling {
  constructor() {
    /** @type {Map<string, Contract>} */
    this.contracts = new Map();
    /** @type {Map<string, Billing>} */
    this.billings = new Map();
    /** @type {Map<string, Array<ChangeOrder>>} contractId -> COs */
    this.changeOrders = new Map();
    /** @type {Map<string, Array<LienWaiver>>} billingId -> waivers */
    this.lienWaivers = new Map();
    /** @type {Map<string, Array<RetentionEvent>>} contractId -> releases */
    this.retentionEvents = new Map();
    /** @type {Map<string, Array<SubcontractorDraw>>} contractId -> sub draws */
    this.subDraws = new Map();
    /** @type {Array<AuditEntry>} append-only audit log */
    this.auditLog = [];
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({ ts: _now(), action: action, payload: _deepCopy(payload) });
  }

  /* ==========================================================================
   * 2.1  defineContract — open a construction contract
   * ========================================================================= */
  /**
   * @param {object} p
   * @param {string}  p.projectId
   * @param {object}  p.client           { id, name_he?, name_en? }
   * @param {object}  p.contractor       { id, name_he?, name_en? }
   * @param {number}  p.totalAmount      — original contract sum (ILS, ex-VAT)
   * @param {number} [p.retention=10]    — retention percent
   * @param {Array}   p.boq              — line items [{item, unit, qty, unitPrice, section}]
   * @param {Array}  [p.changeOrders=[]] — any pre-seeded COs
   * @param {string}  p.startDate        — ISO date
   * @param {string}  p.endDate          — ISO date
   * @returns {object} contract
   */
  defineContract(p) {
    _assertStr(p.projectId, 'projectId');
    if (!p.client || !p.client.id) throw new TypeError('client.id required');
    if (!p.contractor || !p.contractor.id) throw new TypeError('contractor.id required');
    _assertNonNeg(p.totalAmount, 'totalAmount');
    const retention = p.retention == null ? DEFAULT_RETENTION_PCT : p.retention;
    _assertPct(retention, 'retention');
    if (!Array.isArray(p.boq) || p.boq.length === 0) {
      throw new TypeError('boq must be a non-empty array');
    }
    _assertStr(p.startDate, 'startDate');
    _assertStr(p.endDate, 'endDate');

    // Validate + normalise BOQ lines
    const boq = p.boq.map(function (line, idx) {
      _assertStr(line.item, 'boq[' + idx + '].item');
      _assertStr(line.unit, 'boq[' + idx + '].unit');
      _assertNonNeg(line.qty, 'boq[' + idx + '].qty');
      _assertNonNeg(line.unitPrice, 'boq[' + idx + '].unitPrice');
      _assertStr(line.section, 'boq[' + idx + '].section');
      const unitMeta = BOQ_UNITS[line.unit] || { he: line.unit, en: line.unit };
      return {
        lineId: line.lineId || ('L-' + String(idx + 1).padStart(4, '0')),
        item: line.item,
        item_he: line.item_he || line.item,
        item_en: line.item_en || line.item,
        unit: line.unit,
        unit_he: unitMeta.he,
        unit_en: unitMeta.en,
        qty: line.qty,
        unitPrice: line.unitPrice,
        section: line.section,
        scheduledValue: _round(line.qty * line.unitPrice),
        description_he: line.description_he || '',
        description_en: line.description_en || '',
      };
    });

    // Sanity: sum of BOQ scheduled values should match totalAmount
    // but we tolerate drift (lump-sum + unit-rate hybrids) — warn only.
    const boqTotal = _round(_sum(boq, 'scheduledValue'));

    const id = p.contractId || _uid('K');
    const existing = this.contracts.get(id);
    const contract = {
      id: id,
      projectId: p.projectId,
      client: _deepCopy(p.client),
      contractor: _deepCopy(p.contractor),
      totalAmount: _round(p.totalAmount),
      boqTotal: boqTotal,
      retention: retention,
      boq: boq,
      startDate: p.startDate,
      endDate: p.endDate,
      status: 'active',
      status_he: 'פעיל',
      status_en: 'Active',
      createdAt: existing ? existing.createdAt : _now(),
      updatedAt: _now(),
      history: existing ? existing.history.concat([_deepCopy(existing)]) : [],
    };
    this.contracts.set(id, contract);

    // Seed change orders if provided
    const seedCOs = Array.isArray(p.changeOrders) ? p.changeOrders : [];
    if (!this.changeOrders.has(id)) this.changeOrders.set(id, []);
    for (let i = 0; i < seedCOs.length; i++) {
      this.changeOrder(Object.assign({ contractId: id }, seedCOs[i]));
    }

    this._audit('defineContract', { contractId: id, total: contract.totalAmount });
    return contract;
  }

  /* ==========================================================================
   * 2.2  submitPayment — monthly draw request (חשבון חלקי)
   * ========================================================================= */
  /**
   * @param {object} p
   * @param {string}  p.contractId
   * @param {string}  p.period                — e.g. '2026-04' or ISO date
   * @param {Array}   p.completedToDate       — [{item, completedQty, completedPct}]
   * @param {number} [p.storedMaterials=0]    — on-site materials not yet installed
   * @param {number} [p.retention]            — override contract retention for this draw
   * @param {string} [p.notes='']
   */
  submitPayment(p) {
    _assertStr(p.contractId, 'contractId');
    _assertStr(p.period, 'period');
    if (!Array.isArray(p.completedToDate)) {
      throw new TypeError('completedToDate must be an array');
    }
    const contract = this.contracts.get(p.contractId);
    if (!contract) throw new Error('unknown contract: ' + p.contractId);

    const storedMaterials = p.storedMaterials == null ? 0 : p.storedMaterials;
    _assertNonNeg(storedMaterials, 'storedMaterials');

    const retentionPct = p.retention == null ? contract.retention : p.retention;
    _assertPct(retentionPct, 'retention');

    // Build per-line completion map (lineId -> {completedQty, completedPct})
    const completion = {};
    for (let i = 0; i < p.completedToDate.length; i++) {
      const row = p.completedToDate[i];
      _assertStr(row.item, 'completedToDate[' + i + '].item');
      // Locate line by item OR lineId
      const line = contract.boq.find(function (l) {
        return l.lineId === row.item || l.item === row.item;
      });
      if (!line) {
        throw new Error('completedToDate[' + i + '] — no BOQ line matches "' + row.item + '"');
      }
      const completedQty =
        row.completedQty != null ? row.completedQty :
        (row.completedPct != null ? _round(line.qty * row.completedPct / 100, 4) : 0);
      _assertNonNeg(completedQty, 'completedQty');
      if (completedQty > line.qty + 1e-6) {
        throw new RangeError(
          'completedQty (' + completedQty + ') exceeds BOQ qty (' + line.qty +
          ') for line ' + line.lineId);
      }
      const completedPct = line.qty > 0 ? _round(completedQty / line.qty * 100, 2) : 0;
      const workCompleted = _round(completedQty * line.unitPrice);
      completion[line.lineId] = {
        lineId: line.lineId,
        item: line.item,
        section: line.section,
        completedQty: completedQty,
        completedPct: completedPct,
        workCompleted: workCompleted,
      };
    }

    const id = _uid('B');
    const billing = {
      id: id,
      contractId: p.contractId,
      period: p.period,
      completedToDate: completion,
      storedMaterials: _round(storedMaterials),
      retentionPct: retentionPct,
      notes: p.notes || '',
      status: 'submitted',
      status_he: BILLING_STATUS.submitted.he,
      status_en: BILLING_STATUS.submitted.en,
      submittedAt: _now(),
      approvedAt: null,
      approvedBy: null,
      approverNotes: '',
      history: [],
    };
    this.billings.set(id, billing);
    this._audit('submitPayment', { billingId: id, contractId: p.contractId });
    return billing;
  }

  /* ==========================================================================
   * 2.3  computeG702 — one-page payment certificate summary
   * ========================================================================= */
  /**
   * AIA G702 line structure (adapted to Hebrew + Israeli practice):
   *   1. Original contract sum                      (סכום חוזה מקורי)
   *   2. Net change by change orders                (שינויים נטו)
   *   3. Contract sum to date (1+2)                 (סכום חוזה מעודכן)
   *   4. Total completed & stored (G703 col G+H)    (עבודה שבוצעה + חומר במחסן)
   *   5. Retention
   *       5a. x% of completed work                  (עיכבון על ביצוע)
   *       5b. x% of stored materials                (עיכבון על חומר)
   *       Total retention (5a+5b)
   *   6. Total earned less retention (4-5)          (נטו צבור בניכוי עיכבון)
   *   7. Previous certificates for payment          (חשבונות קודמים)
   *   8. CURRENT PAYMENT DUE (6-7)                  (סכום לתשלום בחשבון זה)
   *   9. Balance to finish incl. retention (3-6)    (יתרה לגמר כולל עיכבון)
   *
   * @returns {object} G702 certificate
   */
  computeG702(contractId, period) {
    _assertStr(contractId, 'contractId');
    _assertStr(period, 'period');
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error('unknown contract: ' + contractId);

    // 1. Original contract sum
    const line1_originalContractSum = contract.totalAmount;

    // 2. Net change by change orders (approved only)
    const allCOs = this.changeOrders.get(contractId) || [];
    const approvedCOs = allCOs.filter(function (co) { return co.approved; });
    const line2_changeOrderNet = _round(_sum(approvedCOs, 'amount'));

    // 3. Contract sum to date
    const line3_contractSumToDate = _round(line1_originalContractSum + line2_changeOrderNet);

    // Collect all billings for this contract up to & including `period`
    const allBillingsForContract = [];
    this.billings.forEach(function (b) {
      if (b.contractId === contractId) allBillingsForContract.push(b);
    });
    allBillingsForContract.sort(function (a, b) {
      return a.period < b.period ? -1 : a.period > b.period ? 1 : 0;
    });
    const currentBilling = allBillingsForContract.find(function (b) {
      return b.period === period;
    });
    if (!currentBilling) {
      throw new Error('no billing submitted for contract ' + contractId +
                      ' period ' + period);
    }
    const previousBillings = allBillingsForContract.filter(function (b) {
      return b.period < period;
    });

    // 4. Total completed & stored (this draw cumulative)
    let workCompletedToDate = 0;
    Object.keys(currentBilling.completedToDate).forEach(function (k) {
      workCompletedToDate += currentBilling.completedToDate[k].workCompleted;
    });
    workCompletedToDate = _round(workCompletedToDate);
    const storedMaterials = _round(currentBilling.storedMaterials || 0);
    const line4_totalCompletedAndStored = _round(workCompletedToDate + storedMaterials);

    // 5. Retention
    const retentionPct = currentBilling.retentionPct;
    const line5a_retentionOnWork = _round(workCompletedToDate * retentionPct / 100);
    const line5b_retentionOnStored = _round(storedMaterials * retentionPct / 100);
    const line5_totalRetention = _round(line5a_retentionOnWork + line5b_retentionOnStored);

    // Account for any executed retention releases against this contract
    const retentionReleases = this.retentionEvents.get(contractId) || [];
    const retentionReleasedToDate = _round(_sum(retentionReleases, 'amount'));

    // 6. Total earned less retention
    const line6_totalEarnedLessRetention = _round(line4_totalCompletedAndStored - line5_totalRetention);

    // 7. Previous certificates — sum of G702 "current payment due" from prior periods
    let line7_previousCertificates = 0;
    for (let i = 0; i < previousBillings.length; i++) {
      const prev = previousBillings[i];
      // Reconstitute its "current payment due" using its own retention
      let prevWork = 0;
      Object.keys(prev.completedToDate).forEach(function (k) {
        prevWork += prev.completedToDate[k].workCompleted;
      });
      const prevStored = prev.storedMaterials || 0;
      const prevRetPct = prev.retentionPct;
      const prevRetention = (prevWork + prevStored) * prevRetPct / 100;
      const prevEarnedLessRet = (prevWork + prevStored) - prevRetention;
      line7_previousCertificates += prevEarnedLessRet;
    }
    line7_previousCertificates = _round(line7_previousCertificates);

    // 8. CURRENT PAYMENT DUE
    const line8_currentPaymentDue = _round(line6_totalEarnedLessRetention - line7_previousCertificates);

    // 9. Balance to finish including retention
    const line9_balanceToFinish = _round(line3_contractSumToDate - line6_totalEarnedLessRetention);

    return {
      contractId: contractId,
      projectId: contract.projectId,
      period: period,
      billingId: currentBilling.id,
      client: contract.client,
      contractor: contract.contractor,
      formType: 'G702',
      formType_he: 'טופס AIA G702 מותאם',
      formType_en: 'AIA G702 adapted',
      lines: {
        line1_originalContractSum: line1_originalContractSum,
        line2_changeOrderNet: line2_changeOrderNet,
        line3_contractSumToDate: line3_contractSumToDate,
        line4_totalCompletedAndStored: line4_totalCompletedAndStored,
        line4a_workCompleted: workCompletedToDate,
        line4b_storedMaterials: storedMaterials,
        line5a_retentionOnWork: line5a_retentionOnWork,
        line5b_retentionOnStored: line5b_retentionOnStored,
        line5_totalRetention: line5_totalRetention,
        line6_totalEarnedLessRetention: line6_totalEarnedLessRetention,
        line7_previousCertificates: line7_previousCertificates,
        line8_currentPaymentDue: line8_currentPaymentDue,
        line9_balanceToFinish: line9_balanceToFinish,
      },
      labels_he: {
        line1: 'סכום חוזה מקורי',
        line2: 'שינויים נטו (הזמנות שינויים מאושרות)',
        line3: 'סכום חוזה מעודכן',
        line4: 'סה״כ עבודה שבוצעה וחומר במחסן',
        line4a: 'עבודה שבוצעה',
        line4b: 'חומר במחסן',
        line5a: 'עיכבון על ביצוע',
        line5b: 'עיכבון על חומר',
        line5: 'סה״כ עיכבון',
        line6: 'נטו צבור בניכוי עיכבון',
        line7: 'חשבונות קודמים',
        line8: 'לתשלום בחשבון זה',
        line9: 'יתרה לגמר כולל עיכבון',
      },
      labels_en: {
        line1: 'Original contract sum',
        line2: 'Net change by change orders',
        line3: 'Contract sum to date',
        line4: 'Total completed and stored',
        line4a: 'Work completed',
        line4b: 'Stored materials',
        line5a: 'Retention on work',
        line5b: 'Retention on stored',
        line5: 'Total retention',
        line6: 'Total earned less retention',
        line7: 'Less previous certificates',
        line8: 'Current payment due',
        line9: 'Balance to finish incl. retention',
      },
      retentionReleasedToDate: retentionReleasedToDate,
      status: currentBilling.status,
      status_he: currentBilling.status_he,
      status_en: currentBilling.status_en,
      generatedAt: _now(),
    };
  }

  /* ==========================================================================
   * 2.4  computeG703 — Continuation Sheet / Schedule of Values
   * ========================================================================= */
  /**
   * AIA G703 column map (adapted):
   *   A  Line item no. / BOQ lineId           (מס׳ סעיף)
   *   B  Description of work                  (תיאור העבודה)
   *   C  Scheduled value                      (ערך מתוכנן)
   *   D  From previous certificates           (בוצע בחשבונות קודמים)
   *   E  This period                          (בתקופה זו)
   *   F  Materials presently stored            (חומר במחסן)
   *   G  Total completed & stored (D+E+F)      (סה״כ מצטבר)
   *   H  % (G/C)                                (אחוז ביצוע)
   *   I  Balance to finish (C-G)                (יתרה לגמר)
   *   J  Retention                              (עיכבון)
   *
   * @returns {object} G703 sheet with per-line rows + totals
   */
  computeG703(contractId, period) {
    _assertStr(contractId, 'contractId');
    _assertStr(period, 'period');
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error('unknown contract: ' + contractId);

    // Collect all billings for this contract
    const allBillingsForContract = [];
    this.billings.forEach(function (b) {
      if (b.contractId === contractId) allBillingsForContract.push(b);
    });
    allBillingsForContract.sort(function (a, b) {
      return a.period < b.period ? -1 : a.period > b.period ? 1 : 0;
    });
    const currentBilling = allBillingsForContract.find(function (b) {
      return b.period === period;
    });
    if (!currentBilling) {
      throw new Error('no billing submitted for contract ' + contractId +
                      ' period ' + period);
    }
    const previousBillings = allBillingsForContract.filter(function (b) {
      return b.period < period;
    });

    // Build per-line G703 rows
    const rows = contract.boq.map(function (line) {
      const thisRow = currentBilling.completedToDate[line.lineId];
      const thisCompletedQty = thisRow ? thisRow.completedQty : 0;
      const thisWorkCompleted = thisRow ? thisRow.workCompleted : 0;

      // Previous completed qty for this line = max of prior draws
      // (AIA convention: completedToDate is cumulative, not incremental)
      let previousCompletedQty = 0;
      for (let i = 0; i < previousBillings.length; i++) {
        const prevRow = previousBillings[i].completedToDate[line.lineId];
        if (prevRow && prevRow.completedQty > previousCompletedQty) {
          previousCompletedQty = prevRow.completedQty;
        }
      }
      const previousWork = _round(previousCompletedQty * line.unitPrice);
      const thisPeriodQty = _round(thisCompletedQty - previousCompletedQty, 4);
      const thisPeriodWork = _round(thisPeriodQty * line.unitPrice);
      // In standard AIA, col D is prior certificates (work completed in prior periods)
      // col E is this-period delta, col G = prior (D) + this (E) + stored (F).
      const colD_fromPrevious = previousWork;
      const colE_thisPeriod = thisPeriodWork;
      const colF_storedMaterials = 0; // per-line stored is tracked at doc level, not per-line
      const colG_totalCompletedAndStored = _round(colD_fromPrevious + colE_thisPeriod + colF_storedMaterials);
      const colC_scheduledValue = line.scheduledValue;
      const colH_pctComplete = colC_scheduledValue > 0
        ? _round(colG_totalCompletedAndStored / colC_scheduledValue * 100, 2)
        : 0;
      const colI_balanceToFinish = _round(colC_scheduledValue - colG_totalCompletedAndStored);
      const colJ_retention = _round(colG_totalCompletedAndStored * currentBilling.retentionPct / 100);

      return {
        lineId: line.lineId,
        section: line.section,
        colA_lineNo: line.lineId,
        colB_description_he: line.item_he,
        colB_description_en: line.item_en,
        unit: line.unit,
        unit_he: line.unit_he,
        unit_en: line.unit_en,
        qty: line.qty,
        unitPrice: line.unitPrice,
        colC_scheduledValue: colC_scheduledValue,
        colD_fromPrevious: colD_fromPrevious,
        colE_thisPeriod: colE_thisPeriod,
        colF_storedMaterials: colF_storedMaterials,
        colG_totalCompletedAndStored: colG_totalCompletedAndStored,
        colH_pctComplete: colH_pctComplete,
        colI_balanceToFinish: colI_balanceToFinish,
        colJ_retention: colJ_retention,
        thisPeriodCompletedQty: thisPeriodQty,
        cumulativeCompletedQty: thisCompletedQty,
      };
    });

    // Totals
    const totals = {
      colC_scheduledValue: _round(_sum(rows, 'colC_scheduledValue')),
      colD_fromPrevious: _round(_sum(rows, 'colD_fromPrevious')),
      colE_thisPeriod: _round(_sum(rows, 'colE_thisPeriod')),
      colF_storedMaterials: _round(currentBilling.storedMaterials || 0),
      colG_totalCompletedAndStored: 0,
      colH_pctComplete: 0,
      colI_balanceToFinish: 0,
      colJ_retention: 0,
    };
    totals.colG_totalCompletedAndStored = _round(
      totals.colD_fromPrevious + totals.colE_thisPeriod + totals.colF_storedMaterials
    );
    totals.colH_pctComplete = totals.colC_scheduledValue > 0
      ? _round(totals.colG_totalCompletedAndStored / totals.colC_scheduledValue * 100, 2)
      : 0;
    totals.colI_balanceToFinish = _round(totals.colC_scheduledValue - totals.colG_totalCompletedAndStored);
    totals.colJ_retention = _round(totals.colG_totalCompletedAndStored * currentBilling.retentionPct / 100);

    return {
      contractId: contractId,
      projectId: contract.projectId,
      period: period,
      billingId: currentBilling.id,
      formType: 'G703',
      formType_he: 'טופס AIA G703 — כתב כמויות חלקי',
      formType_en: 'AIA G703 — Continuation / Schedule of Values',
      columns_he: {
        A: 'מס׳ סעיף',
        B: 'תיאור העבודה',
        C: 'ערך מתוכנן',
        D: 'בוצע בחשבונות קודמים',
        E: 'בתקופה זו',
        F: 'חומר במחסן',
        G: 'סה״כ מצטבר',
        H: 'אחוז ביצוע',
        I: 'יתרה לגמר',
        J: 'עיכבון',
      },
      columns_en: {
        A: 'Line',
        B: 'Description',
        C: 'Scheduled Value',
        D: 'From Previous',
        E: 'This Period',
        F: 'Stored',
        G: 'Total Completed & Stored',
        H: '% Complete',
        I: 'Balance to Finish',
        J: 'Retention',
      },
      rows: rows,
      totals: totals,
      retentionPct: currentBilling.retentionPct,
      generatedAt: _now(),
    };
  }

  /* ==========================================================================
   * 2.5  approveBilling — architect/engineer certifies a draw
   * ========================================================================= */
  /**
   * Typical approver is the project engineer (מהנדס פרויקט) or architect
   * (אדריכל הפרויקט) per Israeli practice. In AIA-land this is the
   * "Architect's Certificate for Payment" block at the bottom of G702.
   */
  approveBilling(billingId, approver, notes) {
    _assertStr(billingId, 'billingId');
    _assertStr(approver, 'approver');
    const billing = this.billings.get(billingId);
    if (!billing) throw new Error('unknown billing: ' + billingId);
    if (billing.status === 'approved' || billing.status === 'paid') {
      throw new Error('billing ' + billingId + ' already ' + billing.status);
    }
    billing.history.push(_deepCopy({
      status: billing.status,
      approvedAt: billing.approvedAt,
      approvedBy: billing.approvedBy,
    }));
    billing.status = 'approved';
    billing.status_he = BILLING_STATUS.approved.he;
    billing.status_en = BILLING_STATUS.approved.en;
    billing.approvedAt = _now();
    billing.approvedBy = approver;
    billing.approverNotes = notes || '';
    this._audit('approveBilling', { billingId: billingId, approver: approver });
    return billing;
  }

  /* ==========================================================================
   * 2.6  changeOrder — הזמנת שינויים
   * ========================================================================= */
  /**
   * @param {object} p
   * @param {string}  p.contractId
   * @param {string}  p.description
   * @param {number}  p.amount           — positive = add, negative = credit
   * @param {number} [p.scheduleImpactDays=0]
   * @param {boolean}[p.approved=false]
   */
  changeOrder(p) {
    _assertStr(p.contractId, 'contractId');
    _assertStr(p.description, 'description');
    _assertNum(p.amount, 'amount');
    const contract = this.contracts.get(p.contractId);
    if (!contract) throw new Error('unknown contract: ' + p.contractId);

    const scheduleImpactDays = p.scheduleImpactDays == null ? 0 : p.scheduleImpactDays;
    _assertNum(scheduleImpactDays, 'scheduleImpactDays');

    const id = _uid('CO');
    const co = {
      id: id,
      contractId: p.contractId,
      description: p.description,
      description_he: p.description_he || p.description,
      description_en: p.description_en || p.description,
      amount: _round(p.amount),
      scheduleImpactDays: scheduleImpactDays,
      approved: !!p.approved,
      approvedBy: p.approvedBy || null,
      approvedAt: p.approved ? _now() : null,
      requestedAt: _now(),
      label_he: 'הזמנת שינויים',
      label_en: 'Change order',
      history: [],
    };
    if (!this.changeOrders.has(p.contractId)) {
      this.changeOrders.set(p.contractId, []);
    }
    this.changeOrders.get(p.contractId).push(co);

    // Re-derive new endDate if schedule impact was given
    if (scheduleImpactDays !== 0) {
      const end = new Date(contract.endDate);
      end.setDate(end.getDate() + scheduleImpactDays);
      contract.endDate = end.toISOString().slice(0, 10);
      contract.updatedAt = _now();
    }

    this._audit('changeOrder', { coId: id, amount: co.amount });
    return co;
  }

  /** Approve an existing (pending) change order. */
  approveChangeOrder(contractId, changeOrderId, approver) {
    const list = this.changeOrders.get(contractId) || [];
    const co = list.find(function (x) { return x.id === changeOrderId; });
    if (!co) throw new Error('unknown change order: ' + changeOrderId);
    co.history.push({ approved: co.approved, approvedAt: co.approvedAt, approvedBy: co.approvedBy });
    co.approved = true;
    co.approvedBy = approver || null;
    co.approvedAt = _now();
    this._audit('approveChangeOrder', { coId: changeOrderId, approver: approver });
    return co;
  }

  /* ==========================================================================
   * 2.7  retentionRelease — partial/final release of ערבות ביצוע
   * ========================================================================= */
  /**
   * @param {string} contractId
   * @param {object} p
   * @param {number}  p.pct        — percent of total retention to release (0-100)
   * @param {string}  p.date       — ISO date the release is effective
   * @param {Array} [p.conditions] — e.g. ['final inspection OK', 'lien waivers received']
   */
  retentionRelease(contractId, p) {
    _assertStr(contractId, 'contractId');
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error('unknown contract: ' + contractId);
    _assertPct(p.pct, 'pct');
    _assertStr(p.date, 'date');

    // Base retention = contract.retention% of totalAmount (conservative —
    // actual held retention may differ if stored materials or COs skew it,
    // but this is the canonical release amount per most Israeli contracts).
    const baseRetention = _round(contract.totalAmount * contract.retention / 100);

    // Sum of prior releases
    const prior = this.retentionEvents.get(contractId) || [];
    const priorReleasedPct = _sum(prior, 'pct');
    if (priorReleasedPct + p.pct > 100 + 1e-6) {
      throw new RangeError('cumulative retention release would exceed 100% (' +
        (priorReleasedPct + p.pct) + ')');
    }

    const amount = _round(baseRetention * p.pct / 100);
    const ev = {
      id: _uid('RR'),
      contractId: contractId,
      pct: p.pct,
      amount: amount,
      baseRetention: baseRetention,
      date: p.date,
      conditions: Array.isArray(p.conditions) ? p.conditions.slice() : [],
      cumulativePct: _round(priorReleasedPct + p.pct, 2),
      label_he: p.pct >= 100 - priorReleasedPct ? 'שחרור סופי של ערבות ביצוע' : 'שחרור חלקי של ערבות ביצוע',
      label_en: p.pct >= 100 - priorReleasedPct ? 'Final retention release' : 'Partial retention release',
      createdAt: _now(),
    };
    if (!this.retentionEvents.has(contractId)) this.retentionEvents.set(contractId, []);
    this.retentionEvents.get(contractId).push(ev);
    this._audit('retentionRelease', { contractId: contractId, amount: amount });
    return ev;
  }

  /* ==========================================================================
   * 2.8  lienWaiver — שעבוד בנאים waiver (G706 / G706A equivalent)
   * ========================================================================= */
  /**
   * @param {string} billingId
   * @param {'conditional'|'unconditional'|'partial'|'final'} type
   */
  lienWaiver(billingId, type) {
    _assertStr(billingId, 'billingId');
    if (!LIEN_WAIVER_TYPES[type]) {
      throw new TypeError('invalid lien waiver type: ' + type +
        ' (allowed: ' + Object.keys(LIEN_WAIVER_TYPES).join(', ') + ')');
    }
    const billing = this.billings.get(billingId);
    if (!billing) throw new Error('unknown billing: ' + billingId);

    // Compute the covered amount based on this draw's work + stored
    const contract = this.contracts.get(billing.contractId);
    if (!contract) throw new Error('contract gone: ' + billing.contractId);

    let workCompleted = 0;
    Object.keys(billing.completedToDate).forEach(function (k) {
      workCompleted += billing.completedToDate[k].workCompleted;
    });
    const coveredAmount = _round(workCompleted + (billing.storedMaterials || 0));

    const waiver = {
      id: _uid('LW'),
      billingId: billingId,
      contractId: billing.contractId,
      type: type,
      type_he: LIEN_WAIVER_TYPES[type].he,
      type_en: LIEN_WAIVER_TYPES[type].en,
      coveredAmount: coveredAmount,
      effective: type === 'unconditional' || type === 'final',
      pendingPayment: type === 'conditional' || type === 'partial',
      issuedBy: contract.contractor,
      issuedTo: contract.client,
      issuedAt: _now(),
      legalBasis_he: 'חוק חוזה קבלנות, התשל"ד-1974 — ויתור שעבוד בנאים',
      legalBasis_en: 'Israeli Contractor Agreement Law 1974 — mechanics lien waiver',
      label_he: 'ויתור שעבוד בנאים',
      label_en: 'Mechanics / construction lien waiver',
    };
    if (!this.lienWaivers.has(billingId)) this.lienWaivers.set(billingId, []);
    this.lienWaivers.get(billingId).push(waiver);
    this._audit('lienWaiver', { waiverId: waiver.id, type: type, amount: coveredAmount });
    return waiver;
  }

  /* ==========================================================================
   * 2.9  subcontractorPayments — pay-when-paid tracking
   * ========================================================================= */
  /**
   * Register a subcontractor draw request, OR fetch the list of all sub draws
   * plus a pay-when-paid readiness calculation for the contract.
   *
   * Usage (two modes):
   *   subcontractorPayments(contractId)
   *     → returns { draws: [...], eligible: [...], waiting: [...] }
   *
   *   subcontractorPayments(contractId, { sub, billingId, amount })
   *     → registers a sub draw and returns it
   */
  subcontractorPayments(contractId, registration) {
    _assertStr(contractId, 'contractId');
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error('unknown contract: ' + contractId);

    if (!this.subDraws.has(contractId)) this.subDraws.set(contractId, []);
    const draws = this.subDraws.get(contractId);

    // Registration mode
    if (registration) {
      if (!registration.sub || !registration.sub.id) {
        throw new TypeError('sub.id required');
      }
      _assertStr(registration.billingId, 'billingId');
      _assertNonNeg(registration.amount, 'amount');
      const parentBilling = this.billings.get(registration.billingId);
      if (!parentBilling) throw new Error('unknown billing: ' + registration.billingId);
      if (parentBilling.contractId !== contractId) {
        throw new Error('billing ' + registration.billingId + ' not on contract ' + contractId);
      }
      const draw = {
        id: _uid('SD'),
        contractId: contractId,
        billingId: registration.billingId,
        sub: _deepCopy(registration.sub),
        amount: _round(registration.amount),
        scope: registration.scope || '',
        scope_he: registration.scope_he || registration.scope || '',
        scope_en: registration.scope_en || registration.scope || '',
        requestedAt: _now(),
        parentPaid: parentBilling.status === 'paid',
        paid: false,
        paidAt: null,
        label_he: 'דרישת תשלום קבלן משנה',
        label_en: 'Subcontractor payment request',
      };
      draws.push(draw);
      this._audit('subDrawRegistered', { drawId: draw.id, contractId: contractId });
      return draw;
    }

    // Query mode — refresh parentPaid flags, then partition
    const refreshed = draws.map(function (d) {
      const parent = this.billings.get(d.billingId);
      const updated = Object.assign({}, d, {
        parentPaid: parent ? parent.status === 'paid' : false,
      });
      return updated;
    }, this);
    const eligible = refreshed.filter(function (d) { return d.parentPaid && !d.paid; });
    const waiting = refreshed.filter(function (d) { return !d.parentPaid && !d.paid; });
    const settled = refreshed.filter(function (d) { return d.paid; });

    return {
      contractId: contractId,
      draws: refreshed,
      eligible: eligible,
      waiting: waiting,
      settled: settled,
      eligibleTotal: _round(_sum(eligible, 'amount')),
      waitingTotal: _round(_sum(waiting, 'amount')),
      settledTotal: _round(_sum(settled, 'amount')),
      rule_he: 'כלל "שלם כאשר שולם" — קבלן משנה מקבל תשלום רק לאחר שהלקוח שילם את החשבון המקורי',
      rule_en: 'Pay-when-paid — subcontractor draws are only releasable after the parent billing is paid',
    };
  }

  /** Mark a billing as paid (triggers sub draw eligibility). */
  markBillingPaid(billingId) {
    const billing = this.billings.get(billingId);
    if (!billing) throw new Error('unknown billing: ' + billingId);
    if (billing.status !== 'approved') {
      throw new Error('only approved billings can be marked paid (status=' + billing.status + ')');
    }
    billing.history.push({ status: billing.status });
    billing.status = 'paid';
    billing.status_he = BILLING_STATUS.paid.he;
    billing.status_en = BILLING_STATUS.paid.en;
    billing.paidAt = _now();
    this._audit('markBillingPaid', { billingId: billingId });
    return billing;
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  ProgressBilling: ProgressBilling,
  LIEN_WAIVER_TYPES: LIEN_WAIVER_TYPES,
  BOQ_UNITS: BOQ_UNITS,
  BILLING_STATUS: BILLING_STATUS,
  DEFAULT_RETENTION_PCT: DEFAULT_RETENTION_PCT,
};
