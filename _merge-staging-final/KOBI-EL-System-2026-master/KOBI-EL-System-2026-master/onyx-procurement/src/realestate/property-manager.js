/**
 * property-manager.js — מנהל נכסי נדל"ן / Israeli Real-Estate Portfolio Manager
 * Agent Y-046 / Swarm Real-Estate / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * In-memory property register for an Israeli real-estate portfolio, keyed by
 * the canonical Tabu triple (גוש / חלקה / תת-חלקה). Exposes CRUD on
 * properties, Tabu linkage, ownership chain, valuation history, encumbrance
 * tracking, fractional ownership, and a cadastral (ADOT / Authority for
 * Surveying) data stub.
 *
 * Legal / registry context:
 *   • חוק המקרקעין, התשכ"ט-1969 — core real-property law
 *   • חוק רישום המקרקעין, התשכ"ט-1969 — Land Registry (לשכת רישום המקרקעין / Tabu)
 *   • חוק התכנון והבניה, התשכ"ה-1965 — planning & building, relevant for היתרים
 *   • חוק מדידות (פקודת המדידות) — ADOT / המרכז למיפוי ישראל (מפ"י / MAPI)
 *   • סעיף 196א – היטל השבחה — betterment levy (upgrade tax) on uplifted plans
 *
 * Tabu triple:
 *   גוש (gush / block)     — top-level cadastral block number
 *   חלקה (helka / parcel)  — parcel inside the block
 *   תת-חלקה (tat-helka)    — sub-parcel (apartment / storage / parking unit in
 *                            a condominium — "בית משותף")
 *
 * ---------------------------------------------------------------------------
 * Rule of the house: לא מוחקים — רק משדרגים ומגדלים.
 * This module NEVER deletes history. Valuations, owners, encumbrances,
 * Tabu refs — all append-only. Every update keeps the previous record with
 * a timestamp so the caller can reconstruct any point in time.
 * ---------------------------------------------------------------------------
 *
 * Zero external dependencies. Pure CommonJS. Bilingual Hebrew / English.
 *
 * ---------------------------------------------------------------------------
 * Public surface:
 *   class PropertyManager
 *     .registerProperty(params)                  → Property
 *     .getProperty(id)                           → Property | null
 *     .getPropertyByGushHelka(gush, helka, sub?) → Property[] | Property | null
 *     .listProperties(filter?)                   → Property[]
 *     .linkToTabu(propertyId, tabuRef)           → Property
 *     .ownerHistory(propertyId)                  → OwnerChainEntry[]
 *     .addOwner(propertyId, owner)               → OwnerChainEntry
 *     .updateValuation(propertyId, valuation)    → ValuationEntry
 *     .valuationHistory(propertyId)              → ValuationEntry[]
 *     .currentValuation(propertyId)              → ValuationEntry | null
 *     .addEncumbrance(propertyId, encumbrance)   → EncumbranceEntry
 *     .releaseEncumbrance(propertyId, id, note?) → EncumbranceEntry
 *     .encumbrances(propertyId, opts?)           → EncumbranceEntry[]
 *     .ownershipShare({propertyId, owner, sharePct})  → ShareRecord
 *     .totalOwnershipShare(propertyId)           → number (sum of sharePct)
 *     .cadastralData(propertyId)                 → CadastralBlob  (stub)
 *     .exportProperty(propertyId)                → JSON snapshot
 *     .snapshot()                                → full portfolio JSON
 *
 *   PROPERTY_TYPES         = ['residential','commercial','industrial','land','mixed']
 *   VALUATION_METHODS      = ['comparable','income','cost','DCF','auction','self']
 *   ENCUMBRANCE_TYPES      = ['mortgage','lien','caveat','injunction','tax_lien',
 *                              'easement','attachment','bankruptcy']
 *   CADASTRAL_SOURCES      = ['ADOT','MAPI','TABU','MUNI']
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const PROPERTY_TYPES = Object.freeze([
  'residential', // דירת מגורים / בית פרטי
  'commercial',  // נכס מסחרי / משרד / חנות
  'industrial',  // נכס תעשייתי / מפעל / מחסן
  'land',        // קרקע / מגרש
  'mixed',       // שימוש מעורב (מסחר + מגורים)
]);

const VALUATION_METHODS = Object.freeze([
  'comparable', // גישת ההשוואה
  'income',     // היוון הכנסות
  'cost',       // עלות השחלוף
  'DCF',        // תזרים מזומנים מהוון
  'auction',    // מכירה פומבית / כונס נכסים
  'self',       // הערכה עצמית של הבעלים
]);

const ENCUMBRANCE_TYPES = Object.freeze([
  'mortgage',   // משכנתא
  'lien',       // שעבוד
  'caveat',     // הערת אזהרה
  'injunction', // צו מניעה בית משפט
  'tax_lien',   // עיקול מס
  'easement',   // זיקת הנאה
  'attachment', // עיקול
  'bankruptcy', // כינוס נכסים / פשיטת רגל
]);

const CADASTRAL_SOURCES = Object.freeze([
  'ADOT', // הרשות למדידות
  'MAPI', // המרכז למיפוי ישראל
  'TABU', // לשכת רישום המקרקעין
  'MUNI', // רשות מקומית
]);

const HEBREW_LABELS = Object.freeze({
  gush: 'גוש',
  helka: 'חלקה',
  subParcel: 'תת-חלקה',
  tabu: 'נסח טאבו',
  betterment_levy: 'היטל השבחה',
  owner: 'בעלים',
  valuation: 'שומה / הערכה',
  encumbrance: 'שעבוד / עיקול',
  mortgage: 'משכנתא',
  lien: 'שעבוד',
  caveat: 'הערת אזהרה',
  injunction: 'צו מניעה',
  tax_lien: 'עיקול מס',
  easement: 'זיקת הנאה',
  attachment: 'עיקול',
  bankruptcy: 'כינוס נכסים',
  residential: 'נכס מגורים',
  commercial: 'נכס מסחרי',
  industrial: 'נכס תעשייתי',
  land: 'קרקע',
  mixed: 'שימוש מעורב',
});

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Israeli gush/helka are always positive integers
  return Math.trunc(n);
}

function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function makeId(prefix) {
  // Deterministic enough, collision-unlikely in-process id. Zero deps.
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}_${t}_${rand}`;
}

function deepFreeze(obj) {
  // Freezes own enumerable object/array properties recursively.
  if (obj === null || typeof obj !== 'object') return obj;
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

function cloneShallow(v) {
  if (Array.isArray(v)) return v.slice();
  if (v && typeof v === 'object') return Object.assign({}, v);
  return v;
}

function gushHelkaKey(gush, helka, subParcel) {
  const g = toIntOrNull(gush);
  const h = toIntOrNull(helka);
  const s = subParcel === undefined || subParcel === null || subParcel === ''
    ? null
    : toIntOrNull(subParcel);
  if (g === null || h === null) return null;
  return s === null ? `${g}/${h}` : `${g}/${h}/${s}`;
}

// ──────────────────────────────────────────────────────────────
// PropertyManager class
// ──────────────────────────────────────────────────────────────

class PropertyManager {
  constructor(opts = {}) {
    this._clock = typeof opts.clock === 'function' ? opts.clock : () => new Date();
    /** @type {Map<string, object>} id → property */
    this._byId = new Map();
    /** @type {Map<string, Set<string>>} gushHelka key → Set<propertyId> */
    this._byGushHelka = new Map();
    /** internal audit trail — append-only, never truncated */
    this._audit = [];
  }

  // ─── internal ────────────────────────────────────────────────

  _now() { return this._clock().toISOString(); }

  _audited(action, payload) {
    this._audit.push({
      at: this._now(),
      action,
      payload: payload || null,
    });
  }

  _requireProperty(propertyId) {
    if (!nonEmptyString(propertyId)) {
      throw new TypeError('propertyId (string) is required');
    }
    const p = this._byId.get(propertyId);
    if (!p) throw new Error(`property not found: ${propertyId}`);
    return p;
  }

  _indexGushHelka(property) {
    const keys = new Set();
    // Index by strict triple
    const tripleKey = gushHelkaKey(
      property.gush,
      property.helka,
      property.subParcel,
    );
    if (tripleKey) keys.add(tripleKey);
    // Also index by block/parcel without sub-parcel so a lookup that omits
    // subParcel returns every unit in the parcel.
    const pairKey = gushHelkaKey(property.gush, property.helka, null);
    if (pairKey) keys.add(pairKey);
    keys.forEach((k) => {
      let set = this._byGushHelka.get(k);
      if (!set) { set = new Set(); this._byGushHelka.set(k, set); }
      set.add(property.id);
    });
  }

  // ─── registerProperty ─────────────────────────────────────────

  registerProperty(params) {
    if (!params || typeof params !== 'object') {
      throw new TypeError('registerProperty: params object required');
    }
    const {
      id,
      address,
      gush,
      block,       // alias for gush
      helka,
      parcel,      // alias for helka
      subParcel,
      propertyType,
      areaSqm,
      rooms,
      floors,
      purchaseDate,
      purchasePrice,
      currentValue,
      encumbrances,
      photos,
      blueprints,
      certificates,
    } = params;

    const resolvedGush = toIntOrNull(gush !== undefined ? gush : block);
    const resolvedHelka = toIntOrNull(helka !== undefined ? helka : parcel);

    if (resolvedGush === null) {
      throw new Error('registerProperty: gush (block) is required and must be numeric');
    }
    if (resolvedHelka === null) {
      throw new Error('registerProperty: helka (parcel) is required and must be numeric');
    }

    const finalType = propertyType || 'residential';
    if (!PROPERTY_TYPES.includes(finalType)) {
      throw new Error(
        `registerProperty: propertyType must be one of ${PROPERTY_TYPES.join(', ')}`,
      );
    }

    const finalId = nonEmptyString(id) ? id : makeId('prop');
    if (this._byId.has(finalId)) {
      throw new Error(`registerProperty: id already registered: ${finalId}`);
    }

    const now = this._now();
    const property = {
      id: finalId,
      address: nonEmptyString(address) ? address : null,
      gush: resolvedGush,
      helka: resolvedHelka,
      subParcel: toIntOrNull(subParcel),
      propertyType: finalType,
      areaSqm: isFiniteNumber(areaSqm) ? areaSqm : null,
      rooms: isFiniteNumber(rooms) ? rooms : null,
      floors: isFiniteNumber(floors) ? floors : null,
      purchaseDate: normalizeDate(purchaseDate),
      purchasePrice: isFiniteNumber(purchasePrice) ? purchasePrice : null,
      // Current value is tracked through valuationHistory; keep the registered
      // seed value as "opening" valuation if supplied.
      _currentValue: isFiniteNumber(currentValue) ? currentValue : null,
      photos: Array.isArray(photos) ? photos.slice() : [],
      blueprints: Array.isArray(blueprints) ? blueprints.slice() : [],
      certificates: Array.isArray(certificates) ? certificates.slice() : [],
      tabuLinks: [],
      ownerHistory: [],
      valuationHistory: [],
      encumbrances: [],
      shares: [],
      cadastral: null,
      createdAt: now,
      updatedAt: now,
    };

    // Seed the valuation history with the registered current value. Back-
    // dated to the purchaseDate (or 1970 epoch when absent) so any later
    // updateValuation() call naturally takes precedence when computing the
    // "current" figure.
    if (property._currentValue !== null) {
      property.valuationHistory.push({
        id: makeId('val'),
        date: property.purchaseDate || new Date(0).toISOString(),
        value: property._currentValue,
        valuer: 'owner',
        method: 'self',
        note: 'Seed valuation from registerProperty',
        currency: 'ILS',
        recordedAt: now,
      });
    }

    // Seed encumbrances supplied at registration time.
    if (Array.isArray(encumbrances)) {
      encumbrances.forEach((e) => {
        if (!e || typeof e !== 'object') return;
        property.encumbrances.push({
          id: makeId('enc'),
          type: ENCUMBRANCE_TYPES.includes(e.type) ? e.type : 'lien',
          holder: nonEmptyString(e.holder) ? e.holder : null,
          amount: isFiniteNumber(e.amount) ? e.amount : null,
          description: e.description || null,
          registeredAt: normalizeDate(e.registeredAt) || now,
          releasedAt: null,
          releaseNote: null,
        });
      });
    }

    this._byId.set(finalId, property);
    this._indexGushHelka(property);
    this._audited('registerProperty', { id: finalId });
    return this._public(property);
  }

  // ─── lookup ───────────────────────────────────────────────────

  getProperty(id) {
    const p = this._byId.get(id);
    return p ? this._public(p) : null;
  }

  getPropertyByGushHelka(gush, helka, subParcel) {
    const g = toIntOrNull(gush);
    const h = toIntOrNull(helka);
    if (g === null || h === null) return null;

    if (subParcel !== undefined && subParcel !== null && subParcel !== '') {
      const s = toIntOrNull(subParcel);
      const key = gushHelkaKey(g, h, s);
      const set = this._byGushHelka.get(key);
      if (!set || set.size === 0) return null;
      // Exact match: expect one; return first public snapshot.
      for (const pid of set) {
        const prop = this._byId.get(pid);
        if (prop && prop.subParcel === s) return this._public(prop);
      }
      return null;
    }

    // No sub-parcel — return ALL properties in the gush/helka (e.g. an
    // entire בית משותף). Returns array even when single, so callers can
    // iterate uniformly. Null when nothing found.
    const pairKey = gushHelkaKey(g, h, null);
    const set = this._byGushHelka.get(pairKey);
    if (!set || set.size === 0) return null;
    const out = [];
    for (const pid of set) {
      const prop = this._byId.get(pid);
      if (prop) out.push(this._public(prop));
    }
    return out.length === 1 ? out[0] : out;
  }

  listProperties(filter) {
    const all = [];
    for (const prop of this._byId.values()) {
      if (filter && typeof filter === 'object') {
        if (filter.propertyType && prop.propertyType !== filter.propertyType) continue;
        if (filter.gush !== undefined && prop.gush !== toIntOrNull(filter.gush)) continue;
        if (filter.helka !== undefined && prop.helka !== toIntOrNull(filter.helka)) continue;
      }
      all.push(this._public(prop));
    }
    return all;
  }

  // ─── Tabu linkage ─────────────────────────────────────────────

  linkToTabu(propertyId, tabuRef) {
    const property = this._requireProperty(propertyId);
    if (!tabuRef || typeof tabuRef !== 'object') {
      throw new TypeError('linkToTabu: tabuRef object required');
    }
    const entry = {
      id: makeId('tabu'),
      extractNumber: tabuRef.extractNumber || tabuRef.number || null,
      issuedAt: normalizeDate(tabuRef.issuedAt || tabuRef.date),
      office: tabuRef.office || null,   // לשכת רישום המקרקעין
      pdfUrl: tabuRef.pdfUrl || null,
      hash: tabuRef.hash || null,
      owners: Array.isArray(tabuRef.owners) ? tabuRef.owners.slice() : [],
      encumbrancesDeclared: Array.isArray(tabuRef.encumbrances)
        ? tabuRef.encumbrances.slice()
        : [],
      linkedAt: this._now(),
    };
    property.tabuLinks.push(entry);
    property.updatedAt = this._now();

    // If the Tabu extract declared owners we were not tracking, append
    // them to ownerHistory (never delete).
    if (Array.isArray(tabuRef.owners)) {
      tabuRef.owners.forEach((ownerName) => {
        if (!nonEmptyString(ownerName)) return;
        const already = property.ownerHistory.find(
          (o) => o.name === ownerName && o.source === 'tabu',
        );
        if (!already) {
          property.ownerHistory.push({
            id: makeId('own'),
            name: ownerName,
            from: entry.issuedAt || entry.linkedAt,
            to: null,
            source: 'tabu',
            tabuLinkId: entry.id,
            recordedAt: entry.linkedAt,
          });
        }
      });
    }

    this._audited('linkToTabu', { propertyId, tabuId: entry.id });
    return this._public(property);
  }

  // ─── owner history (chain of title) ───────────────────────────

  addOwner(propertyId, owner) {
    const property = this._requireProperty(propertyId);
    if (!owner || typeof owner !== 'object') {
      throw new TypeError('addOwner: owner object required');
    }
    if (!nonEmptyString(owner.name)) {
      throw new Error('addOwner: owner.name required');
    }
    const now = this._now();
    // Close open ownership (to = now) for anybody still "open", unless the
    // caller explicitly signals co-ownership via keepOpen=true.
    if (!owner.keepOpen) {
      property.ownerHistory.forEach((prev) => {
        if (prev.to === null) prev.to = normalizeDate(owner.from) || now;
      });
    }
    const entry = {
      id: makeId('own'),
      name: owner.name,
      idNumber: owner.idNumber || null,          // ת.ז. / ח.פ.
      from: normalizeDate(owner.from) || now,
      to: normalizeDate(owner.to),
      sharePct: isFiniteNumber(owner.sharePct) ? owner.sharePct : null,
      source: owner.source || 'manual',
      note: owner.note || null,
      recordedAt: now,
    };
    property.ownerHistory.push(entry);
    property.updatedAt = now;
    this._audited('addOwner', { propertyId, ownerId: entry.id });
    return Object.freeze(Object.assign({}, entry));
  }

  ownerHistory(propertyId) {
    const property = this._requireProperty(propertyId);
    return property.ownerHistory.map((o) => Object.freeze(Object.assign({}, o)));
  }

  // ─── valuation history ────────────────────────────────────────

  updateValuation(propertyId, valuation) {
    const property = this._requireProperty(propertyId);
    if (!valuation || typeof valuation !== 'object') {
      throw new TypeError('updateValuation: valuation object required');
    }
    if (!isFiniteNumber(valuation.value)) {
      throw new Error('updateValuation: valuation.value (number) required');
    }
    const method = valuation.method || 'self';
    if (!VALUATION_METHODS.includes(method)) {
      throw new Error(
        `updateValuation: method must be one of ${VALUATION_METHODS.join(', ')}`,
      );
    }
    const now = this._now();
    const entry = {
      id: makeId('val'),
      date: normalizeDate(valuation.date) || now,
      value: valuation.value,
      valuer: valuation.valuer || null,       // שמאי מקרקעין
      method,
      note: valuation.note || null,
      currency: valuation.currency || 'ILS',
      recordedAt: now,
    };
    property.valuationHistory.push(entry);
    // "Current" reflects the latest-by-date entry so back-dated historical
    // appraisals never clobber a newer number.
    const latest = this._latestValuation(property);
    property._currentValue = latest ? latest.value : entry.value;
    property.updatedAt = now;
    this._audited('updateValuation', { propertyId, valuationId: entry.id });
    return Object.freeze(Object.assign({}, entry));
  }

  _latestValuation(property) {
    if (!property.valuationHistory.length) return null;
    let best = null;
    for (const v of property.valuationHistory) {
      if (best === null || new Date(v.date) >= new Date(best.date)) best = v;
    }
    return best;
  }

  valuationHistory(propertyId) {
    const property = this._requireProperty(propertyId);
    // Sorted ascending by appraisal date so it is chronological, never
    // truncated. Copies are frozen to keep the caller from mutating internal
    // state.
    return property.valuationHistory
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((v) => Object.freeze(Object.assign({}, v)));
  }

  currentValuation(propertyId) {
    const property = this._requireProperty(propertyId);
    const latest = this._latestValuation(property);
    return latest ? Object.freeze(Object.assign({}, latest)) : null;
  }

  // ─── encumbrances ─────────────────────────────────────────────

  addEncumbrance(propertyId, encumbrance) {
    const property = this._requireProperty(propertyId);
    if (!encumbrance || typeof encumbrance !== 'object') {
      throw new TypeError('addEncumbrance: encumbrance object required');
    }
    if (!ENCUMBRANCE_TYPES.includes(encumbrance.type)) {
      throw new Error(
        `addEncumbrance: type must be one of ${ENCUMBRANCE_TYPES.join(', ')}`,
      );
    }
    const now = this._now();
    const entry = {
      id: makeId('enc'),
      type: encumbrance.type,
      holder: nonEmptyString(encumbrance.holder) ? encumbrance.holder : null,
      amount: isFiniteNumber(encumbrance.amount) ? encumbrance.amount : null,
      currency: encumbrance.currency || 'ILS',
      description: encumbrance.description || null,
      registeredAt: normalizeDate(encumbrance.registeredAt) || now,
      referenceNumber: encumbrance.referenceNumber || null,
      court: encumbrance.court || null,           // relevant for injunctions
      releasedAt: null,
      releaseNote: null,
    };
    property.encumbrances.push(entry);
    property.updatedAt = now;
    this._audited('addEncumbrance', { propertyId, encumbranceId: entry.id });
    return Object.freeze(Object.assign({}, entry));
  }

  releaseEncumbrance(propertyId, encumbranceId, note) {
    const property = this._requireProperty(propertyId);
    const entry = property.encumbrances.find((e) => e.id === encumbranceId);
    if (!entry) throw new Error(`encumbrance not found: ${encumbranceId}`);
    // Never delete — just mark released and add a note. Upgrade, not delete.
    if (entry.releasedAt === null) {
      entry.releasedAt = this._now();
      entry.releaseNote = note || null;
      property.updatedAt = entry.releasedAt;
      this._audited('releaseEncumbrance', { propertyId, encumbranceId });
    }
    return Object.freeze(Object.assign({}, entry));
  }

  encumbrances(propertyId, opts) {
    const property = this._requireProperty(propertyId);
    const includeReleased = !!(opts && opts.includeReleased);
    return property.encumbrances
      .filter((e) => includeReleased || e.releasedAt === null)
      .map((e) => Object.freeze(Object.assign({}, e)));
  }

  // ─── ownership shares (partial ownership, e.g. 50/50 spouses) ───

  ownershipShare(params) {
    if (!params || typeof params !== 'object') {
      throw new TypeError('ownershipShare: params object required');
    }
    const { propertyId, owner, sharePct } = params;
    const property = this._requireProperty(propertyId);
    if (!nonEmptyString(owner)) {
      throw new Error('ownershipShare: owner (string) required');
    }
    if (!isFiniteNumber(sharePct)) {
      throw new Error('ownershipShare: sharePct (number) required');
    }
    if (sharePct < 0 || sharePct > 100) {
      throw new Error('ownershipShare: sharePct must be between 0 and 100');
    }

    const running = property.shares.reduce((s, r) => s + r.sharePct, 0);
    if (running + sharePct > 100 + 1e-6) {
      throw new Error(
        `ownershipShare: total shares would exceed 100% (current=${running}%, adding=${sharePct}%)`,
      );
    }

    const now = this._now();
    const record = {
      id: makeId('shr'),
      owner,
      sharePct,
      recordedAt: now,
    };
    property.shares.push(record);
    property.updatedAt = now;
    this._audited('ownershipShare', { propertyId, shareId: record.id });
    return Object.freeze(Object.assign({}, record));
  }

  totalOwnershipShare(propertyId) {
    const property = this._requireProperty(propertyId);
    return property.shares.reduce((s, r) => s + r.sharePct, 0);
  }

  ownershipShares(propertyId) {
    const property = this._requireProperty(propertyId);
    return property.shares.map((r) => Object.freeze(Object.assign({}, r)));
  }

  // ─── cadastral data — ADOT / MAPI stub ────────────────────────
  /**
   * In production this would hit the ADOT / המרכז למיפוי ישראל (MAPI)
   * API, or scrape the public Govmap layer. In this module it's a pure stub
   * that returns a predictable blob shape so upstream code can be wired
   * and tested. Replace `_cadastralFetcher` via opts.cadastralFetcher for a
   * real integration.
   */
  cadastralData(propertyId) {
    const property = this._requireProperty(propertyId);
    if (property.cadastral) {
      return Object.freeze(Object.assign({}, property.cadastral));
    }
    const blob = {
      source: 'ADOT',
      gush: property.gush,
      helka: property.helka,
      subParcel: property.subParcel,
      planReference: null,
      coordinates: null,       // {x,y} in ITM (Israeli Transverse Mercator) when wired
      zoning: null,            // ייעוד תכנוני
      plannedUse: null,        // שימוש מותר
      buildingRights: null,    // זכויות בנייה
      bettermentLevy: null,    // היטל השבחה — raw uplift data from מחלקת הנדסה
      fetchedAt: null,
      note:
        'stub — wire PropertyManager with opts.cadastralFetcher to pull real data from ADOT/MAPI',
    };
    property.cadastral = blob;
    property.updatedAt = this._now();
    return Object.freeze(Object.assign({}, blob));
  }

  // ─── export / snapshot ────────────────────────────────────────

  exportProperty(propertyId) {
    const property = this._requireProperty(propertyId);
    return JSON.parse(JSON.stringify(this._public(property)));
  }

  snapshot() {
    return {
      meta: {
        engine: 'property-manager',
        version: '1.0.0',
        generatedAt: this._now(),
        count: this._byId.size,
      },
      properties: Array.from(this._byId.values()).map((p) =>
        JSON.parse(JSON.stringify(this._public(p))),
      ),
    };
  }

  auditTrail() {
    return this._audit.slice();
  }

  // ─── public projection ────────────────────────────────────────

  _public(property) {
    // Shallow clone with the computed currentValue to keep reads immutable
    // from the caller's side. Arrays are returned as shallow copies.
    return {
      id: property.id,
      address: property.address,
      gush: property.gush,
      helka: property.helka,
      subParcel: property.subParcel,
      propertyType: property.propertyType,
      propertyTypeHe: HEBREW_LABELS[property.propertyType] || property.propertyType,
      areaSqm: property.areaSqm,
      rooms: property.rooms,
      floors: property.floors,
      purchaseDate: property.purchaseDate,
      purchasePrice: property.purchasePrice,
      currentValue: property._currentValue,
      photos: property.photos.slice(),
      blueprints: property.blueprints.slice(),
      certificates: property.certificates.slice(),
      tabuLinks: property.tabuLinks.map((t) => Object.assign({}, t)),
      ownerHistory: property.ownerHistory.map((o) => Object.assign({}, o)),
      valuationHistory: property.valuationHistory.map((v) => Object.assign({}, v)),
      encumbrances: property.encumbrances.map((e) => Object.assign({}, e)),
      shares: property.shares.map((s) => Object.assign({}, s)),
      cadastral: property.cadastral ? Object.assign({}, property.cadastral) : null,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      labels: HEBREW_LABELS,
    };
  }
}

// ──────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────

module.exports = {
  PropertyManager,
  PROPERTY_TYPES,
  VALUATION_METHODS,
  ENCUMBRANCE_TYPES,
  CADASTRAL_SOURCES,
  HEBREW_LABELS,
  // Internals exported for white-box unit tests — never import from app code.
  _internal: deepFreeze({
    gushHelkaKey,
    toIntOrNull,
    normalizeDate,
    nonEmptyString,
    isFiniteNumber,
    cloneShallow,
  }),
};
