/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cookie Banner & Consent Gate Generator — יצירת באנר עוגיות ושער הסכמה
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-139  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Onyx-Procurement / privacy / cookie-banner.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Build a standards-compliant cookie banner + consent-gate generator for
 *  Israeli websites. Dual-track compliance:
 *
 *    • Israeli Privacy Protection Law ("חוק הגנת הפרטיות, התשמ״א–1981")
 *      as amended by תיקון 13 (Amendment 13, 2024, in force 14/08/2024).
 *    • EU GDPR 2016/679 + EDPB Guidelines 03/2022 on deceptive design
 *      patterns + EDPB Guidelines 05/2020 on consent.
 *    • ePrivacy Directive 2002/58/EC (cookies = terminal equipment storage).
 *
 *  Core invariant (house rule):
 *     "לא מוחקים רק משדרגים ומגדלים"  — we never hard-delete.
 *  Consequence: withdrawConsent() records a NEW event on the append-only
 *  consent log. Prior consent records are preserved verbatim for audit;
 *  the "current" consent state is derived as the fold of the full history.
 *
 *  EDPB dark-pattern rules enforced (validateCompliance + generateBanner):
 *    1. Essential cookies may be pre-checked; non-essential MUST default OFF.
 *    2. Accept and Reject buttons MUST have equal visual prominence
 *       (same size, same color contrast, same position weight).
 *    3. A link to the full cookie policy MUST be present inside the banner.
 *    4. A withdrawal mechanism MUST be advertised inside the banner.
 *    5. No pre-ticked boxes for non-essential categories.
 *    6. No "confirm-shaming" language — neutral bilingual copy only.
 *
 *  Storage: in-memory. SHA-256 chained append-only log (no external deps).
 *  Zero external dependencies — only `node:crypto`.
 *
 *  Public API
 *  ----------
 *    class CookieBanner
 *      .defineCategories({essential, analytics, marketing, personalization, thirdParty})
 *      .getCategories()                      -> category catalog
 *      .generateBanner({primaryLang, layout, theme, custom})
 *                                            -> { html, css, config }
 *      .recordConsent({sessionId, categories, timestamp, ipHash, userAgentHash})
 *                                            -> consent record (chained)
 *      .generateCookiePolicy({tone, lang})   -> bilingual policy text
 *      .scanCookies(html)                    -> detected cookies [] with category
 *      .categorizeCookie(cookieName)         -> category id
 *      .consentHistory(sessionId)            -> append-only trail []
 *      .currentConsent(sessionId)            -> fold of history
 *      .withdrawConsent(sessionId, categories) -> withdrawal record
 *      .exportConsentLog(period)             -> DSR-compatible audit export
 *      .validateCompliance(config)           -> { valid, violations[], warnings[] }
 *      .verifyChain()                        -> { valid, brokenAt }
 *
 *  Integrates with Y-136 (DSR handler) via exportConsentLog() — the export
 *  format matches the DSR access-request schema so a subject can pull their
 *  entire consent trail.
 *
 *  Run tests:
 *    node --test test/privacy/cookie-banner.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const crypto = require('node:crypto');

// ───────────────────────────────────────────────────────────────────────────
//  Constants — category taxonomy, cookie catalog, EDPB thresholds
// ───────────────────────────────────────────────────────────────────────────

const CATEGORY_IDS = Object.freeze([
  'essential',
  'analytics',
  'marketing',
  'personalization',
  'thirdParty',
]);

const LAYOUTS = Object.freeze(['bottom-bar', 'modal', 'top-bar', 'corner']);
const THEMES = Object.freeze(['dark', 'light', 'custom']);
const TONES = Object.freeze(['formal', 'friendly']);
const LANGS = Object.freeze(['he', 'en']);

const DEFAULT_CATEGORIES = Object.freeze({
  essential: {
    id: 'essential',
    name_he: 'עוגיות חיוניות',
    name_en: 'Essential cookies',
    description_he:
      'עוגיות הכרחיות לתפעול בסיסי של האתר: התחברות, עגלת קניות, אבטחה, איזון עומסים. ללא עוגיות אלה האתר אינו פועל. בסיס חוקי: אינטרס לגיטימי של המפעיל (סעיף 11 לחוק הגנת הפרטיות).',
    description_en:
      'Strictly necessary cookies for basic site operation: login, shopping cart, security, load balancing. Without these the site cannot function. Legal basis: legitimate interest (Israeli Privacy Act §11 / GDPR Art. 6(1)(f)).',
    defaultOn: true,
    required: true,
    lifespan: 'session',
  },
  analytics: {
    id: 'analytics',
    name_he: 'עוגיות אנליטיקה',
    name_en: 'Analytics cookies',
    description_he:
      'מדידת תנועה, זמני טעינה, דפים נצפים. מסייעות לשפר את חוויית המשתמש. בסיס חוקי: הסכמה מפורשת (סעיף 23 לחוק הגנת הפרטיות / GDPR סעיף 6(1)(א)).',
    description_en:
      'Traffic measurement, load times, page views. Help us improve user experience. Legal basis: explicit consent (Israeli Privacy Act §23 / GDPR Art. 6(1)(a)).',
    defaultOn: false,
    required: false,
    lifespan: '13-months',
  },
  marketing: {
    id: 'marketing',
    name_he: 'עוגיות שיווק',
    name_en: 'Marketing cookies',
    description_he:
      'פרסום ממוקד, רימרקטינג, מדידת המרות. משותפות עם שותפי פרסום. בסיס חוקי: הסכמה מפורשת.',
    description_en:
      'Targeted advertising, remarketing, conversion tracking. Shared with advertising partners. Legal basis: explicit consent.',
    defaultOn: false,
    required: false,
    lifespan: '13-months',
  },
  personalization: {
    id: 'personalization',
    name_he: 'עוגיות התאמה אישית',
    name_en: 'Personalization cookies',
    description_he:
      'שמירת העדפות: שפה, ערכת נושא, מיקום, פריטים שנצפו לאחרונה. בסיס חוקי: הסכמה מפורשת.',
    description_en:
      'Preference storage: language, theme, location, recently viewed items. Legal basis: explicit consent.',
    defaultOn: false,
    required: false,
    lifespan: '12-months',
  },
  thirdParty: {
    id: 'thirdParty',
    name_he: 'עוגיות צד שלישי',
    name_en: 'Third-party cookies',
    description_he:
      'שירותים חיצוניים משובצים: מפות, סרטונים, רשתות חברתיות, צ׳אט. עשויים להעביר מידע לספקי צד שלישי מחוץ לישראל. בסיס חוקי: הסכמה מפורשת.',
    description_en:
      'Embedded external services: maps, videos, social networks, chat. May transfer data to third-party providers outside Israel. Legal basis: explicit consent.',
    defaultOn: false,
    required: false,
    lifespan: 'varies',
  },
});

