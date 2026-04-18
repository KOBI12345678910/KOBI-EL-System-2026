/* ============================================================================
 * Techno-Kol Uzi Mega-ERP — Document Expiry Alerting System
 * Agent Y-110 / Swarm Documents / Kobi EL 2026-04-11
 * ----------------------------------------------------------------------------
 * מערכת התראות תפוגת מסמכים — רישיונות, היתרים, ביטוחים, חוזים, אישורים
 *
 * Scope
 * =====
 * Centralized expiry-tracking hub for every piece of paper or digital
 * credential a Techno-Kol Uzi company must keep current in order to legally
 * operate — from רישיון עסק through היתר פליטות, רישיון אחסון חומ"ס,
 * ISO certificates, ביטוחי חבויות / מקצועית / רכוש, רישיונות הנדסאי/מהנדס,
 * רישיון נהיגה, רישיון רכב, שעבודים, חוזי שכירות, NDAs ועוד.
 *
 * DISTINCT FROM (but mesh with):
 *   - onyx-procurement/src/contracts/contract-manager.js (X-23)
 *       Contract life-cycle engine. This module accepts registerDocument()
 *       calls from the contract engine so the two views stay in sync.
 *   - onyx-procurement/src/hr/cert-tracker.js (Y-069)
 *       Person-bound professional licences. An HR cert can also be
 *       registered here if it has a hard legal expiry the whole ERP needs
 *       to see in one place (e.g. מפעיל מנוף at a site audit).
 *   - onyx-procurement/src/manufacturing/welder-certs.js (Y-043)
 *       Welder WPQ continuity — these are process-bound and do NOT flow
 *       into this hub; the 6-month continuity check is a shop-floor event.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — NEVER delete. Any "remove" is a
 * supersede chain; expired docs remain tracked forever.
 *
 * Zero dependencies: pure Node, no npm packages, deterministic, injectable
 * clock. Bilingual: every label and alert exposes { he, en }.
 *
 * Legal / regulatory backbone (non-exhaustive):
 *   - חוק רישוי עסקים, תשכ"ח-1968
 *   - חוק אוויר נקי, תשס"ח-2008 (היתר פליטות)
 *   - חוק החומרים המסוכנים, תשנ"ג-1993 (היתר רעלים / אחסון חומ"ס)
 *   - חוק פיקוח על שירותים פיננסיים (ביטוח), תשמ"א-1981
 *   - פקודת התעבורה — רישיון רכב, רישיון נהיגה, טסט שנתי
 *   - חוק המהנדסים והאדריכלים, תשי"ח-1958
 *   - חוק הדרכונים, תשי"ב-1952
 *   - ISO 9001:2015 §8.5 (external provider controls evidence)
 *   - ISO 14001:2015 §9.1.2 (compliance evaluation)
 *   - ISO 45001:2018 §9.1.2 (compliance obligations)
 *   - חוק המשכון, תשכ"ז-1967 (שעבודים)
 * ============================================================================
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// BILINGUAL LABELS / URGENCY
// ═══════════════════════════════════════════════════════════════════════

const LABEL = Object.freeze({
  DOCUMENT:        { he: 'מסמך',              en: 'Document' },
  ACTIVE:          { he: 'בתוקף',             en: 'Active' },
  EXPIRING_SOON:   { he: 'עומד לפוג',         en: 'Expiring soon' },
  EXPIRED:         { he: 'פג תוקף',           en: 'Expired' },
  GRACE:           { he: 'בתקופת ארכה',        en: 'In grace period' },
  SUPERSEDED:      { he: 'שודרג',             en: 'Superseded / renewed' },
  RENEWAL_PENDING: { he: 'חידוש בתהליך',       en: 'Renewal in progress' },
  RENEWAL_BLOCKED: { he: 'חידוש חסום',        en: 'Renewal blocked' },
  AUTO_RENEWAL:    { he: 'חידוש אוטומטי',     en: 'Auto-renewal' },
  RED:             { he: 'אדום — דחוף',       en: 'Red — urgent' },
  YELLOW:          { he: 'צהוב — לתכנן',      en: 'Yellow — plan' },
  GREEN:           { he: 'ירוק — תקין',       en: 'Green — healthy' },
  COMPLIANT:       { he: 'תקין',              en: 'Compliant' },
  GAP:             { he: 'חוסר',              en: 'Gap' },
});

const STATUS = Object.freeze({
  ACTIVE:          'active',
  EXPIRING:        'expiring',
  EXPIRED:         'expired',
  GRACE:           'grace',
  SUPERSEDED:      'superseded',
  RENEWAL_PENDING: 'renewal-pending',
  RENEWAL_BLOCKED: 'renewal-blocked',
});

const URGENCY = Object.freeze({
  RED:    'red',
  YELLOW: 'yellow',
  GREEN:  'green',
  EXPIRED:'expired',
});

const CHANNEL = Object.freeze({
  EMAIL: 'email',
  SMS:   'sms',
  WHATSAPP: 'whatsapp',
  PORTAL:'portal',
});

// ═══════════════════════════════════════════════════════════════════════
// ISRAELI DOCUMENT TYPE CATALOG
// ═══════════════════════════════════════════════════════════════════════
// Keyed by internal type code. Default validity / lead / grace baked in
// from actual Israeli regulatory cycles. Explicit values passed to
// registerDocument() always win over the catalog defaults.

const DOC_CATALOG = Object.freeze({
  RISHUY_ESEK: {
    code: 'RISHUY_ESEK',
    category: 'license',
    he: 'רישיון עסק',
    en: 'Business Licence',
    law: 'חוק רישוי עסקים, תשכ"ח-1968',
    issuer: { he: 'רשות הרישוי העירונית', en: 'Municipal Licensing Authority' },
    validityMonths: 60,
    renewalLeadDays: 180,
    graceDays: 30,
    critical: true,
  },
  HETER_PELITOT: {
    code: 'HETER_PELITOT',
    category: 'permit',
    he: 'היתר פליטות',
    en: 'Emissions Permit',
    law: 'חוק אוויר נקי, תשס"ח-2008',
    issuer: { he: 'המשרד להגנת הסביבה', en: 'Ministry of Environmental Protection' },
    validityMonths: 84,
    renewalLeadDays: 365,
    graceDays: 0,
    critical: true,
  },
  HETER_REALIM: {
    code: 'HETER_REALIM',
    category: 'permit',
    he: 'היתר רעלים / אחסון חומ"ס',
    en: 'Hazardous Materials Storage Permit',
    law: 'חוק החומרים המסוכנים, תשנ"ג-1993',
    issuer: { he: 'המשרד להגנת הסביבה — אגף חומ"ס', en: 'MoEP — HazMat Division' },
    validityMonths: 36,
    renewalLeadDays: 120,
    graceDays: 14,
    critical: true,
  },
  ISO_9001: {
    code: 'ISO_9001',
    category: 'certificate',
    he: 'תעודת ISO 9001',
    en: 'ISO 9001 Quality Management Certificate',
    law: 'ISO 9001:2015',
    issuer: { he: 'גוף הסמכה מוכר (מכון התקנים / SII / BV / DNV)', en: 'Accredited Certification Body' },
    validityMonths: 36,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: false,
  },
  ISO_14001: {
    code: 'ISO_14001',
    category: 'certificate',
    he: 'תעודת ISO 14001',
    en: 'ISO 14001 Environmental Management Certificate',
    law: 'ISO 14001:2015',
    issuer: { he: 'גוף הסמכה מוכר', en: 'Accredited Certification Body' },
    validityMonths: 36,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: false,
  },
  ISO_45001: {
    code: 'ISO_45001',
    category: 'certificate',
    he: 'תעודת ISO 45001',
    en: 'ISO 45001 OH&S Management Certificate',
    law: 'ISO 45001:2018',
    issuer: { he: 'גוף הסמכה מוכר', en: 'Accredited Certification Body' },
    validityMonths: 36,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: false,
  },
  BITUACH_CHAVUYOT: {
    code: 'BITUACH_CHAVUYOT',
    category: 'insurance',
    he: 'ביטוח חבויות — צד ג׳ ומוצר',
    en: 'Third-Party & Product Liability Insurance',
    law: 'חוק חוזה הביטוח, תשמ"א-1981',
    issuer: { he: 'חברת ביטוח מורשית', en: 'Licensed Insurer' },
    validityMonths: 12,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: true,
  },
  BITUACH_MIKTZOIT: {
    code: 'BITUACH_MIKTZOIT',
    category: 'insurance',
    he: 'ביטוח אחריות מקצועית',
    en: 'Professional Liability Insurance',
    law: 'חוק חוזה הביטוח, תשמ"א-1981',
    issuer: { he: 'חברת ביטוח מורשית', en: 'Licensed Insurer' },
    validityMonths: 12,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: true,
  },
  BITUACH_RECHUSH: {
    code: 'BITUACH_RECHUSH',
    category: 'insurance',
    he: 'ביטוח רכוש / אש מורחב',
    en: 'Property / Extended Fire Insurance',
    law: 'חוק חוזה הביטוח, תשמ"א-1981',
    issuer: { he: 'חברת ביטוח מורשית', en: 'Licensed Insurer' },
    validityMonths: 12,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: false,
  },
  BITUACH_RECHEV: {
    code: 'BITUACH_RECHEV',
    category: 'insurance',
    he: 'ביטוח רכב — חובה ומקיף',
    en: 'Vehicle Compulsory + Comprehensive Insurance',
    law: 'פקודת ביטוח רכב מנועי (נוסח חדש), תש"ל-1970',
    issuer: { he: 'חברת ביטוח מורשית', en: 'Licensed Insurer' },
    validityMonths: 12,
    renewalLeadDays: 30,
    graceDays: 0,
    critical: true,
  },
  RISHUY_MEHANDES: {
    code: 'RISHUY_MEHANDES',
    category: 'license',
    he: 'רישיון מהנדס רשום',
    en: 'Registered Engineer Licence',
    law: 'חוק המהנדסים והאדריכלים, תשי"ח-1958',
    issuer: { he: 'רשם המהנדסים והאדריכלים', en: 'Registrar of Engineers & Architects' },
    validityMonths: 60,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: true,
  },
  RISHUY_HANDASAI: {
    code: 'RISHUY_HANDASAI',
    category: 'license',
    he: 'רישיון הנדסאי',
    en: 'Certified Practical Engineer Licence',
    law: 'חוק ההנדסאים והטכנאים המוסמכים, תשע"ג-2012',
    issuer: { he: 'המועצה להנדסאים וטכנאים מוסמכים', en: 'Council of Practical Engineers & Technicians' },
    validityMonths: 60,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: true,
  },
  RISHUY_NEHIGA: {
    code: 'RISHUY_NEHIGA',
    category: 'drivers-license',
    he: 'רישיון נהיגה',
    en: 'Driver\'s Licence',
    law: 'פקודת התעבורה [נוסח חדש]',
    issuer: { he: 'משרד התחבורה — רשות הרישוי', en: 'Ministry of Transport — Licensing Authority' },
    validityMonths: 120,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: true,
  },
  RISHUY_RECHEV: {
    code: 'RISHUY_RECHEV',
    category: 'license',
    he: 'רישיון רכב (טסט שנתי)',
    en: 'Vehicle Licence (Annual Test)',
    law: 'פקודת התעבורה [נוסח חדש]',
    issuer: { he: 'משרד התחבורה — מכון רישוי', en: 'Ministry of Transport — Vehicle Test Station' },
    validityMonths: 12,
    renewalLeadDays: 45,
    graceDays: 0,
    critical: true,
  },
  SHIABUD: {
    code: 'SHIABUD',
    category: 'contract',
    he: 'שעבוד / משכון',
    en: 'Pledge / Charge Registration',
    law: 'חוק המשכון, תשכ"ז-1967',
    issuer: { he: 'רשם המשכונות / רשם החברות', en: 'Registrar of Pledges / Companies' },
    validityMonths: 60,
    renewalLeadDays: 180,
    graceDays: 0,
    critical: true,
  },
  CHOZE_SCHIRUT: {
    code: 'CHOZE_SCHIRUT',
    category: 'lease',
    he: 'חוזה שכירות',
    en: 'Lease Agreement',
    law: 'חוק השכירות והשאילה, תשל"א-1971',
    issuer: { he: 'משכיר / בעל הנכס', en: 'Landlord / Property Owner' },
    validityMonths: 12,
    renewalLeadDays: 90,
    graceDays: 0,
    critical: false,
  },
  NDA: {
    code: 'NDA',
    category: 'nda',
    he: 'הסכם סודיות NDA',
    en: 'Non-Disclosure Agreement',
    law: 'חוק החוזים (חלק כללי), תשל"ג-1973',
    issuer: { he: 'צד חוזי', en: 'Contracting Party' },
    validityMonths: 36,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: false,
  },
  ACHRAYUT: {
    code: 'ACHRAYUT',
    category: 'warranty',
    he: 'כתב אחריות יצרן',
    en: 'Manufacturer Warranty',
    law: 'חוק המכר, תשכ"ח-1968',
    issuer: { he: 'יצרן / ספק', en: 'Manufacturer / Supplier' },
    validityMonths: 24,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: false,
  },
  DARKON: {
    code: 'DARKON',
    category: 'passport',
    he: 'דרכון',
    en: 'Passport',
    law: 'חוק הדרכונים, תשי"ב-1952',
    issuer: { he: 'רשות האוכלוסין וההגירה', en: 'Population & Immigration Authority' },
    validityMonths: 120,
    renewalLeadDays: 180,
    graceDays: 0,
    critical: true,
  },
  VIZA: {
    code: 'VIZA',
    category: 'visa',
    he: 'אשרת כניסה / עבודה',
    en: 'Entry / Work Visa',
    law: 'חוק הכניסה לישראל, תשי"ב-1952',
    issuer: { he: 'רשות האוכלוסין וההגירה', en: 'Population & Immigration Authority' },
    validityMonths: 12,
    renewalLeadDays: 60,
    graceDays: 0,
    critical: true,
  },
});

// Closed set of accepted document-type names for registerDocument(type).
const DOC_TYPES = Object.freeze([
  'contract',
  'license',
  'certificate',
  'insurance',
  'permit',
  'warranty',
  'lease',
  'nda',
  'passport',
  'visa',
  'drivers-license',
]);

// Default escalating reminder offsets (days-before-expiry).
const DEFAULT_OFFSETS = Object.freeze([180, 90, 60, 30, 14, 7, 1]);

// Default grace periods by category (days after expiry during which the
// document is still accepted for on-site work, at operator's own risk).
const DEFAULT_GRACE = Object.freeze({
  contract:          0,
  license:           30, // רישיון עסק: formal grace per רישוי עסקים
  certificate:       0,
  insurance:         0,  // ביטוח פג = אין כיסוי, ללא תקופת ארכה
  permit:            0,
  warranty:          0,
  lease:             0,
  nda:               0,
  passport:          0,
  visa:              0,
  'drivers-license': 0,
});

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 86_400_000;

function toDate(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(v);
  throw new TypeError(`expiry-alerts: cannot parse date from ${typeof v}`);
}

function toIsoDate(d) {
  // YYYY-MM-DD
  const dt = toDate(d);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  // signed: positive if b is later than a
  const da = toDate(a);
  const db = toDate(b);
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

function addMonths(d, months) {
  const dt = toDate(d);
  const out = new Date(dt.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function freezeDeep(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const k of Object.keys(o)) freezeDeep(o[k]);
    Object.freeze(o);
  }
  return o;
}

function bilingualMessage({ he, en }) {
  return { he, en };
}

// ═══════════════════════════════════════════════════════════════════════
// ExpiryAlertSystem
// ═══════════════════════════════════════════════════════════════════════

class ExpiryAlertSystem {
  constructor(opts = {}) {
    // Deterministic, injectable clock for tests.
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();

    // Append-only document register. Never spliced, never deleted.
    // Map<docId, DocRecord>
    this._docs = new Map();

    // Supersede chain: Map<oldDocId, newDocId>
    this._supersedes = new Map();

    // Alert cadence overrides by type. Default is DEFAULT_OFFSETS.
    // Map<type|typeCode, number[]>
    this._cadences = new Map();

    // Grace period overrides. Map<type|typeCode, number>
    this._graceOverrides = new Map();

    // Sent-alert audit ledger — append only.
    // Array<{docId, daysOut, sentAt, recipients, channel, message}>
    this._alertLedger = [];

    // Renewal workflow registry. Map<docId, RenewalRecord>
    this._renewals = new Map();

    // Auto-renewal registry. Map<docId, {enabled, conditions, updatedAt}>
    this._autoRenewals = new Map();

    // Email/SMS sink (pluggable for tests). The default is a buffer.
    this._sink = typeof opts.sink === 'function' ? opts.sink : null;
  }

  // ───────────────────────────────────────────────────────────────
  // registerDocument — append-only write
  // ───────────────────────────────────────────────────────────────
  registerDocument(input = {}) {
    const {
      docId,
      type,
      expiryDate,
      owner,
      renewalContact,
      renewalLeadDays,
      typeCode,                // optional — maps to DOC_CATALOG
      name,
      issueDate,
      metadata,
      supersedes,
    } = input;

    if (!docId || typeof docId !== 'string')
      throw new Error('expiry-alerts.registerDocument: docId is required (string)');
    if (!type || !DOC_TYPES.includes(type))
      throw new Error(`expiry-alerts.registerDocument: type must be one of ${DOC_TYPES.join('|')}`);
    if (!owner)
      throw new Error('expiry-alerts.registerDocument: owner is required');

    const catalog = typeCode && DOC_CATALOG[typeCode] ? DOC_CATALOG[typeCode] : null;

    // Expiry: explicit wins, otherwise derive from catalog validityMonths.
    let expiry;
    if (expiryDate) {
      expiry = toIsoDate(expiryDate);
    } else if (catalog && catalog.validityMonths && issueDate) {
      expiry = toIsoDate(addMonths(issueDate, catalog.validityMonths));
    } else {
      throw new Error(
        'expiry-alerts.registerDocument: expiryDate is required (or typeCode+issueDate to derive)',
      );
    }

    // Lead days: explicit wins, otherwise catalog, otherwise 60.
    const lead = Number.isFinite(renewalLeadDays)
      ? renewalLeadDays
      : (catalog && catalog.renewalLeadDays) || 60;

    // Enforce never-delete: reject if docId already present unless this is
    // an append-only supersede that explicitly links the prior version.
    if (this._docs.has(docId))
      throw new Error(
        `expiry-alerts.registerDocument: docId ${docId} already registered; ` +
        `use a new docId + supersedes:${docId} to renew (never delete)`,
      );

    const record = {
      docId,
      type,
      typeCode: typeCode || null,
      category: catalog ? catalog.category : type,
      name: name || (catalog ? catalog.he : docId),
      labels: catalog
        ? bilingualMessage({ he: catalog.he, en: catalog.en })
        : bilingualMessage({ he: name || docId, en: name || docId }),
      law: catalog ? catalog.law : null,
      issuer: catalog ? catalog.issuer : null,
      issueDate: issueDate ? toIsoDate(issueDate) : null,
      expiryDate: expiry,
      owner,
      renewalContact: renewalContact || null,
      renewalLeadDays: lead,
      metadata: metadata ? { ...metadata } : {},
      registeredAt: this._now().toISOString(),
      supersedes: supersedes || null,
      supersededBy: null,
      status: STATUS.ACTIVE, // will be recomputed on demand
      critical: catalog ? !!catalog.critical : false,
    };

    // Link supersede chain forward (append only; old record keeps its row).
    if (supersedes) {
      if (!this._docs.has(supersedes))
        throw new Error(
          `expiry-alerts.registerDocument: supersedes target ${supersedes} does not exist`,
        );
      const prev = this._docs.get(supersedes);
      // Mutate only the forward pointer (and status) — never the payload.
      this._docs.set(supersedes, {
        ...prev,
        supersededBy: docId,
        status: STATUS.SUPERSEDED,
      });
      this._supersedes.set(supersedes, docId);
    }

    this._docs.set(docId, record);
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // listExpiring — live snapshot of docs due within N days
  // ───────────────────────────────────────────────────────────────
  listExpiring({ days = 90, type, owner, asOf } = {}) {
    const now = asOf ? toDate(asOf) : this._now();
    const out = [];
    for (const rec of this._docs.values()) {
      if (rec.supersededBy) continue; // superseded rows are audit-only
      if (type && rec.type !== type) continue;
      if (owner && rec.owner !== owner) continue;
      const daysOut = daysBetween(now, rec.expiryDate);
      if (daysOut <= days) {
        out.push({
          docId: rec.docId,
          type: rec.type,
          typeCode: rec.typeCode,
          name: rec.name,
          labels: rec.labels,
          owner: rec.owner,
          expiryDate: rec.expiryDate,
          daysOut,
          status: this._classify(daysOut, rec),
          urgency: this._urgency(daysOut),
          critical: rec.critical,
        });
      }
    }
    // Soonest first (most negative == most expired, first).
    out.sort((a, b) => a.daysOut - b.daysOut);
    return out;
  }

  // ───────────────────────────────────────────────────────────────
  // alertCadence — set or read escalating reminder offsets by type
  // ───────────────────────────────────────────────────────────────
  alertCadence({ type, offsets } = {}) {
    if (!type) throw new Error('expiry-alerts.alertCadence: type is required');
    if (offsets) {
      if (!Array.isArray(offsets) || offsets.some((x) => !Number.isFinite(x) || x < 0))
        throw new Error('expiry-alerts.alertCadence: offsets must be a non-negative number[]');
      // Descending: 180,90,60,30,14,7,1
      const sorted = [...offsets].sort((a, b) => b - a);
      this._cadences.set(type, Object.freeze(sorted));
      return { type, offsets: sorted };
    }
    return { type, offsets: this._cadences.get(type) || DEFAULT_OFFSETS };
  }

  // Convenience: return every pending alert that fires in [asOf, asOf+windowDays].
  pendingAlerts({ asOf, windowDays = 365 } = {}) {
    const now = asOf ? toDate(asOf) : this._now();
    const fires = [];
    for (const rec of this._docs.values()) {
      if (rec.supersededBy) continue;
      const daysOut = daysBetween(now, rec.expiryDate);
      if (daysOut > windowDays) continue;
      const cadence =
        this._cadences.get(rec.typeCode) ||
        this._cadences.get(rec.type) ||
        DEFAULT_OFFSETS;
      // Find the smallest offset >= daysOut ( == "nearest reminder still due").
      const tier = cadence.find((off) => daysOut <= off);
      if (tier !== undefined) {
        fires.push({
          docId: rec.docId,
          type: rec.type,
          tier,
          daysOut,
          urgency: this._urgency(daysOut),
          labels: rec.labels,
          owner: rec.owner,
          renewalContact: rec.renewalContact,
        });
      }
    }
    return fires.sort((a, b) => a.daysOut - b.daysOut);
  }

  // ───────────────────────────────────────────────────────────────
  // sendAlert — bilingual email/SMS (buffered; pluggable sink)
  // ───────────────────────────────────────────────────────────────
  sendAlert({ docId, daysOut, recipients, channel = CHANNEL.EMAIL } = {}) {
    if (!docId) throw new Error('expiry-alerts.sendAlert: docId is required');
    const rec = this._docs.get(docId);
    if (!rec) throw new Error(`expiry-alerts.sendAlert: unknown docId ${docId}`);
    if (!Array.isArray(recipients) || recipients.length === 0)
      throw new Error('expiry-alerts.sendAlert: recipients is required (non-empty array)');

    const computedDaysOut = Number.isFinite(daysOut)
      ? daysOut
      : daysBetween(this._now(), rec.expiryDate);

    const message = this._renderMessage(rec, computedDaysOut);
    const entry = Object.freeze({
      docId,
      daysOut: computedDaysOut,
      sentAt: this._now().toISOString(),
      recipients: Object.freeze([...recipients]),
      channel,
      message: freezeDeep({ ...message }),
      urgency: this._urgency(computedDaysOut),
    });
    this._alertLedger.push(entry);
    if (this._sink) this._sink(entry);
    return entry;
  }

  alertHistory(docId) {
    if (docId) return this._alertLedger.filter((a) => a.docId === docId);
    return [...this._alertLedger];
  }

  // ───────────────────────────────────────────────────────────────
  // renewalWorkflow — kick off renewal process
  // ───────────────────────────────────────────────────────────────
  renewalWorkflow(docId, opts = {}) {
    const rec = this._docs.get(docId);
    if (!rec) throw new Error(`expiry-alerts.renewalWorkflow: unknown docId ${docId}`);

    const existing = this._renewals.get(docId);
    if (existing && existing.status === STATUS.RENEWAL_PENDING) {
      return existing;
    }

    const workflow = Object.freeze({
      docId,
      type: rec.type,
      typeCode: rec.typeCode,
      status: STATUS.RENEWAL_PENDING,
      startedAt: this._now().toISOString(),
      owner: rec.owner,
      renewalContact: rec.renewalContact,
      steps: Object.freeze(this._renewalStepsFor(rec)),
      expiryDate: rec.expiryDate,
      notes: opts.notes || null,
    });
    this._renewals.set(docId, workflow);
    return workflow;
  }

  // ───────────────────────────────────────────────────────────────
  // gracePeriods — read/write formal grace period by type
  // ───────────────────────────────────────────────────────────────
  gracePeriods({ type, days } = {}) {
    if (!type) {
      // Return the full table.
      const all = { ...DEFAULT_GRACE };
      for (const [k, v] of this._graceOverrides.entries()) all[k] = v;
      return all;
    }
    if (days === undefined) {
      if (this._graceOverrides.has(type)) return this._graceOverrides.get(type);
      return DEFAULT_GRACE[type] !== undefined ? DEFAULT_GRACE[type] : 0;
    }
    if (!Number.isFinite(days) || days < 0)
      throw new Error('expiry-alerts.gracePeriods: days must be a non-negative number');
    this._graceOverrides.set(type, days);
    return days;
  }

  // ───────────────────────────────────────────────────────────────
  // expiredDocsRegister — never delete
  // ───────────────────────────────────────────────────────────────
  expiredDocsRegister({ asOf, includeSuperseded = true } = {}) {
    const now = asOf ? toDate(asOf) : this._now();
    const out = [];
    for (const rec of this._docs.values()) {
      if (!includeSuperseded && rec.supersededBy) continue;
      const daysOut = daysBetween(now, rec.expiryDate);
      if (daysOut >= 0 && !rec.supersededBy) continue; // not yet expired (and still live)
      const grace = this._graceFor(rec);
      const inGrace = daysOut < 0 && -daysOut <= grace && !rec.supersededBy;
      out.push({
        docId: rec.docId,
        type: rec.type,
        typeCode: rec.typeCode,
        labels: rec.labels,
        owner: rec.owner,
        expiryDate: rec.expiryDate,
        daysOut,
        status: rec.supersededBy
          ? STATUS.SUPERSEDED
          : inGrace
            ? STATUS.GRACE
            : STATUS.EXPIRED,
        supersededBy: rec.supersededBy,
        inGrace,
        graceDaysRemaining: inGrace ? grace + daysOut : 0,
      });
    }
    out.sort((a, b) => a.daysOut - b.daysOut);
    return out;
  }

  // ───────────────────────────────────────────────────────────────
  // autoRenewal — flag doc for auto-processing
  // ───────────────────────────────────────────────────────────────
  autoRenewal({ docId, enabled, conditions } = {}) {
    if (!docId) throw new Error('expiry-alerts.autoRenewal: docId is required');
    if (!this._docs.has(docId))
      throw new Error(`expiry-alerts.autoRenewal: unknown docId ${docId}`);
    const record = Object.freeze({
      docId,
      enabled: !!enabled,
      conditions: freezeDeep(conditions ? { ...conditions } : {}),
      updatedAt: this._now().toISOString(),
    });
    this._autoRenewals.set(docId, record);
    return record;
  }

  getAutoRenewal(docId) {
    return this._autoRenewals.get(docId) || null;
  }

  // ───────────────────────────────────────────────────────────────
  // complianceReport — audit-ready view over a period
  // ───────────────────────────────────────────────────────────────
  complianceReport(period = {}) {
    const from = period.from ? toDate(period.from) : new Date(0);
    const to = period.to ? toDate(period.to) : this._now();
    const expired = [];
    const renewedOnTime = [];
    const renewedLate = [];
    const gaps = [];
    const stillActive = [];

    for (const rec of this._docs.values()) {
      const exp = toDate(rec.expiryDate);
      if (exp < from || exp > to) continue;

      if (rec.supersededBy) {
        const next = this._docs.get(rec.supersededBy);
        if (!next) {
          gaps.push(this._reportRow(rec, 'supersede-target-missing'));
          continue;
        }
        const renewedOn = toDate(next.registeredAt || next.issueDate || next.expiryDate);
        if (renewedOn <= exp) {
          renewedOnTime.push({
            ...this._reportRow(rec, 'renewed-on-time'),
            renewedBy: next.docId,
            renewedOn: toIsoDate(renewedOn),
          });
        } else {
          renewedLate.push({
            ...this._reportRow(rec, 'renewed-late'),
            renewedBy: next.docId,
            renewedOn: toIsoDate(renewedOn),
            lateDays: daysBetween(exp, renewedOn),
          });
        }
      } else {
        const now = this._now();
        if (exp < now) {
          const grace = this._graceFor(rec);
          const daysPastExpiry = daysBetween(exp, now);
          if (daysPastExpiry <= grace) {
            stillActive.push(this._reportRow(rec, 'in-grace'));
          } else {
            expired.push(this._reportRow(rec, 'expired-no-renewal'));
            if (rec.critical) gaps.push(this._reportRow(rec, 'critical-gap'));
          }
        } else {
          stillActive.push(this._reportRow(rec, 'active'));
        }
      }
    }

    const totalTouched =
      expired.length + renewedOnTime.length + renewedLate.length + stillActive.length;
    const renewalRate =
      totalTouched === 0
        ? 1
        : (renewedOnTime.length + renewedLate.length) / totalTouched;

    return {
      period: {
        from: toIsoDate(from),
        to: toIsoDate(to),
      },
      generatedAt: this._now().toISOString(),
      totals: {
        expired: expired.length,
        renewedOnTime: renewedOnTime.length,
        renewedLate: renewedLate.length,
        stillActive: stillActive.length,
        gaps: gaps.length,
        totalTouched,
      },
      renewalRate,
      expired,
      renewedOnTime,
      renewedLate,
      stillActive,
      gaps,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // dashboardData — red/yellow/green buckets by urgency
  // ───────────────────────────────────────────────────────────────
  dashboardData({ asOf } = {}) {
    const now = asOf ? toDate(asOf) : this._now();
    const buckets = {
      red:    [], // <30 days (or expired-in-grace)
      yellow: [], // <90 days
      green:  [], // >=90 days
      expired:[], // past grace
    };
    const byType = {};
    for (const rec of this._docs.values()) {
      if (rec.supersededBy) continue;
      const daysOut = daysBetween(now, rec.expiryDate);
      const row = {
        docId: rec.docId,
        type: rec.type,
        typeCode: rec.typeCode,
        labels: rec.labels,
        owner: rec.owner,
        expiryDate: rec.expiryDate,
        daysOut,
        critical: rec.critical,
      };
      const u = this._urgency(daysOut, rec);
      buckets[u].push(row);
      if (!byType[rec.type]) byType[rec.type] = { red: 0, yellow: 0, green: 0, expired: 0 };
      byType[rec.type][u]++;
    }
    for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => a.daysOut - b.daysOut);
    return {
      asOf: toIsoDate(now),
      counts: {
        red: buckets.red.length,
        yellow: buckets.yellow.length,
        green: buckets.green.length,
        expired: buckets.expired.length,
      },
      byType,
      red: buckets.red,
      yellow: buckets.yellow,
      green: buckets.green,
      expired: buckets.expired,
      legend: {
        red: bilingualMessage({ he: 'פחות מ-30 ימים — טיפול מיידי', en: 'Less than 30 days — act now' }),
        yellow: bilingualMessage({ he: 'פחות מ-90 ימים — לתכנן חידוש', en: 'Less than 90 days — plan renewal' }),
        green: bilingualMessage({ he: 'מעל 90 ימים — תקין', en: 'More than 90 days — healthy' }),
        expired: bilingualMessage({ he: 'פג תוקף', en: 'Expired past grace' }),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────
  // bulkRenewalRequest — mass-initiate renewal for a type/period
  // ───────────────────────────────────────────────────────────────
  bulkRenewalRequest({ type, period } = {}) {
    if (!type) throw new Error('expiry-alerts.bulkRenewalRequest: type is required');
    const from = period && period.from ? toDate(period.from) : this._now();
    const to = period && period.to
      ? toDate(period.to)
      : new Date(from.getTime() + 180 * MS_PER_DAY);

    const initiated = [];
    const skipped = [];
    for (const rec of this._docs.values()) {
      if (rec.supersededBy) continue;
      if (rec.type !== type) continue;
      const exp = toDate(rec.expiryDate);
      if (exp < from || exp > to) continue;
      if (this._renewals.has(rec.docId) &&
          this._renewals.get(rec.docId).status === STATUS.RENEWAL_PENDING) {
        skipped.push({ docId: rec.docId, reason: 'already-pending' });
        continue;
      }
      const wf = this.renewalWorkflow(rec.docId, { notes: `bulk:${type}` });
      initiated.push(wf);
    }
    return {
      type,
      period: { from: toIsoDate(from), to: toIsoDate(to) },
      initiated,
      skipped,
      initiatedAt: this._now().toISOString(),
    };
  }

  // ───────────────────────────────────────────────────────────────
  // Read helpers
  // ───────────────────────────────────────────────────────────────
  getDocument(docId) {
    return this._docs.get(docId) || null;
  }

  listDocuments({ includeSuperseded = true } = {}) {
    const out = [];
    for (const rec of this._docs.values()) {
      if (!includeSuperseded && rec.supersededBy) continue;
      out.push(rec);
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════

  _classify(daysOut, rec) {
    if (daysOut < 0) {
      const grace = this._graceFor(rec);
      if (-daysOut <= grace) return STATUS.GRACE;
      return STATUS.EXPIRED;
    }
    if (daysOut <= rec.renewalLeadDays) return STATUS.EXPIRING;
    return STATUS.ACTIVE;
  }

  _urgency(daysOut, rec) {
    if (daysOut < 0) {
      if (rec) {
        const grace = this._graceFor(rec);
        if (-daysOut <= grace) return URGENCY.RED;
      }
      return URGENCY.EXPIRED;
    }
    if (daysOut < 30)  return URGENCY.RED;
    if (daysOut < 90)  return URGENCY.YELLOW;
    return URGENCY.GREEN;
  }

  _graceFor(rec) {
    if (this._graceOverrides.has(rec.typeCode)) return this._graceOverrides.get(rec.typeCode);
    if (this._graceOverrides.has(rec.type)) return this._graceOverrides.get(rec.type);
    if (rec.typeCode && DOC_CATALOG[rec.typeCode] &&
        DOC_CATALOG[rec.typeCode].graceDays !== undefined) {
      return DOC_CATALOG[rec.typeCode].graceDays;
    }
    return DEFAULT_GRACE[rec.type] !== undefined ? DEFAULT_GRACE[rec.type] : 0;
  }

  _renderMessage(rec, daysOut) {
    const label = rec.labels && rec.labels.he ? rec.labels : { he: rec.name, en: rec.name };
    const absDays = Math.abs(daysOut);
    let heBody;
    let enBody;
    if (daysOut < 0) {
      heBody =
        `המסמך "${label.he}" (${rec.docId}) פג תוקף לפני ${absDays} ימים. ` +
        `יש לחדש לאלתר. בעלים: ${rec.owner}.`;
      enBody =
        `Document "${label.en}" (${rec.docId}) expired ${absDays} days ago. ` +
        `Immediate renewal required. Owner: ${rec.owner}.`;
    } else if (daysOut === 0) {
      heBody =
        `המסמך "${label.he}" (${rec.docId}) פג תוקף היום. ` +
        `יש לחדש באופן מיידי. בעלים: ${rec.owner}.`;
      enBody =
        `Document "${label.en}" (${rec.docId}) expires TODAY. ` +
        `Renew immediately. Owner: ${rec.owner}.`;
    } else {
      heBody =
        `המסמך "${label.he}" (${rec.docId}) יפוג בעוד ${daysOut} ימים (${rec.expiryDate}). ` +
        `יש להתחיל בתהליך חידוש. בעלים: ${rec.owner}.`;
      enBody =
        `Document "${label.en}" (${rec.docId}) expires in ${daysOut} days (${rec.expiryDate}). ` +
        `Please initiate renewal. Owner: ${rec.owner}.`;
    }
    return {
      subject: bilingualMessage({
        he: `התראת תפוגה: ${label.he}`,
        en: `Expiry alert: ${label.en}`,
      }),
      body: bilingualMessage({ he: heBody, en: enBody }),
    };
  }

  _renewalStepsFor(rec) {
    const steps = [
      { key: 'notify-owner',          he: 'עדכון בעלים ואיש קשר לחידוש', en: 'Notify owner & renewal contact' },
      { key: 'gather-documents',      he: 'איסוף מסמכים תומכים',         en: 'Gather supporting documents' },
      { key: 'submit-renewal',        he: 'הגשת בקשת חידוש',              en: 'Submit renewal application' },
      { key: 'await-issuer',          he: 'המתנה לתשובת הרשות / גוף ההסמכה', en: 'Await authority response' },
      { key: 'register-new-document', he: 'רישום המסמך החדש והקישור כ-supersedes', en: 'Register new doc and link as supersedes' },
    ];
    if (rec.type === 'insurance') {
      steps.splice(2, 0, {
        key: 'compare-quotes',
        he: 'קבלת הצעות מחיר מחברות ביטוח',
        en: 'Collect quotes from insurers',
      });
    }
    if (rec.type === 'drivers-license' || rec.typeCode === 'RISHUY_NEHIGA') {
      steps.splice(1, 0, {
        key: 'medical-clearance',
        he: 'בדיקה רפואית / טופס רופא',
        en: 'Medical clearance form',
      });
    }
    if (rec.typeCode && (rec.typeCode === 'ISO_9001' || rec.typeCode === 'ISO_14001' || rec.typeCode === 'ISO_45001')) {
      steps.splice(1, 0, {
        key: 'audit-prep',
        he: 'הכנת תיק למבדק חיצוני',
        en: 'Prepare audit file for external assessor',
      });
    }
    return steps.map((s) => Object.freeze(s));
  }

  _reportRow(rec, bucket) {
    return {
      docId: rec.docId,
      type: rec.type,
      typeCode: rec.typeCode,
      labels: rec.labels,
      owner: rec.owner,
      expiryDate: rec.expiryDate,
      critical: rec.critical,
      bucket,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  ExpiryAlertSystem,
  DOC_CATALOG,
  DOC_TYPES,
  DEFAULT_OFFSETS,
  DEFAULT_GRACE,
  STATUS,
  URGENCY,
  CHANNEL,
  LABEL,
};
