/**
 * transfer-pricing.js — Israeli Transfer Pricing documentation engine (Section 85A).
 * Agent Y-010 / Swarm 4A / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * מסמכי תמחור העברות — סעיף 85א לפקודת מס הכנסה
 * Transfer Pricing Documentation — Section 85A of the Israeli Income Tax Ordinance
 *
 * This module builds the full tri-tiered OECD/Israel transfer pricing file
 * set that a multinational with a presence in Israel needs to keep on hand:
 *
 *   1. Master File     — group-wide overview
 *                        (תיק אב — מסמך קבוצתי כולל)
 *   2. Local File      — per-entity detailed file
 *                        (תיק מקומי — מסמך לישות ספציפית)
 *   3. Country-by-Country Report (CbCR) — BEPS Action 13
 *                        (דוח לפי מדינה — פעולה 13)
 *
 * On top of the three documents the module also exposes:
 *
 *   • computeArmLength  — range calculator for the five OECD methods
 *                         (CUP, Resale Price, Cost Plus, TNMM, Profit Split)
 *   • checkThreshold    — Israeli CbCR filing threshold (group revenue
 *                         > €750,000,000 — consolidated, prior year)
 *   • generateForm1385  — טופס 1385 (הצהרה על עסקאות בינלאומיות)
 *                         — Israeli declaration of international related-party
 *                         transactions, filed with the annual return
 *
 * Rule of engagement: **לא מוחקים — רק משדרגים ומגדלים**.
 * Additive only, zero external dependencies, Hebrew + English bilingual,
 * pure Node.js built-ins.
 *
 * ---------------------------------------------------------------------------
 * References:
 *   • פקודת מס הכנסה, סעיף 85א — Transfer Pricing (Arm's Length principle)
 *   • תקנות מס הכנסה (קביעת תנאי שוק), התשס"ז-2006
 *   • חוזר מס הכנסה 3/2008 — מחירי העברה
 *   • חוזר מס הכנסה 11/2018 — Transfer Pricing — Documentation Requirements
 *   • טופס 1385 — הצהרה על עסקאות בינלאומיות בין צדדים קשורים
 *   • OECD Transfer Pricing Guidelines (2022)
 *   • OECD BEPS Action 13 — Country-by-Country Reporting
 *   • OECD CbC XML Schema v2.0 — oecd:CbcBody:stf:v2
 *
 * ---------------------------------------------------------------------------
 * Public exports:
 *
 *   generateMasterFile(group)
 *     → object with the group-wide master file sections
 *       (group structure, business description, intangibles, financing,
 *        consolidated financials, APAs, MAPs, metadata)
 *
 *   generateLocalFile(entity)
 *     → object with the local file for a single entity
 *       (controlled transactions, functional analysis, economic analysis,
 *        financial data, industry analysis)
 *
 *   generateCbCR(group)
 *     → { xml, json, summary } — the Country-by-Country Report in OECD
 *       CbCR XML schema v2.0, a JSON mirror, and a numeric summary.
 *
 *   computeArmLength({ method, comparables, tested })
 *     → { method, pointEstimate, range, withinRange, iqr, mean, median,
 *         count, decision, rationale }
 *
 *   checkThreshold(group)
 *     → { required, threshold, groupRevenue, currency, message }
 *
 *   generateForm1385(entity, transactions)
 *     → { header, rows, totals, notes, xml } matching the Israeli 1385 layout
 *
 *   TEMPLATES, CBCR_SCHEMA, METHODS, THRESHOLDS, FORM_1385_FIELDS
 *     → exported constants so tests and callers can introspect.
 *
 *   createEngine()
 *     → returns an isolated engine object with all of the above bound —
 *       used primarily by unit tests to avoid singleton state.
 *
 * ---------------------------------------------------------------------------
 * Data model (all fields optional unless noted — the engine fills sane
 * defaults and marks missing pieces as `null` rather than throwing):
 *
 *   Group:
 *     {
 *       group_id:        string,             // required
 *       group_name:      string,             // required
 *       ultimate_parent: Entity,             // required
 *       fiscal_year:     number,             // required
 *       reporting_currency: 'ILS' | 'USD' | 'EUR' | …  (default 'ILS')
 *       group_revenue:   number,             // consolidated prior-year revenue
 *       group_revenue_currency: string,      // e.g. 'EUR', 'USD', 'ILS'
 *       entities:        Entity[],
 *       business_lines:  BusinessLine[],
 *       intangibles:     Intangible[],
 *       financing:       FinancingArrangement[],
 *       consolidated_financials: { revenue, profit_before_tax, tax_accrued, … }
 *       apas:            AdvancePricingAgreement[],
 *       maps:            MutualAgreementProcedure[],
 *     }
 *
 *   Entity:
 *     {
 *       entity_id:       string,
 *       legal_name:      string,
 *       country:         string,  // ISO-3166-1 alpha-2
 *       tax_id:          string,
 *       functional_currency: string,
 *       functions:       string[],
 *       assets:          string[],
 *       risks:           string[],
 *       employees:       number,
 *       revenue:         number,
 *       profit_before_tax: number,
 *       tax_accrued:     number,
 *       tax_paid:        number,
 *       stated_capital:  number,
 *       accumulated_earnings: number,
 *       tangible_assets: number,
 *       controlled_transactions: ControlledTransaction[],
 *     }
 *
 *   ControlledTransaction:
 *     {
 *       tx_id:           string,
 *       counterparty:    string,     // entity_id of related party
 *       counterparty_country: string,
 *       type:            'goods' | 'services' | 'royalty' | 'interest' |
 *                        'management_fee' | 'cost_sharing' | 'financing' | …
 *       description:     string,
 *       amount:          number,
 *       currency:        string,
 *       method:          'CUP' | 'RESALE_PRICE' | 'COST_PLUS' | 'TNMM' | 'PROFIT_SPLIT',
 *       tested_party:    'local' | 'counterparty',
 *       pli:             string,     // profit level indicator for TNMM
 *       comparables:     number[],   // benchmarked values (ratios or prices)
 *       result:          number,     // actual ratio / price for tested party
 *     }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants & templates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OECD BEPS Action 13 CbCR filing threshold.
 * Israeli implementation: group consolidated revenue in the prior fiscal
 * year must exceed EUR 750 million (or ILS equivalent — ~ILS 3.4 billion,
 * kept as a soft default that callers can override).
 */
const THRESHOLDS = Object.freeze({
  CBCR_EUR: 750_000_000,
  CBCR_ILS_DEFAULT: 3_400_000_000, // ILS soft equivalent, override per year
  // EUR→ILS rate used for display only — callers should pass the correct
  // rate at the time of filing via `group.fx_rate_eur_ils`.
  DEFAULT_FX_EUR_ILS: 4.0,
});

/**
 * The five OECD transfer pricing methods recognised by Israeli regulations.
 * The Hebrew column is used by the document templates.
 */