// Common cookie name → category lookup (rule-based, no regex ML).
// Covers the most frequent trackers seen on Israeli .co.il / .org.il sites.
const COOKIE_CATALOG = Object.freeze({
  // essential / session
  PHPSESSID: 'essential',
  JSESSIONID: 'essential',
  ASPSESSIONID: 'essential',
  'connect.sid': 'essential',
  session: 'essential',
  sessionid: 'essential',
  csrf_token: 'essential',
  XSRF_TOKEN: 'essential',
  'XSRF-TOKEN': 'essential',
  __Host_session: 'essential',
  auth_token: 'essential',
  cart: 'essential',
  // analytics
  _ga: 'analytics',
  _gid: 'analytics',
  _gat: 'analytics',
  _gac: 'analytics',
  __utma: 'analytics',
  __utmb: 'analytics',
  __utmc: 'analytics',
  __utmt: 'analytics',
  __utmz: 'analytics',
  _hjSessionUser: 'analytics',
  _hjid: 'analytics',
  _hjAbsoluteSessionInProgress: 'analytics',
  _mkto_trk: 'analytics',
  // marketing
  _fbp: 'marketing',
  _fbc: 'marketing',
  fr: 'marketing',
  IDE: 'marketing',
  _gcl_au: 'marketing',
  MUID: 'marketing',
  personalization_id: 'marketing',
  __gads: 'marketing',
  __gpi: 'marketing',
  tt_sessionId: 'marketing',
  ttwid: 'marketing',
  li_sugr: 'marketing',
  AnalyticsSyncHistory: 'marketing',
  // personalization
  lang: 'personalization',
  locale: 'personalization',
  theme: 'personalization',
  currency: 'personalization',
  recentViewed: 'personalization',
  // third party
  NID: 'thirdParty',
  CONSENT: 'thirdParty',
  VISITOR_INFO1_LIVE: 'thirdParty',
  YSC: 'thirdParty',
  bcookie: 'thirdParty',
  lidc: 'thirdParty',
  UserMatchHistory: 'thirdParty',
});

const COOKIE_PATTERN_RULES = Object.freeze([
  { prefix: '_ga_', category: 'analytics' },
  { prefix: '_gac_', category: 'analytics' },
  { prefix: '_gcl_', category: 'marketing' },
  { prefix: '_hj', category: 'analytics' },
  { prefix: '__utm', category: 'analytics' },
  { prefix: 'AMP_', category: 'analytics' },
  { prefix: 'ajs_', category: 'analytics' },
  { prefix: 'mp_', category: 'analytics' },
  { prefix: '_pin_', category: 'marketing' },
  { prefix: '_ttp', category: 'marketing' },
  { prefix: 'MR', category: 'marketing' },
  { prefix: 'wordpress_logged_in', category: 'essential' },
  { prefix: 'wp-settings', category: 'personalization' },
]);

const EDPB_RULES = Object.freeze({
  acceptRejectSizeRatioMax: 1.0, // strict parity
  acceptRejectSizeRatioTolerance: 0.05, // 5% allowance for rounding
  nonEssentialDefaultMustBe: false,
  policyLinkRequired: true,
  withdrawalMechanismRequired: true,
  allowedNonEssentialPrechecked: false,
});

// ───────────────────────────────────────────────────────────────────────────
//  Utility — hashing, escaping, IDs
// ───────────────────────────────────────────────────────────────────────────

