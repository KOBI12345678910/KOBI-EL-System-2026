# AGENT-192 — Duplicate Detection Audit
**Reference:** `_qa-reports/AG-X02-duplicate-detector.md` | **Date:** 2026-04-29
**Verdict:** PARTIAL PASS — engine is solid and tests green, but it is unwired and the customer/contact/vendor entity dedup runs on a much weaker path.

---

## 1. Inventory of duplicate-detection code paths

Three independent layers exist. They do not share code or tuning.

| # | Path | Language | Scope | Hebrew-aware | Tests |
|---|------|----------|-------|---|---|
| 1 | `onyx-procurement/src/dedup/duplicate-detector.js` (657 LOC) | JS, zero-dep | AP bills/invoices, fuzzy ladder S1..S6 | YES (full normalizer) | 43/43 PASS |
| 2 | `desktop-tutorial-server/src/services/duplicate.service.js` (40 LOC) | JS + better-sqlite3 | Inline invoice insert dedup | NO | none found |
| 3 | `api-server/src/routes/duplicate-resolution.ts` (256 LOC) | TS + Postgres `module_entities` | Generic entity scan/merge UI | NO | none found |

UI surface: `erp-app/src/pages/settings/duplicate-resolution.tsx` calls layer 3 only. The bills-review screen recommended in the AG-X02 sign-off (Section 10) is not wired — `findDuplicates` has zero importers outside its own test file.

Unrelated: `erp-app/src/lib/duplicate-record.ts` is a "Save As" record cloner (creates a fresh record with `(עותק)` suffix). It is not detection — do not confuse with the dedup engine.

---

## 2. Layer 1 — `onyx-procurement/src/dedup/duplicate-detector.js`

### What it does (verified against source)
- Public API: `findDuplicates(bills) → Group[]`, `isDuplicate(a, b) → {duplicate, confidence, signals}`, `normalizeHebrew`, `levenshtein`.
- Signal ladder (lines 373-451): S1 exact (1.00), S2 same-vendor+total ≤7d (0.90), S3 ±1% total ≤14d (0.75), S4 Levenshtein<3 vendor + exact total ≤7d (0.80), S5 Jaccard≥0.6 description + same amount (0.60), S6 reference reuse (0.55, flagged).
- Threshold for grouping: `confidence >= 0.5`. Group confidence = `max(score)` (lines 459-466) — conservative, matches the spec.
- Union-Find batch grouping (lines 506-630), deterministic primary selection by earliest date.

### Hebrew normalizer (lines 110-144)
Pipeline matches the QA report: NFKC → strip niqqud `[֑-ֽֿׁ-ׂׄ-ׇׅ]` → final-letter folding (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ) → strip ZWJ/ZWNJ/BOM/bidi → strip punctuation including gershayim (`״`) and geresh (`׳`) → collapse whitespace → lowercase Latin → trim.

Verified empirically by the test `S4: vendors differ by 1 char + exact total within 7 days` — OCR misread variants with niqqud and gershayim collapse to the same key.

### Levenshtein (lines 161-199)
Two-row rolling DP, O(min(|a|,|b|)) space. Always shorter string on the inner axis. Symmetric and null-safe.

### Test execution
```
node --test onyx-procurement/test/payroll/duplicate-detector.test.js
tests 43   pass 43   fail 0   duration_ms ~5770
```
All assertions in the QA report's coverage table reproduce. Notable green tests:
- `S4: vendors differ by 1 char + exact total within 7 days → 0.80`
- `real-world: OCR misread vendor (Hebrew) + identical total → caught by S4`
- `real-world: bilingual labels present on every signal`
- `real-world: inputs are not mutated by the detector`
- `real-world: Israeli DD/MM/YYYY date format understood`

### Gaps in this layer
- **No customer or contact entity coverage.** The fields it reads are vendor-shaped (`vendor_name`, `vendor_id`, `invoice_no`, `total`, `date`, `description`, `check_no`). Reusing it for customers/contacts requires either an adapter or a parameterized field map.
- **No phone or email signals.** Customer dedup typically wants normalized phone (E.164 with leading 0 vs +972 reconciliation) and lowercased email — this engine has neither.
- **No tax-id / company-id signal.** Israeli ח״פ / ת״ז would be a strong hard-match key for both customers and vendors and is missing from the ladder.
- **O(n²) on input.** Acceptable for daily AP (a few thousand bills), but customer tables run into tens-of-thousands and would benefit from a blocking key (e.g., normalized first-3-letters or phonetic hash) before pairwise comparison.

---

## 3. Layer 2 — `desktop-tutorial-server/src/services/duplicate.service.js`

40-line synchronous SQLite check used at invoice insert time:
- Exact `supplier_id + invoice_number` match → `match_type: 'exact_number'`.
- Same `supplier_id` + same `amount` + `julianday` window of 7 days → `match_type: 'amount_date'`.

