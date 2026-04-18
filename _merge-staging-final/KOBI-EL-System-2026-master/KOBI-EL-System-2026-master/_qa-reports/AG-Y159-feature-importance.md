# AG-Y159 — Feature Importance Analyzer

## מנתח חשיבות פיצ'רים — דוח QA דו-לשוני

**Agent:** Y-159
**Project:** Techno-Kol Uzi mega-ERP / ONYX AI
**Module:** `onyx-ai/src/ml/feature-importance.ts`
**Date:** 2026-04-11
**Status:** PASS — 23 / 23 tests green
**External dependencies:** none (Node built-ins only, `node:crypto` for seeding)

---

## 1. Scope / היקף

### English
This module ranks features of any tabular dataset against an injectable
black-box model using three complementary criteria:

1. **Permutation Importance** — how much the model's loss degrades when one
   column is randomly shuffled while the rest of the dataset is kept intact.
2. **Variance-Based Importance** — coefficient of variation of each column,
   a fast screening heuristic that flags columns with no dispersion.
3. **Mutual Information (discrete)** — I(X; Y) in bits, computed after
   equal-frequency binning of X and Y. Captures non-linear dependencies the
   other two methods would miss.

A weighted combined score (`0.6·perm + 0.2·var + 0.2·MI`, all normalised to
[0, 1] by min-max) produces the final ranking.

### עברית
המודול מדרג פיצ'רים של כל סט-נתונים טבלאי מול מודל מוזרק ("קופסה שחורה")
באמצעות שלוש מדידות משלימות:

1. **חשיבות לפי ערבוב (Permutation)** — כמה ההפסד של המודל מתדרדר
   כאשר עמודה אחת בלבד מעורבת אקראית ושאר הנתונים נשארים זהים.
2. **חשיבות לפי שונות (Variance)** — מקדם השונות של כל עמודה. יוריסטיקה
   מהירה שמסמנת עמודות קבועות חסרות מידע.
3. **מידע הדדי בדיד (Mutual Information)** — I(X; Y) בביטים, לאחר חלוקה
   לתאי שכיחות שווה. לוכד תלות לא-לינארית בין הפיצ'ר למטרה.

