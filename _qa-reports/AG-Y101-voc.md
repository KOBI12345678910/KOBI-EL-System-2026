# AG-Y101 — Voice of Customer (VOC) — QA Report

**Agent**: Y-101 Voice of Customer
**Module**: `onyx-procurement/src/customer/voc.js`
**Tests**: `onyx-procurement/test/customer/voc.test.js`
**Swarm**: Customer Experience
**ERP**: Techno-Kol Uzi mega-ERP
**Rule**: לא מוחקים רק משדרגים ומגדלים — append-only, upgrade-and-grow
**Status**: GREEN — 17/17 tests pass
**Zero-dependency**: YES (Node built-ins only)
**Bilingual**: YES (Hebrew + English surface, output, lexicon)
**Date**: 2026-04-11

---

## 1. Scope

A full Voice of Customer capture + aggregation engine. Ingests customer
voice from 7 channels, normalizes, categorizes into 7 canonical buckets,
clusters similar items into themes using unsupervised Jaccard-based
clustering over lightweight-stemmed tokens, applies customer-weight
voting, prioritizes by several metrics, links themes to product
roadmap items, and closes the loop with customers when work ships.

All state is append-only: item updates, theme re-links and category
re-classifications are recorded as revisions — nothing is deleted.

---

## 2. Sources captured (`captureItem`)

The `source` field on every item must be one of:

| Source            | Hebrew          | Typical shape                                |
| ----------------- | --------------- | -------------------------------------------- |
| `survey`          | סקר             | NPS comment, CSAT free text                  |
| `ticket`          | פנייה / קריאה   | Helpdesk ticket body                         |
| `email`           | דוא״ל           | Customer email to success/support            |
| `meeting-note`    | סיכום פגישה     | QBR / CS note                                |
| `review`          | ביקורת          | App store / G2 / Capterra review             |
| `call-transcript` | תמלול שיחה      | Call recording STT output                    |
| `social`          | רשת חברתית      | Twitter, LinkedIn, Facebook mention          |

Invalid sources are rejected at capture time with a descriptive error.
Each capture computes: language detection, auto-sentiment score,
tokenization, competitor extraction, and assigns a deterministic id.

---

## 3. Categorization (`categorize`)

Seven canonical buckets, every bucket bilingual keyword-seeded:

| Category           | Hebrew label       | Example Hebrew seeds                  | Example English seeds               |
| ------------------ | ------------------ | ------------------------------------- | ------------------------------------ |
| `product-feedback` | משוב מוצר          | מוצר, פיצ'ר, ממשק, חוויה              | product, feature, ui, ux, design     |
| `pricing`          | תמחור              | מחיר, יקר, זול, מנוי, חשבונית         | price, pricing, cost, cheap, invoice |
| `competition`      | תחרות              | מתחרה, מתחרים, חלופה, השוואה          | competitor, alternative, versus, vs  |
| `support`          | תמיכה              | תמיכה, שירות, נציג, צ׳אט, פנייה       | support, service, agent, chat, help  |
| `feature-request`  | בקשת פיצ׳ר         | בקשה, תוספת, רוצה, חסר, אפשרות        | add, wish, request, missing, please  |
| `bug`              | באג                | באג, תקלה, שבור, קורס, שגיאה          | bug, broken, crash, error, stuck     |
| `compliment`       | מחמאה              | תודה, מעולה, אהבתי, מדהים, ממליץ      | thanks, great, love, amazing, perfect|

Scoring is count-of-seed-hits per category; ties broken in declaration
order. A fall-back rule uses sentiment polarity if no seed matches.
Category re-classifications are logged on `item.revisions[]`.

---

## 4. Theme clustering (`themeExtraction`)

Zero-dep unsupervised clustering:

1. **Tokenization** — bilingual, lowercased, nikud-stripped.
2. **Hebrew stemmer** — strips common prefixes (ה, ב, ל, מ, ש, כ, ו)
   and suffixes (ות, ים, ית, ה) so that morphological variants of the
   same root map together. Rule-based, zero-dep, length-guarded.
3. **Stop-word filter** — 40+ Hebrew + English stop words removed.
4. **Feature set** — each item becomes a `Set<token>`.
5. **Greedy agglomerative assignment** — each item is placed in the
   first existing cluster whose centroid has Jaccard similarity
   `≥ 0.18`. Centroid is the merged set of tokens seen in the cluster.
6. **Centroid weighting** — per-term occurrence counts.
7. **Theme labeling** — top-3 centroid terms form the label.
8. **Upgrade-in-place** — the method first checks whether an existing
   theme overlaps with the new cluster on ≥ 40 % of tokens, and merges
   into it instead of creating a duplicate. This satisfies the
   "לא מוחקים רק משדרגים ומגדלים" rule.

