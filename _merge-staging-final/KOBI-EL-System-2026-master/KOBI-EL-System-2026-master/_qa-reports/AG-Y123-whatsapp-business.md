# AG-Y-123 — WhatsApp Business API Adapter
## דוח QA דו-לשוני / Bilingual QA Report

**Agent:** Y-123
**Wave:** Communications — Mega-ERP Techno-Kol Uzi (ONYX procurement layer)
**Date:** 2026-04-11
**Branch:** master
**Runtime:** Node 20+ (zero external deps — only `node:https`)
**Module under test:** `onyx-procurement/src/comms/whatsapp-business.js`
**Test file:** `onyx-procurement/test/comms/whatsapp-business.test.js`
**Status:** GREEN — 22 / 22 tests pass

---

## 1. מטרה / Purpose

### עברית
מודול `WhatsAppBusiness` הוא מתאם דור שני לוואטסאפ ביזנס API של Meta Cloud. הוא יושב לצד המודול המקורי `whatsapp.js` — **לא מוחקים — רק משדרגים ומגדלים**. הוא מוסיף:

- מחזור חיים מלא של תבניות מאושרות (submit / approve / send).
- תמיכה בכפתורים ורשימות אינטראקטיביות.
- שרשור מענה בהודעה מקורית (`replyToMessage`).
- אישורי קריאה (`markAsRead`).
- דוחות עלויות יומיים על פי טבלת מחירים של Meta לאזור ישראל.
- ציות מלא להוראות חוק התקשורת (בזק ושידורים) תשמ"ב-1982 סעיף 30א (הודעת פרסומת).

### English
The `WhatsAppBusiness` class is a second-generation adapter for the Meta Cloud WhatsApp Business API. It sits **alongside** the original `whatsapp.js` module — the house rule is *never delete, only upgrade and grow*. It adds:

- Full template lifecycle (submit / approve / send).
- Interactive buttons + lists.
- Thread-reply (`replyToMessage`).
- Read receipts (`markAsRead`).
- Daily cost reporting using the Meta Israel-region rate card.
- Full compliance with Israeli Communications Law §30A (anti-spam).

---

## 2. ממשק ציבורי / Public Interface

| Method / מתודה | Purpose | Window / חלון |
|---|---|---|
| `configure({apiKey, phoneNumberId, businessId, injectTransport?})` | bootstrap credentials + mock transport | — |
| `sendTemplate({to, templateName, lang, variables})` | send an APPROVED template | anytime / בכל עת |
| `sendText({to, message, contextMessageId?})` | free-form text | only inside 24h / רק בתוך 24 שעות |
| `sendMedia({to, type, mediaId, caption})` | image / video / audio / document | inside 24h |
| `sendInteractive({to, type, payload})` | button / list interactive | inside 24h |
| `replyToMessage({to, originalMessageId, message})` | threaded reply | inside 24h |
| `markAsRead(messageId)` | update read receipt | — |
| `templateApproval({name, lang, category, components})` | submit template to Meta | — |
| `webhookHandler(payload)` | parse text / media / status / opt-outs | — |
| `optOut(phone, reason)` | statutory opt-out under §30א | — |
| `rateLimitCheck(phone)` | Meta tier ceiling accounting | — |
| `deliveryReport(msgId)` | queued → sent → delivered → read / failed | — |
| `conversationWindow(phone)` | is the 24-hour session open? | — |
| `dailyCostReport(period)` | Israel region per-conversation pricing | — |

---

## 3. חוק 24 השעות / The 24-Hour Rule

### עברית
חוק "חלון שירות הלקוח" של Meta קובע: לאחר שלקוח פונה אל העסק, נפתח חלון של **24 שעות** בו העסק רשאי לשלוח הודעות חופשיות (טקסט, מדיה, אינטראקטיביות) **ללא תבנית מאושרת**. מחוץ לחלון — **חובה** להשתמש בתבנית מאושרת על ידי Meta.

המודול אוכף זאת באופן אוטומטי:
- `sendText` / `sendMedia` / `sendInteractive` / `replyToMessage` דוחים עם שגיאה אם החלון סגור.
- `sendTemplate` מותר בכל עת (אם התבנית מאושרת).
- כל הודעה נכנסת מהלקוח (`webhookHandler`) מחדשת את החלון.

### English
Meta's "Customer Service Window" rule: once a customer messages the business, a **24-hour window** opens during which the business may send free-form content (text, media, interactive) **without a Meta-approved template**. Outside the window — a template is mandatory.

The adapter enforces this automatically:
- `sendText` / `sendMedia` / `sendInteractive` / `replyToMessage` throw if the window is closed.
- `sendTemplate` is always allowed (if the template is APPROVED).
- Any inbound webhook message refreshes the window.

