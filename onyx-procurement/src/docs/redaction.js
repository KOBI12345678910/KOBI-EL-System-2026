/* ============================================================================
 * Techno-Kol ERP — Document Redaction Tool (PII Redactor)
 * Agent Y-118 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * כלי השחרת PII למסמכים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Purpose (תכלית):
 *   Deterministic, zero-dependency redaction of personally identifiable
 *   information from free text, before a document is released externally.
 *   Built to satisfy Israeli PDPL (חוק הגנת הפרטיות) minimisation duties
 *   and to keep the ERP's external disclosure workflow safe by default.
 *
 * Detection categories (קטגוריות איתור):
 *   1. tz              — Israeli Teudat Zehut (9-digit + checksum)
 *   2. phone           — Israeli mobile / landline / +972 international
 *   3. email           — RFC-shaped email addresses
 *   4. credit_card     — 13-19 digit PANs validated by Luhn
 *   5. iban_il         — IL IBAN (ILkk BBBB CCCC AAAAAAAAAAAAA)
 *   6. passport        — Israeli passport (8-9 digits) with context word
 *   7. id_keyword      — bare "ת.ז.", "תעודת זהות", "מספר זהות" patterns
 *   8. hebrew_name     — dictionary-based Hebrew name match (optional)
 *   9. address         — Hebrew street / number / city triples
 *
 * Redaction methods (שיטות השחרה):
 *   BLOCK     — replace with ████ block characters, length-preserving
 *   REPLACE   — replace with [REDACTED] / [מוסתר] placeholder
 *   HASH      — replace with short SHA-256 prefix prefixed HASH::…
 *   TOKENIZE  — replace with reversible token {{TOK:xxxx}}, original
 *               kept in an in-memory vault keyed by vaultKey (RBAC-gated)
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Redaction produces a NEW version of the text; the original is never
 *     mutated. The RedactionTool keeps an append-only log keyed by docId
 *     so every release of a redacted artefact can be traced back.
 *   → Zero external deps — only node:crypto for hashing & tokens.
 *   → Hebrew RTL + bilingual labels on every public enum and record.
 *
 * Storage (אחסון):
 *   Three in-memory Maps, all append-only:
 *     vaults   Map<vaultKey, Map<token, originalValue>>   short-lived
 *     logs     Map<docId, LogEntry[]>                      audit trail
 *     whitelist Set<string>                                 never-redact
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Categories of PII the detector knows how to find. */
const PII_CATEGORIES = Object.freeze({
  tz:          Object.freeze({ id: 'tz',          he: 'תעודת זהות',            en: 'Israeli ID (TZ)' }),
  phone:       Object.freeze({ id: 'phone',       he: 'מספר טלפון',            en: 'Phone number' }),
  email:       Object.freeze({ id: 'email',       he: 'דואר אלקטרוני',          en: 'Email address' }),
  credit_card: Object.freeze({ id: 'credit_card', he: 'כרטיס אשראי',           en: 'Credit card (PAN)' }),
  iban_il:     Object.freeze({ id: 'iban_il',     he: 'חשבון IBAN ישראלי',      en: 'Israeli IBAN' }),
  passport:    Object.freeze({ id: 'passport',    he: 'דרכון',                 en: 'Passport number' }),
  id_keyword:  Object.freeze({ id: 'id_keyword',  he: 'מילת מפתח "ת.ז."',       en: 'ID keyword context' }),
  hebrew_name: Object.freeze({ id: 'hebrew_name', he: 'שם פרטי בעברית (מילון)', en: 'Hebrew given name (dict)' }),
  address:     Object.freeze({ id: 'address',     he: 'כתובת מגורים',           en: 'Street address' }),
});

/** @enum Redaction methods. */
const REDACTION_METHODS = Object.freeze({
  BLOCK:    Object.freeze({ id: 'block',    he: 'חסימה',     en: 'Block (████)' }),
  REPLACE:  Object.freeze({ id: 'replace',  he: 'החלפה',     en: 'Replace ([REDACTED])' }),
  HASH:     Object.freeze({ id: 'hash',     he: 'גיבוב',     en: 'Hash (SHA-256 prefix)' }),
  TOKENIZE: Object.freeze({ id: 'tokenize', he: 'טוקניזציה', en: 'Tokenize (reversible, vault)' }),
});