const METHODS = Object.freeze({
  CUP: {
    code: 'CUP',
    name_en: 'Comparable Uncontrolled Price',
    name_he: 'שיטת מחיר השוק — השוואת עסקאות בלתי מבוקרות',
    preference: 1,
    pli_units: 'price',
    description_en:
      'Compares the price charged in a controlled transaction to the price ' +
      'charged in a comparable uncontrolled transaction.',
    description_he:
      'משווה את המחיר בעסקה מבוקרת למחיר בעסקה בלתי מבוקרת דומה.',
  },
  RESALE_PRICE: {
    code: 'RESALE_PRICE',
    name_en: 'Resale Price Method',
    name_he: 'שיטת מחיר המכירה חזרה',
    preference: 2,
    pli_units: 'gross_margin',
    description_en:
      'Starts from the price at which a product purchased from an associated ' +
      'enterprise is resold to an independent party; reduces that price by an ' +
      'appropriate gross margin.',
    description_he:
      'מתחילה במחיר שבו נמכר המוצר שנרכש מצד קשור לצד בלתי תלוי; ומפחיתה ' +
      'ממנו רווח גולמי שוק.',
  },
  COST_PLUS: {
    code: 'COST_PLUS',
    name_en: 'Cost Plus Method',
    name_he: 'שיטת עלות פלוס',
    preference: 3,
    pli_units: 'mark_up_on_costs',
    description_en:
      'Adds an arm\'s length mark-up to the costs incurred by the supplier ' +
      'in a controlled transaction.',
    description_he: 'מוסיפה מרווח שוק על העלויות שהוציא הספק בעסקה מבוקרת.',
  },
  TNMM: {
    code: 'TNMM',
    name_en: 'Transactional Net Margin Method',
    name_he: 'שיטת רווח נקי עסקה',
    preference: 4,
    pli_units: 'net_margin',
    description_en:
      'Examines the net profit margin relative to an appropriate base ' +
      '(costs, sales, assets) that a taxpayer realises from a controlled ' +
      'transaction.',
    description_he:
      'בוחנת את שיעור הרווח הנקי ביחס לבסיס מתאים (עלויות, מכירות, נכסים) ' +
      'מעסקה מבוקרת.',
  },
  PROFIT_SPLIT: {
    code: 'PROFIT_SPLIT',
    name_en: 'Profit Split Method',
    name_he: 'שיטת חלוקת רווחים',
    preference: 5,
    pli_units: 'profit_share',
    description_en:
      'Identifies the combined profit from controlled transactions and ' +
      'splits it between the associated enterprises on an economically ' +
      'valid basis.',
    description_he:
      'מזהה את הרווח הכולל מעסקאות מבוקרות ומחלקת אותו בין הצדדים הקשורים ' +
      'על בסיס כלכלי תקף.',
  },
});

/**
 * Section 85A master file template — structural blueprint used by
 * generateMasterFile() to ensure every required OECD/Israeli section exists
 * even if data is missing. Each leaf is a `{ he, en }` label the UI can use.
 */
const MASTER_FILE_TEMPLATE = Object.freeze({
  section_1_organizational_structure: {
    he: 'מבנה ארגוני של הקבוצה הרב-לאומית',
    en: 'Organizational structure of the MNE group',
  },
  section_2_business_description: {
    he: 'תיאור העסק — קווי פעילות, ערך מוסף, שרשרת אספקה',
    en: 'Business description — lines of business, value drivers, supply chain',
  },
  section_3_intangibles: {
    he: 'נכסים בלתי מוחשיים — בעלות, פיתוח, הסכמי רישוי',
    en: 'Intangibles — ownership, DEMPE, cost contribution & licence agreements',
  },
  section_4_intercompany_financial_activities: {
    he: 'פעילויות מימון בין-חברתיות — הלוואות, מטבע חוץ, גידור',
    en: 'Intercompany financial activities — loans, FX, hedging',
  },
  section_5_financial_and_tax_positions: {
    he: 'מצב פיננסי ומסי של הקבוצה — דוחות מאוחדים, APA, MAP',
    en: 'Financial & tax positions — consolidated financials, APAs, MAPs',
  },
});

/**
 * Section 85A local file template — per-entity.
 */
const LOCAL_FILE_TEMPLATE = Object.freeze({
  section_1_local_entity: {
    he: 'הישות המקומית — מבנה ניהולי, דיווחים, ארגון',
    en: 'Local entity — management, reporting lines, organisation',
  },
  section_2_controlled_transactions: {
    he: 'עסקאות מבוקרות — תיאור, סכום, צדדים קשורים, שיטות',
    en: 'Controlled transactions — description, amounts, counter-parties, methods',
  },
  section_3_functional_analysis: {
    he: 'ניתוח תפקודי — פונקציות, נכסים, סיכונים (FAR)',
    en: 'Functional analysis — functions, assets, risks (FAR)',
  },
  section_4_economic_analysis: {
    he: 'ניתוח כלכלי — benchmarking, comparables, תוצאות',
    en: 'Economic analysis — benchmarking, comparables, results',
  },
  section_5_financial_information: {
    he: 'מידע פיננסי — דוחות כספיים של הישות, חלוקה פונקציונלית',
    en: 'Financial information — entity financials, functional P&L split',
  },
});

/**
 * Country-by-Country Report structure — mirrors OECD CbC XML schema v2.0
 * (oecd:CbcBody:stf:v2). We serialise to XML in generateCbCR() using a
 * minimal, schema-compliant writer (no external XML library).
 */
const CBCR_SCHEMA = Object.freeze({
  namespace: 'urn:oecd:ties:cbc:v2',
  stf_namespace: 'urn:oecd:ties:cbcstf:v5',
  iso_namespace: 'urn:oecd:ties:isocbctypes:v1',
  version: '2.0',
  sections: [
    'ReportingEntity',
    'CbcReports', // one per constituent jurisdiction
    'AdditionalInfo',
  ],
  summary_fields: [
    'Revenues.Unrelated',
    'Revenues.Related',
    'Revenues.Total',
    'ProfitOrLoss',
    'TaxPaid',
    'TaxAccrued',
    'Capital',
    'Earnings',
    'NbEmployees',
    'Assets',
  ],
});

/**
 * Israeli Form 1385 — הצהרה על עסקאות בינלאומיות בין צדדים קשורים
 *
 * This is the field map filed together with the annual return.
 * Each row in `rows[]` of generateForm1385() matches exactly one reportable
 * related-party transaction (goods, services, IP, financing, management fee).
 * The row numbers are the official line numbers in the 2026 form version.
 */