Constant: `WINDOW_MS = 24 * 60 * 60 * 1000`.

---

## 4. קטגוריות תבניות Meta / Meta Template Categories

| Category | עברית | English | Pricing model |
|---|---|---|---|
| `MARKETING` | שיווק | Promotional / ads / offers | highest per-conversation price |
| `UTILITY` | שירות/עדכון | Account updates, shipping, receipts | mid-tier price |
| `AUTHENTICATION` | אימות | OTP, 2FA, login codes | lowest non-zero price |
| `SERVICE` | שירות-חלון | Free text inside 24h window | free (0 USD) |

The adapter's `TEMPLATE_CATEGORIES` constant covers all four. Every `sendTemplate` call records the pricing category via `_pricingCategoryFromTemplate()` so `dailyCostReport()` can bill correctly.

---

## 5. תעריפים לישראל / Israel Region Pricing

### Source
Meta publishes per-conversation pricing by country region. Israel (IL) regional rates as of the Nov-2025 update:

| Category | USD per conversation |
|---|---|
| Marketing / שיווק | **$0.0353** |
| Utility / שירות | **$0.0160** |
| Authentication / אימות | **$0.0128** |
| Service (within 24h) / שירות | **$0.0000** (free) |

Exposed as the frozen constant `PRICING_ISRAEL_USD` and used internally by `dailyCostReport()`.

### דוגמה / Example

```js
const rpt = wa.dailyCostReport({ from: '2026-04-01', to: '2026-04-30' });
// rpt.currency  === 'USD'
// rpt.region    === 'IL'
// rpt.byCategory.marketing
// rpt.byCategory.utility
// rpt.byDay['2026-04-11']
// rpt.total
```

---

## 6. ציות לחוק התקשורת סעיף 30א / Israeli Anti-Spam Compliance

### עברית
חוק התקשורת (בזק ושידורים) תשמ"ב-1982 סעיף 30א ("חוק הספאם") מחייב:
1. הסכמה מפורשת מראש לקבלת דברי פרסומת.
2. מנגנון הסרה פשוט ומיידי.
3. שמירת לוגים של כל הסרה.

המודול:
- מכיר במילות הסרה בעברית ובאנגלית: `STOP`, `UNSUBSCRIBE`, `עצור`, `הסר`, `ביטול`, `הפסק` ועוד.
- `webhookHandler` מזהה אוטומטית את מילות ההסרה בהודעות נכנסות ומפעיל `optOut()`.
- `optOut()` יוצר רשומה חתומה (append-only) עם הבסיס החוקי: "חוק התקשורת (בזק ושידורים) תשמ\"ב-1982 סעיף 30א".
- כל ניסיון שליחה לאחר הסרה נדחה על ידי `_rejectIfOptedOut()`.

### English
Israeli Communications Law §30A ("the Spam Law") requires:
1. Explicit opt-in before marketing content.
2. A simple, immediate opt-out mechanism.
3. Persistent opt-out logging.

The adapter:
- Recognises opt-out keywords in both languages.
- `webhookHandler` auto-detects inbound opt-out keywords and calls `optOut()`.
- `optOut()` creates an append-only record with the legal citation.
- Every subsequent send attempt for that phone is blocked by `_rejectIfOptedOut()`.

---

## 7. דרגות מגבלות Meta / Meta Rate-Limit Tiers

| Tier | Unique recipients / 24h | Israel typical |
|---|---|---|
| `TIER_250` | 250 | pilot |
| `TIER_1K` | 1,000 | default |
| `TIER_10K` | 10,000 | growing SMB |
| `TIER_100K` | 100,000 | enterprise |
| `TIER_UNLIMITED` | ∞ | verified brand |

`rateLimitCheck(phone)` returns `{tier, limit, used, remaining, allowed}`. `_assertRateLimit()` is invoked inside every send path and throws if the tier ceiling is breached.

---

## 8. מילון מונחים / Hebrew Glossary

| Term (HE) | Term (EN) | Definition |
|---|---|---|
| תבנית / templit | Template | A structured, Meta-approved message type |
| חלון שירות לקוח | Customer service window | 24-hour grace period after inbound message |
| הסרה / מילת עצור | Opt-out / stop keyword | Statutory unsubscribe signal |
| קטגוריית שיחה | Conversation category | Pricing classification: marketing/utility/auth/service |
| דרגת הודעות | Messaging tier | Meta daily recipient ceiling |
| WABA | WhatsApp Business Account | The Meta-side business account ID |
| wamid | WhatsApp message ID | Meta's globally-unique message identifier |
| webhook | Webhook | Inbound event callback from Meta to the business |
| שרשור / הקשר | Context / thread | `context.message_id` for reply-in-thread |
| מדיה | Media | Image, video, audio, document |
| חלון פתוח | Window open | The session is within 24h and free text is allowed |
| append-only | יומן מצטבר | Ledger where no record is ever mutated or deleted |