### Validation
- English test: 3 items about "excel export slow/broken" clustered
  into a single theme; an unrelated "Beautiful UI" item stayed apart.
- Hebrew test: 3 items about "מובייל קורס בדוחות" clustered successfully
  after stemming (`הדוחות → דוחות`, `במובייל → מובייל`, `קורסת/קורס/קורסים → קורס`).

---

## 5. Voting & prioritization

- `voteOnTheme({themeId, customerId, weight})` — stacks any positive
  numeric weight (ARR, revenue, strategic multiplier). Rejects
  non-positive weights and unknown themes.
- `prioritizeThemes({metric})` supports:
  - `count` — raw number of supporting items
  - `revenue-weighted` — sum of vote weights (big customer wins)
  - `strategic-fit` — blend: `votes·0.6 + items·0.3 + recency·0.1`

Test shows that a 2-item theme with a 150 000 weight outranks a 3-item
theme with 500 weight on `revenue-weighted`, but the 3-item theme wins
on `count`. Priority is annotated onto `theme.priority` as a 1-based
rank so downstream consumers (dashboards, briefs) can read it directly.

---

## 6. Close-loop tracking

- `linkToRoadmap({themeId, roadmapItemId})` — sets `theme.roadmapItemId`
  and pushes an entry onto the module-level `roadmapLinks[]` log, with
  the previous id preserved as `previous`. Re-linking to a new roadmap
  id keeps the history of all prior links.
- `closeLoop({themeId, customerIds, updateText, date})` — appends a
  communication entry to `theme.closeLoop[]` and sets
  `theme.status = 'closed-loop'`. The record is immutable; subsequent
  updates append additional close-loop entries.

### Validation
A theme is linked to `ROAD-42`, closed with an update to two customers,
then re-linked to `ROAD-99`. The `roadmapLinks` log retains both links,
with `roadmapLinks[1].previous === 'ROAD-42'`. Every close-loop entry
is retained on the theme.

---

## 7. Competitor extraction

Embedded default competitor list includes Hebrew brand names
(פריוריטי, ריווחית, חשבשבת) and English/Latin names (SAP, Salesforce,
Hubspot, Zoho, NetSuite, Monday, Oracle, Microsoft Dynamics). The list
is grown via `addCompetitor(name)` — never shrunk.

`competitorMentions(period)` scans captured items and returns the
sorted tally `{competitor, count, items[]}`.

### Validation
Hebrew + English mixed corpus correctly surfaces Salesforce, Hubspot,
and at least one Hebrew brand. Dynamically added `AcmeSoft` is
immediately picked up on subsequent captures.

---

## 8. Auxiliary views

| Method                        | Returns                                              |
| ----------------------------- | ---------------------------------------------------- |
| `trendByCategory(period)`     | per-category `{count, previous, delta, deltaPct, rising}` comparing the period to the prior equal window |
| `voiceShare({product, period})` | `{total, share:{category:{count, share, label{he,en}}}}` |
| `featureRequestTracker({customerId})` | items with category `feature-request` for a given customer, newest-first |
| `generateProductBrief(themeId)` | bilingual `{title{he,en}, summary{he,en}, quotes, metadata}` brief for PMs |

The product brief surfaces: theme label, category, supporting customer
count, supporting item count, vote total, priority, average sentiment,
top-5 keywords, roadmap link, status, up to 5 representative quotes,
and a bilingual narrative summary.

---

## 9. Hebrew glossary (sentiment lexicon)

The embedded Hebrew sentiment lexicon is exported as `SENTIMENT_LEXICON`.
Future agents may only **extend** it, never remove keys.

### Positive (He)

| Word    | Score | EN          |
| ------- | ----- | ----------- |
| מעולה   | +2.0  | excellent   |
| מצוין   | +2.0  | excellent   |
| נפלא    | +2.0  | wonderful   |
| פנטסטי  | +2.0  | fantastic   |
| אהבתי   | +2.0  | loved       |
| מדהים   | +2.0  | amazing     |
| מושלם   | +2.0  | perfect     |
| אחלה    | +2.0  | great       |
| מרוצה   | +1.5  | satisfied   |
| ממליץ   | +1.5  | recommend   |
| יעיל    | +1.5  | efficient   |
| מקצועי  | +1.5  | professional|
| יופי    | +1.0  | nice        |
| טוב     | +1.0  | good        |
| נחמד    | +1.0  | pleasant    |
| שמח     | +1.0  | happy       |
| תודה    | +1.0  | thanks      |
| סבבה    | +1.0  | cool        |
| עובד    | +1.0  | works       |
| מהיר    | +1.0  | fast        |

### Negative (He)

