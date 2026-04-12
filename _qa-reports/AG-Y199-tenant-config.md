# AG-Y199 — Multi-Tenant Config Merger — QA Report

**Agent**: Y-199 Multi-Tenant Config Merger
**Module**: `onyx-procurement/src/wiring/tenant-config.js`
**Tests**: `onyx-procurement/test/wiring/tenant-config.test.js`
**Swarm**: Wiring / Foundations
**ERP**: Techno-Kol Uzi mega-ERP
**Rule**: לא מוחקים רק משדרגים ומגדלים — append-only, upgrade-and-grow
**Status**: GREEN — 34/34 tests pass
**Zero-dependency**: YES (Node 20+ built-ins only — `node:crypto`)
**Bilingual**: YES (Hebrew + English on every audit entry, every error, and every glossary row)
**Date**: 2026-04-11

---

## 1. Scope / היקף

### English
A reusable three-layer configuration merger that lets every tenant of the
Techno-Kol Uzi ERP combine a **global** baseline, an **organization**
profile, and a per-**user** overlay into a single effective configuration.
The module answers the recurring wiring question _"how do I respect the
user's preference without trampling the org-wide policy, while still
obeying the ERP-wide defaults?"_

Precedence: `user > org > global`. The org layer may declare
**locked fields** that user layers cannot override — and when a user
does attempt to override, the denial is recorded (not silently dropped),
so the UI can surface the lock to the end user.

### עברית
מודול מיזוג תצורה תלת-שכבתי המאפשר לכל לקוח של מערכת ה-ERP "טכנו-קול
עוזי" לאחד קו-בסיס **גלובלי**, פרופיל **ארגוני**, והעדפות
**משתמש** לתצורה אפקטיבית אחת. המודול עונה על השאלה החוזרת
_"איך אני מכבד את העדפת המשתמש בלי לרמוס את מדיניות הארגון ובלי
לאבד את ברירות המחדל המערכתיות?"_.

קדימות: `משתמש > ארגון > גלובלי`. שכבת הארגון יכולה להכריז על
**שדות נעולים** שמשתמשים לא יכולים לדרוס — וכאשר המשתמש מנסה
בכל זאת, הדחייה מתועדת במפורש (לא נבלעת בשקט) כדי שה-UI יוכל
להציג הודעה מתאימה.

---

## 2. Public API surface

| Method | Purpose | עברית |
|---|---|---|
| `new TenantConfigMerger({schema, now, strict})` | Construct a merger with schema | יצירת מַמזג עם סכמה |
| `merge(global, org, user)` | Merge three layers into `{effective, audit, diff, locked, warnings, errors, snapshotId, winnerLayer}` | מיזוג שלוש שכבות |
| `diff(prev, next)` | Standalone diff view — `{added, removed, changed, unchanged}` | תצוגת הבדלים עצמאית |
| `validate(cfg)` | Run schema validation against any config — `{ok, errors}` | בדיקת סכמה עצמאית |
| `history()` | Append-only audit log across every merge the instance has run | יומן ביקורת מצטבר |

**Exports**: `TenantConfigMerger`, `LAYERS`, `LAYER_PRECEDENCE`, `LAYER_NAMES`, `ACTIONS`, `_internals`.

---

## 3. Layer model / מודל השכבות

```
┌──────────────────────────────┐
│ user     (highest — unless   │
│           org has locked)    │
├──────────────────────────────┤
│ org      (can LOCK fields)   │
├──────────────────────────────┤
│ global   (ERP-wide baseline) │
└──────────────────────────────┘
```

- **Global** — loaded from `config/global.yaml`; shared across every tenant.
- **Org / Tenant** — per-organization overrides; may also declare locks.
- **User** — per-user overlay; never deletes anything, only sets.

### Lock declaration — two supported styles

**Style A — explicit array:**

```js
const org = {
  theme: 'dark',
  server: { port: 3100, __locked__: ['port'] },
  __locked__: ['theme'],  // locks top-level "theme"
};
```

**Style B — convenience wrapper:**

```js
const org = {
  timezone: { value: 'Asia/Jerusalem', locked: true },
};
```

Both styles normalise into a flat set of dotted paths internally and are
listed in `result.locked` after `merge()` returns.

---

## 4. Precedence semantics