---

## 9. תוצאות בדיקות / Test Results

```
node --test test/comms/whatsapp-business.test.js
...
ℹ tests 22
ℹ pass  22
ℹ fail  0
```

| # | Test | Status |
|---|---|---|
| 1 | `normalisePhone handles Israeli formats` | pass |
| 2 | `configure() requires credentials and accepts injectTransport` | pass |
| 3 | `templateApproval submits PENDING template` | pass |
| 4 | `sendTemplate refuses if template not approved` | pass |
| 5 | `sendTemplate dispatches when approved` | pass |
| 6 | `sendText refused outside 24h window` | pass |
| 7 | `sendText allowed after inbound opens window` | pass |
| 8 | `conversationWindow() reports session state` | pass |
| 9 | `webhook STOP keyword triggers statutory opt-out` | pass |
| 10 | `opted-out phone cannot receive anything` | pass |
| 11 | `rateLimitCheck returns tier info` | pass |
| 12 | `sendInteractive renders buttons within 24h window` | pass |
| 13 | `sendInteractive renders a list within 24h window` | pass |
| 14 | `webhook parses image media` | pass |
| 15 | `webhook updates delivery status` | pass |
| 16 | `sendMedia delivers an image inside the window` | pass |
| 17 | `replyToMessage adds context.message_id` | pass |
| 18 | `markAsRead appends to read receipts ledger` | pass |
| 19 | `dailyCostReport sums Israel pricing across sends` | pass |
| 20 | `mock transport records every outbound request` | pass |
| 21 | `textContainsOptOut recognises Hebrew + English` | pass |
| 22 | `ledgers are append-only (house rule: לא מוחקים)` | pass |

---

## 10. עמידה בכללים / Rule Compliance

| Rule | Status | Evidence |
|---|---|---|
| לא מוחקים — רק משדרגים ומגדלים | PASS | All storage uses append-only arrays / Maps; `getSends()`, `getTemplates()`, etc. return copies; original `whatsapp.js` untouched. |
| Zero external deps | PASS | Only `node:https` imported. No npm install required. `package.json` untouched. |
| Hebrew RTL + bilingual | PASS | Every public event record carries `labelHe` + `labelEn`. `normalisePhone` handles Hebrew-localised phone strings. `textContainsOptOut` uses `toLocaleLowerCase('he-IL')`. |
| חוק התקשורת §30א | PASS | `optOut()` record stores `legalBasis: 'חוק התקשורת (בזק ושידורים) תשמ"ב-1982 סעיף 30א'`. Any future send to that number is blocked. |
| 24h window enforcement | PASS | `sendText` / `sendMedia` / `sendInteractive` / `replyToMessage` consult `conversationWindow()` and reject if closed. `sendTemplate` bypasses the window (as Meta allows). |
| Template must be approved | PASS | `sendTemplate` rejects unless `tpl.status === APPROVED`. |
| Mock transport for tests | PASS | `injectTransport` option accepted by `configure()`; `defaultMockTransport` exported for ad-hoc use. |
| ≥ 18 tests | PASS | 22 tests, all green. |
| In-memory, append-only storage | PASS | All ledgers are plain arrays / Maps; there is no delete path anywhere in the code. |

---

## 11. אינטגרציה והמלצות / Integration & Next Steps

### עברית
- לחבר ל-bridging layer של `onyx-ai` (`src/procurement-bridge.ts`) עבור הודעות יזומות לספקים.
- להוסיף persistence חיצוני (Postgres / Supabase) כשהבקשה תגיע — כעת הכל בזיכרון לפי ההנחיות.
- ה-webhook endpoint חיצוני (Express) צריך להעביר ל-`webhookHandler(payload)` ישירות.
- לחבר ל-`dashboard` דוח עלויות יומי מ-`dailyCostReport()`.

### English
- Wire into the `onyx-ai` bridging layer (`src/procurement-bridge.ts`) for proactive supplier messaging.
- Add external persistence (Postgres / Supabase) when the product ticket calls for it — in-memory for now, per spec.
- The Express webhook endpoint should forward the Meta body straight into `webhookHandler(payload)`.
- Surface `dailyCostReport()` in the finance dashboard.

---

## 12. קבצים / Files

| Path | Role |
|---|---|
| `onyx-procurement/src/comms/whatsapp-business.js` | Adapter implementation |
| `onyx-procurement/test/comms/whatsapp-business.test.js` | 22 `node:test` cases |
| `_qa-reports/AG-Y123-whatsapp-business.md` | This bilingual QA report |

**Signed off:** Agent Y-123 — 2026-04-11