| Word     | Score | EN            |
| -------- | ----- | ------------- |
| גרוע     | −2.0  | terrible      |
| נורא     | −2.0  | awful         |
| איום     | −2.0  | dreadful      |
| רע       | −2.0  | bad           |
| שוברת    | −2.0  | breaking      |
| מאכזב    | −2.0  | disappointing |
| תקול     | −2.0  | faulty        |
| שבור     | −2.0  | broken        |
| לא עובד  | −2.0  | not working   |
| קורס     | −2.0  | crashes       |
| מעצבן    | −1.5  | annoying      |
| באג      | −1.5  | bug           |
| תקלה     | −1.5  | defect        |
| מתסכל    | −1.5  | frustrating   |
| נתקע     | −1.5  | stuck         |
| בעייתי   | −1.5  | problematic   |
| מסורבל   | −1.5  | clunky        |
| יקר מדי  | −1.5  | too expensive |
| איטי     | −1.0  | slow          |
| יקר      | −1.0  | expensive     |
| מסובך    | −1.0  | complicated   |
| קשה      | −1.0  | hard          |
| בעיה     | −1.0  | problem       |
| חסר      | −1.0  | missing       |
| מוחזרת   | −1.0  | returned      |

### Hebrew negations (flip next-token polarity)
`לא`, `אין`, `בלי`, `חסר`

### Hebrew stop words (not used for clustering)
`של, את, על, זה, זו, גם, כי, יש, אני, אתה, הוא, היא, אנחנו, אתם, הם, הן, כן, רק, עם, או, אבל, כבר, אם`

---

## 10. Test Matrix

| # | Area              | Test                                                        | Result |
| - | ----------------- | ----------------------------------------------------------- | ------ |
| 1 | Categorization    | Hebrew bug ticket → `bug`                                    | PASS   |
| 2 | Categorization    | English feature request → `feature-request`                  | PASS   |
| 3 | Categorization    | Hebrew compliment → `compliment` (+ positive sentiment)      | PASS   |
| 4 | Categorization    | Hebrew pricing complaint → `pricing`                         | PASS   |
| 5 | Categorization    | English support complaint → `support`                        | PASS   |
| 6 | Categorization    | Restricted category list respected                          | PASS   |
| 7 | Clustering        | English "excel export slow/broken" groups into 1 theme       | PASS   |
| 8 | Clustering        | Hebrew "מובייל קורס דוחות" groups via stemmer                | PASS   |
| 9 | Voting            | Revenue-weighted vs count-based ordering                     | PASS   |
| 10| Voting            | Invalid voteOnTheme inputs rejected                         | PASS   |
| 11| Close-loop        | linkToRoadmap + closeLoop + re-link, history preserved      | PASS   |
| 12| Competitor        | Hebrew + English brand extraction                           | PASS   |
| 13| Competitor        | addCompetitor grows list                                    | PASS   |
| 14| Voice share       | Share distribution sums ≈ 1                                 | PASS   |
| 15| Feature tracker   | Only feature-request items returned                         | PASS   |
| 16| Product brief     | Bilingual title + summary + quotes generated                | PASS   |
| 17| Append-only       | Category revisions preserved in `item.revisions[]`          | PASS   |

**Totals: 17 pass / 0 fail — GREEN.**

### Repro
```
cd onyx-procurement
node --test test/customer/voc.test.js
```

---

## 11. Upgrade path (never delete — only grow)

- **Lexicon**: append rows to `SENTIMENT_LEXICON`; never remove.
- **Category seeds**: append keywords to existing buckets or add new
  buckets as needed; the eight existing buckets must remain stable so
  historical categorizations still resolve.
- **Competitor list**: call `addCompetitor()` or extend
  `DEFAULT_COMPETITORS` — the engine uses a `Set`, so duplicates are
  harmless.
- **Theme merging**: `themeExtraction` already upgrades existing themes
  in-place when new clusters overlap ≥ 40 % on tokens, so running the
  method repeatedly is safe and additive.
- **Close-loop & roadmap link history**: every change is an append; no
  method removes entries.

---

## 12. Known limitations / future work

1. The Hebrew stemmer is rule-based and will occasionally over-stem
   short words. Future work: replace with a HebNLP dictionary stemmer
   while keeping zero runtime deps.
2. Jaccard similarity is coarse; we may want to add TF-IDF weighting
   for large corpora.
3. No persistence layer — this module is in-memory only; the broader
   Techno-Kol Uzi persistence layer should plug in via a thin adapter.
4. Sentiment scoring uses unigram look-ups with bigram negation. Future
   work: handle multi-word negation patterns and intensifiers.

---

## 13. File locations

- Source: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\customer\voc.js`
- Tests:  `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\customer\voc.test.js`
- Report: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y101-voc.md`

**This report is append-only. Future revisions must add sections —
never rewrite or delete prior content.**
