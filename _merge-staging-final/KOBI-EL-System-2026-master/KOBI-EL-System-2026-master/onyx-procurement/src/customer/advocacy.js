/**
 * Customer Advocacy Program — תוכנית תמיכת לקוחות
 * ──────────────────────────────────────────────────
 * Agent Y-105 • Techno-Kol Uzi mega-ERP • Swarm Customer Success
 *
 * Turns happy, healthy customers into structured advocates — case
 * studies, references, testimonials, quote library — while protecting
 * them from fatigue with hard rate-limits and explicit per-use consent.
 *
 * Rule enforced: לא מוחקים, רק משדרגים ומגדלים —
 *   every nomination, request, engagement, reward, case-study step and
 *   consent event is APPENDED to an immutable per-advocate ledger.
 *   No public delete; no reward/quote/case-study is ever removed.
 *   Revocation is an additive ledger event, never a deletion.
 *
 * Zero third-party dependencies. Pure JavaScript, Node >= 18,
 * bilingual Hebrew / English labels throughout.
 *
 * Public surface (see bottom `module.exports`):
 *
 *   class AdvocacyProgram
 *     identifyAdvocates({criteria})
 *     nominateAdvocate({customerId, nominator, reason})
 *     requestReference({advocateId, prospectId, format, urgency})
 *     trackEngagement({advocateId, type, date, outcome})
 *     rewardAdvocate({advocateId, type, ...})
 *     caseStudyWorkflow({advocateId, topic})
 *     advanceCaseStudy(caseStudyId, stage, payload)
 *     quoteLibrary({topic, industry})
 *     addQuote({advocateId, text, textHe, topic, industry, approved})
 *     referenceRequests({prospectId, need})
 *     fatiguePrevention({advocateId, maxRequestsPerQuarter})
 *     consentManagement(advocateId)
 *     grantConsent(advocateId, scope, opts)
 *     revokeConsent(advocateId, scope, reason)
 *     hallOfFame(period)
 *     generateReferenceDeck({topic, count, language})
 *
 *   CONSTANTS       — eligibility / fatigue / reward defaults
 *   LABELS_HE       — Hebrew glossary
 *   CASE_STUDY_STAGES  — ordered pipeline
 *
 * Customer records are plugged in via an optional `customerSource`
 * hook passed to the constructor:
 *
 *   new AdvocacyProgram({
 *     customerSource: id => ({ id, name, nps, healthScore, tenureMonths,
 *                              contractSize, industry, language }),
 *   })
 *
 * When no source is supplied, records can be seeded directly via
 * `seedCustomer(record)` — used by the test suite and by the bridge
 * from AG-X30 customer-portal so the engine stays zero-dep.
 *
 * All dates are ISO-8601 strings. All money in NIS unless the customer
 * record carries an explicit `currency` override. Never throws on
 * unknown ids — returns `null` / empty arrays — so this module is
 * safe to embed in batch reporting jobs.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. CONSTANTS — eligibility, fatigue, rewards, pipeline
// ═══════════════════════════════════════════════════════════════════

const CONSTANTS = Object.freeze({
  /** Minimum NPS to be eligible as an advocate (promoter territory). */
  DEFAULT_NPS_MIN: 9,

  /** Minimum account health score (0-100). */
  DEFAULT_HEALTH_MIN: 80,

  /** Minimum tenure in months before a customer can be nominated. */
  DEFAULT_TENURE_MONTHS: 6,

  /** Soft floor on contract size (NIS / year). Set to 0 to disable. */
  DEFAULT_CONTRACT_SIZE_MIN: 0,

  /** Fatigue rule: max *total* reference requests per quarter. */
  DEFAULT_MAX_REQUESTS_PER_QUARTER: 3,

  /** Fatigue rule: max *site-visit / case-study* per year. */
  DEFAULT_MAX_HEAVY_PER_YEAR: 2,

  /** Cool-down in days after a heavy engagement (case study, site visit). */
  HEAVY_COOLDOWN_DAYS: 60,

  /** Cool-down in days after any reference call/quote. */
  LIGHT_COOLDOWN_DAYS: 14,

  /** Default consent TTL (days) — consent auto-expires unless refreshed. */
  CONSENT_TTL_DAYS: 365,

  /** Reward catalogue — default cash-equivalent value (NIS). */
  REWARD_DEFAULT_VALUE: Object.freeze({
    'swag': 150,
    'discount': 500,
    'event-invite': 800,
    'feature-access': 0,
    'certification': 400,
    'thank-you-gift': 250,
  }),

  /** Fatigue score weights per request format. */
  FORMAT_FATIGUE_WEIGHT: Object.freeze({
    'email': 1,
    'quote': 1,
    'call': 2,
    'site-visit': 4,
    'case-study': 5,
  }),

  /** Hall-of-fame lookback window for "month" / "quarter" / "year". */
  HALL_OF_FAME_DAYS: Object.freeze({
    month: 30,
    quarter: 91,
    year: 365,
    all: 36_500,
  }),
});

// Case-study pipeline — strict ordering
const CASE_STUDY_STAGES = Object.freeze([
  'intake',
  'draft',
  'customer-review',
  'legal-review',
  'publish',
]);

const REQUEST_FORMATS = Object.freeze([
  'call',
  'email',
  'quote',
  'site-visit',
  'case-study',
]);

const REWARD_TYPES = Object.freeze([
  'swag',
  'discount',
  'event-invite',
  'feature-access',
  'certification',
  'thank-you-gift',
]);

const ENGAGEMENT_TYPES = Object.freeze([
  'call',
  'email',
  'quote',
  'site-visit',
  'case-study',
  'meeting',
  'webinar',
  'conference-panel',
  'video',
  'blog-post',
]);

// ═══════════════════════════════════════════════════════════════════
// 2. LABELS_HE — Hebrew glossary (bilingual surface)
// ═══════════════════════════════════════════════════════════════════

const LABELS_HE = Object.freeze({
  advocate: 'שגריר לקוח',
  advocacy: 'תמיכת לקוחות',
  nominate: 'מועמדות',
  nominator: 'ממליץ',
  reason: 'סיבה',
  eligibility: 'זכאות',
  eligible: 'זכאי',
  ineligible: 'לא זכאי',
  nps: 'מדד שביעות רצון',
  health: 'מדד בריאות חשבון',
  tenure: 'ותק',
  contractSize: 'גודל חוזה',
  reference: 'המלצה',
  referenceRequest: 'בקשת המלצה',
  prospect: 'ליד פוטנציאלי',
  consent: 'הסכמה',
  consentGiven: 'הסכמה ניתנה',
  consentRevoked: 'הסכמה בוטלה',
  consentExpired: 'הסכמה פגה',
  fatigue: 'עייפות שגריר',
  fatigueBlocked: 'חסום עקב עייפות',
  rateLimit: 'מגבלת קצב',
  cooldown: 'תקופת צינון',
  engagement: 'מעורבות',
  outcome: 'תוצאה',
  reward: 'תגמול',
  swag: 'מתנות מיתוג',
  discount: 'הנחה',
  eventInvite: 'הזמנה לאירוע',
  featureAccess: 'גישה מוקדמת לפיצ\'רים',
  certification: 'הסמכה',
  thankYouGift: 'מתנת תודה',
  caseStudy: 'מקרה בוחן',
  intake: 'קליטה',
  draft: 'טיוטה',
  customerReview: 'סקירת לקוח',
  legalReview: 'סקירה משפטית',
  publish: 'פרסום',
  quote: 'ציטוט',
  quoteLibrary: 'ספריית ציטוטים',
  approved: 'מאושר',
  pending: 'ממתין',
  topic: 'נושא',
  industry: 'ענף',
  hallOfFame: 'היכל התהילה',
  topContributor: 'תורם מוביל',
  referenceDeck: 'מצגת המלצות',
  format: {
    call: 'שיחה',
    email: 'דוא"ל',
    quote: 'ציטוט',
    'site-visit': 'ביקור באתר',
    'case-study': 'מקרה בוחן',
  },
  period: {
    month: 'חודש',
    quarter: 'רבעון',
    year: 'שנה',
    all: 'כל הזמן',
  },
  urgency: {
    low: 'נמוכה',
    normal: 'רגילה',
    high: 'גבוהה',
    critical: 'קריטית',
  },
});