| Scenario | Winner |
|---|---|
| Global only | global |
| Global + org (same path) | org |
| Global + user (same path) | user |
| Org + user (same path, not locked) | user |
| Org + user (same path, org-locked) | **org** — user override rejected and logged |
| Missing across all three, default in schema | schema default |

`result.winnerLayer[path]` records the layer that wrote the final value
so UIs can show "value set by organization" / "value set by you" badges.

---

## 5. Schema validation

A schema is a dotted-path rule map:

```js
const schema = {
  'server.port':       { type: 'integer', required: true, min: 1, max: 65535 },
  'theme':             { type: 'string', enum: ['light','dark','system'], default: 'light' },
  'features.maxUsers': { type: 'integer', min: 1, max: 10000 },
  'email':             { type: 'string', pattern: /^[a-z]+@[a-z]+\.[a-z]+$/ },
  'timezone':          { type: 'string', default: 'Asia/Jerusalem' },
};
```

Rule fields supported:

| Field | Effect |
|---|---|
| `type` | `string`, `number`, `integer`, `boolean`, `date`, `array`, `object` |
| `required` | Missing ↔ `SCHEMA_REQUIRED` error |
| `default` | Filled after merge if every layer omitted the path |
| `min`/`max` | Numeric bound (on numbers) **and** length bound (on strings) |
| `enum` | Allowed-values list |
| `pattern` | Regex (RegExp or string) |
| `secret` | Reserved for downstream redaction — not enforced at merge time |

Validation errors come back as bilingual objects:

```js
{ path: 'server.port', error: { he: 'שדה חובה חסר: "server.port".',
                                 en: 'Required field missing: "server.port".' } }
```

**Strict mode** (`new TenantConfigMerger({schema, strict: true})`) throws
with `err.errors` populated. Non-strict mode (default) returns errors on
`result.errors` so the caller can decide whether to surface or ignore.

---

## 6. Type coercion

Best-effort, lossless coercion runs AFTER merge and BEFORE validation.
Failures preserve the original value and append a `coerce.failed` entry
to the audit trail — nothing is silently dropped.

| From → To | Rule |
|---|---|
| `string` → `number`/`integer` | `Number(trim)`; integer requires whole number |
| `string` → `boolean` | `true/1/yes/on/y/כן/אמת` → true; `false/0/no/off/n/לא/שקר` → false |
| `number` → `boolean` | `0` ↔ false, else true |
| `string` → `date` | `new Date(str)` — invalid date fails closed |
| `string` → `array` | JSON array syntax OR CSV split on `,` |
| `string` → `object` | JSON object syntax only |
| `number`/`boolean` → `string` | `String(v)` |
| `date` → `string` | `toISOString()` |

The bilingual boolean list lets env vars like `FEATURE_BETA=כן` work
natively in Hebrew deployments.

---

## 7. Audit trail / יומן ביקורת

Every merge produces an ordered `audit` array. Each entry is bilingual:

```js
{
  at: 1712836800000,
  action: 'override',
  path: 'theme',
  layer: 'user',
  fromLayer: 'org',
  previousValue: 'dark',
  newValue: 'system',
  note: {
    he: 'שכבה "משתמש" דרסה את "theme" (קודם: ארגון).',
    en: 'Layer "user" overrode "theme" (was: organization).',
  },
}
```

Action types (`ACTIONS` export):

| Action | Meaning | עברית |
|---|---|---|
| `set` | Layer introduced the key for the first time | שכבה הגדירה שדה חדש |
| `override` | Higher layer replaced a lower one | שכבה גבוהה דרסה |
| `keep` | Higher layer did not change the value | שכבה לא שינתה |
| `lock.applied` | Org declared a lock on this path | הארגון נעל שדה |
| `lock.rejected` | User attempted to override a locked path | ניסיון דריסה נדחה |
| `coerce.ok` | Value coerced to schema type | הומר בהצלחה |
| `coerce.failed` | Coercion failed, original preserved | המרה נכשלה |
| `warn.unknown-key` | Key present but not in schema | שדה לא בסכמה |
| `schema.error` | Value failed validation | שגיאת סכמה |
| `schema.default` | Schema default filled an empty path | ברירת מחדל שמולאה |

`merger.history()` returns a shallow copy of **all** audit entries
produced by every `merge()` call on the instance — append-only, never
truncated.