**Issues:**
- No Hebrew normalization at all. Two suppliers with the same name but different niqqud or final letters slip through unless they share `supplier_id`.
- Uses raw `amount = ?` equality with no tolerance — floating point and rounding to agora not handled.
- No Levenshtein, no fuzzy vendor name. Layer 1's strength is wasted here.
- Returns duplicates but the calling route (`desktop-tutorial-server/src/routes/invoices.js`) only uses the result for a warn-then-insert flow, not blocking.

**Recommendation:** replace internals with `require('@onyx/dedup').isDuplicate` once Layer 1 is published as a package, OR import via relative path. Even keeping the SQL prefilter is fine — the gap is downstream, not upstream.

---

## 4. Layer 3 — `api-server/src/routes/duplicate-resolution.ts`

Generic entity scan against `entity_records.data->>field` with a self-rolled `similarity()` (lines 119-148). Produces `duplicate_groups` and `duplicate_candidates` Postgres tables with merge / false-positive workflow.

### Critical gaps for customer/vendor/contact dedup
1. **No Hebrew normalization on `valA`/`valB`** (lines 70-75). Code is `data?.[matchField]?.toString().toLowerCase()`. Two customers stored as `"אלקטרו גל בע״מ"` and `"אלקטרו-גל בע\"מ"` will compare letter-by-letter with different gershayim and likely score below threshold. Final letters (`שלום` vs `שלומ`) likewise miss. `toLowerCase()` is a no-op on Hebrew.
2. **Single-field comparison**, default `matchField = 'name'`. Customer dedup needs to combine name + phone + email + tax-id; this only does one column at a time.
3. **`similarity` is a Levenshtein ratio**, identical in spirit to Layer 1's tool but reimplemented. No bilingual signal labels.
4. **`LIMIT 500`** on the scan query (line 62) silently caps real datasets. Larger tenants will get incomplete groups with no warning.
5. **`processed.add(records.rows[j].id)` inside the inner loop** (line 81) prevents one record from joining multiple groups, which can break transitive matches that Layer 1's Union-Find handles correctly.
6. **Threshold default 0.8** is reasonable for Latin but too strict for Hebrew once you account for niqqud and final letters — without normalization, true matches will routinely score 0.6-0.75 and be missed.
7. **No tests.** No automated coverage for the merge path either, which is destructive (`UPDATE entity_records SET status='merged'`).

---

## 5. Convergence recommendation

The cheapest high-impact change: route Layer 3's scan through Layer 1's `normalizeHebrew` + a small adapter that maps generic entity records to the `{vendor_name, total, date}` shape expected by `collectSignals`. Concretely:

1. Publish `onyx-procurement/src/dedup/duplicate-detector.js` as `@onyx/dedup` (or import via relative path from api-server).
2. In `duplicate-resolution.ts` line 70-78, replace `data?.[matchField]?.toString().toLowerCase()` with `normalizeHebrew(data?.[matchField])`.
3. For customer/vendor entity types, add a multi-field adapter that builds a synthetic "bill" with `vendor_name=name`, `invoice_no=tax_id||company_id`, `total=NaN`, `date=created_at` so S1/S4 still fire on tax-id collisions and similar names.
4. Wire the bills-review UI as the AG-X02 sign-off (Section 10) recommended — currently absent.
5. Add a `LIMIT` config and remove the early `processed.add(j)` so transitive groups close correctly.

---

## 6. Bilingual labels (audit trail check)

Layer 1: every signal carries `label_he` + `label_en` and the test `real-world: bilingual labels present on every signal` enforces it programmatically — confirmed.
Layer 2: no labels at all (returns `match_type: 'exact_number' | 'amount_date'` only).
Layer 3: error strings are Hebrew-only (`'שגיאה בסריקת כפילויות'`, `'נדרש לבחור רשומה שורדת'`). Bilingual UX is not satisfied here.

---

## 7. Sign-off

| Area | Status |
|---|---|
| AG-X02 engine (bills) | PASS — 43/43 tests green, Hebrew normalizer fully exercised |
| AG-X02 engine integration | FAIL — zero importers, AP bills-review UI not wired |
| Customer / vendor / contact dedup | PARTIAL — runs through Layer 3 with no Hebrew normalization, weak coverage |
| Hebrew fuzzy matching across all paths | FAIL — only Layer 1 implements it; Layers 2 and 3 use plain `toLowerCase` |
| Bilingual signal labels | PARTIAL — Layer 1 only |
| Test coverage on production paths (Layers 2 & 3) | FAIL — zero |

**Recommendation:** keep Layer 1 as the system's canonical engine, retire Layer 2's bespoke logic and Layer 3's `similarity()`, and route both through `@onyx/dedup` with field-map adapters per entity type. Until that lands, the customer/contact dedup that ships through `/api/duplicates/scan/:entityType` will under-detect Hebrew duplicates.

---

## 8. Key file paths

- Engine: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\dedup\duplicate-detector.js`
- Tests: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\duplicate-detector.test.js`
- Generic scan route: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\duplicate-resolution.ts`
- Inline invoice check: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\desktop-tutorial-server\src\services\duplicate.service.js`
- UI page: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\settings\duplicate-resolution.tsx`
- Reference report: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-X02-duplicate-detector.md`
