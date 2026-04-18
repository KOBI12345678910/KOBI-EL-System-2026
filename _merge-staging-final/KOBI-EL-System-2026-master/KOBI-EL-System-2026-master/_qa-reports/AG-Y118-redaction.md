# AG-Y118 — Document Redaction Tool (RedactionTool)
**Agent:** Y-118 | **Swarm:** Office Docs | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 32/32 tests green (`node --test test/docs/redaction.test.js`)

---

## 1. Scope — היקף

A zero-dependency PII redactor that prepares text for external disclosure
under Israel's PDPL (חוק הגנת הפרטיות) and the ERP charter's minimisation
duty. It detects eight+ families of personal data, redacts them using any of
four methods, keeps an append-only audit trail per document, and can be
reversed only with a vault key gated by RBAC. Nothing is ever deleted —
redaction always produces a **new** version of the text and the original
stays untouched.

מודול השחרת PII אפס-תלויות המכין טקסט לחשיפה חיצונית תוך עמידה בחוק הגנת
הפרטיות ובמדיניות הצמצום של ה-ERP. הוא מאתר שמונה משפחות של נתונים אישיים,
מסתיר אותן באחת מארבע שיטות, שומר יומן ביקורת צובר בלבד לכל מסמך, וניתן
להחזרה רק באמצעות מפתח מרתף עם הרשאות RBAC. שום דבר לא נמחק — ההשחרה תמיד
יוצרת גרסה **חדשה** של הטקסט והמקור נשמר.

**Delivered files — קבצים שנמסרו**
- `onyx-procurement/src/docs/redaction.js` — `RedactionTool` class + frozen enums
- `onyx-procurement/test/docs/redaction.test.js` — 32 `node:test` tests
- `_qa-reports/AG-Y118-redaction.md` — this report

**Rules respected — כללים**
- לא מוחקים רק משדרגים ומגדלים — every redaction emits a new version; the
  original is never mutated; the append-only log survives forever
- Zero external deps — only `node:crypto`, `node:test`, `node:assert`
- Hebrew RTL + bilingual labels (`he` + `en`) on every public enum
- In-memory storage only (three `Map`s: vaults, logs, whitelist)
- Privacy by design — TOKENIZE vaults are short-lived and RBAC-gated

---

## 2. Public API — ממשק ציבורי

```js
const { RedactionTool } = require('./src/docs/redaction.js');
const rt = new RedactionTool({ clock, hebrewNames, actor });

rt.detectPII(text)                            // → Hit[]
rt.classifyPIIType(text)                      // → { total, types[], byCategory, hits[] }
rt.redactText(text, { method, categories, docId, vaultKey, actor })
rt.redactWithRules(text, rules[])             // custom regex list
rt.createRedactionMap(original, redacted)     // diff spans for audit
rt.reverseRedaction(redactedText, vaultKey, { role })  // TOKENIZE only
rt.batchRedact(documents[], rules?)           // bulk processor
rt.verifyNoPII(text)                          // → { safe, hits[], he, en }
rt.exportRedactionLog(docId)                  // audit trail for a docId
rt.whitelistTerms(terms[])                    // never-redact list
rt.visualDiff(original, redacted)             // highlighted before/after
```

Every method returns plain JSON-safe objects. Internal state is protected
by shallow copies so callers can never mutate the append-only store.

---

## 3. PII categories — קטגוריות PII

| id            | he                     | en                        | detector                                             |
|---------------|------------------------|---------------------------|------------------------------------------------------|
| `tz`          | תעודת זהות              | Israeli ID (TZ)           | 9-digit window + checksum (`isValidIsraeliTZ`)       |
| `phone`       | מספר טלפון              | Phone number              | `+972` / `05X` / `0X` Israeli dial patterns          |
| `email`       | דואר אלקטרוני            | Email address             | RFC-shaped mailbox + domain regex                    |
| `credit_card` | כרטיס אשראי             | Credit card (PAN)         | 13-19 digit run + Luhn check (`isValidLuhn`)         |
| `iban_il`     | חשבון IBAN ישראלי        | Israeli IBAN              | `IL` + 2 check + 4+4+4+4+3 digit groups              |
| `passport`    | דרכון                   | Passport number           | "דרכון"/"passport" context + 6-9 alphanumerics       |
| `id_keyword`  | מילת מפתח "ת.ז."         | ID keyword context        | "ת.ז." / "תעודת זהות" + trailing digit run           |
| `hebrew_name` | שם פרטי בעברית (מילון)  | Hebrew given name (dict)  | Seed dictionary of ~40 names, extensible             |
| `address`     | כתובת מגורים             | Street address            | Hebrew street-word + noun + number + optional city   |

