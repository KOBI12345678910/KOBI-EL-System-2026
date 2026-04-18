# AG-Y158 — Recommendation Engine for Techno-Kol Uzi mega-ERP

**Agent:** Y-158
**System:** Techno-Kol Uzi mega-ERP / ONYX AI
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 19 / 19 tests passing

---

## 1. Mission / משימה

**EN:**
Build a zero-dependency TypeScript recommendation engine that combines
collaborative filtering (item-item and user-item) with content-based
similarity, plus a cold-start fallback. Drive three concrete use cases
inside ONYX: "customers who bought X also bought Y" for metal products,
supplier ranking against an RFQ, and a "next best action" recommender
for sales reps. All output must be bilingual Hebrew + English.

**HE:**
לבנות מנוע המלצות ב-TypeScript ללא תלויות חיצוניות, המשלב סינון שיתופי
(פריט-פריט ומשתמש-פריט) עם דמיון מבוסס תוכן, כולל מנגנון Cold-Start. המנוע
נדרש לשלושה תרחישי שימוש במערכת אוניקס: "לקוחות שקנו X קנו גם Y" למוצרי
מתכת, דירוג ספקים מול RFQ, והמלצת "הפעולה הבאה הטובה ביותר" לאנשי מכירות.
כל פלט מחזיר גם עברית וגם אנגלית.

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-ai/src/ml/recommender.ts` | Engine — 685 LOC, 4 public use-case functions, 3 similarity metrics, MMR diversity |
| `onyx-ai/test/ml/recommender.test.ts` | 19 `node:test` unit tests |
| `_qa-reports/AG-Y158-recommender.md` | This bilingual report |

**Rules honoured / כללים שנשמרו:**
- Zero external dependencies introduced / אפס תלויות חיצוניות חדשות
- Zero files deleted / לא נמחק אף קובץ קיים
- Bilingual (HE + EN) output on every recommendation / פלט דו-לשוני בכל המלצה
- Built-in `node:test` + `node:assert/strict` only / רק מודולים מובנים של Node

## 3. Algorithms Implemented / אלגוריתמים

### 3.1 Similarity metrics (public)

| # | Metric | Public function | Use |
|---|---|---|---|
| 1 | Cosine similarity (dense) | `cosineSimilarity(a, b)` | Dense numeric vectors |
| 2 | Cosine similarity (sparse) | `cosineSimilaritySparse(aMap, bMap)` | Item-item CF over implicit feedback |
| 3 | Jaccard index | `jaccardSimilarity(a, b)` | Tag/capability sets (items, suppliers) |
| 4 | Pearson correlation | `pearsonCorrelation(aMap, bMap)` | User–user neighbourhood in CF |

All four are case-insensitive where relevant, safe against empty
vectors, and return `0` (not `NaN`) on degenerate input.

### 3.2 Recommendation strategies

| # | Strategy | Entry point | Notes |
|---|---|---|---|
| 1 | Item-item CF (implicit) | `recommendItemsForItem` | Cosine on co-purchase vectors; cold-start → content |
| 2 | User-item CF (neighbourhood) | `recommendItemsForUser` | Pearson kNN; unknown user → popularity |
| 3 | Content-based suppliers / RFQ | `recommendSuppliersForRFQ` | Jaccard over capabilities + hard numeric constraints |
| 4 | Next-best-action (hybrid) | `recommendNextBestAction` | Rule-based urgency + CF cross-sell + content complement |
| 5 | Content-based item fallback | internal `contentBasedItemRecs` | Weighted Jaccard (0.7) + numeric spec similarity (0.3) |
| 6 | Popularity cold-start | internal `coldStartForNewUser` | Implicit-weight popularity over the full catalogue |

### 3.3 Top-K with MMR diversity / Top-K עם מגוון MMR

`applyTopKWithDiversity` implements a greedy Maximum Marginal
Relevance selection:

```
mmr(i) = (1 - λ) · relevance(i) - λ · max(similarity(i, already_selected))
```

- `λ = opts.diversity` in `[0, 1]` (default `0.3`).
- `λ = 0` → pure relevance (fast path, no MMR).
- `λ = 1` → maximum diversity across tag clusters.
- Diversity space is vectorised via a 32-bucket FNV-1a hash over
  the item's (or supplier's) tags — built-in, deterministic, no deps.
- `minScore` filter drops sub-threshold candidates before MMR runs.

### 3.4 Cold-start policy / מדיניות Cold-Start

| Situation | Fallback |
|---|---|
| Seed item has `< minInteractions` co-buyers | Content-based on tag Jaccard + numeric spec similarity |
| Unknown user / empty user vector | Popularity by aggregate implicit weight |
| Zero Pearson neighbours > 0 | Popularity fallback |
| Empty catalogue | Returns `[]` gracefully (no crash) |

### 3.5 Bilingual explanations / הסברים דו-לשוניים

Every `Recommendation` carries:

```ts
{
  id: string;
  score: number;
  source: 'item-item' | 'user-item' | 'content' | 'hybrid' |
          'cold-start' | 'rule-based';
  explanation: { he: string; en: string };
}
```

Example (item-item):
- HE: `לקוחות שקנו לוח אלומיניום 3 מ"מ קנו גם לוח אלומיניום 5 מ"מ — 3 רוכשים משותפים, דמיון 92%.`
- EN: `Customers who bought Aluminum sheet 3mm also bought Aluminum sheet 5mm — 3 co-buyers, similarity 92%.`

## 4. Use Cases Covered / תרחישי שימוש

### 4.1 "Customers who bought X also bought Y" — metal SKUs

```ts
import { RecommenderEngine } from './src/ml/recommender';