---

## 8. Diff view / תצוגת הבדלים

`result.diff` contains three prepared views:

- `diff.vsGlobal` — changes the effective config introduces over the global baseline
- `diff.vsOrg` — changes relative to the organization layer
- `diff.vsUser` — typically empty for writable keys but surfaces coercion / default fills

Each view has four buckets: `{ added, removed, changed, unchanged }`.
Because the merger **never deletes**, `removed` is always empty in the
three stock views — it exists for when callers use the standalone
`merger.diff(a, b)` API against arbitrary inputs (e.g. before/after a
deploy).

---

## 9. Snapshot ID / מזהה תמונת-מצב

`result.snapshotId` is a 16-character SHA-256 hex digest computed over
`{effectiveFlat, sortedLockedPaths}`. It is:

- **Deterministic** — same inputs always yield the same ID (tested).
- **Sensitive** — a single changed value produces a different ID.
- **Cheap** — suitable as an HTTP ETag or cache key.

Typical use: the frontend caches the effective config keyed by snapshot
ID; when the ID changes, the SPA knows to reload user preferences.

---

## 10. Hebrew glossary / מילון

| Key | עברית | English |
|---|---|---|
| `global` | גלובלי | global |
| `org` | ארגון | organization |
| `user` | משתמש | user |
| `set` | הגדרה | set |
| `override` | דריסה | override |
| `keep` | השארה | keep |
| `lock.applied` | נעילה הוחלה | lock applied |
| `lock.rejected` | דריסה נדחתה עקב נעילה | override rejected due to lock |
| `coerce.ok` | המרת סוג הצליחה | coercion succeeded |
| `coerce.failed` | המרת סוג נכשלה | coercion failed |
| `warn.unknown-key` | אזהרה: שדה לא בסכמה | unknown key warning |
| `schema.error` | שגיאת סכמה | schema error |
| `schema.default` | ברירת מחדל מהסכמה | schema default |
| `schema` | סכמה | schema |
| `effective` | אפקטיבי | effective |
| `audit` | יומן ביקורת | audit |
| `diff` | הבדלים | diff |
| `snapshot` | תמונת מצב | snapshot |
| `locked` | נעול | locked |
| `precedence` | קדימות | precedence |
| `tenant` | לקוח / ארגון | tenant |

---

## 11. Test coverage (34 cases, all passing)

| # | Test | Area |
|---|---|---|
| 01 | Precedence user > org > global for scalars | precedence |
| 02 | User overrides org for non-locked fields | precedence |
| 03 | Org `__locked__` array prevents user override | locking |
| 04 | `{value, locked:true}` convenience lock | locking |
| 05 | Deep nested paths honour precedence + locks | nesting |
| 06 | Required field missing → error | schema |
| 07 | Enum violation flagged bilingually | schema |
| 08 | min/max bounds on integer | schema |
| 09 | String "42" coerced to integer | coercion |
| 10 | String "true"/"false" coerced to boolean | coercion |
| 11 | Hebrew "כן"/"לא" coerced to boolean | coercion |
| 12 | Failed coercion preserves original + audit entry | coercion |
| 13 | Every audit entry has bilingual `note.he`/`note.en` | bilingual |
| 14 | `diff.vsGlobal` reports added/changed | diff |
| 15 | Deterministic `snapshotId` for identical inputs | snapshot |
| 16 | Different inputs → different `snapshotId` | snapshot |
| 17 | Strict mode throws on validation errors | strict |
| 18 | Non-strict mode completes merge with errors list | non-strict |
| 19 | Schema defaults fill missing keys | defaults |
| 20 | Unknown keys preserved + flagged (never deleted) | no-delete |
| 21 | Append-only history accumulates across merges | history |
| 22 | Input validation: non-object layer throws | input |
| 23 | Standalone `diff(a,b)` API | diff |
| 24 | Standalone `validate(cfg)` API | validate |
| 25 | `winnerLayer` records origin of each effective value | attribution |
| 26 | Pattern validation for strings | schema |
| 27 | CSV string → array coercion | coercion |
| 28 | `LAYER_PRECEDENCE` ordered global → user | exports |
| 29 | `normaliseLayer` unwraps `{value, locked}` | internals |
| 30 | `extractLocks` finds both styles at any depth | internals |
| 31 | User cannot clear an org-set key (no-delete) | no-delete |
| 32 | Audit order reflects merge precedence | bilingual/order |
| 33 | Date-string → `Date` coercion | coercion |
| 34 | `lock.applied` recorded even without user attempt | locking |

