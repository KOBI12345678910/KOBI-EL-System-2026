/* ============================================================================
 * Techno-Kol Uzi Mega-ERP — Professional Certification Tracker
 * Agent Y-069 / Swarm HR / Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מעקב רישיונות והסמכות מקצועיות — מערכת HR
 *
 * DISTINCT FROM: onyx-procurement/src/manufacturing/welder-certs.js (Y-043)
 *   - welder-certs.js handles AWS D1.1 / ASME IX / EN ISO 9606 welder WPQ
 *     certs that bind to a process envelope (shop-floor operator cert).
 *   - THIS module handles **professional / statutory** licences that bind
 *     to a **person** regardless of shop-floor assignment:
 *       * רישיון מהנדס רשום        (Registrar of Engineers)
 *       * רישיון הנדסאי             (Council of Engineers & Architects)
 *       * רישיון חשמלאי             (Ministry of Energy — electrician licence)
 *       * רישיון מפעיל מנוף         (Ministry of Labor — crane operator)
 *       * היתר עבודה בגבהים         (working-at-heights permit, תקנות הבטיחות)
 *       * רישיון נהיגה כבדה         (Ministry of Transport — heavy-vehicle)
 *       * אבטחת מידע                (CISSP, CISM, CompTIA Security+, etc.)
 *       * ת.ז. בטיחותית             (site safety ID / ISO 45001 evidence)
 *       * רישיון ריתוך מקצועי       (personal trade licence — NOT the shop WPQ)
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — NEVER delete, always supersede.
 *   * addCertification() mutates nothing; it appends a new version row.
 *   * expired / revoked rows stay in the portfolio forever (audit trail).
 *   * superseded versions are linked via `supersedes` so the renewal graph
 *     is fully walkable.
 *
 * Zero dependencies: pure Node, no npm packages, no I/O except the filePath
 * string passed in (storage layer is the caller's problem).
 *
 * Bilingual: every label / status / alert exposes { he, en }.
 *
 * Legal / regulatory backbone:
 *   - חוק המהנדסים והאדריכלים, תשי"ח-1958
 *   - חוק החשמל, תשי"ד-1954 + תקנות החשמל (רישוי חשמלאים), תשמ"ה-1985
 *   - פקודת הבטיחות בעבודה [נוסח חדש], תש"ל-1970
 *   - תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007
 *   - תקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה אחרות
 *     ואתתים), תשנ"ג-1992
 *   - פקודת התעבורה — רישיון נהיגה כבד
 *   - ISO 45001 / ISO 9001 — evidence for customer audits
 * ============================================================================
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// BILINGUAL LABELS & STATUSES
// ═══════════════════════════════════════════════════════════════

const LABEL = {
  CERT: { he: 'תעודה', en: 'Certification' },
  ACTIVE: { he: 'בתוקף', en: 'Active' },
  EXPIRING: { he: 'עומד לפוג', en: 'Expiring soon' },
  EXPIRED: { he: 'פג תוקף', en: 'Expired' },
  REVOKED: { he: 'בוטל', en: 'Revoked' },
  SUPERSEDED: { he: 'הוחלף', en: 'Superseded' },
  PENDING: { he: 'ממתין לאישור', en: 'Pending' },
  VERIFIED: { he: 'אומת', en: 'Verified' },
  UNVERIFIED: { he: 'לא אומת', en: 'Unverified' },
  SUSPECT: { he: 'חשוד בזיוף', en: 'Suspected forgery' },
  GAP: { he: 'חוסר', en: 'Gap' },
  COMPLIANT: { he: 'תקין', en: 'Compliant' },
};

const STATUS = {
  ACTIVE: 'active',
  EXPIRING: 'expiring',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
  PENDING: 'pending',
};

// ═══════════════════════════════════════════════════════════════
// ISRAELI CERT CATALOG
// ═══════════════════════════════════════════════════════════════
// Keyed by internal cert-type code. renewal/registry/validity baked in.

const CERT_CATALOG = Object.freeze({
  RISHUY_MEHANDES: {
    code: 'RISHUY_MEHANDES',
    he: 'רישיון מהנדס רשום',
    en: 'Registered Engineer Licence',
    issuer: {
      he: 'רשם המהנדסים והאדריכלים — משרד העבודה',
      en: 'Registrar of Engineers & Architects — Ministry of Labor',
    },
    law: 'חוק המהנדסים והאדריכלים, תשי"ח-1958',
    validityMonths: 60,        // 5-year renewal cycle
    ceusRequired: 120,          // CEU-equivalent per cycle
    renewalLeadDays: 90,        // start process 90 days before expiry
    registryUrl: 'https://www.gov.il/he/departments/registrar-of-engineers',
    critical: true,
  },
  RISHUY_HANDASAI: {
    code: 'RISHUY_HANDASAI',
    he: 'רישיון הנדסאי',
    en: 'Certified Practical Engineer (Handasai)',
    issuer: {
      he: 'המועצה להנדסאים וטכנאים מוסמכים',
      en: 'Council for Certified Practical Engineers & Technicians',
    },
    law: 'חוק ההנדסאים והטכנאים המוסמכים, תשע"ג-2012',
    validityMonths: 60,
    ceusRequired: 60,
    renewalLeadDays: 90,
    registryUrl: 'https://www.gov.il/he/departments/council_for_engineering_technicians',
    critical: true,
  },
  RISHUY_HASHMALAI: {
    code: 'RISHUY_HASHMALAI',
    he: 'רישיון חשמלאי',
    en: 'Electrician Licence',
    issuer: {
      he: 'משרד האנרגיה — מינהל החשמל',
      en: 'Ministry of Energy — Electricity Administration',
    },
    law: 'חוק החשמל תשי"ד-1954; תקנות החשמל (רישוי חשמלאים) תשמ"ה-1985',
    validityMonths: 60,
    ceusRequired: 40,
    renewalLeadDays: 60,
    registryUrl: 'https://www.gov.il/he/departments/topics/electrician_license',
    grades: [
      { code: 'BAIT', he: 'חשמלאי בית', en: 'Domestic' },
      { code: 'MESHANI', he: 'חשמלאי מוסמך', en: 'Qualified' },
      { code: 'MATKIN', he: 'חשמלאי מתקין', en: 'Installer' },
      { code: 'MEFAKEACH', he: 'חשמלאי מפקח', en: 'Supervisor' },
      { code: 'MEHANDES', he: 'מהנדס חשמל רשום', en: 'Electrical Engineer' },
    ],
    critical: true,
  },
  RISHUY_MANOF: {
    code: 'RISHUY_MANOF',
    he: 'רישיון מפעיל מנוף',
    en: 'Crane Operator Licence',
    issuer: {
      he: 'משרד העבודה — המפקח על העבודה',
      en: 'Ministry of Labor — Commissioner of Safety at Work',
    },
    law: 'תקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה) תשנ"ג-1992',
    validityMonths: 24,         // 2-year renewal
    ceusRequired: 0,
    renewalLeadDays: 60,
    requiresMedical: true,      // annual medical exam required
    requiresPracticalExam: true,
    registryUrl: 'https://www.gov.il/he/departments/topics/crane_operator_license',
    grades: [
      { code: 'ZEROA', he: 'מנוף זרוע צריח', en: 'Tower crane' },
      { code: 'NIAD', he: 'מנוף נייד', en: 'Mobile crane' },
      { code: 'MALGAZA', he: 'מלגזה', en: 'Forklift' },
      { code: 'RAMATA', he: 'במת הרמה', en: 'Lift platform' },
    ],
    critical: true,
  },
  RISHUY_RITUCH: {
    code: 'RISHUY_RITUCH',
    he: 'רישיון ריתוך מקצועי',
    en: 'Professional Welding Licence',
    issuer: {
      he: 'מכון הריתוך הישראלי / מכון התקנים',
      en: 'Israeli Welding Institute / Standards Institution of Israel',
    },
    law: 'תקנות הבטיחות בעבודה; ת"י 1032',
    validityMonths: 36,
    ceusRequired: 16,
    renewalLeadDays: 30,
    note: {
      he: 'נפרד מ-WPQ של השופ (Y-043) — זו הסמכה אישית למקצוע',
      en: 'SEPARATE from shop WPQ (Y-043) — personal trade credential',
    },
    registryUrl: 'https://www.iwi.org.il',
    critical: false,
  },
  HETER_GOVAH: {
    code: 'HETER_GOVAH',
    he: 'היתר עבודה בגבהים',
    en: 'Working-at-Heights Permit',
    issuer: {
      he: 'משרד העבודה — גוף בודק מוסמך',
      en: 'Ministry of Labor — Accredited Training Body',
    },
    law: 'תקנות הבטיחות בעבודה (עבודה בגובה) תשס"ז-2007',
    validityMonths: 24,
    ceusRequired: 0,
    renewalLeadDays: 30,
    requiresPracticalExam: true,
    requiresMedical: true,
    registryUrl: 'https://www.gov.il/he/departments/topics/height_work',
    critical: true,
  },
  RISHUY_NEHIGA_KAVED: {
    code: 'RISHUY_NEHIGA_KAVED',
    he: 'רישיון נהיגה — רכב כבד',
    en: 'Heavy Vehicle Driving Licence',
    issuer: {
      he: 'משרד התחבורה — רשות הרישוי',
      en: 'Ministry of Transport — Licensing Authority',
    },
    law: 'פקודת התעבורה [נוסח חדש]',
    validityMonths: 60,         // 5 years <40yrs; 2 years >70yrs (approx)
    ceusRequired: 0,
    renewalLeadDays: 60,
    requiresMedical: true,
    grades: [
      { code: 'C1', he: 'C1 — עד 12 טון', en: 'C1 (up to 12t)' },
      { code: 'C', he: 'C — מעל 12 טון', en: 'C (over 12t)' },
      { code: 'CE', he: 'CE — משאית + נגרר', en: 'CE (articulated)' },
      { code: 'D', he: 'D — אוטובוס', en: 'D (bus)' },
    ],
    critical: true,
  },
  AVTACHAT_MEYDA: {
    code: 'AVTACHAT_MEYDA',
    he: 'הסמכת אבטחת מידע',
    en: 'Information Security Certification',
    issuer: {
      he: '(ISC)² / ISACA / CompTIA / EC-Council',
      en: '(ISC)² / ISACA / CompTIA / EC-Council',
    },
    law: 'voluntary (ISO 27001, customer audit evidence)',
    validityMonths: 36,
    ceusRequired: 120,          // CISSP: 120 CPEs / 3 yrs
    renewalLeadDays: 90,
    registryUrl: 'https://www.isc2.org / https://www.isaca.org',
    families: ['CISSP', 'CISM', 'Security+', 'CEH', 'CISA'],
    critical: false,
  },
  TEUDAT_ZEHUT_BETICHUTIT: {
    code: 'TEUDAT_ZEHUT_BETICHUTIT',
    he: 'ת.ז. בטיחותית',
    en: 'Site Safety ID',
    issuer: {
      he: 'הממונה על הבטיחות / מוסד הבטיחות והגיהות',
      en: 'Safety Officer / Occupational Safety & Hygiene Institute',
    },
    law: 'פקודת הבטיחות בעבודה [נוסח חדש] תש"ל-1970',
    validityMonths: 12,
    ceusRequired: 8,            // annual refresher hours
    renewalLeadDays: 30,
    critical: true,
  },
});

// ═══════════════════════════════════════════════════════════════
// ROLE → REQUIRED CERTS MATRIX
// ═══════════════════════════════════════════════════════════════

const ROLE_MATRIX = Object.freeze({
  'site-engineer': {
    he: 'מהנדס ביצוע',
    en: 'Site / Execution Engineer',
    required: ['RISHUY_MEHANDES', 'HETER_GOVAH', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: ['AVTACHAT_MEYDA'],
  },
  'shop-foreman': {
    he: 'מנהל עבודה בייצור',
    en: 'Shop Foreman',
    required: ['RISHUY_HANDASAI', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: ['HETER_GOVAH'],
  },
  'electrician': {
    he: 'חשמלאי',
    en: 'Electrician',
    required: ['RISHUY_HASHMALAI', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: ['HETER_GOVAH'],
  },
  'crane-operator': {
    he: 'מפעיל מנוף',
    en: 'Crane Operator',
    required: ['RISHUY_MANOF', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: [],
  },
  'welder-lead': {
    he: 'רתך ראשי',
    en: 'Lead Welder',
    required: ['RISHUY_RITUCH', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: ['HETER_GOVAH'],
  },
  'truck-driver': {
    he: 'נהג רכב כבד',
    en: 'Heavy-Vehicle Driver',
    required: ['RISHUY_NEHIGA_KAVED', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: [],
  },
  'it-security': {
    he: 'מנהל אבטחת מידע',
    en: 'IT Security Manager',
    required: ['AVTACHAT_MEYDA', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: [],
  },
  'heights-rigger': {
    he: 'עובד עבודות גובה',
    en: 'Heights Rigger',
    required: ['HETER_GOVAH', 'TEUDAT_ZEHUT_BETICHUTIT'],
    recommended: [],
  },
});

// ═══════════════════════════════════════════════════════════════
// PURE HELPERS (no deps)
// ═══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;

function toDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return new Date(v.getTime());
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d) {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  const d1 = startOfUtcDay(toDate(a));
  const d2 = startOfUtcDay(toDate(b));
  return Math.round((d2.getTime() - d1.getTime()) / MS_PER_DAY);
}

function addMonths(date, months) {
  const d = new Date(toDate(date).getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function iso(d) {
  const x = toDate(d);
  if (!x) return null;
  return x.toISOString().slice(0, 10);
}

function cloneJSON(x) {
  return JSON.parse(JSON.stringify(x));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inPeriod(date, period) {
  if (!period) return true;
  const d = toDate(date);
  if (!d) return false;
  if (period.start && d < toDate(period.start)) return false;
  if (period.end && d > toDate(period.end)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// CertTracker CLASS
// ═══════════════════════════════════════════════════════════════

class CertTracker {
  constructor(opts = {}) {
    /** @type {Map<string, object[]>} employeeId -> ordered cert list */
    this._byEmployee = new Map();
    /** @type {Map<string, object>} certId -> cert ref (for quick lookup) */
    this._byId = new Map();
    /** @type {Array<object>} cost ledger (exam / course spend) */
    this._costLedger = [];
    /** Clock override for deterministic tests. */
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();
    /** Optional authenticity registry stub: Map<issuerName, Set<certNumber>> */
    this._authorityRegistry = opts.authorityRegistry || new Map();
  }

  // ─────────────────────────────────────────────────────────────
  // addCertification — append-only
  // ─────────────────────────────────────────────────────────────
  addCertification(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('addCertification: input required');
    }
    const {
      employeeId,
      name,
      issuer,
      certNumber,
      issueDate,
      expiryDate,
      renewalProcess,
      ceusRequired,
      filePath,
      typeCode,               // optional — maps into CERT_CATALOG
      grade,                  // optional sub-category (e.g. electrician grade)
      supersedes,             // id of previous cert this one replaces
      cost,                   // optional { exam, course, currency }
      meta,                   // freeform bag for customer-audit extras
    } = input;

    if (!employeeId) throw new Error('addCertification: employeeId required');
    if (!name) throw new Error('addCertification: name required');
    if (!issueDate) throw new Error('addCertification: issueDate required');

    const catalog = typeCode ? CERT_CATALOG[typeCode] : null;

    // If no explicit expiryDate but catalog gives validityMonths, derive it.
    let resolvedExpiry = expiryDate ? toDate(expiryDate) : null;
    if (!resolvedExpiry && catalog && catalog.validityMonths) {
      resolvedExpiry = addMonths(issueDate, catalog.validityMonths);
    }

    const id = uid('cert');
    const cert = {
      id,
      employeeId,
      typeCode: typeCode || null,
      name,
      labels: catalog ? { he: catalog.he, en: catalog.en } : { he: name, en: name },
      issuer: issuer || (catalog ? catalog.issuer : null),
      certNumber: certNumber || null,
      issueDate: iso(issueDate),
      expiryDate: resolvedExpiry ? iso(resolvedExpiry) : null,
      renewalProcess: renewalProcess || (catalog ? catalog.law : null),
      ceusRequired: Number.isFinite(ceusRequired)
        ? ceusRequired
        : (catalog ? catalog.ceusRequired : 0),
      ceusCompleted: 0,
      filePath: filePath || null,
      grade: grade || null,
      status: STATUS.ACTIVE,
      verificationStatus: 'unverified',
      supersedes: supersedes || null,
      supersededBy: null,
      createdAt: this._now().toISOString(),
      history: [],
      meta: meta ? cloneJSON(meta) : {},
    };

    // Supersede link — never delete prior row, just mark the chain.
    if (supersedes) {
      const prev = this._byId.get(supersedes);
      if (prev) {
        prev.status = STATUS.SUPERSEDED;
        prev.supersededBy = id;
        prev.history.push({
          at: cert.createdAt,
          action: 'superseded',
          by: id,
        });
      }
    }

    this._byId.set(id, cert);
    const list = this._byEmployee.get(employeeId) || [];
    list.push(cert);
    this._byEmployee.set(employeeId, list);

    // cost tracking
    if (cost && (cost.exam || cost.course)) {
      this._costLedger.push({
        id: uid('cost'),
        certId: id,
        employeeId,
        typeCode: typeCode || null,
        exam: Number(cost.exam) || 0,
        course: Number(cost.course) || 0,
        currency: cost.currency || 'ILS',
        date: iso(issueDate),
      });
    }

    return cloneJSON(cert);
  }

  // ─────────────────────────────────────────────────────────────
  // listExpiring — certs expiring within N days
  // ─────────────────────────────────────────────────────────────
  listExpiring({ days = 90, asOf = null } = {}) {
    const refDate = asOf ? toDate(asOf) : this._now();
    const out = [];
    for (const cert of this._byId.values()) {
      if (cert.status !== STATUS.ACTIVE && cert.status !== STATUS.EXPIRING) continue;
      if (!cert.expiryDate) continue;
      const d = daysBetween(refDate, cert.expiryDate);
      if (d <= days) {
        const bucket = d < 0 ? 'expired' : (d <= 7 ? 'critical' : (d <= 30 ? 'urgent' : 'soon'));
        out.push({
          certId: cert.id,
          employeeId: cert.employeeId,
          name: cert.name,
          labels: cert.labels,
          expiryDate: cert.expiryDate,
          daysRemaining: d,
          bucket,
          status: d < 0 ? STATUS.EXPIRED : STATUS.EXPIRING,
          statusLabel: d < 0 ? LABEL.EXPIRED : LABEL.EXPIRING,
        });
      }
    }
    out.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // renewalReminder — graduated alert schedule
  // ─────────────────────────────────────────────────────────────
  renewalReminder({ leadDays = [90, 60, 30, 7], asOf = null } = {}) {
    const refDate = asOf ? toDate(asOf) : this._now();
    const sortedLeads = [...leadDays].sort((a, b) => b - a); // e.g. [90,60,30,7]
    const reminders = [];

    for (const cert of this._byId.values()) {
      if (cert.status !== STATUS.ACTIVE && cert.status !== STATUS.EXPIRING) continue;
      if (!cert.expiryDate) continue;
      const remaining = daysBetween(refDate, cert.expiryDate);

      // Find the smallest lead >= remaining — that is the current window.
      // Priority (critical > high > medium > low) matches the 7/30/60/90 gates.
      let tier = null;
      for (const lead of sortedLeads) {
        if (remaining <= lead) tier = lead; // keep going to find smallest
      }
      if (tier == null) continue; // outside all windows

      const priority =
        tier <= 7 ? 'critical'
        : tier <= 30 ? 'high'
        : tier <= 60 ? 'medium'
        : 'low';

      reminders.push({
        certId: cert.id,
        employeeId: cert.employeeId,
        name: cert.name,
        labels: cert.labels,
        expiryDate: cert.expiryDate,
        daysRemaining: remaining,
        leadTier: tier,
        priority,
        message: {
          he: `${cert.labels.he} של עובד ${cert.employeeId} פג בעוד ${remaining} ימים`,
          en: `${cert.labels.en} for employee ${cert.employeeId} expires in ${remaining} days`,
        },
      });
    }

    reminders.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return {
      asOf: iso(refDate),
      leadDays: sortedLeads,
      total: reminders.length,
      byPriority: {
        critical: reminders.filter(r => r.priority === 'critical').length,
        high: reminders.filter(r => r.priority === 'high').length,
        medium: reminders.filter(r => r.priority === 'medium').length,
        low: reminders.filter(r => r.priority === 'low').length,
      },
      reminders,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // complianceGap — which roles miss required certs
  // ─────────────────────────────────────────────────────────────
  complianceGap({ required, actual }) {
    // required: { employeeId: roleKey } OR { employeeId: [typeCode...] }
    // actual:   optional override. Default = pull from internal store.
    if (!required || typeof required !== 'object') {
      throw new Error('complianceGap: required {employeeId: role|[codes]} needed');
    }
    const gaps = [];
    let compliantCount = 0;
    const asOf = this._now();

    for (const [empId, roleOrCodes] of Object.entries(required)) {
      let requiredCodes;
      let roleMeta = null;
      if (Array.isArray(roleOrCodes)) {
        requiredCodes = roleOrCodes;
      } else {
        roleMeta = ROLE_MATRIX[roleOrCodes];
        requiredCodes = roleMeta ? roleMeta.required : [];
      }

      const empCerts = actual && actual[empId]
        ? actual[empId]
        : (this._byEmployee.get(empId) || []);

      const activeCodes = new Set();
      for (const c of empCerts) {
        if (!c.typeCode) continue;
        if (c.status === STATUS.SUPERSEDED) continue;
        if (c.status === STATUS.REVOKED) continue;
        if (c.expiryDate && daysBetween(asOf, c.expiryDate) < 0) continue;
        activeCodes.add(c.typeCode);
      }

      const missing = requiredCodes.filter(c => !activeCodes.has(c));
      if (missing.length === 0) {
        compliantCount++;
        continue;
      }
      gaps.push({
        employeeId: empId,
        role: typeof roleOrCodes === 'string' ? roleOrCodes : null,
        roleLabel: roleMeta ? { he: roleMeta.he, en: roleMeta.en } : null,
        requiredCodes,
        activeCodes: Array.from(activeCodes),
        missing: missing.map(code => {
          const cat = CERT_CATALOG[code];
          return cat
            ? { code, he: cat.he, en: cat.en, critical: cat.critical, law: cat.law }
            : { code, he: code, en: code, critical: false };
        }),
        severity: missing.some(m => CERT_CATALOG[m] && CERT_CATALOG[m].critical)
          ? 'blocking'
          : 'advisory',
      });
    }

    return {
      asOf: iso(asOf),
      totalEmployees: Object.keys(required).length,
      compliantCount,
      gapCount: gaps.length,
      complianceRate: round2(
        compliantCount / Math.max(1, Object.keys(required).length) * 100
      ),
      blocking: gaps.filter(g => g.severity === 'blocking').length,
      advisory: gaps.filter(g => g.severity === 'advisory').length,
      gaps,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // certRepo — full portfolio with scans/files for one employee
  // ─────────────────────────────────────────────────────────────
  certRepo(employeeId) {
    const list = this._byEmployee.get(employeeId) || [];
    const asOf = this._now();
    const enriched = list.map(c => {
      const remaining = c.expiryDate ? daysBetween(asOf, c.expiryDate) : null;
      let currentStatus = c.status;
      if (currentStatus === STATUS.ACTIVE && remaining != null) {
        if (remaining < 0) currentStatus = STATUS.EXPIRED;
        else if (remaining <= 90) currentStatus = STATUS.EXPIRING;
      }
      return {
        ...cloneJSON(c),
        currentStatus,
        daysRemaining: remaining,
      };
    });
    // sort newest-first for UI
    enriched.sort((a, b) => {
      const ai = a.issueDate || '';
      const bi = b.issueDate || '';
      return bi.localeCompare(ai);
    });
    return {
      employeeId,
      asOf: iso(asOf),
      total: enriched.length,
      active: enriched.filter(c => c.currentStatus === STATUS.ACTIVE).length,
      expiring: enriched.filter(c => c.currentStatus === STATUS.EXPIRING).length,
      expired: enriched.filter(c => c.currentStatus === STATUS.EXPIRED).length,
      superseded: enriched.filter(c => c.currentStatus === STATUS.SUPERSEDED).length,
      revoked: enriched.filter(c => c.currentStatus === STATUS.REVOKED).length,
      certs: enriched,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // verifyAuthenticity — stub against issuer registry
  // ─────────────────────────────────────────────────────────────
  verifyAuthenticity({ cert, issuer }) {
    if (!cert) throw new Error('verifyAuthenticity: cert required');
    const issuerName =
      (issuer && (typeof issuer === 'string' ? issuer : issuer.en || issuer.he)) ||
      (cert.issuer && (cert.issuer.en || cert.issuer.he || cert.issuer)) ||
      'unknown';
    const registry = this._authorityRegistry.get(issuerName);
    const number = cert.certNumber;

    let result;
    if (!registry) {
      result = {
        verified: false,
        confidence: 0,
        reason: {
          he: 'רשם היוצא אינו מחובר — דרושה בדיקה ידנית',
          en: 'Issuer registry not connected — manual check required',
        },
        source: 'offline-stub',
      };
    } else if (!number) {
      result = {
        verified: false,
        confidence: 0,
        reason: {
          he: 'אין מספר תעודה לבדיקה',
          en: 'No certificate number to check',
        },
        source: 'offline-stub',
      };
    } else if (registry.has(number)) {
      result = {
        verified: true,
        confidence: 0.99,
        reason: { he: 'נמצא ברשם הרשמי', en: 'Found in official registry' },
        source: issuerName,
      };
    } else {
      result = {
        verified: false,
        confidence: 0.95,
        reason: {
          he: 'לא נמצא ברשם — חשוד',
          en: 'Not in registry — suspect',
        },
        source: issuerName,
      };
    }

    // Persist — never overwrite, always append to history.
    const live = this._byId.get(cert.id);
    if (live) {
      live.verificationStatus = result.verified ? 'verified' : 'unverified';
      live.history.push({
        at: this._now().toISOString(),
        action: 'verify-attempt',
        result,
      });
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // costTracking — exam + course cost per employee (by period)
  // ─────────────────────────────────────────────────────────────
  costTracking(period) {
    const rows = this._costLedger.filter(r => inPeriod(r.date, period));
    const byEmp = new Map();
    let totalExam = 0;
    let totalCourse = 0;
    for (const r of rows) {
      totalExam += r.exam;
      totalCourse += r.course;
      if (!byEmp.has(r.employeeId)) {
        byEmp.set(r.employeeId, { exam: 0, course: 0, count: 0, currency: r.currency });
      }
      const acc = byEmp.get(r.employeeId);
      acc.exam += r.exam;
      acc.course += r.course;
      acc.count += 1;
    }
    const employees = Array.from(byEmp.entries()).map(([employeeId, v]) => ({
      employeeId,
      exam: round2(v.exam),
      course: round2(v.course),
      total: round2(v.exam + v.course),
      certCount: v.count,
      currency: v.currency,
      avgPerCert: round2((v.exam + v.course) / Math.max(1, v.count)),
    }));
    employees.sort((a, b) => b.total - a.total);

    return {
      period: period || { start: null, end: null },
      totalExam: round2(totalExam),
      totalCourse: round2(totalCourse),
      grandTotal: round2(totalExam + totalCourse),
      currency: employees[0] ? employees[0].currency : 'ILS',
      employeeCount: employees.length,
      certCount: rows.length,
      avgCostPerCert: round2(
        (totalExam + totalCourse) / Math.max(1, rows.length)
      ),
      employees,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // roleRequirements — required certs per job
  // ─────────────────────────────────────────────────────────────
  roleRequirements(role) {
    if (role) {
      const r = ROLE_MATRIX[role];
      if (!r) return null;
      return {
        role,
        labels: { he: r.he, en: r.en },
        required: r.required.map(code => ({ code, ...summarizeCatalog(code) })),
        recommended: r.recommended.map(code => ({ code, ...summarizeCatalog(code) })),
      };
    }
    // Return whole matrix.
    const all = {};
    for (const [k, v] of Object.entries(ROLE_MATRIX)) {
      all[k] = {
        labels: { he: v.he, en: v.en },
        required: v.required.map(code => ({ code, ...summarizeCatalog(code) })),
        recommended: v.recommended.map(code => ({ code, ...summarizeCatalog(code) })),
      };
    }
    return all;
  }

  // ─────────────────────────────────────────────────────────────
  // exportForAudit — ISO / customer-audit bundle
  // ─────────────────────────────────────────────────────────────
  exportForAudit(period) {
    const asOf = this._now();
    const allCerts = [];
    for (const cert of this._byId.values()) {
      if (!inPeriod(cert.issueDate, period)) continue;
      allCerts.push({
        id: cert.id,
        employeeId: cert.employeeId,
        type: cert.typeCode,
        name: cert.name,
        labels: cert.labels,
        issuer: cert.issuer,
        certNumber: cert.certNumber,
        issueDate: cert.issueDate,
        expiryDate: cert.expiryDate,
        status: cert.status,
        verificationStatus: cert.verificationStatus,
        filePath: cert.filePath,
        renewalProcess: cert.renewalProcess,
        history: cert.history,
      });
    }
    const summary = {
      total: allCerts.length,
      active: allCerts.filter(c => c.status === STATUS.ACTIVE).length,
      expired: allCerts.filter(c => c.status === STATUS.EXPIRED).length,
      superseded: allCerts.filter(c => c.status === STATUS.SUPERSEDED).length,
      revoked: allCerts.filter(c => c.status === STATUS.REVOKED).length,
      verified: allCerts.filter(c => c.verificationStatus === 'verified').length,
      uniqueEmployees: new Set(allCerts.map(c => c.employeeId)).size,
    };

    return {
      schema: 'techno-kol.cert-audit.v1',
      generatedAt: asOf.toISOString(),
      generatedAtIso: iso(asOf),
      period: period || { start: null, end: null },
      standards: [
        'ISO 9001:2015 §7.2 (Competence)',
        'ISO 45001:2018 §7.2 (Competence — OH&S)',
        'ISO 27001:2022 A.6.3 (Awareness / training)',
        'חוק המהנדסים והאדריכלים תשי"ח-1958',
        'תקנות החשמל (רישוי חשמלאים) תשמ"ה-1985',
        'תקנות הבטיחות (עבודה בגובה) תשס"ז-2007',
      ],
      bilingualTitle: {
        he: 'דו"ח ביקורת תעודות מקצועיות',
        en: 'Professional Certification Audit Report',
      },
      summary,
      certs: allCerts,
      roleMatrix: this.roleRequirements(),
      costSummary: this.costTracking(period),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// internal helpers exposed for tests & for external renderers
// ═══════════════════════════════════════════════════════════════

function summarizeCatalog(code) {
  const c = CERT_CATALOG[code];
  if (!c) return { he: code, en: code, validityMonths: null, critical: false };
  return {
    he: c.he,
    en: c.en,
    validityMonths: c.validityMonths,
    ceusRequired: c.ceusRequired,
    critical: c.critical,
    law: c.law || null,
    renewalLeadDays: c.renewalLeadDays,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  CertTracker,
  CERT_CATALOG,
  ROLE_MATRIX,
  LABEL,
  STATUS,
  _internals: {
    toDate,
    daysBetween,
    addMonths,
    iso,
    summarizeCatalog,
  },
};
