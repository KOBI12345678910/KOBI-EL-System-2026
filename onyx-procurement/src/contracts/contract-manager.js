/**
 * Contract Management — contract-manager.js
 * ════════════════════════════════════════════════════════════════════
 * Agent X-23 — Techno-Kol Uzi ERP (Swarm 3B) — written 2026-04-11
 *
 * Full life-cycle contract management for the six standard contract
 * types the Techno-Kol Uzi group uses:
 *
 *   עובד     — employment contract  (חוזה עבודה)
 *   ספק      — supplier agreement   (הסכם ספק)
 *   לקוח     — client agreement / SOW
 *   שכירות   — lease               (חוזה שכירות)
 *   NDA      — NDA / סודיות        (הסכם סודיות)
 *   שירות    — service SLA          (הסכם שירות / SLA)
 *
 * The module is a pure JavaScript, in-memory engine with a simple
 * pluggable persistence adapter, designed to mesh with the Onyx
 * procurement ERP. It is RTL/Hebrew-first, bilingual where sensible,
 * and aware of the relevant Israeli commercial-law anchors — see
 * LEGAL_REFS below.
 *
 * Israeli-law posture (non-exhaustive, see compliance checklist):
 *   • חוק החוזים (חלק כללי) תשל"ג-1973      — general contract law
 *   • חוק החוזים (תרופות) תשל"א-1970        — remedies for breach
 *   • חוק השכירות והשאילה תשל"א-1971         — lease law
 *   • חוק הגנת הדייר (נוסח משולב) תשל"ב-1972 — tenant protection
 *   • חוק הודעה לעובד תשס"ב-2002             — employee notice / Form 101
 *   • חוק חוזה עבודה אישי (תשל"ז-1977)      — individual employment contract
 *   • חוק שעות עבודה ומנוחה תשי"א-1951        — working hours + rest
 *   • חוק חתימה אלקטרונית תשס"א-2001          — electronic signature
 *
 * NEVER DELETE — every "cancel" operation is an append-only status
 * transition plus an audit trail entry. Version history is immutable.
 *
 * Public API
 * ──────────
 *   createContract(template, fields)           → draftId
 *   sendForSigning(draftId, signers, opts?)    → { requestId, tokens[] }
 *   recordSignature(token, data)               → see esign.recordSignature
 *   verifyContract(id)                         → { valid, signers_count, hash_match, ... }
 *   listExpiring(days)                         → contracts needing attention
 *   renewContract(id, newExpiry, opts?)        → void (mutates in place, append-only)
 *
 * Secondary (useful, exported):
 *   addAmendment(id, body, actor?)
 *   cancelContract(id, reason, actor?)
 *   getContract(id)
 *   listContracts(filter?)
 *   listTemplates()
 *   getTemplate(key)
 *   registerTemplate(key, template)
 *   applyTemplate(key, fields)
 *   getVersionHistory(id)
 *   computeDocumentHash(contract)
 *   resetStore()
 *
 * Zero external dependencies. Uses node:crypto through esign.js.
 */

'use strict';

const crypto = require('node:crypto');
const esign = require('./esign.js');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const CONTRACT_TYPE = Object.freeze({
  EMPLOYMENT: 'employment',   // עובד
  SUPPLIER:   'supplier',     // ספק
  CLIENT:     'client',       // לקוח / SOW
  LEASE:      'lease',        // שכירות
  NDA:        'nda',          // סודיות
  SERVICE:    'service',      // SLA / שירות
});

const TYPE_LABELS = Object.freeze({
  [CONTRACT_TYPE.EMPLOYMENT]: { he: 'חוזה עבודה',         en: 'Employment Contract' },
  [CONTRACT_TYPE.SUPPLIER]:   { he: 'הסכם ספק',            en: 'Supplier Agreement' },
  [CONTRACT_TYPE.CLIENT]:     { he: 'הסכם לקוח / SOW',      en: 'Client Agreement / SOW' },
  [CONTRACT_TYPE.LEASE]:      { he: 'חוזה שכירות',         en: 'Lease Agreement' },
  [CONTRACT_TYPE.NDA]:        { he: 'הסכם סודיות (NDA)',    en: 'Non-Disclosure Agreement' },
  [CONTRACT_TYPE.SERVICE]:    { he: 'הסכם שירות (SLA)',     en: 'Service Level Agreement' },
});

const STATUS = Object.freeze({
  DRAFT:     'draft',      // טיוטה
  SENT:      'sent',       // נשלח לחתימה
  PARTIAL:   'partial',    // חתום חלקית
  SIGNED:    'signed',     // חתום
  ACTIVE:    'active',     // פעיל
  RENEWED:   'renewed',    // חודש
  EXPIRED:   'expired',    // פג תוקף
  CANCELLED: 'cancelled',  // מבוטל
  TERMINATED:'terminated', // סיים פעילות
});

const STATUS_LABELS = Object.freeze({
  [STATUS.DRAFT]:      { he: 'טיוטה',          en: 'Draft' },
  [STATUS.SENT]:       { he: 'נשלח לחתימה',     en: 'Sent for Signing' },
  [STATUS.PARTIAL]:    { he: 'חתום חלקית',     en: 'Partially Signed' },
  [STATUS.SIGNED]:     { he: 'חתום',            en: 'Signed' },
  [STATUS.ACTIVE]:     { he: 'פעיל',            en: 'Active' },
  [STATUS.RENEWED]:    { he: 'חודש',            en: 'Renewed' },
  [STATUS.EXPIRED]:    { he: 'פג תוקף',         en: 'Expired' },
  [STATUS.CANCELLED]:  { he: 'מבוטל',           en: 'Cancelled' },
  [STATUS.TERMINATED]: { he: 'סיים פעילות',     en: 'Terminated' },
});

