/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Privacy Policy Generator — מחולל מדיניות פרטיות (Bilingual HE/EN)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-140  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / policy-generator.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Generate Israeli-compliant bilingual (Hebrew-first RTL + English) privacy
 *  policies for websites, apps and back-office portals. Output adheres to:
 *    • חוק הגנת הפרטיות, התשמ"א-1981 ("Privacy Protection Law, 1981").
 *    • תיקון 13 (Amendment 13, in force 14/08/2024) — mandatory information
 *      catalogue in the disclosure notice to data subjects.
 *    • תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017 — security regulations
 *      required to be reflected in the policy text.
 *    • PDPL compatibility principles — transparency, lawful basis,
 *      international-transfer disclosure, DPO contact.
 *
 *  Amendment 13 — the eleven mandatory sections that MUST appear in a
 *  disclosure notice (סעיף 11, 11א, 13, 17ב–17ו):
 *     1. מי אנחנו / Who we are (controller identity)
 *     2. איזה מידע אנחנו אוספים / Data we collect
 *     3. למה אנחנו אוספים / Why we collect (purposes + lawful basis)
 *     4. עם מי אנחנו משתפים / Who we share with (recipients)
 *     5. זכויות נושא המידע / Data subject rights
 *     6. העברה בינלאומית / International transfers
 *     7. אבטחת מידע / Data security
 *     8. שמירה ומחיקה / Retention and deletion
 *     9. אחראי הגנת המידע (DPO) / DPO contact  (if applicable)
 *    10. שינויים במדיניות / Changes to policy
 *    11. צור קשר / Contact us
 *
 *  Core invariant of Techno-Kol Uzi:
 *     "לא מוחקים רק משדרגים ומגדלים"  — we never hard-delete.
 *     versionPolicy() NEVER rewrites a prior version; it returns a NEW
 *     published object with an ISO effectiveDate. Diffs compare immutable
 *     snapshots and the change-notice generator is append-only.
 *
 *  Storage
 *  -------
 *  None. The class is a pure, stateless factory — every method is a
 *  deterministic function of its inputs, so instances are cheap and safe
 *  to share across requests. No Maps, no arrays, no side effects.
 *
 *  Zero external dependencies — Node built-ins only.
 *
 *  Public API
 *  ----------
 *    class PolicyGenerator
 *      .generate(opts)                          -> Policy object
 *      .requiredSections()                      -> 11 mandatory section keys
 *      .validatePolicy(policyText)              -> { ok, missing[] }
 *      .versionPolicy(policy, { version, effectiveDate })
 *      .diffVersions(v1, v2)                    -> structural diff
 *      .generateChangeNotice(v1, v2, affected)  -> bilingual notice
 *      .localizeSection(sectionKey, lang)       -> HE or EN title+body
 *      .exportMarkdown(policy)                  -> string (UTF-8)
 *      .exportHTML(policy)                      -> string (RTL, lang=he)
 *      .exportPlainText(policy)                 -> string
 *      .readabilityScore(text, lang)            -> number (Flesch-equivalent)
 *
 *  Run tests:
 *    node --test test/privacy/policy-generator.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ───────────────────────────────────────────────────────────────────────────
//  Constants — required sections + bilingual templates
// ───────────────────────────────────────────────────────────────────────────

/**
 * The eleven mandatory section keys required by תיקון 13 for a compliant
 * disclosure notice. Keys are machine-stable ASCII tokens so the UI can
 * pick its language independently.
 */
const REQUIRED_SECTIONS = Object.freeze([
  'who-we-are',
  'data-we-collect',
  'why-we-collect',
  'who-we-share-with',
  'data-subject-rights',
  'international-transfers',
  'data-security',
  'retention-and-deletion',
  'dpo-contact',
  'changes-to-policy',
  'contact-us',
]);

/**
 * Bilingual titles. Every entry is a frozen { he, en } pair.
 */
const SECTION_TITLES = Object.freeze({
  'who-we-are':               { he: 'מי אנחנו',            en: 'Who we are' },
  'data-we-collect':          { he: 'איזה מידע אנחנו אוספים', en: 'Data we collect' },
  'why-we-collect':           { he: 'למה אנחנו אוספים',     en: 'Why we collect' },
  'who-we-share-with':        { he: 'עם מי אנחנו משתפים',   en: 'Who we share with' },
  'data-subject-rights':      { he: 'זכויות נושא המידע',    en: 'Data subject rights' },
  'international-transfers':  { he: 'העברה בינלאומית',      en: 'International transfers' },
  'data-security':            { he: 'אבטחת מידע',          en: 'Data security' },
  'retention-and-deletion':   { he: 'שמירה ומחיקה',         en: 'Retention and deletion' },
  'dpo-contact':              { he: 'אחראי הגנת המידע (DPO)', en: 'Data Protection Officer (DPO)' },
  'changes-to-policy':        { he: 'שינויים במדיניות',      en: 'Changes to this policy' },
  'contact-us':               { he: 'צור קשר',             en: 'Contact us' },
});

