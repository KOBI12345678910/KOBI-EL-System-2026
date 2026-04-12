/**
 * Contract Clause Library  |  ספריית סעיפי חוזה
 * =========================================================================
 *
 * Agent Y-116  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Reusable legal building blocks — add once, assemble forever.
 *
 *     addClause  →  approvalWorkflow  →  [APPROVED]
 *         │                                  │
 *         ▼                                  ▼
 *     upgradeClause (new version)      assembleContract (templateId + clauseIds)
 *         │                                  │
 *         ▼                                  ▼
 *     compareClauseVersions            riskScore(contractText)
 *         │                                  │
 *         ▼                                  ▼
 *     deprecateClause  ─►  supersededBy  (never deleted — redirects users)
 *
 * -------------------------------------------------------------
 * IMMUTABLE RULE: לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 *  • `addClause(...)`          creates version 1 of a new clause.
 *  • `upgradeClause(...)`      creates version N+1 — previous versions
 *                              are retained in `_versions` forever and
 *                              remain addressable by `{version: N}`.
 *  • `deprecateClause(...)`    flips a clause to `deprecated=true` and
 *                              optionally points at `supersededBy` —
 *                              the record, all versions, and usage
 *                              analytics are preserved for audit.
 *                              `getClause()` still returns the clause
 *                              but annotates a redirect hint.
 *  • Every mutation (add / upgrade / approve / deprecate / use) goes
 *    through `_event(...)` which append-writes to the events log with
 *    a monotonic seq number.
 *
 * -------------------------------------------------------------
 * ZERO EXTERNAL DEPS — Node built-ins only
 * -------------------------------------------------------------
 *   - node:crypto       for clauseId / eventId / auditId generation
 *
 * -------------------------------------------------------------
 * BILINGUAL HEBREW RTL + ENGLISH LTR
 * -------------------------------------------------------------
 *   Every clause carries `title_he` / `title_en` + `text_he` / `text_en`.
 *   `getClause({..., lang})` returns a `preferred` field in the asked
 *   language. `HEBREW_GLOSSARY` exposes bilingual legal terminology.
 *   `bilingualPairing()` runs a rule-based semantic equivalence check
 *   between the two language forms.
 *
 * -------------------------------------------------------------
 * ISRAELI CONTRACT LAW CONTEXT
 * -------------------------------------------------------------
 *   Built-in citation registry references:
 *     • חוק החוזים (חלק כללי), תשל"ג-1973
 *     • חוק החוזים (תרופות בשל הפרת חוזה), תשל"א-1970
 *     • חוק החוזים האחידים, תשמ"ג-1982
 *     • חוק המכר, תשכ"ח-1968
 *     • חוק הגנת הפרטיות, תשמ"א-1981
 *     • חוק זכות יוצרים, תשס"ח-2007
 *     • חוק הבוררות, תשכ"ח-1968
 *
 * -------------------------------------------------------------
 * STORAGE MODEL  (all in-memory Maps)
 * -------------------------------------------------------------
 *   _clauses         Map<clauseId, ClauseRecord>        (current head)
 *   _versions        Map<clauseId, VersionRecord[]>      (append-only)
 *   _approvals       Map<approvalId, ApprovalRecord>     (append-only)
 *   _usage           Map<clauseId, UsageEntry[]>         (append-only)
 *   _assemblies      Map<assemblyId, AssemblyRecord>     (append-only)
 *   _events          Array<Event>                        (append-only)
 *   _seq             Number                              (monotonic)
 *
 * Y-116 © Techno-Kol Uzi 2026
 */

'use strict';

const crypto = require('node:crypto');

/* ============================================================
 * CONSTANTS — categories, risk, approvals, glossary
 * ============================================================ */

const CATEGORIES = Object.freeze([
  'confidentiality',
  'liability',
  'termination',
  'payment',
  'ip',
  'warranty',
  'dispute',
  'force-majeure',
  'governing-law',
  'data-protection',
]);

const CATEGORY_LABELS = Object.freeze({
  'confidentiality': { he: 'סודיות',                 en: 'Confidentiality'   },
  'liability':       { he: 'אחריות',                 en: 'Liability'         },
  'termination':     { he: 'סיום התקשרות',           en: 'Termination'       },
  'payment':         { he: 'תשלום',                  en: 'Payment'           },
  'ip':              { he: 'קניין רוחני',            en: 'Intellectual Property' },
  'warranty':        { he: 'אחריות/בדק',             en: 'Warranty'          },
  'dispute':         { he: 'יישוב מחלוקות',          en: 'Dispute Resolution'},
  'force-majeure':   { he: 'כוח עליון',              en: 'Force Majeure'     },
  'governing-law':   { he: 'דין חל',                 en: 'Governing Law'     },
  'data-protection': { he: 'הגנת מידע',              en: 'Data Protection'   },
});

const RISK_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);
const RISK_WEIGHTS = Object.freeze({
  low: 1,
  medium: 3,
  high: 7,
  critical: 15,
});
const RISK_LABELS = Object.freeze({
  low:      { he: 'נמוך',    en: 'Low'      },
  medium:   { he: 'בינוני',  en: 'Medium'   },
  high:     { he: 'גבוה',    en: 'High'     },
  critical: { he: 'קריטי',   en: 'Critical' },
});

