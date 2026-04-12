# AG-Y139 — Cookie Banner & Consent Gate / באנר עוגיות ושער הסכמה

**Status:** PASS (22/22 tests green)
**Date:** 2026-04-11
**Agent:** Y-139
**Module:** `onyx-procurement/src/privacy/cookie-banner.js`
**Tests:** `onyx-procurement/test/privacy/cookie-banner.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)
**External deps:** 0 (only `node:crypto`)

---

## 1. Purpose / מטרה

**EN.** A cookie-banner + consent-gate generator for Israeli websites. Produces self-contained HTML + inline CSS (no external fonts, no external CSS, no external JS), enforces EDPB dark-pattern rules, keeps an append-only hash-chained consent log, and exports in a DSR-compatible schema that plugs into Agent Y-136 (DSR Handler).

**HE.** מחולל באנר עוגיות ושער-הסכמה לאתרי אינטרנט ישראליים. מייצר HTML עצמאי עם CSS מוטבע (ללא גופנים חיצוניים, ללא CSS חיצוני, ללא JS חיצוני), אוכף את כללי ה-EDPB נגד Dark Patterns, שומר יומן הסכמות בשרשרת-hash ב-append-only בלבד, ומייצא בתבנית DSR תואמת ל-Agent Y-136 (מטפל בקשות נושא מידע).

---

## 2. Bilingual Category Taxonomy / טקסונומיית קטגוריות דו-לשונית

The banner enforces a strict 5-category taxonomy. Adding a 6th category requires a new agent ticket (category IDs are frozen in `CATEGORY_IDS`).

| ID | Hebrew | English | Default | Legal basis | Typical cookies |
|---|---|---|---|---|---|
| `essential` | עוגיות חיוניות | Essential cookies | **ON** (required) | אינטרס לגיטימי · Art. 6(1)(f) | `PHPSESSID`, `JSESSIONID`, `csrf_token`, `XSRF-TOKEN`, `connect.sid`, `cart` |
| `analytics` | עוגיות אנליטיקה | Analytics cookies | OFF | הסכמה מפורשת · Art. 6(1)(a) | `_ga`, `_gid`, `_gat`, `_ga_*`, `_hjid`, `__utm*`, `_hjSessionUser` |
| `marketing` | עוגיות שיווק | Marketing cookies | OFF | הסכמה מפורשת · Art. 6(1)(a) | `_fbp`, `_fbc`, `fr`, `IDE`, `_gcl_au`, `MUID`, `_pin_*`, `__gads` |
| `personalization` | עוגיות התאמה אישית | Personalization | OFF | הסכמה מפורשת · Art. 6(1)(a) | `lang`, `locale`, `theme`, `currency`, `recentViewed`, `wp-settings-*` |
| `thirdParty` | עוגיות צד שלישי | Third-party cookies | OFF | הסכמה מפורשת · Art. 6(1)(a) | `NID`, `VISITOR_INFO1_LIVE`, `YSC`, `bcookie`, `lidc`, `CONSENT` |

**Invariant (enforced in `defineCategories`):**
- `essential.defaultOn` is **hard-coded true**. Any attempt to set it false is silently overridden.
- All non-essential categories are **hard-coded `defaultOn=false`**. Any attempt to pre-check them is silently overridden (and would also be caught by `validateCompliance`).

---

## 3. Dark-Pattern Rules (EDPB 03/2022) / כללים נגד הטיית עיצוב

The EDPB's "Deceptive Design Patterns in Social Media Platform Interfaces" guidelines (03/2022) are binding reference for any DPA in the EEA, and the Israeli Privacy Protection Authority cites them as best practice. Y-139 enforces the following:

### 3.1 Equal visual prominence (§3.1 "Equal footing")

| Property | Accept | Reject | Rule |
|---|---|---|---|
| Width  | `160px` | `160px` | MUST be identical (tolerance 5%) |
| Height | `44px`  | `44px`  | MUST be identical (tolerance 5%) |
| Font size | `16px` | `16px` | MUST be identical |
| Font weight | `600` | `600` | MUST be identical |
| Background color | same | same | MUST be identical |
| Border | same | same | MUST be identical |
| Position weight | equal | equal | Both inside `.cb-actions` flexbox, same order-weight |

`validateCompliance({ buttonDimensions })` computes the area ratio `max(aArea, rArea) / min(aArea, rArea)`. If the ratio exceeds `1.05`, the config fails with violation code `dark-pattern-button-size` and the computed ratio is returned to the caller. Test 05 verifies this with a 2× accept button.

### 3.2 No confirm-shaming

The banner copy is deliberately neutral. No emotionally-loaded phrases like "Do you hate improvements?" or "No thanks, I don't want a better experience." Both buttons use short, symmetric language:

- HE: "קבל הכול" / "דחה הכול" / "שמור בחירה"
- EN: "Accept all" / "Reject all" / "Save selection"

### 3.3 No pre-ticked boxes (EDPB 05/2020 + Planet49 CJEU C-673/17)

Non-essential checkboxes are rendered with `data-default="false"` and NO `checked` attribute. `defineCategories` silently corrects any attempt to pre-check non-essential boxes.

### 3.4 No bundled consent

Each category has its own checkbox. The "Accept all" button is a convenience, not a bundling — the user can always open the `<details>` section and granularly toggle.

### 3.5 Policy link prominently displayed

A link to the full cookie policy MUST be inside the banner DOM, not buried in the footer. `validateCompliance` flags `no-policy-link` if absent.

### 3.6 Withdrawal mechanism advertised

The banner MUST advertise how to withdraw consent later (settings page + DPO email). `validateCompliance` flags `no-withdrawal-mechanism` if absent.

---

## 4. EDPB + PDPL Compliance Matrix / טבלת תאימות

| Requirement | Source | Y-139 enforcement |
|---|---|---|
| Freely given consent | GDPR Art. 4(11), 7(4) | "Reject all" is equally prominent as "Accept all" |
| Specific consent | GDPR Art. 6(1)(a) | 5 categories, each togglable separately |
| Informed consent | GDPR Art. 13 | Bilingual description under each category + link to full policy |
| Unambiguous consent | GDPR Art. 4(11) | Checkbox click = unambiguous action; no implied consent from scrolling |
| Non-essential default OFF | EDPB 05/2020 + Planet49 | Hard-coded in `defineCategories` |
| Withdrawable at any time | GDPR Art. 7(3) | `withdrawConsent()` + advertised in banner |
| Withdrawal as easy as giving | GDPR Art. 7(3) | Same modal, same buttons |
| Equal-footing design | EDPB 03/2022 §3.1 | Button parity enforced by `validateCompliance` |
| Israeli consent basis | תיקון 13, סעיף 23 | Same consent model, bilingual text |
| PDPL DPO contact in banner | תיקון 13, סעיף 17ב | `dpoEmail` rendered in withdrawal note |
| Audit trail of consent | GDPR Art. 7(1), תיקון 13 | Hash-chained append-only log + `verifyChain()` |
| Access to consent record | GDPR Art. 15, תיקון 13 סעיף 13 | `exportConsentLog()` in DSR-compatible schema (Y-136) |
| PII minimization | GDPR Art. 5(1)(c) | IP and user-agent hashed with SHA-256 before storage |
| ePrivacy Directive compliance | Dir 2002/58/EC Art. 5(3) | Banner shown before any non-essential cookie is set |

---

## 5. Public API / ממשק ציבורי

```js
const { CookieBanner } = require('./src/privacy/cookie-banner.js');