Run:
```bash
cd onyx-procurement
node --test test/wiring/tenant-config.test.js
```

Output:
```
ℹ tests 34
ℹ pass 34
ℹ fail 0
ℹ duration_ms 118.61
```

---

## 12. Security notes / הערות אבטחה

### English
1. **No `eval` / `new Function`** — the merger is a pure data-shape
   transformer; nothing in the configuration is interpreted as code.
2. **Lock enforcement is not silent** — every rejected user override
   produces a `lock.rejected` audit entry containing the attempted
   value, so the UI can flag the denial and the SOC can audit attempts.
3. **Append-only history** — `merger.history()` returns a copy; the
   internal log exposes no mutation API.
4. **Input type guard** — non-object layers throw immediately (before
   any merging happens), preventing prototype-pollution vectors.
5. **Unknown keys** are preserved but marked `warn.unknown-key`; the
   caller decides whether to persist or strip them downstream.
6. **Secret fields** — schema supports a `secret: true` flag that
   downstream components (e.g. audit log serializer) can read to
   redact values from dumps.

### עברית
1. **ללא `eval` או `new Function`** — המודול הוא אך ורק טרנספורמציה
   של מבני נתונים; דבר מהקונפיג אינו מפורש כקוד.
2. **אכיפת נעילה אינה בשקט** — כל ניסיון דריסה של משתמש על שדה נעול
   מתועד ביומן עם הערך שניסו להגדיר, כדי שה-UI יוכל להציג דחייה
   והצוות הרלוונטי יוכל לבדוק ניסיונות.
3. **יומן append-only** — `history()` מחזיר עותק; אין API למחיקה
   או שינוי של היומן הפנימי.
4. **בדיקת קלט** — שכבה שאינה אובייקט זורקת חריגה מיידית לפני כל
   מיזוג, ומונעת וקטור של prototype-pollution.
5. **שדות לא מוכרים** נשמרים אך מסומנים כ-`warn.unknown-key`;
   המתקשר מחליט האם לשמור או להסיר.
6. **שדות סודיים** — הסכמה תומכת בדגל `secret: true` שרכיבי
   downstream יכולים לקרוא כדי להסתיר ערכים בפלט ביקורת.

---

## 13. Non-deletion / upgrade-and-grow compliance

This module is **purely additive**:

- No existing file was modified. `src/wiring/` and `test/wiring/` are
  new sub-trees.
- `merge()` is a function over inputs — it does not touch any
  filesystem, database, or shared state beyond its own append-only
  `_history` array.
- **No key is ever deleted** during merge. Higher layers overlay lower
  ones; unknown keys (not in schema) are preserved and merely flagged;
  org locks prevent user overrides but do not remove the user's
  attempted value — the attempt is recorded in the audit trail.
- Future upgrades (pluggable serialisers, per-tenant schema, remote
  override auditing, RBAC-gated merges) are all additive — they can
  hang off the same `TenantConfigMerger` class without breaking the
  five-method public surface listed in §2.

---

## 14. Integration checklist / רשימת אינטגרציה

- [ ] Wire into `src/config/config-manager.js` so per-tenant requests
      resolve through `TenantConfigMerger.merge(global, tenantOverrides, userPrefs)`.
- [ ] Expose `GET /api/tenant/:id/config` returning `{effective, locked,
      snapshotId}` for the SPA.
- [ ] Expose `GET /api/tenant/:id/config/audit?since=...` returning the
      bilingual audit tail for the admin screen.
- [ ] Add a pre-commit hook in the settings UI that re-runs
      `merger.validate()` against the pending user layer before PATCH.
- [ ] Surface `winnerLayer[path]` as an "overridable / locked-by-org"
      badge on every settings control.
- [ ] Add a nightly cron that compares yesterday's snapshot IDs vs
      today's and posts a digest to the ops channel.

---

**Agent Y-199 — completed 2026-04-11 — 34/34 GREEN**
**סוכן Y-199 — הושלם 11/04/2026 — 34/34 ירוק**