const APPROVAL_STATUS = Object.freeze(['pending', 'approved', 'rejected', 'needs-revision']);
const APPROVAL_STATUS_LABELS = Object.freeze({
  'pending':        { he: 'ממתין',            en: 'Pending'        },
  'approved':       { he: 'אושר',              en: 'Approved'       },
  'rejected':       { he: 'נדחה',              en: 'Rejected'       },
  'needs-revision': { he: 'דורש תיקון',        en: 'Needs Revision' },
});

const JURISDICTIONS = Object.freeze(['IL', 'US', 'EU', 'UK', 'INTL']);
const JURISDICTION_LABELS = Object.freeze({
  IL:   { he: 'ישראל',              en: 'Israel'          },
  US:   { he: 'ארצות הברית',        en: 'United States'   },
  EU:   { he: 'האיחוד האירופי',     en: 'European Union'  },
  UK:   { he: 'בריטניה',            en: 'United Kingdom'  },
  INTL: { he: 'בינלאומי',            en: 'International'  },
});

// Israeli Contract Law citation registry  |  מרשם ציטוטי חוקי החוזים בישראל
const IL_LAW_CITATIONS = Object.freeze({
  'IL-CONTRACTS-GENERAL':   {
    he: 'חוק החוזים (חלק כללי), תשל"ג-1973',
    en: 'Contracts Law (General Part), 5733-1973',
  },
  'IL-CONTRACTS-REMEDIES':  {
    he: 'חוק החוזים (תרופות בשל הפרת חוזה), תשל"א-1970',
    en: 'Contracts (Remedies for Breach of Contract) Law, 5731-1970',
  },
  'IL-STANDARD-CONTRACTS':  {
    he: 'חוק החוזים האחידים, תשמ"ג-1982',
    en: 'Standard Contracts Law, 5743-1982',
  },
  'IL-SALE-LAW':            {
    he: 'חוק המכר, תשכ"ח-1968',
    en: 'Sale Law, 5728-1968',
  },
  'IL-PRIVACY':             {
    he: 'חוק הגנת הפרטיות, תשמ"א-1981',
    en: 'Protection of Privacy Law, 5741-1981',
  },
  'IL-COPYRIGHT':           {
    he: 'חוק זכות יוצרים, תשס"ח-2007',
    en: 'Copyright Law, 5768-2007',
  },
  'IL-ARBITRATION':         {
    he: 'חוק הבוררות, תשכ"ח-1968',
    en: 'Arbitration Law, 5728-1968',
  },
  'IL-CONSUMER-PROTECTION': {
    he: 'חוק הגנת הצרכן, תשמ"א-1981',
    en: 'Consumer Protection Law, 5741-1981',
  },
  'IL-COMPANIES':           {
    he: 'חוק החברות, תשנ"ט-1999',
    en: 'Companies Law, 5759-1999',
  },
  'IL-ELECTRONIC-SIGNATURE':{
    he: 'חוק חתימה אלקטרונית, תשס"א-2001',
    en: 'Electronic Signature Law, 5761-2001',
  },
});

const HEBREW_GLOSSARY = Object.freeze([
  { he: 'חוזה',                       en: 'contract',            role: 'core'      },
  { he: 'סעיף',                       en: 'clause',              role: 'core'      },
  { he: 'הסכם',                       en: 'agreement',           role: 'core'      },
  { he: 'צד להסכם',                   en: 'party',               role: 'party'     },
  { he: 'סודיות',                     en: 'confidentiality',     role: 'category'  },
  { he: 'אחריות משפטית',              en: 'liability',           role: 'category'  },
  { he: 'סיום התקשרות',               en: 'termination',         role: 'category'  },
  { he: 'תנאי תשלום',                 en: 'payment terms',       role: 'category'  },
  { he: 'קניין רוחני',                en: 'intellectual property',role: 'category' },
  { he: 'אחריות (בדק)',               en: 'warranty',            role: 'category'  },
  { he: 'יישוב מחלוקות',              en: 'dispute resolution',  role: 'category'  },
  { he: 'כוח עליון',                  en: 'force majeure',       role: 'category'  },
  { he: 'הדין החל',                   en: 'governing law',       role: 'category'  },
  { he: 'הגנת מידע',                  en: 'data protection',     role: 'category'  },
  { he: 'הפרה',                        en: 'breach',              role: 'remedy'    },
  { he: 'פיצוי מוסכם',                en: 'liquidated damages',  role: 'remedy'    },
  { he: 'ציטוט חוק',                  en: 'legal citation',      role: 'evidence'  },
  { he: 'רמת סיכון',                  en: 'risk level',          role: 'control'   },
  { he: 'אישור משפטי',                en: 'legal approval',      role: 'control'   },
  { he: 'גרסה',                        en: 'version',             role: 'control'   },
  { he: 'הסלמה',                       en: 'escalation',          role: 'workflow'  },
  { he: 'הוצאה משימוש',                en: 'deprecation',         role: 'workflow'  },
  { he: 'תחליף',                       en: 'superseded-by',       role: 'workflow'  },
  { he: 'משתנים דינמיים',              en: 'dynamic variables',   role: 'assembly'  },
  { he: 'הרכבת חוזה',                  en: 'contract assembly',   role: 'assembly'  },
  { he: 'התאמה דו-לשונית',             en: 'bilingual pairing',   role: 'evidence'  },
  { he: 'ניתוח שימוש',                 en: 'usage analytics',     role: 'analytics' },
  { he: 'השוואת גרסאות',               en: 'version diff',        role: 'evidence'  },
  { he: 'בוררות',                      en: 'arbitration',         role: 'dispute'   },
  { he: 'שיפוט ייחודי',                en: 'exclusive jurisdiction', role: 'dispute'},
]);

