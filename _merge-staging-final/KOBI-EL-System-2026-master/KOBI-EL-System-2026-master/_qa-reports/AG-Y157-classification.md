# AG-Y157 — Classification Toolkit / ערכת סיווג

**Agent:** Y-157
**System:** Techno-Kol Uzi mega-ERP
**Module:** `onyx-ai/src/ml/classification.ts`
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 20 / 20 tests passing

---

## 1. Mission / משימה

### English
Build a pure-TypeScript, zero-dependency classification toolkit that can be
dropped into any ONYX AI pipeline for quick-fire supervised learning tasks.
No numpy, no scikit-learn, no npm packages — just Node built-ins.

### עברית
בניית ערכת סיווג ב-TypeScript טהור, ללא תלויות חיצוניות, שניתן לשלב
בכל צינור של ONYX AI למשימות למידה מפוקחת. ללא numpy, ללא scikit-learn,
ללא חבילות npm — רק מובנים של Node.

---

## 2. Deliverables / תוצרים

| File | Purpose / ייעוד |
|---|---|
| `onyx-ai/src/ml/classification.ts` | Engine — 3 classifiers + helpers + bilingual dictionaries / מנוע — 3 מסווגים + עזרים + מילון דו-לשוני |
| `onyx-ai/test/ml/classification.test.ts` | 20 unit + integration tests / 20 בדיקות |
| `_qa-reports/AG-Y157-classification.md` | This report / דו"ח זה |

Zero dependencies introduced. Zero files deleted. Node built-ins only.
לא נוספו תלויות. לא נמחקו קבצים. שימוש רק במובנים של Node.

---

## 3. Algorithms Implemented / אלגוריתמים שמומשו

| # | Algorithm / אלגוריתם | Class / מחלקה | Typical use case / שימוש אופייני |
|---|---|---|---|
| 1 | Binary Logistic Regression (batch gradient descent) / רגרסיה לוגיסטית בינארית (ירידת גרדיאנט אצוותית) | `LogisticRegression` | Invoice fraud probability / הסתברות הונאה בחשבונית |
| 2 | Gaussian Naive Bayes (multi-class) / בייס נאיבי גאוסיאני רב-מחלקתי | `GaussianNaiveBayes` | Defect classification / סיווג פגמים |
| 3 | Decision Stump (1-level tree, gini / entropy) / גדם החלטה (עץ גובה 1) | `DecisionStump` | Supplier delivery risk / סיכון אספקה |

### Key implementation notes / נקודות מימוש

- **Logistic regression** uses a numerically stable sigmoid (positive-branch
  and negative-branch formulas) plus optional L2 regularisation. Loss is
  stored per-epoch in `lossHistory` for convergence inspection.
- **Naive Bayes** computes per-class priors, means, and variances with
  variance smoothing proportional to the global maximum variance to avoid
  divide-by-zero on constant features. Classification is done via the
  log-sum-exp trick for numerical stability.
- **Decision stump** scans every unique value of every feature, uses
  midpoints between sorted unique values as candidate thresholds, and picks
  the split that minimises weighted Gini (default) or entropy.

---

## 4. Public API / ממשק ציבורי

```ts
import {
  // Classifiers
  LogisticRegression,
  GaussianNaiveBayes,
  DecisionStump,

  // Data utilities
  trainTestSplit,
  kFoldCrossValidate,

  // Metrics
  confusionMatrix,
  classificationReport,
  accuracyScore,
  formatConfusionMatrix,

  // Primitives
  sigmoid,
  mulberry32,
  shuffleInPlace,

  // Bilingual dictionaries
  BILINGUAL_FEATURES,
  translateLabel,
  featureLabelAt,
} from './ml/classification';
```

### Minimal example / דוגמה מינימלית

```ts
const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.25, 42);
const model = new LogisticRegression({ learningRate: 0.1, epochs: 500 });
model.fit(xTrain, yTrain);
const predictions = model.predict(xTest);
const report = classificationReport(yTest, predictions);
console.log(report.accuracy, report.macroF1);
```

---

## 5. Use Cases / מקרי שימוש

Four ready-made bilingual feature sets are exposed via `BILINGUAL_FEATURES`:

### 5.1 Invoice fraud probability / הסתברות הונאה בחשבונית
Features: `amount`, `roundAmount`, `vendorAgeMonths`, `priorInvoices`,
`submittedAfterHours`, `vatMismatch`.
Classes: `legitimate / לגיטימית`, `fraud / הונאה`.