const engine = new RecommenderEngine(interactions, items);
const recs = engine.recommendItemsForItem('SKU-ALU-001', {
  k: 5,
  diversity: 0.3,
});
```

Returns up to 5 cross-sell candidates ranked by cosine of co-purchase
vectors, with MMR diversity so that the list does not collapse into
a single product family. Seed item is excluded automatically.

### 4.2 Supplier recommendation given an RFQ

```ts
const recs = engine.recommendSuppliersForRFQ(
  {
    rfqId: 'RFQ-2026-0001',
    requirements: ['aluminum', 'anodizing', 'laser-cut'],
    constraints: { maxLeadDays: 10 },
  },
  { k: 3 },
);
```

- Jaccard similarity between RFQ requirements and each supplier's
  capability set.
- Hard numeric constraints (`maxX` / `minX`) strip candidates that
  violate the rule; the matcher tolerates both camelCase keys
  (`maxLeadDays`) and the underlying metric name (`leadDays`).

### 4.3 Next best action for a sales rep

```ts
const recs = engine.recommendNextBestAction(
  {
    repId: 'rep-1',
    accountId: 'ACC-42',
    purchasedItems: ['SKU-ALU-001'],
    daysSinceLastContact: 45,
  },
  { k: 5 },
);
```

Hybrid output:
1. **Rule-based urgency** — dormant accounts (`daysSinceLastContact > 30`)
   surface a follow-up contact action.
2. **CF cross-sell** — pseudo-user built on the fly from the account's
   purchase history drives Pearson kNN without mutating the index.
3. **Content complements** — each purchased item contributes up to two
   content-based complements.

All three streams go through the same MMR top-K, so the rep gets a
short, high-signal list without near-duplicates.

## 5. Public API surface / ממשק ציבורי

```ts
// Classes
export class RecommenderEngine {
  constructor(
    interactions: Interaction[],
    items: ItemFeatures[],
    suppliers?: SupplierFeatures[],
  );
  recommendItemsForItem(seedItemId: string, opts?: TopKOptions): Recommendation[];
  recommendItemsForUser(userId: string, opts?: TopKOptions): Recommendation[];
  recommendSuppliersForRFQ(rfq: RFQ, opts?: TopKOptions): Recommendation[];
  recommendNextBestAction(ctx: SalesContext, opts?: TopKOptions): Recommendation[];
}