The detector **always** validates structural matches before reporting them:
invalid TZ checksums and Luhn-invalid PANs are silently dropped, which
protects us from false positives on internal invoice numbers, tracking ids,
and similar non-PII digit runs.

---

## 4. Redaction methods — שיטות השחרה

| id         | he           | en                        | output shape                       | reversible |
|------------|--------------|---------------------------|------------------------------------|------------|
| `block`    | חסימה         | Block (████)              | `████████████` — length-preserving | no         |
| `replace`  | החלפה         | Replace ([REDACTED])      | `[REDACTED]` token                 | no         |
| `hash`     | גיבוב         | Hash (SHA-256 prefix)     | `HASH::abcd123456`                 | no         |
| `tokenize` | טוקניזציה     | Tokenize (reversible)     | `{{TOK:xxxxxxxx}}` + vault entry   | yes (RBAC) |

**BLOCK** keeps the visual footprint of the original, so redacted PDFs look
plausible under visual review. **REPLACE** is the safest default for human
consumption — it is obvious and cannot leak length metadata. **HASH** gives
the auditor a stable, non-reversible correlation handle: the same email
always maps to the same prefix within a document, so reviewers can see which
occurrences refer to the same subject without knowing who that subject is.
**TOKENIZE** is the only reversible mode; the mapping is held in an
in-memory vault keyed by a caller-owned `vaultKey`, and `reverseRedaction`
enforces an RBAC check — only `admin`, `system`, or `privacy_officer` roles
may restore the original.

---

## 5. Israeli-specific patterns — תבניות ייחודיות לישראל

**Teudat Zehut (תעודת זהות)** — the detector uses the canonical Population
Registry algorithm: pad to 9 digits, alternate ×1/×2, sum digit-wise, assert
`sum % 10 === 0`. This rejects the common 9-digit test string `123456789`
(fails checksum) while accepting known valid ones like `123456782`,
`987654324`, `200000008`, `000000018`.

**Phone numbers (מספרי טלפון)** — supports `+972-5X-XXXXXXX`, `05X-XXXXXXX`
and `0X-XXXXXXX` patterns with optional dashes or spaces. Works equally
well on mobile (050-059) and landline (02, 03, 04, 08, 09) prefixes.

**IL IBAN (חשבון IBAN)** — 23-character layout: `IL` + 2 check + 4 (bank)
+ 4 (branch) + 4+4+3 (account). Spaces or dashes between groups accepted.

**Passport (דרכון)** — context-anchored on the Hebrew word "דרכון" or the
English "passport" followed by 6-9 alphanumerics. This avoids grabbing
random ID-shaped numbers that are not preceded by an explicit passport
keyword.

**Hebrew names (שמות עבריים)** — seed dictionary includes common Israeli
given names (משה, יעקב, דוד, שרה, רחל, נועה, יעל, ...). Callers can extend
it via the constructor's `hebrewNames` option; the detector uses Hebrew
letter word boundaries so `משהיקר` is not falsely split on "משה".