const AUDIT_EVENT = Object.freeze({
  CREATED:            'contract_created',
  UPDATED:            'contract_updated',
  AMENDED:            'contract_amended',
  SENT_FOR_SIGNING:   'contract_sent_for_signing',
  SIGNATURE_CAPTURED: 'contract_signature_captured',
  ACTIVATED:          'contract_activated',
  EXPIRED:            'contract_expired',
  RENEWED:            'contract_renewed',
  CANCELLED:          'contract_cancelled',
  TERMINATED:         'contract_terminated',
  VERIFIED:           'contract_verified',
});

const LEGAL_REFS = Object.freeze({
  GENERAL:    'חוק החוזים (חלק כללי) תשל"ג-1973',
  REMEDIES:   'חוק החוזים (תרופות) תשל"א-1970',
  LEASE:      'חוק השכירות והשאילה תשל"א-1971',
  TENANT:     'חוק הגנת הדייר (נוסח משולב) תשל"ב-1972',
  EMP_NOTICE: 'חוק הודעה לעובד תשס"ב-2002',
  EMP_CONTR:  'חוק חוזה עבודה אישי (תשל"ז-1977)',
  WORK_HRS:   'חוק שעות עבודה ומנוחה תשי"א-1951',
  ESIGN:      'חוק חתימה אלקטרונית תשס"א-2001',
});

// Expiry "brackets" used by listExpiring() when no arg provided.
const DEFAULT_EXPIRY_BRACKETS_DAYS = Object.freeze([30, 60, 90]);

// Notice period (days) for auto-renewal — default 30, templates may override.
const DEFAULT_RENEWAL_NOTICE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════
// Template library
// ═══════════════════════════════════════════════════════════════════════

/**
 * Templates use double-curly-brace placeholders, e.g. {{employer_name}}.
 * Populate with applyTemplate(key, fields) which substitutes keys found
 * in `fields` and leaves unknown placeholders intact (marked in warnings).
 *
 * Every template records:
 *   - type          CONTRACT_TYPE.*
 *   - title_he/en   default human title (overridable per contract)
 *   - body_he       the legally material Hebrew text
 *   - body_en       optional English courtesy translation
 *   - required[]    fields that must be supplied on creation
 *   - optional[]    fields that may be supplied
 *   - legal_ref     foreign key into LEGAL_REFS for compliance display
 *   - notice_days   renewal notice period default
 */
