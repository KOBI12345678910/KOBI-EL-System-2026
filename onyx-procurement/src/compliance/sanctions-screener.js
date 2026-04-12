/**
 * SanctionsScreener — Multi-Source Sanctions & Export-Control Screening
 * Techno-Kol Uzi Mega-ERP
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים
 * (Never delete — only upgrade and grow)
 *
 * Zero dependencies. Bilingual (HE/EN). Hebrew RTL metadata exported.
 *
 * Sources covered:
 *   - OFAC SDN / US Treasury
 *   - EU Consolidated List
 *   - UN Security Council (UNSC) Consolidated List
 *   - Israeli Defense Export Control — חוק פיקוח על יצוא ביטחוני (MOD / DECA)
 *
 * Additional compliance surfaces:
 *   - Blocked jurisdictions (embargoed countries / regions)
 *   - Dual-use goods screening (Wassenaar-adjacent, metal parts / aerospace)
 *   - End-use declaration validator
 *   - False-positive review queue
 *   - Append-only audit trail
 *   - Alerts for list deltas since last screen
 *   - SHA-256 checksum tracking for list versions (Node built-in crypto)
 *
 * Transport is mockable via `injectTransport(fn)` — the fetcher receives
 * the source key and must resolve with the raw payload (string | object).
 *
 * File: onyx-procurement/src/compliance/sanctions-screener.js
 */

'use strict';

const crypto = require('node:crypto');

// ---- Constants --------------------------------------------------------------

const SOURCES = Object.freeze({
  OFAC: {
    key: 'OFAC',
    he: 'רשימת OFAC — משרד האוצר האמריקאי',
    en: 'OFAC — US Treasury SDN List',
    authority: 'US Treasury',
    url: 'https://sanctionslistservice.ofac.treas.gov/api/download/sdn.xml',
  },
  EU: {
    key: 'EU',
    he: 'רשימת סנקציות מאוחדת — האיחוד האירופי',
    en: 'EU Consolidated Sanctions List',
    authority: 'European Union',
    url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList',
  },
  UN: {
    key: 'UN',
    he: 'רשימת מועצת הביטחון של האו״ם',
    en: 'UN Security Council Consolidated List',
    authority: 'United Nations',
    url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  },
  IL_DECA: {
    key: 'IL_DECA',
    he: 'אגף פיקוח על יצוא ביטחוני — משרד הביטחון',
    en: 'Israeli Defense Export Control (DECA) — Ministry of Defense',
    authority: 'Israel MOD / DECA',
    url: 'https://www.gov.il/he/departments/ministry_of_defense/govil-landing-page',
  },
});

/**
 * Blocked jurisdictions — comprehensive embargo list.
 * Matching is case-insensitive and tolerates Hebrew / English variants.
 */
const BLOCKED_JURISDICTIONS = Object.freeze({
  'iran':           { he: 'איראן',          en: 'Iran',           iso: 'IR', severity: 'critical' },
  'north-korea':    { he: 'צפון קוריאה',    en: 'North Korea',    iso: 'KP', severity: 'critical' },
  'syria':          { he: 'סוריה',          en: 'Syria',          iso: 'SY', severity: 'critical' },
  'crimea':         { he: 'קרים',           en: 'Crimea',         iso: 'UA-43', severity: 'critical' },
  'donetsk':        { he: 'דונייצק',        en: 'Donetsk',        iso: 'UA-14', severity: 'critical' },
  'luhansk':        { he: 'לוהנסק',         en: 'Luhansk',        iso: 'UA-09', severity: 'critical' },
  'cuba':           { he: 'קובה',           en: 'Cuba',           iso: 'CU', severity: 'high'     },
  'venezuela':      { he: 'ונצואלה',        en: 'Venezuela',      iso: 'VE', severity: 'high'     },
  'belarus':        { he: 'בלארוס',         en: 'Belarus',        iso: 'BY', severity: 'high'     },
  'russia':         { he: 'רוסיה',          en: 'Russia',         iso: 'RU', severity: 'high'     },
  'myanmar':        { he: 'מיאנמר',         en: 'Myanmar',        iso: 'MM', severity: 'medium'   },
  'sudan':          { he: 'סודן',           en: 'Sudan',          iso: 'SD', severity: 'medium'   },
  'south-sudan':    { he: 'דרום סודן',      en: 'South Sudan',    iso: 'SS', severity: 'medium'   },
  'somalia':        { he: 'סומליה',         en: 'Somalia',        iso: 'SO', severity: 'medium'   },
  'libya':          { he: 'לוב',            en: 'Libya',          iso: 'LY', severity: 'medium'   },
  'yemen':          { he: 'תימן',           en: 'Yemen',          iso: 'YE', severity: 'medium'   },
  'lebanon':        { he: 'לבנון',          en: 'Lebanon',        iso: 'LB', severity: 'high'     },
  'gaza':           { he: 'עזה',            en: 'Gaza',           iso: 'PS-GZ', severity: 'high'  },
});