**Addresses (כתובות)** — heuristic looks for a street-type word (רחוב, רח',
שדרות, שד', כביש, סמטת, ככר, דרך) + noun + number, optionally followed by
a comma and a city name. This is intentionally conservative; callers that
need tighter address coverage should supply a custom rule via
`redactWithRules`.

---

## 6. Hebrew glossary — מילון עברי

| term            | Hebrew                  | notes                                             |
|-----------------|-------------------------|---------------------------------------------------|
| Redaction       | השחרה / הסתרה            | producing a reviewed version minus PII            |
| PII             | מידע אישי מזהה           | Personally Identifiable Information               |
| Tokenization    | טוקניזציה                | reversible substitution via a vault               |
| Vault           | מרתף / כספת              | short-lived in-memory store for tokens            |
| Whitelist       | רשימת היתר               | never-redact terms                                |
| Audit log       | יומן ביקורת              | append-only per-document log                      |
| Release         | חשיפה / שחרור            | external disclosure of a redacted doc             |
| Teudat Zehut    | תעודת זהות               | Israeli national ID number                        |
| PDPL            | חוק הגנת הפרטיות         | Israel's Protection of Privacy Law                |
| Checksum        | ספרת ביקורת              | validates structural correctness of an ID or PAN  |
| Privacy officer | קצין הגנת הפרטיות (DPO) | RBAC role allowed to reverse a TOKENIZE redaction |
| Minimisation    | צמצום                   | disclose the minimum data required                |
| Diff            | השוואה                   | span-level before/after map                       |

---

## 7. Test coverage — כיסוי בדיקות (32 tests)

```
✔ 01 isValidIsraeliTZ — known checksum values
✔ 02 isValidLuhn — standard PAN test vectors
✔ 03 detectPII — Israeli TZ (9 digits + checksum)
✔ 04 detectPII — invalid TZ checksum ignored
✔ 05 detectPII — Israeli mobile 05X-XXXXXXX format
✔ 06 detectPII — +972 international phone format
✔ 07 detectPII — email address
✔ 08 detectPII — credit card Luhn-valid
✔ 09 detectPII — invalid Luhn PAN rejected
✔ 10 detectPII — IL IBAN
✔ 11 detectPII — passport with Hebrew context word
✔ 12 detectPII — ת.ז. keyword context
✔ 13 detectPII — Hebrew dictionary name
✔ 14 detectPII — Hebrew address triple
✔ 15 redactText — BLOCK method length-preserving ████
✔ 16 redactText — REPLACE method emits [REDACTED]
✔ 17 redactText — HASH method emits HASH:: prefix
✔ 18 redactText — TOKENIZE yields vault tokens
✔ 19 reverseRedaction — round-trip through TOKENIZE
✔ 20 reverseRedaction — RBAC denies untrusted role
✔ 21 redactWithRules — custom regex rule list
✔ 22 createRedactionMap — captures divergent spans
✔ 23 verifyNoPII — clean input returns safe:true
✔ 24 verifyNoPII — dirty input lists leftover hits
✔ 25 whitelistTerms — protects literal term from redaction
✔ 26 visualDiff — highlights what changed
✔ 27 batchRedact — processes multiple docs + logs per docId
✔ 28 exportRedactionLog — append-only audit trail
✔ 29 classifyPIIType — groups hits + sorted types
✔ 30 redactText — categories filter restricts the scope
✔ 31 constants — bilingual labels present
✔ 32 redactText — rejects unknown method
ℹ tests 32  pass 32  fail 0  duration ~130ms
```

Coverage honours every requirement in the agent brief:
- all 9 PII categories exercised (tests 03-14)
- all 4 redaction methods exercised (tests 15-18)
- TOKENIZE round-trip reversibility + RBAC denial (tests 19-20)
- `verifyNoPII` safety net positive + negative (tests 23-24)
- `whitelistTerms` protection (test 25)
- `visualDiff` highlight markers (test 26)
- `batchRedact` bulk processing + per-docId logging (test 27)

---

## 8. Privacy-by-design rationale — שיקולי פרטיות

1. **Immutable original** — `redactText` never touches the input string;
   it returns a new `redactedText` property. Callers that want to "replace"
   the document do so at their own storage layer, and only after the
   append-only log has recorded the event.
2. **Vault lifetime** — TOKENIZE vaults live on the `RedactionTool`
   instance. Tests run in fresh instances. In production, the instance is
   meant to be created per-request (or per short-lived worker) and
   discarded when the redaction session ends. This is the "short-lived"
   property required by the brief.
3. **RBAC gate** — `reverseRedaction` raises `RBAC_DENIED` for any role
   outside `{admin, system, privacy_officer}`. The role is read from the
   explicit `{ role }` option first, then from the tool's default `actor`.
4. **Structural validation** — Luhn and Israeli-TZ checks ensure we don't
   accidentally flag internal invoice numbers, tracking IDs, or lottery
   numbers as PII, which would bloat the audit log and desensitise
   reviewers.
5. **Whitelist** — organisational identifiers such as `support@technokol.co.il`
   can be exempted once and stay exempt; they are checked against both
   `detectPII` and `redactWithRules`.
6. **Append-only log** — every `redactText` call that carries a `docId`
   produces an immutable (frozen) entry in `logs[docId]`. The exporter
   returns shallow clones so external callers cannot rewrite history.

---

## 9. Known limitations — מגבלות ידועות

- The Hebrew name dictionary is deliberately small (~40 entries). Teams
  that need wider coverage should pass a fuller list via `new
  RedactionTool({ hebrewNames: [...] })` or supply a custom rule via
  `redactWithRules`.
- The address heuristic is conservative; multi-line addresses and
  un-keyworded lines (just "Herzl 10, Tel Aviv") will not match. Use
  `redactWithRules` to widen detection when the incoming corpus warrants it.
- TOKENIZE vaults are per-instance and memory-only by design (privacy).
  Persisting tokens across processes is intentionally out of scope.
- `createRedactionMap` uses a 4-char anchor for resync and caps look-ahead
  at 200 chars; very long overlapping divergences may be reported as a
  single large span rather than many small ones.

---

## 10. How to run — הפעלה

```bash
# from onyx-procurement/
node --test test/docs/redaction.test.js
```

Exit code is 0 on success. The suite is deterministic: it uses fixed test
strings, no network access, no file system writes.

---

**Agent Y-118 signing off — לא מוחקים רק משדרגים ומגדלים.**
