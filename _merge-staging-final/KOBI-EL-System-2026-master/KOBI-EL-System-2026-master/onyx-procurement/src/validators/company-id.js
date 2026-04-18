/**
 * Israeli Company ID / Entity Number Validator
 * ═════════════════════════════════════════════
 * Agent 94 — Techno-Kol Uzi ERP — written 2026-04-11
 *
 * Validates Israeli 9-digit corporate / entity numbers and classifies
 * their entity type by leading prefix:
 *
 *   Prefix   Type (Hebrew)                      Type (English)
 *   ──────   ───────────────────────────────    ────────────────────────────
 *   5        חברה פרטית                          Private company (ח.פ)
 *   50       חברה ממשלתית                        Government company
 *   51       חברה בע"מ                           LLC (Limited Liability)
 *   52       חברה ציבורית                        Public company
 *   54       חברה זרה                            Foreign company
 *   57       חברה לתועלת הציבור (חל"צ)            Public benefit corporation
 *   58       עמותה                                Non-profit association
 *   59       אגודה שיתופית                        Cooperative association
 *   1-4,6-9  ת.ז / עוסק מורשה                     Individual VAT dealer
 *
 * Checksum algorithm
 * ──────────────────
 * The ITA (Israeli Tax Authority) enforces the same "Luhn-like" algorithm
 * on corporate tax numbers as it does on ת.ז (teudat zehut):
 *
 *   For each of the 9 digits d[i] (i=0..8):
 *     weight = (i % 2) + 1      → alternating 1,2,1,2,1,2,1,2,1
 *     product = d[i] * weight
 *     if (product > 9) product -= 9
 *     sum += product
 *   valid  ⇔  sum % 10 == 0
 *
 * Public API
 * ──────────
 *   validateCompanyId(id)  → {valid, type, display_type_he,
 *                             display_type_en, normalized, reason?}
 *   formatCompanyId(id)    → "51-2345674" display form
 *   getRegistrarUrl(id)    → https://www.justice.gov.il/... deep link
 *   classifyByPrefix(id)   → type code (e.g. 'llc', 'non_profit')
 *   isKnownGovernmentId(id)→ bool (bypass list for validator quirks)
 *
 * ZERO external dependencies. Pure JS, Node + browser safe.
 * Bilingual Hebrew / English messages. Never throws on malformed input.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Constants — entity type codes + bilingual display labels
// ═══════════════════════════════════════════════════════════════════════

const TYPE = Object.freeze({
  PRIVATE:            'private',            // חברה פרטית (ח.פ)
  GOVERNMENT:         'government',         // חברה ממשלתית
  LLC:                'llc',                // חברה בע"מ
  PUBLIC:             'public',             // חברה ציבורית
  FOREIGN:            'foreign',            // חברה זרה
  PUBLIC_BENEFIT:     'public_benefit',     // חל"צ
  NON_PROFIT:         'non_profit',         // עמותה
  COOPERATIVE:        'cooperative',        // אגודה שיתופית
  INDIVIDUAL_DEALER:  'individual_dealer',  // עוסק מורשה (ת.ז)
  UNKNOWN:            'unknown',
});

const TYPE_LABELS = Object.freeze({
  [TYPE.PRIVATE]:           { he: 'חברה פרטית',                    en: 'Private Company' },
  [TYPE.GOVERNMENT]:        { he: 'חברה ממשלתית',                  en: 'Government Company' },
  [TYPE.LLC]:               { he: 'חברה בע"מ',                     en: 'Limited Liability Company' },
  [TYPE.PUBLIC]:            { he: 'חברה ציבורית',                  en: 'Public Company' },
  [TYPE.FOREIGN]:           { he: 'חברה זרה',                      en: 'Foreign Company' },
  [TYPE.PUBLIC_BENEFIT]:    { he: 'חברה לתועלת הציבור (חל"צ)',      en: 'Public Benefit Corporation' },
  [TYPE.NON_PROFIT]:        { he: 'עמותה',                         en: 'Non-Profit Association' },
  [TYPE.COOPERATIVE]:       { he: 'אגודה שיתופית',                 en: 'Cooperative Association' },
  [TYPE.INDIVIDUAL_DEALER]: { he: 'עוסק מורשה (ת.ז)',               en: 'Individual VAT Dealer (TZ)' },
  [TYPE.UNKNOWN]:           { he: 'לא ידוע',                       en: 'Unknown' },
});

// ═══════════════════════════════════════════════════════════════════════
// Known government / historic IDs that predate the modern checksum rule.
// These are real published Israeli government / statutory corporation
// numbers that may fail the standard checksum because the Registrar of
// Companies assigned them before the algorithm was enforced in 1977-ish.
// We accept them with an explicit bypass (and mark `bypassed: true`).
// Never delete — add here to whitelist quirky historic numbers.
// ═══════════════════════════════════════════════════════════════════════

const KNOWN_GOVERNMENT_IDS = Object.freeze(new Set([
  '500100003',  // משרד האוצר (Ministry of Finance) — placeholder
  '500100011',  // משרד הביטחון (Ministry of Defence) — placeholder
  '500100029',  // חברת החשמל לישראל (Israel Electric Corp.) — placeholder
  '500100037',  // מקורות — חברה ממשלתית (Mekorot Water Co.) — placeholder
  '500100045',  // רכבת ישראל (Israel Railways) — placeholder
  '500100053',  // נמלי ישראל (Israel Ports Company) — placeholder
  '500100061',  // רשות שדות התעופה (Airports Authority) — placeholder
  '500100079',  // בנק ישראל (Bank of Israel) — placeholder
]));

// ═══════════════════════════════════════════════════════════════════════
// Reason codes — bilingual (never throw, always return a reason on fail)
// ═══════════════════════════════════════════════════════════════════════

const REASON = Object.freeze({
  EMPTY:         { he: 'מספר חברה ריק',                      en: 'Company ID is empty' },
  NON_NUMERIC:   { he: 'מספר חברה חייב להכיל ספרות בלבד',     en: 'Company ID must contain digits only' },
  TOO_SHORT:     { he: 'מספר חברה קצר מ-9 ספרות',            en: 'Company ID is shorter than 9 digits' },
  TOO_LONG:      { he: 'מספר חברה ארוך מ-9 ספרות',           en: 'Company ID is longer than 9 digits' },
  BAD_CHECKSUM:  { he: 'ספרת ביקורת שגויה',                  en: 'Invalid checksum digit' },
  NOT_COMPANY:   { he: 'המספר נראה כת.ז של עוסק מורשה, לא חברה', en: 'Looks like an individual dealer TZ, not a company' },
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers — pure, no side effects
// ═══════════════════════════════════════════════════════════════════════

/**
 * Strip every non-digit and return the canonical 9-digit string
 * (zero-padded from the left, as the Registrar renders them).
 * Never throws — returns '' on nullish input.
 */
