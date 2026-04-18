# AG-Y075 — Employee Grievance & Complaint System

**Agent:** Y-075  •  **Swarm:** 7  •  **Project:** Techno-Kol Uzi Mega-ERP (Kobi El)
**Module:** `onyx-procurement/src/hr/grievance.js`
**Tests:** `onyx-procurement/test/hr/grievance.test.js` — 44/44 passing
**Date:** 2026-04-11
**House Rule:** לא מוחקים רק משדרגים ומגדלים *(nothing is ever deleted — only upgraded and grown)*

---

## 1. Purpose — מטרה

Provide a zero-dependency, Israeli-law-compliant pipeline for filing, investigating, deciding, and appealing employee grievances of every category — including sensitive cases (sexual harassment, whistleblowing, equal-pay) that carry statutory obligations on the employer.

The module is a single file, bilingual (Hebrew + English in every user-facing label), and uses **only** Node's built-in `node:crypto` — no npm packages.

Status: **production-ready**.

---

## 2. Israeli Legal Framework — מסגרת חוקית ישראלית

Each category routes automatically to the correct statute. The routing table lives in `STATUTORY_ROUTE` and drives investigation deadline, required-officer role, retaliation-protection flag, and ministry-notifiability flag.

| Category        | חוק / Statute                                                                   | Required officer      | SLA (days) | Retaliation protection | Ministry notifiable |
|-----------------|---------------------------------------------------------------------------------|-----------------------|------------|------------------------|---------------------|
| harassment      | חוק למניעת הטרדה מינית, התשנ"ח-1998                                             | harassment-officer    | 7          | yes                    | yes                 |
| discrimination  | חוק שוויון הזדמנויות בעבודה, התשמ"ח-1988                                        | hr-officer            | 14         | yes                    | yes                 |
| pay             | חוק שכר שווה לעובדת ולעובד, התשנ"ו-1996                                         | hr-officer            | 21         | yes                    | no                  |
| ethics          | חוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות), התשנ"ז-1997               | legal                 | 14         | yes                    | yes                 |
| retaliation     | חוק הגנה על עובדים (חשיפת עבירות), התשנ"ז-1997                                   | legal                 | 7          | yes                    | yes                 |
| safety          | פקודת הבטיחות בעבודה, התש"ל-1970                                                | hr-officer            | 14         | yes                    | yes                 |
| management      | (internal)                                                                      | hr-officer            | 21         | yes                    | no                  |
| hr-policy       | (internal)                                                                      | hr-officer            | 21         | no                     | no                  |
| other           | (internal)                                                                      | hr-officer            | 30         | no                     | no                  |

Supporting laws always in force across the module:
- **חוק הגנת הפרטיות, התשמ"א-1981** — enforced via encryption-at-rest for every plaintext description and interview, RBAC on every read, consent gate on `recordInterview()`.
- **דוקטרינת השימוע** (hearing doctrine) — `scheduleHearings()` creates a plan with ≥48 h notice, ≥3 days to respond, ≥7 days to decide.

---

## 3. Process Flow — תרשים זרימה

```
                       ┌──────────────────────┐
                       │  fileComplaint()     │
                       │  anonymous? scrub ID │
                       │  encrypt description │
                       │  route to statute    │
                       │  set SLA deadline    │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ assignInvestigator() │
                       │ conflict-of-interest │◀────── relationships
                       │ role-gate harassment │         witnesses
                       └──────────┬───────────┘         complainant
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  recordInterview()   │◀────── consent (חובה)
                       │  encrypted content   │        subject info
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  scheduleHearings()  │
                       │  notice / respond /  │
                       │  decide windows      │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │   decideVerdict()    │
                       │  finding + actions   │
                       │  + optional appeal   │
                       └──────────┬───────────┘
                                  │
                     ┌────────────┴─────────────┐
                     ▼                          ▼
       ┌──────────────────────┐       ┌──────────────────────┐
       │  appealProcess()     │       │ retaliationMonitor() │
       │  legal → ceo →       │       │  180-day watch;      │
       │  external arbitr.    │       │  reportRetaliation() │
       └──────────────────────┘       └──────────────────────┘

(Every state change appends to the tamper-evident history with a hash
 chain — nothing is ever mutated or deleted. Kobi's rule.)
```

