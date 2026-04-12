/**
 * ONYX AI — Recommendation Engine (Agent Y-158)
 * ============================================================
 * Zero-dependency, pure-TypeScript recommender for Techno-Kol Uzi
 * mega-ERP. Combines collaborative filtering (item-item & user-item)
 * with content-based similarity and a cold-start fallback.
 *
 * Supported use cases:
 *   1. "Customers who bought X also bought Y" (item-item CF)
 *      → recommendItemsForItem()
 *   2. "Recommendations for customer C" (user-item CF)
 *      → recommendItemsForUser()
 *   3. "Which suppliers best match this RFQ?" (content-based)
 *      → recommendSuppliersForRFQ()
 *   4. "Next best action for sales rep R on account A" (hybrid)
 *      → recommendNextBestAction()
 *
 * Similarity metrics:
 *   - Cosine similarity       → cosineSimilarity()
 *   - Jaccard index           → jaccardSimilarity()
 *   - Pearson correlation     → pearsonCorrelation()
 *
 * Features:
 *   - Top-K selection with Maximum Marginal Relevance (MMR) diversity
 *     penalty — recommendations are novel, not just similar.
 *   - Cold-start: falls back to content-based when interactions < k.
 *   - Bilingual (Hebrew + English) explanations on every result.
 *   - Deterministic: no randomness, no hidden state, no I/O.
 *
 * Language policy:
 *   Every public function accepts plain TS types; every returned
 *   record carries an `explanation: { he: string; en: string }`
 *   pair suitable for rendering in a bilingual dashboard.
 *
 * Rules honoured:
 *   - Never delete existing files.
 *   - Built-ins only (no npm dependencies at runtime).
 *   - Bilingual output on every recommendation.
 */

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** A user–item interaction (rating / purchase / view weight). */
export interface Interaction {
  userId: string;
  itemId: string;
  /** Strength of signal. Purchase count, rating 1-5, dwell seconds. */
  weight: number;
  /** Unix-ms timestamp. Optional — enables time-decay. */
  timestamp?: number;
}

/** Content descriptor for an item (metal product, SKU, etc.). */
export interface ItemFeatures {
  itemId: string;
  /** Free-text tags, categories, materials, finishes, etc. */
  tags: string[];
  /** Numeric features — e.g. price, weight, diameter. Optional. */
  numeric?: Record<string, number>;
  /** Hebrew display name (optional). */
  nameHe?: string;
  /** English display name (optional). */
  nameEn?: string;
}

/** Supplier descriptor for content-based supplier recommendation. */
export interface SupplierFeatures {
  supplierId: string;
  /** Capabilities / certifications / materials handled. */
  capabilities: string[];
  /** Numeric metrics — price index, lead time days, OTD%, etc. */
  metrics?: Record<string, number>;
  nameHe?: string;
  nameEn?: string;
}

/** Request for quotation — used to rank suppliers. */
export interface RFQ {
  rfqId: string;
  /** Required capabilities (materials, processes, certifications). */
  requirements: string[];
  /** Hard numeric constraints — e.g. { maxLeadDays: 14 }. */
  constraints?: Record<string, number>;
}

/** Sales-rep context for next-best-action recommendation. */
export interface SalesContext {
  repId: string;
  accountId: string;
  /** Items the account has already bought. */
  purchasedItems: string[];
  /** Open opportunities the rep is working. */
  openOpportunities?: string[];
  /** Days since last meaningful contact. */
  daysSinceLastContact?: number;
}

/** Bilingual human-readable label. */
export interface BilingualText {
  he: string;
  en: string;
}

/** Scored recommendation returned by every public ranker. */
export interface Recommendation {
  id: string;
  score: number;
  /** Which method produced the score — useful for debugging / UI. */
  source:
    | 'item-item'
    | 'user-item'
    | 'content'
    | 'hybrid'
    | 'cold-start'
    | 'rule-based';
  explanation: BilingualText;
}