function sha256(input) {
  return crypto
    .createHash('sha256')
    .update(typeof input === 'string' ? input : JSON.stringify(input))
    .digest('hex');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function randomId(prefix = 'evt') {
  return `${prefix}_${Date.now().toString(36)}_${crypto
    .randomBytes(6)
    .toString('hex')}`;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

// ───────────────────────────────────────────────────────────────────────────
//  CookieBanner class
// ───────────────────────────────────────────────────────────────────────────

class CookieBanner {
  constructor(options = {}) {
    this.siteName = options.siteName || 'Techno-Kol Uzi';
    this.siteName_he = options.siteName_he || 'טכנו-קול עוזי';
    this.policyUrl = options.policyUrl || '/privacy/cookies';
    this.dpoEmail = options.dpoEmail || 'privacy@technokoluzi.co.il';
    this.controller = options.controller || 'Techno-Kol Uzi Ltd.';
    this.controller_he = options.controller_he || 'טכנו-קול עוזי בע״מ';

    // Category catalog — start with sane defaults
    this._categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));

    // Append-only consent log: every event is hash-chained.
    this._consentLog = [];
    this._lastHash = sha256('GENESIS_Y139_COOKIE_BANNER');

    // Per-session index for fast history lookup (rebuildable from log).
    this._sessionIndex = new Map();
  }

  // ── 1. defineCategories ────────────────────────────────────────────────
  defineCategories(defs) {
    if (!defs || typeof defs !== 'object') {
      throw new TypeError('defineCategories requires an object');
    }
    const next = {};
    for (const id of CATEGORY_IDS) {
      const user = defs[id];
      const base = this._categories[id] || DEFAULT_CATEGORIES[id];
      if (!user) {
        next[id] = base;
        continue;
      }
      const merged = {
        id,
        name_he: user.name_he || base.name_he,
        name_en: user.name_en || base.name_en,
        description_he: user.description_he || base.description_he,
        description_en: user.description_en || base.description_en,
        defaultOn:
          id === 'essential' ? true : Boolean(user.defaultOn === true),
        required: id === 'essential',
        lifespan: user.lifespan || base.lifespan,
      };
      // Hard rule: essential MUST be defaultOn=true, non-essential MUST be false.
      if (id !== 'essential' && merged.defaultOn !== false) {
        // EDPB guideline 05/2020 — silently correct and record warning.
        merged.defaultOn = false;
      }
      next[id] = merged;
    }
    this._categories = next;
    return this.getCategories();
  }

  getCategories() {
    // Return a deep-frozen snapshot so callers can't mutate internal state.
    return deepFreeze(JSON.parse(JSON.stringify(this._categories)));
  }

  // ── 2. generateBanner ──────────────────────────────────────────────────
  generateBanner(opts = {}) {
    const primaryLang = LANGS.includes(opts.primaryLang)
      ? opts.primaryLang
      : 'he';
    const layout = LAYOUTS.includes(opts.layout) ? opts.layout : 'bottom-bar';
    const theme = THEMES.includes(opts.theme) ? opts.theme : 'dark';
    const dir = primaryLang === 'he' ? 'rtl' : 'ltr';

    const palette = this._resolveTheme(theme, opts.custom);
    const copy = this._getBannerCopy(primaryLang);

    // Strict parity — both buttons share the exact same class + dimensions.
    // EDPB Guidelines 03/2022 §3.1 "Equal footing".
    const BUTTON_WIDTH_PX = 160;
    const BUTTON_HEIGHT_PX = 44;
    const BUTTON_FONT_PX = 16;

    const categoryRows = CATEGORY_IDS.map((id) => {
      const cat = this._categories[id];
      const disabled = id === 'essential' ? 'disabled checked' : '';
      const checked = cat.defaultOn ? 'checked' : '';
      return `
      <div class="cb-cat-row" role="group" aria-label="${escapeHtml(cat.name_en)}">
        <label class="cb-cat-label">
          <input type="checkbox" name="cb-cat" value="${escapeHtml(id)}"
                 data-default="${cat.defaultOn}" ${disabled || checked} />
          <span class="cb-cat-title" lang="he" dir="rtl">${escapeHtml(cat.name_he)}</span>
          <span class="cb-cat-title-en" lang="en" dir="ltr">${escapeHtml(cat.name_en)}</span>
        </label>
        <p class="cb-cat-desc" lang="he" dir="rtl">${escapeHtml(cat.description_he)}</p>
        <p class="cb-cat-desc-en" lang="en" dir="ltr">${escapeHtml(cat.description_en)}</p>
      </div>`;
    }).join('\n');

    const css = `
/* Y-139 Cookie Banner — self-contained, no external fonts, no external CSS */
.cb-root, .cb-root * { box-sizing: border-box; }
.cb-root {
  position: fixed;
  z-index: 2147483647;
  font-family: -apple-system, "Segoe UI", "Arial Hebrew", "Arial", sans-serif;
  color: ${palette.fg};
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  box-shadow: 0 -4px 24px rgba(0,0,0,0.25);
  padding: 20px 24px;
  max-width: 100%;
  direction: ${dir};
}
.cb-root[data-layout="bottom-bar"] { left:0; right:0; bottom:0; border-radius: 0; }
.cb-root[data-layout="top-bar"]    { left:0; right:0; top:0;    border-radius: 0; }
.cb-root[data-layout="modal"] {
  top:50%; left:50%; transform:translate(-50%,-50%);
  max-width: 720px; width: 92vw; max-height: 90vh; overflow-y: auto;
  border-radius: 12px;
}
.cb-root[data-layout="corner"] {
  bottom: 24px; inset-inline-end: 24px;
  max-width: 440px; border-radius: 12px;
}
.cb-title { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; }
.cb-title-en { font-size: 14px; font-weight: 500; opacity: 0.75; margin: 0 0 12px 0; }
.cb-body  { font-size: 15px; line-height: 1.55; margin: 0 0 12px 0; }
.cb-body-en { font-size: 13px; line-height: 1.5; opacity: 0.82; margin: 0 0 16px 0; }
.cb-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  margin-top: 12px;
}
/* EDPB parity — accept and reject MUST be visually identical in every way
   except label. Same size, same colors, same weight, same border. */
.cb-btn, .cb-btn-accept, .cb-btn-reject {
  width: ${BUTTON_WIDTH_PX}px;
  min-width: ${BUTTON_WIDTH_PX}px;
  height: ${BUTTON_HEIGHT_PX}px;
  font-size: ${BUTTON_FONT_PX}px;
  font-weight: 600;
  border-radius: 6px;
  border: 2px solid ${palette.btnBorder};
  background: ${palette.btnBg};
  color: ${palette.btnFg};
  cursor: pointer;
  padding: 0 16px;
  line-height: ${BUTTON_HEIGHT_PX - 4}px;
  text-align: center;
}
.cb-btn:focus, .cb-btn-accept:focus, .cb-btn-reject:focus {
  outline: 3px solid ${palette.focus};
  outline-offset: 2px;
}
.cb-btn-settings {
  background: transparent;
  color: ${palette.fg};
  border: 2px dashed ${palette.border};
  width: ${BUTTON_WIDTH_PX}px;
  height: ${BUTTON_HEIGHT_PX}px;
  font-size: ${BUTTON_FONT_PX}px;
  border-radius: 6px;
  cursor: pointer;
}
.cb-cat-row {
  border-top: 1px solid ${palette.border};
  padding: 12px 0;
}
.cb-cat-label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
  cursor: pointer;
}
.cb-cat-title-en { font-weight: 500; opacity: 0.75; font-size: 12px; }
.cb-cat-desc { font-size: 13px; line-height: 1.5; margin: 4px 0 2px 0; opacity: 0.9; }
.cb-cat-desc-en { font-size: 12px; line-height: 1.45; margin: 0; opacity: 0.7; }
.cb-policy-link { display: inline-block; margin-inline-end: 16px; color: ${palette.link}; text-decoration: underline; }
.cb-withdraw-note {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dotted ${palette.border};
}
`.trim();

    const html = `
<div class="cb-root" data-layout="${layout}" data-theme="${theme}" data-lang="${primaryLang}" role="dialog" aria-modal="false" aria-labelledby="cb-title" aria-describedby="cb-body" dir="${dir}" lang="${primaryLang}">
  <h2 class="cb-title" id="cb-title" lang="he" dir="rtl">${escapeHtml(copy.title_he)}</h2>
  <h3 class="cb-title-en" lang="en" dir="ltr">${escapeHtml(copy.title_en)}</h3>
  <p class="cb-body" id="cb-body" lang="he" dir="rtl">${escapeHtml(copy.body_he)}</p>
  <p class="cb-body-en" lang="en" dir="ltr">${escapeHtml(copy.body_en)}</p>

  <details class="cb-details">
    <summary class="cb-summary" lang="he" dir="rtl">${escapeHtml(copy.preferences_he)} / <span lang="en" dir="ltr">${escapeHtml(copy.preferences_en)}</span></summary>
    ${categoryRows}
  </details>

  <div class="cb-actions" role="group" aria-label="${escapeHtml(copy.actions_en)}">
    <button type="button" class="cb-btn cb-btn-accept" data-action="accept-all" aria-label="${escapeHtml(copy.accept_en)}">
      ${escapeHtml(copy.accept_he)} / ${escapeHtml(copy.accept_en)}
    </button>
    <button type="button" class="cb-btn cb-btn-reject" data-action="reject-all" aria-label="${escapeHtml(copy.reject_en)}">
      ${escapeHtml(copy.reject_he)} / ${escapeHtml(copy.reject_en)}
    </button>
    <button type="button" class="cb-btn-settings" data-action="save-selection" aria-label="${escapeHtml(copy.save_en)}">
      ${escapeHtml(copy.save_he)} / ${escapeHtml(copy.save_en)}
    </button>
  </div>

  <div class="cb-footer">
    <a class="cb-policy-link" href="${escapeHtml(this.policyUrl)}" lang="he" dir="rtl">${escapeHtml(copy.policyLink_he)}</a>
    <a class="cb-policy-link" href="${escapeHtml(this.policyUrl)}" lang="en" dir="ltr">${escapeHtml(copy.policyLink_en)}</a>
  </div>

  <p class="cb-withdraw-note" lang="he" dir="rtl">${escapeHtml(copy.withdraw_he)}</p>
  <p class="cb-withdraw-note" lang="en" dir="ltr">${escapeHtml(copy.withdraw_en)}</p>
</div>
`.trim();

    const config = {
      primaryLang,
      layout,
      theme,
      dir,
      buttonDimensions: {
        acceptWidth: BUTTON_WIDTH_PX,
        acceptHeight: BUTTON_HEIGHT_PX,
        rejectWidth: BUTTON_WIDTH_PX,
        rejectHeight: BUTTON_HEIGHT_PX,
        fontSize: BUTTON_FONT_PX,
      },
      hasPolicyLink: true,
      hasWithdrawalMechanism: true,
      categories: CATEGORY_IDS.map((id) => ({
        id,
        defaultOn: this._categories[id].defaultOn,
      })),
    };

    return { html, css, config };
  }

  _resolveTheme(theme, custom) {
    if (theme === 'custom' && custom && typeof custom === 'object') {
      return {
        bg: custom.bg || '#111827',
        fg: custom.fg || '#F3F4F6',
        border: custom.border || '#374151',
        btnBg: custom.btnBg || '#2563EB',
        btnFg: custom.btnFg || '#FFFFFF',
        btnBorder: custom.btnBorder || '#2563EB',
        link: custom.link || '#93C5FD',
        focus: custom.focus || '#FBBF24',
      };
    }
    if (theme === 'light') {
      return {
        bg: '#FFFFFF',
        fg: '#111827',
        border: '#D1D5DB',
        btnBg: '#2563EB',
        btnFg: '#FFFFFF',
        btnBorder: '#2563EB',
        link: '#1D4ED8',
        focus: '#F59E0B',
      };
    }
    // dark (default — matches Onyx-Procurement Palantir-style)
    return {
      bg: '#0B0F1A',
      fg: '#F3F4F6',
      border: '#1F2937',
      btnBg: '#2563EB',
      btnFg: '#FFFFFF',
      btnBorder: '#3B82F6',
      link: '#93C5FD',
      focus: '#FBBF24',
    };
  }

  _getBannerCopy(lang) {
    // Bilingual copy is always present regardless of primary language —
    // Israeli users often switch languages mid-session.
    return {
      title_he: 'אנחנו משתמשים בעוגיות',
      title_en: 'We use cookies',
      body_he:
        'האתר משתמש בעוגיות לתפעול בסיסי, מדידה, שיווק, התאמה אישית ושירותי צד שלישי. אנא בחר אילו קטגוריות לאפשר. העוגיות החיוניות נדרשות להפעלת האתר ולא ניתן לבטלן. ניתן לשנות את הבחירה בכל עת.',
      body_en:
        'This site uses cookies for basic operation, measurement, marketing, personalization, and third-party services. Please choose which categories to allow. Essential cookies are required and cannot be disabled. You can change your choice at any time.',
      preferences_he: 'העדפות מפורטות',
      preferences_en: 'Detailed preferences',
      actions_en: 'Consent actions',
      accept_he: 'קבל הכול',
      accept_en: 'Accept all',
      reject_he: 'דחה הכול',
      reject_en: 'Reject all',
      save_he: 'שמור בחירה',
      save_en: 'Save selection',
      policyLink_he: 'מדיניות עוגיות מלאה',
      policyLink_en: 'Full cookie policy',
      withdraw_he:
        'ניתן למשוך את ההסכמה בכל עת דרך הגדרות > פרטיות, או בפנייה לדוא״ל ' +
        this.dpoEmail +
        '. משיכה לא משפיעה על חוקיות עיבוד שבוצע לפני המשיכה.',
      withdraw_en:
        'You may withdraw consent at any time via Settings > Privacy or by emailing ' +
        this.dpoEmail +
        '. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.',
      primaryLang: lang,
    };
  }

  // ── 3. recordConsent ───────────────────────────────────────────────────
  recordConsent(args = {}) {
    if (!args.sessionId || typeof args.sessionId !== 'string') {
      throw new TypeError('recordConsent requires sessionId (string)');
    }
    if (!args.categories || typeof args.categories !== 'object') {
      throw new TypeError('recordConsent requires categories object');
    }

    // Normalize categories — essential is ALWAYS true, regardless of input.
    const normalized = {};
    for (const id of CATEGORY_IDS) {
      if (id === 'essential') {
        normalized[id] = true;
      } else {
        normalized[id] = args.categories[id] === true;
      }
    }

    const timestamp =
      typeof args.timestamp === 'number'
        ? args.timestamp
        : typeof args.timestamp === 'string'
        ? new Date(args.timestamp).getTime()
        : Date.now();

    // PII is hashed immediately — never stored in the clear.
    const ipHash = args.ipHash
      ? String(args.ipHash)
      : args.ip
      ? sha256('ip:' + args.ip)
      : null;
    const userAgentHash = args.userAgentHash
      ? String(args.userAgentHash)
      : args.userAgent
      ? sha256('ua:' + args.userAgent)
      : null;

    return this._appendLog({
      kind: 'consent',
      sessionId: args.sessionId,
      categories: normalized,
      timestamp,
      ipHash,
      userAgentHash,
      source: args.source || 'banner',
      layout: args.layout || null,
      policyVersion: args.policyVersion || '1.0',
    });
  }

  _appendLog(event) {
    const id = randomId('ccnt');
    const payload = {
      id,
      ...event,
      recordedAt: new Date().toISOString(),
      prevHash: this._lastHash,
    };
    payload.hash = sha256({
      id: payload.id,
      kind: payload.kind,
      sessionId: payload.sessionId,
      categories: payload.categories || null,
      timestamp: payload.timestamp || null,
      prevHash: payload.prevHash,
    });
    Object.freeze(payload);
    this._consentLog.push(payload);
    this._lastHash = payload.hash;
    if (!this._sessionIndex.has(payload.sessionId)) {
      this._sessionIndex.set(payload.sessionId, []);
    }
    this._sessionIndex.get(payload.sessionId).push(payload);
    return payload;
  }

  // ── 4. generateCookiePolicy ────────────────────────────────────────────
  generateCookiePolicy(opts = {}) {
    const tone = TONES.includes(opts.tone) ? opts.tone : 'formal';
    const lang = LANGS.includes(opts.lang) ? opts.lang : 'he';

    const year = new Date().getFullYear();
    const date = new Date().toISOString().split('T')[0];

    const he = this._policyHe(tone, year, date);
    const en = this._policyEn(tone, year, date);

    // Bilingual return — the caller picks the primary but gets both for
    // legal completeness (required by Israeli Consumer Protection law when
    // the site is marketed in both languages).
    return {
      lang,
      tone,
      generated: date,
      he,
      en,
      primary: lang === 'he' ? he : en,
      alternate: lang === 'he' ? en : he,
    };
  }

  _policyHe(tone, year, date) {
    const friendly = tone === 'friendly';
    const greeting = friendly
      ? 'שלום וברוכים הבאים! להלן הסבר קצר על העוגיות שבהן אנחנו משתמשים.'
      : 'מסמך זה מפרט את השימוש של ' +
        this.controller_he +
        ' בעוגיות ("Cookies") באתר ובשירותים הדיגיטליים שלנו.';

    const categories = CATEGORY_IDS.map((id) => {
      const c = this._categories[id];
      return `### ${c.name_he}\n${c.description_he}\nאורך חיים: ${c.lifespan}.`;
    }).join('\n\n');

    return [
      `# מדיניות עוגיות — ${this.siteName_he}`,
      `תאריך עדכון: ${date}`,
      '',
      greeting,
      '',
      '## מהי עוגייה?',
      'עוגייה היא קובץ טקסט קטן הנשמר בדפדפן שלך בעת גלישה באתר. היא מאפשרת לאתר "לזכור" אותך בין ביקורים או בתוך אותו ביקור.',
      '',
      '## קטגוריות העוגיות באתר',
      '',
      categories,
      '',
      '## הבסיס החוקי',
      'עיבוד המידע נעשה בהתאם לחוק הגנת הפרטיות, התשמ״א–1981, כפי שתוקן ב-תיקון 13 (2024). עיבוד עוגיות לא-חיוניות מתבצע על בסיס הסכמה מפורשת, ניתן למשוך אותה בכל עת.',
      '',
      '## זכויות הנושא',
      '- עיון (סעיף 13) / Access',
      '- תיקון (סעיף 14) / Rectification',
      '- מחיקה (תיקון 13) / Erasure',
      '- ניידות / Portability',
      '- התנגדות / Objection',
      '- הגבלת עיבוד / Restriction',
      '',
      '## משיכת הסכמה',
      `ניתן למשוך הסכמה דרך באנר ההגדרות > פרטיות, או בפנייה לממונה הגנה על מידע (DPO) בכתובת ${this.dpoEmail}. משיכה אינה משפיעה על חוקיות עיבוד שבוצע בעבר.`,
      '',
      '## יצירת קשר',
      `בקר מידע: ${this.controller_he} — ${this.dpoEmail}`,
      '',
      `© ${year} ${this.controller_he}. כל הזכויות שמורות.`,
    ].join('\n');
  }

  _policyEn(tone, year, date) {
    const friendly = tone === 'friendly';
    const greeting = friendly
      ? 'Hello and welcome! Here is a short explanation of the cookies we use.'
      : 'This document describes the use of cookies by ' +
        this.controller +
        ' on our website and digital services.';

    const categories = CATEGORY_IDS.map((id) => {
      const c = this._categories[id];
      return `### ${c.name_en}\n${c.description_en}\nLifespan: ${c.lifespan}.`;
    }).join('\n\n');

    return [
      `# Cookie Policy — ${this.siteName}`,
      `Last updated: ${date}`,
      '',
      greeting,
      '',
      '## What is a cookie?',
      'A cookie is a small text file stored in your browser while you visit a website. It lets the site "remember" you between visits or within a single visit.',
      '',
      '## Cookie categories on this site',
      '',
      categories,
      '',
      '## Legal basis',
      'Processing is carried out under the Israeli Privacy Protection Law, 1981, as amended by Amendment 13 (2024), and under GDPR (for EU visitors). Non-essential cookies are processed on the basis of explicit consent, which can be withdrawn at any time.',
      '',
      '## Data subject rights',
      '- Access / עיון',
      '- Rectification / תיקון',
      '- Erasure / מחיקה',
      '- Portability / ניידות',
      '- Objection / התנגדות',
      '- Restriction / הגבלת עיבוד',
      '',
      '## Withdrawal of consent',
      `You can withdraw consent through the Settings > Privacy banner, or by contacting our Data Protection Officer at ${this.dpoEmail}. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.`,
      '',
      '## Contact',
      `Data controller: ${this.controller} — ${this.dpoEmail}`,
      '',
      `© ${year} ${this.controller}. All rights reserved.`,
    ].join('\n');
  }

  // ── 5. scanCookies ─────────────────────────────────────────────────────
  scanCookies(html) {
    if (!html || typeof html !== 'string') return [];
    const found = new Set();
    const results = [];

    // Rule 1: document.cookie assignments / reads
    const cookieAssignRe = /document\.cookie\s*=\s*["'`]([^"'`;=]+)=/g;
    let m;
    while ((m = cookieAssignRe.exec(html)) !== null) {
      const name = m[1].trim();
      if (name && !found.has(name)) {
        found.add(name);
        results.push({
          name,
          category: this.categorizeCookie(name),
          source: 'document.cookie',
        });
      }
    }

    // Rule 2: <script src="..."> heuristics
    const scriptRe = /<script[^>]*src\s*=\s*["']([^"']+)["']/gi;
    while ((m = scriptRe.exec(html)) !== null) {
      const src = m[1];
      const inferred = this._inferFromScriptSrc(src);
      for (const cookie of inferred) {
        if (!found.has(cookie.name)) {
          found.add(cookie.name);
          results.push({ ...cookie, source: 'script:' + src });
        }
      }
    }

    // Rule 3: common data-attribute markers (GTM, FB pixel, Hotjar)
    if (/gtag\s*\(\s*['"]config/.test(html) || /googletagmanager/i.test(html)) {
      for (const cname of ['_ga', '_gid', '_gat']) {
        if (!found.has(cname)) {
          found.add(cname);
          results.push({
            name: cname,
            category: 'analytics',
            source: 'gtag/gtm',
          });
        }
      }
    }
    if (/fbq\s*\(/.test(html) || /connect\.facebook\.net/i.test(html)) {
      for (const cname of ['_fbp', '_fbc', 'fr']) {
        if (!found.has(cname)) {
          found.add(cname);
          results.push({
            name: cname,
            category: 'marketing',
            source: 'facebook-pixel',
          });
        }
      }
    }
    if (/hotjar|static\.hotjar\.com/i.test(html)) {
      for (const cname of ['_hjid', '_hjSessionUser']) {
        if (!found.has(cname)) {
          found.add(cname);
          results.push({
            name: cname,
            category: 'analytics',
            source: 'hotjar',
          });
        }
      }
    }
    if (/youtube\.com\/embed|www-embed-player/i.test(html)) {
      for (const cname of ['VISITOR_INFO1_LIVE', 'YSC']) {
        if (!found.has(cname)) {
          found.add(cname);
          results.push({
            name: cname,
            category: 'thirdParty',
            source: 'youtube-embed',
          });
        }
      }
    }
    if (/linkedin\.com\/insight|snap\.licdn\.com/i.test(html)) {
      for (const cname of ['bcookie', 'lidc']) {
        if (!found.has(cname)) {
          found.add(cname);
          results.push({
            name: cname,
            category: 'thirdParty',
            source: 'linkedin-insight',
          });
        }
      }
    }

    // Rule 4: set-cookie comment hints (server-rendered)
    const setCookieRe = /Set-Cookie:\s*([^=;\s]+)=/gi;
    while ((m = setCookieRe.exec(html)) !== null) {
      const name = m[1].trim();
      if (name && !found.has(name)) {
        found.add(name);
        results.push({
          name,
          category: this.categorizeCookie(name),
          source: 'set-cookie-header',
        });
      }
    }

    return results;
  }

  _inferFromScriptSrc(src) {
    const out = [];
    const s = src.toLowerCase();
    if (
      s.includes('googletagmanager.com') ||
      s.includes('google-analytics.com')
    ) {
      out.push({ name: '_ga', category: 'analytics' });
      out.push({ name: '_gid', category: 'analytics' });
    }
    if (s.includes('connect.facebook.net')) {
      out.push({ name: '_fbp', category: 'marketing' });
      out.push({ name: 'fr', category: 'marketing' });
    }
    if (s.includes('hotjar.com')) {
      out.push({ name: '_hjid', category: 'analytics' });
    }
    if (s.includes('licdn.com') || s.includes('linkedin.com')) {
      out.push({ name: 'bcookie', category: 'thirdParty' });
    }
    if (s.includes('youtube.com') || s.includes('youtu.be')) {
      out.push({ name: 'VISITOR_INFO1_LIVE', category: 'thirdParty' });
    }
    if (s.includes('twitter.com') || s.includes('t.co')) {
      out.push({ name: 'personalization_id', category: 'marketing' });
    }
    return out;
  }

  // ── 6. categorizeCookie ────────────────────────────────────────────────
  categorizeCookie(cookieName) {
    if (!cookieName || typeof cookieName !== 'string') return 'unknown';
    // Exact match first
    if (COOKIE_CATALOG[cookieName]) return COOKIE_CATALOG[cookieName];
    // Case-insensitive exact match
    for (const [k, v] of Object.entries(COOKIE_CATALOG)) {
      if (k.toLowerCase() === cookieName.toLowerCase()) return v;
    }
    // Prefix rules
    for (const rule of COOKIE_PATTERN_RULES) {
      if (cookieName.startsWith(rule.prefix)) return rule.category;
    }
    // Heuristic: anything containing "session" or "sid" → essential
    const lc = cookieName.toLowerCase();
    if (lc.includes('session') || lc.endsWith('sid') || lc.includes('csrf')) {
      return 'essential';
    }
    if (lc.includes('lang') || lc.includes('locale') || lc.includes('theme')) {
      return 'personalization';
    }
    return 'unknown';
  }

  // ── 7. consentHistory ──────────────────────────────────────────────────
  consentHistory(sessionId) {
    if (!sessionId) return [];
    const arr = this._sessionIndex.get(sessionId) || [];
    // Return frozen shallow copy so caller can't push to internal log.
    return Object.freeze(arr.slice());
  }

  currentConsent(sessionId) {
    const history = this.consentHistory(sessionId);
    if (history.length === 0) {
      // Default fold: essential only.
      return Object.freeze({
        essential: true,
        analytics: false,
        marketing: false,
        personalization: false,
        thirdParty: false,
      });
    }
    // Fold: iterate chronologically, apply each event.
    const state = {
      essential: true,
      analytics: false,
      marketing: false,
      personalization: false,
      thirdParty: false,
    };
    for (const evt of history) {
      if (evt.kind === 'consent') {
        for (const id of CATEGORY_IDS) {
          state[id] = evt.categories[id] === true;
        }
        state.essential = true;
      } else if (evt.kind === 'withdrawal') {
        for (const id of evt.categories || []) {
          if (id !== 'essential') state[id] = false;
        }
      }
    }
    return Object.freeze(state);
  }

  // ── 8. withdrawConsent ─────────────────────────────────────────────────
  withdrawConsent(sessionId, categories) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new TypeError('withdrawConsent requires sessionId (string)');
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new TypeError(
        'withdrawConsent requires a non-empty array of category ids'
      );
    }
    // Filter to valid non-essential categories only.
    const filtered = categories.filter(
      (id) => CATEGORY_IDS.includes(id) && id !== 'essential'
    );
    if (filtered.length === 0) {
      throw new Error(
        'withdrawConsent: essential cookies cannot be withdrawn (required for site operation)'
      );
    }
    // Append — never mutate prior records.
    return this._appendLog({
      kind: 'withdrawal',
      sessionId,
      categories: filtered,
      timestamp: Date.now(),
      reason: 'user-initiated',
    });
  }

  // ── 9. exportConsentLog ────────────────────────────────────────────────
  exportConsentLog(period = {}) {
    const from =
      period.from !== undefined
        ? typeof period.from === 'string'
          ? new Date(period.from).getTime()
          : Number(period.from)
        : 0;
    const to =
      period.to !== undefined
        ? typeof period.to === 'string'
          ? new Date(period.to).getTime()
          : Number(period.to)
        : Number.MAX_SAFE_INTEGER;

    const events = this._consentLog.filter((e) => {
      const ts = e.timestamp || Date.parse(e.recordedAt);
      return ts >= from && ts <= to;
    });

    // DSR-compatible schema (matches Y-136 access-request export).
    return {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      controller: this.controller,
      controller_he: this.controller_he,
      period: { from, to },
      eventCount: events.length,
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        sessionId: e.sessionId,
        categories: e.categories,
        timestamp: e.timestamp,
        recordedAt: e.recordedAt,
        policyVersion: e.policyVersion || null,
        ipHash: e.ipHash || null,
        userAgentHash: e.userAgentHash || null,
        hash: e.hash,
        prevHash: e.prevHash,
      })),
      chainValid: this.verifyChain().valid,
    };
  }

  // ── 10. validateCompliance ─────────────────────────────────────────────
  validateCompliance(config) {
    const violations = [];
    const warnings = [];

    if (!config || typeof config !== 'object') {
      return {
        valid: false,
        violations: ['config-missing'],
        warnings: [],
        checks: {},
      };
    }

    const checks = {};

    // Check 1: essential pre-checked = OK
    checks.essentialPrechecked = true;
    const essential = this._categories.essential;
    if (!essential || essential.defaultOn !== true) {
      violations.push({
        code: 'essential-not-prechecked',
        message_he:
          'עוגיות חיוניות חייבות להיות מסומנות כברירת מחדל כי האתר לא פועל בלעדיהן.',
        message_en:
          'Essential cookies must be pre-checked (the site cannot function without them).',
      });
      checks.essentialPrechecked = false;
    }

    // Check 2: non-essential MUST default OFF
    checks.nonEssentialDefaultOff = true;
    for (const id of CATEGORY_IDS) {
      if (id === 'essential') continue;
      const c = this._categories[id];
      if (c && c.defaultOn === true) {
        violations.push({
          code: 'non-essential-prechecked',
          category: id,
          message_he: `הקטגוריה ${c.name_he} אינה חיונית ואסור לה להיות מסומנת כברירת מחדל (EDPB 05/2020).`,
          message_en: `Category ${c.name_en} is non-essential and must not be pre-checked (EDPB 05/2020).`,
        });
        checks.nonEssentialDefaultOff = false;
      }
    }

    // Check 3: withdrawal mechanism present
    checks.withdrawalMechanism = config.hasWithdrawalMechanism === true;
    if (!checks.withdrawalMechanism) {
      violations.push({
        code: 'no-withdrawal-mechanism',
        message_he:
          'חובה לספק מנגנון לביטול ההסכמה ישירות מהבאנר (סעיף 7(3) GDPR + תיקון 13).',
        message_en:
          'A withdrawal mechanism must be exposed in the banner (GDPR Art. 7(3) + Amendment 13).',
      });
    }

    // Check 4: policy link present
    checks.policyLink = config.hasPolicyLink === true;
    if (!checks.policyLink) {
      violations.push({
        code: 'no-policy-link',
        message_he:
          'חובה לכלול קישור למדיניות העוגיות המלאה בתוך הבאנר.',
        message_en:
          'A link to the full cookie policy must be present inside the banner.',
      });
    }

    // Check 5: button parity (no dark patterns) — EDPB 03/2022 §3.1
    checks.buttonParity = true;
    const dims = config.buttonDimensions || {};
    if (dims.acceptWidth && dims.rejectWidth) {
      const aArea = dims.acceptWidth * (dims.acceptHeight || 1);
      const rArea = dims.rejectWidth * (dims.rejectHeight || 1);
      const ratio = Math.max(aArea, rArea) / Math.min(aArea, rArea);
      const threshold = 1 + EDPB_RULES.acceptRejectSizeRatioTolerance;
      if (ratio > threshold) {
        violations.push({
          code: 'dark-pattern-button-size',
          message_he:
            `כפתור "קבל" אינו שווה בגודלו לכפתור "דחה" (יחס ${ratio.toFixed(2)}). ` +
            'EDPB Guidelines 03/2022 §3.1 אוסרות על הטיית עיצוב (dark patterns).',
          message_en:
            `Accept button is not equal in size to the Reject button (ratio ${ratio.toFixed(2)}). ` +
            'EDPB Guidelines 03/2022 §3.1 forbid deceptive design (dark patterns).',
          ratio,
        });
        checks.buttonParity = false;
      }
    } else {
      warnings.push({
        code: 'button-dimensions-missing',
        message_en:
          'Could not verify button parity — buttonDimensions not supplied.',
      });
    }

    // Check 6: 5 categories present
    checks.fiveCategories = CATEGORY_IDS.every((id) => this._categories[id]);
    if (!checks.fiveCategories) {
      violations.push({
        code: 'incomplete-category-taxonomy',
        message_en:
          'The 5-category taxonomy (essential, analytics, marketing, personalization, thirdParty) must be complete.',
      });
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      checks,
    };
  }

  // ── 11. verifyChain (audit integrity) ──────────────────────────────────
  verifyChain() {
    let prev = sha256('GENESIS_Y139_COOKIE_BANNER');
    for (let i = 0; i < this._consentLog.length; i++) {
      const e = this._consentLog[i];
      if (e.prevHash !== prev) return { valid: false, brokenAt: i };
      const expected = sha256({
        id: e.id,
        kind: e.kind,
        sessionId: e.sessionId,
        categories: e.categories || null,
        timestamp: e.timestamp || null,
        prevHash: e.prevHash,
      });
      if (e.hash !== expected) return { valid: false, brokenAt: i };
      prev = e.hash;
    }
    return { valid: true, brokenAt: null };
  }
}

module.exports = {
  CookieBanner,
  CATEGORY_IDS,
  LAYOUTS,
  THEMES,
  TONES,
  LANGS,
  DEFAULT_CATEGORIES,
  COOKIE_CATALOG,
  EDPB_RULES,
  // exported for tests
  _internal: { sha256, escapeHtml },
};
