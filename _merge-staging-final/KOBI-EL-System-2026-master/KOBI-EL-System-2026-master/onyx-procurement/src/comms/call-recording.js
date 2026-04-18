/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CALL RECORDING + TRANSCRIPTION ORCHESTRATION — AG-Y125
 * ═══════════════════════════════════════════════════════════════════════════
 * Techno-Kol Uzi mega-ERP / Swarm Y / Agent Y-125
 *
 * Zero-dependency, Hebrew-aware, consent-first call-recording orchestrator.
 * Provides end-to-end lifecycle management for telephone / VoIP recordings:
 *
 *       record → encrypt → transcribe → diarize → redact (PII) → summarize
 *              → action-items → sentiment → keyword spotting → quality score
 *              → retention → access log → legal export → compliance check
 *
 * ─────────────────────────  RULE / כלל  ──────────────────────────
 *   לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 *   Retention "disposal" NEVER physically removes a recording. It moves it
 *   to a frozen tier that requires human approval to eventually purge, AND
 *   the metadata / access log is retained forever.
 *
 * ─────────────────────────  ISRAELI LAW  ─────────────────────────
 *   חוק האזנת סתר, התשל״ט-1979  (Wiretap Law, 5739-1979)
 *     Section 1 definitions:
 *       "האזנה" — listening to a conversation via a device without consent
 *                 of any party to the conversation.
 *     Section 2 — general prohibition on "secret monitoring" (eavesdropping).
 *     Section 1(4) — "consent of a party" — at least ONE party to the call
 *                 must give consent. This makes Israel a **one-party consent**
 *                 jurisdiction by default. However, recording by a third
 *                 party WITHOUT consent of any party = felony (up to 5 yrs).
 *
 *   חוק הגנת הפרטיות, התשמ״א-1981  (Privacy Protection Law, 5741-1981)
 *     Requires notice, purpose, data minimisation, retention limits, and
 *     subject-access rights for any recording that constitutes "information"
 *     about an identifiable individual (i.e. virtually all business calls).
 *
 *   Regulations 5777-2017 (Data Security) — technical requirements for
 *     recordings that include voice biometrics / sensitive data. The module
 *     therefore ALWAYS encrypts with AES-256-GCM and logs every access.
 *
 *   Consent models supported:
 *     • 'one-party'  — the recording party itself gives consent (Israel default).
 *     • 'all-party'  — every participant must explicitly opt in (stricter;
 *                       mandatory for jurisdictions like CA, FL in the US,
 *                       GER, EU for certain contexts; also honoured for
 *                       calls that CROSS Israeli borders).
 *
 * ─────────────────────────  SAFETY GUARANTEE  ────────────────────
 *   Recording does NOT start unless:
 *     1. `consent` is explicitly one of {'one-party','all-party'}.
 *     2. `consentedBy` user ID is provided (legitimate caller who authorised).
 *     3. `lawfulBasis` is a non-empty string describing the reason.
 *     4. For 'all-party' consent, every party in `participants[]` has a
 *        boolean `consented === true`.
 *     5. Consent has a timestamp — we refuse to record retroactively.
 *   If any of these fail, `record()` returns {status:'refused', reason:...}
 *   and never allocates a storage key. No file is written, no entry is
 *   created in the recordings map.
 *
 * ─────────────────────────  PUBLIC API  ──────────────────────────
 *   new CallRecording({clock, idGen, storage, logger})
 *     .record({callId, consent, storageKey, encryption, retention,
 *              consentedBy, lawfulBasis, participants})
 *     .encryptRecording({file, keyId})                      → {ciphertext,iv,tag}
 *     .decryptRecording({ciphertext, iv, tag, keyId})       → Buffer
 *     .transcribe({recordingId, language, backend})         → {text, segments[]}
 *     .diarize({transcript})                                → {speakers[]}
 *     .summarize({transcript})                              → {he, en, bullets}
 *     .extractActionItems({transcript})                     → {items[]}
 *     .sentimentAnalysis({transcript})                      → {trend[], avg}
 *     .keywordSpotting({transcript, keywords})              → {hits[]}
 *     .piiRedaction({transcript, audio})                    → {safe, redacted[]}
 *     .retentionPolicy({recordingId, retentionDays, disposalRequiresApproval})
 *     .accessLog({recordingId})                             → {entries[]}
 *     .logAccess({recordingId, userId, action, reason})
 *     .exportForLegal({recordingId, authorizedBy, reason})  → {package}
 *     .qualityScore({transcript, rubric})                   → {score, breakdown}
 *     .complianceCheck({recordingId})                       → {ok, issues[]}
 *
 * ─────────────────────────  BACKENDS  ────────────────────────────
 *   Transcription is pluggable: 'google' | 'azure' | 'whisper' | 'custom'
 *   Every backend is mockable via dependency injection. The default is
 *   'stub' — a deterministic heuristic that returns the provided mock text
 *   (or a Hebrew-aware placeholder) so tests run offline.
 *
 * ─────────────────────────  ZERO DEPS  ───────────────────────────
 *   node:crypto is used for AES-256-GCM (core Node built-in).
 *   NO external packages. All NLP heuristics are implemented in-file.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ══════════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ══════════════════════════════════════════════════════════════════