const DEFAULT_TEMPLATES = {
  'employment-hourly-he': {
    type: CONTRACT_TYPE.EMPLOYMENT,
    title_he: 'חוזה עבודה - עובד שעתי',
    title_en: 'Employment Contract — Hourly Worker',
    body_he: [
      'חוזה עבודה זה נכרת ביום {{effective_date}} בין:',
      '{{employer_name}} (ח.פ {{employer_hp}}) להלן "המעביד"',
      'לבין',
      '{{employee_name}} (ת.ז {{employee_tz}}) להלן "העובד".',
      '',
      '1. תפקיד: {{role}}',
      '2. שכר לשעה: {{hourly_rate}} ₪ (ברוטו)',
      '3. היקף משרה: {{scope_percent}}%',
      '4. תחילת העסקה: {{start_date}}',
      '5. חוזה זה כפוף לחוק חוזה עבודה אישי תשל"ז-1977,',
      '   חוק שעות עבודה ומנוחה תשי"א-1951,',
      '   וחוק הודעה לעובד תשס"ב-2002.',
      '6. תקופת ניסיון: {{probation_months}} חודשים.',
      '7. הפרשות פנסיה + פיצויים עפ"י צו ההרחבה לביטוח פנסיוני מקיף.',
      '',
      'בחתימתם מאשרים הצדדים שקראו והבינו את תנאי ההסכם.',
    ].join('\n'),
    required: ['employer_name', 'employer_hp', 'employee_name', 'employee_tz', 'role', 'hourly_rate', 'start_date'],
    optional: ['scope_percent', 'probation_months', 'effective_date'],
    legal_ref: LEGAL_REFS.EMP_CONTR,
    notice_days: 30,
  },
  'employment-monthly-he': {
    type: CONTRACT_TYPE.EMPLOYMENT,
    title_he: 'חוזה עבודה - עובד חודשי',
    title_en: 'Employment Contract — Monthly Worker',
    body_he: [
      'חוזה עבודה נכרת ביום {{effective_date}} בין:',
      '{{employer_name}} (ח.פ {{employer_hp}}) "המעביד"',
      'לבין {{employee_name}} (ת.ז {{employee_tz}}) "העובד".',
      '',
      '1. תפקיד: {{role}}',
      '2. שכר חודשי: {{monthly_salary}} ₪ ברוטו',
      '3. היקף משרה: {{scope_percent}}%',
      '4. תחילת העסקה: {{start_date}}',
      '5. חופשה שנתית: עפ"י חוק חופשה שנתית תשי"א-1951',
      '6. דמי הבראה, חגים, מחלה: עפ"י צווי הרחבה.',
      '7. חוזה זה כפוף לחוק חוזה עבודה אישי תשל"ז-1977.',
    ].join('\n'),
    required: ['employer_name', 'employer_hp', 'employee_name', 'employee_tz', 'role', 'monthly_salary', 'start_date'],
    optional: ['scope_percent', 'effective_date'],
    legal_ref: LEGAL_REFS.EMP_CONTR,
    notice_days: 30,
  },
  'supplier-standard-he': {
    type: CONTRACT_TYPE.SUPPLIER,
    title_he: 'הסכם ספק סטנדרטי',
    title_en: 'Standard Supplier Agreement',
    body_he: [
      'הסכם ספק נכרת ביום {{effective_date}} בין:',
      '{{buyer_name}} (ח.פ {{buyer_hp}}) "הלקוח"',
      'לבין {{supplier_name}} (ח.פ {{supplier_hp}}) "הספק".',
      '',
      '1. הספק יספק: {{service_description}}',
      '2. תמורה: {{value}} ₪ {{payment_terms}}',
      '3. תקופת ההסכם: מ-{{start_date}} עד {{end_date}}',
      '4. אחריות: {{warranty_months}} חודשים',
      '5. סודיות: הספק ישמור על סודיות מידע הלקוח.',
      '6. ההסכם כפוף לחוק החוזים (חלק כללי) תשל"ג-1973.',
    ].join('\n'),
    required: ['buyer_name', 'buyer_hp', 'supplier_name', 'supplier_hp', 'service_description', 'value'],
    optional: ['payment_terms', 'warranty_months', 'effective_date', 'start_date', 'end_date'],
    legal_ref: LEGAL_REFS.GENERAL,
    notice_days: 60,
  },
  'client-sow-he': {
    type: CONTRACT_TYPE.CLIENT,
    title_he: 'הסכם לקוח / הצהרת עבודה (SOW)',
    title_en: 'Client Agreement / Statement of Work',
    body_he: [
      'הסכם עם הלקוח {{client_name}} (ח.פ/ת.ז {{client_id}}) נכרת ביום {{effective_date}}.',
      'נותן השירות: {{vendor_name}} (ח.פ {{vendor_hp}}).',
      '',
      '1. תיאור העבודה: {{scope}}',
      '2. תוצרים (Deliverables): {{deliverables}}',
      '3. תמורה: {{value}} ₪ (לא כולל מע"מ)',
      '4. לוח זמנים: {{timeline}}',
      '5. תנאי תשלום: {{payment_terms}}',
      '6. קניין רוחני: שייך ל{{ip_owner}}.',
      '7. ההסכם כפוף לחוק החוזים (חלק כללי) תשל"ג-1973.',
    ].join('\n'),
    required: ['client_name', 'client_id', 'vendor_name', 'vendor_hp', 'scope', 'value'],
    optional: ['deliverables', 'timeline', 'payment_terms', 'ip_owner', 'effective_date'],
    legal_ref: LEGAL_REFS.GENERAL,
    notice_days: 30,
  },
  'lease-residential-he': {
    type: CONTRACT_TYPE.LEASE,
    title_he: 'חוזה שכירות למגורים',
    title_en: 'Residential Lease Agreement',
    body_he: [
      'חוזה שכירות נכרת ביום {{effective_date}} בין:',
      '{{landlord_name}} (ת.ז {{landlord_tz}}) "המשכיר"',
      'לבין {{tenant_name}} (ת.ז {{tenant_tz}}) "השוכר".',
      '',
      '1. מהות: שכירות של {{property_address}}.',
      '2. תקופת שכירות: מ-{{start_date}} עד {{end_date}} ({{months}} חודשים).',
      '3. דמי שכירות: {{monthly_rent}} ₪ לחודש, ישולמו ב-{{pay_day}} לכל חודש.',
      '4. פיקדון: {{deposit}} ₪ או ערבות בנקאית.',
      '5. ההסכם כפוף לחוק השכירות והשאילה תשל"א-1971',
      '   ולחוק הגנת הדייר (נוסח משולב) תשל"ב-1972.',
    ].join('\n'),
    required: ['landlord_name', 'landlord_tz', 'tenant_name', 'tenant_tz', 'property_address', 'monthly_rent', 'start_date', 'end_date'],
    optional: ['months', 'pay_day', 'deposit', 'effective_date'],
    legal_ref: LEGAL_REFS.LEASE,
    notice_days: 60,
  },
  'nda-mutual-he': {
    type: CONTRACT_TYPE.NDA,
    title_he: 'הסכם סודיות הדדי (NDA)',
    title_en: 'Mutual Non-Disclosure Agreement',
    body_he: [
      'הסכם סודיות הדדי נכרת ביום {{effective_date}} בין:',
      '{{party_a}} (ח.פ/ת.ז {{party_a_id}}) "צד א\'"',
      'לבין {{party_b}} (ח.פ/ת.ז {{party_b_id}}) "צד ב\'".',
      '',
      '1. הצדדים יעבירו ביניהם מידע סודי במסגרת {{purpose}}.',
      '2. סודיות: כל מידע שסומן סודי או שסביר להניח שהוא סודי.',
      '3. תקופת סודיות: {{confidentiality_years}} שנים ממועד החשיפה.',
      '4. החזרת חומרים: בתום השימוש - החזרה או השמדה מאומתת.',
      '5. סעד: הצדדים מסכימים שהפרה תאפשר צו מניעה + פיצויים ללא הוכחת נזק.',
      '6. ההסכם כפוף לחוק החוזים (חלק כללי) תשל"ג-1973.',
    ].join('\n'),
    required: ['party_a', 'party_a_id', 'party_b', 'party_b_id', 'purpose'],
    optional: ['confidentiality_years', 'effective_date'],
    legal_ref: LEGAL_REFS.GENERAL,
    notice_days: 0, // NDAs don't auto-renew
  },
  'sla-service-he': {
    type: CONTRACT_TYPE.SERVICE,
    title_he: 'הסכם רמת שירות (SLA)',
    title_en: 'Service Level Agreement',
    body_he: [
      'הסכם רמת שירות נכרת ביום {{effective_date}} בין:',
      '{{provider_name}} (ח.פ {{provider_hp}}) "נותן השירות"',
      'לבין {{customer_name}} (ח.פ/ת.ז {{customer_id}}) "הלקוח".',
      '',
      '1. שירותים: {{services}}',
      '2. זמינות מובטחת: {{uptime_percent}}%',
      '3. זמן תגובה (חומרה קריטית): {{response_minutes}} דקות',
      '4. זמן פתרון: {{resolution_hours}} שעות',
      '5. תמורה חודשית: {{monthly_fee}} ₪',
      '6. פיצוי מוסכם בגין אי-עמידה: זיכוי עד {{max_credit_percent}}% מהתמורה.',
      '7. ההסכם כפוף לחוק החוזים (חלק כללי) תשל"ג-1973.',
    ].join('\n'),
    required: ['provider_name', 'provider_hp', 'customer_name', 'customer_id', 'services', 'monthly_fee'],
    optional: ['uptime_percent', 'response_minutes', 'resolution_hours', 'max_credit_percent', 'effective_date'],
    legal_ref: LEGAL_REFS.GENERAL,
    notice_days: 30,
  },
};