const VARIABLE_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/* ============================================================
 * UTILITIES
 * ============================================================ */

function _genId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function _freeze(obj) {
  return Object.freeze({ ...obj });
}

function _nowMs(timestamp) {
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'string') {
    const t = Date.parse(timestamp);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function _isoStamp(ms) {
  return new Date(ms).toISOString();
}

function _nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function _extractVariables(text) {
  if (typeof text !== 'string') return [];
  const found = new Set();
  let m;
  VARIABLE_PATTERN.lastIndex = 0;
  while ((m = VARIABLE_PATTERN.exec(text)) !== null) {
    found.add(m[1]);
  }
  return Array.from(found);
}

function _substituteVariables(text, vars) {
  if (typeof text !== 'string') return text;
  return text.replace(VARIABLE_PATTERN, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match; // leave unresolved for validation
  });
}

function _tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  // Split on non-letter characters; keep Hebrew (U+0590–U+05FF), Latin letters, digits
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9\u0590-\u05FF]+/u)
    .filter((t) => t.length >= 2);
  return tokens;
}

// Line-based LCS diff (Myers-style simplified via dynamic programming)
function _lineDiff(aText, bText) {
  const a = (aText || '').split('\n');
  const b = (bText || '').split('\n');
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ op: 'eq', line: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ op: 'del', line: a[i - 1] });
      i--;
    } else {
      out.push({ op: 'ins', line: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { out.push({ op: 'del', line: a[i - 1] }); i--; }
  while (j > 0) { out.push({ op: 'ins', line: b[j - 1] }); j--; }
  return out.reverse();
}

/* ============================================================
 * ClauseLibrary — main class
 * ============================================================ */

class ClauseLibrary {
  constructor(options = {}) {
    this._clauses    = new Map();  // clauseId -> head record
    this._versions   = new Map();  // clauseId -> VersionRecord[]
    this._approvals  = new Map();  // approvalId -> ApprovalRecord
    this._usage      = new Map();  // clauseId -> UsageEntry[]
    this._assemblies = new Map();  // assemblyId -> AssemblyRecord
    this._events     = [];
    this._seq        = 0;
    this._now        = typeof options.now === 'function' ? options.now : () => Date.now();
  }

  /* -------- private helpers -------- */

  _event(type, payload) {
    this._seq += 1;
    const rec = _freeze({
      seq: this._seq,
      eventId: _genId('evt'),
      type,
      timestamp: _isoStamp(this._now()),
      payload: _freeze(payload || {}),
    });
    this._events.push(rec);
    return rec;
  }

  _requireCategory(category) {
    if (!CATEGORIES.includes(category)) {
      const err = new Error(`INVALID_CATEGORY: ${category}. Allowed: ${CATEGORIES.join(', ')}`);
      err.code = 'INVALID_CATEGORY';
      throw err;
    }
  }

  _requireRisk(riskLevel) {
    if (!RISK_LEVELS.includes(riskLevel)) {
      const err = new Error(`INVALID_RISK_LEVEL: ${riskLevel}. Allowed: ${RISK_LEVELS.join(', ')}`);
      err.code = 'INVALID_RISK_LEVEL';
      throw err;
    }
  }

  _requireClause(clauseId) {
    const clause = this._clauses.get(clauseId);
    if (!clause) {
      const err = new Error(`CLAUSE_NOT_FOUND: ${clauseId}`);
      err.code = 'CLAUSE_NOT_FOUND';
      throw err;
    }
    return clause;
  }

  /* =========================================================
   * addClause — creates v1 of a new clause
   * ========================================================= */
  addClause({
    id,
    category,
    title_he,
    title_en,
    text_he,
    text_en,
    variables,
    legalCitation,
    riskLevel,
    approvedBy,
    jurisdiction,
  } = {}) {
    if (!_nonEmptyString(id)) {
      const err = new Error('INVALID_ID: clause id must be a non-empty string');
      err.code = 'INVALID_ID';
      throw err;
    }
    if (this._clauses.has(id)) {
      const err = new Error(`CLAUSE_ALREADY_EXISTS: ${id} — use upgradeClause()`);
      err.code = 'CLAUSE_ALREADY_EXISTS';
      throw err;
    }
    this._requireCategory(category);
    if (!_nonEmptyString(title_he)) {
      const err = new Error('INVALID_TITLE_HE'); err.code = 'INVALID_TITLE_HE'; throw err;
    }
    if (!_nonEmptyString(title_en)) {
      const err = new Error('INVALID_TITLE_EN'); err.code = 'INVALID_TITLE_EN'; throw err;
    }
    if (!_nonEmptyString(text_he)) {
      const err = new Error('INVALID_TEXT_HE'); err.code = 'INVALID_TEXT_HE'; throw err;
    }
    if (!_nonEmptyString(text_en)) {
      const err = new Error('INVALID_TEXT_EN'); err.code = 'INVALID_TEXT_EN'; throw err;
    }
    this._requireRisk(riskLevel);

    const vars = Array.isArray(variables) && variables.length > 0
      ? Array.from(new Set(variables.map(String)))
      : Array.from(new Set([
          ..._extractVariables(text_he),
          ..._extractVariables(text_en),
        ]));

    const citations = Array.isArray(legalCitation)
      ? legalCitation.filter(_nonEmptyString)
      : (_nonEmptyString(legalCitation) ? [legalCitation] : []);

    const jurisdictionList = Array.isArray(jurisdiction)
      ? jurisdiction.filter(_nonEmptyString)
      : (_nonEmptyString(jurisdiction) ? [jurisdiction] : ['IL']);

    const createdMs = this._now();
    const version1 = _freeze({
      version: 1,
      title_he: String(title_he),
      title_en: String(title_en),
      text_he: String(text_he),
      text_en: String(text_en),
      variables: Object.freeze(vars.slice()),
      legalCitation: Object.freeze(citations.slice()),
      riskLevel,
      approvedBy: _nonEmptyString(approvedBy) ? String(approvedBy) : null,
      jurisdiction: Object.freeze(jurisdictionList.slice()),
      createdAt: _isoStamp(createdMs),
      createdAtMs: createdMs,
      changeNote: 'initial clause added',
    });

    const clause = _freeze({
      clauseId: id,
      category,
      currentVersion: 1,
      deprecated: false,
      supersededBy: null,
      deprecationReason: null,
      approvalStatus: _nonEmptyString(approvedBy) ? 'approved' : 'pending',
      createdAt: version1.createdAt,
    });

    this._clauses.set(id, clause);
    this._versions.set(id, [version1]);
    this._usage.set(id, []);
    this._event('clause.added', { clauseId: id, category, version: 1, riskLevel });
    return { clauseId: id, version: 1, clause, head: version1 };
  }

  /* =========================================================
   * upgradeClause — append-only versioning
   * ========================================================= */
  upgradeClause(clauseId, newVersion, changes = {}) {
    const clause = this._requireClause(clauseId);
    if (clause.deprecated) {
      const err = new Error(`CLAUSE_DEPRECATED: ${clauseId}. Upgrade is blocked on deprecated clauses.`);
      err.code = 'CLAUSE_DEPRECATED';
      throw err;
    }
    const versions = this._versions.get(clauseId);
    const head = versions[versions.length - 1];

    const expected = typeof newVersion === 'number'
      ? newVersion
      : head.version + 1;

    if (expected <= head.version) {
      const err = new Error(
        `INVALID_NEW_VERSION: must be > ${head.version}, got ${expected}`,
      );
      err.code = 'INVALID_NEW_VERSION';
      throw err;
    }

    const next = {
      version: expected,
      title_he: changes.title_he ?? head.title_he,
      title_en: changes.title_en ?? head.title_en,
      text_he:  changes.text_he  ?? head.text_he,
      text_en:  changes.text_en  ?? head.text_en,
      riskLevel: changes.riskLevel ?? head.riskLevel,
      approvedBy: changes.approvedBy ?? head.approvedBy,
    };
    this._requireRisk(next.riskLevel);

    const cits = changes.legalCitation !== undefined
      ? (Array.isArray(changes.legalCitation)
          ? changes.legalCitation.filter(_nonEmptyString)
          : (_nonEmptyString(changes.legalCitation) ? [changes.legalCitation] : []))
      : head.legalCitation.slice();

    const juris = changes.jurisdiction !== undefined
      ? (Array.isArray(changes.jurisdiction)
          ? changes.jurisdiction.filter(_nonEmptyString)
          : (_nonEmptyString(changes.jurisdiction) ? [changes.jurisdiction] : ['IL']))
      : head.jurisdiction.slice();

    const vars = Array.isArray(changes.variables) && changes.variables.length > 0
      ? Array.from(new Set(changes.variables.map(String)))
      : Array.from(new Set([
          ..._extractVariables(next.text_he),
          ..._extractVariables(next.text_en),
        ]));

    const ms = this._now();
    const versionRec = _freeze({
      ...next,
      variables: Object.freeze(vars.slice()),
      legalCitation: Object.freeze(cits.slice()),
      jurisdiction: Object.freeze(juris.slice()),
      createdAt: _isoStamp(ms),
      createdAtMs: ms,
      changeNote: _nonEmptyString(changes.changeNote) ? changes.changeNote : `upgraded to v${expected}`,
      previousVersion: head.version,
    });
    versions.push(versionRec);

    const newClause = _freeze({
      ...clause,
      currentVersion: expected,
      approvalStatus: _nonEmptyString(next.approvedBy) ? 'approved' : 'pending',
    });
    this._clauses.set(clauseId, newClause);

    this._event('clause.upgraded', {
      clauseId,
      from: head.version,
      to: expected,
      riskChanged: head.riskLevel !== next.riskLevel,
    });
    return { clauseId, version: expected, head: versionRec };
  }

  /* =========================================================
   * getClause — latest or specific, optional lang preference
   * ========================================================= */
  getClause(clauseId, { version, lang } = {}) {
    const clause = this._clauses.get(clauseId);
    if (!clause) return null;
    const versions = this._versions.get(clauseId) || [];
    let rec;
    if (typeof version === 'number') {
      rec = versions.find((v) => v.version === version) || null;
    } else {
      rec = versions[versions.length - 1];
    }
    if (!rec) return null;
    const langPref = lang === 'he' || lang === 'en' ? lang : 'he';
    const preferred = {
      title: rec[`title_${langPref}`],
      text:  rec[`text_${langPref}`],
      lang:  langPref,
    };
    const categoryLabel = CATEGORY_LABELS[clause.category] || null;
    const riskLabel = RISK_LABELS[rec.riskLevel] || null;
    return _freeze({
      clauseId,
      category: clause.category,
      categoryLabel,
      riskLabel,
      deprecated: clause.deprecated,
      supersededBy: clause.supersededBy,
      deprecationReason: clause.deprecationReason,
      approvalStatus: clause.approvalStatus,
      currentVersion: clause.currentVersion,
      requestedVersion: rec.version,
      title_he: rec.title_he,
      title_en: rec.title_en,
      text_he:  rec.text_he,
      text_en:  rec.text_en,
      variables: rec.variables,
      legalCitation: rec.legalCitation,
      riskLevel: rec.riskLevel,
      jurisdiction: rec.jurisdiction,
      approvedBy: rec.approvedBy,
      createdAt: rec.createdAt,
      changeNote: rec.changeNote,
      preferred,
      redirect: clause.deprecated && clause.supersededBy
        ? {
            supersededBy: clause.supersededBy,
            reason: clause.deprecationReason,
            message_he: `סעיף זה הוצא משימוש. השתמש בסעיף ${clause.supersededBy}.`,
            message_en: `This clause is deprecated. Use ${clause.supersededBy} instead.`,
          }
        : null,
    });
  }

  /* =========================================================
   * searchClauses — TF-IDF scoring
   * ========================================================= */
  searchClauses({ query, category, riskLevel, jurisdiction } = {}) {
    const corpus = [];
    for (const [clauseId, clause] of this._clauses.entries()) {
      const head = this._versions.get(clauseId).slice(-1)[0];
      corpus.push({ clauseId, clause, head });
    }
    // Pre-filter non-textual criteria
    const filtered = corpus.filter(({ clause, head }) => {
      if (category && clause.category !== category) return false;
      if (riskLevel && head.riskLevel !== riskLevel) return false;
      if (jurisdiction && !head.jurisdiction.includes(jurisdiction)) return false;
      return true;
    });

    if (!_nonEmptyString(query)) {
      return filtered.map(({ clauseId, clause, head }) => _freeze({
        clauseId,
        category: clause.category,
        title_he: head.title_he,
        title_en: head.title_en,
        riskLevel: head.riskLevel,
        deprecated: clause.deprecated,
        score: 0,
      }));
    }

    // Build doc-token arrays and DF
    const docs = filtered.map(({ clauseId, clause, head }) => {
      const blob = [
        head.title_he, head.title_en,
        head.text_he,  head.text_en,
        clause.category,
        (head.legalCitation || []).join(' '),
      ].filter(_nonEmptyString).join(' ');
      return { clauseId, clause, head, tokens: _tokenize(blob) };
    });

    const df = new Map();
    for (const d of docs) {
      const seen = new Set(d.tokens);
      for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = docs.length || 1;

    const qTokens = _tokenize(query);
    const scored = docs.map((d) => {
      const tf = new Map();
      for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
      let score = 0;
      for (const qt of qTokens) {
        const tfq = tf.get(qt) || 0;
        if (tfq === 0) continue;
        const dfq = df.get(qt) || 1;
        const idf = Math.log(1 + N / dfq);
        score += (tfq / Math.max(1, d.tokens.length)) * idf;
      }
      return {
        clauseId: d.clauseId,
        category: d.clause.category,
        title_he: d.head.title_he,
        title_en: d.head.title_en,
        riskLevel: d.head.riskLevel,
        deprecated: d.clause.deprecated,
        score,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((r) => r.score > 0).map(_freeze);
  }

  /* =========================================================
   * assembleContract — build contract from clauses + variables
   * ========================================================= */
  assembleContract({ templateId, clauseIds, variables } = {}) {
    if (!_nonEmptyString(templateId)) {
      const err = new Error('INVALID_TEMPLATE_ID'); err.code = 'INVALID_TEMPLATE_ID'; throw err;
    }
    if (!Array.isArray(clauseIds) || clauseIds.length === 0) {
      const err = new Error('INVALID_CLAUSE_IDS'); err.code = 'INVALID_CLAUSE_IDS'; throw err;
    }
    const vars = variables && typeof variables === 'object' ? variables : {};

    const sections_he = [];
    const sections_en = [];
    const includedClauses = [];
    const unresolvedVars = new Set();
    const missingClauses = [];
    const deprecatedUsed = [];

    for (const cid of clauseIds) {
      const clause = this._clauses.get(cid);
      if (!clause) { missingClauses.push(cid); continue; }
      const head = this._versions.get(cid).slice(-1)[0];
      if (clause.deprecated) deprecatedUsed.push({ clauseId: cid, supersededBy: clause.supersededBy });

      const text_he = _substituteVariables(head.text_he, vars);
      const text_en = _substituteVariables(head.text_en, vars);

      for (const v of _extractVariables(text_he)) unresolvedVars.add(v);
      for (const v of _extractVariables(text_en)) unresolvedVars.add(v);

      sections_he.push(`סעיף: ${head.title_he}\n${text_he}`);
      sections_en.push(`Clause: ${head.title_en}\n${text_en}`);

      includedClauses.push({
        clauseId: cid,
        version: head.version,
        category: clause.category,
        riskLevel: head.riskLevel,
      });

      // Append-only usage entry
      const ms = this._now();
      const usageEntry = _freeze({
        usageId: _genId('use'),
        templateId,
        timestamp: _isoStamp(ms),
        timestampMs: ms,
        version: head.version,
      });
      const bucket = this._usage.get(cid) || [];
      bucket.push(usageEntry);
      this._usage.set(cid, bucket);
    }

    if (missingClauses.length > 0) {
      const err = new Error(`MISSING_CLAUSES: ${missingClauses.join(', ')}`);
      err.code = 'MISSING_CLAUSES';
      err.missing = missingClauses;
      throw err;
    }

    const assemblyId = _genId('asm');
    const ms = this._now();
    const contract_he =
      `חוזה — תבנית ${templateId}\n\n` +
      sections_he.join('\n\n') +
      `\n\n--- סוף חוזה ---`;
    const contract_en =
      `Contract — Template ${templateId}\n\n` +
      sections_en.join('\n\n') +
      `\n\n--- End of Contract ---`;

    const record = _freeze({
      assemblyId,
      templateId,
      timestamp: _isoStamp(ms),
      timestampMs: ms,
      clauseIds: Object.freeze(clauseIds.slice()),
      includedClauses: Object.freeze(includedClauses.map(_freeze)),
      variables: _freeze({ ...vars }),
      unresolvedVariables: Object.freeze(Array.from(unresolvedVars)),
      deprecatedUsed: Object.freeze(deprecatedUsed.map(_freeze)),
      contract_he,
      contract_en,
    });
    this._assemblies.set(assemblyId, record);
    this._event('contract.assembled', {
      assemblyId, templateId, clauseCount: clauseIds.length,
      unresolvedCount: unresolvedVars.size,
    });
    return record;
  }

  /* =========================================================
   * compareClauseVersions — diff two versions
   * ========================================================= */
  compareClauseVersions(clauseId, v1, v2) {
    this._requireClause(clauseId);
    const versions = this._versions.get(clauseId);
    const a = versions.find((v) => v.version === v1);
    const b = versions.find((v) => v.version === v2);
    if (!a) {
      const err = new Error(`VERSION_NOT_FOUND: ${clauseId} v${v1}`);
      err.code = 'VERSION_NOT_FOUND'; throw err;
    }
    if (!b) {
      const err = new Error(`VERSION_NOT_FOUND: ${clauseId} v${v2}`);
      err.code = 'VERSION_NOT_FOUND'; throw err;
    }

    const diff_he = _lineDiff(a.text_he, b.text_he);
    const diff_en = _lineDiff(a.text_en, b.text_en);

    const counts = (diff) => ({
      added:     diff.filter((d) => d.op === 'ins').length,
      removed:   diff.filter((d) => d.op === 'del').length,
      unchanged: diff.filter((d) => d.op === 'eq').length,
    });

    return _freeze({
      clauseId,
      from: v1,
      to: v2,
      titleChanged_he: a.title_he !== b.title_he,
      titleChanged_en: a.title_en !== b.title_en,
      riskChanged: a.riskLevel !== b.riskLevel,
      riskFrom: a.riskLevel,
      riskTo:   b.riskLevel,
      diff_he: Object.freeze(diff_he.map(_freeze)),
      diff_en: Object.freeze(diff_en.map(_freeze)),
      stats_he: _freeze(counts(diff_he)),
      stats_en: _freeze(counts(diff_en)),
    });
  }

  /* =========================================================
   * riskScore — aggregate risk from contract text
   * ========================================================= */
  riskScore(contractText) {
    if (!_nonEmptyString(contractText)) {
      return _freeze({
        score: 0, maxScore: 0, normalized: 0,
        level: 'low', matchedClauses: Object.freeze([]),
      });
    }
    const matched = [];
    let total = 0;
    let maxScore = 0;

    for (const [clauseId, clause] of this._clauses.entries()) {
      const head = this._versions.get(clauseId).slice(-1)[0];
      // Look for the clause title in either language as a fingerprint
      const marker_he = head.title_he;
      const marker_en = head.title_en;
      const inContract =
        (marker_he && contractText.includes(marker_he)) ||
        (marker_en && contractText.includes(marker_en));
      if (inContract) {
        const w = RISK_WEIGHTS[head.riskLevel] || 0;
        total += w;
        maxScore += RISK_WEIGHTS.critical;
        matched.push(_freeze({
          clauseId,
          category: clause.category,
          riskLevel: head.riskLevel,
          weight: w,
        }));
      }
    }

    const normalized = maxScore === 0 ? 0 : total / maxScore;
    let level = 'low';
    if (normalized >= 0.66) level = 'critical';
    else if (normalized >= 0.40) level = 'high';
    else if (normalized >= 0.15) level = 'medium';

    return _freeze({
      score: total,
      maxScore,
      normalized,
      level,
      levelLabel: RISK_LABELS[level],
      matchedClauses: Object.freeze(matched),
    });
  }

  /* =========================================================
   * alternativeClauses — same category, different risk
   * ========================================================= */
  alternativeClauses(clauseId) {
    const clause = this._requireClause(clauseId);
    const head = this._versions.get(clauseId).slice(-1)[0];
    const results = [];
    for (const [otherId, other] of this._clauses.entries()) {
      if (otherId === clauseId) continue;
      if (other.deprecated) continue;
      if (other.category !== clause.category) continue;
      const otherHead = this._versions.get(otherId).slice(-1)[0];
      if (otherHead.riskLevel === head.riskLevel) continue;
      results.push(_freeze({
        clauseId: otherId,
        category: other.category,
        riskLevel: otherHead.riskLevel,
        title_he: otherHead.title_he,
        title_en: otherHead.title_en,
        riskDelta: RISK_WEIGHTS[otherHead.riskLevel] - RISK_WEIGHTS[head.riskLevel],
      }));
    }
    results.sort((a, b) => a.riskDelta - b.riskDelta);
    return Object.freeze(results);
  }

  /* =========================================================
   * approvalWorkflow — legal review
   * ========================================================= */
  approvalWorkflow(clauseId, approvers) {
    const clause = this._requireClause(clauseId);
    if (!Array.isArray(approvers) || approvers.length === 0) {
      const err = new Error('INVALID_APPROVERS'); err.code = 'INVALID_APPROVERS'; throw err;
    }
    const approvalId = _genId('apr');
    const ms = this._now();
    const reviews = approvers.map((a) => {
      const reviewer = typeof a === 'string' ? { id: a, decision: 'pending' } : { ...a };
      return _freeze({
        reviewerId: reviewer.id || reviewer.reviewerId || _genId('rev'),
        role: reviewer.role || 'legal',
        decision: APPROVAL_STATUS.includes(reviewer.decision) ? reviewer.decision : 'pending',
        notes: reviewer.notes || '',
        decidedAt: reviewer.decidedAt || null,
      });
    });

    const allApproved = reviews.every((r) => r.decision === 'approved');
    const anyRejected = reviews.some((r) => r.decision === 'rejected');
    const anyNeedsRev = reviews.some((r) => r.decision === 'needs-revision');

    let status = 'pending';
    if (anyRejected) status = 'rejected';
    else if (anyNeedsRev) status = 'needs-revision';
    else if (allApproved) status = 'approved';

    const record = _freeze({
      approvalId,
      clauseId,
      clauseVersion: clause.currentVersion,
      status,
      statusLabel: APPROVAL_STATUS_LABELS[status],
      reviews: Object.freeze(reviews),
      createdAt: _isoStamp(ms),
      createdAtMs: ms,
    });
    this._approvals.set(approvalId, record);

    if (status === 'approved') {
      const newClause = _freeze({ ...clause, approvalStatus: 'approved' });
      this._clauses.set(clauseId, newClause);
    }

    this._event('clause.approval', { clauseId, approvalId, status });
    return record;
  }

  /* =========================================================
   * usageAnalytics — how often used
   * ========================================================= */
  usageAnalytics(clauseId, period = {}) {
    this._requireClause(clauseId);
    const all = this._usage.get(clauseId) || [];
    const fromMs = period.from !== undefined ? _nowMs(period.from) : -Infinity;
    const toMs   = period.to   !== undefined ? _nowMs(period.to)   : Infinity;
    const inRange = all.filter((u) => u.timestampMs >= fromMs && u.timestampMs <= toMs);
    const byTemplate = new Map();
    for (const u of inRange) {
      const k = u.templateId;
      byTemplate.set(k, (byTemplate.get(k) || 0) + 1);
    }
    return _freeze({
      clauseId,
      totalUsage: inRange.length,
      allTimeUsage: all.length,
      periodFrom: Number.isFinite(fromMs) ? _isoStamp(fromMs) : null,
      periodTo:   Number.isFinite(toMs)   ? _isoStamp(toMs)   : null,
      byTemplate: Object.freeze(
        Array.from(byTemplate.entries())
          .map(([templateId, count]) => _freeze({ templateId, count }))
          .sort((a, b) => b.count - a.count),
      ),
      usages: Object.freeze(inRange.map((u) => _freeze({ ...u }))),
    });
  }

  /* =========================================================
   * deprecateClause — soft-deprecate, never delete
   * ========================================================= */
  deprecateClause(clauseId, reason, supersededBy) {
    const clause = this._requireClause(clauseId);
    if (!_nonEmptyString(reason)) {
      const err = new Error('INVALID_REASON'); err.code = 'INVALID_REASON'; throw err;
    }
    if (_nonEmptyString(supersededBy) && !this._clauses.has(supersededBy)) {
      const err = new Error(`SUPERSEDER_NOT_FOUND: ${supersededBy}`);
      err.code = 'SUPERSEDER_NOT_FOUND'; throw err;
    }
    const newClause = _freeze({
      ...clause,
      deprecated: true,
      deprecationReason: String(reason),
      supersededBy: _nonEmptyString(supersededBy) ? String(supersededBy) : null,
    });
    this._clauses.set(clauseId, newClause);
    this._event('clause.deprecated', {
      clauseId,
      reason: String(reason),
      supersededBy: _nonEmptyString(supersededBy) ? String(supersededBy) : null,
    });
    // IMPORTANT: versions, approvals, usage are untouched — rule compliance
    return _freeze({
      clauseId,
      deprecated: true,
      reason: String(reason),
      supersededBy: _nonEmptyString(supersededBy) ? String(supersededBy) : null,
      preserved: _freeze({
        versionCount: (this._versions.get(clauseId) || []).length,
        usageCount:  (this._usage.get(clauseId) || []).length,
      }),
    });
  }

  /* =========================================================
   * bilingualPairing — rule-based semantic equivalence check
   * ========================================================= */
  bilingualPairing(clauseId) {
    this._requireClause(clauseId);
    const head = this._versions.get(clauseId).slice(-1)[0];
    const he = head.text_he || '';
    const en = head.text_en || '';

    const heVars = new Set(_extractVariables(he));
    const enVars = new Set(_extractVariables(en));
    const missingInEn = Array.from(heVars).filter((v) => !enVars.has(v));
    const missingInHe = Array.from(enVars).filter((v) => !heVars.has(v));

    // Numeric token comparison (percentages, amounts, days, years)
    const numPattern = /\d+(?:[.,]\d+)?/g;
    const heNums = (he.match(numPattern) || []).map(String).sort();
    const enNums = (en.match(numPattern) || []).map(String).sort();
    const numMatch = heNums.join('|') === enNums.join('|');

    // Length ratio — Hebrew usually 0.6–1.4x of English by char count
    const heLen = he.length;
    const enLen = en.length;
    const lengthRatio = enLen === 0 ? 0 : heLen / enLen;
    const lengthOk = lengthRatio >= 0.4 && lengthRatio <= 2.5;

    // Glossary term coverage: for each glossary pair present in he, also expect en term
    const termCoverage = [];
    for (const term of HEBREW_GLOSSARY) {
      const hasHe = he.includes(term.he);
      const hasEn = en.toLowerCase().includes(term.en.toLowerCase());
      if (hasHe || hasEn) {
        termCoverage.push(_freeze({
          he: term.he, en: term.en,
          heFound: hasHe, enFound: hasEn,
          paired: hasHe === hasEn,
        }));
      }
    }
    const pairedTerms = termCoverage.filter((t) => t.paired).length;
    const totalTerms = termCoverage.length;
    const termScore = totalTerms === 0 ? 1 : pairedTerms / totalTerms;

    // Final similarity score (weighted)
    let score = 0;
    score += 0.30 * (missingInEn.length === 0 && missingInHe.length === 0 ? 1 : 0);
    score += 0.25 * (numMatch ? 1 : 0);
    score += 0.15 * (lengthOk ? 1 : 0);
    score += 0.30 * termScore;

    const equivalent = score >= 0.75
      && missingInEn.length === 0
      && missingInHe.length === 0
      && numMatch;

    return _freeze({
      clauseId,
      equivalent,
      score,
      variables: _freeze({
        missingInEn: Object.freeze(missingInEn),
        missingInHe: Object.freeze(missingInHe),
      }),
      numericTokens: _freeze({
        he: Object.freeze(heNums),
        en: Object.freeze(enNums),
        match: numMatch,
      }),
      length: _freeze({
        he: heLen, en: enLen, ratio: lengthRatio, ok: lengthOk,
      }),
      terms: _freeze({
        total: totalTerms,
        paired: pairedTerms,
        coverage: Object.freeze(termCoverage),
        score: termScore,
      }),
      issues: Object.freeze([
        ...(missingInEn.length > 0 ? [{ code: 'VAR_MISSING_EN', vars: missingInEn }] : []),
        ...(missingInHe.length > 0 ? [{ code: 'VAR_MISSING_HE', vars: missingInHe }] : []),
        ...(!numMatch ? [{ code: 'NUMERIC_MISMATCH' }] : []),
        ...(!lengthOk ? [{ code: 'LENGTH_RATIO_OUT_OF_RANGE', ratio: lengthRatio }] : []),
      ].map(_freeze)),
    });
  }

  /* =========================================================
   * Introspection helpers
   * ========================================================= */
  listClauses({ includeDeprecated = true } = {}) {
    const out = [];
    for (const [clauseId, clause] of this._clauses.entries()) {
      if (!includeDeprecated && clause.deprecated) continue;
      const head = this._versions.get(clauseId).slice(-1)[0];
      out.push(_freeze({
        clauseId,
        category: clause.category,
        version: clause.currentVersion,
        riskLevel: head.riskLevel,
        deprecated: clause.deprecated,
        title_he: head.title_he,
        title_en: head.title_en,
      }));
    }
    return Object.freeze(out);
  }

  listVersions(clauseId) {
    this._requireClause(clauseId);
    const versions = this._versions.get(clauseId) || [];
    return Object.freeze(versions.map((v) => _freeze({
      version: v.version,
      riskLevel: v.riskLevel,
      createdAt: v.createdAt,
      changeNote: v.changeNote,
    })));
  }

  eventLog() {
    return Object.freeze(this._events.slice());
  }

  getGlossary() {
    return HEBREW_GLOSSARY;
  }

  getCategories() {
    return CATEGORIES;
  }

  getCitations() {
    return IL_LAW_CITATIONS;
  }
}

/* ============================================================
 * Exports
 * ============================================================ */

module.exports = {
  ClauseLibrary,
  CATEGORIES,
  CATEGORY_LABELS,
  RISK_LEVELS,
  RISK_WEIGHTS,
  RISK_LABELS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_LABELS,
  JURISDICTIONS,
  JURISDICTION_LABELS,
  IL_LAW_CITATIONS,
  HEBREW_GLOSSARY,
  VARIABLE_PATTERN,
};
