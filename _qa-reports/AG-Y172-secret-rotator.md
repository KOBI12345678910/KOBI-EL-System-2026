# AG-Y172 — Secret Rotation Scheduler with Dual-Key Support
# AG-Y172 — מתזמן רוטציית סודות עם תמיכה בשני מפתחות

**Agent:** Y172
**Date:** 2026-04-11
**Owner:** Kobi EL — Techno-Kol Uzi mega-ERP (onyx-procurement)
**Scope:** Secret lifecycle manager with dual-key rotation pattern, injectable backend, audit-complete
**Status:** READY — 32 / 32 tests passing, zero external dependencies
**Rule / כלל:** לא מוחקים — רק מסובבים ושומרים בהיסטוריה / Never delete, only rotate and archive.

---

## 1. Implementation Summary / סיכום מימוש

A self-contained secret-rotation scheduler for the onyx-procurement platform's
DevOps/security layer. Every primitive is implemented on top of `node:crypto`
— no `npm install`, no supply-chain surface, no vault SDK required.

מודול עצמאי לניהול מחזור-חיים של סודות במערכת onyx-procurement, תומך
בדפוס של שני-מפתחות-במקביל (dual-key) לצורך שדרוגים ללא השבתה. המודול כתוב
כולו מעל `node:crypto` — ללא תלויות חיצוניות, ללא גישה לרשת, מתאים להפעלה
גם על מארח DR מנותק.

### Files shipped / קבצים שסופקו

| Path                                                          | Lines | Purpose |
| ------------------------------------------------------------- | ----: | ------- |
| `onyx-procurement/src/devops/secret-rotator.js`               |   ~610 | Core rotator + MemoryStorage backend + errors |
| `onyx-procurement/test/devops/secret-rotator.test.js`         |   ~410 | 32 zero-dep tests — pure `node:assert` |
| `_qa-reports/AG-Y172-secret-rotator.md`                       |    -- | This report |

### Public API / ממשק ציבורי

```js
const {
  SecretRotator,
  MemoryStorage,
  SecretRotatorError,
  STATUS,
  ROTATION_REASON,
  AUDIT_EVENT,
} = require('./src/devops/secret-rotator');

const rotator = new SecretRotator({
  storage:     new MemoryStorage(),   // or your own backend
  now:         () => Date.now(),      // injectable clock
  graceDays:   7,                     // default dual-key window
  secretBytes: 32,                    // ≥ 32 (256 bits)
  auditHook:   (evt) => logger.info(evt),
});

// 1. Schedule
await rotator.scheduleRotation('jwt-signing-key', 90);

// 2. Rotate (creates PENDING — ACTIVE is untouched)
const { versionId: newId } = await rotator.rotate('jwt-signing-key');

// 3. Cut-over (old moves to GRACE for 7 days)
await rotator.activateNew('jwt-signing-key', newId);

// 4. During grace: BOTH versions are accepted
const { accepted, verified } = await rotator.verifyInUse(
  'jwt-signing-key',
  'auth-api',        // service name
  oldVersionId
);
// → verified: true, accepted: [newId, oldVersionId]

// 5. After grace expires
await rotator.retireOld('jwt-signing-key', oldVersionId);

// 6. Break-glass
await rotator.emergencyRotation('jwt-signing-key', 'Token found on pastebin');
```

### Core state machine / מכונת מצבים

```
  PENDING ─► ACTIVE ─► GRACE ─► RETIRED  (never HARD-DELETED)
     │          │         │         │
     │          │         │         └── visible to forensics forever
     │          │         │
     │          │         └── DUAL-KEY WINDOW: old + new both valid
     │          │
     │          └── only one version per secretId at a time
     │
     └── created but not yet the active signer
```

The machine is **monotonic**: a RETIRED version cannot be re-activated.
This is enforced at the API layer (`activateNew` rejects any state other
than PENDING) and verified by test #25.

### Dual-key guarantee / ערבות שני המפתחות