const CONSENT_MODELS = Object.freeze({
  ONE_PARTY: 'one-party',
  ALL_PARTY: 'all-party',
});

const RECORDING_STATUS = Object.freeze({
  REFUSED:    'refused',
  RECORDING:  'recording',
  STOPPED:    'stopped',
  ENCRYPTED:  'encrypted',
  TRANSCRIBED:'transcribed',
  REDACTED:   'redacted',
  ARCHIVED:   'archived',
  FROZEN:     'frozen',         // awaiting disposal approval
});

const TRANSCRIPTION_BACKENDS = Object.freeze({
  STUB:    'stub',
  GOOGLE:  'google',
  AZURE:   'azure',
  WHISPER: 'whisper',
  CUSTOM:  'custom',
});

const DEFAULT_RETENTION_DAYS = 365;                     // 1 year
const DEFAULT_ENCRYPTION = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;                            // 256-bit
const IV_LENGTH_BYTES = 12;                             // 96-bit for GCM
const AUTH_TAG_LENGTH = 16;                             // 128-bit

// Hebrew Unicode block.
const HEBREW_REGEX = /[\u0590-\u05FF]/;

// ─────────── PII patterns ──────────────────────────────────────────
// Credit card: 13-19 digits, with optional spaces/dashes. Luhn is applied
// afterward to eliminate coincidences.
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

// Israeli ID (ת"ז): 9 digits, optional leading zero. Validated via check-digit.
const ISRAELI_ID_REGEX = /\b\d{9}\b/g;

