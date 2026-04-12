# AG-Y173 — VaultClient (HashiCorp Vault / OpenBao) / לקוח Vault ל-HashiCorp / OpenBao

**Agent / סוכן:** Y-173
**Program / תוכנית:** Techno-Kol Uzi mega-ERP — `onyx-procurement` / devops
**Date / תאריך:** 2026-04-11
**Status / סטטוס:** PASS — 22/22 unit tests green / PASS — 22 מתוך 22 בדיקות ירוקות
**Scope / היקף:** Zero-dependency HashiCorp Vault & OpenBao client wrapper / עטיפת לקוח ל-Vault ול-OpenBao ללא תלויות חיצוניות

---

## 1. Executive summary / סיכום מנהלים

**EN.** Agent Y-173 delivers a production-ready, zero-dependency Vault / OpenBao
client wrapper for the `onyx-procurement` DevOps layer. The new
`VaultClient` class provides first-class coverage of the three secret engines
most commonly wired into Techno-Kol's mega-ERP stack:

1. **KV v2** — read, write, patch, list, metadata, soft-delete, undelete.
2. **Transit** — create key, encrypt, decrypt, rewrap, rotate, HMAC, random.
3. **PKI** — issue cert, sign CSR, read / list roles, read CA, revoke cert.

It also covers token lifecycle (lookup-self, renew-self, revoke-self),
namespace support (`X-Vault-Namespace` header for Vault Enterprise /
OpenBao), pluggable transport via `injectTransport(fn)`, retry with
exponential backoff + jitter on 429 / 5xx / transport errors, and an in-memory
ring-buffer audit log of every call — with automatic redaction of sensitive
payload fields. All code relies exclusively on Node.js built-in modules
(`node:https`, `node:http`, `node:url`, `node:crypto`, `node:events`), fulfilling
the "built-ins only" rule.

**HE.** סוכן Y-173 מספק עטיפת לקוח מוכנה-לייצור ל-HashiCorp Vault ול-OpenBao
עבור שכבת DevOps ב-`onyx-procurement`, ללא תלויות חיצוניות כלשהן. מחלקת
`VaultClient` החדשה כוללת תמיכה מלאה בשלושת מנועי הסודות הנפוצים ביותר
במערכת ה-ERP של Techno-Kol:

1. **KV גרסה 2** — קריאה, כתיבה, עדכון חלקי, רשימה, מטא-נתונים, מחיקה רכה, שחזור.
2. **Transit** — יצירת מפתח, הצפנה, פענוח, עטיפה-מחדש, סבב מפתח, HMAC, אקראיות.
3. **PKI** — הנפקת תעודה, חתימה על CSR, קריאה ורשימת תפקידים, קריאת CA, ביטול תעודה.

הלקוח תומך גם במחזור חיי טוקן (lookup-self, renew-self, revoke-self),
ב-namespaces (כותרת `X-Vault-Namespace` ל-Vault Enterprise ול-OpenBao),
ב-transport ניתן להחלפה דרך `injectTransport(fn)`, ב-retry עם השהיה
אקספוננציאלית ו-jitter על 429 / 5xx / שגיאות transport, וביומן audit מובנה
המסתיר אוטומטית שדות רגישים. כל הקוד נשען אך ורק על מודולי הליבה של Node.js
(`node:https`, `node:http`, `node:url`, `node:crypto`, `node:events`), בהתאם לכלל
"built-ins בלבד".

---

## 2. Deliverables / תוצרים

| # | File / קובץ | Purpose / ייעוד | Lines / שורות |
|---|-------------|-----------------|---------------|
| 1 | `onyx-procurement/src/devops/vault-client.js` | VaultClient class + VaultError + internal helpers / מחלקת VaultClient, שגיאה ייעודית, עוזרים פנימיים | ~720 |
| 2 | `onyx-procurement/test/devops/vault-client.test.js` | 22 `node:test` unit tests with mock transport / 22 בדיקות יחידה עם mock transport | ~400 |
| 3 | `_qa-reports/AG-Y173-vault-client.md` | This bilingual QA report / דוח ה-QA הדו-לשוני הזה | — |

**EN.** No existing files were modified or removed (project rule: never delete). The
implementation is purely additive.