/**
 * Jurisdiction aliases: any string → canonical key.
 */
const JURISDICTION_ALIASES = Object.freeze({
  'ir':              'iran',
  'islamic republic of iran': 'iran',
  'persia':          'iran',
  'איראן':          'iran',
  'kp':              'north-korea',
  'dprk':            'north-korea',
  'democratic people\'s republic of korea': 'north-korea',
  'north korea':     'north-korea',
  'צפון קוריאה':    'north-korea',
  'sy':              'syria',
  'syrian arab republic': 'syria',
  'סוריה':           'syria',
  'קרים':            'crimea',
  'crimea peninsula': 'crimea',
  'donbass':         'donetsk',
  'donetsk people\'s republic': 'donetsk',
  'דונייצק':         'donetsk',
  'luhansk people\'s republic': 'luhansk',
  'לוהנסק':          'luhansk',
  'cu':              'cuba',
  'קובה':            'cuba',
  've':              'venezuela',
  'bolivarian republic of venezuela': 'venezuela',
  'ונצואלה':         'venezuela',
  'by':              'belarus',
  'republic of belarus': 'belarus',
  'בלארוס':          'belarus',
  'ru':              'russia',
  'russian federation': 'russia',
  'רוסיה':           'russia',
  'mm':              'myanmar',
  'burma':           'myanmar',
  'מיאנמר':         'myanmar',
  'sd':              'sudan',
  'סודן':            'sudan',
  'so':              'somalia',
  'סומליה':          'somalia',
  'ly':              'libya',
  'לוב':             'libya',
  'ye':              'yemen',
  'תימן':            'yemen',
  'lb':              'lebanon',
  'לבנון':           'lebanon',
  'gz':              'gaza',
  'עזה':             'gaza',
  'gaza strip':      'gaza',
});

/**
 * Dual-use goods keywords (Wassenaar-adjacent).
 * Organised by category.  Keywords are lowercased matched substrings.
 */
const DUAL_USE_KEYWORDS = Object.freeze({
  'metallurgy': {
    he: 'מתכות ומוצרי מתכת לשימוש כפול',
    en: 'Metals & metal-products (dual use)',
    keywords: [
      'titanium', 'titanium alloy', 'titanium 6al-4v', 'ti-6al-4v',
      'maraging steel', 'hastelloy', 'inconel', 'monel',
      'tungsten', 'tantalum', 'niobium', 'zirconium',
      'beryllium', 'beryllium copper',
      'depleted uranium', 'hafnium',
      'carbon fiber', 'aramid fiber',
    ],
  },
  'aerospace': {
    he: 'רכיבי תעופה וחלל',
    en: 'Aerospace components',
    keywords: [
      'turbine blade', 'jet engine', 'rocket motor', 'solid propellant',
      'gyroscope', 'accelerometer', 'inertial navigation',
      'uav', 'drone', 'unmanned aerial',
      'satellite component', 'reentry vehicle', 'heat shield',
      'guidance system', 'autopilot',
    ],
  },
  'machine-tools': {
    he: 'מכונות CNC ומכונות כיול דיוק גבוה',
    en: 'CNC / precision machine tools',
    keywords: [
      '5-axis cnc', 'five-axis cnc', '5 axis',
      'electron beam welder', 'ebw',
      'isostatic press', 'vacuum furnace',
      'spin-forming', 'flow-forming',
      'centrifugal balancing', 'coordinate measuring machine',
    ],
  },
  'electronics': {
    he: 'רכיבי אלקטרוניקה לשימוש צבאי',
    en: 'Military-grade electronics',
    keywords: [
      'fpga military grade', 'radiation hardened', 'rad-hard',
      'frequency synthesizer', 'rf amplifier',
      'thermal imager', 'night vision',
      'laser range finder', 'lidar military',
    ],
  },
  'materials': {
    he: 'חומרים מיוחדים',
    en: 'Special materials',
    keywords: [
      'high explosive', 'rdx', 'hmx', 'petn',
      'composite armor', 'ballistic plate',
      'chemical agent precursor',
      'nuclear grade graphite', 'heavy water',
    ],
  },
});