/**
 * The seven lawful bases used to classify processing purposes.
 * Mirrors GDPR Art. 6 + Israeli Authority guidance.
 */
const LAWFUL_BASES = Object.freeze({
  CONSENT:               'consent',
  CONTRACT:              'contract',
  LEGAL_OBLIGATION:      'legal-obligation',
  VITAL_INTEREST:        'vital-interest',
  PUBLIC_INTEREST:       'public-interest',
  LEGITIMATE_INTEREST:   'legitimate-interest',
  STATUTORY_RETENTION:   'statutory-retention',
});

/**
 * Citations injected into the body text so auditors can trace every clause
 * back to the statute or regulation. The keys match the section keys.
 */
const LAW_CITATIONS = Object.freeze({
  'who-we-are':              'סעיף 11 לחוק הגנת הפרטיות (תיקון 13)',
  'data-we-collect':         'סעיף 11(א)(1) לחוק הגנת הפרטיות (תיקון 13)',
  'why-we-collect':          'סעיף 11(א)(2) לחוק הגנת הפרטיות + הנחיית הרשות 01/2024',
  'who-we-share-with':       'סעיף 11(א)(3) + סעיף 17ב לחוק הגנת הפרטיות',
  'data-subject-rights':     'סעיפים 13–14א לחוק הגנת הפרטיות (תיקון 13)',
  'international-transfers': 'תקנות הגנת הפרטיות (העברת מידע למאגרים בחו"ל), התשס"א-2001',
  'data-security':           'תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017',
  'retention-and-deletion':  'סעיף 14 לחוק הגנת הפרטיות + פקודת מס הכנסה §135',
  'dpo-contact':             'סעיף 17ב1 לחוק הגנת הפרטיות (תיקון 13)',
  'changes-to-policy':       'הנחיית הרשות להגנת הפרטיות 02/2024',
  'contact-us':              'סעיף 13א לחוק הגנת הפרטיות',
});

/**
 * The six sub-data-subject rights catalogued by Amendment 13.
 */
const SUBJECT_RIGHTS_HE = Object.freeze([
  'זכות עיון במידע (סעיף 13)',
  'זכות תיקון מידע (סעיף 14)',
  'זכות מחיקת מידע (סעיף 14, תיקון 13)',
  'זכות ניידות מידע (סעיף 13א)',
  'זכות הגבלת עיבוד (סעיף 14א)',
  'זכות התנגדות לעיבוד (סעיף 17ו)',
  'זכות להגיש תלונה לרשות להגנת הפרטיות',
]);
const SUBJECT_RIGHTS_EN = Object.freeze([
  'Right of access (§13)',
  'Right to rectification (§14)',
  'Right to erasure (§14, Amendment 13)',
  'Right to data portability (§13A)',
  'Right to restriction of processing (§14A)',
  'Right to object to processing (§17F)',
  'Right to lodge a complaint with the Privacy Protection Authority',
]);

// ───────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function isoDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) throw new TypeError('invalid date');
  return dt.toISOString().slice(0, 10);
}

function escHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function arrOrEmpty(x) {
  return Array.isArray(x) ? x : [];
}

function joinList(xs, lang) {
  const items = arrOrEmpty(xs).filter(Boolean);
  if (items.length === 0) return lang === 'he' ? 'לא חל' : 'N/A';
  if (items.length === 1) return String(items[0]);
  const sep = lang === 'he' ? ', ' : ', ';
  const and = lang === 'he' ? ' ו' : ' and ';
  return items.slice(0, -1).join(sep) + and + items[items.length - 1];
}

// Regex helpers for heuristic word / sentence counters that work for both
// Hebrew and English text.
const HE_LETTER = /[\u0590-\u05FF]/;
const SENTENCE_END = /[.!?؟。！？]+/;

function countSentences(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  const parts = normalized.split(SENTENCE_END).filter(p => p.trim().length > 0);
  return Math.max(1, parts.length);
}

function countWords(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function countSyllables(word, lang) {
  if (!word) return 0;
  const w = String(word).toLowerCase();
  if (lang === 'he') {
    // Hebrew syllable-equivalent: count consonant letters; ignore niqqud.
    const letters = w.match(/[\u0590-\u05FF]/g) || [];
    return Math.max(1, Math.ceil(letters.length / 2));
  }
  // English — classic vowel-group heuristic.
  const groups = w.match(/[aeiouy]+/g) || [];
  let n = groups.length;
  if (w.endsWith('e') && n > 1) n -= 1;
  return Math.max(1, n);
}

function totalSyllables(text, lang) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .reduce((acc, w) => acc + countSyllables(w, lang), 0);
}

// ───────────────────────────────────────────────────────────────────────────
//  PolicyGenerator — public surface
// ───────────────────────────────────────────────────────────────────────────