---

## 4. Public API — ממשק ציבורי

```js
const { GrievanceSystem } = require('./src/hr/grievance');
const sys = new GrievanceSystem({ encryptionKey: process.env.GRV_KEY });

// 1. File
const view = sys.fileComplaint({
  complainant: { id: 'emp-100', name: 'Dana', role: 'engineer' },
  anonymous: false,                       // or true for sensitive cases
  category: 'harassment',                 // 9 categories
  description: 'Detailed free text',      // encrypted at rest
  evidence: [{ type: 'image', name: 'msg.png', hash: '…' }],
  witnesses: [{ id: 'w-1', name: 'Uri' }],
  severity: 'critical',                   // drives SLA
});

// 2. Assign investigator (auto conflict-of-interest check)
sys.assignInvestigator(view.id, { id: 'off-1', role: 'harassment-officer' });

// 3. Interviews (consent required by חוק הגנת הפרטיות)
sys.recordInterview({ complaintId: view.id, subject: { id: 'w-1' }, content: '…', consent: true });

// 4. Hearings (דוקטרינת השימוע)
sys.scheduleHearings(view.id);

// 5. Verdict
sys.decideVerdict({
  complaintId: view.id,
  finding: 'substantiated',   // or unsubstantiated / partially-substantiated / inconclusive
  actions: [{ type: 'training', target: 'manager-A', detail: '…' }],
  appeal:  { allowed: true },
});

// 6. Retaliation watch (180 days default)
sys.retaliationMonitor(view.id, 180);
sys.reportRetaliation(view.id, { type: 'demotion', actor: 'manager-X', detail: '…' });

// 7. Appeal escalation (legal → ceo → external arbitration)
sys.appealProcess(view.id);
sys.escalateAppeal(view.id, 'rejected');   // advances level

// 8. RBAC
sys.restrictAccess({ complaintId: view.id, allowedRoles: ['harassment-officer', 'legal'] });
sys.getComplaint(view.id, { id: 'off-1', role: 'harassment-officer' });  // gated

// 9. Statutory aggregate report — identities never exposed
sys.statutoryReport({ from: '2026-01-01', to: '2026-12-31' });

// 10. Low-level encryption helpers
sys.encrypt(payload);           // → envelope
sys.decrypt(envelope);          // → payload
```

---

## 5. Encryption Approach — גישת הצפנה

**Algorithm:** AES-256-GCM via `node:crypto` (Node standard library only).

**Key derivation:** `crypto.scryptSync(passphrase, salt, 32)`.
- Per-complaint 32-byte random salt.
- 12-byte random IV per encryption.
- 16-byte auth tag returned by `cipher.getAuthTag()`.
- If the caller hands us a 32-byte Buffer we use it directly (skip scrypt).

**Envelope schema** (JSON-safe, hex-encoded fields):
```json
{
  "v": 1,
  "alg": "aes-256-gcm",
  "salt": "<64 hex chars>",
  "iv":   "<24 hex chars>",
  "tag":  "<32 hex chars>",
  "ct":   "<ciphertext hex>"
}
```

**What is encrypted:**
- Complaint `description` — always.
- Interview `content` — always.
- Evidence `detail` if provided.

**What is NOT encrypted (kept as cleartext metadata):**
- Complaint ID / status / category / severity / SLA deadlines.
- Witness counts / interview counts / allowed roles.
- Aggregated statutory totals.

**Tamper-evidence:**
- Every state change appends to `history` with `sha256(JSON.stringify({id, at, event, payload, prevHash}))`.
- `prevHash` links entries into a chain. Mutating any past entry breaks verification.
- Tests enforce the chain invariant.

**Audit trail sink:** optional `auditLog` callback injectable via constructor — used for external SIEM / `_qa-reports` persistence.

---

## 6. Access Control — RBAC

Five built-in roles in `DEFAULT_ROLES`, extensible via constructor:

| Role                | view    | edit | decide | appeal | statutory |
|---------------------|---------|------|--------|--------|-----------|
| hr-officer          | all     | yes  | yes    | no     | yes       |
| harassment-officer  | all     | yes  | yes    | no     | yes       |
| legal               | all     | no   | no     | yes    | yes       |
| ceo                 | all     | no   | no     | yes    | yes       |
| complainant         | own     | no   | no     | yes    | no        |