### 5.2 Supplier delivery risk / סיכון אי-עמידה באספקה
Features: `pastLateRate`, `avgLeadTimeDays`, `orderSize`, `distanceKm`,
`weatherSeverity`.
Classes: `on-time / בזמן`, `late / באיחור`.

### 5.3 Defect classification / סיווג פגמים
Features: `sizeDeviationMm`, `surfaceRoughness`, `colorDeltaE`, `temperatureC`.
Classes: `no defect / ללא פגם`, `cosmetic / פגם קוסמטי`,
`structural / פגם מבני`.

### 5.4 Payment lateness risk / סיכון איחור בתשלום
Features: `customerAgeMonths`, `avgDaysToPay`, `openBalance`, `creditLimit`,
`priorLateCount`.
Classes: `on-time / בזמן`, `late / באיחור`.

---

## 6. Test Coverage / כיסוי בדיקות

All tests live in `onyx-ai/test/ml/classification.test.ts` and use only
`node:test` + `node:assert/strict`. Run with:

```
npx node --test --require ts-node/register test/ml/classification.test.ts
```

### 20 tests / 20 בדיקות

| # | Test / בדיקה |
|---|---|
| 1 | `sigmoid` boundary values and symmetry / סיגמואיד גבולות וסימטריה |
| 2 | `mulberry32` + `shuffleInPlace` reproducibility / מחולל אקראי דטרמיניסטי |
| 3 | `trainTestSplit` sizes & disjointness / חלוקת אימון ובדיקה |
| 4 | `trainTestSplit` guard rails / בדיקות תקינות לחלוקה |
| 5 | `LogisticRegression` trains and generalises / רגרסיה לוגיסטית מתכנסת |
| 6 | `LogisticRegression.predictProba` range / טווח הסתברות |
| 7 | `LogisticRegression` with string labels / תוויות מחרוזת |
| 8 | `GaussianNaiveBayes` multi-class accuracy / בייס נאיבי רב-מחלקתי |
| 9 | `GaussianNaiveBayes.predictDetailed` scores / חיזוי מפורט |
| 10 | `DecisionStump` finds obvious split / גדם מוצא פיצול ברור |
| 11 | `DecisionStump` multi-class majority / גדם רב-מחלקתי |
| 12 | `DecisionStump` entropy criterion / קריטריון אנטרופיה |
| 13 | `confusionMatrix` correctness / מטריצת בלבול מדויקת |
| 14 | `classificationReport` precision/recall/f1 / מדדים |
| 15 | `formatConfusionMatrix` bilingual header / כותרת דו-לשונית |
| 16 | `kFoldCrossValidate` 5-fold stability / תיקוף צולב יציב |
| 17 | `kFoldCrossValidate` rejects bad k / דחיית k לא חוקי |
| 18 | `BILINGUAL_FEATURES` all four use cases / ארבעה מקרי שימוש |
| 19 | `translateLabel` / `featureLabelAt` lookup / חיפוש דו-לשוני |
| 20 | End-to-end invoice fraud pipeline / תרחיש מלא לחשבונית |

### Result / תוצאה

```
ℹ tests 20
ℹ pass 20
ℹ fail 0
ℹ duration_ms ~1160
```

---

## 7. Non-Determinism Control / שליטה באי-דטרמיניזם

### English
Both `trainTestSplit` and `kFoldCrossValidate` accept an explicit `seed`
parameter that drives a deterministic Mulberry32 PRNG. Identical seed
sequences produce identical shuffles, which means:

1. Tests are reproducible on any machine.
2. Re-running the training pipeline after a data fix will produce the same
   train / test split unless the seed or dataset changes.
3. Model weights trained on the same data with the same seed are bit-exact.

### עברית
גם `trainTestSplit` וגם `kFoldCrossValidate` מקבלים פרמטר `seed` המניע
מחולל Mulberry32 דטרמיניסטי. זרעים זהים מייצרים ערבוב זהה, ולכן:

1. הבדיקות ניתנות לשחזור בכל מחשב.
2. הרצת הצינור מחדש על אותו מידע עם אותו זרע תניב אותה חלוקה.
3. משקלי המודל יהיו זהים בדיוק מלא בכל הרצה עם אותו זרע.

---

## 8. Compliance / עמידה בדרישות