const cb = new CookieBanner({
  siteName: 'Techno-Kol Uzi',
  siteName_he: 'טכנו-קול עוזי',
  policyUrl: '/privacy/cookies',
  dpoEmail: 'privacy@technokoluzi.co.il',
  controller: 'Techno-Kol Uzi Ltd.',
  controller_he: 'טכנו-קול עוזי בע״מ',
});

// 1. Define the taxonomy (optional — sensible defaults are built-in).
cb.defineCategories({
  essential: { name_he: '...', description_he: '...' },
  analytics: { name_he: '...', description_he: '...' },
  marketing: { name_he: '...', description_he: '...' },
  personalization: { name_he: '...', description_he: '...' },
  thirdParty: { name_he: '...', description_he: '...' },
});

// 2. Generate the banner (HTML + inline CSS, no external deps).
const { html, css, config } = cb.generateBanner({
  primaryLang: 'he',          // 'he' | 'en'
  layout: 'bottom-bar',       // 'bottom-bar' | 'modal' | 'top-bar' | 'corner'
  theme: 'dark',              // 'dark' | 'light' | 'custom'
  custom: { bg: '#0B0F1A' },  // optional, only when theme === 'custom'
});

// 3. Record user consent (PII is hashed immediately).
const record = cb.recordConsent({
  sessionId: 'sess-abc123',
  categories: { analytics: true, marketing: false },
  ip: '192.0.2.55',            // hashed to ipHash
  userAgent: 'Mozilla/5.0 ...', // hashed to userAgentHash
  source: 'banner',
  policyVersion: '1.0',
});