ציון משוקלב אחד (`0.6·ערבוב + 0.2·שונות + 0.2·מידע-הדדי`, כל הערכים
מנורמלים ל-[0, 1] ע"י min-max) מפיק את הדירוג הסופי.

---

## 2. Public API / ממשק ציבורי

| Symbol | Kind | Purpose (EN) | מטרה (HE) |
| :-- | :-- | :-- | :-- |
| `BilingualFeatureName` | interface | `{id, en, he}` per column | שם דו-לשוני לעמודה |
| `PredictFn` | type | `(rows) => predictions` | פונקציית חיזוי מוזרקת |
| `LossFn` | type | `(yTrue, yPred) => number` | פונקציית הפסד מוזרקת |
| `FeatureImportanceInput` | interface | Analyzer input contract | חוזה קלט למנתח |
| `FeatureScore` | interface | Per-feature score + rank | ציון ודירוג לפיצ'ר |
| `FeatureImportanceResult` | interface | Full analyzer output | הפלט המלא |
| `analyzeFeatureImportance` | function | Main entry point | פונקציה ראשית |
| `renderBilingualReport` | function | Text report renderer | מעבד דוח טקסט |
| `meanSquaredError` | function | Default loss | הפסד MSE |
| `meanAbsoluteError` | function | Alternative loss | הפסד MAE |
| `createSeededRng` | function | Mulberry32 PRNG | מחולל אקראי |
| `equalFrequencyBin` | function | Rank-based binning | חלוקה לתאי שכיחות שווה |
| `discreteMutualInformation` | function | I(X; Y) in bits | מידע הדדי |
| `zipFeatureNames` | function | Build name list | בניית רשימת שמות |
| `topNFeatures` | function | Top-N slice | N הפיצ'רים המובילים |

All public symbols are `export`s from the single file
`onyx-ai/src/ml/feature-importance.ts`. No files are deleted or modified
outside the two new artefacts in this report.

---

## 3. Test plan / תוכנית בדיקות (23 tests)

| # | Test | EN | HE |
| :--: | :-- | :-- | :-- |
| 01 | MSE perfect | Zero when predictions match | אפס כאשר החיזוי מושלם |
| 02 | MSE known value | Basic arithmetic check | חישוב ידני |
| 03 | MAE known value | Basic arithmetic check | חישוב ידני |
| 04 | PRNG determinism | Same seed → same sequence in [0,1) | אותו זרע → אותה סדרה |
| 05 | Equal-frequency binning | Uniform bin occupancy | חלוקה אחידה של תאים |
| 06 | MI independent | Two independent columns → MI ≈ 0 | עמודות בלתי תלויות → MI≈0 |
| 07 | MI identical | Two identical binary columns → 1 bit | עמודות זהות → ביט אחד |
| 08 | Noise ranked last | Unrelated column is last | עמודה בלתי רלוונטית בסוף |
| 09 | Unused column → perm 0 | Oracle ignores noise → perm=0 | Oracle מתעלם → ערבוב=0 |
| 10 | Used columns → perm > 0 | price, qty get positive perm scores | משתנים בשימוש → ערבוב חיובי |
| 11 | Strict 1-based ranks | Ranks equal [1, 2, 3] | דירוג 1,2,3 |
| 12 | Combined ∈ [0, 1] | Range clamp on combined | תחום משוקלב |
| 13 | Deterministic run | Same seed → same result | אותו זרע → אותו פלט |
| 14 | Constant predictor | All perm scores = 0 | חיזוי קבוע → ערבוב אפס |
| 15 | Bad `y` length | Throws bilingual error | שגיאה על אורך y שגוי |
| 16 | Duplicate feature id | Throws | שגיאה על מזהה כפול |
| 17 | Non-finite cell | Throws | שגיאה על ערך לא-סופי |
| 18 | MI peaks on driver | MI(drive) > MI(decoy) | MI של משתנה אמיתי גדול יותר |
| 19 | Bilingual report | Contains HE + EN headers | דוח דו-לשוני מכיל כותרות |
| 20 | `zipFeatureNames` | Parallel list build + mismatch error | בנייה מקבילית + שגיאה |
| 21 | `topNFeatures` | Slice + edge cases | חיתוך + מקרי קצה |
| 22 | Custom loss (MAE) | Still ranks noise last under MAE | דירוג תקין עם MAE |
| 23 | Metadata echoed | `nSamples`, `seed`, etc. match input | מטא-דאטה משוחזר |

Test file: `onyx-ai/test/ml/feature-importance.test.ts`
Execution: `TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/ml/feature-importance.test.ts`

---

## 4. Test run log / יומן הרצה

```
 tests 23
 suites 0
 pass 23
 fail 0
 cancelled 0
 skipped 0
 todo 0
 duration_ms 440.36
```

All 23 tests passed on the first green run after the two fixes noted in
§7 (equal-frequency binning rank-based, combined score weighted). No
external services, no network, no filesystem writes. Pure in-memory.

---

## 5. Numerical evidence / עדויות מספריות

### Synthetic fixture / קלט סינתטי

- Samples / דגימות: 80
- Features / פיצ'רים: `price` (uniform 10..99), `qty` (uniform 1..20),
  `noise` (sin wave, no relation to target)
- Target / מטרה: `y = 2·price + 5·qty`
- Predict fn / חיזוי: oracle linear model (exact match)
- Seed / זרע: 101, `nRepeats`: 3, `miBins`: default (≈√80 → 9, clamped to 8)
- Baseline loss / הפסד בסיס: **0.0000** (oracle is exact)

### Score table / טבלת ציונים

| Rank | Feature (EN) | פיצ'ר (HE) | Permut. (Δ loss) | Variance (CV) | MI (bits) | Combined |
| :--: | :-- | :-- | --: | --: | --: | --: |
| 1 | Unit Price | מחיר ליחידה | 4671.1667 | 0.4960 | 1.1818 | 0.8000 |
| 2 | Quantity | כמות | 1797.9167 | 0.5941 | 0.9571 | 0.3250 |
| 3 | Noise Column | עמודת רעש | 0.0000 | 14.6874 | 0.7632 | 0.2000 |

Reading / פירוש:

- **Permutation** correctly zeroes out on `noise` and is positive on
  `price` and `qty` — the oracle never reads `noise`, so shuffling it
  cannot move predictions.
- **Variance (CV)** is largest on `noise` because its mean is ~0 and its
  stddev is ~2.12 — this is exactly why variance alone is a weak signal
  and why we combine it with the other two.
- **Mutual information** is strongest on `price` (the dominant driver),
  medium on `qty`, and weakest on `noise` — matching the model.
- **Combined** uses the weighted formula and places `price` first,
  `qty` second, `noise` last.

---

## 6. Bilingual features handling / טיפול דו-לשוני

- Feature names are a first-class type (`BilingualFeatureName`) so HE/EN
  travel with the data through the whole pipeline — there is no ad-hoc
  string concatenation anywhere.
- `renderBilingualReport()` emits a deterministic box-drawing table with
  HE and EN as separate columns, plus a legend in both languages. No
  markdown dependency, no RTL hacks — works in any UTF-8 terminal or
  markdown viewer.
- Validation errors are raised in **both languages** (English ASCII
  side and Hebrew side joined by ` / `), matching the project's i18n
  convention already present in `onyx-ai/src/security.ts` and
  `onyx-ai/src/health.ts`.
- `zipFeatureNames(ids, en, he)` is the canonical helper for projects
  that already hold EN and HE labels as parallel arrays.

---

## 7. Risks & mitigations / סיכונים והתמודדות

| Risk / סיכון | Mitigation / מיגון |
| :-- | :-- |
| Permutation shuffling is random → flaky tests | Deterministic Mulberry32 PRNG with explicit `seed` |
| Combined score dominated by raw variance | `0.6 / 0.2 / 0.2` weighting keeps permutation in charge |
| MI biased for continuous data | Rank-based equal-frequency binning instead of equal-width |
| Dataset mutation | Analyser clones the matrix and restores each column after use |
| Non-finite inputs silently pollute scores | Strict validation throws a bilingual error |
| Caller supplies `predict` with wrong shape | Length check after every call inside the permutation loop |

---

## 8. Compliance / ציות לחוקים

| Rule / חוק | Status |
| :-- | :--: |
| Never delete existing files / אין מחיקה | OK — two new files, one new markdown report |
| Built-ins only / Node built-ins בלבד | OK — only `node:crypto` imported |
| Bilingual output / פלט דו-לשוני | OK — HE & EN in types, errors, report |
| 15+ tests / 15+ בדיקות | OK — 23 tests |
| Injectable model / מודל מוזרק | OK — `predict` passed as parameter |
| Zero `any`-cast escapes | OK — `strict: true` `tsc --noEmit` clean |

---

## 9. Files touched / קבצים שנוגעו

| Path | Change |
| :-- | :-- |
| `onyx-ai/src/ml/feature-importance.ts` | NEW — analyzer implementation |
| `onyx-ai/test/ml/feature-importance.test.ts` | NEW — 23 deterministic tests |
| `_qa-reports/AG-Y159-feature-importance.md` | NEW — this report |

No existing file was modified or deleted / לא שונה ולא נמחק קובץ קיים.

---

## 10. How to rerun / הפעלה מחדש

```bash
cd onyx-ai
TS_NODE_TRANSPILE_ONLY=true \
  npx node --test --require ts-node/register \
  test/ml/feature-importance.test.ts
```

End of report / סוף דוח.