/** Options controlling Top-K selection and diversity. */
export interface TopKOptions {
  /** How many results to return. */
  k: number;
  /**
   * MMR diversity weight in [0, 1]. 0 = pure relevance,
   * 1 = maximum diversity. Default 0.3.
   */
  diversity?: number;
  /** Minimum score threshold — items below this are dropped. */
  minScore?: number;
}

// ---------------------------------------------------------------
// Built-in math helpers (no external deps)
// ---------------------------------------------------------------

/** Safe division — returns 0 instead of NaN/Infinity. */
function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : 0;
}

/** Dot product over two parallel numeric arrays. */
function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** L2 norm of a vector. */
function norm(v: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Mean of an array. */
function mean(v: number[]): number {
  if (v.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
}

// ---------------------------------------------------------------
// Similarity metrics (public)
// ---------------------------------------------------------------

/**
 * Cosine similarity of two dense numeric vectors.
 * Returns value in [-1, 1]. Zero-vectors map to 0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return safeDiv(dot(a, b), na * nb);
}

/**
 * Cosine similarity of two sparse vectors keyed by id.
 * Used when comparing two items in an implicit-feedback matrix
 * without materialising the dense representation.
 */
export function cosineSimilaritySparse(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0;
  let na = 0;
  let nb = 0;
  for (const [key, va] of a) {
    na += va * va;
    const vb = b.get(key);
    if (vb !== undefined) dotProduct += va * vb;
  }
  for (const vb of b.values()) nb += vb * vb;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

/**
 * Jaccard similarity of two sets of string tags.
 * |A ∩ B| / |A ∪ B|. Returns 0 for two empty sets.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((x) => x.toLowerCase()));
  const setB = new Set(b.map((x) => x.toLowerCase()));
  let intersection = 0;
  for (const tag of setA) if (setB.has(tag)) intersection++;
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Pearson correlation between two user rating vectors over a
 * common item support. Items absent from both users are ignored.
 */
export function pearsonCorrelation(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  const common: string[] = [];
  for (const key of a.keys()) if (b.has(key)) common.push(key);
  if (common.length < 2) return 0;
  const va: number[] = [];
  const vb: number[] = [];
  for (const key of common) {
    va.push(a.get(key)!);
    vb.push(b.get(key)!);
  }
  const ma = mean(va);
  const mb = mean(vb);
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < common.length; i++) {
    const da = va[i] - ma;
    const db = vb[i] - mb;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA) * Math.sqrt(denomB);
  if (denom === 0) return 0;
  return num / denom;
}

// ---------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------

interface UserItemIndex {
  /** user → item → weight */
  userMap: Map<string, Map<string, number>>;
  /** item → user → weight */
  itemMap: Map<string, Map<string, number>>;
  /** all interaction count (for telemetry). */
  total: number;
}

function buildIndex(interactions: Interaction[]): UserItemIndex {
  const userMap = new Map<string, Map<string, number>>();
  const itemMap = new Map<string, Map<string, number>>();
  for (const ix of interactions) {
    if (!ix || !ix.userId || !ix.itemId) continue;
    const w = Number.isFinite(ix.weight) ? ix.weight : 0;
    let u = userMap.get(ix.userId);
    if (!u) {
      u = new Map();
      userMap.set(ix.userId, u);
    }
    u.set(ix.itemId, (u.get(ix.itemId) ?? 0) + w);
    let i = itemMap.get(ix.itemId);
    if (!i) {
      i = new Map();
      itemMap.set(ix.itemId, i);
    }
    i.set(ix.userId, (i.get(ix.userId) ?? 0) + w);
  }
  return { userMap, itemMap, total: interactions.length };
}

/**
 * RecommenderEngine — stateful container that pre-computes indexes
 * and exposes ranking methods. Reusable for many queries.
 */
export class RecommenderEngine {
  private readonly index: UserItemIndex;
  private readonly items: Map<string, ItemFeatures>;
  private readonly suppliers: Map<string, SupplierFeatures>;

  constructor(
    interactions: Interaction[] = [],
    items: ItemFeatures[] = [],
    suppliers: SupplierFeatures[] = [],
  ) {
    this.index = buildIndex(interactions);
    this.items = new Map(items.map((it) => [it.itemId, it]));
    this.suppliers = new Map(suppliers.map((s) => [s.supplierId, s]));
  }

  /** Total user count (diagnostic). */
  public get userCount(): number {
    return this.index.userMap.size;
  }

  /** Total item count (diagnostic). */
  public get itemCount(): number {
    return this.index.itemMap.size;
  }

  // -------------------------------------------------------------
  // Item-item collaborative filtering
  // -------------------------------------------------------------

  /**
   * "Customers who bought X also bought Y."
   *
   * Uses item-item cosine on the implicit-feedback matrix. If the
   * seed item has fewer than `minInteractions` co-occurrences we
   * fall back to content-based ranking over the items catalogue.
   */
  public recommendItemsForItem(
    seedItemId: string,
    opts: TopKOptions & { minInteractions?: number } = { k: 5 },
  ): Recommendation[] {
    const minInteractions = opts.minInteractions ?? 2;
    const seedUsers = this.index.itemMap.get(seedItemId);

    // Cold-start: no co-buyers → content-based.
    if (!seedUsers || seedUsers.size < minInteractions) {
      return this.contentBasedItemRecs(seedItemId, opts);
    }

    const scored: Recommendation[] = [];
    for (const [candidateId, candidateUsers] of this.index.itemMap) {
      if (candidateId === seedItemId) continue;
      const sim = cosineSimilaritySparse(seedUsers, candidateUsers);
      if (sim <= 0) continue;
      const co = this.countCoBuyers(seedUsers, candidateUsers);
      scored.push({
        id: candidateId,
        score: sim,
        source: 'item-item',
        explanation: this.explainItemItem(seedItemId, candidateId, co, sim),
      });
    }

    return this.applyTopKWithDiversity(scored, opts, (rec) =>
      this.itemTagVector(rec.id),
    );
  }

  // -------------------------------------------------------------
  // User-item collaborative filtering
  // -------------------------------------------------------------

  /**
   * Recommend items for a given user based on what similar users
   * purchased. Neighbour similarity uses Pearson correlation on
   * the user rating vectors (rows of the matrix).
   */
  public recommendItemsForUser(
    userId: string,
    opts: TopKOptions & { neighbourhoodSize?: number } = { k: 5 },
  ): Recommendation[] {
    const neighbourhoodSize = opts.neighbourhoodSize ?? 10;
    const userVec = this.index.userMap.get(userId);

    // Cold-start: unknown user or too-thin history → content tags.
    if (!userVec || userVec.size === 0) {
      return this.coldStartForNewUser(opts);
    }

    // Build a ranked list of neighbours by Pearson similarity.
    const neighbours: Array<{ id: string; sim: number }> = [];
    for (const [otherId, otherVec] of this.index.userMap) {
      if (otherId === userId) continue;
      const sim = pearsonCorrelation(userVec, otherVec);
      if (sim > 0) neighbours.push({ id: otherId, sim });
    }
    neighbours.sort((x, y) => y.sim - x.sim);
    const topN = neighbours.slice(0, neighbourhoodSize);

    if (topN.length === 0) {
      // Nobody correlates positively — fall back to popular-for-tags.
      return this.coldStartForNewUser(opts);
    }

    // Weighted score per candidate item.
    const numerator = new Map<string, number>();
    const denom = new Map<string, number>();
    for (const nb of topN) {
      const nbVec = this.index.userMap.get(nb.id);
      if (!nbVec) continue;
      for (const [itemId, weight] of nbVec) {
        if (userVec.has(itemId)) continue; // already owned
        numerator.set(itemId, (numerator.get(itemId) ?? 0) + nb.sim * weight);
        denom.set(itemId, (denom.get(itemId) ?? 0) + Math.abs(nb.sim));
      }
    }

    const scored: Recommendation[] = [];
    for (const [itemId, num] of numerator) {
      const d = denom.get(itemId) ?? 0;
      const score = d === 0 ? 0 : num / d;
      if (score <= 0) continue;
      scored.push({
        id: itemId,
        score,
        source: 'user-item',
        explanation: this.explainUserItem(userId, itemId, topN.length),
      });
    }

    return this.applyTopKWithDiversity(scored, opts, (rec) =>
      this.itemTagVector(rec.id),
    );
  }

  // -------------------------------------------------------------
  // Content-based supplier recommendation (RFQ)
  // -------------------------------------------------------------

  /**
   * Rank suppliers against an RFQ using Jaccard over capabilities
   * and penalising suppliers that violate hard numeric constraints.
   */
  public recommendSuppliersForRFQ(
    rfq: RFQ,
    opts: TopKOptions = { k: 5 },
  ): Recommendation[] {
    const scored: Recommendation[] = [];
    for (const [supplierId, features] of this.suppliers) {
      const jacc = jaccardSimilarity(features.capabilities, rfq.requirements);
      if (jacc <= 0) continue;

      // Apply hard constraints — e.g. maxLeadDays.
      // Constraint key may be written as "maxLeadDays" / "minPrice"
      // while the supplier's metric is stored as "leadDays" / "price".
      let constraintsOk = true;
      const violations: string[] = [];
      if (rfq.constraints && features.metrics) {
        for (const [key, limit] of Object.entries(rfq.constraints)) {
          const lower = key.toLowerCase();
          const isMax = lower.startsWith('max');
          const isMin = lower.startsWith('min');
          // Try exact key, then key without "max"/"min" prefix,
          // then case-insensitive match on the stripped remainder.
          let actual: number | undefined = features.metrics[key];
          if (actual === undefined && (isMax || isMin)) {
            const stripped = key.slice(3);
            actual = features.metrics[stripped];
            if (actual === undefined) {
              const lcStripped = stripped.charAt(0).toLowerCase() +
                stripped.slice(1);
              actual = features.metrics[lcStripped];
            }
          }
          if (actual === undefined) continue;
          if (isMax && actual > limit) {
            constraintsOk = false;
            violations.push(`${key}=${actual}>${limit}`);
          }
          if (isMin && actual < limit) {
            constraintsOk = false;
            violations.push(`${key}=${actual}<${limit}`);
          }
        }
      }
      if (!constraintsOk) continue;

      scored.push({
        id: supplierId,
        score: jacc,
        source: 'content',
        explanation: this.explainSupplier(supplierId, rfq, jacc),
      });
    }
    return this.applyTopKWithDiversity(scored, opts, (rec) =>
      this.supplierTagVector(rec.id),
    );
  }

  // -------------------------------------------------------------
  // Next-best-action (hybrid rules + CF + content)
  // -------------------------------------------------------------

  /**
   * Hybrid next-best-action for a sales rep working an account.
   * Combines: (a) rule-based urgency for dormant accounts,
   *           (b) user-item CF for cross-sell recommendations,
   *           (c) content similarity for complementary SKUs.
   */
  public recommendNextBestAction(
    ctx: SalesContext,
    opts: TopKOptions = { k: 5 },
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    // Rule 1: dormant account → suggest check-in call.
    if (
      typeof ctx.daysSinceLastContact === 'number' &&
      ctx.daysSinceLastContact > 30
    ) {
      recs.push({
        id: `action:contact:${ctx.accountId}`,
        score: Math.min(1, ctx.daysSinceLastContact / 60),
        source: 'rule-based',
        explanation: {
          he: `בצע שיחת פולואפ ללקוח — עברו ${ctx.daysSinceLastContact} ימים מהאינטראקציה האחרונה.`,
          en: `Schedule a follow-up call — ${ctx.daysSinceLastContact} days since last contact.`,
        },
      });
    }

    // Rule 2: CF cross-sell. Simulate the account as a "user".
    const syntheticUserId = `account:${ctx.accountId}`;
    if (!this.index.userMap.has(syntheticUserId)) {
      // Inject a one-shot pseudo-user from the context so CF can
      // rank items. We DO NOT mutate the persistent index.
      const pseudoVec = new Map<string, number>();
      for (const it of ctx.purchasedItems) pseudoVec.set(it, 1);
      const nbs: Array<{ id: string; sim: number }> = [];
      for (const [otherId, otherVec] of this.index.userMap) {
        const sim = pearsonCorrelation(pseudoVec, otherVec);
        if (sim > 0) nbs.push({ id: otherId, sim });
      }
      nbs.sort((x, y) => y.sim - x.sim);
      const topN = nbs.slice(0, 10);
      const scoreByItem = new Map<string, number>();
      for (const nb of topN) {
        const nbVec = this.index.userMap.get(nb.id)!;
        for (const [itemId, w] of nbVec) {
          if (pseudoVec.has(itemId)) continue;
          scoreByItem.set(
            itemId,
            (scoreByItem.get(itemId) ?? 0) + nb.sim * w,
          );
        }
      }
      for (const [itemId, score] of scoreByItem) {
        recs.push({
          id: `sell:${itemId}`,
          score: Math.min(1, score / 10),
          source: 'hybrid',
          explanation: {
            he: `הצע לחבר את המוצר ${this.itemLabel(itemId, 'he')} לאופורטיוניטי — לקוחות דומים רכשו אותו.`,
            en: `Pitch ${this.itemLabel(itemId, 'en')} — accounts with a similar purchase pattern bought it.`,
          },
        });
      }
    } else {
      // Real user exists in the index — delegate.
      for (const rec of this.recommendItemsForUser(syntheticUserId, opts)) {
        recs.push({
          ...rec,
          id: `sell:${rec.id}`,
          source: 'hybrid',
        });
      }
    }

    // Rule 3: content-based complements for each purchased item.
    for (const seed of ctx.purchasedItems) {
      for (const rec of this.contentBasedItemRecs(seed, { k: 2 })) {
        recs.push({
          ...rec,
          id: `complement:${rec.id}`,
          source: 'hybrid',
        });
      }
    }

    return this.applyTopKWithDiversity(recs, opts, (rec) => [
      rec.score,
      rec.source === 'rule-based' ? 1 : 0,
      rec.source === 'hybrid' ? 1 : 0,
    ]);
  }

  // -------------------------------------------------------------
  // Cold-start & content-based helpers
  // -------------------------------------------------------------

  private contentBasedItemRecs(
    seedItemId: string,
    opts: TopKOptions,
  ): Recommendation[] {
    const seed = this.items.get(seedItemId);
    if (!seed) return [];
    const scored: Recommendation[] = [];
    for (const [id, item] of this.items) {
      if (id === seedItemId) continue;
      const jacc = jaccardSimilarity(seed.tags, item.tags);
      if (jacc <= 0) continue;
      const numSim = this.numericSimilarity(seed.numeric, item.numeric);
      const score = 0.7 * jacc + 0.3 * numSim;
      scored.push({
        id,
        score,
        source: 'content',
        explanation: {
          he: `תוכן דומה: ${Math.round(jacc * 100)}% חפיפת תגים + התאמת מפרט ${Math.round(numSim * 100)}%.`,
          en: `Content match: ${Math.round(jacc * 100)}% tag overlap + ${Math.round(numSim * 100)}% spec similarity.`,
        },
      });
    }
    return this.applyTopKWithDiversity(scored, opts, (rec) =>
      this.itemTagVector(rec.id),
    );
  }

  private coldStartForNewUser(opts: TopKOptions): Recommendation[] {
    // Popularity-by-weight fallback for a brand-new user.
    const popularity: Array<{ id: string; score: number }> = [];
    for (const [itemId, users] of this.index.itemMap) {
      let s = 0;
      for (const w of users.values()) s += w;
      popularity.push({ id: itemId, score: s });
    }
    popularity.sort((a, b) => b.score - a.score);
    const maxScore = popularity[0]?.score ?? 1;
    const recs: Recommendation[] = popularity.map((p) => ({
      id: p.id,
      score: safeDiv(p.score, maxScore),
      source: 'cold-start',
      explanation: {
        he: `אין עדיין היסטוריית קניות — מוצג על בסיס פופולריות כללית במערכת.`,
        en: `No purchase history yet — ranked by overall popularity.`,
      },
    }));
    return this.applyTopKWithDiversity(recs, opts, (rec) =>
      this.itemTagVector(rec.id),
    );
  }

  private numericSimilarity(
    a: Record<string, number> | undefined,
    b: Record<string, number> | undefined,
  ): number {
    if (!a || !b) return 0;
    const keys = Object.keys(a).filter((k) => k in b);
    if (keys.length === 0) return 0;
    let total = 0;
    for (const k of keys) {
      const av = a[k];
      const bv = b[k];
      const maxAbs = Math.max(Math.abs(av), Math.abs(bv), 1e-9);
      const diff = Math.abs(av - bv) / maxAbs;
      total += Math.max(0, 1 - diff);
    }
    return total / keys.length;
  }

  private countCoBuyers(
    a: Map<string, number>,
    b: Map<string, number>,
  ): number {
    let n = 0;
    for (const k of a.keys()) if (b.has(k)) n++;
    return n;
  }

  // -------------------------------------------------------------
  // Top-K with MMR diversity penalty
  // -------------------------------------------------------------

  private applyTopKWithDiversity<T extends Recommendation>(
    candidates: T[],
    opts: TopKOptions,
    featureFn: (rec: T) => number[],
  ): T[] {
    const k = Math.max(1, Math.floor(opts.k));
    const diversity = Math.min(1, Math.max(0, opts.diversity ?? 0.3));
    const minScore = opts.minScore ?? 0;

    // 1. Filter and sort by raw relevance.
    const pool = candidates
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score);

    if (pool.length === 0) return [];
    if (diversity === 0 || pool.length <= k) return pool.slice(0, k);

    // 2. Greedy MMR selection.
    const selected: T[] = [];
    const selectedFeatures: number[][] = [];
    const pickedIds = new Set<string>();

    while (selected.length < k && pool.length > 0) {
      let bestIdx = -1;
      let bestMmr = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        if (pickedIds.has(cand.id)) continue;
        const feat = featureFn(cand);
        let maxSim = 0;
        for (const sf of selectedFeatures) {
          const sim = cosineSimilarity(feat, sf);
          if (sim > maxSim) maxSim = sim;
        }
        const mmr = (1 - diversity) * cand.score - diversity * maxSim;
        if (mmr > bestMmr) {
          bestMmr = mmr;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const picked = pool.splice(bestIdx, 1)[0];
      selected.push(picked);
      selectedFeatures.push(featureFn(picked));
      pickedIds.add(picked.id);
    }

    return selected;
  }

  // -------------------------------------------------------------
  // Vectorisation for diversity and explanations
  // -------------------------------------------------------------

  private itemTagVector(itemId: string): number[] {
    const rawId = itemId
      .replace(/^sell:/, '')
      .replace(/^complement:/, '')
      .replace(/^action:/, '');
    const item = this.items.get(rawId);
    if (!item) return [0];
    // Hash each tag to a fixed bucket (built-in string hashing).
    const buckets = new Array<number>(32).fill(0);
    for (const tag of item.tags) {
      const h = this.hashString(tag.toLowerCase()) % buckets.length;
      buckets[h] += 1;
    }
    if (item.numeric) {
      for (const v of Object.values(item.numeric)) buckets[0] += v * 0.001;
    }
    return buckets;
  }

  private supplierTagVector(supplierId: string): number[] {
    const s = this.suppliers.get(supplierId);
    if (!s) return [0];
    const buckets = new Array<number>(32).fill(0);
    for (const c of s.capabilities) {
      const h = this.hashString(c.toLowerCase()) % buckets.length;
      buckets[h] += 1;
    }
    return buckets;
  }

  /** Tiny 32-bit FNV-1a — built-in, deterministic, no deps. */
  private hashString(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  private itemLabel(itemId: string, lang: 'he' | 'en'): string {
    const it = this.items.get(itemId);
    if (!it) return itemId;
    return (lang === 'he' ? it.nameHe : it.nameEn) ?? itemId;
  }

  // -------------------------------------------------------------
  // Bilingual explanations
  // -------------------------------------------------------------

  private explainItemItem(
    seedId: string,
    candidateId: string,
    coBuyers: number,
    sim: number,
  ): BilingualText {
    const pct = Math.round(sim * 100);
    const seedHe = this.itemLabel(seedId, 'he');
    const seedEn = this.itemLabel(seedId, 'en');
    const candHe = this.itemLabel(candidateId, 'he');
    const candEn = this.itemLabel(candidateId, 'en');
    return {
      he: `לקוחות שקנו ${seedHe} קנו גם ${candHe} — ${coBuyers} רוכשים משותפים, דמיון ${pct}%.`,
      en: `Customers who bought ${seedEn} also bought ${candEn} — ${coBuyers} co-buyers, similarity ${pct}%.`,
    };
  }

  private explainUserItem(
    userId: string,
    itemId: string,
    neighbours: number,
  ): BilingualText {
    const nameHe = this.itemLabel(itemId, 'he');
    const nameEn = this.itemLabel(itemId, 'en');
    return {
      he: `מומלץ ל-${userId}: ${nameHe} — על בסיס ${neighbours} לקוחות דומים.`,
      en: `Recommended for ${userId}: ${nameEn} — based on ${neighbours} similar customers.`,
    };
  }

  private explainSupplier(
    supplierId: string,
    rfq: RFQ,
    jacc: number,
  ): BilingualText {
    const s = this.suppliers.get(supplierId);
    const nameHe = s?.nameHe ?? supplierId;
    const nameEn = s?.nameEn ?? supplierId;
    const pct = Math.round(jacc * 100);
    return {
      he: `הספק ${nameHe} מתאים ל-RFQ ${rfq.rfqId} ב-${pct}% מהדרישות.`,
      en: `Supplier ${nameEn} matches RFQ ${rfq.rfqId} on ${pct}% of requirements.`,
    };
  }
}

// ---------------------------------------------------------------
// Functional entry points (thin wrappers — useful for one-shot use)
// ---------------------------------------------------------------

/** Build a fresh engine and query item-item recommendations. */
export function recommendItemsForItem(
  interactions: Interaction[],
  items: ItemFeatures[],
  seedItemId: string,
  opts: TopKOptions = { k: 5 },
): Recommendation[] {
  return new RecommenderEngine(interactions, items).recommendItemsForItem(
    seedItemId,
    opts,
  );
}

/** Build a fresh engine and query user-item recommendations. */
export function recommendItemsForUser(
  interactions: Interaction[],
  items: ItemFeatures[],
  userId: string,
  opts: TopKOptions = { k: 5 },
): Recommendation[] {
  return new RecommenderEngine(interactions, items).recommendItemsForUser(
    userId,
    opts,
  );
}

/** Build a fresh engine and query supplier recommendations. */
export function recommendSuppliersForRFQ(
  suppliers: SupplierFeatures[],
  rfq: RFQ,
  opts: TopKOptions = { k: 5 },
): Recommendation[] {
  return new RecommenderEngine([], [], suppliers).recommendSuppliersForRFQ(
    rfq,
    opts,
  );
}

/** Build a fresh engine and query next-best-action. */
export function recommendNextBestAction(
  interactions: Interaction[],
  items: ItemFeatures[],
  ctx: SalesContext,
  opts: TopKOptions = { k: 5 },
): Recommendation[] {
  return new RecommenderEngine(interactions, items).recommendNextBestAction(
    ctx,
    opts,
  );
}