// 4. Fetch current fold of consent history.
const state = cb.currentConsent('sess-abc123');
// => { essential:true, analytics:true, marketing:false, personalization:false, thirdParty:false }

// 5. Withdrawal — never deletes, only appends.
cb.withdrawConsent('sess-abc123', ['analytics']);

// 6. Audit trail.
cb.consentHistory('sess-abc123');   // append-only, frozen snapshot
cb.verifyChain();                   // { valid: true, brokenAt: null }

// 7. DSR export (integrates with Y-136).
const exp = cb.exportConsentLog({ from: '2026-01-01', to: '2026-12-31' });
// => { schemaVersion, generatedAt, events[], chainValid, ... }

// 8. Static page scanner.
cb.scanCookies(htmlSource);         // returns [{ name, category, source }, ...]
cb.categorizeCookie('_ga');         // => 'analytics'
cb.categorizeCookie('_fbp');        // => 'marketing'
cb.categorizeCookie('PHPSESSID');   // => 'essential'

// 9. Policy document generator.
cb.generateCookiePolicy({ tone: 'formal', lang: 'he' });
// => { he, en, primary, alternate, tone, generated }

// 10. Compliance validation (checks dark-pattern rules).
cb.validateCompliance(config);
// => { valid, violations, warnings, checks }
```

---

## 6. Layouts / פריסות

| Layout | HE | Use case |
|---|---|---|
| `bottom-bar` | פס תחתון | Default; full-width bar anchored to `bottom: 0` |
| `top-bar` | פס עליון | Full-width bar anchored to `top: 0` |
| `modal` | חלון צף | Centered overlay, up to 720px wide, 92vw on mobile |
| `corner` | פינה | 440px card anchored to bottom-inline-end (RTL-aware) |

All 4 layouts share the same DOM structure and CSS classes; only `data-layout` attribute differs. This guarantees that testing one layout validates the button-parity rule for all four.

---

## 7. Themes / ערכות נושא

| Theme | bg | fg | Accent |
|---|---|---|---|
| `dark` (default) | `#0B0F1A` (Palantir-dark) | `#F3F4F6` | `#2563EB` |
| `light` | `#FFFFFF` | `#111827` | `#2563EB` |
| `custom` | caller-supplied | caller-supplied | caller-supplied |

Custom themes pass a palette object (`{ bg, fg, border, btnBg, btnFg, btnBorder, link, focus }`). The parity and color-contrast rules are preserved regardless of theme.

---

## 8. Cookie Catalog Scanner / סורק קטלוג עוגיות

Rule-based detection with no ML, no external APIs. Rules:

1. **Exact name lookup** in `COOKIE_CATALOG` (60+ known names).
2. **Prefix rules** in `COOKIE_PATTERN_RULES` (13 patterns: `_ga_*`, `_gcl_*`, `_hj*`, `__utm*`, `AMP_*`, `ajs_*`, `mp_*`, `_pin_*`, `_ttp*`, `wordpress_logged_in_*`, `wp-settings-*`, etc.).
3. **Heuristic keywords**: `session`/`sid`/`csrf` → essential; `lang`/`locale`/`theme` → personalization.
4. **Script-src inference**: loads from `googletagmanager.com`, `google-analytics.com`, `connect.facebook.net`, `hotjar.com`, `licdn.com`, `linkedin.com`, `youtube.com`, `twitter.com`/`t.co` map to known cookies.
5. **Inline markers**: `gtag(`, `fbq(`, `hotjar`, `<iframe src="youtube.com/embed">`, `linkedin.com/insight`.
6. **Server markers**: `document.cookie=` assignments, `Set-Cookie:` header comments in rendered HTML.
7. **Fallback**: `unknown` (NEVER silently categorized — forces caller to classify manually or add to catalog).