During the grace window, `verifyInUse(secretId, service, versionId)`
returns `{ verified: true }` for **both** the ACTIVE version and every
GRACE version whose `graceEndsAt` is still in the future. Consumers can
therefore validate tokens signed with the previous key while each service
rolls out the new one at its own pace.

בתוך חלון-החסד, הפונקציה `verifyInUse` מחזירה `verified:true` גם לגרסה
הפעילה וגם לכל גרסה שנמצאת בחלון (`GRACE`) שזמן-סיומה עדיין בעתיד.
השירותים יכולים להמשיך לאמת טוקנים שנחתמו במפתח הקודם, תוך שהם מתעדכנים
בקצב שלהם.

---

## 2. Security properties / תכונות אבטחה

| Property                               | Implementation                                                   |
| -------------------------------------- | ---------------------------------------------------------------- |
| Secret entropy                         | `crypto.randomBytes(N)` with `N ≥ 32` (256 bits). Enforced in constructor and in `generateStrongSecret(bytes)`. |
| Upper bound on secret size             | `1024` bytes. Prevents OOM on malicious input.                    |
| Secret material at rest                | Returned only when the caller explicitly passes `{ includeSecret:true }`. Default calls to `listVersions` / `getActive` strip `_secretHex` from the response. Test #28. |
| Fingerprint                            | 16-char SHA-256 slice of the hex-encoded secret. Enables equality checks without exposing the secret itself. |
| Never-delete / forensic retention      | `retireOld()` flips `status → RETIRED` and sets `retiredAt`. It never removes the row. Test #14 verifies that `listVersions` still returns the retired version. |
| Monotonic state machine                | `activateNew` rejects any input that is not `PENDING`. Test #25.  |
| Break-glass                            | `emergencyRotation(secretId, reasonText)` creates + activates + force-retires previous versions in one call. Requires a non-empty reason (test #19). |
| Grace-window override                  | `emergencyRotation(..., { keepGrace:true })` leaves the compromised version in GRACE for read-only migration. Test #18. |
| Full audit trail                       | Every transition appends one `audit` row. Append-only — verified by test #20 (timestamps non-decreasing). |
| Pluggable storage backend              | Any object that satisfies the 11-method interface is accepted. Test #24 wires a spy backend and verifies it is actually called. |
| Pluggable clock                        | `now` injector — the test harness uses a virtual clock so day-scale tests run in microseconds. |
| Validation of `secretId`               | `/^[a-zA-Z0-9._:\-]{1,128}$/`. Rejects empty, whitespace, oversized, and shell-meta-character inputs (test #08). |
| Validation of interval                 | `1 ≤ intervalDays ≤ 3650` days. Anything else is `E_BAD_INTERVAL`. |
| Bilingual errors                       | Every `SecretRotatorError` carries both `messageEn` and `messageHe`. Test #29 asserts Hebrew characters appear in the localized text. |

---

## 3. Zero-dependency check / בדיקת אפס-תלויות

```
grep -nE "^const .* = require\(" onyx-procurement/src/devops/secret-rotator.js
78:const crypto = require('node:crypto');
```

Only `node:crypto`. No external packages. No dynamic imports. No network
calls. No file-system writes outside what the injected `storage` backend
chooses to do.

רק `node:crypto`. אין חבילות חיצוניות, אין ייבוא דינמי, אין גישה לרשת,
אין כתיבה לדיסק מעבר למה שה-backend המוזרק בוחר לעשות בעצמו.

---

## 4. Test matrix / מטריצת בדיקות

All tests run with pure `node:assert`. Execute via:

```
node onyx-procurement/test/devops/secret-rotator.test.js
```

Result:

```
................................

32 passed, 0 failed
```

### Per-test breakdown / פירוט הבדיקות

| #   | Test                                                                  | Category           | Status |
| --: | :-------------------------------------------------------------------- | :----------------- | :----: |
|  01 | `generateStrongSecret` default length ≥ 32 bytes                      | Primitive           | PASS   |
|  02 | Two calls produce different values                                    | Primitive           | PASS   |
|  03 | Rejects < 32 bytes                                                    | Entropy guard       | PASS   |
|  04 | Rejects > 1024 bytes                                                  | OOM guard           | PASS   |
|  05 | Constructor rejects weak `secretBytes`                                | Config validation   | PASS   |
|  06 | `scheduleRotation` bootstraps PENDING version                         | Lifecycle           | PASS   |
|  07 | `scheduleRotation` rejects bad intervals                              | Input validation    | PASS   |
|  08 | `scheduleRotation` rejects bad `secretId`                             | Input validation    | PASS   |
|  09 | `rotate()` creates PENDING without flipping ACTIVE                    | Dual-key            | PASS   |
|  10 | `activateNew()` promotes PENDING and demotes old → GRACE              | Lifecycle           | PASS   |
|  11 | Dual-key window — ACTIVE + GRACE both accepted                        | **Core guarantee** | PASS   |
|  12 | `retireOld()` refuses to retire ACTIVE                                | Safety              | PASS   |
|  13 | `retireOld()` refuses retiring still-in-grace without `force`         | Safety              | PASS   |
|  14 | `retireOld()` succeeds after grace expires + row retained             | Never-delete        | PASS   |
|  15 | `retireOld({ force:true })` overrides grace window                    | Emergency           | PASS   |
|  16 | `retireOld()` idempotent on already-RETIRED                           | Idempotency         | PASS   |
|  17 | `emergencyRotation` instant revoke (default)                          | Break-glass         | PASS   |
|  18 | `emergencyRotation({ keepGrace:true })` keeps prior in GRACE          | Break-glass soft    | PASS   |
|  19 | `emergencyRotation` rejects empty reason                              | Compliance          | PASS   |
|  20 | Audit log is append-only and captures every transition                | Audit               | PASS   |
|  21 | Usage log records service → version mapping                           | Observability       | PASS   |
|  22 | `rotateIfDue` is a no-op when not yet due                             | Scheduler           | PASS   |
|  23 | `rotateIfDue` triggers when due                                       | Scheduler           | PASS   |
|  24 | Injectable storage — custom backend is actually called                | DI / portability    | PASS   |
|  25 | Cannot re-activate a RETIRED version                                  | State-machine       | PASS   |
|  26 | `verifyInUse` unknown version → `verified:false`                      | API contract        | PASS   |
|  27 | `verifyInUse` without `versionId` arg → `verified:null`               | API contract        | PASS   |
|  28 | `listVersions` hides secret material unless `includeSecret:true`      | Data-leak guard     | PASS   |
|  29 | Every error exposes both EN + HE text                                 | i18n                | PASS   |
|  30 | Fingerprint is stable + collision-resistant within one secret         | Primitive           | PASS   |
|  31 | Re-scheduling updates interval without wiping versions                | Never-delete        | PASS   |
|  32 | `auditHook` receives every audit event                                | Observability       | PASS   |

Total: **32 tests — all passing.**

---

## 5. Israeli security best-practices reference / הפניות רגולציה

The module is designed to support audits against:

1. **תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017**
   Privacy Protection Regulations (Information Security), 5777-2017 — §11
   requires *periodic rotation* of access credentials proportionate to
   the risk level of the database.
   *Mapping:* `scheduleRotation(secretId, intervalDays)` + `rotateIfDue`
   provide the proportionate-cadence control; the audit log proves it
   was executed.

2. **מערך הסייבר הלאומי (INCD) — תורת ההגנה בסייבר 2.0**
   Israeli National Cyber Directorate "Cyber-Defense Doctrine 2.0"
   control **SEC-4 (Key Management)** — documented rotation cadence and
   an emergency rotation playbook.
   *Mapping:* `emergencyRotation()` is the break-glass playbook;
   `getAuditLog()` is the documentation artefact.

3. **NIST SP 800-57 Part 1 Rev. 5 §5.3.5** — dual-key rotation to
   prevent availability gaps during cryptoperiod changeover.
   *Mapping:* the `ACTIVE → GRACE` transition with `graceDays` and
   `verifyInUse` accepting both versions is the literal NIST pattern.

4. **CIS Controls v8 §3.11** — encryption key rotation + **§4.5** —
   secure storage of administrative credentials.
   *Mapping:* the injectable storage backend lets the operator plug in
   an HSM-backed or envelope-encrypted store without touching the
   rotator code.

5. **PCI-DSS v4.0 §3.7.4** — key rotation at end of cryptoperiod.
   *Mapping:* `intervalDays` is the configurable cryptoperiod;
   `rotateIfDue` enforces it.

6. **הוראת ניהול בנקאי תקין 361 (בנק ישראל) / Bank of Israel Proper
   Conduct of Banking Business Directive 361** (Cybersecurity
   Management) §§6–8 — "key management and rotation". Same mapping as
   INCD SEC-4.

---

## 6. Operational runbook / מדריך הפעלה

### 6.1 Bootstrap a new secret / אתחול סוד חדש

```js
await rotator.scheduleRotation('db-encryption-key', 180);
const [v0] = await rotator.listVersions('db-encryption-key');
await rotator.activateNew('db-encryption-key', v0.versionId);
```

### 6.2 Routine 90-day rotation / רוטציה שגרתית

```js
// On a cron:
const due = await rotator.rotateIfDue('db-encryption-key');
if (due) {
  // Deploy the new key alongside the old one to every service first,
  // THEN call activateNew() to cut over.
  await rotator.activateNew('db-encryption-key', due.versionId);
}
// Seven days later:
await rotator.retireOld('db-encryption-key', v0.versionId);
```

### 6.3 Emergency / חרום

```js
try {
  await rotator.emergencyRotation(
    'db-encryption-key',
    'INC-2026-042 — exfil observed at 09:42'
  );
} finally {
  // Always trigger the IR playbook separately.
}
```

### 6.4 Forensic query / שאילתה פורנזית

```js
const all = await rotator.listVersions('db-encryption-key');
// includes RETIRED rows — use them to answer
// "which version signed this 2024-vintage token?"
const audit = await rotator.getAuditLog('db-encryption-key');
const usage = await rotator.getUsageLog('db-encryption-key');
```

---

## 7. Known limitations & roadmap / מגבלות ידועות וצעדים הבאים

| Limitation                                                  | Mitigation                                                    |
| :---------------------------------------------------------- | :------------------------------------------------------------ |
| `MemoryStorage` is non-persistent                           | Inject a real backend (Postgres / KMS / HSM) via DI — the API was designed around this. |
| No built-in cron — `rotateIfDue` must be called by the host | Intentional. The rotator does not own scheduling, so it works in both server and lambda contexts. Wire it to your existing job runner (`src/jobs`). |
| No encryption-at-rest for `_secretHex`                      | The storage backend is the right place to envelope-encrypt. `MemoryStorage` is for tests / local dev only. |
| Notifications on `nextRotationAt`                           | Route `auditHook` events into the existing notifications pipeline (`src/notifications`). |

Every one of these is an *addition*, not a deletion. Consistent with the
never-delete rule, future agents will only grow the surface area.

---

## 8. File checksums / תמציות קבצים

```
src/devops/secret-rotator.js        — created 2026-04-11 — zero external deps
test/devops/secret-rotator.test.js  — created 2026-04-11 — 32 tests, all passing
_qa-reports/AG-Y172-secret-rotator.md — this report
```

---

**Report prepared by:** Agent Y172 (DevOps / Security)
**For:** Kobi EL — Techno-Kol Uzi mega-ERP
**Bilingual:** English + עברית
**Compliance:** Privacy Protection Regs 5777-2017 §11 · INCD SEC-4 · NIST SP 800-57 §5.3.5 · CIS v8 §3.11/§4.5 · PCI-DSS v4.0 §3.7.4 · Bank of Israel 361