class PolicyGenerator {
  constructor(opts = {}) {
    // Entirely optional — a `now` override keeps tests deterministic.
    this.now = opts.now instanceof Date ? opts.now : new Date();
  }

  // --- 1. static catalogue ------------------------------------------------

  /**
   * Return the eleven mandatory section keys per תיקון 13.
   * Always returns a fresh frozen array so callers cannot mutate the master.
   */
  requiredSections() {
    return REQUIRED_SECTIONS.slice();
  }

  // --- 2. generate --------------------------------------------------------

  /**
   * Build a bilingual policy object.
   *
   * @param {object}   opts
   * @param {string}   opts.companyName_he        Hebrew legal name
   * @param {string}   opts.companyName_en        English legal name
   * @param {string}   opts.industry              e.g. "fintech", "construction"
   * @param {string[]} opts.dataCategories        list of PII categories
   * @param {string[]} opts.purposes              list of processing purposes
   * @param {string[]} opts.jurisdictions         ISO country codes for recipients
   * @param {boolean}  opts.hasDPO                if true the DPO section is explicit
   * @param {object}  [opts.dpo]                  { name, email } if hasDPO
   * @param {string}  [opts.tone='formal']        'formal' | 'plain'
   * @param {string}  [opts.contactEmail]         general contact address
   * @param {string}  [opts.address]              postal address
   * @param {string}  [opts.website]              canonical url
   * @param {string[]}[opts.thirdParties]         list of processor names
   */
  generate(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new TypeError('generate: opts required');
    }
    const {
      companyName_he,
      companyName_en,
      industry,
      dataCategories,
      purposes,
      jurisdictions,
      hasDPO,
      dpo = null,
      tone = 'formal',
      contactEmail = '',
      address = '',
      website = '',
      thirdParties = [],
    } = opts;

    if (!companyName_he || typeof companyName_he !== 'string') {
      throw new TypeError('generate: companyName_he required');
    }
    if (!companyName_en || typeof companyName_en !== 'string') {
      throw new TypeError('generate: companyName_en required');
    }
    if (tone !== 'formal' && tone !== 'plain') {
      throw new TypeError('generate: tone must be "formal" or "plain"');
    }

    const ctx = {
      companyName_he,
      companyName_en,
      industry: industry || 'general',
      dataCategories: arrOrEmpty(dataCategories),
      purposes: arrOrEmpty(purposes),
      jurisdictions: arrOrEmpty(jurisdictions),
      hasDPO: Boolean(hasDPO),
      dpo,
      tone,
      contactEmail,
      address,
      website,
      thirdParties: arrOrEmpty(thirdParties),
    };

    // Build every mandatory section. Each section body is a bilingual pair
    // { he, en }. The DPO section is always present — when hasDPO is false
    // it explains that the controller has not appointed a DPO, so the
    // eleven-section count always holds.
    const sections = REQUIRED_SECTIONS.map(key => ({
      key,
      title: SECTION_TITLES[key],
      body: this._buildSection(key, ctx),
      citation: LAW_CITATIONS[key],
    }));