---

## 9. Append-Only Consent Log / יומן הסכמות בלבד

Every call to `recordConsent` or `withdrawConsent` appends a new event to `_consentLog`. Events are never deleted. Each event contains:

```
{
  id:           'ccnt_<timestamp36>_<random12>',
  kind:         'consent' | 'withdrawal',
  sessionId:    '<caller-supplied>',
  categories:   <granular per-category state>,
  timestamp:    <ms>,
  recordedAt:   <ISO string>,
  ipHash:       <SHA-256 hex, or null>,
  userAgentHash:<SHA-256 hex, or null>,
  policyVersion:'1.0',
  prevHash:     <hash of prior event>,
  hash:         <SHA-256 of this event's payload>,
}
```

`verifyChain()` walks the log, recomputes each hash, and returns `{ valid, brokenAt }`. Test 17 drives 14 events through the chain and verifies.

### Why append-only?

The house rule is "לא מוחקים רק משדרגים ומגדלים". Consent withdrawal without deletion is the correct compliance posture:

- GDPR Art. 7(1): controller must be able to demonstrate that consent was given. You cannot demonstrate something you deleted.
- GDPR Art. 7(3): withdrawal shall not affect the lawfulness of prior processing. You need the prior record to prove that lawfulness.
- PDPL תיקון 13 §17ה: the controller must maintain an audit record for 3 years after the relationship ends.
- The "current state" is always derivable as the fold of the full history → `currentConsent(sessionId)`.

---

## 10. Integration with Y-136 (DSR Handler) / שילוב עם Y-136

`exportConsentLog({from, to})` emits a `{schemaVersion: '1.0', events: [...]}` structure whose event entries are a strict subset of the Y-136 access-request export schema. When a subject invokes GDPR Art. 15 / תיקון 13 סעיף 13 (right of access), the DSR handler can call:

```js
const cookieTrail = cookieBanner.exportConsentLog({
  from: request.subjectFirstSeenAt,
  to:   request.receivedAt,
});
dsrExport.consent = cookieTrail.events;
```

…and the entire cookie-consent lifecycle is folded into the subject's access packet without any ETL.

---

## 11. Hebrew Glossary / מילון מונחים עברי

| English | Hebrew | Notes |
|---|---|---|
| Cookie | עוגייה · עוגיה | The Academy of the Hebrew Language accepts both spellings; ISO 27701 translations use "עוגייה". |
| Cookie banner | באנר עוגיות · שער הסכמה | |
| Consent | הסכמה | |
| Explicit consent | הסכמה מפורשת | Required for non-essential cookies |
| Implicit consent | הסכמה משתמעת | Forbidden for non-essential — Planet49 CJEU C-673/17 |
| Withdrawal | משיכה · ביטול הסכמה | GDPR Art. 7(3) / PDPL §23 |
| Data subject | נושא המידע | |
| Data controller | בקר המידע · אחראי בקרת המידע | PDPL §17 |
| Data protection officer | ממונה הגנה על מידע | תיקון 13 |
| Privacy by default | פרטיות כברירת מחדל | GDPR Art. 25 |
| Dark patterns | הטיית עיצוב · עיצוב מטעה | EDPB 03/2022 |
| Audit log | יומן ביקורת | |
| Append-only | הוספה בלבד · ללא מחיקה | |
| Hash chain | שרשרת hash | SHA-256 chained |
| Session ID | מזהה שיחה · מזהה הפעלה | |
| IP hash | טביעת IP | SHA-256 of the IP address |
| User agent | סוכן משתמש | Browser identifier |
| Essential cookies | עוגיות חיוניות | Required, always-on |
| Analytics cookies | עוגיות אנליטיקה | Measurement |
| Marketing cookies | עוגיות שיווק | Advertising |
| Personalization cookies | עוגיות התאמה אישית | Preferences |
| Third-party cookies | עוגיות צד שלישי | External services |
| Policy version | גרסת מדיניות | |
| Retention period | תקופת שמירה | Statutory minimums win |
| Israeli Privacy Act | חוק הגנת הפרטיות, התשמ״א–1981 | As amended by תיקון 13 |
| Amendment 13 | תיקון 13 | In force 14/08/2024 |
| Privacy Protection Authority | הרשות להגנת הפרטיות | Regulator |