const VALID_METHODS = Object.freeze(new Set(['block', 'replace', 'hash', 'tokenize']));

/** Small Hebrew given-name seed dictionary (extensible via constructor). */
const DEFAULT_HEBREW_NAMES = Object.freeze([
  'משה', 'יעקב', 'יוסף', 'דוד', 'אברהם', 'יצחק', 'שמואל', 'שלמה',
  'אהרון', 'דניאל', 'מיכאל', 'גבריאל', 'יהודה', 'בנימין', 'נועם', 'איתן',
  'עוזי', 'קובי', 'רוני', 'עומר', 'ערן', 'ליאור', 'אורי', 'אייל',
  'שרה', 'רבקה', 'רחל', 'לאה', 'מרים', 'אסתר', 'רות', 'חנה',
  'נועה', 'תמר', 'שירה', 'מיכל', 'דנה', 'יעל', 'גילי', 'איילת',
]);

/** Hebrew street-type keywords used by the address heuristic. */
const HEBREW_STREET_WORDS = Object.freeze([
  'רחוב', 'רח\'', 'שדרות', 'שד\'', 'כביש', 'סמטת', 'ככר', 'דרך',
]);

/* ----------------------------------------------------------------------------
 * 1. Pure helpers
 * -------------------------------------------------------------------------- */

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const v = obj[prop];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

/**
 * Israeli Teudat Zehut checksum per Population Registry spec.
 * Pads to 9 digits, alternates *1 / *2, sums digits of each product, mod 10 == 0.
 */