const FORM_1385_FIELDS = Object.freeze({
  header: {
    row_1:  { code: '010', he: 'שם המדווח', en: 'Reporting entity name' },
    row_2:  { code: '011', he: 'מספר תיק', en: 'Tax file number' },
    row_3:  { code: '012', he: 'שנת מס', en: 'Tax year' },
    row_4:  { code: '013', he: 'מטבע דיווח', en: 'Reporting currency' },
  },
  row_fields: {
    col_a:  { code: '020', he: 'סוג עסקה', en: 'Transaction type' },
    col_b:  { code: '021', he: 'שם הצד הקשור', en: 'Related party name' },
    col_c:  { code: '022', he: 'מדינת תושבות', en: 'Residence country (ISO)' },
    col_d:  { code: '023', he: 'מספר מזהה זר', en: 'Foreign tax ID' },
    col_e:  { code: '024', he: 'סוג הקשר', en: 'Relationship type' },
    col_f:  { code: '025', he: 'סכום העסקה', en: 'Transaction amount' },
    col_g:  { code: '026', he: 'מטבע', en: 'Currency' },
    col_h:  { code: '027', he: 'סכום ב-₪', en: 'Amount in ILS' },
    col_i:  { code: '028', he: 'שיטת תמחור', en: 'TP method' },
    col_j:  { code: '029', he: 'האם נערך מסמך', en: 'Documentation prepared' },
    col_k:  { code: '030', he: 'תוצאות ניתוח', en: 'Analysis outcome' },
    col_l:  { code: '031', he: 'הערות', en: 'Notes' },
  },
  totals: {
    total_row: { code: '099', he: 'סך כל העסקאות', en: 'Total transactions' },
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (private)
// ═══════════════════════════════════════════════════════════════════════════

/** Return a stable ISO-8601 date-time string (UTC, no ms). */
function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** XML-escape a string for safe inclusion in element text / attribute. */
function xmlEscape(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a number for XML with 2 decimals, never scientific notation. */
function xmlNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '0.00';
  return Number(n).toFixed(2);
}

/** Sort a numeric array ascending without mutating the input. */
function sortedAsc(arr) {
  return arr.slice().sort((a, b) => a - b);
}

/** Arithmetic mean. */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Median (linear interpolation between middle two for even-length arrays). */
function median(arr) {
  if (!arr.length) return 0;
  const s = sortedAsc(arr);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid];
  return (s[mid - 1] + s[mid]) / 2;
}

/**
 * Quartile using the OECD-recommended linear interpolation method (same as
 * Excel's PERCENTILE.INC / R type 7). q ∈ [0,1].
 */
function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = sortedAsc(arr);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (s[base + 1] !== undefined) {
    return s[base] + rest * (s[base + 1] - s[base]);
  }
  return s[base];
}

/** Interquartile range (Q1..Q3) as an OECD benchmarking arm's-length range. */
function interquartileRange(arr) {
  const q1 = quantile(arr, 0.25);
  const q3 = quantile(arr, 0.75);
  return { q1, q3, width: q3 - q1 };
}

/** Canonical method code — accepts loose user input. */
function canonicalMethod(m) {
  if (!m) return null;
  const k = String(m).trim().toUpperCase().replace(/[-\s]+/g, '_');
  const alias = {
    CUP: 'CUP',
    COMPARABLE_UNCONTROLLED_PRICE: 'CUP',
    RESALE_PRICE: 'RESALE_PRICE',
    RESALEPRICE: 'RESALE_PRICE',
    RPM: 'RESALE_PRICE',
    COST_PLUS: 'COST_PLUS',
    COSTPLUS: 'COST_PLUS',
    CPM: 'COST_PLUS',
    TNMM: 'TNMM',
    TRANSACTIONAL_NET_MARGIN: 'TNMM',
    TRANSACTIONAL_NET_MARGIN_METHOD: 'TNMM',
    PROFIT_SPLIT: 'PROFIT_SPLIT',
    PROFITSPLIT: 'PROFIT_SPLIT',
    PSM: 'PROFIT_SPLIT',
  };
  return alias[k] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Master File — generateMasterFile(group)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Master File document for a multinational group.
 *
 * The output shape is intentionally both machine-readable (so downstream
 * PDF / DOCX exporters can render it) and human-reviewable (clearly-labelled
 * bilingual sections). Missing data is represented as `null` rather than
 * throwing so this can run on partial inputs during drafting.
 *
 * @param {object} group
 * @returns {object}
 */
function generateMasterFile(group) {
  if (!group || typeof group !== 'object') {
    throw new TypeError('generateMasterFile: `group` is required');
  }
  const g = group;
  const entities = Array.isArray(g.entities) ? g.entities : [];
  const lines = Array.isArray(g.business_lines) ? g.business_lines : [];
  const intangibles = Array.isArray(g.intangibles) ? g.intangibles : [];
  const financing = Array.isArray(g.financing) ? g.financing : [];
  const apas = Array.isArray(g.apas) ? g.apas : [];
  const maps = Array.isArray(g.maps) ? g.maps : [];

  const totalEmployees = entities.reduce(
    (s, e) => s + (Number(e.employees) || 0),
    0,
  );
  const totalAssets = entities.reduce(
    (s, e) => s + (Number(e.tangible_assets) || 0),
    0,
  );

  return {
    meta: {
      document_type: 'MASTER_FILE',
      document_type_he: 'תיק אב',
      section_reference: 'סעיף 85א / Section 85A',
      fiscal_year: g.fiscal_year || null,
      reporting_currency: g.reporting_currency || 'ILS',
      generated_at: isoNow(),
      group_id: g.group_id || null,
      group_name: g.group_name || null,
      // Every master file must be re-reviewed annually — store the
      // next review date as year+1 day-01-01.
      next_review: g.fiscal_year
        ? `${g.fiscal_year + 1}-01-01T00:00:00Z`
        : null,
    },
    section_1_organizational_structure: {
      title: MASTER_FILE_TEMPLATE.section_1_organizational_structure,
      ultimate_parent: g.ultimate_parent || null,
      constituent_entities: entities.map((e) => ({
        entity_id: e.entity_id || null,
        legal_name: e.legal_name || null,
        country: e.country || null,
        tax_id: e.tax_id || null,
        functional_currency: e.functional_currency || null,
        parent: e.parent || null,
        role: e.role || null,
      })),
      legal_ownership_chart_notes:
        g.ownership_chart_notes ||
        'Attach consolidated legal ownership chart as appendix A.',
    },
    section_2_business_description: {
      title: MASTER_FILE_TEMPLATE.section_2_business_description,
      lines_of_business: lines.map((l) => ({
        code: l.code || null,
        name: l.name || null,
        revenue: Number(l.revenue) || 0,
        value_drivers: l.value_drivers || [],
        supply_chain: l.supply_chain || null,
      })),
      top_5_products_or_services: g.top_products || [],
      value_chain_description:
        g.value_chain_description ||
        'Describe how value is created across the group, from raw inputs ' +
          'to end-customer sale. Identify routine versus entrepreneurial ' +
          'functions and where intangibles are exploited.',
    },
    section_3_intangibles: {
      title: MASTER_FILE_TEMPLATE.section_3_intangibles,
      list: intangibles.map((i) => ({
        id: i.id || null,
        name: i.name || null,
        type: i.type || null, // 'patent', 'trademark', 'software', 'know-how', …
        legal_owner: i.legal_owner || null,
        economic_owner: i.economic_owner || null,
        dempe_functions: i.dempe_functions || {
          development: [],
          enhancement: [],
          maintenance: [],
          protection: [],
          exploitation: [],
        },
        valuation_method: i.valuation_method || null,
        current_value: Number(i.current_value) || 0,
      })),
      cost_contribution_arrangements: g.cost_contribution_arrangements || [],
      material_licences: g.material_licences || [],
    },
    section_4_intercompany_financial_activities: {
      title: MASTER_FILE_TEMPLATE.section_4_intercompany_financial_activities,
      loans: financing.filter((f) => (f.type || '').toLowerCase() === 'loan'),
      guarantees: financing.filter(
        (f) => (f.type || '').toLowerCase() === 'guarantee',
      ),
      cash_pooling: financing.filter(
        (f) => (f.type || '').toLowerCase() === 'cash_pool',
      ),
      hedging_policy: g.hedging_policy || null,
      central_treasury_entity: g.central_treasury_entity || null,
    },
    section_5_financial_and_tax_positions: {
      title: MASTER_FILE_TEMPLATE.section_5_financial_and_tax_positions,
      consolidated_financials: g.consolidated_financials || {
        revenue: 0,
        profit_before_tax: 0,
        tax_accrued: 0,
        tax_paid: 0,
      },
      total_employees: totalEmployees,
      total_tangible_assets: totalAssets,
      advance_pricing_agreements: apas,
      mutual_agreement_procedures: maps,
    },
    appendices: {
      a_legal_chart: 'Appendix A — Legal ownership chart',
      b_organisational_chart: 'Appendix B — Organisational chart',
      c_intangibles_register: 'Appendix C — Intangibles register',
      d_financing_register: 'Appendix D — Intercompany financing register',
      e_apas: 'Appendix E — APAs & MAPs',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Local File — generateLocalFile(entity)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Local File document for a single entity.
 *
 * @param {object} entity
 * @returns {object}
 */
function generateLocalFile(entity) {
  if (!entity || typeof entity !== 'object') {
    throw new TypeError('generateLocalFile: `entity` is required');
  }
  const e = entity;
  const txs = Array.isArray(e.controlled_transactions)
    ? e.controlled_transactions
    : [];

  const totalControlledValue = txs.reduce(
    (s, t) => s + (Number(t.amount) || 0),
    0,
  );

  // Group transactions by method for the economic analysis summary.
  const byMethod = {};
  for (const t of txs) {
    const m = canonicalMethod(t.method) || 'UNSPECIFIED';
    if (!byMethod[m]) byMethod[m] = [];
    byMethod[m].push(t);
  }

  return {
    meta: {
      document_type: 'LOCAL_FILE',
      document_type_he: 'תיק מקומי',
      section_reference: 'סעיף 85א / Section 85A',
      generated_at: isoNow(),
      entity_id: e.entity_id || null,
      legal_name: e.legal_name || null,
      country: e.country || null,
      functional_currency: e.functional_currency || null,
      fiscal_year: e.fiscal_year || null,
    },
    section_1_local_entity: {
      title: LOCAL_FILE_TEMPLATE.section_1_local_entity,
      management_structure: e.management_structure || null,
      reporting_lines: e.reporting_lines || null,
      local_organisation_chart: e.local_org_chart || null,
      business_strategy: e.business_strategy || null,
      key_competitors: e.key_competitors || [],
      restructurings_last_year: e.restructurings_last_year || [],
    },
    section_2_controlled_transactions: {
      title: LOCAL_FILE_TEMPLATE.section_2_controlled_transactions,
      total_value: totalControlledValue,
      currency: e.functional_currency || 'ILS',
      transactions: txs.map((t) => ({
        tx_id: t.tx_id || null,
        type: t.type || null,
        description: t.description || null,
        counterparty: t.counterparty || null,
        counterparty_country: t.counterparty_country || null,
        amount: Number(t.amount) || 0,
        currency: t.currency || 'ILS',
        method: canonicalMethod(t.method),
        method_rationale: t.method_rationale || null,
      })),
    },
    section_3_functional_analysis: {
      title: LOCAL_FILE_TEMPLATE.section_3_functional_analysis,
      functions: e.functions || [],
      assets: e.assets || [],
      risks: e.risks || [],
      people_functions: e.people_functions || [],
      far_summary:
        e.far_summary ||
        'Summarize the Functions, Assets, and Risks (FAR) that the local ' +
          'entity contributes to each controlled transaction. Map each F/A/R ' +
          'to the counterparty to establish the "fact pattern".',
    },
    section_4_economic_analysis: {
      title: LOCAL_FILE_TEMPLATE.section_4_economic_analysis,
      tested_party: e.tested_party || 'local',
      methods_used: Object.keys(byMethod),
      by_method: byMethod,
      comparables_search: e.comparables_search || null,
      arm_length_results: txs.map((t) => {
        if (!Array.isArray(t.comparables) || t.comparables.length === 0) {
          return { tx_id: t.tx_id, decision: 'NO_COMPARABLES' };
        }
        try {
          return {
            tx_id: t.tx_id,
            ...computeArmLength({
              method: t.method,
              comparables: t.comparables,
              tested: t.result,
            }),
          };
        } catch (err) {
          return { tx_id: t.tx_id, decision: 'ERROR', error: err.message };
        }
      }),
    },
    section_5_financial_information: {
      title: LOCAL_FILE_TEMPLATE.section_5_financial_information,
      annual_financial_statements: e.financials || {
        revenue: Number(e.revenue) || 0,
        profit_before_tax: Number(e.profit_before_tax) || 0,
        tax_accrued: Number(e.tax_accrued) || 0,
        tax_paid: Number(e.tax_paid) || 0,
      },
      functional_pl_split: e.functional_pl_split || null,
      allocation_keys: e.allocation_keys || null,
    },
    appendices: {
      a_intercompany_agreements: 'Appendix A — Intercompany agreements',
      b_financials: 'Appendix B — Annual financial statements',
      c_benchmarking: 'Appendix C — Benchmarking study & database output',
      d_industry: 'Appendix D — Industry analysis',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CbCR — generateCbCR(group)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the Country-by-Country Report for a group and serialise it to the
 * OECD CbCR XML schema v2.0.
 *
 * The XML output is intentionally compact but schema-valid:
 *   • prolog  <?xml version="1.0" encoding="UTF-8"?>
 *   • root    <cbc:CBC_OECD>
 *   • ReportingEntity with filer info
 *   • one CbcReports per constituent jurisdiction
 *
 * @param {object} group
 * @returns {{ xml: string, json: object, summary: object, byJurisdiction: object[] }}
 */
function generateCbCR(group) {
  if (!group || typeof group !== 'object') {
    throw new TypeError('generateCbCR: `group` is required');
  }
  const g = group;
  const entities = Array.isArray(g.entities) ? g.entities : [];

  // Group entities by country.
  const byCountry = {};
  for (const e of entities) {
    const c = (e.country || 'XX').toUpperCase();
    if (!byCountry[c]) {
      byCountry[c] = {
        country: c,
        entities: [],
        unrelated_revenue: 0,
        related_revenue: 0,
        total_revenue: 0,
        profit_before_tax: 0,
        tax_paid: 0,
        tax_accrued: 0,
        stated_capital: 0,
        accumulated_earnings: 0,
        employees: 0,
        tangible_assets: 0,
      };
    }
    const row = byCountry[c];
    row.entities.push(e);
    row.unrelated_revenue += Number(e.unrelated_revenue) || 0;
    row.related_revenue += Number(e.related_revenue) || 0;
    row.total_revenue +=
      Number(e.revenue) ||
      (Number(e.unrelated_revenue) || 0) + (Number(e.related_revenue) || 0);
    row.profit_before_tax += Number(e.profit_before_tax) || 0;
    row.tax_paid += Number(e.tax_paid) || 0;
    row.tax_accrued += Number(e.tax_accrued) || 0;
    row.stated_capital += Number(e.stated_capital) || 0;
    row.accumulated_earnings += Number(e.accumulated_earnings) || 0;
    row.employees += Number(e.employees) || 0;
    row.tangible_assets += Number(e.tangible_assets) || 0;
  }
  const rows = Object.values(byCountry).sort((a, b) =>
    a.country.localeCompare(b.country),
  );

  // Build summary — sums across jurisdictions.
  const summary = {
    group_id: g.group_id || null,
    group_name: g.group_name || null,
    fiscal_year: g.fiscal_year || null,
    currency: g.reporting_currency || 'ILS',
    jurisdictions: rows.length,
    total_revenue: rows.reduce((s, r) => s + r.total_revenue, 0),
    total_profit_before_tax: rows.reduce(
      (s, r) => s + r.profit_before_tax,
      0,
    ),
    total_tax_paid: rows.reduce((s, r) => s + r.tax_paid, 0),
    total_tax_accrued: rows.reduce((s, r) => s + r.tax_accrued, 0),
    total_employees: rows.reduce((s, r) => s + r.employees, 0),
    total_tangible_assets: rows.reduce((s, r) => s + r.tangible_assets, 0),
  };

  // JSON mirror of the XML (useful for tests and API responses).
  const json = {
    MessageSpec: {
      SendingEntityIN: g.sending_entity_in || g.group_id || 'UNKNOWN',
      TransmittingCountry: (g.transmitting_country || 'IL').toUpperCase(),
      ReceivingCountry: (g.receiving_country || 'IL').toUpperCase(),
      MessageType: 'CBC',
      Language: 'EN',
      Warning: null,
      Contact: g.contact || null,
      MessageRefId: `CBC-${g.group_id || 'GRP'}-${g.fiscal_year || 0}`,
      MessageTypeIndic: 'CBC401', // CBC401 = new information
      ReportingPeriod: g.fiscal_year
        ? `${g.fiscal_year}-12-31`
        : '1900-01-01',
      Timestamp: isoNow(),
    },
    CbcBody: {
      ReportingEntity: {
        ReportingRole: 'CBC701', // Ultimate Parent Entity
        Entity: g.ultimate_parent || {
          Name: g.group_name,
          Address: null,
          TIN: null,
        },
        ReportingPeriod: {
          StartDate: g.fiscal_year ? `${g.fiscal_year}-01-01` : null,
          EndDate: g.fiscal_year ? `${g.fiscal_year}-12-31` : null,
        },
      },
      CbcReports: rows.map((r) => ({
        DocSpec: {
          DocTypeIndic: 'OECD1', // new
          DocRefId: `${g.group_id || 'GRP'}-${r.country}-${g.fiscal_year || 0}`,
        },
        ResCountryCode: r.country,
        Summary: {
          Revenues: {
            Unrelated: r.unrelated_revenue,
            Related: r.related_revenue,
            Total:
              r.total_revenue ||
              r.unrelated_revenue + r.related_revenue,
          },
          ProfitOrLoss: r.profit_before_tax,
          TaxPaid: r.tax_paid,
          TaxAccrued: r.tax_accrued,
          Capital: r.stated_capital,
          Earnings: r.accumulated_earnings,
          NbEmployees: r.employees,
          Assets: r.tangible_assets,
        },
        ConstEntities: r.entities.map((e) => ({
          ConstEntity: {
            Name: e.legal_name,
            Address: e.address || null,
            TIN: e.tax_id || null,
            ResCountryCode: (e.country || 'XX').toUpperCase(),
          },
          IncorpCountryCode: (
            e.incorporation_country ||
            e.country ||
            'XX'
          ).toUpperCase(),
          BizActivities: Array.isArray(e.business_activities)
            ? e.business_activities
            : ['CBC503'], // default: Sales, Marketing, Distribution
        })),
      })),
      AdditionalInfo: Array.isArray(g.additional_info)
        ? g.additional_info
        : [],
    },
  };

  // Serialise to OECD CbC XML v2.0.
  const xml = buildCbcXml(json);

  return {
    xml,
    json,
    summary,
    byJurisdiction: rows,
  };
}

/**
 * Minimal, hand-rolled OECD CbC XML v2.0 writer.
 * The goal is schema-compatible structure (right element names, right
 * namespaces) — a validating XSD parser should accept the output modulo
 * per-field length checks which callers can enforce before calling.
 */
function buildCbcXml(json) {
  const ns = {
    cbc: CBCR_SCHEMA.namespace,
    stf: CBCR_SCHEMA.stf_namespace,
    iso: CBCR_SCHEMA.iso_namespace,
  };
  const ms = json.MessageSpec || {};
  const body = json.CbcBody || {};
  const reporting = body.ReportingEntity || {};
  const reports = Array.isArray(body.CbcReports) ? body.CbcReports : [];

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<cbc:CBC_OECD version="${CBCR_SCHEMA.version}" ` +
      `xmlns:cbc="${ns.cbc}" xmlns:stf="${ns.stf}" xmlns:iso="${ns.iso}">`,
  );

  // ---- MessageSpec ----
  lines.push('  <cbc:MessageSpec>');
  lines.push(
    `    <cbc:SendingEntityIN>${xmlEscape(ms.SendingEntityIN)}</cbc:SendingEntityIN>`,
  );
  lines.push(
    `    <cbc:TransmittingCountry>${xmlEscape(ms.TransmittingCountry)}</cbc:TransmittingCountry>`,
  );
  lines.push(
    `    <cbc:ReceivingCountry>${xmlEscape(ms.ReceivingCountry)}</cbc:ReceivingCountry>`,
  );
  lines.push(
    `    <cbc:MessageType>${xmlEscape(ms.MessageType || 'CBC')}</cbc:MessageType>`,
  );
  lines.push(`    <cbc:Language>${xmlEscape(ms.Language || 'EN')}</cbc:Language>`);
  lines.push(
    `    <cbc:MessageRefId>${xmlEscape(ms.MessageRefId)}</cbc:MessageRefId>`,
  );
  lines.push(
    `    <cbc:MessageTypeIndic>${xmlEscape(ms.MessageTypeIndic || 'CBC401')}</cbc:MessageTypeIndic>`,
  );
  lines.push(
    `    <cbc:ReportingPeriod>${xmlEscape(ms.ReportingPeriod)}</cbc:ReportingPeriod>`,
  );
  lines.push(`    <cbc:Timestamp>${xmlEscape(ms.Timestamp)}</cbc:Timestamp>`);
  lines.push('  </cbc:MessageSpec>');

  // ---- CbcBody ----
  lines.push('  <cbc:CbcBody>');

  // ReportingEntity
  lines.push('    <cbc:ReportingEntity>');
  lines.push(
    `      <cbc:ReportingRole>${xmlEscape(reporting.ReportingRole || 'CBC701')}</cbc:ReportingRole>`,
  );
  const entity = reporting.Entity || {};
  lines.push('      <cbc:Entity>');
  lines.push(`        <cbc:Name>${xmlEscape(entity.Name || entity.name || '')}</cbc:Name>`);
  if (entity.Address || entity.address) {
    const a = entity.Address || entity.address;
    lines.push('        <cbc:Address>');
    lines.push(`          <cbc:CountryCode>${xmlEscape(
      (a.CountryCode || a.country_code || a.country || '').toUpperCase(),
    )}</cbc:CountryCode>`);
    lines.push(`          <cbc:AddressFree>${xmlEscape(
      a.AddressFree || a.free || [a.street, a.city, a.postal]
        .filter(Boolean)
        .join(', '),
    )}</cbc:AddressFree>`);
    lines.push('        </cbc:Address>');
  }
  if (entity.TIN || entity.tin || entity.tax_id) {
    lines.push(
      `        <cbc:TIN>${xmlEscape(entity.TIN || entity.tin || entity.tax_id)}</cbc:TIN>`,
    );
  }
  lines.push('      </cbc:Entity>');
  const rp = reporting.ReportingPeriod || {};
  lines.push('      <cbc:ReportingPeriod>');
  lines.push(`        <cbc:StartDate>${xmlEscape(rp.StartDate)}</cbc:StartDate>`);
  lines.push(`        <cbc:EndDate>${xmlEscape(rp.EndDate)}</cbc:EndDate>`);
  lines.push('      </cbc:ReportingPeriod>');
  lines.push('    </cbc:ReportingEntity>');

  // CbcReports (one per jurisdiction)
  for (const r of reports) {
    lines.push('    <cbc:CbcReports>');
    const ds = r.DocSpec || {};
    lines.push('      <cbc:DocSpec>');
    lines.push(
      `        <stf:DocTypeIndic>${xmlEscape(ds.DocTypeIndic || 'OECD1')}</stf:DocTypeIndic>`,
    );
    lines.push(`        <stf:DocRefId>${xmlEscape(ds.DocRefId)}</stf:DocRefId>`);
    lines.push('      </cbc:DocSpec>');
    lines.push(
      `      <cbc:ResCountryCode>${xmlEscape(r.ResCountryCode)}</cbc:ResCountryCode>`,
    );
    const sum = r.Summary || {};
    const rev = sum.Revenues || {};
    lines.push('      <cbc:Summary>');
    lines.push('        <cbc:Revenues>');
    lines.push(
      `          <cbc:Unrelated currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(rev.Unrelated)}</cbc:Unrelated>`,
    );
    lines.push(
      `          <cbc:Related currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(rev.Related)}</cbc:Related>`,
    );
    lines.push(
      `          <cbc:Total currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(rev.Total)}</cbc:Total>`,
    );
    lines.push('        </cbc:Revenues>');
    lines.push(
      `        <cbc:ProfitOrLoss currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.ProfitOrLoss)}</cbc:ProfitOrLoss>`,
    );
    lines.push(
      `        <cbc:TaxPaid currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.TaxPaid)}</cbc:TaxPaid>`,
    );
    lines.push(
      `        <cbc:TaxAccrued currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.TaxAccrued)}</cbc:TaxAccrued>`,
    );
    lines.push(
      `        <cbc:Capital currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.Capital)}</cbc:Capital>`,
    );
    lines.push(
      `        <cbc:Earnings currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.Earnings)}</cbc:Earnings>`,
    );
    lines.push(`        <cbc:NbEmployees>${Number(sum.NbEmployees) || 0}</cbc:NbEmployees>`);
    lines.push(
      `        <cbc:Assets currCode="${xmlEscape(r.currency || 'ILS')}">${xmlNum(sum.Assets)}</cbc:Assets>`,
    );
    lines.push('      </cbc:Summary>');
    const entities = Array.isArray(r.ConstEntities) ? r.ConstEntities : [];
    for (const ce of entities) {
      const cee = ce.ConstEntity || {};
      lines.push('      <cbc:ConstEntities>');
      lines.push('        <cbc:ConstEntity>');
      lines.push(
        `          <cbc:Name>${xmlEscape(cee.Name)}</cbc:Name>`,
      );
      if (cee.TIN) {
        lines.push(`          <cbc:TIN>${xmlEscape(cee.TIN)}</cbc:TIN>`);
      }
      lines.push(
        `          <cbc:ResCountryCode>${xmlEscape(
          (cee.ResCountryCode || 'XX').toUpperCase(),
        )}</cbc:ResCountryCode>`,
      );
      lines.push('        </cbc:ConstEntity>');
      lines.push(
        `        <cbc:IncorpCountryCode>${xmlEscape(
          (ce.IncorpCountryCode || 'XX').toUpperCase(),
        )}</cbc:IncorpCountryCode>`,
      );
      for (const act of ce.BizActivities || []) {
        lines.push(`        <cbc:BizActivities>${xmlEscape(act)}</cbc:BizActivities>`);
      }
      lines.push('      </cbc:ConstEntities>');
    }
    lines.push('    </cbc:CbcReports>');
  }

  // AdditionalInfo
  for (const info of body.AdditionalInfo || []) {
    lines.push('    <cbc:AdditionalInfo>');
    lines.push(
      `      <cbc:OtherInfo language="${xmlEscape(info.language || 'EN')}">${xmlEscape(info.text || '')}</cbc:OtherInfo>`,
    );
    lines.push('    </cbc:AdditionalInfo>');
  }

  lines.push('  </cbc:CbcBody>');
  lines.push('</cbc:CBC_OECD>');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Arm's Length — computeArmLength({ method, comparables, tested })
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the arm's length range for a controlled transaction.
 *
 * `comparables` should be an array of numeric values (price for CUP, gross
 * margin % for Resale Price, mark-up % for Cost Plus, net margin for TNMM,
 * profit share % for Profit Split). `tested` is the actual result of the
 * tested party.
 *
 * Arm's-length range follows the OECD 2022 Guidelines interquartile
 * recommendation: Q1..Q3 of the benchmarked set. A point estimate is the
 * median. If tested falls inside the range the decision is `WITHIN_RANGE`;
 * otherwise `OUTSIDE_RANGE` with a suggested adjustment to the median.
 *
 * @param {{ method: string, comparables: number[], tested?: number }} input
 * @returns {object}
 */
function computeArmLength({ method, comparables, tested } = {}) {
  const code = canonicalMethod(method);
  if (!code) {
    throw new TypeError(
      `computeArmLength: unknown method "${method}". ` +
        `Expected one of: ${Object.keys(METHODS).join(', ')}`,
    );
  }
  if (!Array.isArray(comparables) || comparables.length === 0) {
    throw new TypeError(
      'computeArmLength: `comparables` must be a non-empty numeric array',
    );
  }
  const nums = comparables
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v) && Number.isFinite(v));
  if (nums.length === 0) {
    throw new TypeError(
      'computeArmLength: `comparables` must contain numeric values',
    );
  }

  const meta = METHODS[code];
  const iqr = interquartileRange(nums);
  const med = median(nums);
  const avg = mean(nums);
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  let decision;
  let rationale;
  let adjustment = null;
  if (tested === undefined || tested === null || Number.isNaN(Number(tested))) {
    decision = 'NO_TESTED_PARTY_RESULT';
    rationale =
      'No tested-party result provided — range computed for reference only.';
  } else {
    const t = Number(tested);
    if (t >= iqr.q1 && t <= iqr.q3) {
      decision = 'WITHIN_RANGE';
      rationale =
        `Tested result ${t.toFixed(4)} is within the interquartile ` +
        `arm's-length range [${iqr.q1.toFixed(4)}, ${iqr.q3.toFixed(4)}].`;
    } else if (t < iqr.q1) {
      decision = 'OUTSIDE_RANGE_LOW';
      adjustment = med - t;
      rationale =
        `Tested result ${t.toFixed(4)} is below Q1 ${iqr.q1.toFixed(4)}. ` +
        `Suggested adjustment to median: +${adjustment.toFixed(4)}.`;
    } else {
      decision = 'OUTSIDE_RANGE_HIGH';
      adjustment = med - t;
      rationale =
        `Tested result ${t.toFixed(4)} is above Q3 ${iqr.q3.toFixed(4)}. ` +
        `Suggested adjustment to median: ${adjustment.toFixed(4)}.`;
    }
  }

  return {
    method: code,
    method_name: meta.name_en,
    method_name_he: meta.name_he,
    pli_units: meta.pli_units,
    count: nums.length,
    min,
    max,
    mean: avg,
    median: med,
    pointEstimate: med,
    range: { lower: iqr.q1, upper: iqr.q3, type: 'interquartile' },
    iqr,
    tested: tested === undefined ? null : Number(tested),
    withinRange:
      decision === 'WITHIN_RANGE'
        ? true
        : decision === 'NO_TESTED_PARTY_RESULT'
          ? null
          : false,
    decision,
    adjustment,
    rationale,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. checkThreshold(group) — Israeli CbCR €750M test
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine whether a group is required to file CbCR in Israel.
 *
 * Rule: consolidated prior-year group revenue > EUR 750 million.
 * Callers may pass the revenue in any currency — if `group_revenue_currency`
 * is not EUR, the function converts using `group.fx_rate_eur_XXX` if
 * provided. For ILS it falls back to THRESHOLDS.CBCR_ILS_DEFAULT.
 *
 * @param {object} group
 * @returns {{ required: boolean, threshold: number, groupRevenue: number,
 *            currency: string, message: string, message_he: string,
 *            thresholdILS: number }}
 */
function checkThreshold(group) {
  if (!group || typeof group !== 'object') {
    throw new TypeError('checkThreshold: `group` is required');
  }
  const currency = (group.group_revenue_currency || 'EUR').toUpperCase();
  const revenue = Number(group.group_revenue) || 0;

  let revenueEur;
  if (currency === 'EUR') {
    revenueEur = revenue;
  } else if (currency === 'ILS') {
    const fx =
      Number(group.fx_rate_eur_ils) || THRESHOLDS.DEFAULT_FX_EUR_ILS;
    revenueEur = revenue / fx;
  } else {
    // Generic fallback — accept a cross-rate `fx_rate_eur_<ccy>` from caller.
    const key = `fx_rate_eur_${currency.toLowerCase()}`;
    const fx = Number(group[key]);
    if (!fx || fx <= 0) {
      return {
        required: null,
        threshold: THRESHOLDS.CBCR_EUR,
        groupRevenue: revenue,
        groupRevenueEur: null,
        currency,
        thresholdILS: THRESHOLDS.CBCR_ILS_DEFAULT,
        message:
          `Cannot evaluate CbCR threshold: no FX rate supplied for ${currency} ` +
          `(expected ${key}).`,
        message_he:
          `לא ניתן לבדוק סף דיווח CbCR: חסר שער חליפין למטבע ${currency}.`,
      };
    }
    revenueEur = revenue / fx;
  }

  const required = revenueEur > THRESHOLDS.CBCR_EUR;

  return {
    required,
    threshold: THRESHOLDS.CBCR_EUR,
    thresholdILS: THRESHOLDS.CBCR_ILS_DEFAULT,
    groupRevenue: revenue,
    groupRevenueEur: revenueEur,
    currency,
    message: required
      ? `Group revenue ${revenueEur.toFixed(0)} EUR exceeds the ` +
        `EUR ${THRESHOLDS.CBCR_EUR.toLocaleString('en-US')} Israeli CbCR ` +
        `filing threshold — CbCR filing is required.`
      : `Group revenue ${revenueEur.toFixed(0)} EUR does not exceed the ` +
        `EUR ${THRESHOLDS.CBCR_EUR.toLocaleString('en-US')} threshold — ` +
        `CbCR filing is not required.`,
    message_he: required
      ? `הכנסות הקבוצה (${revenueEur.toFixed(0)} אירו) מעל סף הדיווח ` +
        `הישראלי (${THRESHOLDS.CBCR_EUR.toLocaleString('he-IL')} אירו) — ` +
        `חובה להגיש דוח CbCR.`
      : `הכנסות הקבוצה (${revenueEur.toFixed(0)} אירו) אינן מעל סף הדיווח ` +
        `(${THRESHOLDS.CBCR_EUR.toLocaleString('he-IL')} אירו) — ` +
        `אין חובה להגיש דוח CbCR.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. generateForm1385(entity, transactions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Israeli Form 1385 — הצהרה על עסקאות בינלאומיות (declaration of
 * international related-party transactions).
 *
 * The form is filed as an annex to the annual return. Each row is one
 * reportable transaction. Column codes match FORM_1385_FIELDS.
 *
 * @param {object} entity
 * @param {object[]} transactions
 * @returns {{ header: object, rows: object[], totals: object, notes: string[], xml: string }}
 */
function generateForm1385(entity, transactions) {
  if (!entity || typeof entity !== 'object') {
    throw new TypeError('generateForm1385: `entity` is required');
  }
  const txs = Array.isArray(transactions) ? transactions : [];
  const currency = (entity.functional_currency || 'ILS').toUpperCase();
  const fxToILS = Number(entity.fx_to_ils) || 1; // tested-party currency→ILS
  const getILS = (amount, ccy) => {
    if ((ccy || currency).toUpperCase() === 'ILS') return Number(amount) || 0;
    const rateKey = `fx_${(ccy || currency).toLowerCase()}_ils`;
    const r = Number(entity[rateKey]) || fxToILS;
    return (Number(amount) || 0) * r;
  };

  const header = {
    [FORM_1385_FIELDS.header.row_1.code]: entity.legal_name || null,
    [FORM_1385_FIELDS.header.row_2.code]: entity.tax_id || null,
    [FORM_1385_FIELDS.header.row_3.code]: entity.fiscal_year || null,
    [FORM_1385_FIELDS.header.row_4.code]: currency,
    _labels: {
      he: {
        [FORM_1385_FIELDS.header.row_1.code]: FORM_1385_FIELDS.header.row_1.he,
        [FORM_1385_FIELDS.header.row_2.code]: FORM_1385_FIELDS.header.row_2.he,
        [FORM_1385_FIELDS.header.row_3.code]: FORM_1385_FIELDS.header.row_3.he,
        [FORM_1385_FIELDS.header.row_4.code]: FORM_1385_FIELDS.header.row_4.he,
      },
      en: {
        [FORM_1385_FIELDS.header.row_1.code]: FORM_1385_FIELDS.header.row_1.en,
        [FORM_1385_FIELDS.header.row_2.code]: FORM_1385_FIELDS.header.row_2.en,
        [FORM_1385_FIELDS.header.row_3.code]: FORM_1385_FIELDS.header.row_3.en,
        [FORM_1385_FIELDS.header.row_4.code]: FORM_1385_FIELDS.header.row_4.en,
      },
    },
  };

  const rowFields = FORM_1385_FIELDS.row_fields;
  const rows = txs.map((t, idx) => {
    const amount = Number(t.amount) || 0;
    const amountILS = getILS(amount, t.currency || currency);
    return {
      row_number: idx + 1,
      [rowFields.col_a.code]: t.type || null,
      [rowFields.col_b.code]: t.counterparty_name || t.counterparty || null,
      [rowFields.col_c.code]: (t.counterparty_country || '').toUpperCase(),
      [rowFields.col_d.code]: t.counterparty_tax_id || null,
      [rowFields.col_e.code]: t.relationship_type || 'related_party',
      [rowFields.col_f.code]: amount,
      [rowFields.col_g.code]: (t.currency || currency).toUpperCase(),
      [rowFields.col_h.code]: Math.round(amountILS * 100) / 100,
      [rowFields.col_i.code]: canonicalMethod(t.method),
      [rowFields.col_j.code]:
        t.documentation_prepared === true ||
        t.documentation_prepared === 'yes'
          ? 'YES'
          : 'NO',
      [rowFields.col_k.code]: t.analysis_outcome || null,
      [rowFields.col_l.code]: t.notes || null,
    };
  });

  const totalAmountILS = rows.reduce(
    (s, r) => s + (r[rowFields.col_h.code] || 0),
    0,
  );
  const totals = {
    [FORM_1385_FIELDS.totals.total_row.code]: Math.round(totalAmountILS * 100) / 100,
    row_count: rows.length,
    currency: 'ILS',
  };

  const notes = [];
  if (!entity.tax_id) notes.push('Missing tax_id on entity — header 011 is null.');
  if (!entity.fiscal_year) notes.push('Missing fiscal_year — header 012 is null.');
  if (rows.length === 0)
    notes.push('No international related-party transactions in this period.');

  // Lightweight XML payload (useful for audit + round-trip tests).
  const xmlLines = [];
  xmlLines.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlLines.push('<Form1385 xmlns="urn:israel:tax:form:1385:v2026">');
  xmlLines.push('  <Header>');
  xmlLines.push(`    <Field code="010">${xmlEscape(entity.legal_name)}</Field>`);
  xmlLines.push(`    <Field code="011">${xmlEscape(entity.tax_id)}</Field>`);
  xmlLines.push(`    <Field code="012">${xmlEscape(entity.fiscal_year)}</Field>`);
  xmlLines.push(`    <Field code="013">${xmlEscape(currency)}</Field>`);
  xmlLines.push('  </Header>');
  xmlLines.push('  <Rows>');
  for (const r of rows) {
    xmlLines.push(`    <Row number="${r.row_number}">`);
    for (const k of Object.keys(rowFields)) {
      const code = rowFields[k].code;
      xmlLines.push(`      <Field code="${code}">${xmlEscape(r[code])}</Field>`);
    }
    xmlLines.push('    </Row>');
  }
  xmlLines.push('  </Rows>');
  xmlLines.push('  <Totals>');
  xmlLines.push(
    `    <Field code="099">${xmlNum(totals[FORM_1385_FIELDS.totals.total_row.code])}</Field>`,
  );
  xmlLines.push('  </Totals>');
  xmlLines.push('</Form1385>');
  const xml = xmlLines.join('\n');

  return { header, rows, totals, notes, xml };
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine factory — lets tests instantiate an isolated instance cleanly.
// ═══════════════════════════════════════════════════════════════════════════

function createEngine() {
  return {
    generateMasterFile,
    generateLocalFile,
    generateCbCR,
    computeArmLength,
    checkThreshold,
    generateForm1385,
    // constants (frozen — safe to expose)
    METHODS,
    THRESHOLDS,
    MASTER_FILE_TEMPLATE,
    LOCAL_FILE_TEMPLATE,
    CBCR_SCHEMA,
    FORM_1385_FIELDS,
    // internals exposed for unit tests — reading only
    _internal: {
      canonicalMethod,
      quantile,
      median,
      mean,
      interquartileRange,
      xmlEscape,
      xmlNum,
      buildCbcXml,
    },
  };
}

module.exports = {
  // primary API
  generateMasterFile,
  generateLocalFile,
  generateCbCR,
  computeArmLength,
  checkThreshold,
  generateForm1385,
  // templates & constants
  MASTER_FILE_TEMPLATE,
  LOCAL_FILE_TEMPLATE,
  CBCR_SCHEMA,
  METHODS,
  THRESHOLDS,
  FORM_1385_FIELDS,
  // factory
  createEngine,
};