**HE.** אף קובץ קיים לא שונה או נמחק (כלל הפרויקט: לעולם לא מוחקים). היישום
אדטיבי לחלוטין.

---

## 3. Architecture / ארכיטקטורה

### 3.1 Public API / ממשק ציבורי

```
class VaultClient extends EventEmitter
  constructor(opts)                  // endpoint, token, namespace, mounts, retry knobs
  injectTransport(fn)                // test hook / hook לבדיקות
  resetTransport()
  setToken(token) / setNamespace(ns) / getConfig()

  // Low-level
  request({ method, path, body, query, headers, engine, op })

  // sys
  health() / sealStatus()

  // Token lifecycle
  lookupSelf() / renewSelf(increment) / revokeSelf()

  // KV v2
  kvWrite(path, data, { cas })
  kvRead(path, { version })
  kvList(path)
  kvMetadata(path)
  kvPatch(path, data)
  kvSoftDeleteVersion(path, versions)
  kvUndeleteVersion(path, versions)

  // Transit
  transitCreateKey(name, { type, exportable, derived, ... })
  transitEncrypt(keyName, plaintext, { context, key_version, associated_data })
  transitDecrypt(keyName, ciphertext, { context, associated_data, asString })
  transitRewrap(keyName, ciphertext, { key_version })
  transitRotateKey(keyName)
  transitHmac(keyName, input, { algorithm })
  transitRandom(bytes)

  // PKI
  pkiIssueCert(role, { common_name, ttl, ... })
  pkiSignCsr(role, csrPem, { common_name, ... })
  pkiReadRole(role) / pkiListRoles() / pkiReadCa()
  pkiRevokeCert(serialNumber)
  static fingerprint(pem)   // SHA-256 fingerprint helper

  // Audit
  getAuditLog({ type, engine, since }) / clearAuditLog()

  // Events emitted
  'request' / 'response' / 'error' / 'audit' / 'token-renewed'
```

### 3.2 Transport layer / שכבת ה-transport

**EN.** The default transport uses `node:https` (or `node:http` when the URL is
plain HTTP) directly — no `axios`, `node-fetch`, or `got`. A test / consumer may
replace it at any time via `injectTransport(fn)`. The injected function receives
`{ url, method, headers, body, timeout }` and must resolve to
`{ status, headers, body }` where `body` is a string. This is how the test
suite avoids all network I/O.

**HE.** ה-transport המקורי משתמש ב-`node:https` (או `node:http` כאשר ה-URL הוא
HTTP רגיל) ישירות — בלי `axios`, `node-fetch` או `got`. בדיקות או צרכנים
יכולים להחליף אותו בכל עת באמצעות `injectTransport(fn)`. הפונקציה המוזרקת
מקבלת `{ url, method, headers, body, timeout }` וצריכה להתרס ל-
`{ status, headers, body }` כאשר `body` הוא מחרוזת. כך חבילת הבדיקות נמנעת
מכל קלט/פלט של רשת.

### 3.3 Retry strategy / אסטרטגיית ניסיון חוזר

**EN.** Retries are driven by `maxRetries` (default 3) and trigger on:

- Transport-level errors (`ECONNRESET`, timeout, DNS failure, etc.).
- HTTP `429 Too Many Requests`.
- HTTP `5xx` **except** `501 Not Implemented`.

Delay = `min(retryMaxMs, retryBaseMs * 2^attempt + random(0, retryBaseMs))`
(full-jitter exponential backoff). `sleep`, `now`, and `random` are all
injectable for tests, making retry behavior deterministic.

**HE.** ניסיונות חוזרים נשלטים על-ידי `maxRetries` (ברירת מחדל 3) ומופעלים על:

- שגיאות ברמת ה-transport (`ECONNRESET`, timeout, כשל DNS וכו').
- סטטוס HTTP 429 (Too Many Requests).
- סטטוס HTTP 5xx **למעט** 501 (Not Implemented).

השהיה = `min(retryMaxMs, retryBaseMs * 2^attempt + random(0, retryBaseMs))`
(backoff אקספוננציאלי עם jitter מלא). `sleep`, `now` ו-`random` כולם ניתנים
להזרקה לצורכי בדיקה, מה שהופך את התנהגות ה-retry לדטרמיניסטית.

### 3.4 Audit log & redaction / יומן audit וסנן סודות

**EN.** Every call produces at least one `request` audit row plus a matching
`response` / `retry` / `error` row. Rows are stored in an in-memory ring buffer
capped at `auditMax` (default 500). The request body is parsed and passed
through a recursive `redact()` helper that masks values whose keys appear in
`SENSITIVE_KEYS` — `token`, `password`, `secret`, `private_key`, `plaintext`,
`ciphertext`, `signature`, `hmac`, `data`, `certificate`, `issuing_ca`,
`ca_chain`, `serial_number`. As a defense-in-depth measure, all string values
anywhere in the body are converted to `[REDACTED:<length>]`, so plaintext never
leaks through an unforeseen key name. `getAuditLog()` returns defensive deep
clones, and `clearAuditLog()` resets the buffer (useful between test cases).
`audit` events are also emitted in real time on the `EventEmitter`.

**HE.** כל קריאה מייצרת לפחות רשומת `request` אחת ועוד רשומה מתאימה של
`response` / `retry` / `error`. הרשומות נשמרות בחיץ מעגלי בזיכרון המוגבל
ל-`auditMax` (ברירת מחדל 500). גוף הבקשה מפוענח ומועבר דרך פונקציית
`redact()` רקורסיבית המסתירה ערכים שמפתחותיהם מופיעים ב-`SENSITIVE_KEYS` —
`token`, `password`, `secret`, `private_key`, `plaintext`, `ciphertext`,
`signature`, `hmac`, `data`, `certificate`, `issuing_ca`, `ca_chain`,
`serial_number`. כהגנת עומק, כל ערך מחרוזת בכל מקום בגוף מומר ל-
`[REDACTED:<אורך>]`, כך ש-plaintext לעולם לא דולף דרך מפתח שלא חזינו מראש.
הפונקציה `getAuditLog()` מחזירה עותקים עמוקים להגנה מפני שינוי, ו-
`clearAuditLog()` מאפסת את החיץ (שימושי בין בדיקות). אירועי `audit`
נפלטים גם בזמן-אמת על ה-`EventEmitter`.

### 3.5 Namespace support / תמיכה ב-namespaces

**EN.** Both Vault Enterprise and OpenBao support multi-tenant namespaces via
the `X-Vault-Namespace` header. Passing `namespace: "techno-kol/uzi-erp"` to
the constructor (or calling `setNamespace(...)` later) automatically stamps
every subsequent request. Test #14 asserts the header is present.

**HE.** גם Vault Enterprise וגם OpenBao תומכים ב-namespaces רב-דיירים דרך
הכותרת `X-Vault-Namespace`. העברת `namespace: "techno-kol/uzi-erp"` ל-
constructor (או קריאה מאוחרת ל-`setNamespace(...)`) מוסיפה את הכותרת לכל
בקשה שלאחר מכן. בדיקה 14 מאמתת שהכותרת אכן מצורפת.

### 3.6 "Never delete" compliance / עמידה בכלל "לעולם לא מוחקים"

**EN.** Project rule: no deletions. The wrapper exposes KV v2 "soft-delete"
(`kvSoftDeleteVersion`) which only **marks** a version as deleted — Vault retains
the data and the undo is `kvUndeleteVersion`. PKI `revokeCert` is also
non-destructive: it places the certificate on the CRL, but the record stays.
**No wrapper method ever calls `/metadata/<path>` with `DELETE`, and the KV
"destroy" endpoint is NOT implemented**. Test #19 verifies that neither a
`DELETE` method nor a `/destroy/` path is ever generated during a soft-delete /
undelete flow.

**HE.** כלל הפרויקט: אין מחיקות. העטיפה חושפת "מחיקה רכה" של KV גרסה 2
(`kvSoftDeleteVersion`) שרק **מסמנת** גרסה כמחוקה — Vault שומר את הנתונים וניתן
לבצע undo באמצעות `kvUndeleteVersion`. גם `revokeCert` של PKI אינה הרסנית:
היא מכניסה את התעודה ל-CRL, אבל הרשומה נשארת. **אף מתודה בעטיפה לא קוראת
ל-`/metadata/<path>` עם `DELETE`, ונקודת הקצה "destroy" של KV לא מיושמת
כלל**. בדיקה 19 מאמתת שבזרימת soft-delete / undelete לא נוצרים מתודת `DELETE`
או נתיב `/destroy/`.

---

## 4. Test coverage / כיסוי בדיקות

**EN.** 22 `node:test` tests, all mocked, run in ~130 ms with no network I/O.
Run with:

```bash
node --test onyx-procurement/test/devops/vault-client.test.js
```

**HE.** 22 בדיקות `node:test`, כולן mocked, רצות תוך ~130 מילישניות ללא קלט/פלט
של רשת. להרצה:

```bash
node --test onyx-procurement/test/devops/vault-client.test.js
```

### 4.1 Test list / רשימת בדיקות

| #  | Test name / שם בדיקה | Area / אזור | EN intent | HE כוונה |
|----|----------------------|-------------|-----------|-----------|
| 01 | constructor validates required endpoint option | config | throws on missing / bad endpoint, trims trailing slash | זורק שגיאה על endpoint חסר/שגוי, חותך slash סופי |
| 02 | injectTransport replaces transport + resetTransport restores it | transport | injection + rejection of non-function | הזרקה + דחיית ערך שאינו פונקציה |
| 03 | KV v2 write stores data and returns metadata | KV | POST to `secret/data/<p>`, body wrapping | שולח POST ל-`secret/data/<p>` עם עטיפת body |
| 04 | KV v2 read returns parsed data + metadata | KV | parses `{ data, metadata }` correctly | פענוח נכון של `{ data, metadata }` |
| 05 | KV v2 patch uses merge-patch+json content type | KV | correct content-type for PATCH | content-type נכון ל-PATCH |
| 06 | KV v2 list and metadata work independently | KV | list returns keys[], metadata returns versions | list מחזיר keys, metadata מחזיר גרסאות |
| 07 | Transit encrypt + decrypt round-trip preserves payload | Transit | base64 encode/decode + UTF-8 round-trip (Hebrew included) | קידוד base64 + סבב UTF-8 (כולל עברית) |
| 08 | Transit HMAC, rewrap, rotate, random | Transit | all auxiliary Transit ops | כל פעולות ה-Transit המשניות |
| 09 | PKI issueCert returns cert material and requires common_name | PKI | validates inputs, returns cert / private_key / serial | מאמת קלטים, מחזיר תעודה/מפתח/סריאלי |
| 10 | PKI signCsr, listRoles, revokeCert | PKI | CSR signing path, role listing, revoke | חתימת CSR, רשימת תפקידים, ביטול |
| 11 | Token lookupSelf caches + renewSelf emits event + updates token | token | token cached, 'token-renewed' event, client.token rotated | טוקן cached, אירוע 'token-renewed', client.token מתעדכן |
| 12 | Retry with exponential backoff on 503; succeeds on third attempt | retry | retry on 5xx, retry audit rows | retry על 5xx, רשומות retry ב-audit |
| 13 | Non-retryable 403 fails fast without retry | retry | 403 → single attempt, VaultError surfaced | 403 → ניסיון יחיד, VaultError חשוף |
| 14 | Namespace header is attached when set | namespace | `X-Vault-Namespace` header in request | כותרת `X-Vault-Namespace` בבקשה |
| 15 | Audit log records every request, redacts secrets, filters, clears | audit | secrets REDACTED, filter by type/engine, clear works | סודות REDACTED, סינון לפי type/engine, clear פועל |
| 16 | Invalid input validation for KV and Transit methods | validation | all methods reject empty/invalid inputs | כל המתודות דוחות קלטים ריקים/שגויים |
| 17 | Transport error is wrapped in VaultError and retried | retry | raw Error → VaultError, retried | Error רגיל עטוף ב-VaultError, ניסיון חוזר |
| 18 | revokeSelf clears token and nullifies cached tokenInfo | token | token cleared after revoke-self | טוקן מאופס לאחר revoke-self |
| 19 | KV soft delete + undelete preserve data (never destroy) | no-delete | URLs target delete/undelete, never /destroy/ | ה-URLs פונים ל-delete/undelete, לעולם לא ל-/destroy/ |
| 20 | Internal helpers: encodePath, redact, safeJsonParse | helpers | encodePath escapes, redact masks, safeJsonParse handles bad JSON | encodePath מקודד, redact מסתיר, safeJsonParse עמיד |
| 21 | Retry gives up after maxRetries and throws last VaultError | retry | 3 failed attempts then throw | שלושה כישלונות ואז throw |
| 22 | getConfig exposes non-sensitive configuration snapshot | config | raw token NEVER returned by getConfig | הטוקן הגולמי לעולם לא מוחזר מ-getConfig |

### 4.2 Run output / פלט הרצה

```
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~128
```

---

## 5. Security considerations / שיקולי אבטחה

**EN.**

1. **Secret redaction in logs.** All common sensitive key names are masked, and
   every non-empty string value in the audit body is replaced with
   `[REDACTED:<length>]` — even under unanticipated keys. This prevents
   accidental plaintext leakage via logs / APM / stdout.
2. **Token rotation on renewSelf.** When the Vault server returns a rotated
   client token, the wrapper silently adopts it (as Vault docs describe) and
   emits `token-renewed` so orchestrators can persist it.
3. **getConfig() never returns the raw token** — only `hasToken: boolean`.
4. **Namespace is opt-in** — a stale namespace header cannot leak into cross-
   tenant calls because it is always read from the current instance state.
5. **Transport timeouts are enforced** (default 30 s), and transport-level
   failures are wrapped in `VaultError` for uniform error handling upstream.
6. **KV `destroy` endpoint is deliberately not implemented.** Callers must go
   through `kvSoftDeleteVersion` + `kvUndeleteVersion`, which are non-
   destructive and align with the project-wide "never delete" rule.

**HE.**

1. **הסתרת סודות ביומן.** כל שמות המפתחות הרגישים הנפוצים מוסתרים, וכל ערך
   מחרוזת לא-ריק בגוף ה-audit מומר ל-`[REDACTED:<אורך>]` — אפילו תחת מפתחות
   לא-צפויים. מונע דליפה בטעות דרך יומנים / APM / stdout.
2. **סבב טוקן ב-renewSelf.** כאשר שרת Vault מחזיר טוקן מוחלף, העטיפה מאמצת אותו
   בשקט (כמתועד ב-Vault) ופולטת אירוע `token-renewed` כדי שמתזמרים יוכלו
   לשמור אותו.
3. **`getConfig()` לעולם לא מחזיר את הטוקן הגולמי** — רק `hasToken: boolean`.
4. **Namespace הוא opt-in** — כותרת namespace ישנה לא יכולה לדלוף לקריאות
   בין דיירים כי היא תמיד נקראת ממצב ה-instance הנוכחי.
5. **Timeouts של transport נאכפים** (ברירת מחדל 30 שניות), וכשלים ברמת ה-
   transport עטופים ב-`VaultError` למען טיפול אחיד בשגיאות.
6. **נקודת הקצה `destroy` של KV לא מיושמת במכוון.** קוראים חייבים לעבור דרך
   `kvSoftDeleteVersion` + `kvUndeleteVersion`, שאינן הרסניות ותואמות לכלל
   "לעולם לא מוחקים" של הפרויקט.

---

## 6. Integration notes / הערות אינטגרציה

**EN.** Typical wiring into `onyx-procurement` bootstrap:

```js
const { VaultClient } = require('./src/devops/vault-client.js');

const vault = new VaultClient({
  endpoint: process.env.VAULT_ADDR || 'https://vault.internal.techno-kol:8200',
  token: process.env.VAULT_TOKEN,
  namespace: process.env.VAULT_NAMESPACE || '',
  kvMount: 'secret',
  transitMount: 'transit',
  pkiMount: 'pki',
  maxRetries: 4,
});

// Auto-renew every 5 min if current lease has < 30 min left
setInterval(async () => {
  try {
    const info = await vault.lookupSelf();
    if (info && info.ttl && info.ttl < 1800 && info.renewable) {
      await vault.renewSelf(3600);
    }
  } catch (err) {
    // logged via vault.on('error', ...)
  }
}, 5 * 60 * 1000).unref();

vault.on('audit', (row) => auditStream.write(row));
```

**HE.** חיבור טיפוסי ל-bootstrap של `onyx-procurement`:

```js
const { VaultClient } = require('./src/devops/vault-client.js');

const vault = new VaultClient({
  endpoint: process.env.VAULT_ADDR || 'https://vault.internal.techno-kol:8200',
  token: process.env.VAULT_TOKEN,
  namespace: process.env.VAULT_NAMESPACE || '',
  kvMount: 'secret',
  transitMount: 'transit',
  pkiMount: 'pki',
  maxRetries: 4,
});

// חידוש אוטומטי כל 5 דקות אם נותרו פחות מ-30 דקות בחוזה הנוכחי
setInterval(async () => {
  try {
    const info = await vault.lookupSelf();
    if (info && info.ttl && info.ttl < 1800 && info.renewable) {
      await vault.renewSelf(3600);
    }
  } catch (err) {
    // נרשם דרך vault.on('error', ...)
  }
}, 5 * 60 * 1000).unref();

vault.on('audit', (row) => auditStream.write(row));
```

---

## 7. Compatibility matrix / מטריצת תאימות

| Server / שרת | Version / גרסה | KV v2 | Transit | PKI | Notes / הערות |
|--------------|----------------|-------|---------|-----|---------------|
| HashiCorp Vault | 1.9+ | OK | OK | OK | EN: patch requires 1.9+ / HE: patch דורש 1.9 ומעלה |
| HashiCorp Vault Enterprise | 1.9+ | OK | OK | OK | EN: namespaces supported via `X-Vault-Namespace` / HE: namespaces נתמכים דרך `X-Vault-Namespace` |
| OpenBao | 2.0+ | OK | OK | OK | EN: same REST API, drop-in replacement / HE: אותו REST API, תחליף ישיר |
| Node.js | 18+ | — | — | — | EN: requires `node:test`, built-in fetch not needed / HE: דורש `node:test`, fetch מובנה לא נחוץ |

---

## 8. Known limitations & future work / מגבלות ידועות ועבודה עתידית

**EN.**

- AppRole / Kubernetes / AWS IAM auth methods are not wired in this first
  cut. `VaultClient.request` can be used directly to hit `auth/*/login` until
  dedicated helpers are added.
- OCSP / CRL fetching is not yet exposed; only `pkiReadCa` is implemented.
- The audit buffer is in-memory only; a persistent sink can be added by
  consuming the `audit` event.
- Streaming responses (e.g., large CA chain exports) are not yet supported —
  the body is fully buffered.
- `transitSign` / `transitVerify` and `transitKeys` introspection endpoints can
  be added later as needed.

**HE.**

- שיטות האימות AppRole / Kubernetes / AWS IAM לא חוברו בגרסה ראשונה זו. ניתן
  להשתמש ישירות ב-`VaultClient.request` כדי לגשת ל-`auth/*/login` עד שיתווספו
  עוזרים ייעודיים.
- משיכת OCSP / CRL עדיין לא נחשפת; רק `pkiReadCa` מיושם.
- חיץ ה-audit קיים רק בזיכרון; ניתן להוסיף יעד מתמיד על-ידי האזנה לאירוע
  `audit`.
- תגובות streaming (למשל ייצוא CA chain גדול) עדיין לא נתמכות — הגוף נצבר
  במלואו לזיכרון.
- `transitSign` / `transitVerify` ונקודות קצה של introspection על מפתחות
  Transit ניתנות להוספה מאוחר יותר לפי הצורך.

---

## 9. Verdict / החלטה

**EN.** APPROVED for merge into `onyx-procurement`. All 22 unit tests pass,
zero external dependencies, "never delete" compliance verified, secret
redaction verified, bilingual documentation complete.

**HE.** אושר למיזוג ל-`onyx-procurement`. כל 22 הבדיקות עוברות, אפס תלויות
חיצוניות, אימות עמידה בכלל "לעולם לא מוחקים", אימות הסתרת סודות, ותיעוד
דו-לשוני שלם.

**Signed / נחתם:** Agent Y-173, 2026-04-11