| Requirement / דרישה | Status / מצב |
|---|---|
| No files deleted / ללא מחיקת קבצים | OK |
| Node built-ins only / רק מובנים של Node | OK — imports only `node:test` + `node:assert/strict` |
| Zero external dependencies / ללא תלויות חיצוניות | OK — `package.json` unchanged |
| Bilingual (he + en) throughout / דו-לשוני לכל אורך הקוד | OK — every public symbol, comment, and label |
| Logistic regression (gradient descent) / רגרסיה לוגיסטית (ירידת גרדיאנט) | OK — `LogisticRegression` |
| Naive Bayes | OK — `GaussianNaiveBayes` |
| Decision stump / גדם החלטה | OK — `DecisionStump` |
| Probability + class label output / הסתברות + תווית | OK — `predictDetailed` on LR & NB |
| Confusion matrix helper / מטריצת בלבול | OK — `confusionMatrix`, `formatConfusionMatrix` |
| Train/test split / חלוקת אימון-בדיקה | OK — `trainTestSplit` (seeded) |
| Cross-validation helper / תיקוף צולב | OK — `kFoldCrossValidate` |
| Bilingual feature labels / תוויות דו-לשוניות | OK — `BILINGUAL_FEATURES`, `translateLabel`, `featureLabelAt` |
| Four use cases covered / ארבעה מקרי שימוש | OK — invoice fraud, supplier delivery, defect class, payment lateness |
| 15+ tests / לפחות 15 בדיקות | OK — 20 |
| Bilingual report / דו"ח דו-לשוני | OK — this document |
| TypeScript strict / TypeScript קפדני | OK — zero new type errors; `npx tsc --noEmit` clean for `src/ml/**` and `test/ml/**` |

---

## 9. Files Touched / קבצים שנוגעו

- `onyx-ai/src/ml/classification.ts` — **NEW** (≈880 lines)
- `onyx-ai/test/ml/classification.test.ts` — **NEW** (≈420 lines)
- `_qa-reports/AG-Y157-classification.md` — **NEW** (this file)

No pre-existing file was modified or deleted.
לא נערך ולא נמחק אף קובץ קיים.

---

## 10. Known Limitations / מגבלות ידועות

### English
1. `LogisticRegression` is binary only. For multi-class problems, use
   `GaussianNaiveBayes` or wrap multiple logistic regressors in a
   one-vs-rest loop (not implemented here).
2. `DecisionStump` is deliberately depth-1. For deeper trees or forests,
   compose with a bagging wrapper (future work).
3. `kFoldCrossValidate` is not stratified — rare classes may be missing
   from some folds when the dataset is very small.
4. No feature scaling is applied automatically. Logistic regression will
   converge more slowly on unscaled features (see the `l2=0.001`,
   `epochs=4000` settings in the end-to-end invoice-fraud test).

### עברית
1. `LogisticRegression` מוגבלת לשני מחלקות. לבעיות רב-מחלקתיות יש
   להשתמש ב-`GaussianNaiveBayes` או לעטוף כמה מודלים ב-one-vs-rest.
2. `DecisionStump` הוא בכוונה בגובה 1. לעצים עמוקים יותר יש לשלב
   עם מעטפת bagging (עבודה עתידית).
3. `kFoldCrossValidate` אינו עושה stratification — מחלקות נדירות
   עלולות להיעדר מקפלים מסוימים בדטאסטים קטנים מאוד.
4. אין נרמול תכונות אוטומטי. הרגרסיה הלוגיסטית תתכנס לאט יותר על
   תכונות לא מנורמלות (ראו `l2=0.001`, `epochs=4000` בבדיקת
   התרחיש המלא).

---

## 11. Sign-off / אישור

### English
All 20 tests pass, TypeScript strict mode is clean for the new module,
and the toolkit obeys every constraint from the mission brief. Ready for
integration into any ONYX AI pipeline that needs lightweight supervised
classification without pulling in external ML libraries.

### עברית
כל 20 הבדיקות עוברות, TypeScript במצב קפדני נקי עבור המודול החדש,
והערכה עומדת בכל הדרישות. מוכן לשילוב בכל צינור של ONYX AI הזקוק
לסיווג מפוקח קל-משקל ללא ספריות חיצוניות.

**Status / סטטוס:** GREEN — 20 / 20 tests passing
**Branch:** master
**Agent:** Y-157 — Techno-Kol Uzi mega-ERP