**Rules enforced by `checkAccess()`:**
1. Actor role must appear in the complaint's `allowedRoles` list.
2. Actor role must have `view === true` or `view === 'own'` with matching `id`.
3. **Anonymous complaints** always block the `complainant` view path — the owner cannot look themselves up through the role.
4. Harassment cases automatically include `harassment-officer` at the front of the allowed list.

---

## 7. Anonymous Handling

When `anonymous: true`:
- `complainant.id`, `name`, `email` are **scrubbed** from the record.
- A random `pseudonym` (`anon-XXXXXXXX`) is assigned.
- An optional **one-way anon token** is generated via `sha256(id + complaintId)` — lets the system tie later correspondence to the same anonymous source without ever storing identity.
- `protectedFromRetaliation` is forced to `true` regardless of category.
- `complainant` role is removed from `allowedRoles` — there is no "view my own" path for anon cases.
- Even the complainant themselves cannot re-fetch the case via their role; they need a separate out-of-band claim procedure (out of scope for this module).

---

## 8. Conflict-of-Interest Detection

`assignInvestigator()` runs three checks before accepting an investigator:

1. Investigator ID must not match the complainant ID.
2. Investigator ID must not appear in the witness list.
3. Investigator may declare `relationships: [{targetId, kind}]`; if any `targetId` matches the complainant or any witness, the assignment is blocked.
4. Harassment cases additionally require `investigator.role === 'harassment-officer'`.

All blocked attempts are **recorded** in the audit trail (`investigator-coi-blocked` or `investigator-role-blocked`) so that failed attempts leave a forensic trace. Kobi's rule: nothing is deleted.

---

## 9. Retaliation Monitor

`retaliationMonitor(complaintId, daysAfter = 180)` opens a protection window. Per **חוק הגנה על עובדים (חשיפת עבירות)** the burden of proof in disputes during this window may shift to the employer.

Mechanics:
- Records `openedAt`, `until`, `complainantId` (or `anonToken`).
- Subsequent `reportRetaliation(complaintId, {type, actor, detail})` appends incidents and marks them `reviewed: false`.
- `isRetaliationWindowOpen(complaintId, atTime)` tells the caller whether protection is still active at an arbitrary time point — used by the personnel-action pipeline to block adverse actions.
- Tests confirm the window closes exactly at the advertised day boundary.

---

## 10. Test Coverage

All tests run via `node --test` (zero deps, Node ≥ 18).

```
tests 44   pass 44   fail 0
duration_ms ≈ 1411
```

Coverage areas:
- **Filing flow** — all 9 categories, validation, statutory routing for harassment / pay / ethics (8 tests)
- **Anonymous** — scrub, token, protection, fully-anonymous path (2)
- **Conflict of interest** — 4 distinct blocking rules + harassment-officer requirement (5)
- **Interview / hearing / verdict** — consent gate, hearing windows, finding validation (4)
- **Retaliation monitor** — 180-day window, incident reporting, no-active-monitor guard (3)
- **Encryption** — round-trip, tampered CT rejected by GCM tag, no plaintext leak in public view, no-key error (4)
- **RBAC** — restrictAccess, unknown role, role mismatch, own-only, anon block, denied throw (6)
- **Statutory report** — aggregation without identity leak (1)
- **Appeal process** — open, escalate, forbidden, upheld, rejected (3)
- **Audit trail** — hash-chain integrity + external sink (2)
- **Constants & internals** — bilingual labels, severity, roles, routing, sha256, crypto helpers (6)

---

## 11. Hebrew Glossary — מילון מונחים