---

## 12. Test Results / תוצאות בדיקות

```
$ cd onyx-procurement
$ node --test test/privacy/cookie-banner.test.js
✔ 01 — defineCategories yields all 5 required categories
✔ 02 — essential category is always defaultOn=true, even after user override
✔ 03 — generateBanner produces bilingual RTL output for primaryLang=he
✔ 04 — generated banner has equal button dimensions (EDPB parity)
✔ 05 — validateCompliance refuses dark pattern (accept 2x reject)
✔ 06 — validateCompliance accepts a compliant banner config
✔ 07 — recordConsent hashes IP and user-agent, never stores plaintext
✔ 08 — scanCookies detects GTM, Facebook pixel, and Hotjar
✔ 09 — categorizeCookie classifies common cookies correctly
✔ 10 — withdrawConsent appends without deleting prior records
✔ 11 — withdrawConsent refuses to withdraw essential cookies
✔ 12 — generateCookiePolicy returns bilingual text in both tones
✔ 13 — all 4 layouts (bottom-bar|modal|top-bar|corner) generate valid HTML
✔ 14 — all 3 themes (dark|light|custom) produce distinct palettes
✔ 15 — exportConsentLog produces DSR-compatible audit export
✔ 16 — validateCompliance flags missing policy link and missing withdrawal
✔ 17 — hash chain is valid after multiple events
✔ 18 — generated banner escapes HTML in category definitions
✔ 19 — currentConsent returns essential-only fold for unknown session
✔ 20 — exportConsentLog filters by period window
✔ 21 — banner HTML includes policy link and withdrawal note (bilingual)
✔ 22 — scanCookies detects inline document.cookie and Set-Cookie headers
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

---

## 13. House Rule Compliance / תאימות לכלל הבית

| Rule | Status | Evidence |
|---|---|---|
| "לא מוחקים רק משדרגים ומגדלים" | PASS | `withdrawConsent` appends a new event; prior records preserved. Test 10 verifies both events are present after withdrawal. |
| Zero external deps | PASS | Only `node:crypto` (built-in). `package.json` of `onyx-procurement` not modified. |
| Hebrew RTL | PASS | `dir="rtl"` set on root; all Hebrew strings tagged `lang="he"`; English tagged `lang="en"` with `dir="ltr"`. |
| Bilingual labels | PASS | Every category has `name_he`, `name_en`, `description_he`, `description_en`. Every button and link rendered in both languages. |
| PDPL + GDPR | PASS | Table in §4 above. |

---

## 14. Known Limitations / מגבלות ידועות

1. **In-memory storage** — consent log resets on process restart. Production integrator should persist `_consentLog` to the Y-136 chain-of-custody store (already compatible with the SHA-256 chain format).
2. **Static scanner** — `scanCookies` is rule-based and covers the ~80% of cookies seen on Israeli sites. It does not execute JavaScript, so cookies set by heavy SPAs after runtime DOM mutation may be missed. Workaround: feed the final rendered HTML from a headless browser.
3. **No automatic legal text update** — the statutory references (תיקון 13, GDPR articles) are baked into the policy generator. A future amendment (e.g., תיקון 14) will require an update to `_policyHe` / `_policyEn`.
4. **No translations beyond HE/EN** — Russian, Arabic, and Amharic are intentionally out-of-scope for this agent. Future extension: add an `ar` / `ru` branch in `_getBannerCopy`.

---

## 15. Files / קבצים

- **Module:** `onyx-procurement/src/privacy/cookie-banner.js`
- **Tests:** `onyx-procurement/test/privacy/cookie-banner.test.js`
- **This report:** `_qa-reports/AG-Y139-cookie-banner.md`
- **Integrates with:** `onyx-procurement/src/privacy/dsr-handler.js` (Y-136)

---

**Agent Y-139 — COMPLETE / סיום**
Techno-Kol Uzi mega-ERP — 2026-04-11