const _templates = new Map(Object.entries(DEFAULT_TEMPLATES).map(([k, v]) => [k, deepFreeze(v)]));

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function registerTemplate(key, template) {
  if (typeof key !== 'string' || !key) throw new TypeError('key required');
  if (!template || typeof template !== 'object') throw new TypeError('template object required');
  if (!template.type) throw new TypeError('template.type required');
  if (!Object.values(CONTRACT_TYPE).includes(template.type)) {
    throw new TypeError(`template.type invalid: ${template.type}`);
  }
  const cloned = JSON.parse(JSON.stringify(template));
  _templates.set(key, deepFreeze(cloned));
  return true;
}

function listTemplates() {
  const out = [];
  for (const [key, tpl] of _templates.entries()) {
    out.push({
      key,
      type: tpl.type,
      title_he: tpl.title_he,
      title_en: tpl.title_en,
      required: tpl.required.slice(),
      optional: (tpl.optional || []).slice(),
      legal_ref: tpl.legal_ref,
      notice_days: tpl.notice_days,
    });
  }
  return out;
}

function getTemplate(key) {
  return _templates.get(key) || null;
}

// ═══════════════════════════════════════════════════════════════════════
// In-memory store
// ═══════════════════════════════════════════════════════════════════════

const _store = {
  contracts: new Map(),   // id → contract envelope
};

let _persistence = null;
function setPersistenceAdapter(adapter) {
  if (adapter && typeof adapter.write === 'function') _persistence = adapter;
  else _persistence = null;
}
function _persist(c) {
  if (_persistence) {
    try { _persistence.write(JSON.parse(JSON.stringify(c))); } catch (_) { /* swallow */ }
  }
}