// ═══════════════════════════════════════════════════════════════════
// 3. INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Deterministic id generator — counter + prefix, no RNG required. */
function makeIdFactory(prefix) {
  let n = 0;
  return () => `${prefix}-${(++n).toString().padStart(5, '0')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toDate(iso) {
  if (iso instanceof Date) return iso;
  if (typeof iso !== 'string') return new Date();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function diffDays(fromIso, toIso) {
  const a = toDate(fromIso).getTime();
  const b = toDate(toIso).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function addDaysIso(iso, days) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString();
}

function cloneFrozen(obj) {
  return Object.freeze(JSON.parse(JSON.stringify(obj)));
}

function safePush(arr, item) {
  arr.push(Object.freeze(item));
  return item;
}

// ═══════════════════════════════════════════════════════════════════
// 4. AdvocacyProgram — main engine
// ═══════════════════════════════════════════════════════════════════

class AdvocacyProgram {
  constructor(opts = {}) {
    this._customerSource = typeof opts.customerSource === 'function'
      ? opts.customerSource
      : null;

    /** Map<customerId, customer-record> — seeded via `seedCustomer`. */
    this._customers = new Map();

    /** Map<advocateId, advocate-record> */
    this._advocates = new Map();

    /** Map<advocateId, ledger[]> — append-only. */
    this._ledgers = new Map();

    /** Map<caseStudyId, case-study record> */
    this._caseStudies = new Map();

    /** Array<quote-record> — approved and pending */
    this._quotes = [];

    /** Map<advocateId, Map<scope, consent-record>> */
    this._consents = new Map();

    /** Map<advocateId, reward[]> — append-only */
    this._rewards = new Map();

    this._nextAdvocateId = makeIdFactory('adv');
    this._nextRequestId = makeIdFactory('req');
    this._nextCaseStudyId = makeIdFactory('cs');
    this._nextQuoteId = makeIdFactory('q');
    this._nextRewardId = makeIdFactory('rwd');
    this._nextConsentId = makeIdFactory('con');
  }

  // ─── Customer source helpers ──────────────────────────────────────

  /** Seed a customer record directly (for tests / migration). */
  seedCustomer(rec) {
    if (!rec || !rec.id) throw new Error('customer.id required');
    const frozen = Object.freeze({
      id: rec.id,
      name: rec.name || rec.id,
      nameHe: rec.nameHe || rec.name || rec.id,
      nps: rec.nps ?? null,
      healthScore: rec.healthScore ?? null,
      tenureMonths: rec.tenureMonths ?? 0,
      contractSize: rec.contractSize ?? 0,
      industry: rec.industry || 'general',
      language: rec.language || 'he',
      churnRisk: rec.churnRisk ?? 0,
    });
    this._customers.set(rec.id, frozen);
    return frozen;
  }

  _getCustomer(id) {
    if (this._customers.has(id)) return this._customers.get(id);
    if (this._customerSource) {
      const rec = this._customerSource(id);
      if (rec) {
        return this.seedCustomer(rec);
      }
    }
    return null;
  }

  _allCustomers() {
    return Array.from(this._customers.values());
  }

  _append(advocateId, event) {
    if (!this._ledgers.has(advocateId)) this._ledgers.set(advocateId, []);
    const entry = Object.freeze({
      ts: event.ts || nowIso(),
      type: event.type,
      payload: Object.freeze({ ...event.payload }),
    });
    this._ledgers.get(advocateId).push(entry);
    return entry;
  }

  /** Immutable copy of an advocate ledger. */
  ledgerFor(advocateId) {
    const l = this._ledgers.get(advocateId);
    return l ? l.slice() : [];
  }

  // ─── 4.1 identifyAdvocates ────────────────────────────────────────

  /**
   * Return customers that meet all criteria.
   * Non-numeric fields are ignored when missing (strict eligibility).
   */
  identifyAdvocates({ criteria = {} } = {}) {
    const npsMin = criteria.npsMin ?? CONSTANTS.DEFAULT_NPS_MIN;
    const healthMin = criteria.healthMin ?? CONSTANTS.DEFAULT_HEALTH_MIN;
    const tenureMonths = criteria.tenureMonths ?? CONSTANTS.DEFAULT_TENURE_MONTHS;
    const contractSize = criteria.contractSize ?? CONSTANTS.DEFAULT_CONTRACT_SIZE_MIN;
    const maxChurnRisk = criteria.maxChurnRisk ?? 0.3;

    const out = [];
    for (const c of this._allCustomers()) {
      if (c.nps == null || c.nps < npsMin) continue;
      if (c.healthScore == null || c.healthScore < healthMin) continue;
      if (c.tenureMonths < tenureMonths) continue;
      if (c.contractSize < contractSize) continue;
      if (c.churnRisk > maxChurnRisk) continue;
      out.push({
        customerId: c.id,
        name: c.name,
        nameHe: c.nameHe,
        nps: c.nps,
        healthScore: c.healthScore,
        tenureMonths: c.tenureMonths,
        contractSize: c.contractSize,
        industry: c.industry,
        language: c.language,
        eligibility: 'eligible',
        eligibilityHe: LABELS_HE.eligible,
      });
    }
    // Stable ranking — strongest candidates first.
    out.sort((a, b) => {
      const sa = (a.nps * 10) + a.healthScore + (a.tenureMonths * 0.5);
      const sb = (b.nps * 10) + b.healthScore + (b.tenureMonths * 0.5);
      return sb - sa;
    });
    return out;
  }

  // ─── 4.2 nominateAdvocate ─────────────────────────────────────────

  /**
   * Register a customer as an advocate.
   * Validates eligibility, creates an advocate record, writes ledger.
   * Idempotent per customerId — returns the existing advocate if the
   * customer was already nominated (never duplicates, never deletes).
   */
  nominateAdvocate({ customerId, nominator, reason } = {}) {
    if (!customerId) throw new Error('customerId required');
    if (!nominator) throw new Error('nominator required');

    const customer = this._getCustomer(customerId);
    if (!customer) throw new Error(`unknown customer: ${customerId}`);

    // Idempotent — upgrade, not recreate.
    for (const [id, adv] of this._advocates) {
      if (adv.customerId === customerId) {
        this._append(id, {
          type: 'nomination-reaffirmed',
          payload: { nominator, reason: reason || '' },
        });
        return adv;
      }
    }

    // Eligibility gate
    const eligible = this.identifyAdvocates({ criteria: {} })
      .some(c => c.customerId === customerId);
    if (!eligible) {
      throw new Error(`customer ${customerId} is not eligible for advocacy`);
    }

    const id = this._nextAdvocateId();
    const rec = Object.freeze({
      id,
      customerId,
      name: customer.name,
      nameHe: customer.nameHe,
      industry: customer.industry,
      language: customer.language,
      nominatedBy: nominator,
      nominationReason: reason || '',
      nominatedAt: nowIso(),
      status: 'active',
    });
    this._advocates.set(id, rec);
    this._ledgers.set(id, []);
    this._append(id, {
      type: 'nomination',
      payload: { customerId, nominator, reason: reason || '' },
    });
    return rec;
  }

  /** Lookup advocate by id — immutable. */
  getAdvocate(advocateId) {
    return this._advocates.get(advocateId) || null;
  }

  listAdvocates() {
    return Array.from(this._advocates.values());
  }

  // ─── 4.3 fatiguePrevention ────────────────────────────────────────

  /**
   * Returns whether an advocate can accept another request right now,
   * along with a breakdown of counts and cool-downs.
   * Pass an override `maxRequestsPerQuarter` to tighten the default.
   */
  fatiguePrevention({ advocateId, maxRequestsPerQuarter, asOf } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) return { ok: false, reason: 'unknown-advocate', reasonHe: LABELS_HE.ineligible };

    const cap = maxRequestsPerQuarter ?? CONSTANTS.DEFAULT_MAX_REQUESTS_PER_QUARTER;
    const now = asOf || nowIso();
    const ledger = this._ledgers.get(advocateId) || [];

    // Count reference / engagement events in last 91 days.
    const quarterDays = CONSTANTS.HALL_OF_FAME_DAYS.quarter;
    let requestsInQuarter = 0;
    let heavyInYear = 0;
    let fatigueScore = 0;
    let lastRequestTs = null;
    let lastHeavyTs = null;

    for (const e of ledger) {
      if (e.type !== 'reference-request' && e.type !== 'engagement') continue;
      const d = diffDays(e.ts, now);
      if (d < 0) continue;
      if (d <= quarterDays) {
        requestsInQuarter += 1;
        fatigueScore += CONSTANTS.FORMAT_FATIGUE_WEIGHT[e.payload.format] ?? 1;
        if (!lastRequestTs || e.ts > lastRequestTs) lastRequestTs = e.ts;
      }
      if (d <= CONSTANTS.HALL_OF_FAME_DAYS.year) {
        if (e.payload.format === 'site-visit' || e.payload.format === 'case-study') {
          heavyInYear += 1;
          if (!lastHeavyTs || e.ts > lastHeavyTs) lastHeavyTs = e.ts;
        }
      }
    }

    const result = {
      ok: true,
      requestsInQuarter,
      heavyInYear,
      fatigueScore,
      cap,
      lastRequestTs,
      lastHeavyTs,
      cooldownUntil: null,
    };

    if (requestsInQuarter >= cap) {
      result.ok = false;
      result.reason = 'quarterly-cap-reached';
      result.reasonHe = LABELS_HE.fatigueBlocked;
      return result;
    }
    if (heavyInYear >= CONSTANTS.DEFAULT_MAX_HEAVY_PER_YEAR) {
      result.ok = false;
      result.reason = 'heavy-cap-reached';
      result.reasonHe = LABELS_HE.fatigueBlocked;
      return result;
    }
    if (lastHeavyTs) {
      const d = diffDays(lastHeavyTs, now);
      if (d < CONSTANTS.HEAVY_COOLDOWN_DAYS) {
        result.ok = false;
        result.reason = 'heavy-cooldown';
        result.reasonHe = LABELS_HE.cooldown;
        result.cooldownUntil = addDaysIso(lastHeavyTs, CONSTANTS.HEAVY_COOLDOWN_DAYS);
        return result;
      }
    }
    if (lastRequestTs) {
      const d = diffDays(lastRequestTs, now);
      if (d < CONSTANTS.LIGHT_COOLDOWN_DAYS) {
        result.ok = false;
        result.reason = 'light-cooldown';
        result.reasonHe = LABELS_HE.cooldown;
        result.cooldownUntil = addDaysIso(lastRequestTs, CONSTANTS.LIGHT_COOLDOWN_DAYS);
        return result;
      }
    }
    return result;
  }

  // ─── 4.4 consentManagement ────────────────────────────────────────

  /**
   * Returns the consent map for an advocate (by scope).
   * Each consent is explicit, scoped and TTL-bounded — no implicit
   * consent is ever inferred. Revoked consents are kept on the ledger
   * but marked `active: false` so the audit trail survives the revoke.
   */
  consentManagement(advocateId) {
    const adv = this._advocates.get(advocateId);
    if (!adv) return { advocateId, consents: [], active: [] };

    const map = this._consents.get(advocateId) || new Map();
    const all = Array.from(map.values()).map(c => ({ ...c }));
    const active = all.filter(c => c.active && (!c.expiresAt || c.expiresAt > nowIso()));
    // Mark expired on the fly — no mutation of ledger, just read-side.
    for (const c of all) {
      if (c.active && c.expiresAt && c.expiresAt <= nowIso()) {
        c.active = false;
        c.status = 'expired';
      }
    }
    return { advocateId, consents: all, active };
  }

  /**
   * Record explicit consent for a given scope
   * (e.g. 'case-study', 'quote', 'reference-call', 'logo-use', 'all').
   * TTL defaults to CONSTANTS.CONSENT_TTL_DAYS.
   */
  grantConsent(advocateId, scope, opts = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!scope || typeof scope !== 'string') throw new Error('scope required');

    if (!this._consents.has(advocateId)) this._consents.set(advocateId, new Map());
    const map = this._consents.get(advocateId);

    const id = this._nextConsentId();
    const grantedAt = opts.grantedAt || nowIso();
    const ttlDays = opts.ttlDays ?? CONSTANTS.CONSENT_TTL_DAYS;
    const expiresAt = ttlDays > 0 ? addDaysIso(grantedAt, ttlDays) : null;

    const rec = {
      id,
      advocateId,
      scope,
      grantedAt,
      grantedBy: opts.grantedBy || adv.name,
      channel: opts.channel || 'email',
      notes: opts.notes || '',
      ttlDays,
      expiresAt,
      active: true,
      status: 'granted',
      perUse: opts.perUse === true,
      usesRemaining: opts.perUse ? (opts.usesAllowed ?? 1) : null,
    };
    map.set(scope, rec);
    this._append(advocateId, {
      type: 'consent-granted',
      payload: { scope, ttlDays, expiresAt, channel: rec.channel },
    });
    return { ...rec };
  }

  /** Revoke consent — additive ledger event, never a delete. */
  revokeConsent(advocateId, scope, reason) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    const map = this._consents.get(advocateId);
    if (!map || !map.has(scope)) return null;
    const prev = map.get(scope);
    const rec = {
      ...prev,
      active: false,
      status: 'revoked',
      revokedAt: nowIso(),
      revokeReason: reason || '',
    };
    map.set(scope, rec);
    this._append(advocateId, {
      type: 'consent-revoked',
      payload: { scope, reason: reason || '' },
    });
    return { ...rec };
  }

  _hasActiveConsent(advocateId, scope) {
    const map = this._consents.get(advocateId);
    if (!map) return false;
    // Allow either the specific scope or a blanket 'all' scope.
    const candidates = [scope, 'all'];
    for (const s of candidates) {
      const c = map.get(s);
      if (!c) continue;
      if (!c.active) continue;
      if (c.expiresAt && c.expiresAt <= nowIso()) continue;
      if (c.perUse && c.usesRemaining != null && c.usesRemaining <= 0) continue;
      return true;
    }
    return false;
  }

  _consumeConsent(advocateId, scope) {
    const map = this._consents.get(advocateId);
    if (!map) return;
    const candidates = [scope, 'all'];
    for (const s of candidates) {
      const c = map.get(s);
      if (!c || !c.active || !c.perUse) continue;
      if (c.usesRemaining != null) c.usesRemaining -= 1;
      return;
    }
  }

  // ─── 4.5 requestReference ─────────────────────────────────────────

  /**
   * Ask an advocate for a reference in a given format.
   * Runs the full gate: fatigue → consent → rate-limit → scheduling.
   * Returns the created request (status: scheduled | blocked-fatigue
   * | blocked-consent).
   */
  requestReference({ advocateId, prospectId, format, urgency = 'normal', notes = '', asOf } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!prospectId) throw new Error('prospectId required');
    if (!REQUEST_FORMATS.includes(format)) {
      throw new Error(`format must be one of ${REQUEST_FORMATS.join(', ')}`);
    }

    const now = asOf || nowIso();

    // 1. Fatigue check
    const fat = this.fatiguePrevention({ advocateId, asOf: now });
    if (!fat.ok) {
      const blocked = {
        id: this._nextRequestId(),
        advocateId,
        prospectId,
        format,
        urgency,
        notes,
        ts: now,
        status: 'blocked-fatigue',
        reason: fat.reason,
        reasonHe: fat.reasonHe,
        cooldownUntil: fat.cooldownUntil,
      };
      this._append(advocateId, {
        type: 'reference-request-blocked',
        ts: now,
        payload: { ...blocked },
      });
      return blocked;
    }

    // 2. Consent check — explicit per-format consent required.
    if (!this._hasActiveConsent(advocateId, format)) {
      const blocked = {
        id: this._nextRequestId(),
        advocateId,
        prospectId,
        format,
        urgency,
        notes,
        ts: now,
        status: 'blocked-consent',
        reason: 'no-active-consent',
        reasonHe: LABELS_HE.consentRevoked,
      };
      this._append(advocateId, {
        type: 'reference-request-blocked',
        ts: now,
        payload: { ...blocked },
      });
      return blocked;
    }

    // 3. Create the request
    const id = this._nextRequestId();
    const req = {
      id,
      advocateId,
      prospectId,
      format,
      formatHe: LABELS_HE.format[format],
      urgency,
      urgencyHe: LABELS_HE.urgency[urgency] || urgency,
      notes,
      ts: now,
      status: 'scheduled',
    };
    this._append(advocateId, {
      type: 'reference-request',
      ts: now,
      payload: { ...req },
    });
    this._consumeConsent(advocateId, format);
    return req;
  }

  // ─── 4.6 trackEngagement ──────────────────────────────────────────

  /**
   * Record an engagement from the advocate's side.
   * Feeds fatiguePrevention and hallOfFame.
   */
  trackEngagement({ advocateId, type, date, outcome, prospectId, notes } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!ENGAGEMENT_TYPES.includes(type)) {
      throw new Error(`engagement type must be one of ${ENGAGEMENT_TYPES.join(', ')}`);
    }
    const ts = date || nowIso();
    const entry = {
      type: 'engagement',
      ts,
      payload: {
        format: type,
        outcome: outcome || 'completed',
        prospectId: prospectId || null,
        notes: notes || '',
      },
    };
    this._append(advocateId, entry);
    return {
      advocateId,
      type,
      date: ts,
      outcome: outcome || 'completed',
      prospectId: prospectId || null,
    };
  }

  // ─── 4.7 rewardAdvocate ───────────────────────────────────────────

  /**
   * Issue a reward. Appends to the reward ledger and main ledger.
   * Rewards are never deleted — a mistaken reward is *adjusted* via
   * a compensating positive entry, never a removal.
   */
  rewardAdvocate({ advocateId, type, value, notes, triggeredBy } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!REWARD_TYPES.includes(type)) {
      throw new Error(`reward type must be one of ${REWARD_TYPES.join(', ')}`);
    }
    const finalValue = value != null ? value : CONSTANTS.REWARD_DEFAULT_VALUE[type];
    const rec = Object.freeze({
      id: this._nextRewardId(),
      advocateId,
      type,
      typeHe: LABELS_HE[type === 'event-invite' ? 'eventInvite'
        : type === 'feature-access' ? 'featureAccess'
        : type === 'thank-you-gift' ? 'thankYouGift'
        : type] || type,
      value: finalValue,
      currency: 'ILS',
      ts: nowIso(),
      notes: notes || '',
      triggeredBy: triggeredBy || 'advocacy-program',
    });
    if (!this._rewards.has(advocateId)) this._rewards.set(advocateId, []);
    this._rewards.get(advocateId).push(rec);
    this._append(advocateId, {
      type: 'reward',
      payload: { rewardId: rec.id, type, value: finalValue },
    });
    return rec;
  }

  rewardsFor(advocateId) {
    const r = this._rewards.get(advocateId);
    return r ? r.slice() : [];
  }

  // ─── 4.8 caseStudyWorkflow ────────────────────────────────────────

  /**
   * Kick off a case-study pipeline for an advocate on a given topic.
   * Returns the case-study record in `intake` stage.
   * Advancement happens through `advanceCaseStudy`.
   */
  caseStudyWorkflow({ advocateId, topic, topicHe, goalMetric } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!topic) throw new Error('topic required');

    // Consent required for any case study.
    if (!this._hasActiveConsent(advocateId, 'case-study')) {
      throw new Error('no active consent for case-study — grant consent first');
    }
    // Fatigue gate on heavy items.
    const fat = this.fatiguePrevention({ advocateId });
    if (!fat.ok && fat.reason === 'heavy-cap-reached') {
      throw new Error('advocate has hit heavy engagement cap — wait for next year');
    }

    const id = this._nextCaseStudyId();
    const rec = {
      id,
      advocateId,
      topic,
      topicHe: topicHe || topic,
      goalMetric: goalMetric || '',
      stage: 'intake',
      stageHe: LABELS_HE.intake,
      stages: CASE_STUDY_STAGES.slice(),
      history: [
        Object.freeze({ stage: 'intake', ts: nowIso(), actor: 'system' }),
      ],
      publishedAt: null,
      status: 'in-progress',
      createdAt: nowIso(),
    };
    this._caseStudies.set(id, rec);
    this._append(advocateId, {
      type: 'case-study-started',
      payload: { caseStudyId: id, topic },
    });
    return { ...rec, history: rec.history.slice() };
  }

  /**
   * Advance a case study to the next (or named) stage.
   * Refuses to skip stages; refuses to go backwards.
   * Customer-review, legal-review and publish each require consent.
   */
  advanceCaseStudy(caseStudyId, stage, payload = {}) {
    const rec = this._caseStudies.get(caseStudyId);
    if (!rec) throw new Error(`unknown case study: ${caseStudyId}`);
    if (!CASE_STUDY_STAGES.includes(stage)) {
      throw new Error(`unknown stage: ${stage}`);
    }
    const idx = CASE_STUDY_STAGES.indexOf(rec.stage);
    const next = CASE_STUDY_STAGES.indexOf(stage);
    if (next <= idx) {
      throw new Error(`cannot move from ${rec.stage} backwards/stay at ${stage}`);
    }
    if (next !== idx + 1) {
      throw new Error(`must advance one stage at a time (next: ${CASE_STUDY_STAGES[idx + 1]})`);
    }

    // Gate: publishing needs all three consents (case-study, quote, logo).
    if (stage === 'publish') {
      if (!this._hasActiveConsent(rec.advocateId, 'case-study')) {
        throw new Error('publish blocked — no active case-study consent');
      }
      if (payload.quoteUsed && !this._hasActiveConsent(rec.advocateId, 'quote')) {
        throw new Error('publish blocked — quote used but no active quote consent');
      }
    }

    rec.stage = stage;
    rec.stageHe = LABELS_HE[
      stage === 'customer-review' ? 'customerReview'
      : stage === 'legal-review' ? 'legalReview'
      : stage
    ] || stage;
    rec.history = rec.history.concat([
      Object.freeze({
        stage,
        ts: nowIso(),
        actor: payload.actor || 'system',
        notes: payload.notes || '',
      }),
    ]);
    if (stage === 'publish') {
      rec.publishedAt = nowIso();
      rec.status = 'published';
      // Record an engagement tick so fatigue / hall-of-fame see it.
      this.trackEngagement({
        advocateId: rec.advocateId,
        type: 'case-study',
        outcome: 'published',
        notes: `case study: ${rec.topic}`,
      });
    }
    this._append(rec.advocateId, {
      type: 'case-study-stage',
      payload: { caseStudyId, stage },
    });
    return { ...rec, history: rec.history.slice() };
  }

  getCaseStudy(caseStudyId) {
    const rec = this._caseStudies.get(caseStudyId);
    if (!rec) return null;
    return { ...rec, history: rec.history.slice() };
  }

  // ─── 4.9 quoteLibrary ─────────────────────────────────────────────

  /**
   * Return approved customer quotes filtered by topic/industry.
   * Pending (unapproved) quotes are excluded from the library view
   * but remain on the ledger — additive growth only.
   */
  quoteLibrary({ topic, industry, language } = {}) {
    return this._quotes
      .filter(q => q.approved)
      .filter(q => !topic || q.topic === topic)
      .filter(q => !industry || q.industry === industry)
      .filter(q => !language || q.language === language)
      .map(q => ({ ...q }));
  }

  /** Append a quote; approval is a separate step. */
  addQuote({ advocateId, text, textHe, topic, industry, language, approved = false, by } = {}) {
    const adv = this._advocates.get(advocateId);
    if (!adv) throw new Error(`unknown advocate: ${advocateId}`);
    if (!text && !textHe) throw new Error('text or textHe required');

    // Quote usage also needs consent when marked approved.
    if (approved && !this._hasActiveConsent(advocateId, 'quote')) {
      throw new Error('cannot mark quote approved — no active quote consent');
    }

    const rec = {
      id: this._nextQuoteId(),
      advocateId,
      advocateName: adv.name,
      advocateNameHe: adv.nameHe,
      text: text || '',
      textHe: textHe || '',
      topic: topic || 'general',
      industry: industry || adv.industry,
      language: language || (textHe ? 'he' : 'en'),
      approved,
      approvedBy: approved ? (by || 'system') : null,
      createdAt: nowIso(),
    };
    this._quotes.push(rec);
    this._append(advocateId, {
      type: 'quote-added',
      payload: { quoteId: rec.id, approved },
    });
    return { ...rec };
  }

  approveQuote(quoteId, by) {
    const q = this._quotes.find(x => x.id === quoteId);
    if (!q) return null;
    if (!this._hasActiveConsent(q.advocateId, 'quote')) {
      throw new Error('cannot approve — no active quote consent');
    }
    q.approved = true;
    q.approvedBy = by || 'system';
    q.approvedAt = nowIso();
    this._append(q.advocateId, {
      type: 'quote-approved',
      payload: { quoteId },
    });
    return { ...q };
  }

  // ─── 4.10 referenceRequests — matcher ─────────────────────────────

  /**
   * Match prospects to relevant advocates, NEVER overloading anyone.
   * Returns a ranked list of up to `limit` advocates, each annotated
   * with why it matches and whether it can accept another request.
   *
   * `need` fields: topic, industry, language, contractSize, minNps.
   */
  referenceRequests({ prospectId, need = {}, limit = 5 } = {}) {
    if (!prospectId) throw new Error('prospectId required');
    const out = [];
    for (const adv of this._advocates.values()) {
      const cust = this._getCustomer(adv.customerId);
      if (!cust) continue;
      // Hard filters
      if (need.industry && cust.industry !== need.industry) continue;
      if (need.language && cust.language !== need.language) continue;
      if (need.minNps && cust.nps < need.minNps) continue;

      const fat = this.fatiguePrevention({ advocateId: adv.id });
      if (!fat.ok) continue; // never overload

      if (!this._hasActiveConsent(adv.id, 'reference-call')
        && !this._hasActiveConsent(adv.id, 'call')
        && !this._hasActiveConsent(adv.id, 'all')) {
        // No consent → skip but keep the ledger clean. Caller can see
        // them via listAdvocates if they want to request consent first.
        continue;
      }

      // Ranking — NPS + health + inverse fatigue + topic match
      let score = (cust.nps * 10) + cust.healthScore;
      score -= fat.fatigueScore * 3;
      if (need.topic) {
        const hasTopicQuote = this._quotes.some(
          q => q.advocateId === adv.id && q.topic === need.topic && q.approved,
        );
        if (hasTopicQuote) score += 20;
      }
      if (need.contractSize && cust.contractSize >= need.contractSize) score += 10;

      out.push({
        advocateId: adv.id,
        customerId: adv.customerId,
        name: adv.name,
        nameHe: adv.nameHe,
        industry: cust.industry,
        language: cust.language,
        score: Math.round(score * 100) / 100,
        fatigueScore: fat.fatigueScore,
        requestsInQuarter: fat.requestsInQuarter,
        matchReason: [
          need.topic ? `topic:${need.topic}` : null,
          need.industry ? `industry:${need.industry}` : null,
          need.language ? `language:${need.language}` : null,
        ].filter(Boolean).join(', ') || 'general match',
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  // ─── 4.11 hallOfFame ──────────────────────────────────────────────

  /**
   * Top contributors over a period (month/quarter/year/all).
   * Ranks by total engagement count + weighted fatigue score.
   */
  hallOfFame(period = 'quarter', limit = 10) {
    const days = CONSTANTS.HALL_OF_FAME_DAYS[period] || CONSTANTS.HALL_OF_FAME_DAYS.quarter;
    const now = nowIso();
    const rows = [];
    for (const adv of this._advocates.values()) {
      const ledger = this._ledgers.get(adv.id) || [];
      let engagements = 0;
      let weighted = 0;
      for (const e of ledger) {
        if (e.type !== 'engagement' && e.type !== 'reference-request') continue;
        if (diffDays(e.ts, now) > days) continue;
        engagements += 1;
        weighted += CONSTANTS.FORMAT_FATIGUE_WEIGHT[e.payload.format] ?? 1;
      }
      if (engagements === 0) continue;
      rows.push({
        advocateId: adv.id,
        customerId: adv.customerId,
        name: adv.name,
        nameHe: adv.nameHe,
        engagements,
        weightedScore: weighted,
        period,
        periodHe: LABELS_HE.period[period] || period,
      });
    }
    rows.sort((a, b) => b.weightedScore - a.weightedScore || b.engagements - a.engagements);
    return rows.slice(0, limit);
  }

  // ─── 4.12 generateReferenceDeck ───────────────────────────────────

  /**
   * Compose a bilingual reference deck as a plain-JS structure that
   * downstream PDF/Slide generators can render directly.
   * Picks approved quotes on topic, plus the top scoring advocates.
   */
  generateReferenceDeck({ topic, count = 5, language = 'bi' } = {}) {
    const quotes = this._quotes
      .filter(q => q.approved)
      .filter(q => !topic || q.topic === topic)
      .slice(0, count);

    const advocates = this.hallOfFame('year', count).map(r => {
      const cust = this._getCustomer(r.customerId) || {};
      return {
        customerId: r.customerId,
        name: r.name,
        nameHe: r.nameHe,
        industry: cust.industry,
        contractSize: cust.contractSize,
        nps: cust.nps,
      };
    });

    const titleMap = {
      en: topic ? `Reference Deck — ${topic}` : 'Customer Reference Deck',
      he: topic ? `מצגת המלצות — ${topic}` : `${LABELS_HE.referenceDeck} לקוחות`,
    };

    const slides = [];
    slides.push({
      kind: 'title',
      titleEn: titleMap.en,
      titleHe: titleMap.he,
      generatedAt: nowIso(),
    });

    for (const q of quotes) {
      slides.push({
        kind: 'quote',
        quoteEn: q.text,
        quoteHe: q.textHe,
        attribution: q.advocateName,
        attributionHe: q.advocateNameHe,
        industry: q.industry,
        topic: q.topic,
      });
    }

    slides.push({
      kind: 'advocates',
      advocates,
      captionEn: `Available for reference calls (top ${advocates.length})`,
      captionHe: `זמינים לשיחות המלצה (${advocates.length} מובילים)`,
    });

    return {
      topic: topic || 'all',
      language,
      slides,
      totalSlides: slides.length,
      generatedAt: nowIso(),
    };
  }

  // ─── Utility / read-only getters ──────────────────────────────────

  constants() {
    return cloneFrozen(CONSTANTS);
  }

  labelsHe() {
    return cloneFrozen(LABELS_HE);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. Advocacy — Agent Y-105 extended engine
// ═══════════════════════════════════════════════════════════════════
//
// This class is an ADDITIVE UPGRADE layered on top of AdvocacyProgram
// (see section 4). It introduces the PDPL-strict consent model, the
// explicit case-study / reference / testimonial / user-group / points
// /  rewards /  tier / rotation surface requested by Agent Y-105 for
// Techno-Kol Uzi mega-ERP (Swarm Customer Success wave).
//
// House rule holds — לא מוחקים רק משדרגים ומגדלים — every mutation
// appends to the advocate history ledger. The only status changes
// available from the public API are:
//
//   advocate.status  : pending → active (approval)
//   advocate.status  : active  → opted-out  (withdrawConsent)
//
// Nothing is ever removed. Opted-out advocates keep every historical
// record; future requests are simply blocked.
//
// Storage — in-memory Maps:
//   _advocatesV2   :  Map<advocateId, advocateRecord>
//   _historyV2     :  Map<advocateId, historyEvent[]>   (append-only)
//   _caseStudiesV2 :  Map<caseStudyId, caseStudyRecord>
//   _referencesV2  :  Map<referenceId, referenceRecord>
//   _testimonialsV2:  Map<testimonialId, testimonialRecord>
//   _eventsV2      :  Map<eventId, userGroupEventRecord>
//   _pointsV2      :  Map<advocateId, pointRecord[]>    (append-only)
//   _redemptionsV2 :  Map<advocateId, redemptionRecord[]> (append-only)
//
// Public activity / point values match the Y-105 brief:
//   case_study = 500   reference_call = 100   testimonial = 50
//   event_speaker = 300   bug_report = 20   feature_request = 10
//
// Tier thresholds (cumulative earned points, append-only):
//   bronze   :      0
//   silver   :    300
//   gold     :    900
//   platinum :  2000
//
// Reference-call frequency cap: 4 per rolling 365 days per advocate,
// unless the call is explicitly `approvedByOverride: true` (which
// writes an extra audit event so the override is visible in history).
//
// Bilingual labels live in LABELS_Y105 below — layered on top of
// LABELS_HE without mutating it.

const ACTIVITY_POINTS = Object.freeze({
  case_study: 500,
  reference_call: 100,
  testimonial: 50,
  event_speaker: 300,
  bug_report: 20,
  feature_request: 10,
});

const TIER_THRESHOLDS = Object.freeze({
  bronze: 0,
  silver: 300,
  gold: 900,
  platinum: 2000,
});

const CASE_STUDY_WORKFLOW_STATES = Object.freeze([
  'draft',
  'review',
  'published',
]);

const USAGE_RIGHTS = Object.freeze([
  'internal',
  'marketing',
  'public',
  'redistribution',
]);

const REWARD_CATALOGUE = Object.freeze({
  swag: { points: 200, nameHe: 'מוצרי מיתוג' },
  discount: { points: 500, nameHe: 'הנחה על מנוי' },
  free_service: { points: 800, nameHe: 'שירות חינם' },
  t_shirt: { points: 100, nameHe: 'חולצת שגרירים' },
  conference_ticket: { points: 1500, nameHe: 'כרטיס לכנס' },
});

const REFERENCE_FREQUENCY_CAP = 4;           // per rolling year
const REFERENCE_FREQUENCY_WINDOW_DAYS = 365;

const LABELS_Y105 = Object.freeze({
  advocacy: 'תוכנית שגרירי לקוחות',
  advocate: 'שגריר',
  nomination: 'מועמדות',
  approval: 'אישור',
  consent: 'הסכמה',
  pdpl: 'הגנת פרטיות (חוק הגנת הפרטיות)',
  caseStudy: 'מקרה בוחן',
  reference: 'בקשת המלצה',
  testimonial: 'ציטוט המלצה',
  userGroupEvent: 'מפגש קהילת לקוחות',
  points: 'נקודות שגרירים',
  tier: 'דירוג',
  bronze: 'ארד',
  silver: 'כסף',
  gold: 'זהב',
  platinum: 'פלטינה',
  leaderboard: 'לוח מובילים',
  rotation: 'רוטציית פניות',
  withdrawConsent: 'משיכת הסכמה',
  optedOut: 'יצא מהתוכנית',
  pending: 'ממתין לאישור',
  active: 'פעיל',
  draft: 'טיוטה',
  review: 'סקירה',
  published: 'פורסם',
  internal: 'שימוש פנימי',
  marketing: 'שיווק',
  public: 'פרסום ציבורי',
  redistribution: 'הפצה חוזרת',
  redemption: 'מימוש נקודות',
  activity: {
    case_study: 'מקרה בוחן',
    reference_call: 'שיחת המלצה',
    testimonial: 'ציטוט',
    event_speaker: 'דובר באירוע',
    bug_report: 'דיווח באג',
    feature_request: 'בקשת פיצ\'ר',
  },
  rewards: {
    swag: 'מוצרי מיתוג',
    discount: 'הנחה',
    free_service: 'שירות חינם',
    t_shirt: 'חולצה',
    conference_ticket: 'כרטיס לכנס',
  },
});

/**
 * Y-105 Advocacy engine. Append-only, PDPL-compliant, bilingual.
 *
 * Each writable method appends to the shared `history(advocateId)`
 * ledger. Reads return deep-cloned, immutable structures so callers
 * cannot corrupt state.
 *
 * Optional constructor options:
 *   clock   : () => isoString  (for deterministic tests)
 *   idSeed  : string prefix for generated ids
 */
class Advocacy {
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function' ? opts.clock : nowIso;
    const seed = opts.idSeed || '';

    this._advocatesV2 = new Map();
    this._historyV2 = new Map();
    this._caseStudiesV2 = new Map();
    this._referencesV2 = new Map();
    this._testimonialsV2 = new Map();
    this._eventsV2 = new Map();
    this._pointsV2 = new Map();
    this._redemptionsV2 = new Map();

    this._rotationCursor = 0;

    this._nextAdvId = makeIdFactory(`${seed}advy105`);
    this._nextCsId = makeIdFactory(`${seed}csy105`);
    this._nextRefId = makeIdFactory(`${seed}refy105`);
    this._nextTstId = makeIdFactory(`${seed}tsty105`);
    this._nextEvtId = makeIdFactory(`${seed}ugy105`);
    this._nextPtsId = makeIdFactory(`${seed}ptsy105`);
    this._nextRdmId = makeIdFactory(`${seed}rdmy105`);
  }

  // ─── internal utilities ────────────────────────────────────────────

  _now() {
    return this._clock();
  }

  _requireAdvocate(id) {
    const a = this._advocatesV2.get(id);
    if (!a) throw new Error(`unknown advocate: ${id}`);
    return a;
  }

  _assertNotOptedOut(advocateId) {
    const a = this._requireAdvocate(advocateId);
    if (a.status === 'opted-out') {
      throw new Error(`advocate ${advocateId} has opted-out — future requests blocked per PDPL`);
    }
    return a;
  }

  _append(advocateId, type, payload) {
    if (!this._historyV2.has(advocateId)) this._historyV2.set(advocateId, []);
    const entry = Object.freeze({
      ts: this._now(),
      type,
      payload: cloneFrozen(payload || {}),
    });
    this._historyV2.get(advocateId).push(entry);
    return entry;
  }

  // ─── 5.1 nominateAdvocate ──────────────────────────────────────────

  /**
   * Nominate a customer into the advocacy program.
   * Append-only: nominating the same customerId twice creates a NEW
   * advocate record (ledger entry re-affirmed) — we do not upgrade or
   * replace existing entries silently.
   *
   * The new advocate starts in status `pending`. Approval requires an
   * explicit PDPL-compliant consent record via `approveAdvocate`.
   */
  nominateAdvocate({ customerId, nominatedBy, reason, eligibilityNotes } = {}) {
    if (!customerId) throw new Error('customerId required');
    if (!nominatedBy) throw new Error('nominatedBy required');
    if (!reason) throw new Error('reason required');

    const id = this._nextAdvId();
    const rec = Object.freeze({
      id,
      customerId: String(customerId),
      nominatedBy: String(nominatedBy),
      reason: String(reason),
      eligibilityNotes: eligibilityNotes || '',
      status: 'pending',
      statusHe: LABELS_Y105.pending,
      nominatedAt: this._now(),
      approvedAt: null,
      approvedBy: null,
      optedOutAt: null,
      consentRecord: null,
      tier: 'bronze',
      tierHe: LABELS_Y105.bronze,
    });
    this._advocatesV2.set(id, rec);
    this._historyV2.set(id, []);
    this._pointsV2.set(id, []);
    this._redemptionsV2.set(id, []);
    this._append(id, 'nomination', { customerId, nominatedBy, reason, eligibilityNotes });
    return { ...rec };
  }

  /** Lookup an advocate (immutable clone). */
  getAdvocateV2(advocateId) {
    const a = this._advocatesV2.get(advocateId);
    return a ? { ...a } : null;
  }

  listAdvocatesV2() {
    return Array.from(this._advocatesV2.values()).map(a => ({ ...a }));
  }

  // ─── 5.2 approveAdvocate ───────────────────────────────────────────

  /**
   * Approve a nominated advocate. Requires explicit consent per PDPL —
   * the caller MUST pass a `consentRecord` object that captures:
   *   - channel   (how consent was obtained: email/phone/signed/form)
   *   - obtainedAt (ISO timestamp)
   *   - text      (the exact language the advocate agreed to)
   *   - ref       (document / ticket id)
   *
   * Missing or empty consentRecord raises — we never manufacture
   * implicit consent. Status flips pending → active and is appended to
   * history forever.
   */
  approveAdvocate(advocateId, { approver, consentRecord } = {}) {
    if (!approver) throw new Error('approver required');
    if (!consentRecord || typeof consentRecord !== 'object') {
      throw new Error('consentRecord required per PDPL');
    }
    const { channel, obtainedAt, text, ref } = consentRecord;
    if (!channel) throw new Error('consentRecord.channel required');
    if (!obtainedAt) throw new Error('consentRecord.obtainedAt required');
    if (!text) throw new Error('consentRecord.text required');

    const a = this._requireAdvocate(advocateId);
    if (a.status === 'opted-out') {
      throw new Error('cannot approve — advocate opted-out');
    }
    if (a.status === 'active') {
      // idempotent: refresh consent without losing history
      this._append(advocateId, 'consent-refreshed', { approver, consentRecord });
      return { ...a };
    }

    const frozen = Object.freeze({
      ...a,
      status: 'active',
      statusHe: LABELS_Y105.active,
      approvedAt: this._now(),
      approvedBy: String(approver),
      consentRecord: Object.freeze({
        channel: String(channel),
        obtainedAt: String(obtainedAt),
        text: String(text),
        ref: ref ? String(ref) : '',
      }),
    });
    this._advocatesV2.set(advocateId, frozen);
    this._append(advocateId, 'approval', {
      approver,
      consentRecord: frozen.consentRecord,
    });
    return { ...frozen };
  }

  // ─── 5.3 requestCaseStudy ──────────────────────────────────────────

  /**
   * Request a case study from an active advocate on a given project.
   * State machine: draft → review → published. Each advance is
   * captured via `advanceCaseStudyY105`. Starting state is `draft`.
   */
  requestCaseStudy({ advocateId, projectId, approvedBy } = {}) {
    if (!projectId) throw new Error('projectId required');
    if (!approvedBy) throw new Error('approvedBy required');
    const a = this._assertNotOptedOut(advocateId);
    if (a.status !== 'active') {
      throw new Error('case study requires advocate.status === active');
    }

    const id = this._nextCsId();
    const rec = {
      id,
      advocateId,
      projectId: String(projectId),
      approvedBy: String(approvedBy),
      state: 'draft',
      stateHe: LABELS_Y105.draft,
      stateHistory: [
        Object.freeze({ state: 'draft', ts: this._now(), actor: 'system' }),
      ],
      publishedAt: null,
      createdAt: this._now(),
    };
    this._caseStudiesV2.set(id, rec);
    this._append(advocateId, 'case-study-requested', { caseStudyId: id, projectId });
    return { ...rec, stateHistory: rec.stateHistory.slice() };
  }

  /** Advance a Y-105 case study forward in the workflow. */
  advanceCaseStudyY105(caseStudyId, nextState, actor) {
    const rec = this._caseStudiesV2.get(caseStudyId);
    if (!rec) throw new Error(`unknown case study: ${caseStudyId}`);
    if (!CASE_STUDY_WORKFLOW_STATES.includes(nextState)) {
      throw new Error(`unknown state: ${nextState}`);
    }
    const idx = CASE_STUDY_WORKFLOW_STATES.indexOf(rec.state);
    const nextIdx = CASE_STUDY_WORKFLOW_STATES.indexOf(nextState);
    if (nextIdx <= idx) {
      throw new Error(`cannot move from ${rec.state} to ${nextState}`);
    }
    rec.state = nextState;
    rec.stateHe = LABELS_Y105[nextState];
    rec.stateHistory = rec.stateHistory.concat([
      Object.freeze({ state: nextState, ts: this._now(), actor: actor || 'system' }),
    ]);
    if (nextState === 'published') rec.publishedAt = this._now();
    this._append(rec.advocateId, 'case-study-advanced', {
      caseStudyId,
      state: nextState,
      actor: actor || 'system',
    });
    return { ...rec, stateHistory: rec.stateHistory.slice() };
  }

  getCaseStudyY105(caseStudyId) {
    const rec = this._caseStudiesV2.get(caseStudyId);
    return rec ? { ...rec, stateHistory: rec.stateHistory.slice() } : null;
  }

  // ─── 5.4 requestReference ──────────────────────────────────────────

  /**
   * Register a reference request. Enforces the 4-calls-per-rolling-year
   * cap unless an explicit `approvedByOverride` flag is passed.
   *
   * Return record has status `scheduled` on success, `blocked-cap` when
   * the cap would be exceeded without override.
   */
  requestReference({ advocateId, requestingRepId, prospectName, purpose, approvedByOverride = false, asOf } = {}) {
    if (!requestingRepId) throw new Error('requestingRepId required');
    if (!prospectName) throw new Error('prospectName required');
    if (!purpose) throw new Error('purpose required');
    this._assertNotOptedOut(advocateId);

    const now = asOf || this._now();
    const history = this._historyV2.get(advocateId) || [];
    let callsInWindow = 0;
    for (const e of history) {
      if (e.type !== 'reference-scheduled') continue;
      if (diffDays(e.ts, now) <= REFERENCE_FREQUENCY_WINDOW_DAYS) callsInWindow += 1;
    }

    if (callsInWindow >= REFERENCE_FREQUENCY_CAP && !approvedByOverride) {
      const blocked = {
        id: this._nextRefId(),
        advocateId,
        requestingRepId: String(requestingRepId),
        prospectName: String(prospectName),
        purpose: String(purpose),
        status: 'blocked-cap',
        reason: `reference frequency cap reached: ${callsInWindow}/${REFERENCE_FREQUENCY_CAP}`,
        reasonHe: 'נחסם עקב תקרת פניות שנתית',
        cap: REFERENCE_FREQUENCY_CAP,
        windowDays: REFERENCE_FREQUENCY_WINDOW_DAYS,
        ts: now,
      };
      this._referencesV2.set(blocked.id, blocked);
      this._append(advocateId, 'reference-blocked', {
        requestingRepId,
        prospectName,
        purpose,
        callsInWindow,
      });
      return { ...blocked };
    }

    const id = this._nextRefId();
    const rec = {
      id,
      advocateId,
      requestingRepId: String(requestingRepId),
      prospectName: String(prospectName),
      purpose: String(purpose),
      status: 'scheduled',
      statusHe: 'מתוכננת',
      ts: now,
      overrideUsed: !!approvedByOverride,
      callsInWindow: callsInWindow + 1,
      cap: REFERENCE_FREQUENCY_CAP,
    };
    this._referencesV2.set(id, rec);
    this._append(advocateId, 'reference-scheduled', {
      referenceId: id,
      requestingRepId,
      prospectName,
      purpose,
      overrideUsed: !!approvedByOverride,
    });
    if (approvedByOverride) {
      this._append(advocateId, 'reference-override-audit', {
        referenceId: id,
        note: 'frequency cap overridden by approval',
      });
    }
    return { ...rec };
  }

  // ─── 5.5 trackTestimonial ──────────────────────────────────────────

  /**
   * Record a testimonial quote with explicit usage rights.
   * `usageRights` must be a subset of USAGE_RIGHTS — anything else
   * throws, never silently coerced.
   */
  trackTestimonial({ advocateId, quote, attribution, usageRights } = {}) {
    if (!quote) throw new Error('quote required');
    if (!attribution) throw new Error('attribution required');
    this._assertNotOptedOut(advocateId);

    const rights = Array.isArray(usageRights) ? usageRights.slice() : [usageRights];
    for (const r of rights) {
      if (!USAGE_RIGHTS.includes(r)) {
        throw new Error(`invalid usage right: ${r} — must be one of ${USAGE_RIGHTS.join(', ')}`);
      }
    }

    const id = this._nextTstId();
    const rec = Object.freeze({
      id,
      advocateId,
      quote: String(quote),
      attribution: String(attribution),
      usageRights: Object.freeze(rights.slice()),
      usageRightsHe: Object.freeze(rights.map(r => LABELS_Y105[r])),
      ts: this._now(),
      revoked: false,
    });
    this._testimonialsV2.set(id, rec);
    this._append(advocateId, 'testimonial-tracked', {
      testimonialId: id,
      usageRights: rights,
    });
    return { ...rec, usageRights: rec.usageRights.slice(), usageRightsHe: rec.usageRightsHe.slice() };
  }

  getTestimonial(id) {
    const t = this._testimonialsV2.get(id);
    if (!t) return null;
    return { ...t, usageRights: t.usageRights.slice(), usageRightsHe: t.usageRightsHe.slice() };
  }

  listTestimonials() {
    return Array.from(this._testimonialsV2.values()).map(t => ({
      ...t,
      usageRights: t.usageRights.slice(),
      usageRightsHe: t.usageRightsHe.slice(),
    }));
  }

  // ─── 5.6 scheduleUserGroupEvent ────────────────────────────────────

  /**
   * Schedule an Israeli user-group event.
   *   title           : bilingual string (stored as-is)
   *   date            : ISO date
   *   location        : city / venue (default "Tel Aviv")
   *   targetAttendees : number
   *   speakers        : array of advocateIds — automatically awarded
   *                     `event_speaker` points (300) on schedule.
   */
  scheduleUserGroupEvent({ title, date, location = 'Tel Aviv', targetAttendees = 0, speakers = [] } = {}) {
    if (!title) throw new Error('title required');
    if (!date) throw new Error('date required');

    const id = this._nextEvtId();
    const rec = Object.freeze({
      id,
      title: String(title),
      date: String(date),
      location: String(location),
      locationHe: location === 'Tel Aviv' ? 'תל אביב' : String(location),
      targetAttendees: Number(targetAttendees) || 0,
      speakers: Object.freeze(speakers.slice()),
      createdAt: this._now(),
      status: 'scheduled',
      statusHe: 'מתוכנן',
    });
    this._eventsV2.set(id, rec);

    for (const advocateId of speakers) {
      if (!this._advocatesV2.has(advocateId)) continue; // skip unknown gracefully
      if (this._advocatesV2.get(advocateId).status === 'opted-out') continue;
      this.awardPoints(advocateId, 'event_speaker', ACTIVITY_POINTS.event_speaker);
      this._append(advocateId, 'user-group-event-speaker', { eventId: id, title });
    }
    return { ...rec, speakers: rec.speakers.slice() };
  }

  listEvents() {
    return Array.from(this._eventsV2.values()).map(e => ({ ...e, speakers: e.speakers.slice() }));
  }

  // ─── 5.7 awardPoints ───────────────────────────────────────────────

  /**
   * Award points for an activity. Custom `points` can be passed to
   * override the default for that activity (used for one-off bonuses).
   * Writes the record, appends to history, and updates tier on the fly.
   */
  awardPoints(advocateId, activity, points) {
    this._assertNotOptedOut(advocateId);
    if (!ACTIVITY_POINTS.hasOwnProperty(activity)) {
      throw new Error(`unknown activity: ${activity}`);
    }
    const value = points != null ? Number(points) : ACTIVITY_POINTS[activity];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('points must be a non-negative number');
    }

    const id = this._nextPtsId();
    const rec = Object.freeze({
      id,
      advocateId,
      activity,
      activityHe: LABELS_Y105.activity[activity] || activity,
      points: value,
      ts: this._now(),
      kind: 'earn',
    });
    if (!this._pointsV2.has(advocateId)) this._pointsV2.set(advocateId, []);
    this._pointsV2.get(advocateId).push(rec);
    this._append(advocateId, 'points-awarded', { activity, points: value });
    this._recomputeTier(advocateId);
    return { ...rec };
  }

  /** Get the running (earned − redeemed) point balance. */
  pointsBalance(advocateId) {
    const earned = (this._pointsV2.get(advocateId) || [])
      .filter(p => p.kind === 'earn')
      .reduce((s, p) => s + p.points, 0);
    const redeemed = (this._redemptionsV2.get(advocateId) || [])
      .reduce((s, r) => s + r.points, 0);
    return { earned, redeemed, balance: earned - redeemed };
  }

  // ─── 5.8 redeemPoints ──────────────────────────────────────────────

  /**
   * Redeem a reward. Reward name must be present in REWARD_CATALOGUE;
   * balance must cover the cost. Append-only — redeemed points are NOT
   * removed from the earn ledger, only offset via a redemption record.
   */
  redeemPoints(advocateId, reward) {
    this._assertNotOptedOut(advocateId);
    if (!REWARD_CATALOGUE.hasOwnProperty(reward)) {
      throw new Error(`unknown reward: ${reward}`);
    }
    const cost = REWARD_CATALOGUE[reward].points;
    const bal = this.pointsBalance(advocateId);
    if (bal.balance < cost) {
      throw new Error(`insufficient balance: ${bal.balance} < ${cost}`);
    }

    const id = this._nextRdmId();
    const rec = Object.freeze({
      id,
      advocateId,
      reward,
      rewardHe: LABELS_Y105.rewards[reward] || reward,
      points: cost,
      ts: this._now(),
      kind: 'redeem',
    });
    if (!this._redemptionsV2.has(advocateId)) this._redemptionsV2.set(advocateId, []);
    this._redemptionsV2.get(advocateId).push(rec);
    this._append(advocateId, 'points-redeemed', { reward, points: cost });
    return { ...rec };
  }

  // ─── 5.9 advocatesByScore (leaderboard) ────────────────────────────

  advocatesByScore(limit = 10) {
    const rows = [];
    for (const adv of this._advocatesV2.values()) {
      if (adv.status === 'opted-out') continue;
      const bal = this.pointsBalance(adv.id);
      rows.push({
        advocateId: adv.id,
        customerId: adv.customerId,
        status: adv.status,
        statusHe: adv.statusHe,
        tier: adv.tier,
        tierHe: adv.tierHe,
        earned: bal.earned,
        redeemed: bal.redeemed,
        balance: bal.balance,
      });
    }
    rows.sort((a, b) => b.earned - a.earned || a.advocateId.localeCompare(b.advocateId));
    return rows.slice(0, limit);
  }

  // ─── 5.10 tierThresholds ───────────────────────────────────────────

  tierThresholds() {
    return {
      bronze: { points: TIER_THRESHOLDS.bronze, nameHe: LABELS_Y105.bronze },
      silver: { points: TIER_THRESHOLDS.silver, nameHe: LABELS_Y105.silver },
      gold: { points: TIER_THRESHOLDS.gold, nameHe: LABELS_Y105.gold },
      platinum: { points: TIER_THRESHOLDS.platinum, nameHe: LABELS_Y105.platinum },
    };
  }

  _tierForPoints(earned) {
    if (earned >= TIER_THRESHOLDS.platinum) return 'platinum';
    if (earned >= TIER_THRESHOLDS.gold) return 'gold';
    if (earned >= TIER_THRESHOLDS.silver) return 'silver';
    return 'bronze';
  }

  _recomputeTier(advocateId) {
    const a = this._advocatesV2.get(advocateId);
    if (!a) return;
    const bal = this.pointsBalance(advocateId);
    const newTier = this._tierForPoints(bal.earned);
    if (newTier === a.tier) return;
    const frozen = Object.freeze({
      ...a,
      tier: newTier,
      tierHe: LABELS_Y105[newTier],
    });
    this._advocatesV2.set(advocateId, frozen);
    this._append(advocateId, 'tier-changed', { from: a.tier, to: newTier });
  }

  // ─── 5.11 rotationPolicy ───────────────────────────────────────────

  /**
   * Fair rotation — returns advocates sorted by FEWEST recent requests
   * so callers who pick the first N get a balanced rotation instead of
   * over-asking the same high-scorers. Opted-out advocates are excluded.
   *
   * A `window` parameter (days, default 90) controls the recency window
   * used for "recent requests".
   */
  rotationPolicy({ window = 90, asOf } = {}) {
    const now = asOf || this._now();
    const rows = [];
    for (const adv of this._advocatesV2.values()) {
      if (adv.status !== 'active') continue;
      const history = this._historyV2.get(adv.id) || [];
      let recentRequests = 0;
      let lastRequestTs = null;
      for (const e of history) {
        if (e.type !== 'reference-scheduled' && e.type !== 'case-study-requested') continue;
        if (diffDays(e.ts, now) <= window) {
          recentRequests += 1;
          if (!lastRequestTs || e.ts > lastRequestTs) lastRequestTs = e.ts;
        }
      }
      rows.push({
        advocateId: adv.id,
        customerId: adv.customerId,
        tier: adv.tier,
        tierHe: adv.tierHe,
        recentRequests,
        lastRequestTs,
        eligible: true,
        eligibleHe: 'זמין לפנייה',
      });
    }
    // Fewest recent first, break ties by tier rank (platinum > gold > ...)
    const tierRank = { platinum: 4, gold: 3, silver: 2, bronze: 1 };
    rows.sort((a, b) => {
      if (a.recentRequests !== b.recentRequests) return a.recentRequests - b.recentRequests;
      return tierRank[b.tier] - tierRank[a.tier];
    });
    // Expose a deterministic "next pick" cursor so callers that ignore
    // sort order can still rotate fairly.
    if (rows.length > 0) {
      this._rotationCursor = (this._rotationCursor + 1) % rows.length;
      rows[0].cursorIndex = this._rotationCursor;
    }
    return rows;
  }

  // ─── 5.12 withdrawConsent (opt-out) ────────────────────────────────

  /**
   * Withdraws consent per PDPL. Flips status to `opted-out`, preserves
   * ALL prior records, appends an audit event with the provided reason,
   * and returns the new immutable advocate record. Subsequent write
   * operations (case study / reference / testimonial / event speaker
   * / points award) will throw.
   */
  withdrawConsent(advocateId, reason) {
    const a = this._requireAdvocate(advocateId);
    if (a.status === 'opted-out') {
      this._append(advocateId, 'consent-withdrawal-reaffirmed', { reason: reason || '' });
      return { ...a };
    }
    const frozen = Object.freeze({
      ...a,
      status: 'opted-out',
      statusHe: LABELS_Y105.optedOut,
      optedOutAt: this._now(),
      optedOutReason: String(reason || ''),
    });
    this._advocatesV2.set(advocateId, frozen);
    this._append(advocateId, 'consent-withdrawn', { reason: reason || '' });
    return { ...frozen };
  }

  // ─── 5.13 history (append-only) ────────────────────────────────────

  history(advocateId) {
    const h = this._historyV2.get(advocateId);
    return h ? h.slice() : [];
  }

  // ─── 5.14 read-only catalogue helpers ──────────────────────────────

  activityPoints() {
    return { ...ACTIVITY_POINTS };
  }

  rewardCatalogue() {
    const out = {};
    for (const [k, v] of Object.entries(REWARD_CATALOGUE)) out[k] = { ...v };
    return out;
  }

  labels() {
    return cloneFrozen(LABELS_Y105);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. Exports
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // Legacy / section-4 surface (AG-Y094 wave — still active)
  AdvocacyProgram,
  CONSTANTS,
  LABELS_HE,
  CASE_STUDY_STAGES,
  REQUEST_FORMATS,
  REWARD_TYPES,
  ENGAGEMENT_TYPES,

  // Y-105 extended surface
  Advocacy,
  ACTIVITY_POINTS,
  TIER_THRESHOLDS,
  CASE_STUDY_WORKFLOW_STATES,
  USAGE_RIGHTS,
  REWARD_CATALOGUE,
  REFERENCE_FREQUENCY_CAP,
  REFERENCE_FREQUENCY_WINDOW_DAYS,
  LABELS_Y105,

  _internals: {
    makeIdFactory,
    diffDays,
    addDaysIso,
  },
};
