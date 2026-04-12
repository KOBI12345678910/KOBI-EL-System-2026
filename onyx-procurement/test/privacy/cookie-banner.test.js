/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cookie Banner Tests — בדיקות באנר עוגיות
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-139  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *  Run:  node --test test/privacy/cookie-banner.test.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CookieBanner,
  CATEGORY_IDS,
  DEFAULT_CATEGORIES,
  LAYOUTS,
  THEMES,
  EDPB_RULES,
} = require('../../src/privacy/cookie-banner.js');

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function freshBanner(opts = {}) {
  return new CookieBanner({
    siteName: 'Techno-Kol Uzi',
    siteName_he: 'טכנו-קול עוזי',
    policyUrl: '/privacy/cookies',
    dpoEmail: 'privacy@technokoluzi.co.il',
    controller: 'Techno-Kol Uzi Ltd.',
    controller_he: 'טכנו-קול עוזי בע״מ',
    ...opts,
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  1. Category taxonomy — 5 categories
// ───────────────────────────────────────────────────────────────────────────
test('01 — defineCategories yields all 5 required categories', () => {
  const cb = freshBanner();
  const cats = cb.getCategories();
  assert.equal(Object.keys(cats).length, 5);
  for (const id of CATEGORY_IDS) {
    assert.ok(cats[id], `missing category ${id}`);
    assert.ok(cats[id].name_he, `${id} missing name_he`);
    assert.ok(cats[id].name_en, `${id} missing name_en`);
    assert.ok(cats[id].description_he, `${id} missing description_he`);
    assert.ok(cats[id].description_en, `${id} missing description_en`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
//  2. Essential always-on invariant
// ───────────────────────────────────────────────────────────────────────────
test('02 — essential category is always defaultOn=true, even after user override', () => {
  const cb = freshBanner();
  const attempted = cb.defineCategories({
    essential: { defaultOn: false }, // user tries to disable — ignored
    analytics: { defaultOn: true }, // user tries to pre-check — ignored
    marketing: {},
    personalization: {},
    thirdParty: {},
  });
  assert.equal(attempted.essential.defaultOn, true);
  assert.equal(attempted.essential.required, true);
  // Non-essential silently corrected to false (EDPB 05/2020).
  assert.equal(attempted.analytics.defaultOn, false);
});

// ───────────────────────────────────────────────────────────────────────────
//  3. Bilingual RTL banner generation
// ───────────────────────────────────────────────────────────────────────────
test('03 — generateBanner produces bilingual RTL output for primaryLang=he', () => {
  const cb = freshBanner();
  const { html, css, config } = cb.generateBanner({
    primaryLang: 'he',
    layout: 'bottom-bar',
    theme: 'dark',
  });
  assert.equal(config.primaryLang, 'he');
  assert.equal(config.dir, 'rtl');
  assert.ok(html.includes('dir="rtl"'), 'must include dir="rtl"');
  assert.ok(html.includes('lang="he"'), 'must include lang="he"');
  assert.ok(html.includes('lang="en"'), 'must include English labels');
  assert.ok(
    html.includes('אנחנו משתמשים בעוגיות'),
    'must include Hebrew title'
  );
  assert.ok(html.includes('We use cookies'), 'must include English title');
  assert.ok(css.length > 0, 'inline CSS must be non-empty');
  assert.ok(!css.includes('@import'), 'must not import external CSS');
});

// ───────────────────────────────────────────────────────────────────────────
//  4. Dark pattern guard — accept and reject button parity
// ───────────────────────────────────────────────────────────────────────────
test('04 — generated banner has equal button dimensions (EDPB parity)', () => {
  const cb = freshBanner();
  const { config } = cb.generateBanner({});
  const d = config.buttonDimensions;
  assert.equal(
    d.acceptWidth,
    d.rejectWidth,
    'accept and reject widths must be identical'
  );
  assert.equal(
    d.acceptHeight,
    d.rejectHeight,
    'accept and reject heights must be identical'
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  5. Dark pattern refusal — accept twice as big as reject
// ───────────────────────────────────────────────────────────────────────────
test('05 — validateCompliance refuses dark pattern (accept 2x reject)', () => {
  const cb = freshBanner();
  const darkPatternConfig = {
    hasPolicyLink: true,
    hasWithdrawalMechanism: true,
    buttonDimensions: {
      acceptWidth: 320, // 2x wider
      acceptHeight: 44,
      rejectWidth: 160,
      rejectHeight: 44,
    },
  };
  const result = cb.validateCompliance(darkPatternConfig);
  assert.equal(result.valid, false, 'dark pattern config must be invalid');
  const violation = result.violations.find(
    (v) => v.code === 'dark-pattern-button-size'
  );
  assert.ok(violation, 'must flag dark-pattern-button-size violation');
  assert.ok(violation.ratio > 1.5, 'ratio must be computed and > 1.5');
});

// ───────────────────────────────────────────────────────────────────────────
//  6. validateCompliance accepts a compliant config
// ───────────────────────────────────────────────────────────────────────────
test('06 — validateCompliance accepts a compliant banner config', () => {
  const cb = freshBanner();
  const { config } = cb.generateBanner({ primaryLang: 'he' });
  const result = cb.validateCompliance(config);
  assert.equal(
    result.valid,
    true,
    `compliant config should be valid, violations: ${JSON.stringify(
      result.violations
    )}`
  );
  assert.equal(result.checks.essentialPrechecked, true);
  assert.equal(result.checks.nonEssentialDefaultOff, true);
  assert.equal(result.checks.withdrawalMechanism, true);
  assert.equal(result.checks.policyLink, true);
  assert.equal(result.checks.buttonParity, true);
  assert.equal(result.checks.fiveCategories, true);
});

// ───────────────────────────────────────────────────────────────────────────
//  7. recordConsent — PII hashing
// ───────────────────────────────────────────────────────────────────────────
test('07 — recordConsent hashes IP and user-agent, never stores plaintext', () => {
  const cb = freshBanner();
  const rec = cb.recordConsent({
    sessionId: 'sess-123',
    categories: { analytics: true, marketing: false },
    ip: '192.0.2.55',
    userAgent: 'Mozilla/5.0 (compatible; UziBot/1.0)',
  });
  assert.ok(rec.ipHash, 'ipHash present');
  assert.notEqual(rec.ipHash, '192.0.2.55', 'IP must be hashed');
  assert.equal(rec.ipHash.length, 64, 'SHA-256 hex');
  assert.ok(rec.userAgentHash, 'ua hash present');
  assert.equal(rec.categories.essential, true, 'essential forced true');
  assert.equal(rec.categories.analytics, true);
  assert.equal(rec.categories.marketing, false);
  assert.ok(rec.hash, 'record has chain hash');
  assert.ok(rec.prevHash, 'record has previous hash');
});

// ───────────────────────────────────────────────────────────────────────────
//  8. Cookie scanner — GTM + FB pixel + Hotjar
// ───────────────────────────────────────────────────────────────────────────
test('08 — scanCookies detects GTM, Facebook pixel, and Hotjar', () => {
  const cb = freshBanner();
  const html = `
    <!DOCTYPE html><html><head>
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"></script>
    <script>fbq('init','123'); fbq('track','PageView');</script>
    <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
    </head><body></body></html>
  `;
  const cookies = cb.scanCookies(html);
  const names = cookies.map((c) => c.name);
  assert.ok(names.includes('_ga'), 'must detect _ga');
  assert.ok(names.includes('_fbp'), 'must detect _fbp');
  assert.ok(names.includes('_hjid'), 'must detect _hjid');

  const ga = cookies.find((c) => c.name === '_ga');
  assert.equal(ga.category, 'analytics');
  const fbp = cookies.find((c) => c.name === '_fbp');
  assert.equal(fbp.category, 'marketing');
});

// ───────────────────────────────────────────────────────────────────────────
//  9. categorizeCookie — exact lookups
// ───────────────────────────────────────────────────────────────────────────
test('09 — categorizeCookie classifies common cookies correctly', () => {
  const cb = freshBanner();
  assert.equal(cb.categorizeCookie('_ga'), 'analytics');
  assert.equal(cb.categorizeCookie('_gid'), 'analytics');
  assert.equal(cb.categorizeCookie('_fbp'), 'marketing');
  assert.equal(cb.categorizeCookie('fr'), 'marketing');
  assert.equal(cb.categorizeCookie('PHPSESSID'), 'essential');
  assert.equal(cb.categorizeCookie('connect.sid'), 'essential');
  assert.equal(cb.categorizeCookie('lang'), 'personalization');
  assert.equal(cb.categorizeCookie('NID'), 'thirdParty');
  // Prefix rule
  assert.equal(cb.categorizeCookie('_ga_ABC123'), 'analytics');
  assert.equal(cb.categorizeCookie('_gcl_aw'), 'marketing');
  // Unknown
  assert.equal(cb.categorizeCookie('totally_made_up_xyz'), 'unknown');
});

// ───────────────────────────────────────────────────────────────────────────
//  10. withdrawConsent preserves the prior consent log
// ───────────────────────────────────────────────────────────────────────────
test('10 — withdrawConsent appends without deleting prior records', () => {
  const cb = freshBanner();
  const r1 = cb.recordConsent({
    sessionId: 'sess-A',
    categories: { analytics: true, marketing: true },
  });
  const r2 = cb.withdrawConsent('sess-A', ['marketing']);
  const history = cb.consentHistory('sess-A');
  assert.equal(history.length, 2, 'history must contain 2 events');
  assert.equal(history[0].id, r1.id, 'original consent preserved');
  assert.equal(history[1].id, r2.id, 'withdrawal appended');
  assert.equal(history[1].kind, 'withdrawal');
  // Chain still valid
  const chain = cb.verifyChain();
  assert.equal(chain.valid, true, 'chain must be valid');

  // Current fold reflects withdrawal
  const current = cb.currentConsent('sess-A');
  assert.equal(current.analytics, true, 'analytics still granted');
  assert.equal(current.marketing, false, 'marketing withdrawn');
  assert.equal(current.essential, true);
});

// ───────────────────────────────────────────────────────────────────────────
//  11. withdrawConsent refuses essential withdrawal
// ───────────────────────────────────────────────────────────────────────────
test('11 — withdrawConsent refuses to withdraw essential cookies', () => {
  const cb = freshBanner();
  cb.recordConsent({
    sessionId: 'sess-X',
    categories: { analytics: true },
  });
  assert.throws(
    () => cb.withdrawConsent('sess-X', ['essential']),
    /essential cookies cannot be withdrawn/
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  12. generateCookiePolicy — bilingual, both tones
// ───────────────────────────────────────────────────────────────────────────
test('12 — generateCookiePolicy returns bilingual text in both tones', () => {
  const cb = freshBanner();
  const formal = cb.generateCookiePolicy({ tone: 'formal', lang: 'he' });
  assert.equal(formal.tone, 'formal');
  assert.ok(formal.he.includes('מדיניות עוגיות'));
  assert.ok(formal.en.includes('Cookie Policy'));
  assert.ok(formal.he.includes('תיקון 13'), 'must cite Amendment 13');
  assert.ok(formal.en.includes('Amendment 13'), 'must cite Amendment 13');
  assert.ok(
    formal.he.includes('privacy@technokoluzi.co.il'),
    'must include DPO email'
  );

  const friendly = cb.generateCookiePolicy({ tone: 'friendly', lang: 'en' });
  assert.equal(friendly.tone, 'friendly');
  assert.ok(friendly.en.includes('Hello and welcome'));
  assert.ok(friendly.he.includes('שלום וברוכים הבאים'));
});

// ───────────────────────────────────────────────────────────────────────────
//  13. All 4 layouts render successfully
// ───────────────────────────────────────────────────────────────────────────
test('13 — all 4 layouts (bottom-bar|modal|top-bar|corner) generate valid HTML', () => {
  const cb = freshBanner();
  for (const layout of LAYOUTS) {
    const { html, config } = cb.generateBanner({ layout, primaryLang: 'he' });
    assert.equal(config.layout, layout);
    assert.ok(
      html.includes(`data-layout="${layout}"`),
      `must include data-layout="${layout}"`
    );
    assert.ok(
      html.includes('cb-btn-accept'),
      `${layout} must have accept button`
    );
    assert.ok(
      html.includes('cb-btn-reject'),
      `${layout} must have reject button`
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
//  14. Theme variations
// ───────────────────────────────────────────────────────────────────────────
test('14 — all 3 themes (dark|light|custom) produce distinct palettes', () => {
  const cb = freshBanner();
  const dark = cb.generateBanner({ theme: 'dark' });
  const light = cb.generateBanner({ theme: 'light' });
  const custom = cb.generateBanner({
    theme: 'custom',
    custom: { bg: '#FF00FF', fg: '#00FFFF' },
  });
  assert.notEqual(
    dark.css,
    light.css,
    'dark and light CSS must differ'
  );
  assert.ok(custom.css.includes('#FF00FF'), 'custom bg must be applied');
  assert.ok(custom.css.includes('#00FFFF'), 'custom fg must be applied');
});

// ───────────────────────────────────────────────────────────────────────────
//  15. exportConsentLog — DSR-compatible (Y-136 integration)
// ───────────────────────────────────────────────────────────────────────────
test('15 — exportConsentLog produces DSR-compatible audit export', () => {
  const cb = freshBanner();
  cb.recordConsent({ sessionId: 'sess-1', categories: { analytics: true } });
  cb.recordConsent({
    sessionId: 'sess-2',
    categories: { marketing: true, personalization: true },
  });
  cb.withdrawConsent('sess-1', ['analytics']);

  const exp = cb.exportConsentLog({ from: 0, to: Date.now() + 1000 });
  assert.equal(exp.schemaVersion, '1.0');
  assert.equal(exp.eventCount, 3);
  assert.equal(exp.chainValid, true);
  assert.ok(Array.isArray(exp.events));
  assert.ok(exp.events.every((e) => e.hash && e.prevHash));
  assert.ok(exp.events.some((e) => e.kind === 'withdrawal'));
  assert.ok(exp.generatedAt);
  assert.ok(exp.controller_he);
});

// ───────────────────────────────────────────────────────────────────────────
//  16. validateCompliance — missing policy link
// ───────────────────────────────────────────────────────────────────────────
test('16 — validateCompliance flags missing policy link and missing withdrawal', () => {
  const cb = freshBanner();
  const bad = {
    hasPolicyLink: false,
    hasWithdrawalMechanism: false,
    buttonDimensions: {
      acceptWidth: 160,
      acceptHeight: 44,
      rejectWidth: 160,
      rejectHeight: 44,
    },
  };
  const res = cb.validateCompliance(bad);
  assert.equal(res.valid, false);
  assert.ok(res.violations.some((v) => v.code === 'no-policy-link'));
  assert.ok(res.violations.some((v) => v.code === 'no-withdrawal-mechanism'));
});

// ───────────────────────────────────────────────────────────────────────────
//  17. Hash chain integrity
// ───────────────────────────────────────────────────────────────────────────
test('17 — hash chain is valid after multiple events', () => {
  const cb = freshBanner();
  for (let i = 0; i < 12; i++) {
    cb.recordConsent({
      sessionId: 'sess-loop-' + (i % 3),
      categories: {
        analytics: i % 2 === 0,
        marketing: i % 3 === 0,
      },
    });
  }
  cb.withdrawConsent('sess-loop-0', ['analytics']);
  cb.withdrawConsent('sess-loop-1', ['marketing']);
  const chain = cb.verifyChain();
  assert.equal(chain.valid, true);
  assert.equal(chain.brokenAt, null);
});

// ───────────────────────────────────────────────────────────────────────────
//  18. HTML escaping — XSS safety
// ───────────────────────────────────────────────────────────────────────────
test('18 — generated banner escapes HTML in category definitions', () => {
  const cb = freshBanner();
  cb.defineCategories({
    essential: {},
    analytics: {
      name_he: '<script>alert(1)</script>',
      name_en: 'Analytics & Co.',
      description_he: 'תיאור',
      description_en: '"quoted" & <tag>',
    },
    marketing: {},
    personalization: {},
    thirdParty: {},
  });
  const { html } = cb.generateBanner({});
  assert.ok(
    !html.includes('<script>alert(1)</script>'),
    'must escape script tags'
  );
  assert.ok(
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'script must be escaped'
  );
  assert.ok(html.includes('Analytics &amp; Co.'), 'ampersand escaped');
  assert.ok(html.includes('&quot;quoted&quot;'), 'quotes escaped');
});

// ───────────────────────────────────────────────────────────────────────────
//  19. Currents consent fold — no prior events
// ───────────────────────────────────────────────────────────────────────────
test('19 — currentConsent returns essential-only fold for unknown session', () => {
  const cb = freshBanner();
  const state = cb.currentConsent('unknown-session');
  assert.equal(state.essential, true);
  assert.equal(state.analytics, false);
  assert.equal(state.marketing, false);
  assert.equal(state.personalization, false);
  assert.equal(state.thirdParty, false);
});

// ───────────────────────────────────────────────────────────────────────────
//  20. exportConsentLog honors time window
// ───────────────────────────────────────────────────────────────────────────
test('20 — exportConsentLog filters by period window', () => {
  const cb = freshBanner();
  const past = Date.now() - 1_000_000;
  cb.recordConsent({
    sessionId: 'old-sess',
    categories: { analytics: true },
    timestamp: past,
  });
  cb.recordConsent({
    sessionId: 'new-sess',
    categories: { marketing: true },
  });
  const onlyNew = cb.exportConsentLog({ from: Date.now() - 60_000 });
  assert.equal(
    onlyNew.eventCount,
    1,
    'only recent event in window'
  );
  assert.equal(onlyNew.events[0].sessionId, 'new-sess');

  const onlyOld = cb.exportConsentLog({
    from: past - 1000,
    to: past + 1000,
  });
  assert.equal(onlyOld.eventCount, 1);
  assert.equal(onlyOld.events[0].sessionId, 'old-sess');
});

// ───────────────────────────────────────────────────────────────────────────
//  21. Banner includes policy link and withdrawal note
// ───────────────────────────────────────────────────────────────────────────
test('21 — banner HTML includes policy link and withdrawal note (bilingual)', () => {
  const cb = freshBanner();
  const { html } = cb.generateBanner({ primaryLang: 'he' });
  assert.ok(
    html.includes('/privacy/cookies'),
    'must include policy URL'
  );
  assert.ok(
    html.includes('cb-policy-link'),
    'must include policy link element'
  );
  assert.ok(
    html.includes('ניתן למשוך את ההסכמה'),
    'must include Hebrew withdrawal note'
  );
  assert.ok(
    html.includes('withdraw consent at any time'),
    'must include English withdrawal note'
  );
  assert.ok(
    html.includes('privacy@technokoluzi.co.il'),
    'must include DPO email'
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  22. scanCookies detects document.cookie assignments and Set-Cookie headers
// ───────────────────────────────────────────────────────────────────────────
test('22 — scanCookies detects inline document.cookie and Set-Cookie headers', () => {
  const cb = freshBanner();
  const html = `
    <html><body>
      <script>document.cookie = "custom_pref=dark;path=/";</script>
      <!-- Set-Cookie: PHPSESSID=abc123; Path=/ -->
    </body></html>
  `;
  const cookies = cb.scanCookies(html);
  const names = cookies.map((c) => c.name);
  assert.ok(names.includes('custom_pref'), 'detect inline document.cookie');
  assert.ok(names.includes('PHPSESSID'), 'detect Set-Cookie header comment');
  const sess = cookies.find((c) => c.name === 'PHPSESSID');
  assert.equal(sess.category, 'essential');
});