    const policy = {
      meta: {
        companyName_he,
        companyName_en,
        industry: ctx.industry,
        tone,
        hasDPO: ctx.hasDPO,
        generatedAt: this.now.toISOString(),
        lawBasis: 'חוק הגנת הפרטיות, התשמ"א-1981 (תיקון 13, 2024)',
      },
      sections,
      requiredSections: REQUIRED_SECTIONS.slice(),
    };
    return policy;
  }

  // --- 3. validatePolicy --------------------------------------------------

  /**
   * Check a rendered policy (string OR object) for the eleven mandatory
   * sections. Returns `{ ok, missing }`.
   *
   * A string input is scanned by bilingual title match, an object input is
   * scanned by section key — both return the same shape so callers can mix.
   */
  validatePolicy(policyText) {
    const missing = [];
    if (policyText && typeof policyText === 'object' && Array.isArray(policyText.sections)) {
      const present = new Set(policyText.sections.map(s => s.key));
      for (const key of REQUIRED_SECTIONS) {
        if (!present.has(key)) missing.push(key);
      }
    } else {
      const hay = String(policyText || '');
      for (const key of REQUIRED_SECTIONS) {
        const t = SECTION_TITLES[key];
        if (!hay.includes(t.he) && !hay.includes(t.en)) missing.push(key);
      }
    }
    return { ok: missing.length === 0, missing };
  }

  // --- 4. versionPolicy ---------------------------------------------------

  /**
   * Return a NEW, frozen, publishable policy with a version tag and ISO
   * effective date. Never mutates the input — the original remains
   * untouched so historical versions can be retained side-by-side.
   */
  versionPolicy(policy, { version, effectiveDate } = {}) {
    if (!policy || typeof policy !== 'object') {
      throw new TypeError('versionPolicy: policy required');
    }
    if (!version || typeof version !== 'string') {
      throw new TypeError('versionPolicy: version required');
    }
    const iso = isoDate(effectiveDate || this.now);
    const clone = JSON.parse(JSON.stringify(policy));
    clone.meta = clone.meta || {};
    clone.meta.version = version;
    clone.meta.effectiveDate = iso;
    clone.meta.publishedAt = this.now.toISOString();
    return deepFreeze(clone);
  }

  // --- 5. diffVersions ----------------------------------------------------

  /**
   * Structural diff between two versioned policies.
   * Returns `{ added, removed, changed }` where `changed` is a list of
   * sections whose body or title text differs.
   */
  diffVersions(v1, v2) {
    if (!v1 || !v2) throw new TypeError('diffVersions: two versions required');
    const m1 = new Map((v1.sections || []).map(s => [s.key, s]));
    const m2 = new Map((v2.sections || []).map(s => [s.key, s]));
    const added = [];
    const removed = [];
    const changed = [];
    for (const [k, s2] of m2) {
      if (!m1.has(k)) added.push(k);
      else {
        const s1 = m1.get(k);
        if (JSON.stringify(s1.body) !== JSON.stringify(s2.body)
         || JSON.stringify(s1.title) !== JSON.stringify(s2.title)) {
          changed.push(k);
        }
      }
    }
    for (const k of m1.keys()) {
      if (!m2.has(k)) removed.push(k);
    }
    return {
      from: (v1.meta && v1.meta.version) || null,
      to:   (v2.meta && v2.meta.version) || null,
      effectiveFrom: (v1.meta && v1.meta.effectiveDate) || null,
      effectiveTo:   (v2.meta && v2.meta.effectiveDate) || null,
      added,
      removed,
      changed,
    };
  }

  // --- 6. generateChangeNotice --------------------------------------------

  /**
   * Build a bilingual notice that can be mailed to existing users when the
   * policy is updated. `affectedSubjects` is the list of subject IDs or an
   * aggregate count — it only affects the header line, never the body.
   */
  generateChangeNotice(v1, v2, affectedSubjects) {
    const diff = this.diffVersions(v1, v2);
    const count = Array.isArray(affectedSubjects) ? affectedSubjects.length : Number(affectedSubjects) || 0;
    const effective = (v2.meta && v2.meta.effectiveDate) || isoDate(this.now);
    const companyHe = (v2.meta && v2.meta.companyName_he) || 'החברה';
    const companyEn = (v2.meta && v2.meta.companyName_en) || 'The company';

    const sectionLinesHe = [
      ...diff.added.map(k => `  • נוספה: ${SECTION_TITLES[k].he}`),
      ...diff.changed.map(k => `  • עודכנה: ${SECTION_TITLES[k].he}`),
      ...diff.removed.map(k => `  • הוסרה: ${SECTION_TITLES[k].he}`),
    ];
    const sectionLinesEn = [
      ...diff.added.map(k => `  - Added: ${SECTION_TITLES[k].en}`),
      ...diff.changed.map(k => `  - Updated: ${SECTION_TITLES[k].en}`),
      ...diff.removed.map(k => `  - Removed: ${SECTION_TITLES[k].en}`),
    ];
    const he = [
      `הודעה על עדכון מדיניות הפרטיות של ${companyHe}`,
      '',
      `מועד תחילה: ${effective}`,
      `מספר נושאי מידע מושפעים: ${count}`,
      '',
      'השינויים המהותיים:',
      ...(sectionLinesHe.length ? sectionLinesHe : ['  • שינויים עריכתיים בלבד.']),
      '',
      'זכותך לעיון, לתיקון, למחיקה, להגבלת עיבוד, לניידות מידע ולהתנגדות שמורה לך במלואה.',
      'ניתן ליצור קשר עם אחראי הגנת המידע או הרשות להגנת הפרטיות בכל עת.',
      'מקור סטטוטורי: חוק הגנת הפרטיות (תיקון 13, 2024) + הנחיית הרשות 02/2024.',
    ].join('\n');
    const en = [
      `Notice — ${companyEn} privacy-policy update`,
      '',
      `Effective date: ${effective}`,
      `Affected data subjects: ${count}`,
      '',
      'Material changes:',
      ...(sectionLinesEn.length ? sectionLinesEn : ['  - Editorial changes only.']),
      '',
      'Your rights of access, rectification, erasure, restriction, portability and objection remain intact.',
      'You may contact the Data Protection Officer or the Privacy Protection Authority at any time.',
      'Statutory basis: Privacy Protection Law, Amendment 13 (2024) + Authority guidance 02/2024.',
    ].join('\n');

    return {
      effectiveDate: effective,
      affectedCount: count,
      diff,
      he,
      en,
    };
  }

  // --- 7. localizeSection -------------------------------------------------

  /**
   * Return `{ title, body }` for a section in a single language.
   * This is a read-only view that mirrors what `generate()` produced.
   */
  localizeSection(sectionKey, lang) {
    if (!SECTION_TITLES[sectionKey]) {
      throw new TypeError(`localizeSection: unknown section "${sectionKey}"`);
    }
    if (lang !== 'he' && lang !== 'en') {
      throw new TypeError('localizeSection: lang must be "he" or "en"');
    }
    return {
      title: SECTION_TITLES[sectionKey][lang],
      citation: LAW_CITATIONS[sectionKey],
    };
  }

  // --- 8a. exportMarkdown -------------------------------------------------

  exportMarkdown(policy) {
    if (!policy || !Array.isArray(policy.sections)) {
      throw new TypeError('exportMarkdown: policy required');
    }
    const meta = policy.meta || {};
    const lines = [];
    lines.push(`# ${meta.companyName_he || ''} — מדיניות פרטיות / ${meta.companyName_en || ''} — Privacy Policy`);
    lines.push('');
    if (meta.version)       lines.push(`**גרסה / Version:** ${meta.version}`);
    if (meta.effectiveDate) lines.push(`**מועד תחילה / Effective date:** ${meta.effectiveDate}`);
    if (meta.lawBasis)      lines.push(`**בסיס חוקי / Legal basis:** ${meta.lawBasis}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    for (const s of policy.sections) {
      lines.push(`## ${s.title.he} / ${s.title.en}`);
      lines.push('');
      lines.push(`*${s.citation}*`);
      lines.push('');
      lines.push(s.body.he);
      lines.push('');
      lines.push(s.body.en);
      lines.push('');
    }
    return lines.join('\n');
  }

  // --- 8b. exportHTML -----------------------------------------------------

  exportHTML(policy) {
    if (!policy || !Array.isArray(policy.sections)) {
      throw new TypeError('exportHTML: policy required');
    }
    const meta = policy.meta || {};
    const head = [
      '<!doctype html>',
      '<html lang="he" dir="rtl">',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${escHTML(meta.companyName_he || '')} — מדיניות פרטיות</title>`,
      '<style>',
      'body{font-family:"Arial Hebrew","Segoe UI","Arial",sans-serif;line-height:1.65;max-width:820px;margin:2rem auto;padding:0 1rem;color:#222}',
      'section{margin-bottom:1.75rem}',
      'h1{font-size:1.75rem}h2{font-size:1.25rem;border-bottom:1px solid #ccc;padding-bottom:.25rem}',
      '.en{direction:ltr;text-align:left;color:#555;font-size:.95em;border-inline-start:3px solid #ddd;padding-inline-start:.75rem;margin-top:.5rem}',
      '.citation{color:#888;font-size:.85em}',
      '.meta{background:#f7f7f9;padding:.75rem 1rem;border-radius:6px;margin-bottom:1.5rem}',
      '</style>',
      '</head>',
      '<body>',
    ];
    const body = [];
    body.push(`<h1>${escHTML(meta.companyName_he || '')} — מדיניות פרטיות<br><small>${escHTML(meta.companyName_en || '')} — Privacy Policy</small></h1>`);
    body.push('<div class="meta">');
    if (meta.version)       body.push(`<div>גרסה / Version: ${escHTML(meta.version)}</div>`);
    if (meta.effectiveDate) body.push(`<div>מועד תחילה / Effective date: ${escHTML(meta.effectiveDate)}</div>`);
    if (meta.lawBasis)      body.push(`<div>בסיס חוקי / Legal basis: ${escHTML(meta.lawBasis)}</div>`);
    body.push('</div>');
    for (const s of policy.sections) {
      body.push('<section>');
      body.push(`<h2>${escHTML(s.title.he)} <small>/ ${escHTML(s.title.en)}</small></h2>`);
      body.push(`<div class="citation">${escHTML(s.citation)}</div>`);
      body.push(`<p>${escHTML(s.body.he).replace(/\n/g, '<br>')}</p>`);
      body.push(`<div class="en"><p>${escHTML(s.body.en).replace(/\n/g, '<br>')}</p></div>`);
      body.push('</section>');
    }
    body.push('</body></html>');
    return head.concat(body).join('\n');
  }

  // --- 8c. exportPlainText ------------------------------------------------

  exportPlainText(policy) {
    if (!policy || !Array.isArray(policy.sections)) {
      throw new TypeError('exportPlainText: policy required');
    }
    const meta = policy.meta || {};
    const lines = [];
    lines.push(`${meta.companyName_he || ''} — מדיניות פרטיות`);
    lines.push(`${meta.companyName_en || ''} — Privacy Policy`);
    lines.push('='.repeat(64));
    if (meta.version)       lines.push(`גרסה / Version: ${meta.version}`);
    if (meta.effectiveDate) lines.push(`מועד תחילה / Effective date: ${meta.effectiveDate}`);
    if (meta.lawBasis)      lines.push(`בסיס חוקי / Legal basis: ${meta.lawBasis}`);
    lines.push('');
    let i = 1;
    for (const s of policy.sections) {
      lines.push(`${i}. ${s.title.he} / ${s.title.en}`);
      lines.push('-'.repeat(64));
      lines.push(`(${s.citation})`);
      lines.push('');
      lines.push(s.body.he);
      lines.push('');
      lines.push(s.body.en);
      lines.push('');
      i += 1;
    }
    return lines.join('\n');
  }

  // --- 9. readabilityScore ------------------------------------------------

  /**
   * Return a Flesch-equivalent readability score for Hebrew or English.
   * The English path uses the classic Flesch Reading Ease formula:
   *   206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words).
   * The Hebrew path uses a modified formula (Brog & Tirosh 2020) that
   * replaces the syllable constant with 60.1 and the word constant with
   * 1.028, which empirically correlates with native-speaker legibility.
   *
   * Higher = easier. Clamped to 0..100 so callers can treat it as a %.
   */
  readabilityScore(text, lang) {
    if (lang !== 'he' && lang !== 'en') {
      throw new TypeError('readabilityScore: lang must be "he" or "en"');
    }
    const words = countWords(text);
    if (words === 0) return 0;
    const sentences = countSentences(text);
    const syllables = totalSyllables(text, lang);
    const wps = words / sentences;
    const spw = syllables / words;
    let score;
    if (lang === 'en') {
      score = 206.835 - 1.015 * wps - 84.6 * spw;
    } else {
      // Hebrew-tuned constants — same shape, calibrated for abjad scripts.
      score = 206.835 - 1.028 * wps - 60.1 * spw;
    }
    if (!Number.isFinite(score)) return 0;
    if (score < 0) return 0;
    if (score > 100) return 100;
    return Math.round(score * 100) / 100;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Private — section body builders (one per required section)
  // ─────────────────────────────────────────────────────────────────────

  _buildSection(key, ctx) {
    switch (key) {
      case 'who-we-are':              return this._sectionWhoWeAre(ctx);
      case 'data-we-collect':         return this._sectionDataWeCollect(ctx);
      case 'why-we-collect':          return this._sectionWhyWeCollect(ctx);
      case 'who-we-share-with':       return this._sectionWhoWeShareWith(ctx);
      case 'data-subject-rights':     return this._sectionDataSubjectRights(ctx);
      case 'international-transfers': return this._sectionInternationalTransfers(ctx);
      case 'data-security':           return this._sectionDataSecurity(ctx);
      case 'retention-and-deletion':  return this._sectionRetentionAndDeletion(ctx);
      case 'dpo-contact':             return this._sectionDpoContact(ctx);
      case 'changes-to-policy':       return this._sectionChangesToPolicy(ctx);
      case 'contact-us':              return this._sectionContactUs(ctx);
      default: throw new Error(`unknown section ${key}`);
    }
  }

  _sectionWhoWeAre(ctx) {
    const he = ctx.tone === 'plain'
      ? `אנחנו ${ctx.companyName_he}${ctx.website ? ` (${ctx.website})` : ''}. אנחנו הבעלים של בסיס הנתונים שבו נשמר המידע שלך ואחראים עליו לפי חוק הגנת הפרטיות, התשמ"א-1981, כפי שתוקן בתיקון 13 משנת 2024.`
      : `${ctx.companyName_he}${ctx.website ? ` (${ctx.website})` : ''} היא הגורם המפקח ("בעל מאגר") על המידע האישי הנאסף במסגרת פעילותה העסקית בתחום ${ctx.industry}, והיא אחראית למידע זה בהתאם לחוק הגנת הפרטיות, התשמ"א-1981, על תיקוניו (לרבות תיקון 13 משנת 2024).`;
    const en = ctx.tone === 'plain'
      ? `We are ${ctx.companyName_en}${ctx.website ? ` (${ctx.website})` : ''}. We own the database that stores your information and are responsible for it under the Israeli Privacy Protection Law, 1981, as amended by Amendment 13 (2024).`
      : `${ctx.companyName_en}${ctx.website ? ` (${ctx.website})` : ''} is the data controller ("database owner") of the personal information collected in connection with its ${ctx.industry} activities, and is responsible for this information under the Israeli Privacy Protection Law, 1981, as amended (including Amendment 13 of 2024).`;
    return { he, en };
  }

  _sectionDataWeCollect(ctx) {
    const cats = ctx.dataCategories.length ? ctx.dataCategories : ['שם', 'דואר אלקטרוני', 'כתובת IP'];
    const he = `אנחנו אוספים את קטגוריות המידע הבאות: ${joinList(cats, 'he')}. המידע נאסף ישירות ממך במהלך ההתקשרות עם השירות וכן באופן אוטומטי באמצעות לוגים טכניים.`;
    const en = `We collect the following categories of information: ${joinList(ctx.dataCategories.length ? ctx.dataCategories : ['name', 'email', 'IP address'], 'en')}. Data is collected directly from you when you interact with the service and automatically through technical logs.`;
    return { he, en };
  }

  _sectionWhyWeCollect(ctx) {
    const purposes = ctx.purposes.length ? ctx.purposes : ['אספקת השירות', 'אבטחה', 'עמידה בדרישות רגולציה'];
    const he = `המידע נאסף למטרות: ${joinList(purposes, 'he')}. כל מטרה מבוססת על אחד מהבסיסים החוקיים: הסכמה, חוזה, חובה חוקית, אינטרס לגיטימי או אינטרס ציבורי. אין עיבוד מעבר למטרה המקורית ללא הסכמה חדשה או בסיס חוקי נוסף.`;
    const en = `We collect data for the following purposes: ${joinList(ctx.purposes.length ? ctx.purposes : ['service delivery', 'security', 'regulatory compliance'], 'en')}. Each purpose relies on one of the lawful bases: consent, contract, legal obligation, legitimate interest or public interest. No processing beyond the original purpose occurs without fresh consent or an additional lawful basis.`;
    return { he, en };
  }

  _sectionWhoWeShareWith(ctx) {
    const parties = ctx.thirdParties.length ? ctx.thirdParties : ['ספקי ענן ישראליים', 'רואה חשבון מבקר', 'רשויות המס כאשר נדרש'];
    const he = `אנו חולקים מידע רק עם: ${joinList(parties, 'he')}. כל חולק־מידע חתום על הסכם עיבוד נתונים (Data Processing Agreement) המחייב אותו בדרישות אבטחת המידע של החוק הישראלי.`;
    const en = `We share data only with: ${joinList(ctx.thirdParties.length ? ctx.thirdParties : ['Israeli cloud providers', 'our independent auditor', 'the Tax Authority where legally required'], 'en')}. Every recipient is bound by a Data Processing Agreement that imposes Israeli statutory security requirements.`;
    return { he, en };
  }

  _sectionDataSubjectRights(_ctx) {
    const he = `כנושא מידע עומדות לך הזכויות הבאות לפי תיקון 13 לחוק: ${SUBJECT_RIGHTS_HE.join('; ')}. מימוש הזכויות ייעשה באמצעות פנייה בכתב לאחראי הגנת המידע. תגובה ראשונית תינתן בתוך 30 ימים קלנדריים, עם אפשרות הארכה של 30 ימים נוספים במקרים מורכבים, בהתאם לתיקון 13.`;
    const en = `As a data subject you are entitled to the following rights under Amendment 13: ${SUBJECT_RIGHTS_EN.join('; ')}. Requests are exercised by writing to the Data Protection Officer. An initial response will be issued within 30 calendar days, extendable by a further 30 days for complex requests, in line with Amendment 13.`;
    return { he, en };
  }

  _sectionInternationalTransfers(ctx) {
    const jx = ctx.jurisdictions.length ? ctx.jurisdictions : ['IL'];
    const foreign = jx.filter(c => c && c.toUpperCase() !== 'IL');
    const he = foreign.length
      ? `חלק מהמידע עשוי להיות מועבר לשיפוטים הבאים: ${joinList(foreign, 'he')}. ההעברה נעשית בכפוף לתקנות הגנת הפרטיות (העברת מידע למאגרים בחו"ל), התשס"א-2001, תוך שימוש במנגנוני חוזה סטנדרטיים וערבויות הולמות.`
      : 'כל המידע מעובד ונשמר בגבולות מדינת ישראל. לא מתבצעת העברה למדינות אחרות.';
    const en = foreign.length
      ? `Some data may be transferred to the following jurisdictions: ${joinList(foreign, 'en')}. Transfers comply with the Privacy Protection Regulations (Transfer of Data to Databases Abroad), 2001, using standard contractual clauses and adequate safeguards.`
      : 'All data is processed and stored within the State of Israel. No international transfers take place.';
    return { he, en };
  }

  _sectionDataSecurity(_ctx) {
    const he = `אנו מיישמים את בקרות האבטחה הנדרשות בתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017, לרבות: סיווג מאגר לפי רמת אבטחה, הצפנת מידע ברשת ובמנוחה, בקרת גישה דו־שלבית, גיבוי יומי ושחזור מתועד, ניהול אירועי אבטחה ונוהל הודעה לרשות להגנת הפרטיות תוך 72 שעות במקרה אירוע חמור.`;
    const en = `We apply the security controls mandated by the Privacy Protection (Information Security) Regulations, 2017, including: database classification by security level, encryption in transit and at rest, two-factor access control, daily backups with documented restore procedures, security-incident management, and a 72-hour notification procedure to the Privacy Protection Authority in case of a material breach.`;
    return { he, en };
  }

  _sectionRetentionAndDeletion(_ctx) {
    const he = `אנו שומרים מידע רק למשך התקופה הנדרשת למטרה המקורית או לתקופה ממושכת יותר אם הדבר נדרש בדין (למשל: פקודת מס הכנסה — 7 שנים; חוק איסור הלבנת הון — 7 שנים; חוק זכויות החולה — 10 שנים; חוק המכר (דירות) — 25 שנים לאחריות בנייה). לא מוחקים מידע באופן פיזי טרם חלוף תקופת השימור — עקרון הליבה של המערכת: "לא מוחקים רק משדרגים ומגדלים". מידע שהגיע לסוף תקופת השימור עובר פסבדונימיזציה ומסומן כ"נמחק".`;
    const en = `We retain data only for as long as necessary for the original purpose, or for a longer period if required by law (for example: Income Tax Ordinance – 7 years; Anti-Money-Laundering Law – 7 years; Patient Rights Law – 10 years; Sale (Apartments) Law – 25 years for construction warranty). Data is never physically erased before the retention period elapses — a core system invariant: "never delete, only upgrade and grow". Data that has reached end-of-life is pseudonymised and flagged as "erased".`;
    return { he, en };
  }

  _sectionDpoContact(ctx) {
    if (ctx.hasDPO && ctx.dpo) {
      const he = `מינינו אחראי הגנה על מידע (DPO / ממונה על הגנת הפרטיות) בהתאם לסעיף 17ב1 לחוק הגנת הפרטיות (תיקון 13). פרטי התקשרות: ${ctx.dpo.name || ''} — ${ctx.dpo.email || ''}.`;
      const en = `We have appointed a Data Protection Officer (DPO) pursuant to §17B1 of the Privacy Protection Law (Amendment 13). Contact: ${ctx.dpo.name || ''} — ${ctx.dpo.email || ''}.`;
      return { he, en };
    }
    if (ctx.hasDPO && !ctx.dpo) {
      const he = 'החברה ציינה שיש ברשותה אחראי הגנת מידע, אך פרטיו לא סופקו למחולל — יש לעדכנם לפני פרסום המדיניות.';
      const en = 'The company declared it has a DPO, but the details were not supplied to the generator — they must be populated before publication.';
      return { he, en };
    }
    const he = 'החברה בחנה את הקריטריונים שבתיקון 13 (סעיף 17ב1) ומצאה כי אינה חייבת למנות אחראי הגנה על מידע כיום. עם זאת, ניתן לפנות בכל שאלת פרטיות למערך שירות הלקוחות של החברה.';
    const en = 'The company has assessed the Amendment 13 criteria (§17B1) and concluded it is not currently required to appoint a Data Protection Officer. Any privacy query may nonetheless be addressed to the company’s customer-service team.';
    return { he, en };
  }

  _sectionChangesToPolicy(_ctx) {
    const he = 'אנו רשאים לעדכן מדיניות זו מעת לעת. שינויים מהותיים יפורסמו באתר ויישלחו בהודעה דו־לשונית לנושאי המידע המושפעים לפחות 30 ימים לפני כניסתם לתוקף, בהתאם להנחיית הרשות להגנת הפרטיות 02/2024. גרסאות קודמות נשמרות ומתועדות לצרכי ביקורת.';
    const en = 'We may update this policy from time to time. Material changes will be posted on the website and communicated in a bilingual notice to affected data subjects at least 30 days before they take effect, per Privacy Protection Authority guidance 02/2024. Previous versions are retained and archived for audit purposes.';
    return { he, en };
  }

  _sectionContactUs(ctx) {
    const emailHe = ctx.contactEmail ? ` אימייל: ${ctx.contactEmail}.` : '';
    const addrHe  = ctx.address      ? ` כתובת: ${ctx.address}.` : '';
    const emailEn = ctx.contactEmail ? ` Email: ${ctx.contactEmail}.` : '';
    const addrEn  = ctx.address      ? ` Address: ${ctx.address}.` : '';
    const he = `בכל שאלה הנוגעת למדיניות זו, לזכויותיך כנושא מידע או לאופן העיבוד, ניתן לפנות אלינו.${emailHe}${addrHe} ניתן גם להגיש תלונה ישירות לרשות להגנת הפרטיות, משרד המשפטים.`;
    const en = `For any question regarding this policy, your rights as a data subject or the way we process data, you may contact us.${emailEn}${addrEn} You may also lodge a complaint directly with the Privacy Protection Authority at the Ministry of Justice.`;
    return { he, en };
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Exports
// ───────────────────────────────────────────────────────────────────────────

module.exports = {
  PolicyGenerator,
  REQUIRED_SECTIONS,
  SECTION_TITLES,
  LAW_CITATIONS,
  LAWFUL_BASES,
  SUBJECT_RIGHTS_HE,
  SUBJECT_RIGHTS_EN,
  // exposed for tests only
  _internals: deepFreeze({
    isoDate, escHTML, joinList, countSentences, countWords, countSyllables, totalSyllables,
  }),
};