/**
 * Israeli export control keywords — חוק פיקוח על יצוא ביטחוני.
 */
const ISRAELI_EXPORT_KEYWORDS = Object.freeze([
  'כלי נשק',
  'פריט לשימוש כפול',
  'MCTL',
  'mctl',
  'פיקוח יצוא ביטחוני',
  'רישיון יצוא ביטחוני',
  'אמצעי לחימה',
  'טכנולוגיה רגישה',
  'defense export',
  'defense article',
  'military commodity',
  'munitions list',
  'wassenaar',
]);

/**
 * Common end-use declaration red-flag phrases.
 */
const END_USE_RED_FLAGS = Object.freeze([
  'military application',
  'weapons development',
  'wmd',
  'weapons of mass destruction',
  'nuclear enrichment',
  'missile development',
  'כלי נשק',
  'נשק גרעיני',
  'נשק כימי',
  'נשק ביולוגי',
  'שימוש צבאי',
  'פיתוח טילים',
]);

// ---- Helpers ----------------------------------------------------------------

function nowISO() { return new Date().toISOString(); }

let _uidCounter = 0;
function uid(prefix) {
  _uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_uidCounter.toString(36)}`;
}

function clone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function sha256(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Normalise a name/string for fuzzy matching.
 *   - lowercase
 *   - strip diacritics (Latin + Hebrew niqqud)
 *   - collapse whitespace / punctuation
 */
function normalise(s) {
  if (!nonEmptyString(s)) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')          // Hebrew niqqud/cantillation
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Latin diacritics
    .replace(/[\.,'"()\[\]{}!?;:\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenise a normalised string into meaningful tokens (length >= 2).
 */
function tokenize(s) {
  const n = normalise(s);
  if (!n) return [];
  return n.split(' ').filter(t => t.length >= 2);
}

/**
 * Levenshtein distance — iterative, O(n*m). For fuzzy token matching.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length, n = b.length;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Token similarity — 0..1, 1 = identical.
 * Uses Levenshtein ratio with a small-token boost.
 */
function tokenSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (dist / maxLen);
}

/**
 * Jaccard-style overlap between two token arrays, but with fuzzy equality.
 */
function fuzzyTokenOverlap(tokensA, tokensB, threshold = 0.82) {
  if (!tokensA.length || !tokensB.length) return 0;
  let matches = 0;
  const usedB = new Set();
  for (const ta of tokensA) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let j = 0; j < tokensB.length; j++) {
      if (usedB.has(j)) continue;
      const sim = tokenSimilarity(ta, tokensB[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    if (bestSim >= threshold) {
      matches += bestSim;
      if (bestIdx >= 0) usedB.add(bestIdx);
    }
  }
  const denom = Math.max(tokensA.length, tokensB.length);
  return matches / denom;
}

/**
 * Default parser — pass-through for already-structured arrays of entries.
 * An "entry" is `{ name, aliases?, country?, dob?, address?, uid? }`.
 */
function defaultParser(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.entries)) return payload.entries;
  if (typeof payload === 'string') {
    // Try JSON first
    try {
      const j = JSON.parse(payload);
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.entries)) return j.entries;
    } catch (_e) { /* fall through */ }
    // Minimal CSV fallback: first column = name, others = aliases
    const lines = payload.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const cols = line.split(/[;,\t]/).map(c => c.trim()).filter(Boolean);
      return { name: cols[0], aliases: cols.slice(1) };
    });
  }
  return [];
}

// ---- SanctionsScreener ------------------------------------------------------

class SanctionsScreener {
  constructor(opts = {}) {
    // Per-source state: listEntries, version, checksum, loadedAt, meta
    this.lists = new Map();           // sourceKey -> { entries, checksum, loadedAt, version, count }
    this.previousEntries = new Map(); // sourceKey -> Set<normalisedName>  (for delta alerts)
    this.screenHistory = [];          // append-only list of all screens
    this.auditTrail = [];             // append-only audit of every mutation
    this.reviewQueue = [];            // false-positive review items
    this.alerts = [];                 // delta alerts since last screen
    this.endUseDeclarations = [];     // validated declarations
    this.fuzzyThreshold = opts.fuzzyThreshold || 0.82;
    this.strictMatchThreshold = opts.strictMatchThreshold || 0.95;
    this._transport = opts.transport || null; // async (source) => payload
    this.sources = SOURCES;
    this.blockedJurisdictions = BLOCKED_JURISDICTIONS;
    this.jurisdictionAliases = JURISDICTION_ALIASES;
    this.dualUseKeywords = DUAL_USE_KEYWORDS;
    this.israeliExportKeywords = ISRAELI_EXPORT_KEYWORDS;
    this.endUseRedFlags = END_USE_RED_FLAGS;
    this.locale = opts.locale || 'he';
    this.direction = 'rtl'; // Hebrew RTL
  }

  // ---- audit (append-only) ---------------------------------------------------

  _audit(action, payload) {
    this.auditTrail.push({
      ts: nowISO(),
      action,
      payload: clone(payload || {}),
    });
  }

  // ---- transport injection ---------------------------------------------------

  /**
   * Inject a mock fetcher. Receives `(sourceKey)` and must resolve with
   * either a string payload or a parsed object/array.
   */
  injectTransport(fn) {
    if (typeof fn !== 'function') {
      throw new Error('transport must be a function');
    }
    this._transport = fn;
    this._audit('injectTransport', { });
    return this;
  }

  // ---- loadList --------------------------------------------------------------

  /**
   * Load a list from a source.
   *   loadList('OFAC', parser?)          → uses injected transport
   *   loadList('OFAC', parser?, payload) → direct load from payload
   *
   * Returns: { source, count, checksum, version, loadedAt, added, removed }
   */
  async loadList(sourceKey, parser, directPayload) {
    if (!SOURCES[sourceKey]) {
      throw new Error(`unknown sanctions source: ${sourceKey}`);
    }
    const src = SOURCES[sourceKey];
    const parseFn = typeof parser === 'function' ? parser : defaultParser;

    let payload;
    if (typeof directPayload !== 'undefined') {
      payload = directPayload;
    } else if (this._transport) {
      payload = await this._transport(sourceKey, src);
    } else {
      throw new Error(`no transport injected; call injectTransport(fn) or pass a direct payload`);
    }

    let entries;
    try {
      entries = parseFn(payload);
    } catch (e) {
      throw new Error(`parser failed for ${sourceKey}: ${e.message}`);
    }
    if (!Array.isArray(entries)) {
      throw new Error(`parser for ${sourceKey} must return an array; got ${typeof entries}`);
    }

    // Normalise entries — preserve originals, add normalised cache
    const normalised = entries.map(e => {
      const name = e && (e.name || e.fullName || e.Name) || '';
      const aliases = []
        .concat(Array.isArray(e.aliases) ? e.aliases : [])
        .concat(Array.isArray(e.aka) ? e.aka : [])
        .filter(nonEmptyString);
      return {
        uid: e.uid || e.id || uid('ent'),
        name,
        aliases,
        country: e.country || e.nationality || null,
        dob: e.dob || null,
        address: e.address || null,
        type: e.type || 'individual',
        listed_on: e.listed_on || e.listedOn || null,
        source: sourceKey,
        _norm: normalise(name),
        _aliasNorm: aliases.map(normalise).filter(Boolean),
        _tokens: tokenize(name),
      };
    });

    const checksum = sha256(normalised.map(e => `${e._norm}|${e._aliasNorm.join(',')}`).join('\n'));

    // Delta tracking: what's new since last load?
    const prevNames = this.previousEntries.get(sourceKey) || new Set();
    const currNames = new Set(normalised.map(e => e._norm));
    const added = [];
    const removed = [];
    for (const n of currNames) { if (!prevNames.has(n)) added.push(n); }
    for (const n of prevNames) { if (!currNames.has(n)) removed.push(n); }

    const version = (this.lists.get(sourceKey)?.version || 0) + 1;
    const record = {
      source: sourceKey,
      meta: clone(src),
      entries: normalised,
      count: normalised.length,
      checksum,
      version,
      loadedAt: nowISO(),
      added,
      removed,
    };

    this.lists.set(sourceKey, record);
    this.previousEntries.set(sourceKey, currNames);

    // Generate alerts for newly-added names (never delete removed — we log them)
    if (added.length) {
      const alert = {
        id: uid('alert'),
        ts: nowISO(),
        source: sourceKey,
        type: 'new-additions',
        count: added.length,
        names: added.slice(0, 50),
      };
      this.alerts.push(alert);
    }

    this._audit('loadList', {
      source: sourceKey,
      count: normalised.length,
      checksum,
      version,
      added: added.length,
      removed: removed.length,
    });

    return {
      source: sourceKey,
      count: normalised.length,
      checksum,
      version,
      loadedAt: record.loadedAt,
      added,
      removed,
    };
  }

  // ---- fuzzyMatch ------------------------------------------------------------

  /**
   * Match a single query against a single list entry.
   * Returns { score, matchedOn } or null if below threshold.
   * matchedOn: 'exact' | 'alias' | 'fuzzy' | 'alias-fuzzy'
   */
  fuzzyMatch(query, entry, threshold) {
    const thr = typeof threshold === 'number' ? threshold : this.fuzzyThreshold;
    const qNorm = normalise(query);
    if (!qNorm) return null;

    // Exact on canonical name
    if (qNorm === entry._norm) {
      return { score: 1, matchedOn: 'exact' };
    }
    // Exact on alias
    for (const a of entry._aliasNorm) {
      if (a === qNorm) {
        return { score: 1, matchedOn: 'alias' };
      }
    }

    const qTokens = tokenize(query);
    const best = { score: 0, matchedOn: null };

    // Fuzzy vs canonical tokens
    const sim = fuzzyTokenOverlap(qTokens, entry._tokens, thr);
    if (sim > best.score) {
      best.score = sim;
      best.matchedOn = 'fuzzy';
    }
    // Fuzzy vs each alias
    for (const aNorm of entry._aliasNorm) {
      const aTokens = tokenize(aNorm);
      const sa = fuzzyTokenOverlap(qTokens, aTokens, thr);
      if (sa > best.score) {
        best.score = sa;
        best.matchedOn = 'alias-fuzzy';
      }
    }

    if (best.score >= thr) return best;
    return null;
  }

  // ---- screen ----------------------------------------------------------------

  /**
   * Screen an entity against all loaded lists.
   *
   * entity = {
   *   name, aliases?, country?, jurisdiction?,
   *   goods?:[{ description }], endUseDeclaration?: string|object
   * }
   *
   * Returns: {
   *   clear, screenedAt, query, hitsBySource, totalHits,
   *   jurisdictionBlocked, dualUseHits, israeliExportFlags,
   *   endUseValidation, recommendation, screenId
   * }
   */
  screen(entity) {
    if (!entity || typeof entity !== 'object') {
      throw new Error('entity object required');
    }
    if (!nonEmptyString(entity.name)) {
      throw new Error('entity.name is required');
    }
    const screenId = uid('screen');
    const screenedAt = nowISO();

    const hitsBySource = {};
    let totalHits = 0;

    const queries = [entity.name].concat(
      Array.isArray(entity.aliases) ? entity.aliases.filter(nonEmptyString) : []
    );

    for (const [sourceKey, record] of this.lists.entries()) {
      const hits = [];
      for (const entry of record.entries) {
        let bestMatch = null;
        for (const q of queries) {
          const m = this.fuzzyMatch(q, entry);
          if (m && (!bestMatch || m.score > bestMatch.score)) {
            bestMatch = { ...m, query: q };
          }
        }
        if (bestMatch) {
          hits.push({
            entryUid: entry.uid,
            entryName: entry.name,
            score: Number(bestMatch.score.toFixed(4)),
            matchedOn: bestMatch.matchedOn,
            query: bestMatch.query,
            confidence: bestMatch.score >= this.strictMatchThreshold ? 'high' : 'medium',
          });
        }
      }
      hitsBySource[sourceKey] = hits;
      totalHits += hits.length;
    }

    // Jurisdiction check
    const jurisdictionBlocked = this.checkJurisdiction(
      entity.jurisdiction || entity.country || ''
    );

    // Dual-use check (based on goods descriptions)
    const dualUseHits = Array.isArray(entity.goods)
      ? this.checkDualUseGoods(entity.goods)
      : { flagged: false, hits: [] };

    // Israeli export keywords (across name + goods + declaration)
    const israeliExportFlags = this._checkIsraeliExport(entity);

    // End-use declaration validation
    const endUseValidation = entity.endUseDeclaration
      ? this.validateEndUseDeclaration(entity.endUseDeclaration)
      : { required: true, present: false, valid: false, reasons: ['missing-declaration'] };

    // Decision
    const clear =
      totalHits === 0 &&
      !jurisdictionBlocked.blocked &&
      !dualUseHits.flagged &&
      !israeliExportFlags.flagged &&
      (endUseValidation.valid || !endUseValidation.required);

    let recommendation;
    if (clear) {
      recommendation = { action: 'approve', he: 'אישור המשך פעילות', en: 'Approve' };
    } else if (
      jurisdictionBlocked.severity === 'critical' ||
      totalHits > 0
    ) {
      recommendation = { action: 'block', he: 'חסימה וביקורת מיידית', en: 'Block & escalate' };
    } else {
      recommendation = { action: 'review', he: 'דרוש עיון ידני', en: 'Manual review required' };
    }

    const result = {
      screenId,
      screenedAt,
      query: entity.name,
      clear,
      hitsBySource,
      totalHits,
      jurisdictionBlocked,
      dualUseHits,
      israeliExportFlags,
      endUseValidation,
      recommendation,
    };

    this.screenHistory.push(clone(result));
    this._audit('screen', { screenId, query: entity.name, totalHits, clear });

    // Any fuzzy (non-exact) hit goes to the false-positive review queue
    for (const [src, hits] of Object.entries(hitsBySource)) {
      for (const h of hits) {
        if (h.matchedOn !== 'exact' && h.matchedOn !== 'alias') {
          this.reviewQueue.push({
            id: uid('rev'),
            screenId,
            source: src,
            entryUid: h.entryUid,
            entryName: h.entryName,
            query: h.query,
            score: h.score,
            matchedOn: h.matchedOn,
            state: 'pending',
            createdAt: nowISO(),
          });
        }
      }
    }

    return result;
  }

  // ---- checkJurisdiction -----------------------------------------------------

  checkJurisdiction(input) {
    const q = normalise(input);
    if (!q) return { blocked: false, severity: null, jurisdiction: null };

    // Direct canonical key
    if (BLOCKED_JURISDICTIONS[q]) {
      return {
        blocked: true,
        severity: BLOCKED_JURISDICTIONS[q].severity,
        jurisdiction: q,
        he: BLOCKED_JURISDICTIONS[q].he,
        en: BLOCKED_JURISDICTIONS[q].en,
        iso: BLOCKED_JURISDICTIONS[q].iso,
      };
    }
    // Alias
    const canonical = JURISDICTION_ALIASES[q];
    if (canonical && BLOCKED_JURISDICTIONS[canonical]) {
      return {
        blocked: true,
        severity: BLOCKED_JURISDICTIONS[canonical].severity,
        jurisdiction: canonical,
        he: BLOCKED_JURISDICTIONS[canonical].he,
        en: BLOCKED_JURISDICTIONS[canonical].en,
        iso: BLOCKED_JURISDICTIONS[canonical].iso,
        via: 'alias',
      };
    }
    // Substring fallback (catches "Islamic Republic of Iran", "Crimea Peninsula", etc.)
    for (const [key, meta] of Object.entries(BLOCKED_JURISDICTIONS)) {
      if (q.includes(key) || q.includes(normalise(meta.en))) {
        return {
          blocked: true,
          severity: meta.severity,
          jurisdiction: key,
          he: meta.he,
          en: meta.en,
          iso: meta.iso,
          via: 'substring',
        };
      }
    }
    return { blocked: false, severity: null, jurisdiction: null };
  }

  // ---- checkDualUseGoods -----------------------------------------------------

  checkDualUseGoods(goods) {
    const items = Array.isArray(goods) ? goods : [goods];
    const hits = [];
    for (const g of items) {
      if (!g) continue;
      const desc = normalise(
        typeof g === 'string' ? g : (g.description || g.name || '')
      );
      if (!desc) continue;
      for (const [catKey, cat] of Object.entries(DUAL_USE_KEYWORDS)) {
        for (const kw of cat.keywords) {
          if (desc.includes(normalise(kw))) {
            hits.push({
              category: catKey,
              categoryHe: cat.he,
              categoryEn: cat.en,
              keyword: kw,
              matched: desc,
              goods: g,
            });
          }
        }
      }
    }
    return { flagged: hits.length > 0, hits };
  }

  // ---- _checkIsraeliExport ---------------------------------------------------

  _checkIsraeliExport(entity) {
    const haystacks = [];
    if (nonEmptyString(entity.name)) haystacks.push(entity.name);
    if (Array.isArray(entity.goods)) {
      for (const g of entity.goods) {
        if (typeof g === 'string') haystacks.push(g);
        else if (g && g.description) haystacks.push(g.description);
      }
    }
    if (entity.endUseDeclaration) {
      haystacks.push(
        typeof entity.endUseDeclaration === 'string'
          ? entity.endUseDeclaration
          : JSON.stringify(entity.endUseDeclaration)
      );
    }
    const combined = haystacks.join(' || ');
    const lower = combined.toLowerCase();
    const matched = [];
    for (const kw of ISRAELI_EXPORT_KEYWORDS) {
      if (combined.includes(kw) || lower.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }
    return {
      flagged: matched.length > 0,
      matched,
      he: matched.length ? 'נדרש רישיון יצוא ביטחוני' : '',
      en: matched.length ? 'Defense export license required' : '',
    };
  }

  // ---- validateEndUseDeclaration ---------------------------------------------

  /**
   * Validates an end-use declaration.
   * Accepts either a free-text string or a structured object:
   *   { endUser, country, purpose, certifiesNoDiversion, signedBy, signedAt }
   */
  validateEndUseDeclaration(declaration) {
    if (!declaration) {
      return { required: true, present: false, valid: false, reasons: ['missing-declaration'] };
    }
    const reasons = [];
    let structured;
    if (typeof declaration === 'string') {
      structured = { purpose: declaration };
    } else {
      structured = Object.assign({}, declaration);
    }

    if (!nonEmptyString(structured.endUser)) reasons.push('missing-endUser');
    if (!nonEmptyString(structured.country)) reasons.push('missing-country');
    if (!nonEmptyString(structured.purpose)) reasons.push('missing-purpose');
    if (structured.certifiesNoDiversion !== true) reasons.push('missing-non-diversion-certification');
    if (!nonEmptyString(structured.signedBy)) reasons.push('missing-signatory');
    if (!nonEmptyString(structured.signedAt)) reasons.push('missing-signature-date');

    // Red-flag scan
    const bodies = [
      structured.purpose || '',
      structured.endUser || '',
      structured.notes || '',
    ].join(' ');
    const redFlags = [];
    for (const rf of END_USE_RED_FLAGS) {
      if (bodies.toLowerCase().includes(rf.toLowerCase())) {
        redFlags.push(rf);
      }
    }
    if (redFlags.length) reasons.push('red-flag-phrases');

    // Jurisdiction inside declaration
    const jur = this.checkJurisdiction(structured.country || '');
    if (jur.blocked) reasons.push('blocked-destination');

    const valid = reasons.length === 0;
    const record = {
      required: true,
      present: true,
      valid,
      reasons,
      redFlags,
      jurisdiction: jur,
      declaration: structured,
      validatedAt: nowISO(),
    };
    this.endUseDeclarations.push(clone(record));
    this._audit('validateEndUseDeclaration', {
      valid,
      reasons,
      redFlagCount: redFlags.length,
    });
    return record;
  }

  // ---- false-positive review queue -------------------------------------------

  /**
   * Review a queued item and mark it resolved.
   * decision: 'false-positive' | 'true-positive'
   * NOTE: items are NEVER deleted — state transitions only (לא מוחקים).
   */
  resolveReview(id, decision, reviewer, notes) {
    const item = this.reviewQueue.find(r => r.id === id);
    if (!item) throw new Error(`review item not found: ${id}`);
    if (!['false-positive', 'true-positive'].includes(decision)) {
      throw new Error('decision must be false-positive or true-positive');
    }
    item.state = decision === 'false-positive' ? 'resolved-false-positive' : 'resolved-true-positive';
    item.reviewedBy = reviewer || null;
    item.reviewedAt = nowISO();
    item.notes = notes || null;
    this._audit('resolveReview', { id, decision, reviewer });
    return clone(item);
  }

  falsePositiveReview({ state } = {}) {
    if (state) return clone(this.reviewQueue.filter(r => r.state === state));
    return clone(this.reviewQueue);
  }

  // ---- alerts ----------------------------------------------------------------

  /**
   * Returns alerts generated since the last screen (or since sinceISO).
   * Alerts are NEVER cleared — consumers page through them.
   */
  getAlerts({ since } = {}) {
    if (!since) return clone(this.alerts);
    const t = new Date(since).getTime();
    return clone(this.alerts.filter(a => new Date(a.ts).getTime() > t));
  }

  // ---- checksums -------------------------------------------------------------

  getChecksums() {
    const out = {};
    for (const [k, v] of this.lists.entries()) {
      out[k] = {
        checksum: v.checksum,
        version: v.version,
        count: v.count,
        loadedAt: v.loadedAt,
      };
    }
    return out;
  }

  // ---- stats -----------------------------------------------------------------

  stats() {
    const listSummary = {};
    for (const [k, v] of this.lists.entries()) {
      listSummary[k] = { count: v.count, version: v.version, checksum: v.checksum };
    }
    return {
      lists: listSummary,
      totalScreens: this.screenHistory.length,
      alerts: this.alerts.length,
      reviewQueueTotal: this.reviewQueue.length,
      reviewPending: this.reviewQueue.filter(r => r.state === 'pending').length,
      auditEntries: this.auditTrail.length,
      direction: this.direction,
      locale: this.locale,
    };
  }
}

module.exports = {
  SanctionsScreener,
  SOURCES,
  BLOCKED_JURISDICTIONS,
  JURISDICTION_ALIASES,
  DUAL_USE_KEYWORDS,
  ISRAELI_EXPORT_KEYWORDS,
  END_USE_RED_FLAGS,
  // Exposed for tests
  normalise,
  tokenize,
  levenshtein,
  tokenSimilarity,
  fuzzyTokenOverlap,
  sha256,
  defaultParser,
};