// Similarity primitives
export function cosineSimilarity(a: number[], b: number[]): number;
export function cosineSimilaritySparse(a: Map<string, number>, b: Map<string, number>): number;
export function jaccardSimilarity(a: string[], b: string[]): number;
export function pearsonCorrelation(a: Map<string, number>, b: Map<string, number>): number;

// Functional shortcuts (build + query in one call)
export function recommendItemsForItem(...): Recommendation[];
export function recommendItemsForUser(...): Recommendation[];
export function recommendSuppliersForRFQ(...): Recommendation[];
export function recommendNextBestAction(...): Recommendation[];
```

## 6. Test Matrix / מטריצת בדיקות

Run:
```
node --test --require ts-node/register test/ml/recommender.test.ts
```

| # | Test | Coverage area |
|---|---|---|
| 1 | `cosineSimilarity: orthogonal → 0; identical → 1` | Dense cosine primitive |
| 2 | `cosineSimilaritySparse: sparse maps return same result as dense` | Sparse cosine primitive |
| 3 | `jaccardSimilarity: set overlap` | Tag Jaccard + case-insensitivity |
| 4 | `pearsonCorrelation: positive, negative, no-overlap` | Pearson on user vectors |
| 5 | `item-item CF: seed ALU-001 recommends ALU-002 first` | Item-item ranking ordering |
| 6 | `item-item CF: excludes the seed item itself` | Self-exclusion invariant |
| 7 | `item-item CF: functional wrapper matches class method` | Functional/OO parity |
| 8 | `user-item CF: recommends items owned by similar users, never self` | User-item + owned-filter |
| 9 | `user-item CF: userA should see SKU-CPR-001 (learned from userB/userE)` | Neighbourhood inference |
| 10 | `user-item CF: unknown user → cold-start fallback` | Cold-start branch |
| 11 | `RFQ supplier ranking: aluminum anodizing RFQ → SUP-01 first` | Supplier Jaccard ranking |
| 12 | `RFQ supplier ranking: maxLeadDays constraint filters slow suppliers` | Hard numeric constraints |
| 13 | `cold-start: seed item with no interactions uses content-based` | Seed cold-start |
| 14 | `cold-start: empty catalogue + unknown user still returns []` | Graceful degradation |
| 15 | `Top-K: honours k parameter` | Top-K slicing |
| 16 | `Diversity: high diversity penalty spreads across tag clusters` | MMR path |
| 17 | `NBA: dormant account surfaces a rule-based follow-up action` | Next-best-action rules |
| 18 | `All recommendations expose a Hebrew + English explanation` | Bilingual invariant |
| 19 | `Functional entry points wire through end-to-end` | Functional wrappers |

**Result / תוצאה:**
```
tests      19
pass       19
fail        0
duration  ~940 ms
```

## 7. Known Limitations / מגבלות ידועות

1. **Implicit feedback only** — the engine treats `Interaction.weight`
   as a positive score; there is no explicit "dislike" / negative signal.
2. **No persistence** — indexes are rebuilt from scratch in the
   constructor. For production scale, wire a pre-computed similarity
   cache in front of `recommendItemsForItem`.
3. **Hash buckets in MMR** — 32-bucket FNV is deterministic but
   collision-prone on very large tag vocabularies; bump to 64/128 if
   the catalogue grows past ~10k unique tags.
4. **Constraint matcher prefixes** — numeric constraints must be
   expressed as `maxX` or `minX` (camelCase). Arbitrary predicates are
   out of scope for this agent.

## 8. Wiring Notes / הנחיות לחיבור

To expose in the ONYX AI HTTP layer, add a POST route to
`src/onyx-platform.ts` that delegates to one of the four functional
entry points. The engine is fully synchronous and has no I/O, so it
can run inside the request handler without worker threads.

**End of report / סוף הדוח**
