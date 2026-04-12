/**
 * Upsell / Cross-sell Suggester — Association-Rule Mining
 * Techno-Kol Uzi mega-ERP / Agent Y020
 *
 * Zero dependencies. Pure JavaScript. No ML libs, no HTTP calls,
 * no file I/O. Deterministic and offline-friendly.
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים.
 * Nothing is deleted. This module is additive.
 *
 * ───────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES
 * ───────────────────────────────────────────────────────────────
 *
 *   1.  Apriori association-rule mining over historical orders.
 *       Zero-dep, trie-based candidate generation.
 *         - support(X)       = freq(X) / |orders|
 *         - confidence(A→B)  = support(A∪B) / support(A)
 *         - lift(A→B)        = confidence(A→B) / support(B)
 *       Configurable minSupport, minConfidence, minLift.
 *
 *   2.  Cart-aware suggestions — given the current cart,
 *       returns the best antecedent-match rules ranked by
 *       a convex combination of confidence and lift.
 *
 *   3.  Customer-history suggestions — items similar to what
 *       this customer bought before, using item-item cosine on
 *       a co-occurrence matrix (collaborative-filtering fallback
 *       when Apriori has no match).
 *
 *   4.  Seasonality boosts — popularity per ISO week-of-year.
 *
 *   5.  Bilingual explanations (Hebrew + English) for every
 *       suggestion, driven by the rule metrics.
 *
 *   6.  Precision / recall / F1 evaluation helpers.
 *
 * ───────────────────────────────────────────────────────────────
 * INPUT FORMAT
 * ───────────────────────────────────────────────────────────────
 *
 *   An "order" is:
 *
 *     {
 *       id:         'ord-0001',
 *       customerId: 'cust-17',            // optional but recommended
 *       date:       '2026-04-11',         // ISO yyyy-mm-dd, optional
 *       items:      ['SKU-A', 'SKU-B']    // REQUIRED, array of strings
 *     }
 *
 *   Duplicate items inside a single order are de-duplicated.
 *   Empty orders are ignored by `train`.
 *
 * ───────────────────────────────────────────────────────────────
 * OUTPUT FORMAT — suggestion
 * ───────────────────────────────────────────────────────────────
 *
 *   {
 *     item:       'SKU-Z',
 *     score:      0.74,             // ranking score 0..1-ish
 *     source:     'apriori',        // 'apriori' | 'cf' | 'history' | 'seasonal'
 *     rule:       { antecedent:[...], consequent:'SKU-Z',
 *                   support, confidence, lift },
 *     reasoning:  { he: '...', en: '...' }
 *   }
 *
 * Nothing here mutates the input. All methods are pure where
 * possible; the Upseller instance holds the trained model state.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 0. TUNABLE THRESHOLDS
// ═══════════════════════════════════════════════════════════════

const DEFAULTS = Object.freeze({
  minSupport: 0.01, // 1% of orders
  minConfidence: 0.3, // 30% rule confidence
  minLift: 1.5, // lift > 1.5 = meaningfully better than random
  maxItemsetSize: 4, // Apriori stops at k=4 by default
  // Ranking: score = confWeight * confidence + liftWeight * (1 - 1/lift)
  confWeight: 0.6,
  liftWeight: 0.4,
  seasonalHalfWindow: 1, // week-of-year ± this many weeks
});

// ═══════════════════════════════════════════════════════════════
// 1. SMALL UTILITIES
// ═══════════════════════════════════════════════════════════════

/** Deterministic sort — strings by localeCompare. */
function sortedUnique(arr) {
  const s = new Set();
  for (const x of arr) {
    if (x === undefined || x === null) continue;
    s.add(String(x));
  }
  return Array.from(s).sort();
}

/** Cantor-like set key so itemsets are order-independent. */
function setKey(items) {
  return sortedUnique(items).join('\u0001');
}

