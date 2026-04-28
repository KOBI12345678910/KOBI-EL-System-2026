# AGENT-137 — Locales Audit

**Scope:** `locales/` directory (root of repo).
**Date:** 2026-04-29.
**Status:** PASS — all 4 locale bundles in perfect key-parity. One untranslated string (intentional placeholder). One runtime gap flagged.

---

## 1. Files Inventory

Path: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\locales\`

| File | Size | Purpose |
|---|---:|---|
| `he.json` | 11,105 B | Hebrew (he-IL) — **source / default** |
| `en.json` | 9,623 B | English (en-US) |
| `ar.json` | 11,740 B | Arabic-Israel (ar-IL) |
| `ru.json` | 12,723 B | Russian-Israel (ru-IL) |
| `_extracted.json` | 55,595 B | Auto-extracted hardcoded strings (report) |
| `_extracted.md` | 27,339 B | Same, human-readable |

No other locale codes present. No `de`, `fr`, `es`, `zh`, etc.

---

## 2. Per-Locale Metadata

| Code | Locale | Direction | Display | Plural rule | Default | First day of week | Owner |
|---|---|---|---|---|---|---:|---|
| `he` | he-IL | **rtl** | עברית | ILNRS | yes | 0 (Sun) | Agent 81 |
| `en` | en-US | ltr | English | ENRS | no | 0 (Sun) | Agent 81 |
| `ar` | ar-IL | **rtl** | العربية | ARNRS | no | 6 (Sat) | Agent 81 |
| `ru` | ru-IL | ltr | Русский | RURS | no | 1 (Mon) | Agent 81 |

All locales updated 2026-04-11. Currency standardized to ILS (₪) across all four; only number format / position changes (e.g. `ru` puts ₪ after, uses space thousands; `ar` uses `.` thousands and `,` decimal).

**RTL languages: `he`, `ar`** (2 of 4).

`he.json` declares a translation policy block (`__meta.policy`) — `ktiv-male`, second-person-masculine-singular-neutral verb forms. None of the other three locales declare a policy block.

---

## 3. Key Counts

**Total flat leaf keys per locale: 227 (identical across all four).**

| Section | he | en | ar | ru |
|---|---:|---:|---:|---:|
| common | 43 | 43 | 43 | 43 |
| navigation | 10 | 10 | 10 | 10 |
| payroll | 75 | 75 | 75 | 75 |
| finance | 15 | 15 | 15 | 15 |
| procurement | 4 | 4 | 4 | 4 |
| departments | 13 | 13 | 13 | 13 |
| errors | 12 | 12 | 12 | 12 |
| validation | 5 | 5 | 5 | 5 |
| confirmations | 12 | 12 | 12 | 12 |
| toasts | 6 | 6 | 6 | 6 |
| dates | 32 | 32 | 32 | 32 |
| **Total** | **227** | **227** | **227** | **227** |

All 11 top-level sections present in every locale, in the same order.

---

## 4. Missing Keys vs Source (he-IL)

| Locale | Missing | Extra | Result |
|---|---:|---:|---|
| en | 0 | 0 | clean |
| ar | 0 | 0 | clean |
| ru | 0 | 0 | clean |

No drift. No orphan keys. No locale has any key the source does not have, and vice versa.

---

## 5. Untranslated Strings

Untranslated = leaf value byte-equal to the Hebrew source value.

| Locale | Identical to source | Empty | Notes |
|---|---:|---:|---|
| en | 1 | 0 | `errors.http_status = "HTTP {status}"` (intentional — interpolation placeholder, no translation needed) |
| ar | 1 | 0 | same key |
| ru | 1 | 0 | same key |

**Effective untranslated: 0** — the single shared "untranslated" string is just a status code template (`"HTTP {status}"`) that legitimately reads the same in every language.

Spot-check confirms genuine localization quality:
- `common.save` → `שמור` / `Save` / `حفظ` / `Сохранить`
- `common.app_title` → `טכנו-קול עוזי — מערכת 2026` / `Techno-Kol Uzi — System 2026` / `تكنو-كول عوزي — نظام 2026` / `Техно-Коль Узи — Система 2026`

---

## 6. Hardcoded Strings Outside the Bundles (`_extracted.json`)

Generated 2026-04-11. Snapshot of strings still hardcoded in source code, not loaded from `locales/*.json`:

| Project | Hardcoded strings | Files |
|---|---:|---:|
| payroll-autonomous | 169 | 7 |
| onyx-ai | 94 | 14 |
| AI-Task-Manager | 20 | 11 |
| GPS-Connect | 1 | 1 |
| **Total** | **284** | **33** |

These are the i18n debt — Hebrew literals embedded in `.jsx`/`.ts` files that have not yet been migrated to translation keys. The 227 keys in the bundles are clean; these 284 are the queue still to extract.

---

## 7. Runtime Loader Gap (Important Finding)

`onyx-procurement/web/lib/i18n.js` (the active runtime translator) declares:

```js
const SUPPORTED = ['he', 'en'];
```

It also embeds its own ~50-key inline dictionary for `he` + `en` only. **It does NOT load `ar.json` or `ru.json`** from the `locales/` directory at all. The `ar.json` and `ru.json` bundles are present, complete, and structurally valid — but no runtime currently consumes them.

Implications:
- Switching `?lang=ar` or `?lang=ru` will throw (`unsupported lang`).
- The 227-key `ar`/`ru` payloads are dormant content waiting for a loader update.
- Whoever wires up Arabic / Russian later needs to: (a) extend `SUPPORTED`, (b) replace the inline dictionary with a `fetch('/locales/{lang}.json')` loader, (c) merge the existing inline keys into the JSON bundles (the inline dict has `nav.*`, `action.*`, `status.*` namespaces not present in the JSON).

---

## 8. Tooling

`scripts/i18n-extract.js` and `scripts/i18n-validate.js` exist — these are the producers of `_extracted.json` / `_extracted.md`. The bundles themselves are hand-curated.

---

## 9. Verdict

| Check | Result |
|---|---|
| All 4 locales present | PASS |
| Same key set across all locales | PASS (227/227/227/227) |
| RTL metadata correct (`he`, `ar`) | PASS |
| Currency / number format declared | PASS |
| First-day-of-week per locale | PASS (he/en=Sun, ar=Sat, ru=Mon) |
| No empty / placeholder values | PASS |
| No accidental copy-paste of source | PASS (1 intentional template) |
| Runtime supports all declared locales | **FAIL** — only `he`+`en` wired up |
| Source-code i18n migration complete | **PARTIAL** — 284 hardcoded strings still pending |

**Bundles: production-ready. Runtime + source-extraction: incomplete.**