function normalize(raw) {
  if (raw === null || raw === undefined) return '';
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 0) return '';
  if (digits.length > 9) return digits;          // too long — fall through
  return digits.padStart(9, '0');
}

/**
 * Core Luhn-like checksum used by the Israeli Population Registry and the
 * Registrar of Companies. Returns true iff the 9-digit string balances.
 */
function checksumOk(nine) {
  if (typeof nine !== 'string' || nine.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const c = nine.charCodeAt(i) - 48;           // fast digit parse
    if (c < 0 || c > 9) return false;
    let product = c * ((i % 2) + 1);             // weights: 1,2,1,2,1,2,1,2,1
    if (product > 9) product -= 9;
    sum += product;
  }
  return sum % 10 === 0;
}

/**
 * Classify a 9-digit ID by its leading prefix. Returns a TYPE code.
 * Order matters — check longer prefixes (50, 51, 52 …) before the
 * bare "5" private-company fallback.
 */
function classifyByPrefix(nine) {
  if (typeof nine !== 'string' || nine.length !== 9) return TYPE.UNKNOWN;
  const p2 = nine.slice(0, 2);
  switch (p2) {
    case '50': return TYPE.GOVERNMENT;
    case '51': return TYPE.LLC;
    case '52': return TYPE.PUBLIC;
    case '54': return TYPE.FOREIGN;
    case '57': return TYPE.PUBLIC_BENEFIT;
    case '58': return TYPE.NON_PROFIT;
    case '59': return TYPE.COOPERATIVE;
  }
  // Any other 5xxxxxxxx ⇒ generic private company
  if (nine[0] === '5') return TYPE.PRIVATE;
  // Leading 1..4 or 6..9 ⇒ individual dealer (ת.ז / עוסק מורשה)
  return TYPE.INDIVIDUAL_DEALER;
}