/** Parse ISO date → week-of-year 1..53. No Intl, no deps. */
function weekOfYear(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  // ISO-8601 week: Thursday in the current week decides the year.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target - firstThursday) / 86400000;
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
}

/** Cosine similarity of two sparse vectors represented as Maps. */
function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  // iterate the smaller map for efficiency
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = large.get(k);
    if (w !== undefined) dot += v * w;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Shallow clamp into [0,1]. */
function clamp01(x) {
  if (!isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ═══════════════════════════════════════════════════════════════
// 2. APRIORI — TRIE-BASED CANDIDATE GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Trie node for itemset storage.
 * Each node's path from root spells an itemset in sorted order.
 * node.count = support count for that itemset.
 */
function makeTrieNode() {
  return { children: new Map(), count: 0 };
}

/** Insert an itemset (sorted) into the trie, incrementing counts. */
function trieInsert(root, itemset) {
  let node = root;
  for (const it of itemset) {
    let child = node.children.get(it);
    if (!child) {
      child = makeTrieNode();
      node.children.set(it, child);
    }
    node = child;
  }
  node.count += 1;
}

/** Look up an itemset's count. Returns 0 if absent. */
function trieGet(root, itemset) {
  let node = root;
  for (const it of itemset) {
    const child = node.children.get(it);
    if (!child) return 0;
    node = child;
  }
  return node.count;
}

/**
 * Count support of all k-itemsets that are subsets of any transaction.
 * We walk the trie and, for each transaction, only descend along items
 * that are present in the transaction — this is Apriori's classic
 * "hash-tree / trie" subset enumeration.
 */
function countSubsets(root, txSorted, k) {
  // recursive walker
  function walk(node, depth, idx) {
    if (depth === k) {
      node.count += 1;
      return;
    }
    // Only items that appear in the transaction can be descended
    for (let i = idx; i <= txSorted.length - (k - depth); i++) {
      const it = txSorted[i];
      const child = node.children.get(it);
      if (child) walk(child, depth + 1, i + 1);
    }
  }
  walk(root, 0, 0);
}

/**
 * Build k+1 candidates from the current "frequent" trie level.
 * A candidate is generated by joining two frequent k-itemsets
 * that share their first k-1 prefix (the classic Apriori-gen join).
 * Then we prune candidates whose any (k)-subset is not frequent.
 */
function generateCandidatesFromTrie(root, freqKitemsets) {
  const nextLevel = new Map(); // key → sorted itemset
  // Group by (k-1)-prefix
  const groups = new Map();
  for (const s of freqKitemsets) {
    const prefix = s.slice(0, -1).join('\u0001');
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(s);
  }
  for (const [, group] of groups) {
    group.sort((a, b) => {
      const la = a[a.length - 1];
      const lb = b[b.length - 1];
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const candidate = a.slice();
        candidate.push(b[b.length - 1]);
        // Prune: all (k)-subsets must be frequent (exist in trie)
        let ok = true;
        for (let drop = 0; drop < candidate.length - 2; drop++) {
          const sub = candidate.slice(0, drop).concat(candidate.slice(drop + 1));
          if (trieGet(root, sub) === 0) {
            ok = false;
            break;
          }
        }
        if (ok) nextLevel.set(candidate.join('\u0001'), candidate);
      }
    }
  }
  return Array.from(nextLevel.values());
}

/**
 * Run Apriori on a list of transactions (each = sorted unique item array).
 * Returns:
 *   {
 *     totalTransactions,
 *     itemCounts: Map<item, count>,
 *     frequentItemsets: Array<{ items, support, count }>,
 *     trie: root node (so we can query any itemset's count)
 *   }
 */
function runApriori(transactions, opts) {
  const N = transactions.length;
  const minSupportCount = Math.max(1, Math.ceil(opts.minSupport * N));
  const maxK = Math.max(1, opts.maxItemsetSize | 0);

  // Level 1: single items
  const itemCounts = new Map();
  for (const tx of transactions) {
    for (const it of tx) {
      itemCounts.set(it, (itemCounts.get(it) || 0) + 1);
    }
  }

  const root = makeTrieNode();
  const frequent = []; // flat list of frequent itemsets across all levels
  const l1Frequent = [];

  for (const [item, count] of itemCounts) {
    if (count >= minSupportCount) {
      const itemset = [item];
      trieInsert(root, itemset);
      // overwrite count with the exact value (trieInsert incremented by 1)
      let n = root;
      n = n.children.get(item);
      n.count = count;
      frequent.push({ items: itemset, count, support: count / N });
      l1Frequent.push(itemset);
    }
  }
  l1Frequent.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  // Higher levels
  let currentFrequent = l1Frequent;
  for (let k = 2; k <= maxK; k++) {
    const candidates = generateCandidatesFromTrie(root, currentFrequent);
    if (candidates.length === 0) break;

    // Insert candidates into the trie with count=0 so countSubsets can bump them
    for (const c of candidates) {
      let node = root;
      for (const it of c) {
        let child = node.children.get(it);
        if (!child) {
          child = makeTrieNode();
          node.children.set(it, child);
        }
        node = child;
      }
      // don't touch count; we'll count from scratch below
    }

    // Reset counts for this level only, then count subsets per transaction
    // We only reset the candidates we just added (not earlier levels).
    const candKeys = new Set(candidates.map((c) => c.join('\u0001')));
    const resetLevel = (node, path) => {
      for (const [it, child] of node.children) {
        const newPath = path.concat(it);
        if (newPath.length === k) {
          if (candKeys.has(newPath.join('\u0001'))) {
            child.count = 0;
          }
        }
        if (newPath.length < k) resetLevel(child, newPath);
      }
    };
    resetLevel(root, []);

    for (const tx of transactions) {
      if (tx.length < k) continue;
      countSubsets(root, tx, k);
    }

    // Keep only frequent candidates
    const nextFrequent = [];
    for (const c of candidates) {
      const cnt = trieGet(root, c);
      if (cnt >= minSupportCount) {
        nextFrequent.push(c);
        frequent.push({ items: c, count: cnt, support: cnt / N });
      } else {
        // prune infrequent candidate from the trie so it doesn't pollute
        // future queries; walk to its parent and delete the leaf.
        // (Safe because count==0 means no transaction matched.)
        let node = root;
        for (let i = 0; i < c.length - 1; i++) {
          node = node.children.get(c[i]);
          if (!node) break;
        }
        if (node) node.children.delete(c[c.length - 1]);
      }
    }
    currentFrequent = nextFrequent;
    if (currentFrequent.length === 0) break;
  }

  return {
    totalTransactions: N,
    itemCounts,
    frequentItemsets: frequent,
    trie: root,
  };
}

/**
 * Derive rules A → B from frequent itemsets.
 * For each frequent itemset X of size ≥ 2 and each non-empty proper
 * subset A of X (consequent B = X\A):
 *   confidence = support(X) / support(A)
 *   lift       = confidence / support(B)
 * Rules are kept only if confidence ≥ minConfidence AND lift ≥ minLift.
 *
 * We only emit rules with consequents of size 1 (single-item cross-sell),
 * which is what most upsell UIs actually use.
 */
function deriveRules(apriori, opts) {
  const rules = [];
  const total = apriori.totalTransactions;
  const supportOf = (items) => trieGet(apriori.trie, sortedUnique(items)) / total;

  for (const fi of apriori.frequentItemsets) {
    if (fi.items.length < 2) continue;
    const items = fi.items;
    const supX = fi.support;
    // consequent = one item; antecedent = the rest
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const a = items.slice(0, i).concat(items.slice(i + 1));
      const supA = supportOf(a);
      if (supA === 0) continue;
      const supB = supportOf([b]);
      if (supB === 0) continue;
      const confidence = supX / supA;
      const lift = confidence / supB;
      if (confidence < opts.minConfidence) continue;
      if (lift < opts.minLift) continue;
      rules.push({
        antecedent: a,
        consequent: b,
        support: supX, // joint support
        supportAntecedent: supA,
        supportConsequent: supB,
        confidence,
        lift,
      });
    }
  }
  // Stable ordering: by (confidence desc, lift desc, then antecedent length asc)
  rules.sort((r1, r2) => {
    if (r2.confidence !== r1.confidence) return r2.confidence - r1.confidence;
    if (r2.lift !== r1.lift) return r2.lift - r1.lift;
    return r1.antecedent.length - r2.antecedent.length;
  });
  return rules;
}

// ═══════════════════════════════════════════════════════════════
// 3. COLLABORATIVE FILTERING — ITEM-ITEM COSINE
// ═══════════════════════════════════════════════════════════════

/**
 * Build item-item co-occurrence vectors.
 * Returns Map<item, Map<otherItem, count>>.
 * The diagonal (item→item = popularity) is included for norm stability.
 */
function buildItemItemVectors(transactions) {
  const vecs = new Map();
  function ensure(k) {
    let m = vecs.get(k);
    if (!m) {
      m = new Map();
      vecs.set(k, m);
    }
    return m;
  }
  for (const tx of transactions) {
    for (let i = 0; i < tx.length; i++) {
      const a = tx[i];
      const va = ensure(a);
      va.set(a, (va.get(a) || 0) + 1);
      for (let j = 0; j < tx.length; j++) {
        if (i === j) continue;
        const b = tx[j];
        va.set(b, (va.get(b) || 0) + 1);
      }
    }
  }
  return vecs;
}

// ═══════════════════════════════════════════════════════════════
// 4. SEASONALITY — POPULARITY PER WEEK-OF-YEAR
// ═══════════════════════════════════════════════════════════════

/**
 * Returns Map<week, Map<item, count>>.
 * Weeks are 1..53. Orders without a valid date are ignored.
 */
function buildSeasonalIndex(orders) {
  const idx = new Map();
  for (const o of orders) {
    if (!o || !o.date) continue;
    const w = weekOfYear(o.date);
    if (!w) continue;
    let wk = idx.get(w);
    if (!wk) {
      wk = new Map();
      idx.set(w, wk);
    }
    const items = sortedUnique(o.items || []);
    for (const it of items) {
      wk.set(it, (wk.get(it) || 0) + 1);
    }
  }
  return idx;
}

// ═══════════════════════════════════════════════════════════════
// 5. BILINGUAL EXPLANATIONS
// ═══════════════════════════════════════════════════════════════

/** Formats a float as a percent with 1-decimal precision. */
function pct(x) {
  return (x * 100).toFixed(1) + '%';
}

/** Turns a rule into a two-language sentence. */
function explainRule(rule) {
  const a = rule.antecedent.join(' + ');
  const b = rule.consequent;
  const c = pct(rule.confidence);
  const l = rule.lift.toFixed(2);
  const s = pct(rule.support);
  const he =
    'לקוחות שקנו ' +
    a +
    ' קנו גם ' +
    b +
    ' ב-' +
    c +
    ' מהמקרים (תמיכה ' +
    s +
    ', liftשל ' +
    l +
    '×).';
  const en =
    'Customers who bought ' +
    a +
    ' also bought ' +
    b +
    ' in ' +
    c +
    ' of cases (support ' +
    s +
    ', lift ' +
    l +
    '×).';
  return { he, en };
}

/** Explanation for CF / history / seasonal sources. */
function explainNonRule(kind, item, signal) {
  if (kind === 'cf') {
    return {
      he: 'פריט דומה לפריטים שבעגלה על פי מטריצת קו-התרחשות (דמיון קוסינוס ' +
        signal.toFixed(2) +
        ').',
      en:
        'Item-item cosine similarity to the cart is ' +
        signal.toFixed(2) +
        ' (collaborative filtering).',
    };
  }
  if (kind === 'history') {
    return {
      he: 'הלקוח רכש את הפריט בעבר ' + signal + ' פעמים — הצעה לחידוש.',
      en: 'Customer previously purchased this item ' + signal + ' time(s) — suggest a refill.',
    };
  }
  if (kind === 'seasonal') {
    return {
      he: 'פריט עונתי פופולרי בשבוע זה בשנה (' + signal + ' רכישות היסטוריות).',
      en: 'Seasonal item popular in this week of year (' + signal + ' historical purchases).',
    };
  }
  return { he: '', en: '' };
}

// ═══════════════════════════════════════════════════════════════
// 6. EVALUATION METRICS
// ═══════════════════════════════════════════════════════════════

/**
 * Precision / recall / F1 for a set of predicted items vs actual items.
 * Both inputs can be arrays, Sets, or array-of-arrays.
 * In array-of-arrays mode, the metrics are averaged per row (macro).
 */
function evaluateOne(predicted, actual) {
  const p = new Set(predicted);
  const a = new Set(actual);
  if (p.size === 0 && a.size === 0) {
    return { precision: 1, recall: 1, f1: 1, tp: 0, fp: 0, fn: 0 };
  }
  let tp = 0;
  for (const x of p) if (a.has(x)) tp += 1;
  const fp = p.size - tp;
  const fn = a.size - tp;
  const precision = p.size === 0 ? 0 : tp / p.size;
  const recall = a.size === 0 ? 0 : tp / a.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

function evaluateMany(predictedRows, actualRows) {
  const n = Math.min(predictedRows.length, actualRows.length);
  if (n === 0) return { precision: 0, recall: 0, f1: 0, rows: 0 };
  let sp = 0;
  let sr = 0;
  let sf = 0;
  for (let i = 0; i < n; i++) {
    const m = evaluateOne(predictedRows[i], actualRows[i]);
    sp += m.precision;
    sr += m.recall;
    sf += m.f1;
  }
  return { precision: sp / n, recall: sr / n, f1: sf / n, rows: n };
}

// ═══════════════════════════════════════════════════════════════
// 7. THE Upseller CLASS
// ═══════════════════════════════════════════════════════════════

class Upseller {
  constructor(options) {
    this.options = Object.assign({}, DEFAULTS, options || {});
    // trained state
    this._trained = false;
    this._apriori = null;
    this._rules = [];
    // index: antecedent-key → rules[]
    this._rulesByAntecedentKey = new Map();
    // index: single item → rules where item is in the antecedent
    this._rulesContainingItem = new Map();
    this._itemVectors = new Map();
    this._customerHistory = new Map(); // customerId → Map<item, count>
    this._seasonal = new Map();
    this._itemPopularity = new Map();
    this._totalOrders = 0;
  }

  /**
   * Train the model on historical orders.
   * `orderHistory` is an array of order objects — see file header.
   */
  train(orderHistory) {
    if (!Array.isArray(orderHistory)) {
      throw new TypeError('train(): orderHistory must be an array');
    }
    // Normalize to sorted-unique item arrays
    const transactions = [];
    const customerHistory = new Map();
    for (const o of orderHistory) {
      if (!o || !Array.isArray(o.items) || o.items.length === 0) continue;
      const items = sortedUnique(o.items);
      if (items.length === 0) continue;
      transactions.push(items);
      if (o.customerId) {
        let h = customerHistory.get(o.customerId);
        if (!h) {
          h = new Map();
          customerHistory.set(o.customerId, h);
        }
        for (const it of items) h.set(it, (h.get(it) || 0) + 1);
      }
    }
    this._totalOrders = transactions.length;
    this._customerHistory = customerHistory;

    // 1) Apriori frequent itemsets + rules
    this._apriori = runApriori(transactions, this.options);
    this._rules = deriveRules(this._apriori, this.options);

    // Index rules for fast cart lookup
    this._rulesByAntecedentKey.clear();
    this._rulesContainingItem.clear();
    for (const r of this._rules) {
      const key = r.antecedent.join('\u0001');
      if (!this._rulesByAntecedentKey.has(key)) this._rulesByAntecedentKey.set(key, []);
      this._rulesByAntecedentKey.get(key).push(r);
      for (const it of r.antecedent) {
        if (!this._rulesContainingItem.has(it)) this._rulesContainingItem.set(it, []);
        this._rulesContainingItem.get(it).push(r);
      }
    }

    // 2) Item-item co-occurrence (CF fallback)
    this._itemVectors = buildItemItemVectors(transactions);

    // 3) Seasonal index (only if dates present)
    this._seasonal = buildSeasonalIndex(orderHistory);

    // 4) Global item popularity
    this._itemPopularity.clear();
    for (const tx of transactions) {
      for (const it of tx) {
        this._itemPopularity.set(it, (this._itemPopularity.get(it) || 0) + 1);
      }
    }

    this._trained = true;
    return {
      transactions: this._totalOrders,
      uniqueItems: this._apriori.itemCounts.size,
      frequentItemsets: this._apriori.frequentItemsets.length,
      rules: this._rules.length,
    };
  }

  /** True if `train()` produced anything usable. */
  isTrained() {
    return this._trained;
  }

  /** All rules currently known to the model (defensive copy). */
  getRules() {
    return this._rules.map((r) => Object.assign({}, r, { antecedent: r.antecedent.slice() }));
  }

  /**
   * Rank score for a rule — convex combination of confidence and
   * a bounded transform of lift. Always in roughly [0,1].
   */
  _rankScore(rule) {
    const liftComponent = 1 - 1 / Math.max(1, rule.lift);
    return (
      this.options.confWeight * clamp01(rule.confidence) +
      this.options.liftWeight * clamp01(liftComponent)
    );
  }

  /**
   * Suggest items for a cart.
   * Signature:
   *   suggest({ currentCart, customerId, limit, date })
   * Returns Array<suggestion>.
   */
  suggest(params) {
    if (!this._trained) {
      throw new Error('Upseller.suggest(): model not trained');
    }
    const p = params || {};
    const cart = sortedUnique(p.currentCart || []);
    const limit = Math.max(1, (p.limit | 0) || 5);
    const customerId = p.customerId;
    const date = p.date;

    const cartSet = new Set(cart);
    const scored = new Map(); // item → best suggestion object

    // 1) Apriori rules whose antecedent ⊆ cart
    // For efficiency, only consider rules that mention at least one cart item.
    const seen = new Set();
    for (const it of cart) {
      const rs = this._rulesContainingItem.get(it);
      if (!rs) continue;
      for (const r of rs) {
        const rk = r.antecedent.join('\u0001') + '\u0002' + r.consequent;
        if (seen.has(rk)) continue;
        seen.add(rk);
        // antecedent must be a subset of the cart
        let ok = true;
        for (const a of r.antecedent) {
          if (!cartSet.has(a)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (cartSet.has(r.consequent)) continue; // already in cart
        const score = this._rankScore(r);
        const prior = scored.get(r.consequent);
        if (!prior || prior.score < score) {
          scored.set(r.consequent, {
            item: r.consequent,
            score,
            source: 'apriori',
            rule: {
              antecedent: r.antecedent.slice(),
              consequent: r.consequent,
              support: r.support,
              confidence: r.confidence,
              lift: r.lift,
            },
            reasoning: explainRule(r),
          });
        }
      }
    }

    // 2) Collaborative-filtering fallback — item-item cosine
    //    Use only when we don't have enough Apriori suggestions, or to
    //    augment the pool. We compute a cart-vector as the sum of item vectors.
    if (cart.length > 0) {
      const cartVec = new Map();
      for (const it of cart) {
        const v = this._itemVectors.get(it);
        if (!v) continue;
        for (const [k, c] of v) cartVec.set(k, (cartVec.get(k) || 0) + c);
      }
      if (cartVec.size > 0) {
        // Candidate items = any item in cartVec that isn't already in cart
        for (const [candidate] of cartVec) {
          if (cartSet.has(candidate)) continue;
          if (scored.has(candidate)) continue; // Apriori already wins
          const candVec = this._itemVectors.get(candidate);
          if (!candVec) continue;
          const sim = cosineSim(cartVec, candVec);
          if (sim <= 0) continue;
          scored.set(candidate, {
            item: candidate,
            score: 0.5 * sim, // CF is a weaker signal than rules — half-weighted
            source: 'cf',
            rule: null,
            reasoning: explainNonRule('cf', candidate, sim),
          });
        }
      }
    }

    // 3) Customer history boost
    if (customerId && this._customerHistory.has(customerId)) {
      const hist = this._customerHistory.get(customerId);
      for (const [it, count] of hist) {
        if (cartSet.has(it)) continue;
        const bumped = 0.1 * Math.min(1, count / 3);
        const existing = scored.get(it);
        if (existing) {
          existing.score = clamp01(existing.score + bumped);
        } else {
          scored.set(it, {
            item: it,
            score: bumped,
            source: 'history',
            rule: null,
            reasoning: explainNonRule('history', it, count),
          });
        }
      }
    }

    // 4) Seasonality boost
    if (date) {
      const w = weekOfYear(date);
      if (w > 0) {
        const hw = Math.max(0, this.options.seasonalHalfWindow | 0);
        for (let dw = -hw; dw <= hw; dw++) {
          const wk = this._seasonal.get(w + dw);
          if (!wk) continue;
          for (const [it, count] of wk) {
            if (cartSet.has(it)) continue;
            const bump = 0.05 * Math.min(1, count / 5);
            const existing = scored.get(it);
            if (existing) {
              existing.score = clamp01(existing.score + bump);
            } else {
              scored.set(it, {
                item: it,
                score: bump,
                source: 'seasonal',
                rule: null,
                reasoning: explainNonRule('seasonal', it, count),
              });
            }
          }
        }
      }
    }

    // Final ranking — stable sort by (score desc, item asc)
    const out = Array.from(scored.values()).sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return x.item < y.item ? -1 : x.item > y.item ? 1 : 0;
    });
    return out.slice(0, limit);
  }

  /**
   * Suggestions based purely on customer history and items similar
   * (by item-item cosine) to what the customer bought before.
   */
  suggestByCustomerHistory(customerId, limit) {
    if (!this._trained) {
      throw new Error('Upseller.suggestByCustomerHistory(): model not trained');
    }
    const lim = Math.max(1, (limit | 0) || 5);
    const hist = this._customerHistory.get(customerId);
    if (!hist || hist.size === 0) return [];

    const ownedSet = new Set(hist.keys());
    // Build an aggregated vector over the customer's history
    const histVec = new Map();
    for (const [it, count] of hist) {
      const v = this._itemVectors.get(it);
      if (!v) continue;
      for (const [k, c] of v) histVec.set(k, (histVec.get(k) || 0) + c * count);
    }

    const scored = new Map();
    // Items the customer already bought → suggest refill (ranked by count)
    for (const [it, count] of hist) {
      scored.set(it, {
        item: it,
        score: 0.2 + 0.1 * Math.min(1, count / 3),
        source: 'history',
        rule: null,
        reasoning: explainNonRule('history', it, count),
      });
    }
    // Similar items via CF
    for (const [candidate] of this._itemVectors) {
      if (ownedSet.has(candidate)) continue;
      const candVec = this._itemVectors.get(candidate);
      if (!candVec) continue;
      const sim = cosineSim(histVec, candVec);
      if (sim <= 0) continue;
      scored.set(candidate, {
        item: candidate,
        score: clamp01(sim),
        source: 'cf',
        rule: null,
        reasoning: explainNonRule('cf', candidate, sim),
      });
    }

    const out = Array.from(scored.values()).sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return x.item < y.item ? -1 : x.item > y.item ? 1 : 0;
    });
    return out.slice(0, lim);
  }

  /**
   * Seasonal suggestions: items popular in the ISO week-of-year of `date`,
   * with an optional half-window of neighbouring weeks.
   */
  suggestBySeasonality(params) {
    if (!this._trained) {
      throw new Error('Upseller.suggestBySeasonality(): model not trained');
    }
    const p = params || {};
    const lim = Math.max(1, (p.limit | 0) || 5);
    const date = p.date;
    if (!date) return [];
    const w = weekOfYear(date);
    if (!w) return [];
    const hw = Math.max(0, (p.halfWindow != null ? p.halfWindow : this.options.seasonalHalfWindow) | 0);

    const agg = new Map();
    for (let dw = -hw; dw <= hw; dw++) {
      const wk = this._seasonal.get(w + dw);
      if (!wk) continue;
      for (const [it, count] of wk) {
        agg.set(it, (agg.get(it) || 0) + count);
      }
    }
    const max = Array.from(agg.values()).reduce((m, x) => (x > m ? x : m), 0);
    if (max === 0) return [];
    const out = [];
    for (const [it, count] of agg) {
      out.push({
        item: it,
        score: count / max,
        source: 'seasonal',
        rule: null,
        reasoning: explainNonRule('seasonal', it, count),
      });
    }
    out.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return x.item < y.item ? -1 : x.item > y.item ? 1 : 0;
    });
    return out.slice(0, lim);
  }

  /**
   * Bilingual explanation for a suggestion. Accepts either a suggestion
   * object returned by suggest*() or a raw rule object.
   */
  explainSuggestion(suggestion) {
    if (!suggestion) return { he: '', en: '' };
    if (suggestion.reasoning && (suggestion.reasoning.he || suggestion.reasoning.en)) {
      return {
        he: suggestion.reasoning.he || '',
        en: suggestion.reasoning.en || '',
      };
    }
    if (suggestion.rule) return explainRule(suggestion.rule);
    if (suggestion.antecedent && suggestion.consequent) return explainRule(suggestion);
    return { he: '', en: '' };
  }

  /**
   * Precision / recall / F1. Accepts either single rows or arrays of rows.
   * predictions/actuals may be:
   *   - Array<item>              — single prediction
   *   - Array<Array<item>>       — many predictions (macro-averaged)
   *   - Array<suggestion>        — suggestion objects, `.item` is extracted
   *   - Array<Array<suggestion>> — many suggestion lists
   */
  evaluate(predictions, actuals) {
    function toItems(row) {
      if (!Array.isArray(row)) return [];
      return row.map((x) => (x && typeof x === 'object' && 'item' in x ? x.item : x));
    }
    const isNested = Array.isArray(predictions) && predictions.length > 0 && Array.isArray(predictions[0]);
    const isNestedObj =
      isNested ||
      (Array.isArray(predictions) &&
        predictions.length > 0 &&
        Array.isArray(predictions[0]) === false &&
        predictions[0] &&
        typeof predictions[0] === 'object' &&
        'item' in predictions[0] === false);
    if (isNested) {
      const pred = predictions.map(toItems);
      const act = actuals.map((r) => (Array.isArray(r) ? r : []));
      return evaluateMany(pred, act);
    }
    return evaluateOne(toItems(predictions || []), actuals || []);
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  Upseller,
  DEFAULTS,
  // Internals exported for unit testing
  runApriori,
  deriveRules,
  buildItemItemVectors,
  buildSeasonalIndex,
  cosineSim,
  weekOfYear,
  sortedUnique,
  setKey,
  explainRule,
  explainNonRule,
  evaluateOne,
  evaluateMany,
};