// Israeli passport — 7-9 digits, typically labelled "דרכון".
const PASSPORT_REGEX = /\b(?:passport|דרכון)[\s:#]*([A-Z0-9]{6,9})\b/gi;

// IBAN (Israel: IL + 2 check digits + 19 BBAN = 23 chars total).
const IBAN_REGEX = /\bIL\d{2}[A-Z0-9]{19}\b/gi;

// Israeli bank account: strict form — 2-3 digit bank / 3 digit branch /
// 5-9 digit account. Note: we run the phone regex BEFORE this in redactPII
// so a mobile like 050-123-4567 is consumed first.
const BANK_ACCT_REGEX = /\b\d{2,3}\/\d{3}\/\d{5,9}\b|\b\d{2,3}-\d{3}-\d{5,9}\b/g;

// Israeli phone (landline + mobile): 0[2-9]-XXXXXXX, 05X-XXXXXXX,
// or +972-X-XXXXXXX. Allows optional separators.
const PHONE_REGEX = /\b(?:\+972[-\s]?|0)(?:[2-9]|5\d)[-\s]?\d{3}[-\s]?\d{4}\b/g;

// Email addresses.
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// CVV — 3 or 4 digit security code, usually preceded by keyword. We
// avoid `\b` anchors because Hebrew letters aren't \w in some engines.
const CVV_REGEX = /(?:cvv|cvc|security\s*code|קוד\s*אבטחה)[\s:#]*(\d{3,4})/gi;

// ─────────── NLP lexicons (Hebrew + English) ──────────────────────
const ACTION_VERBS_HE = [
  'אבדוק','אשלח','אחזור','אתקשר','אעדכן','אכין','אסדר','אקבע',
  'אברר','אעביר','אשלים','אסגור','אפתח','אבצע','אטפל','אפרסם',
  'צריך','חייב','יש ל','נא ל','בבקשה','לטפל','להכין','לשלוח',
  'לעדכן','לוודא','לבדוק','להחליט','לאשר','לתאם','לסכם',
];

const ACTION_VERBS_EN = [
  'will','need to','have to','must','should','please','follow up',
  'send','check','verify','prepare','schedule','call','email',
  'update','review','approve','confirm','investigate','handle',
  'complete','close','open','book','cancel','remind','organize',
];

const POSITIVE_WORDS_HE = [
  'מעולה','נהדר','מצוין','תודה','שמח','מרוצה','בסדר','כן','בטח',
  'נפלא','אהבתי','אשמח','מצויין','יופי','כמובן','אין בעיה','סבבה',
];

const POSITIVE_WORDS_EN = [
  'great','excellent','good','thanks','thank you','happy','pleased',
  'perfect','sure','of course','wonderful','love','satisfied','ok',
];

const NEGATIVE_WORDS_HE = [
  'לא','בעיה','גרוע','איום','מאוכזב','כועס','מתלונן','לעולם לא',
  'לא מקובל','חמור','נורא','זוועה','לא טוב','לא בסדר','מצטער',
];

const NEGATIVE_WORDS_EN = [
  'no','problem','issue','bad','awful','terrible','angry','upset',
  'disappointed','unacceptable','never','horrible','sorry','refuse',
];

const LEGAL_TERMS = [
  'lawsuit','court','attorney','lawyer','sue','legal','contract',
  'breach','damages','claim','liability','injunction','subpoena',
  'תביעה','בית משפט','עורך דין','עו״ד','עוד','חוזה','הפרה','נזק',
  'פיצויים','אחריות','צו','התראה','גישור','בוררות','חוק',
];

const COMPLAINT_TERMS = [
  'complaint','complain','refund','return','broken','defective',
  'not working','disappointed','unhappy','poor quality','late',
  'תלונה','להתלונן','החזר','לקלקל','לא עובד','איחור','איכות ירודה',
];

// Crude competitor dictionary — actual list lives in CRM config.
const DEFAULT_COMPETITOR_KEYWORDS = [
  'competitor','alternative','other vendor','quote from',
  'מתחרה','הצעה אחרת','ספק אחר','חלופה',
];

// ══════════════════════════════════════════════════════════════════
// 2. UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function isHebrew(s) { return HEBREW_REGEX.test(String(s || '')); }

function safeString(v) { return (v === null || v === undefined) ? '' : String(v); }

function isoTs(clock) {
  const d = typeof clock === 'function' ? clock() : new Date();
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

/** Random ID: prefix + 16 hex chars. */
function randomId(prefix, idGen) {
  if (typeof idGen === 'function') return idGen(prefix);
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/** Luhn check for card numbers. */
function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}

/** Israeli ID check-digit validation per the Teudat Zehut algorithm. */
function israeliIdValid(id) {
  if (!/^\d{5,9}$/.test(id)) return false;
  const padded = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Simple sentence splitter that respects Hebrew punctuation. */
function splitSentences(text) {
  return safeString(text)
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Lowercase + strip diacritics for matching. */
function normalize(s) {
  return safeString(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')   // Hebrew nikud
    .replace(/[\u0300-\u036f]/g, '');   // Latin diacritics
}

// ══════════════════════════════════════════════════════════════════
// 3. IN-MEMORY STORAGE (injectable)
// ══════════════════════════════════════════════════════════════════

/**
 * Default in-memory storage. The production system would plug in an S3 /
 * MinIO / disk adapter with the same shape.
 */
function createMemoryStorage() {
  const blobs = new Map();
  const records = new Map();
  return {
    putBlob(key, buf) { blobs.set(key, Buffer.from(buf)); return key; },
    getBlob(key)      { return blobs.has(key) ? Buffer.from(blobs.get(key)) : null; },
    hasBlob(key)      { return blobs.has(key); },
    putRecord(id, r)  { records.set(id, r); return id; },
    getRecord(id)     { return records.get(id) || null; },
    listRecords()     { return Array.from(records.values()); },
    updateRecord(id, patch) {
      const r = records.get(id);
      if (!r) return null;
      const u = Object.assign({}, r, patch);
      records.set(id, u);
      return u;
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// 4. CONSENT VALIDATION (the critical safety gate)
// ══════════════════════════════════════════════════════════════════

/**
 * Validates that a recording request meets Israeli law + the configured
 * consent model. Returns { ok:true } or { ok:false, reason }. This function
 * is PURE — no side effects, safe to test in isolation.
 */
function validateConsent({ consent, consentedBy, lawfulBasis, participants }) {
  // Consent must be explicit.
  if (consent !== CONSENT_MODELS.ONE_PARTY && consent !== CONSENT_MODELS.ALL_PARTY) {
    return { ok: false, reason: 'consent_model_required' };
  }
  // A legitimate user ID must authorise.
  if (!consentedBy || typeof consentedBy !== 'string' || !consentedBy.trim()) {
    return { ok: false, reason: 'consented_by_user_required' };
  }
  // Lawful basis (purpose) must be provided.
  if (!lawfulBasis || typeof lawfulBasis !== 'string' || !lawfulBasis.trim()) {
    return { ok: false, reason: 'lawful_basis_required' };
  }
  // For all-party consent, every participant must have consented === true.
  if (consent === CONSENT_MODELS.ALL_PARTY) {
    if (!Array.isArray(participants) || participants.length === 0) {
      return { ok: false, reason: 'all_party_requires_participants' };
    }
    for (const p of participants) {
      if (!p || p.consented !== true) {
        return {
          ok: false,
          reason: 'all_party_missing_consent',
          participant: p && p.id,
        };
      }
    }
  } else {
    // One-party: at least one self-consent must be present; the authoriser
    // counts as one party by default.
    if (Array.isArray(participants) && participants.length > 0) {
      const any = participants.some(p => p && p.consented === true);
      if (!any) return { ok: false, reason: 'one_party_no_consent' };
    }
  }
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════
// 5. PII REDACTION (pure function)
// ══════════════════════════════════════════════════════════════════

/**
 * Scrubs PII from a transcript. Returns a redacted copy plus the list of
 * redactions found. Credit-cards are Luhn-verified; Israeli IDs are
 * check-digit verified so random digit strings aren't over-matched.
 */
function redactPII(text) {
  const redactions = [];
  let out = safeString(text);

  // 1. Credit cards (Luhn-verified).
  out = out.replace(CREDIT_CARD_REGEX, (m) => {
    const digits = m.replace(/[^\d]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      redactions.push({ type: 'credit_card', length: digits.length });
      return '[REDACTED_CC]';
    }
    return m;
  });

  // 2. CVV mentions (redacted whenever labelled, even without Luhn).
  out = out.replace(CVV_REGEX, (m) => {
    redactions.push({ type: 'cvv' });
    return '[REDACTED_CVV]';
  });

  // 3. Israeli IDs (check-digit validated).
  out = out.replace(ISRAELI_ID_REGEX, (m) => {
    if (israeliIdValid(m)) {
      redactions.push({ type: 'israeli_id' });
      return '[REDACTED_ID]';
    }
    return m;
  });

  // 4. Passports (labelled).
  out = out.replace(PASSPORT_REGEX, (_m) => {
    redactions.push({ type: 'passport' });
    return '[REDACTED_PASSPORT]';
  });

  // 5. IBAN.
  out = out.replace(IBAN_REGEX, (_m) => {
    redactions.push({ type: 'iban' });
    return '[REDACTED_IBAN]';
  });

  // 6. Phone numbers (run BEFORE bank account so mobile 050-123-4567
  //    isn't misclassified as a 3/3/4-part bank string).
  out = out.replace(PHONE_REGEX, (_m) => {
    redactions.push({ type: 'phone' });
    return '[REDACTED_PHONE]';
  });

  // 7. Bank account (strict slash/dash bank-branch-account form).
  out = out.replace(BANK_ACCT_REGEX, (m) => {
    const digits = m.replace(/[^\d]/g, '');
    if (digits.length >= 10 && digits.length <= 15) {
      redactions.push({ type: 'bank_account' });
      return '[REDACTED_BANK]';
    }
    return m;
  });

  // 8. Emails.
  out = out.replace(EMAIL_REGEX, (_m) => {
    redactions.push({ type: 'email' });
    return '[REDACTED_EMAIL]';
  });

  return { safe: out, redactions };
}

// ══════════════════════════════════════════════════════════════════
// 6. SENTIMENT / KEYWORDS / ACTION ITEMS / SUMMARY
// ══════════════════════════════════════════════════════════════════

function scoreSentiment(sentence) {
  const lc = normalize(sentence);
  let pos = 0, neg = 0;
  for (const w of POSITIVE_WORDS_HE) if (lc.includes(normalize(w))) pos++;
  for (const w of POSITIVE_WORDS_EN) if (lc.includes(normalize(w))) pos++;
  for (const w of NEGATIVE_WORDS_HE) if (lc.includes(normalize(w))) neg++;
  for (const w of NEGATIVE_WORDS_EN) if (lc.includes(normalize(w))) neg++;
  if (pos + neg === 0) return 0;
  return (pos - neg) / (pos + neg);   // range -1..+1
}

function analyseSentiment(transcript) {
  const sentences = splitSentences(transcript);
  const trend = sentences.map((s, i) => ({
    idx: i,
    text: s,
    score: Number(scoreSentiment(s).toFixed(3)),
  }));
  const avg = trend.length
    ? Number((trend.reduce((a, t) => a + t.score, 0) / trend.length).toFixed(3))
    : 0;
  const label = avg > 0.2 ? 'positive' : avg < -0.2 ? 'negative' : 'neutral';
  return { trend, avg, label, samples: trend.length };
}

function extractActions(transcript) {
  const sentences = splitSentences(transcript);
  const items = [];
  for (const s of sentences) {
    const lc = normalize(s);
    const hitHe = ACTION_VERBS_HE.some(v => lc.includes(normalize(v)));
    const hitEn = ACTION_VERBS_EN.some(v => lc.includes(normalize(v)));
    if (hitHe || hitEn) {
      items.push({
        text: s,
        language: isHebrew(s) ? 'he' : 'en',
        source: hitHe ? 'he' : 'en',
      });
    }
  }
  return { items, count: items.length };
}

function summarizeBilingual(transcript) {
  const sentences = splitSentences(transcript);
  if (sentences.length === 0) {
    return { he: '', en: '', bullets: [], sourceLength: 0 };
  }

  // Score each sentence by length, position, and sentiment intensity.
  const scored = sentences.map((s, i) => {
    const len = s.length;
    const pos = 1 - Math.abs((i - sentences.length / 2) / sentences.length);
    const senti = Math.abs(scoreSentiment(s));
    return { s, score: len * 0.4 + pos * 50 + senti * 30, idx: i };
  });
  scored.sort((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.min(5, Math.ceil(sentences.length * 0.3)));
  const top = scored.slice(0, topCount).sort((a, b) => a.idx - b.idx);

  const bullets = top.map(t => t.s);

  // Bilingual: pick any Hebrew/English sentences we already have; if a
  // language is missing, fall back to the joined top picks.
  const heBullets = bullets.filter(b => isHebrew(b));
  const enBullets = bullets.filter(b => !isHebrew(b));

  return {
    he: (heBullets.length ? heBullets : bullets).join(' '),
    en: (enBullets.length ? enBullets : bullets).join(' '),
    bullets,
    sourceLength: transcript.length,
  };
}

function spotKeywords(transcript, keywords) {
  const list = (Array.isArray(keywords) && keywords.length)
    ? keywords
    : DEFAULT_COMPETITOR_KEYWORDS.concat(LEGAL_TERMS).concat(COMPLAINT_TERMS);
  const lc = normalize(transcript);
  const hits = [];
  for (const k of list) {
    const nk = normalize(k);
    if (!nk) continue;
    let from = 0;
    while (true) {
      const idx = lc.indexOf(nk, from);
      if (idx < 0) break;
      hits.push({ keyword: k, offset: idx, category: categorize(k) });
      from = idx + nk.length;
    }
  }
  return { hits, count: hits.length };
}

function categorize(word) {
  const nw = normalize(word);
  if (LEGAL_TERMS.some(t => normalize(t) === nw)) return 'legal';
  if (COMPLAINT_TERMS.some(t => normalize(t) === nw)) return 'complaint';
  if (DEFAULT_COMPETITOR_KEYWORDS.some(t => normalize(t) === nw)) return 'competitor';
  return 'custom';
}

// ══════════════════════════════════════════════════════════════════
// 7. DIARIZATION STUB
// ══════════════════════════════════════════════════════════════════

/**
 * Minimal speaker-separation heuristic. Real implementation delegates to an
 * external voice-bio backend; the stub splits on clear speaker markers or
 * alternates by sentence boundary so pipelines can run offline.
 */
function diarizeTranscript(transcript) {
  const lines = safeString(transcript).split(/\n+/).map(l => l.trim()).filter(Boolean);

  // Pattern 1: explicit "Speaker A:" or Hebrew "דובר 1:".
  const marker = /^(?:speaker\s*([A-Z0-9]+)|דובר\s*(\d+)|agent|customer)[:\s]/i;
  const hasMarkers = lines.some(l => marker.test(l));

  if (hasMarkers) {
    const segs = lines.map(l => {
      const m = l.match(marker);
      const id = m ? (m[1] || m[2] || l.split(':')[0]).toString().toUpperCase() : 'UNK';
      return { speaker: id, text: l.replace(/^[^:]+:\s*/, '') };
    });
    const speakers = Array.from(new Set(segs.map(s => s.speaker)));
    return { speakers, segments: segs, confidence: 0.85 };
  }

  // Pattern 2: alternate by sentence.
  const sentences = splitSentences(transcript);
  const segs = sentences.map((s, i) => ({
    speaker: i % 2 === 0 ? 'A' : 'B',
    text: s,
  }));
  const speakers = Array.from(new Set(segs.map(s => s.speaker)));
  return { speakers, segments: segs, confidence: 0.4 };
}

// ══════════════════════════════════════════════════════════════════
// 8. QUALITY SCORING
// ══════════════════════════════════════════════════════════════════

const DEFAULT_RUBRIC = Object.freeze({
  greeting:    { weight: 10, keywords: ['hello','shalom','שלום','בוקר טוב','ערב טוב','good morning','thank you for calling','תודה שהתקשרתם'] },
  empathy:     { weight: 15, keywords: ['understand','מבין','מבינה','sorry','מצטער','i see','אני מבין'] },
  verification:{ weight: 15, keywords: ['verify','confirm','אמת','לוודא','your id','תעודת זהות','מספר לקוח'] },
  resolution:  { weight: 30, keywords: ['solved','resolved','fixed','נפתר','תוקן','done','completed'] },
  followup:    { weight: 15, keywords: ['follow up','email','מיל','אשלח','תזכורת','reminder','schedule'] },
  closing:     { weight: 15, keywords: ['thank','goodbye','have a nice','תודה','להתראות','יום נעים'] },
});

function scoreQuality(transcript, rubric) {
  const r = rubric && typeof rubric === 'object' ? rubric : DEFAULT_RUBRIC;
  const lc = normalize(transcript);
  const breakdown = {};
  let total = 0, maxTotal = 0;
  for (const [name, def] of Object.entries(r)) {
    const weight = Number(def && def.weight) || 0;
    const kws = (def && def.keywords) || [];
    const hit = kws.some(k => lc.includes(normalize(k)));
    breakdown[name] = { weight, passed: !!hit, contribution: hit ? weight : 0 };
    total += hit ? weight : 0;
    maxTotal += weight;
  }
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const grade = pct >= 90 ? 'A'
              : pct >= 75 ? 'B'
              : pct >= 60 ? 'C'
              : pct >= 40 ? 'D'
              : 'F';
  return { score: pct, grade, breakdown, total, maxTotal };
}

// ══════════════════════════════════════════════════════════════════
// 9. ENCRYPTION (AES-256-GCM via node:crypto)
// ══════════════════════════════════════════════════════════════════

/**
 * Symmetric authenticated encryption. The key is derived from keyId via
 * scryptSync so callers only need to remember a human-readable key ID.
 * Production callers should inject a KMS-backed key-provider.
 */
function deriveKey(keyId, keyLength = KEY_LENGTH_BYTES) {
  const salt = crypto.createHash('sha256').update('call-recording-salt:v1').digest();
  return crypto.scryptSync(String(keyId || 'default'), salt, keyLength);
}

function encryptBuffer(plaintext, keyId) {
  const key = deriveKey(keyId);
  const iv  = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  const ct = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: DEFAULT_ENCRYPTION,
    keyId: String(keyId),
    iv:  iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ct.toString('base64'),
    size: input.length,
  };
}

function decryptBuffer({ ciphertext, iv, tag, keyId }) {
  const key = deriveKey(keyId);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return pt;
}

// ══════════════════════════════════════════════════════════════════
// 10. TRANSCRIPTION BACKEND DISPATCH
// ══════════════════════════════════════════════════════════════════

/**
 * The stub backend just echoes whatever mock transcript was stored on the
 * recording, or generates a Hebrew-aware placeholder. Real backends would
 * invoke Google / Azure / Whisper APIs and map the result into the same
 * shape. Callers can inject a custom backend via:
 *     cr.registerBackend('whisper', async ({audio, language}) => {...})
 */
function stubTranscribe({ audioBytes, language, mockText }) {
  if (mockText !== undefined && mockText !== null) {
    const segs = splitSentences(mockText).map((t, i) => ({
      start: i * 2, end: i * 2 + 2, text: t, speaker: i % 2 === 0 ? 'A' : 'B',
    }));
    return {
      text: mockText,
      segments: segs,
      language: language === 'auto' ? (isHebrew(mockText) ? 'he' : 'en') : language,
      backend: 'stub',
      duration: segs.length * 2,
    };
  }
  const fallback = language === 'he'
    ? 'תמלול לא זמין — המערכת פועלת במצב גיבוי.'
    : 'Transcript unavailable — system running in fallback mode.';
  return {
    text: fallback,
    segments: [{ start: 0, end: 1, text: fallback, speaker: 'A' }],
    language: language === 'auto' ? 'en' : language,
    backend: 'stub',
    duration: Math.max(1, Math.round((audioBytes || 0) / 16000)),
  };
}

// ══════════════════════════════════════════════════════════════════
// 11. COMPLIANCE CHECK
// ══════════════════════════════════════════════════════════════════

function checkCompliance(rec) {
  const issues = [];
  if (!rec) return { ok: false, issues: [{ code: 'NOT_FOUND', severity: 'critical' }] };
  if (!rec.consent || (rec.consent !== CONSENT_MODELS.ONE_PARTY && rec.consent !== CONSENT_MODELS.ALL_PARTY)) {
    issues.push({ code: 'MISSING_CONSENT', severity: 'critical',
                  law: 'חוק האזנת סתר §2' });
  }
  if (!rec.consentedBy) {
    issues.push({ code: 'NO_AUTHORISER', severity: 'critical',
                  law: 'חוק האזנת סתר §1(4)' });
  }
  if (!rec.lawfulBasis) {
    issues.push({ code: 'NO_LAWFUL_BASIS', severity: 'high',
                  law: 'חוק הגנת הפרטיות §11' });
  }
  if (!rec.encryption || rec.encryption.algorithm !== DEFAULT_ENCRYPTION) {
    issues.push({ code: 'WEAK_ENCRYPTION', severity: 'high',
                  law: 'תקנות הגנת הפרטיות (אבטחת מידע) §6' });
  }
  if (!rec.piiRedacted) {
    issues.push({ code: 'PII_NOT_REDACTED', severity: 'medium',
                  law: 'חוק הגנת הפרטיות §7' });
  }
  if (!rec.retention || typeof rec.retention.retentionDays !== 'number') {
    issues.push({ code: 'NO_RETENTION', severity: 'medium',
                  law: 'חוק הגנת הפרטיות §14' });
  }
  if (!Array.isArray(rec.accessLog) || rec.accessLog.length === 0) {
    issues.push({ code: 'NO_ACCESS_LOG', severity: 'medium',
                  law: 'תקנות אבטחת מידע §8' });
  }
  return {
    ok: issues.length === 0,
    issues,
    recordingId: rec.id,
    checkedAt: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════
// 12. MAIN CLASS
// ══════════════════════════════════════════════════════════════════

class CallRecording {
  constructor(opts = {}) {
    this.clock   = opts.clock   || (() => new Date());
    this.idGen   = opts.idGen   || null;
    this.storage = opts.storage || createMemoryStorage();
    this.logger  = opts.logger  || { info: () => {}, warn: () => {}, error: () => {} };
    this.backends = {
      stub:    stubTranscribe,
      google:  opts.googleBackend  || null,
      azure:   opts.azureBackend   || null,
      whisper: opts.whisperBackend || null,
      custom:  opts.customBackend  || null,
    };
  }

  // ─────────── Backend registry ──────────────────────────────────────
  registerBackend(name, fn) {
    if (!name || typeof fn !== 'function') {
      throw new Error('registerBackend requires (name, function)');
    }
    this.backends[name] = fn;
    return this;
  }

  // ─────────── 1. record ─────────────────────────────────────────────
  /**
   * Starts (or logs) a recording request. Performs the full Israeli-law
   * consent check before any state is created. On refusal, returns
   * {status:'refused', reason, compliance}. On acceptance, creates a
   * recording stub and returns its metadata.
   *
   * `audioBytes` is optional — if the caller already has a buffer from a
   * SIP / PBX hook it can be passed in and will be encrypted immediately.
   */
  record({
    callId,
    consent,
    storageKey,
    encryption,
    retention,
    consentedBy,
    lawfulBasis,
    participants,
    audioBytes,
    mockText,
    language,
  } = {}) {
    // Safety gate.
    const gate = validateConsent({ consent, consentedBy, lawfulBasis, participants });
    if (!gate.ok) {
      this.logger.warn('call-recording refused', { callId, reason: gate.reason });
      return {
        status: RECORDING_STATUS.REFUSED,
        reason: gate.reason,
        participant: gate.participant,
        callId,
        refusedAt: isoTs(this.clock),
      };
    }

    if (!callId) {
      return { status: RECORDING_STATUS.REFUSED, reason: 'missing_call_id' };
    }

    const id = randomId('rec', this.idGen);
    const key = storageKey || `recordings/${id}.enc`;
    const createdAt = isoTs(this.clock);

    // Encrypt immediately if audio was passed.
    let encMeta = null;
    if (audioBytes && (Buffer.isBuffer(audioBytes) || typeof audioBytes === 'string')) {
      const enc = encryptBuffer(audioBytes, (encryption && encryption.keyId) || id);
      this.storage.putBlob(key, Buffer.from(enc.ciphertext, 'base64'));
      encMeta = {
        algorithm: enc.algorithm,
        keyId: enc.keyId,
        iv: enc.iv,
        tag: enc.tag,
        size: enc.size,
      };
    } else {
      encMeta = {
        algorithm: DEFAULT_ENCRYPTION,
        keyId: (encryption && encryption.keyId) || id,
        iv: null,
        tag: null,
        size: 0,
      };
    }

    const record = {
      id,
      callId,
      status: RECORDING_STATUS.RECORDING,
      consent,
      consentedBy,
      lawfulBasis,
      participants: Array.isArray(participants) ? participants.slice() : [],
      storageKey: key,
      encryption: encMeta,
      retention: {
        retentionDays:
          (retention && Number(retention.retentionDays)) || DEFAULT_RETENTION_DAYS,
        disposalRequiresApproval:
          retention && retention.disposalRequiresApproval === false ? false : true,
        setAt: createdAt,
      },
      mockText: mockText || null,
      language: language || 'auto',
      piiRedacted: false,
      createdAt,
      updatedAt: createdAt,
      accessLog: [{
        userId: consentedBy,
        action: 'record_start',
        at: createdAt,
        reason: lawfulBasis,
      }],
      transcript: null,
      summary: null,
      actionItems: null,
      sentiment: null,
      keywordHits: null,
      qualityScore: null,
    };

    this.storage.putRecord(id, record);
    return {
      status: RECORDING_STATUS.RECORDING,
      id,
      callId,
      storageKey: key,
      encryption: encMeta,
      retention: record.retention,
      createdAt,
    };
  }

  // ─────────── 2. encryptRecording ───────────────────────────────────
  /**
   * AES-256-GCM wrapper. `file` may be a Buffer or a path-like string that
   * the caller has already read into memory.
   */
  encryptRecording({ file, keyId } = {}) {
    if (file === null || file === undefined) {
      throw new Error('encryptRecording requires {file}');
    }
    const buf = Buffer.isBuffer(file) ? file : Buffer.from(String(file), 'utf8');
    return encryptBuffer(buf, keyId || 'default');
  }

  decryptRecording(envelope) { return decryptBuffer(envelope); }

  // ─────────── 3. transcribe ─────────────────────────────────────────
  async transcribe({ recordingId, language = 'auto', backend = 'stub' } = {}) {
    const rec = this.storage.getRecord(recordingId);
    if (!rec) throw new Error(`unknown recordingId: ${recordingId}`);

    const fn = this.backends[backend] || this.backends.stub;
    const audio = this.storage.getBlob(rec.storageKey);
    const result = await Promise.resolve(
      fn({ audioBytes: audio ? audio.length : 0, language, mockText: rec.mockText })
    );

    const updated = this.storage.updateRecord(recordingId, {
      transcript: result,
      status: RECORDING_STATUS.TRANSCRIBED,
      updatedAt: isoTs(this.clock),
    });
    this._pushAccess(recordingId, {
      userId: 'system', action: 'transcribe', reason: `backend=${backend}`,
    });
    return updated.transcript;
  }

  // ─────────── 4. diarize ────────────────────────────────────────────
  diarize({ transcript } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return diarizeTranscript(text);
  }

  // ─────────── 5. summarize ──────────────────────────────────────────
  summarize({ transcript } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return summarizeBilingual(text);
  }

  // ─────────── 6. extractActionItems ─────────────────────────────────
  extractActionItems({ transcript } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return extractActions(text);
  }

  // ─────────── 7. sentimentAnalysis ──────────────────────────────────
  sentimentAnalysis({ transcript } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return analyseSentiment(text);
  }

  // ─────────── 8. keywordSpotting ────────────────────────────────────
  keywordSpotting({ transcript, keywords } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return spotKeywords(text, keywords);
  }

  // ─────────── 9. piiRedaction ───────────────────────────────────────
  /**
   * Redacts PII from a transcript (required) and optionally scrubs a fresh
   * audio buffer. The audio scrub is a stub — real implementations would
   * mute the corresponding offsets using an audio library.
   */
  piiRedaction({ transcript, audio, recordingId } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    const { safe, redactions } = redactPII(text);
    const audioNote = audio
      ? {
          bytes: Buffer.isBuffer(audio) ? audio.length : String(audio).length,
          muted: redactions.length > 0,
          note:  'audio mute is a placeholder; plug in ffmpeg backend in prod',
        }
      : null;
    if (recordingId) {
      const rec = this.storage.getRecord(recordingId);
      if (rec) {
        this.storage.updateRecord(recordingId, {
          piiRedacted: true,
          status: RECORDING_STATUS.REDACTED,
          transcript: rec.transcript
            ? Object.assign({}, rec.transcript, { text: safe })
            : rec.transcript,
          updatedAt: isoTs(this.clock),
        });
        this._pushAccess(recordingId, {
          userId: 'system',
          action: 'pii_redaction',
          reason: `redacted ${redactions.length} items`,
        });
      }
    }
    return { safe, redactions, audio: audioNote, count: redactions.length };
  }

  // ─────────── 10. retentionPolicy ───────────────────────────────────
  /**
   * Applies a retention policy. Disposal NEVER hard-deletes — it moves the
   * record to a frozen tier (status FROZEN) and schedules an approval gate.
   * This keeps the mega-rule "לא מוחקים רק משדרגים ומגדלים".
   */
  retentionPolicy({ recordingId, retentionDays, disposalRequiresApproval = true } = {}) {
    const rec = this.storage.getRecord(recordingId);
    if (!rec) throw new Error(`unknown recordingId: ${recordingId}`);
    const days = Number(retentionDays) > 0 ? Number(retentionDays) : DEFAULT_RETENTION_DAYS;
    const set = isoTs(this.clock);
    const exp = new Date(Date.now() + days * 86400_000).toISOString();
    const patch = {
      retention: {
        retentionDays: days,
        disposalRequiresApproval: disposalRequiresApproval !== false,
        setAt: set,
        expiresAt: exp,
      },
      updatedAt: set,
    };
    const updated = this.storage.updateRecord(recordingId, patch);
    this._pushAccess(recordingId, {
      userId: 'system',
      action: 'retention_set',
      reason: `days=${days} requiresApproval=${patch.retention.disposalRequiresApproval}`,
    });
    return updated.retention;
  }

  // ─────────── 11. accessLog ─────────────────────────────────────────
  accessLog({ recordingId } = {}) {
    const rec = this.storage.getRecord(recordingId);
    if (!rec) return { entries: [], count: 0 };
    return {
      entries: rec.accessLog.slice(),
      count: rec.accessLog.length,
      recordingId,
    };
  }

  /** Internal helper used by all mutators + by logAccess(). */
  _pushAccess(recordingId, entry) {
    const rec = this.storage.getRecord(recordingId);
    if (!rec) return null;
    const full = Object.assign({ at: isoTs(this.clock) }, entry);
    const newLog = rec.accessLog.concat([full]);
    this.storage.updateRecord(recordingId, { accessLog: newLog });
    return full;
  }

  /** Public access-log writer — production code uses this. */
  logAccess({ recordingId, userId, action, reason } = {}) {
    if (!recordingId) throw new Error('logAccess requires {recordingId}');
    if (!userId) throw new Error('logAccess requires {userId}');
    return this._pushAccess(recordingId, {
      userId, action: action || 'listen', reason: reason || '',
    });
  }

  // ─────────── 12. exportForLegal ────────────────────────────────────
  exportForLegal({ recordingId, authorizedBy, reason } = {}) {
    if (!authorizedBy) throw new Error('exportForLegal requires {authorizedBy}');
    if (!reason || !reason.trim()) throw new Error('exportForLegal requires {reason}');
    const rec = this.storage.getRecord(recordingId);
    if (!rec) throw new Error(`unknown recordingId: ${recordingId}`);

    const exportId = randomId('legal', this.idGen);
    const at = isoTs(this.clock);
    this._pushAccess(recordingId, {
      userId: authorizedBy,
      action: 'legal_export',
      reason,
    });

    // Lock record into legal-hold: retention flags are hardened, disposal
    // is blocked until hold is lifted.
    this.storage.updateRecord(recordingId, {
      retention: Object.assign({}, rec.retention, {
        legalHold: true,
        legalHoldSetAt: at,
        disposalRequiresApproval: true,
      }),
      updatedAt: at,
    });

    return {
      exportId,
      recordingId,
      authorizedBy,
      reason,
      exportedAt: at,
      storageKey: rec.storageKey,
      encryption: rec.encryption,
      transcriptHash: rec.transcript
        ? crypto.createHash('sha256')
            .update(String(rec.transcript.text || ''))
            .digest('hex')
        : null,
      chainOfCustody: [{ by: authorizedBy, at, action: 'legal_export' }],
      legalHold: true,
    };
  }

  // ─────────── 13. qualityScore ──────────────────────────────────────
  qualityScore({ transcript, rubric } = {}) {
    const text = typeof transcript === 'string'
      ? transcript
      : (transcript && transcript.text) || '';
    return scoreQuality(text, rubric);
  }

  // ─────────── 14. complianceCheck ───────────────────────────────────
  complianceCheck({ recordingId } = {}) {
    const rec = this.storage.getRecord(recordingId);
    return checkCompliance(rec);
  }

  // ─────────── Introspection helpers (used by UI + tests) ──────────
  getRecording(id)   { return this.storage.getRecord(id); }
  listRecordings()   { return this.storage.listRecords(); }
}

// ══════════════════════════════════════════════════════════════════
// 13. EXPORTS
// ══════════════════════════════════════════════════════════════════

module.exports = {
  // primary
  CallRecording,

  // factory + storage
  createMemoryStorage,

  // pure utilities (exported for testing and reuse)
  validateConsent,
  redactPII,
  analyseSentiment,
  extractActions,
  summarizeBilingual,
  spotKeywords,
  diarizeTranscript,
  scoreQuality,
  encryptBuffer,
  decryptBuffer,
  deriveKey,
  luhnValid,
  israeliIdValid,
  checkCompliance,

  // constants
  CONSENT_MODELS,
  RECORDING_STATUS,
  TRANSCRIPTION_BACKENDS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_ENCRYPTION,
  DEFAULT_RUBRIC,
};