function resetStore() {
  _store.contracts.clear();
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function nowIso() { return new Date().toISOString(); }

function daysFromNow(d) {
  const now = Date.now();
  const then = new Date(d).getTime();
  if (!Number.isFinite(then)) return NaN;
  return Math.ceil((then - now) / MS_PER_DAY);
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function isIsraeliIdShape(s) {
  if (typeof s !== 'string') return false;
  const digits = s.replace(/\D+/g, '');
  return digits.length >= 8 && digits.length <= 9;
}

function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// Template population
// ═══════════════════════════════════════════════════════════════════════

/**
 * Apply placeholder substitution. Walks body_he / body_en (if present)
 * and replaces every `{{key}}` with fields[key]. Leaves unknown
 * placeholders intact and reports them in `warnings`.
 *
 * @returns {{ title_he, title_en, body_he, body_en, warnings: string[],
 *             missing_required: string[] }}
 */
function applyTemplate(key, fields) {
  const tpl = _templates.get(key);
  if (!tpl) {
    throw new Error(`Unknown template: ${key}`);
  }
  fields = fields || {};
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  const warnings = [];
  const replace = (text) => {
    if (typeof text !== 'string') return text;
    return text.replace(re, (m, k) => {
      if (k in fields && fields[k] !== undefined && fields[k] !== null && fields[k] !== '') {
        return String(fields[k]);
      }
      warnings.push(`unfilled placeholder: ${k}`);
      return m;
    });
  };

  const out = {
    title_he: replace(tpl.title_he),
    title_en: replace(tpl.title_en),
    body_he:  replace(tpl.body_he),
    body_en:  replace(tpl.body_en),
    warnings,
    missing_required: (tpl.required || []).filter(k => fields[k] === undefined || fields[k] === null || fields[k] === ''),
    notice_days: tpl.notice_days,
    legal_ref:  tpl.legal_ref,
    type:       tpl.type,
  };
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// computeDocumentHash — re-export friendly wrapper over esign
// ═══════════════════════════════════════════════════════════════════════

function computeDocumentHash(contract) {
  return esign.sha256(esign.canonicaliseDocument(contract));
}

// ═══════════════════════════════════════════════════════════════════════
// Audit helpers
// ═══════════════════════════════════════════════════════════════════════

function _appendAudit(contract, event, payload, actor) {
  const entry = {
    event,
    at: nowIso(),
    actor: actor || null,
    ...(payload || {}),
  };
  contract.audit_trail.push(entry);
  contract.updated_at = entry.at;
  _persist(contract);
  return entry;
}

function _snapshotVersion(contract, reason) {
  // Freeze the pre-mutation state so we can always render the historical
  // document. We omit signatures[] and audit_trail[] to keep snapshots lean.
  const snap = {
    version: contract.version_history.length + 1,
    at: nowIso(),
    reason: reason || '',
    document: {
      id: contract.id,
      type: contract.type,
      title: contract.title,
      parties: JSON.parse(JSON.stringify(contract.parties)),
      effective_date: contract.effective_date,
      expiry_date: contract.expiry_date,
      auto_renew: contract.auto_renew,
      value: contract.value,
      status: contract.status,
      body_he: contract.body_he,
      body_en: contract.body_en,
      amendments: contract.amendments.slice(),
    },
  };
  contract.version_history.push(snap);
  return snap;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — createContract
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new draft contract from a template + fields payload.
 *
 * @param {string} template  template key (see listTemplates())
 * @param {object} fields    placeholder values + meta fields:
 *        parties[], effective_date, expiry_date, value, auto_renew,
 *        signed_at, renewal_notice_days, title?, id?, created_by?,
 *        and template-specific placeholders.
 *
 * @returns {string} draftId — matches the stored `contract.id`.
 */
function createContract(template, fields) {
  if (!template || typeof template !== 'string') {
    throw new TypeError('template key required');
  }
  fields = fields || {};
  const applied = applyTemplate(template, fields);

  if (applied.missing_required.length > 0) {
    // We still create, but flag with warnings so the UI can surface them.
    // Callers who want strict-mode can check the envelope.warnings field.
  }

  const id = fields.id || genId('ctr');
  const type = applied.type;

  // Build parties list. Accept either pre-built fields.parties or derive
  // from template-specific fields.
  let parties = Array.isArray(fields.parties) ? fields.parties.slice() : [];
  if (parties.length === 0) {
    parties = _inferParties(type, fields);
  }

  // Normalise every party: { name, id_or_hp, role?, email? }
  parties = parties.map((p, idx) => {
    if (typeof p === 'string') {
      return { name: p, id_or_hp: '', role: '', email: '' };
    }
    return {
      name: p.name || '',
      id_or_hp: p.id_or_hp || p.tz || p.hp || '',
      role: p.role || '',
      email: p.email || '',
      _id_shape_ok: isIsraeliIdShape(p.id_or_hp || p.tz || p.hp || ''),
    };
  });

  const contract = {
    id,
    type,
    type_label_he: TYPE_LABELS[type].he,
    type_label_en: TYPE_LABELS[type].en,
    template_key: template,
    title: fields.title || applied.title_he || '',
    title_en: applied.title_en || '',
    body_he: applied.body_he || '',
    body_en: applied.body_en || '',
    parties,
    signed_at: normalizeDate(fields.signed_at),
    effective_date: normalizeDate(fields.effective_date),
    expiry_date: normalizeDate(fields.expiry_date),
    auto_renew: fields.auto_renew === true,
    renewal_notice_days: Number.isFinite(fields.renewal_notice_days)
      ? fields.renewal_notice_days
      : (applied.notice_days || DEFAULT_RENEWAL_NOTICE_DAYS),
    value: Number.isFinite(fields.value) ? fields.value : (fields.value != null ? Number(fields.value) || 0 : 0),
    currency: fields.currency || 'ILS',
    status: STATUS.DRAFT,
    status_label_he: STATUS_LABELS[STATUS.DRAFT].he,
    status_label_en: STATUS_LABELS[STATUS.DRAFT].en,
    document_hash: '',          // set below
    signatures: [],             // populated by sendForSigning / recordSignature
    signature_request_id: null, // set by sendForSigning
    amendments: [],             // addendums
    version_history: [],        // immutable snapshots
    warnings: applied.warnings,
    missing_required: applied.missing_required,
    legal_ref: applied.legal_ref,
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by: fields.created_by || null,
    cancelled_at: null,
    cancel_reason: null,
    audit_trail: [],
  };

  contract.document_hash = computeDocumentHash(contract);

  _appendAudit(contract, AUDIT_EVENT.CREATED, {
    template,
    type,
    missing_required: contract.missing_required,
    document_hash: contract.document_hash,
  }, fields.created_by);

  _snapshotVersion(contract, 'initial draft');

  _store.contracts.set(id, contract);
  _persist(contract);

  return id;
}

/**
 * Infer parties from template-specific fields when caller does not pass
 * an explicit parties[] array. Keeps createContract ergonomic.
 */
function _inferParties(type, fields) {
  switch (type) {
    case CONTRACT_TYPE.EMPLOYMENT:
      return [
        { name: fields.employer_name || '', id_or_hp: fields.employer_hp || '', role: 'מעביד' },
        { name: fields.employee_name || '', id_or_hp: fields.employee_tz || '', role: 'עובד' },
      ];
    case CONTRACT_TYPE.SUPPLIER:
      return [
        { name: fields.buyer_name || '',    id_or_hp: fields.buyer_hp || '',    role: 'לקוח' },
        { name: fields.supplier_name || '', id_or_hp: fields.supplier_hp || '', role: 'ספק' },
      ];
    case CONTRACT_TYPE.CLIENT:
      return [
        { name: fields.vendor_name || '', id_or_hp: fields.vendor_hp || '', role: 'נותן השירות' },
        { name: fields.client_name || '', id_or_hp: fields.client_id || '', role: 'לקוח' },
      ];
    case CONTRACT_TYPE.LEASE:
      return [
        { name: fields.landlord_name || '', id_or_hp: fields.landlord_tz || '', role: 'משכיר' },
        { name: fields.tenant_name || '',   id_or_hp: fields.tenant_tz || '',   role: 'שוכר' },
      ];
    case CONTRACT_TYPE.NDA:
      return [
        { name: fields.party_a || '', id_or_hp: fields.party_a_id || '', role: 'צד א' },
        { name: fields.party_b || '', id_or_hp: fields.party_b_id || '', role: 'צד ב' },
      ];
    case CONTRACT_TYPE.SERVICE:
      return [
        { name: fields.provider_name || '', id_or_hp: fields.provider_hp || '', role: 'נותן השירות' },
        { name: fields.customer_name || '', id_or_hp: fields.customer_id || '', role: 'לקוח' },
      ];
    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — sendForSigning
// ═══════════════════════════════════════════════════════════════════════

/**
 * Move a draft into "sent" state and mint signing tokens via esign.
 *
 * @param {string} draftId
 * @param {Array<object>} signers  each { name, id_or_hp?, email?, role? }
 * @param {object} [opts]  mode: 'sequential' | 'parallel', ttlMs, created_by
 * @returns {{ requestId, tokens[] }}
 */
function sendForSigning(draftId, signers, opts) {
  const contract = _store.contracts.get(draftId);
  if (!contract) throw new Error(`contract not found: ${draftId}`);
  if (contract.status === STATUS.CANCELLED) {
    throw new Error(`contract is cancelled: ${draftId}`);
  }
  if (!Array.isArray(signers) || signers.length === 0) {
    // Fallback — derive signers from parties
    signers = contract.parties.map(p => ({
      name: p.name,
      id_or_hp: p.id_or_hp,
      email: p.email,
      role: p.role,
    })).filter(s => !!s.name);
  }
  if (signers.length === 0) {
    throw new Error('no signers available');
  }

  const request = esign.createRequest(contract, signers, opts || {});
  contract.signature_request_id = request.requestId;
  contract.status = STATUS.SENT;
  contract.status_label_he = STATUS_LABELS[STATUS.SENT].he;
  contract.status_label_en = STATUS_LABELS[STATUS.SENT].en;

  _appendAudit(contract, AUDIT_EVENT.SENT_FOR_SIGNING, {
    request_id: request.requestId,
    mode: request.mode,
    signers_count: signers.length,
    document_hash: request.document_hash,
  }, opts && opts.created_by);
  _persist(contract);

  return {
    requestId: request.requestId,
    tokens: request.tokens,
    mode: request.mode,
    expires_at: request.expires_at,
    document_hash: request.document_hash,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — recordSignature (proxies to esign, updates contract)
// ═══════════════════════════════════════════════════════════════════════

function recordSignature(token, signatureData) {
  const result = esign.recordSignature(token, signatureData);
  if (!result.ok) return result;

  // Locate contract by request id.
  let contract = null;
  for (const c of _store.contracts.values()) {
    if (c.signature_request_id === result.requestId) { contract = c; break; }
  }
  if (!contract) return result;

  // Mirror signature blob into contract.signatures[] — append-only.
  contract.signatures.push({
    signer_index: result.signerIndex,
    ...result.signature,
  });

  // Status transitions
  if (result.request_status === esign.REQUEST_STATUS.COMPLETED) {
    contract.status = STATUS.SIGNED;
    contract.status_label_he = STATUS_LABELS[STATUS.SIGNED].he;
    contract.status_label_en = STATUS_LABELS[STATUS.SIGNED].en;
    contract.signed_at = nowIso();

    // Auto-activate if we have an effective_date in the past or undefined.
    const eff = contract.effective_date ? new Date(contract.effective_date).getTime() : Date.now();
    if (eff <= Date.now()) {
      contract.status = STATUS.ACTIVE;
      contract.status_label_he = STATUS_LABELS[STATUS.ACTIVE].he;
      contract.status_label_en = STATUS_LABELS[STATUS.ACTIVE].en;
      _appendAudit(contract, AUDIT_EVENT.ACTIVATED, { document_hash: contract.document_hash });
    }
  } else if (result.request_status === esign.REQUEST_STATUS.PARTIAL) {
    contract.status = STATUS.PARTIAL;
    contract.status_label_he = STATUS_LABELS[STATUS.PARTIAL].he;
    contract.status_label_en = STATUS_LABELS[STATUS.PARTIAL].en;
  }

  _appendAudit(contract, AUDIT_EVENT.SIGNATURE_CAPTURED, {
    signer_index: result.signerIndex,
    request_id: result.requestId,
    request_status: result.request_status,
  });
  _persist(contract);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — verifyContract
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verify a contract's signature state + integrity.
 * Returns a structured report.
 */
function verifyContract(id) {
  const contract = _store.contracts.get(id);
  if (!contract) {
    return {
      valid: false,
      signers_count: 0,
      hash_match: false,
      reason: { code: 'NOT_FOUND', he: 'חוזה לא נמצא', en: 'Contract not found' },
    };
  }

  const liveHash = computeDocumentHash(contract);
  const hashMatch = liveHash === contract.document_hash;

  let reqReport = null;
  if (contract.signature_request_id) {
    reqReport = esign.verifyRequest(contract.signature_request_id, { contract });
  }

  const valid = hashMatch
    && contract.status !== STATUS.CANCELLED
    && (reqReport ? reqReport.valid : contract.status === STATUS.DRAFT);

  _appendAudit(contract, AUDIT_EVENT.VERIFIED, {
    hash_match: hashMatch,
    request_valid: reqReport ? reqReport.valid : null,
    live_hash: liveHash,
  });

  return {
    valid,
    id: contract.id,
    status: contract.status,
    hash_match: hashMatch,
    stored_hash: contract.document_hash,
    live_hash: liveHash,
    signers_count: reqReport ? reqReport.signers_count : contract.parties.length,
    signed_count:  reqReport ? reqReport.signed_count : contract.signatures.length,
    pending_count: reqReport ? reqReport.pending_count : 0,
    declined_count: reqReport ? reqReport.declined_count : 0,
    request_report: reqReport,
    amendments_count: contract.amendments.length,
    version_count: contract.version_history.length,
    audit_trail_length: contract.audit_trail.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — listExpiring
// ═══════════════════════════════════════════════════════════════════════

/**
 * Return contracts whose expiry falls within the requested window.
 * Without arguments, groups results into 30/60/90 brackets.
 *
 * @param {number|null} days  if omitted, returns an object grouped into brackets
 */
function listExpiring(days) {
  const all = Array.from(_store.contracts.values());

  // Only consider contracts with an expiry_date and non-terminal status.
  const candidates = all.filter(c => {
    if (!c.expiry_date) return false;
    if (c.status === STATUS.CANCELLED) return false;
    if (c.status === STATUS.TERMINATED) return false;
    return true;
  });

  const mapOne = (c) => {
    const d = daysFromNow(c.expiry_date);
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      status: c.status,
      expiry_date: c.expiry_date,
      days_remaining: d,
      auto_renew: c.auto_renew,
      renewal_notice_days: c.renewal_notice_days,
      needs_action: d <= (c.renewal_notice_days || DEFAULT_RENEWAL_NOTICE_DAYS),
      parties: c.parties.map(p => p.name),
    };
  };

  if (Number.isFinite(days)) {
    return candidates
      .map(mapOne)
      .filter(r => r.days_remaining <= days && r.days_remaining >= -365)
      .sort((a, b) => a.days_remaining - b.days_remaining);
  }

  // Grouped mode
  const groups = {};
  for (const bracket of DEFAULT_EXPIRY_BRACKETS_DAYS) groups[`within_${bracket}`] = [];
  groups.overdue = [];

  for (const c of candidates) {
    const r = mapOne(c);
    if (r.days_remaining < 0) { groups.overdue.push(r); continue; }
    for (const bracket of DEFAULT_EXPIRY_BRACKETS_DAYS) {
      if (r.days_remaining <= bracket) { groups[`within_${bracket}`].push(r); break; }
    }
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.days_remaining - b.days_remaining);
  return groups;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — renewContract
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extend a contract's expiry date. Append-only: we snapshot the previous
 * state, mutate expiry/effective in place, and record a "renewed" event.
 *
 * @param {string} id
 * @param {string|Date} newExpiry   new expiry date
 * @param {object} [opts]
 * @param {string} [opts.actor]
 * @param {number} [opts.new_value]  optionally bump contract.value
 */
function renewContract(id, newExpiry, opts) {
  const contract = _store.contracts.get(id);
  if (!contract) throw new Error(`contract not found: ${id}`);
  if (contract.status === STATUS.CANCELLED) {
    throw new Error(`cannot renew a cancelled contract: ${id}`);
  }
  const normalized = normalizeDate(newExpiry);
  if (!normalized) throw new TypeError('newExpiry is not a valid date');

  const prevExpiry = contract.expiry_date;
  _snapshotVersion(contract, `renew: ${prevExpiry || 'n/a'} → ${normalized}`);

  contract.expiry_date = normalized;
  if (opts && Number.isFinite(opts.new_value)) contract.value = opts.new_value;

  // If status had drifted to EXPIRED, move it back to RENEWED → ACTIVE.
  if (contract.status === STATUS.EXPIRED || contract.status === STATUS.SIGNED || contract.status === STATUS.ACTIVE) {
    contract.status = STATUS.RENEWED;
    contract.status_label_he = STATUS_LABELS[STATUS.RENEWED].he;
    contract.status_label_en = STATUS_LABELS[STATUS.RENEWED].en;
  }

  // After renewal, the document_hash changes because expiry_date is
  // inside the canonical document. Record both.
  const newHash = computeDocumentHash(contract);
  _appendAudit(contract, AUDIT_EVENT.RENEWED, {
    prev_expiry: prevExpiry,
    new_expiry: normalized,
    prev_hash: contract.document_hash,
    new_hash: newHash,
  }, opts && opts.actor);
  contract.document_hash = newHash;

  // Auto-flip to ACTIVE once renewal is recorded.
  contract.status = STATUS.ACTIVE;
  contract.status_label_he = STATUS_LABELS[STATUS.ACTIVE].he;
  contract.status_label_en = STATUS_LABELS[STATUS.ACTIVE].en;
  _persist(contract);
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — addAmendment
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record an amendment / addendum against a signed contract. This is
 * append-only and produces a new version snapshot.
 *
 * @param {string} id
 * @param {object} body  free-form object describing the amendment:
 *                       { title, description, delta, effective_date? }
 * @param {string} [actor]
 * @returns {string} amendmentId
 */
function addAmendment(id, body, actor) {
  const contract = _store.contracts.get(id);
  if (!contract) throw new Error(`contract not found: ${id}`);
  if (contract.status === STATUS.CANCELLED) {
    throw new Error(`cannot amend a cancelled contract: ${id}`);
  }
  if (!body || typeof body !== 'object') {
    throw new TypeError('amendment body object required');
  }

  const amendmentId = genId('amd');
  const amendment = {
    id: amendmentId,
    at: nowIso(),
    actor: actor || null,
    title: body.title || '',
    description: body.description || '',
    delta: body.delta || {},
    effective_date: normalizeDate(body.effective_date),
  };

  _snapshotVersion(contract, `amendment ${amendmentId}`);
  contract.amendments.push(amendment);

  // Hash changes since amendments sit inside canonical doc... but we
  // explicitly omit them to let the original signed doc remain verifiable.
  // Amendments get their own hash for tamper detection.
  amendment.hash = esign.sha256(esign.canonicalJson(amendment));

  _appendAudit(contract, AUDIT_EVENT.AMENDED, {
    amendment_id: amendmentId,
    amendment_hash: amendment.hash,
    title: amendment.title,
  }, actor);
  _persist(contract);

  return amendmentId;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — cancelContract / terminateContract
// ═══════════════════════════════════════════════════════════════════════

function cancelContract(id, reason, actor) {
  const contract = _store.contracts.get(id);
  if (!contract) throw new Error(`contract not found: ${id}`);
  if (contract.status === STATUS.CANCELLED) return; // idempotent
  _snapshotVersion(contract, `cancel: ${reason || 'n/a'}`);
  contract.status = STATUS.CANCELLED;
  contract.status_label_he = STATUS_LABELS[STATUS.CANCELLED].he;
  contract.status_label_en = STATUS_LABELS[STATUS.CANCELLED].en;
  contract.cancelled_at = nowIso();
  contract.cancel_reason = reason || '';
  if (contract.signature_request_id) {
    try { esign.cancelRequest(contract.signature_request_id, reason); } catch (_) {}
  }
  _appendAudit(contract, AUDIT_EVENT.CANCELLED, { reason: reason || '' }, actor);
  _persist(contract);
}

function terminateContract(id, reason, actor) {
  const contract = _store.contracts.get(id);
  if (!contract) throw new Error(`contract not found: ${id}`);
  if (contract.status === STATUS.TERMINATED) return;
  _snapshotVersion(contract, `terminate: ${reason || 'n/a'}`);
  contract.status = STATUS.TERMINATED;
  contract.status_label_he = STATUS_LABELS[STATUS.TERMINATED].he;
  contract.status_label_en = STATUS_LABELS[STATUS.TERMINATED].en;
  _appendAudit(contract, AUDIT_EVENT.TERMINATED, { reason: reason || '' }, actor);
  _persist(contract);
}

// ═══════════════════════════════════════════════════════════════════════
// Read API
// ═══════════════════════════════════════════════════════════════════════

function getContract(id) {
  const c = _store.contracts.get(id);
  return c ? JSON.parse(JSON.stringify(c)) : null;
}

function listContracts(filter) {
  filter = filter || {};
  const out = [];
  for (const c of _store.contracts.values()) {
    if (filter.type && c.type !== filter.type) continue;
    if (filter.status && c.status !== filter.status) continue;
    out.push(JSON.parse(JSON.stringify(c)));
  }
  return out;
}

function getVersionHistory(id) {
  const c = _store.contracts.get(id);
  if (!c) return [];
  return JSON.parse(JSON.stringify(c.version_history));
}

/**
 * Sweep over all contracts, mark any whose expiry_date has passed as
 * EXPIRED (append-only). Typically called from a nightly cron.
 */
function sweepExpired(asOf) {
  const now = asOf ? new Date(asOf).getTime() : Date.now();
  let flipped = 0;
  for (const c of _store.contracts.values()) {
    if (!c.expiry_date) continue;
    if (c.status === STATUS.CANCELLED || c.status === STATUS.TERMINATED) continue;
    if (c.status === STATUS.EXPIRED) continue;
    if (new Date(c.expiry_date).getTime() < now) {
      _snapshotVersion(c, 'sweep: expired');
      c.status = STATUS.EXPIRED;
      c.status_label_he = STATUS_LABELS[STATUS.EXPIRED].he;
      c.status_label_en = STATUS_LABELS[STATUS.EXPIRED].en;
      _appendAudit(c, AUDIT_EVENT.EXPIRED, { as_of: new Date(now).toISOString() });
      flipped++;
    }
  }
  return flipped;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API per spec
  createContract,
  sendForSigning,
  recordSignature,
  verifyContract,
  listExpiring,
  renewContract,

  // Secondary helpers
  addAmendment,
  cancelContract,
  terminateContract,
  getContract,
  listContracts,
  getVersionHistory,
  sweepExpired,

  // Templates
  listTemplates,
  getTemplate,
  registerTemplate,
  applyTemplate,

  // Low-level helpers
  computeDocumentHash,
  resetStore,
  setPersistenceAdapter,

  // Constants
  CONTRACT_TYPE,
  TYPE_LABELS,
  STATUS,
  STATUS_LABELS,
  AUDIT_EVENT,
  LEGAL_REFS,
  DEFAULT_EXPIRY_BRACKETS_DAYS,
  DEFAULT_RENEWAL_NOTICE_DAYS,
};