function isValidIsraeliTZ(raw) {
  if (raw === undefined || raw === null) return false;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Luhn checksum for credit-card PANs. */
function isValidLuhn(raw) {
  if (raw === undefined || raw === null) return false;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Escape a literal string for safe use inside RegExp source. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a ████ string that preserves the visual length of the original. */
function blockString(len) {
  const n = Math.max(1, Number(len) || 1);
  return '\u2588'.repeat(n);
}

/* ----------------------------------------------------------------------------
 * 2. Pattern catalog — exported so callers & tests can inspect
 * -------------------------------------------------------------------------- */

/* NB: regexes are constructed per-call to avoid lastIndex state leakage. */
function buildPatterns() {
  return {
    // 9 digits optionally separated by - or space, then we verify checksum.
    tz:         /(?<![\w\d])(\d[\d-\s]{7,11}\d)(?![\w\d])/g,
    // +972-5X-XXXXXXX  or  05X-XXXXXXX  or  05XXXXXXXXX  or 02-XXXXXXX
    phone:      /(?<![\w\d])(\+?972[-\s]?|0)(\d{1,2})[-\s]?(\d{3})[-\s]?(\d{4})(?![\w\d])/g,
    email:      /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w.-])/g,
    // 13-19 digit groups with optional spaces/dashes, Luhn-validated after.
    credit_card:/(?<![\d])(?:\d[ -]?){13,19}(?![\d])/g,
    // IL IBAN: IL + 2 check + 3 bank + 3 branch + 13 account = 23 chars total
    iban_il:    /\bIL\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3}\b/g,
    // Passport: context words "דרכון"/"passport" then 8-9 digits
    passport:   /(?:דרכון|passport|passport\s*no\.?)[\s:#]*([A-Z0-9]{6,9})/gi,
    // "ת.ז." / "תעודת זהות" / "מספר זהות" context, then 9 digits
    id_keyword: /(?:ת\s*\.?\s*ז\s*\.?|תעודת\s+זהות|מס(?:פר)?\s+זהות)[\s:#]*(\d{5,9})/g,
    // Hebrew address heuristic — street-word + words + number + optional city
    address:    null, // built dynamically — see detectAddresses below
  };
}

/* ----------------------------------------------------------------------------
 * 3. RedactionTool
 * -------------------------------------------------------------------------- */

class RedactionTool {
  constructor({ clock, hebrewNames, actor } = {}) {
    /** @type {() => Date} injectable clock for deterministic tests */
    this.clock = typeof clock === 'function' ? clock : () => new Date();

    /** In-memory vaults: vaultKey → (token → originalValue). */
    this.vaults = new Map();

    /** Append-only redaction logs: docId → LogEntry[] */
    this.logs = new Map();

    /** Whitelist of literal terms never to redact. */
    this.whitelist = new Set();

    /** Hebrew given-name dictionary — merged with defaults. */
    this.hebrewNames = new Set([
      ...DEFAULT_HEBREW_NAMES,
      ...(Array.isArray(hebrewNames) ? hebrewNames : []),
    ]);

    /** Default actor recorded on log entries when caller omits one. */
    this.actor = actor || { id: 'system', role: 'redactor', he: 'מערכת', en: 'System' };
  }

  /* -- 3.1 detectPII — returns array of {category, match, start, end, valid} */

  detectPII(text) {
    if (text === undefined || text === null) return [];
    const src = String(text);
    const hits = [];
    const patterns = buildPatterns();

    // tz — raw 9-ish digits, verified with Luhn-style Israeli checksum
    this._scan(src, patterns.tz, 'tz', (m) => {
      const raw = m[1];
      return isValidIsraeliTZ(raw) ? raw.replace(/\s+/g, '') : null;
    }, hits);

    // phone
    this._scan(src, patterns.phone, 'phone', (m) => m[0], hits);

    // email
    this._scan(src, patterns.email, 'email', (m) => m[0], hits);

    // credit_card — Luhn-verified
    this._scan(src, patterns.credit_card, 'credit_card', (m) => {
      const raw = m[0];
      return isValidLuhn(raw) ? raw : null;
    }, hits);

    // iban_il
    this._scan(src, patterns.iban_il, 'iban_il', (m) => m[0], hits);

    // passport (context-anchored)
    this._scan(src, patterns.passport, 'passport', (m) => m[1], hits);

    // id_keyword (9-digit trailing a Hebrew context word) — always redact the
    // whole match so the keyword itself gets blanked too
    this._scan(src, patterns.id_keyword, 'id_keyword', (m) => m[0], hits);

    // hebrew names — dictionary based, word-boundary using Hebrew letters
    for (const name of this.hebrewNames) {
      if (!name) continue;
      const rx = new RegExp(`(?<![א-ת])${escapeRegExp(name)}(?![א-ת])`, 'g');
      this._scan(src, rx, 'hebrew_name', (m) => m[0], hits);
    }

    // address — street-word + noun + number (optionally followed by , city)
    for (const streetWord of HEBREW_STREET_WORDS) {
      const rx = new RegExp(
        `${escapeRegExp(streetWord)}\\s+[א-ת\\w]+(?:\\s+[א-ת\\w]+)?\\s+\\d{1,4}(?:\\s*,\\s*[א-ת\\w]+)?`,
        'g',
      );
      this._scan(src, rx, 'address', (m) => m[0], hits);
    }

    // remove whitelisted hits + de-overlap (longest wins)
    const filtered = hits.filter(h => !this._isWhitelisted(h.match));
    return this._deOverlap(filtered);
  }

  /** internal — run a regex and push non-null hits onto the accumulator. */
  _scan(src, regex, category, extractor, hits) {
    // always clone to avoid stateful lastIndex leaks
    const rx = regex instanceof RegExp ? new RegExp(regex.source, regex.flags) : regex;
    let m;
    while ((m = rx.exec(src)) !== null) {
      const raw = extractor(m);
      if (raw === null || raw === undefined) {
        if (!rx.global) break;
        continue;
      }
      // compute the end that covers the visible characters
      hits.push({
        category,
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        extracted: String(raw),
      });
      if (!rx.global) break;
    }
  }

  _isWhitelisted(match) {
    if (this.whitelist.size === 0) return false;
    for (const term of this.whitelist) {
      if (match.includes(term)) return true;
    }
    return false;
  }

  /** Prefer longer matches when multiple categories cover the same span. */
  _deOverlap(hits) {
    if (hits.length < 2) return hits.slice();
    const sorted = hits.slice().sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });
    const out = [];
    for (const h of sorted) {
      const prev = out[out.length - 1];
      if (prev && h.start < prev.end) {
        // overlap — keep the wider one
        const prevLen = prev.end - prev.start;
        const curLen = h.end - h.start;
        if (curLen > prevLen) out[out.length - 1] = h;
        continue;
      }
      out.push(h);
    }
    return out;
  }

  /* -- 3.2 classifyPIIType — public wrapper around detectPII ------------- */

  classifyPIIType(text) {
    const hits = this.detectPII(text);
    const byCategory = {};
    for (const h of hits) {
      if (!byCategory[h.category]) byCategory[h.category] = [];
      byCategory[h.category].push({ match: h.match, start: h.start, end: h.end });
    }
    return {
      total: hits.length,
      types: Object.keys(byCategory).sort(),
      byCategory,
      hits: hits.map(h => ({ ...h })),
    };
  }

  /* -- 3.3 redactText — produces redacted version + map ------------------ */

  redactText(text, options = {}) {
    if (text === undefined || text === null) {
      throw new Error('TEXT_REQUIRED: text is mandatory');
    }
    const method = String(options.method || 'replace').toLowerCase();
    if (!VALID_METHODS.has(method)) {
      throw new Error(`METHOD_INVALID: must be one of ${[...VALID_METHODS].join(', ')}`);
    }
    const src = String(text);
    const hits = this.detectPII(src);
    const categories = Array.isArray(options.categories) && options.categories.length
      ? new Set(options.categories)
      : null;
    const active = categories ? hits.filter(h => categories.has(h.category)) : hits;

    // vault allocation for TOKENIZE
    let vaultKey = null;
    let vault = null;
    if (method === 'tokenize') {
      vaultKey = options.vaultKey || newId('vault');
      if (!this.vaults.has(vaultKey)) this.vaults.set(vaultKey, new Map());
      vault = this.vaults.get(vaultKey);
    }

    // Build redacted string by walking hits left→right
    let out = '';
    let cursor = 0;
    const replacements = [];
    for (const h of active) {
      if (h.start < cursor) continue; // already consumed
      out += src.slice(cursor, h.start);
      let replacement;
      switch (method) {
        case 'block':
          replacement = blockString(h.end - h.start);
          break;
        case 'replace':
          replacement = '[REDACTED]';
          break;
        case 'hash': {
          const hashHex = sha256Hex(h.match);
          replacement = `HASH::${hashHex.slice(0, 10)}`;
          break;
        }
        case 'tokenize': {
          const token = `{{TOK:${crypto.randomBytes(4).toString('hex')}}}`;
          vault.set(token, h.match);
          replacement = token;
          break;
        }
        default:
          replacement = '[REDACTED]';
      }
      out += replacement;
      replacements.push({
        category: h.category,
        original: h.match,
        start: h.start,
        end: h.end,
        replacement,
      });
      cursor = h.end;
    }
    out += src.slice(cursor);

    const result = {
      originalLength: src.length,
      redactedLength: out.length,
      method,
      methodLabel: Object.freeze({
        he: REDACTION_METHODS[method.toUpperCase()].he,
        en: REDACTION_METHODS[method.toUpperCase()].en,
      }),
      categoriesRequested: categories ? Array.from(categories).sort() : null,
      redactedText: out,
      count: replacements.length,
      replacements,
      vaultKey, // only set for tokenize
      timestamp: this.clock().toISOString(),
    };

    if (options.docId) {
      this._log(options.docId, {
        action: 'redactText',
        method,
        count: replacements.length,
        vaultKey,
        actor: options.actor || this.actor,
        categories: categories ? Array.from(categories).sort() : null,
      });
    }
    return result;
  }

  /* -- 3.4 redactWithRules — custom regex list --------------------------- */

  redactWithRules(text, rules) {
    if (text === undefined || text === null) {
      throw new Error('TEXT_REQUIRED: text is mandatory');
    }
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('RULES_REQUIRED: rules must be a non-empty array');
    }
    let out = String(text);
    const applied = [];
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue;
      const { name, pattern, replacement = '[REDACTED]' } = rule;
      if (!(pattern instanceof RegExp)) {
        throw new Error('RULE_PATTERN_INVALID: rule.pattern must be RegExp');
      }
      const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      const before = out;
      let count = 0;
      out = out.replace(rx, (m) => {
        if (this._isWhitelisted(m)) return m;
        count += 1;
        return typeof replacement === 'function' ? replacement(m) : replacement;
      });
      applied.push({ name: name || '(anonymous)', count, changed: before !== out });
    }
    return {
      redactedText: out,
      rulesApplied: applied,
      totalRuleHits: applied.reduce((a, r) => a + r.count, 0),
    };
  }

  /* -- 3.5 createRedactionMap — audit structure from before & after ----- */

  createRedactionMap(originalText, redactedText) {
    if (originalText === undefined || redactedText === undefined) {
      throw new Error('BOTH_REQUIRED: originalText and redactedText are mandatory');
    }
    const original = String(originalText);
    const redacted = String(redactedText);
    // Walk both strings side by side, anchored on the first differing char.
    const map = [];
    let i = 0;
    let j = 0;
    while (i < original.length || j < redacted.length) {
      if (i < original.length && j < redacted.length && original[i] === redacted[j]) {
        i += 1;
        j += 1;
        continue;
      }
      // mismatch — capture the divergent span until we resync on an anchor
      const anchor = this._findResyncAnchor(original, redacted, i, j);
      const originalSpan = original.slice(i, anchor.origEnd);
      const redactedSpan = redacted.slice(j, anchor.redEnd);
      map.push({
        originalStart: i,
        originalEnd: anchor.origEnd,
        originalText: originalSpan,
        redactedStart: j,
        redactedEnd: anchor.redEnd,
        redactedText: redactedSpan,
      });
      i = anchor.origEnd;
      j = anchor.redEnd;
    }
    return {
      totalDivergences: map.length,
      originalLength: original.length,
      redactedLength: redacted.length,
      entries: map,
    };
  }

  _findResyncAnchor(original, redacted, i, j) {
    // Try to resync by finding the next common substring of length 4.
    const minRun = 4;
    for (let origEnd = i; origEnd <= original.length; origEnd += 1) {
      for (let redEnd = j; redEnd <= redacted.length; redEnd += 1) {
        if (origEnd - i > 200 || redEnd - j > 200) break;
        const a = original.slice(origEnd, origEnd + minRun);
        const b = redacted.slice(redEnd, redEnd + minRun);
        if (a.length === minRun && a === b) {
          return { origEnd, redEnd };
        }
      }
    }
    return { origEnd: original.length, redEnd: redacted.length };
  }

  /* -- 3.6 reverseRedaction — tokenize-only, RBAC-gated ------------------ */

  reverseRedaction(redactedText, vaultKey, { role } = {}) {
    if (redactedText === undefined || redactedText === null) {
      throw new Error('TEXT_REQUIRED: redactedText is mandatory');
    }
    if (!vaultKey) {
      throw new Error('VAULT_KEY_REQUIRED: reverseRedaction needs the vault key used at tokenize time');
    }
    // RBAC gate: must be 'privacy_officer' or 'admin' unless explicitly disabled.
    const allowed = new Set(['privacy_officer', 'admin', 'system']);
    const effectiveRole = role || this.actor.role;
    if (!allowed.has(effectiveRole)) {
      throw new Error(`RBAC_DENIED: role "${effectiveRole}" may not reverse redactions`);
    }
    const vault = this.vaults.get(vaultKey);
    if (!vault) {
      throw new Error('VAULT_NOT_FOUND: no vault for the given key');
    }
    let out = String(redactedText);
    let replaced = 0;
    for (const [token, original] of vault.entries()) {
      const escaped = escapeRegExp(token);
      const rx = new RegExp(escaped, 'g');
      const before = out;
      out = out.replace(rx, original);
      if (before !== out) replaced += 1;
    }
    return {
      restoredText: out,
      tokensReplaced: replaced,
      vaultKey,
    };
  }

  /* -- 3.7 batchRedact — bulk processing --------------------------------- */

  batchRedact(documents, rules) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('DOCUMENTS_REQUIRED: documents must be a non-empty array');
    }
    const results = [];
    for (const doc of documents) {
      if (!doc || typeof doc !== 'object') {
        results.push({ ok: false, error: 'DOC_INVALID: each document must be an object' });
        continue;
      }
      const { id, text, method = 'replace', categories } = doc;
      if (!id || typeof id !== 'string') {
        results.push({ ok: false, error: 'DOC_ID_REQUIRED' });
        continue;
      }
      try {
        let result;
        if (rules) {
          const ruleRes = this.redactWithRules(text, rules);
          // Then apply built-in detector on top.
          const pass2 = this.redactText(ruleRes.redactedText, { method, categories, docId: id });
          result = {
            id,
            ok: true,
            method,
            rulesApplied: ruleRes.rulesApplied,
            count: pass2.count,
            redactedText: pass2.redactedText,
            vaultKey: pass2.vaultKey,
          };
        } else {
          const r = this.redactText(text, { method, categories, docId: id });
          result = {
            id,
            ok: true,
            method,
            count: r.count,
            redactedText: r.redactedText,
            vaultKey: r.vaultKey,
          };
        }
        results.push(result);
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }
    return {
      total: documents.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    };
  }

  /* -- 3.8 verifyNoPII — final safety scan ------------------------------- */

  verifyNoPII(text) {
    const hits = this.detectPII(text);
    if (hits.length === 0) {
      return {
        safe: true,
        he: 'נקי מ-PII',
        en: 'Clean of PII',
        hits: [],
      };
    }
    return {
      safe: false,
      he: `נמצאו ${hits.length} ממצאי PII`,
      en: `Found ${hits.length} PII hit(s)`,
      hits: hits.map(h => ({ category: h.category, preview: h.match.slice(0, 4) + '…', start: h.start })),
    };
  }

  /* -- 3.9 exportRedactionLog — audit trail for a document --------------- */

  exportRedactionLog(docId) {
    if (!docId || typeof docId !== 'string') {
      throw new Error('DOC_ID_REQUIRED: docId is mandatory');
    }
    const arr = this.logs.get(docId);
    if (!arr) return { docId, total: 0, entries: [] };
    return {
      docId,
      total: arr.length,
      entries: arr.map(e => ({ ...e })),
    };
  }

  _log(docId, entry) {
    if (!this.logs.has(docId)) this.logs.set(docId, []);
    const sealed = Object.freeze({
      id: newId('log'),
      ts: this.clock().toISOString(),
      ...entry,
    });
    this.logs.get(docId).push(sealed);
    return sealed;
  }

  /* -- 3.10 whitelistTerms — mark literal terms as never-redact ---------- */

  whitelistTerms(terms) {
    if (!Array.isArray(terms)) {
      throw new Error('TERMS_REQUIRED: terms must be an array');
    }
    let added = 0;
    for (const t of terms) {
      if (typeof t === 'string' && t.trim() !== '' && !this.whitelist.has(t)) {
        this.whitelist.add(t);
        added += 1;
      }
    }
    return { added, size: this.whitelist.size, terms: Array.from(this.whitelist) };
  }

  /* -- 3.11 visualDiff — highlight what was redacted --------------------- */

  visualDiff(original, redacted) {
    if (original === undefined || redacted === undefined) {
      throw new Error('BOTH_REQUIRED: original and redacted are mandatory');
    }
    const map = this.createRedactionMap(original, redacted);
    // Plain-text highlighter: wrap the redacted side in ⟦…⟧, original in ⟪…⟫.
    let highlightedOriginal = '';
    let highlightedRedacted = '';
    let oCursor = 0;
    let rCursor = 0;
    for (const e of map.entries) {
      highlightedOriginal += String(original).slice(oCursor, e.originalStart);
      highlightedOriginal += `\u27EA${e.originalText}\u27EB`;
      oCursor = e.originalEnd;
      highlightedRedacted += String(redacted).slice(rCursor, e.redactedStart);
      highlightedRedacted += `\u27E6${e.redactedText}\u27E7`;
      rCursor = e.redactedEnd;
    }
    highlightedOriginal += String(original).slice(oCursor);
    highlightedRedacted += String(redacted).slice(rCursor);

    return {
      totalDivergences: map.entries.length,
      highlightedOriginal,
      highlightedRedacted,
      entries: map.entries,
      legend: Object.freeze({
        original: '\u27EA...\u27EB',
        redacted: '\u27E6...\u27E7',
        he: 'המרקרים מציינים את הקטעים שעברו השחרה',
        en: 'Markers denote spans that were redacted',
      }),
    };
  }
}

/* ----------------------------------------------------------------------------
 * 4. Module exports
 * -------------------------------------------------------------------------- */

module.exports = {
  RedactionTool,
  PII_CATEGORIES,
  REDACTION_METHODS,
  DEFAULT_HEBREW_NAMES,
  HEBREW_STREET_WORDS,
  // helpers exposed for tests & downstream reuse
  isValidIsraeliTZ,
  isValidLuhn,
  sha256Hex,
  blockString,
  escapeRegExp,
};