| Hebrew                       | Transliteration       | English                                      |
|------------------------------|-----------------------|----------------------------------------------|
| תלונה                        | *tluna*               | complaint                                    |
| מתלונן / מתלוננת             | *mitlonen / mitlonenet* | complainant                                |
| הטרדה מינית                  | *hatrada minit*       | sexual harassment                            |
| אחראי/ת למניעת הטרדה מינית   | *achrai/t le-meniat …*| harassment-prevention officer                |
| חושף שחיתויות                | *chosef shchitut*     | whistleblower                                |
| חשיפת עבירות                 | *chasifat aveirot*    | exposure of offences                         |
| שכר שווה                     | *sachar shaveh*       | equal pay                                    |
| שוויון הזדמנויות             | *shivyon hizdamnuyot* | equal opportunities                          |
| אפליה                        | *aflaya*              | discrimination                               |
| נקמנות / התנכלות              | *nakmanut / hitnaklut*| retaliation                                  |
| שימוע                        | *shimua*              | hearing                                      |
| דוקטרינת השימוע              | *doktrinat ha-shimua* | hearing doctrine                             |
| ערעור                        | *ir'ur*               | appeal                                       |
| ועדת חקירה                   | *vaadat chakira*      | investigation committee                      |
| ניגוד עניינים                | *nigud inyanim*       | conflict of interest                         |
| הגנת הפרטיות                 | *haganat ha-pratiyut* | privacy protection                           |
| משרד העבודה                  | *misrad ha-avoda*     | Ministry of Labor                            |
| בית דין לעבודה               | *beit din le-avoda*   | Labor Court                                  |
| עד                           | *ed*                  | witness                                      |
| חקירה                        | *chakira*             | investigation                                |
| פסק / הכרעה                  | *pesak / hachra'a*    | verdict / ruling                             |
| מבוססת                       | *mevuseset*           | substantiated                                |
| לא מבוססת                    | *lo mevuseset*        | unsubstantiated                              |
| לא חד-משמעית                 | *lo chad-mashma'it*   | inconclusive                                 |
| דיווח אנונימי                | *divuach anonimi*     | anonymous report                             |
| תיק                          | *tik*                 | case file                                    |
| אכיפה                        | *achifa*              | enforcement                                  |
| סוד                          | *sod*                 | confidential                                 |
| הסכמה מדעת                   | *haskama mida'at*     | informed consent                             |

---

## 12. File Inventory

| Path                                                                                           | Bytes (approx.) | Role                         |
|-----------------------------------------------------------------------------------------------|-----------------|------------------------------|
| `onyx-procurement/src/hr/grievance.js`                                                         | ~28 KB          | Main module (zero deps)      |
| `onyx-procurement/test/hr/grievance.test.js`                                                   | ~21 KB          | 44 unit tests                |
| `_qa-reports/AG-Y075-grievance.md`                                                             | this file       | QA report (never delete)     |

---

## 13. Compliance Checklist — רשימת בקרת תאימות

- [x] חוק למניעת הטרדה מינית — dedicated `harassment-officer` role, 7-day investigation SLA, retaliation protection
- [x] חוק הגנה על עובדים (חשיפת עבירות) — whistleblower routing, retaliation monitor, legal-role escalation
- [x] חוק שכר שווה לעובדת ולעובד — dedicated `pay` category routed to equal-pay statute
- [x] חוק שוויון הזדמנויות בעבודה — discrimination routing, protection flag
- [x] חוק הגנת הפרטיות — AES-256-GCM at rest, RBAC on every read, consent gate on interviews
- [x] דוקטרינת השימוע — hearing plan with notice, response, decision windows
- [x] פקודת הבטיחות בעבודה — safety category routed with ministry notifiability
- [x] Audit trail — tamper-evident hash chain, append-only, never deleted (Kobi's rule)
- [x] Statutory aggregate report — identities never exposed
- [x] Bilingual Hebrew + English on every user-facing label
- [x] Zero npm dependencies — only `node:crypto`
- [x] 44 passing tests via `node --test`

---

## 14. Future Upgrades (not deletions)

Per **לא מוחקים רק משדרגים ומגדלים** — future iterations may add:
- Persistence adapter (Postgres / file-based) plugging into `auditLog`.
- Email / WhatsApp notification hooks via the existing `onyx-procurement/src/notifications` module.
- Integration with `hr/analytics.js` (X-12) for retaliation-risk scoring on personnel actions.
- Export to Form 1103 (annual Ministry of Labor aggregate report) once that agent ships.
- UI in Hebrew-RTL via the existing procurement dashboard.

None of these upgrades require touching the current module — they all plug in through the existing constructor hooks (`auditLog`, `clock`, `randomId`, `roles`) or via the exported constants.

---

*Report authored by Agent Y-075 • Techno-Kol Uzi Swarm • never delete, only upgrade and grow.*