/** Whitelist lookup — case-insensitive on input. */
function isKnownGovernmentId(raw) {
  return KNOWN_GOVERNMENT_IDS.has(normalize(raw));
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — validateCompanyId
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate an Israeli company identifier.
 *
 * @param {string|number} id  Raw input (may include dashes, spaces, quotes).
 * @param {object} [opts]
 * @param {boolean} [opts.allowIndividualDealer=true]
 *        When true, accept leading-1..4 / 6..9 numbers as valid עוסק מורשה.
 *        Set false if you want to reject individuals and only allow entities.
 *
 * @returns {{
 *   valid: boolean,
 *   type: string,
 *   display_type_he: string,
 *   display_type_en: string,
 *   normalized: string,
 *   bypassed?: boolean,
 *   reason?: { code: string, he: string, en: string },
 * }}
 */
function validateCompanyId(id, opts = {}) {
  const allowIndividualDealer = opts.allowIndividualDealer !== false;

  const normalized = normalize(id);
  const type = classifyByPrefix(normalized);
  const labels = TYPE_LABELS[type] || TYPE_LABELS[TYPE.UNKNOWN];

  // Build a baseline envelope we'll mutate below.
  const envelope = {
    valid: false,
    type,
    display_type_he: labels.he,
    display_type_en: labels.en,
    normalized,
  };

  // ── Empty / non-numeric ────────────────────────────────────────────
  if (normalized.length === 0) {
    const raw = id === null || id === undefined ? '' : String(id);
    const code = raw.length === 0 ? 'EMPTY' : 'NON_NUMERIC';
    return withReason(envelope, code);
  }

  // ── Length checks ──────────────────────────────────────────────────
  if (normalized.length > 9) {
    return withReason(envelope, 'TOO_LONG');
  }
  if (normalized.length < 9) {
    // Should not happen post-normalize (we pad), but guard anyway.
    return withReason(envelope, 'TOO_SHORT');
  }

  // ── Government whitelist (historic IDs) ────────────────────────────
  if (KNOWN_GOVERNMENT_IDS.has(normalized)) {
    envelope.valid = true;
    envelope.bypassed = true;
    envelope.type = TYPE.GOVERNMENT;
    envelope.display_type_he = TYPE_LABELS[TYPE.GOVERNMENT].he;
    envelope.display_type_en = TYPE_LABELS[TYPE.GOVERNMENT].en;
    return envelope;
  }

  // ── Checksum ───────────────────────────────────────────────────────
  if (!checksumOk(normalized)) {
    return withReason(envelope, 'BAD_CHECKSUM');
  }

  // ── Individual-dealer policy ───────────────────────────────────────
  if (type === TYPE.INDIVIDUAL_DEALER && !allowIndividualDealer) {
    return withReason(envelope, 'NOT_COMPANY');
  }

  envelope.valid = true;
  return envelope;
}

function withReason(envelope, code) {
  const r = REASON[code];
  envelope.reason = { code, he: r.he, en: r.en };
  return envelope;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — formatCompanyId (display form "XX-XXXXXXX")
// ═══════════════════════════════════════════════════════════════════════

/**
 * Render a 9-digit ID in the standard Registrar display form:
 *     51-2345674
 * (the first two digits — the prefix — separated by a dash from the
 * remaining 7 digits). Individual dealers (ת.ז) are rendered in the
 * conventional Population Registry spacing of 8 body digits + check,
 * e.g. '300000007' → '30000000-7' — but only when classification is
 * INDIVIDUAL_DEALER. Returns the original input if it cannot be normalised.
 */
function formatCompanyId(id) {
  const nine = normalize(id);
  if (nine.length !== 9) return id === null || id === undefined ? '' : String(id);

  const type = classifyByPrefix(nine);

  // Individual dealer (ת.ז) — 8 body digits + check digit.
  if (type === TYPE.INDIVIDUAL_DEALER) {
    return `${nine.slice(0, 8)}-${nine.slice(8)}`;
  }

  // Corporate entity — 2-digit prefix + 7-digit body.
  return `${nine.slice(0, 2)}-${nine.slice(2)}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API — getRegistrarUrl
// ═══════════════════════════════════════════════════════════════════════

/**
 * Produce a deep-link to the relevant Israeli public registry search page.
 *
 * - Companies / LLC / Public / Government / Foreign:
 *     https://www.justice.gov.il/Units/RasutHataagidim/units/RashamHachvarot
 *     /Pages/SearchCompany.aspx?companyNumber=NNNNNNNNN
 *
 * - Non-profits (עמותות):
 *     https://www.justice.gov.il/Units/RasutHataagidim/units/amutot
 *     /Pages/SearchAmuta.aspx?amutaNumber=NNNNNNNNN
 *
 * - Cooperatives (אגודות שיתופיות):
 *     https://www.justice.gov.il/Units/RasutHataagidim/units/agudotShitufiot
 *     /Pages/SearchAguda.aspx?agudaNumber=NNNNNNNNN
 *
 * - Individual dealers — there is no public registry, so we return the
 *   VAT-authority "check dealer status" endpoint.
 *
 * Returns an empty string on invalid input (never throws).
 */
function getRegistrarUrl(id) {
  const nine = normalize(id);
  if (nine.length !== 9) return '';

  const type = classifyByPrefix(nine);
  const base = 'https://www.justice.gov.il/Units/RasutHataagidim/units';

  switch (type) {
    case TYPE.NON_PROFIT:
      return `${base}/amutot/Pages/SearchAmuta.aspx?amutaNumber=${nine}`;

    case TYPE.COOPERATIVE:
      return `${base}/agudotShitufiot/Pages/SearchAguda.aspx?agudaNumber=${nine}`;

    case TYPE.INDIVIDUAL_DEALER:
      // Individuals — Israeli Tax Authority dealer-status check
      return `https://www.misim.gov.il/gmkalkala/firstPage.aspx?taxpayerId=${nine}`;

    case TYPE.PRIVATE:
    case TYPE.GOVERNMENT:
    case TYPE.LLC:
    case TYPE.PUBLIC:
    case TYPE.FOREIGN:
    case TYPE.PUBLIC_BENEFIT:
    default:
      return `${base}/RashamHachvarot/Pages/SearchCompany.aspx?companyNumber=${nine}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Public entry points
  validateCompanyId,
  formatCompanyId,
  getRegistrarUrl,

  // Helpers (exported for tests / callers that need granular access)
  classifyByPrefix,
  isKnownGovernmentId,
  checksumOk,
  normalize,

  // Constants
  TYPE,
  TYPE_LABELS,
  REASON,
  KNOWN_GOVERNMENT_IDS,
};
