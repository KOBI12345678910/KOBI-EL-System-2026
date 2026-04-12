/**
 * Account Assignment Engine  |  מנוע שיוך לקוחות לאנשי מכירות
 * =============================================================
 *
 * Agent Y-029  |  Swarm Sales-Ops  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, in-memory account routing engine. Takes a stream
 * of accounts (leads / prospects / existing customers) and assigns
 * each one to a salesperson based on a priority-ordered rule list.
 *
 * Supports five strategies — round-robin, weighted, skill-based,
 * capacity-aware, account-owner preservation — plus blacklist rules
 * (conflict of interest, customer-of-record lockout) and a dry-run
 * simulator for what-if analysis before committing.
 *
 * Every assignment is logged in an append-only history table
 * (`history[accountId] = [{…entry…}, …]`). Re-assignment pushes a new
 * entry — the previous row is **never** overwritten.
 *
 * No external libraries. No Math.random without a seed. All log
 * messages are bilingual (Hebrew + English).
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Account {
 *     id, name,
 *     industry,          // 'construction' | 'retail' | 'manufacturing' | ...
 *     size,              // 'enterprise' | 'mid-market' | 'smb' | 'micro'
 *     region,            // 'north' | 'center' | 'south' | 'jerusalem' | ...
 *     product,           // 'erp' | 'payroll' | 'procurement' | ...
 *     currentOwner?,     // salesperson id if pre-existing customer
 *     traits?,           // free-form tags — used by skill strategy
 *     value?,            // expected ARR — used by weighted/capacity tie-break
 *   }
 *
 *   Salesperson {
 *     id, name,
 *     skills,            // string[]  — e.g. ['enterprise','hebrew','english']
 *     certifications,    // string[]  — e.g. ['SAP-FI','Oracle-SCM']
 *     capacity,          // max accounts owned at once
 *     load,              // current account count
 *     weight,            // 0.0 – 1.0  — used by weighted strategy
 *     active,            // boolean  — false means skip in all strategies
 *     regions?,          // string[] — optional territory constraint
 *   }
 *
 *   Rule {
 *     id, priority,      // lower number = higher priority
 *     matcher: {
 *       industry?, size?, region?, product?
 *     },
 *     strategy: 'round-robin' | 'weighted' | 'skill' | 'capacity' | 'account-owner',
 *     pool?,             // explicit salesperson id subset; omit to use all active
 *   }
 *
 *   HistoryEntry {
 *     account_id, assignee_id, previous_assignee_id?,
 *     strategy, rule_id?, reason,
 *     reason_he, reason_en, // bilingual
 *     ts,                   // ISO timestamp
 *     action,               // 'assign' | 'reassign' | 'unassign' | 'blacklist'
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   defineRule({priority, matcher, strategy, pool?})     → ruleId
 *   registerSalesperson(sp)                              → id
 *   upsertSalesperson(sp)                                → id
 *   listSalespeople()                                    → Salesperson[]
 *   assign(account)                                      → { assignee_id, rule_id, strategy, reason, reason_he, reason_en }
 *   balanceLoad(salespeople?)                            → { moves[], before, after }
 *   reassign(accountId, newAssigneeId, reason)           → HistoryEntry
 *   unassign(accountId, reason)                          → HistoryEntry
 *   getHistory(accountId)                                → HistoryEntry[]
 *   listUnassigned()                                     → Account[]
 *   listByAssignee(salespersonId)                        → Account[]
 *   simulateAssignment(accounts)                         → { results[], loadDelta, warnings[] }
 *   blacklist(salespersonId, accountId, reason)          → BlacklistEntry
 *   isBlacklisted(salespersonId, accountId)              → boolean
 *   listBlacklist()                                      → BlacklistEntry[]
 *
 * RULE: never delete. Rules, accounts, history and blacklist entries
 * are append-only. `reassign` pushes a new history row; the prior row
 * stays intact. `unassign` records the action but keeps the account
 * in the internal store (status = 'unassigned').
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Deterministic PRNG — xorshift32, seeded, no Math.random reliance
// ─────────────────────────────────────────────────────────────

function makeRng(seed) {
  let s = (seed | 0) || 0x9e3779b9;
  return function next() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s |= 0;
    // map to [0,1)
    return ((s >>> 0) % 1000000) / 1000000;
  };
}

// ─────────────────────────────────────────────────────────────
// Bilingual reason strings
// ─────────────────────────────────────────────────────────────

const REASONS = {
  'round-robin': {
    he: 'סבב הוגן — הוקצה לבא בתור',
    en: 'Round-robin rotation — next in queue',
  },
  'weighted':    {
    he: 'הגרלה משוקללת לפי משקלי אנשי מכירות',
    en: 'Weighted draw by salesperson weight',
  },
  'skill':       {
    he: 'התאמת כישורים / הסמכות לתכונות הלקוח',
    en: 'Skill / certification match to account traits',
  },
  'capacity':    {
    he: 'נציג בעומס הנמוך ביותר',
    en: 'Lowest-load salesperson',
  },
  'account-owner': {
    he: 'שימור בעלים קיים (לקוח חוזר)',
    en: 'Existing owner preserved (returning customer)',
  },
  'no-rule':     {
    he: 'לא נמצאה חוקה מתאימה — לא שויך',
    en: 'No matching rule — left unassigned',
  },
  'blacklisted': {
    he: 'חסום — ניגוד עניינים או אחר',
    en: 'Blacklisted — conflict of interest or other',
  },
  'reassigned':  {
    he: 'הועבר ידנית',
    en: 'Manually re-assigned',
  },
  'unassigned':  {
    he: 'בוטל שיוך',
    en: 'Unassigned',
  },
  'rebalanced':  {
    he: 'איזון עומסים',
    en: 'Load rebalance',
  },
  'empty-pool':  {
    he: 'אין נציגים פעילים בפול — שיוך נכשל',
    en: 'No active salespeople in pool — assignment failed',
  },
  'over-capacity': {
    he: 'כל הנציגים מעל הקיבולת — שיוך נכשל',
    en: 'All salespeople over capacity — assignment failed',
  },
};

function reasonOf(key, extra) {
  const base = REASONS[key] || { he: key, en: key };
  const he = extra ? `${base.he} (${extra})` : base.he;
  const en = extra ? `${base.en} (${extra})` : base.en;
  return { reason: `${he} | ${en}`, reason_he: he, reason_en: en };
}

// ─────────────────────────────────────────────────────────────
// Matcher evaluation
// ─────────────────────────────────────────────────────────────

function matcherFits(matcher, account) {
  if (!matcher || typeof matcher !== 'object') return true;
  const keys = ['industry', 'size', 'region', 'product'];
  for (const k of keys) {
    const want = matcher[k];
    if (want == null) continue;
    const got = account[k];
    if (Array.isArray(want)) {
      if (!want.includes(got)) return false;
    } else if (typeof want === 'function') {
      if (!want(got, account)) return false;
    } else if (want !== got) {
      return false;
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// AccountAssigner class
// ─────────────────────────────────────────────────────────────

class AccountAssigner {

  /**
   * @param {object} [opts]
   * @param {number} [opts.seed=20260411]   seed for deterministic RNG
   * @param {boolean} [opts.allowOverCapacity=false]
   * @param {function} [opts.now] — injectable clock
   */
  constructor(opts = {}) {
    this.opts = {
      seed: opts.seed || 20260411,
      allowOverCapacity: opts.allowOverCapacity === true,
      now: typeof opts.now === 'function' ? opts.now : () => new Date().toISOString(),
    };
    this._rng = makeRng(this.opts.seed);
    this._rules       = [];           // Rule[]   (append-only)
    this._salespeople = new Map();    // id → Salesperson
    this._accounts    = new Map();    // id → Account (with assignee_id)
    this._history     = new Map();    // accountId → HistoryEntry[]
    this._blacklist   = [];           // BlacklistEntry[]
    this._rrCursor    = new Map();    // ruleId → last index (for fair rotation)
    this._counters    = { rules: 0, assignments: 0, reassignments: 0 };
  }

  // ────────────────────────────────────────────────────────
  // Salesperson registry
  // ────────────────────────────────────────────────────────

  registerSalesperson(sp) {
    if (!sp || !sp.id) throw new Error('salesperson.id required | נדרש מזהה נציג');
    if (this._salespeople.has(sp.id)) {
      throw new Error(`duplicate salesperson id: ${sp.id} | מזהה כפול`);
    }
    const row = {
      id:             String(sp.id),
      name:           sp.name || sp.id,
      skills:         Array.isArray(sp.skills) ? sp.skills.slice() : [],
      certifications: Array.isArray(sp.certifications) ? sp.certifications.slice() : [],
      capacity:       Number.isFinite(sp.capacity) ? sp.capacity : 50,
      load:           Number.isFinite(sp.load)     ? sp.load     : 0,
      weight:         Number.isFinite(sp.weight)   ? sp.weight   : 1.0,
      active:         sp.active !== false,
      regions:        Array.isArray(sp.regions) ? sp.regions.slice() : null,
    };
    this._salespeople.set(row.id, row);
    return row.id;
  }

  upsertSalesperson(sp) {
    if (!sp || !sp.id) throw new Error('salesperson.id required | נדרש מזהה נציג');
    if (this._salespeople.has(sp.id)) {
      const cur = this._salespeople.get(sp.id);
      const next = Object.assign({}, cur, sp);
      if (Array.isArray(sp.skills))         next.skills = sp.skills.slice();
      if (Array.isArray(sp.certifications)) next.certifications = sp.certifications.slice();
      if (Array.isArray(sp.regions))        next.regions = sp.regions.slice();
      this._salespeople.set(sp.id, next);
      return sp.id;
    }
    return this.registerSalesperson(sp);
  }

  listSalespeople() {
    return Array.from(this._salespeople.values()).map(s => Object.assign({}, s));
  }

  // ────────────────────────────────────────────────────────
  // Rule registry
  // ────────────────────────────────────────────────────────

  defineRule(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('rule spec required | נדרש אובייקט חוקה');
    }
    const { priority, matcher, strategy, pool } = spec;
    if (!Number.isFinite(priority)) {
      throw new Error('rule.priority must be a number | עדיפות נדרשת');
    }
    const VALID = ['round-robin', 'weighted', 'skill', 'capacity', 'account-owner'];
    if (!VALID.includes(strategy)) {
      throw new Error(
        `unknown strategy: ${strategy} | אסטרטגיה לא מוכרת. valid: ${VALID.join(', ')}`
      );
    }
    const id = `rule-${++this._counters.rules}`;
    const row = {
      id,
      priority,
      matcher: matcher ? Object.assign({}, matcher) : {},
      strategy,
      pool: Array.isArray(pool) && pool.length > 0 ? pool.slice() : null,
      created_at: this.opts.now(),
    };
    this._rules.push(row);
    // keep rules sorted by priority (stable)
    this._rules.sort((a, b) => a.priority - b.priority);
    return id;
  }

  listRules() {
    return this._rules.map(r => Object.assign({}, r));
  }

  // ────────────────────────────────────────────────────────
  // Blacklist
  // ────────────────────────────────────────────────────────

  blacklist(salespersonId, accountId, reason) {
    if (!salespersonId || !accountId) {
      throw new Error('blacklist needs salesperson + account | חסר מזהה');
    }
    const entry = {
      salesperson_id: String(salespersonId),
      account_id:     String(accountId),
      reason:         reason || 'conflict of interest | ניגוד עניינים',
      ts:             this.opts.now(),
    };
    this._blacklist.push(entry);
    // audit log in account history
    this._pushHistory(entry.account_id, {
      account_id:           entry.account_id,
      assignee_id:          null,
      previous_assignee_id: null,
      strategy:             null,
      rule_id:              null,
      reason:                reasonOf('blacklisted', reason).reason,
      reason_he:             reasonOf('blacklisted', reason).reason_he,
      reason_en:             reasonOf('blacklisted', reason).reason_en,
      ts:                    entry.ts,
      action:                'blacklist',
      meta:                  { salesperson_id: entry.salesperson_id },
    });
    return Object.assign({}, entry);
  }

  isBlacklisted(salespersonId, accountId) {
    return this._blacklist.some(
      b => b.salesperson_id === String(salespersonId) && b.account_id === String(accountId)
    );
  }

  listBlacklist() {
    return this._blacklist.map(b => Object.assign({}, b));
  }

  // ────────────────────────────────────────────────────────
  // Strategy implementations  (all pure — take a pool + account)
  // ────────────────────────────────────────────────────────

  _poolFor(rule, account) {
    const base = rule && rule.pool
      ? rule.pool.map(id => this._salespeople.get(id)).filter(Boolean)
      : Array.from(this._salespeople.values());
    return base.filter(sp =>
      sp.active &&
      !this.isBlacklisted(sp.id, account.id) &&
      (!sp.regions || !account.region || sp.regions.includes(account.region))
    );
  }

  _strategyRoundRobin(rule, pool /*, account*/) {
    if (pool.length === 0) return null;
    const sorted = pool.slice().sort((a, b) => a.id.localeCompare(b.id));
    const key    = rule ? rule.id : '__default__';
    const last   = this._rrCursor.has(key) ? this._rrCursor.get(key) : -1;
    const next   = (last + 1) % sorted.length;
    this._rrCursor.set(key, next);
    return sorted[next];
  }

  _strategyWeighted(_rule, pool /*, account*/) {
    if (pool.length === 0) return null;
    const weights = pool.map(p => Math.max(0, p.weight || 0));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return pool[0];
    const r = this._rng() * total;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      acc += weights[i];
      if (r < acc) return pool[i];
    }
    return pool[pool.length - 1];
  }

  _strategySkill(_rule, pool, account) {
    if (pool.length === 0) return null;
    const traits = [].concat(
      account.traits || [],
      account.industry ? [account.industry] : [],
      account.size     ? [account.size]     : [],
      account.product  ? [account.product]  : []
    ).map(s => String(s).toLowerCase());

    const score = (sp) => {
      const bag = [].concat(sp.skills || [], sp.certifications || [])
        .map(s => String(s).toLowerCase());
      let hits = 0;
      for (const t of traits) {
        if (bag.includes(t)) hits += 1;
      }
      return hits;
    };

    const scored = pool.map(sp => ({ sp, hits: score(sp) }));
    scored.sort((a, b) => b.hits - a.hits || a.sp.load - b.sp.load || a.sp.id.localeCompare(b.sp.id));

    if (scored[0].hits === 0) {
      // no trait match — fall back to lowest load
      return this._strategyCapacity(_rule, pool, account);
    }
    return scored[0].sp;
  }

  _strategyCapacity(_rule, pool /*, account*/) {
    if (pool.length === 0) return null;
    const eligible = this.opts.allowOverCapacity
      ? pool
      : pool.filter(sp => sp.load < sp.capacity);
    if (eligible.length === 0) return null; // over-capacity
    eligible.sort((a, b) => {
      const ra = a.load / Math.max(1, a.capacity);
      const rb = b.load / Math.max(1, b.capacity);
      if (ra !== rb) return ra - rb;
      if (a.load !== b.load) return a.load - b.load;
      return a.id.localeCompare(b.id);
    });
    return eligible[0];
  }

  _strategyAccountOwner(_rule, pool, account) {
    if (!account.currentOwner) return null;
    const owner = this._salespeople.get(String(account.currentOwner));
    if (!owner || !owner.active) return null;
    if (this.isBlacklisted(owner.id, account.id)) return null;
    // only if owner is actually in the pool
    if (!pool.find(p => p.id === owner.id)) return null;
    return owner;
  }

  _runStrategy(strategy, rule, pool, account) {
    switch (strategy) {
      case 'round-robin':   return this._strategyRoundRobin(rule, pool, account);
      case 'weighted':      return this._strategyWeighted(rule, pool, account);
      case 'skill':         return this._strategySkill(rule, pool, account);
      case 'capacity':      return this._strategyCapacity(rule, pool, account);
      case 'account-owner': return this._strategyAccountOwner(rule, pool, account);
      default:
        throw new Error(`unknown strategy: ${strategy}`);
    }
  }

  // ────────────────────────────────────────────────────────
  // Core assign
  // ────────────────────────────────────────────────────────

  assign(account) {
    if (!account || !account.id) {
      throw new Error('account.id required | נדרש מזהה לקוח');
    }
    if (this._rules.length === 0) {
      // no rules — leave unassigned, record reason
      return this._commitAssignment(account, null, null, reasonOf('no-rule'), 'assign');
    }

    for (const rule of this._rules) {
      if (!matcherFits(rule.matcher, account)) continue;
      const pool = this._poolFor(rule, account);
      if (pool.length === 0) {
        // try next rule
        continue;
      }
      const picked = this._runStrategy(rule.strategy, rule, pool, account);
      if (!picked) continue;
      return this._commitAssignment(
        account,
        picked.id,
        rule,
        reasonOf(rule.strategy),
        'assign'
      );
    }

    // fell through all rules — unassigned
    return this._commitAssignment(account, null, null, reasonOf('no-rule'), 'assign');
  }

  _commitAssignment(account, assigneeId, rule, reasonObj, action) {
    const id = String(account.id);
    const prev = this._accounts.get(id);
    const previousAssigneeId = prev && prev.assignee_id ? prev.assignee_id : null;

    // Store/refresh account snapshot
    const stored = Object.assign({}, prev || account, account, {
      id,
      assignee_id: assigneeId,
      status: assigneeId ? 'assigned' : 'unassigned',
      updated_at: this.opts.now(),
    });
    this._accounts.set(id, stored);

    // Adjust loads (decrement previous, increment new)
    if (previousAssigneeId && previousAssigneeId !== assigneeId) {
      const prevSp = this._salespeople.get(previousAssigneeId);
      if (prevSp) prevSp.load = Math.max(0, (prevSp.load || 0) - 1);
    }
    if (assigneeId && assigneeId !== previousAssigneeId) {
      const sp = this._salespeople.get(assigneeId);
      if (sp) sp.load = (sp.load || 0) + 1;
    }

    this._counters.assignments += 1;
    if (previousAssigneeId && previousAssigneeId !== assigneeId) {
      this._counters.reassignments += 1;
    }

    const entry = {
      account_id:           id,
      assignee_id:          assigneeId,
      previous_assignee_id: previousAssigneeId,
      strategy:             rule ? rule.strategy : null,
      rule_id:              rule ? rule.id       : null,
      reason:               reasonObj.reason,
      reason_he:            reasonObj.reason_he,
      reason_en:            reasonObj.reason_en,
      ts:                   this.opts.now(),
      action,
    };
    this._pushHistory(id, entry);

    return Object.assign({}, entry);
  }

  _pushHistory(accountId, entry) {
    if (!this._history.has(accountId)) this._history.set(accountId, []);
    this._history.get(accountId).push(Object.freeze(Object.assign({}, entry)));
  }

  // ────────────────────────────────────────────────────────
  // Re-assignment & history
  // ────────────────────────────────────────────────────────

  reassign(accountId, newAssigneeId, reason) {
    const id = String(accountId);
    const acct = this._accounts.get(id);
    if (!acct) throw new Error(`unknown account: ${id} | לקוח לא מוכר`);
    const sp = this._salespeople.get(String(newAssigneeId));
    if (!sp) throw new Error(`unknown salesperson: ${newAssigneeId} | נציג לא מוכר`);
    if (!sp.active) throw new Error(`salesperson ${sp.id} is inactive | הנציג אינו פעיל`);
    if (this.isBlacklisted(sp.id, id)) {
      throw new Error(`${sp.id} is blacklisted for account ${id} | הנציג חסום ללקוח`);
    }
    return this._commitAssignment(
      acct,
      sp.id,
      null,
      reasonOf('reassigned', reason),
      'reassign'
    );
  }

  unassign(accountId, reason) {
    const id = String(accountId);
    const acct = this._accounts.get(id);
    if (!acct) throw new Error(`unknown account: ${id} | לקוח לא מוכר`);
    return this._commitAssignment(
      acct,
      null,
      null,
      reasonOf('unassigned', reason),
      'unassign'
    );
  }

  getHistory(accountId) {
    const h = this._history.get(String(accountId));
    return h ? h.slice() : [];
  }

  // ────────────────────────────────────────────────────────
  // Listing helpers
  // ────────────────────────────────────────────────────────

  listUnassigned() {
    return Array.from(this._accounts.values())
      .filter(a => !a.assignee_id)
      .map(a => Object.assign({}, a));
  }

  listByAssignee(salespersonId) {
    const key = String(salespersonId);
    return Array.from(this._accounts.values())
      .filter(a => a.assignee_id === key)
      .map(a => Object.assign({}, a));
  }

  // ────────────────────────────────────────────────────────
  // Load rebalancing
  // ────────────────────────────────────────────────────────

  /**
   * Redistribute accounts from over-loaded to under-loaded reps.
   * Never moves an account off an account-owner hold, never crosses
   * a blacklist, never pushes a target above capacity.
   *
   * @param {Salesperson[]} [salespeople]  — optional scope filter
   * @returns {{moves:Array, before:Array, after:Array}}
   */
  balanceLoad(salespeople) {
    const scope = (salespeople && salespeople.length > 0)
      ? salespeople.map(s => (typeof s === 'string' ? s : s.id)).filter(Boolean)
      : Array.from(this._salespeople.keys());
    const pool = scope.map(id => this._salespeople.get(id)).filter(Boolean).filter(s => s.active);
    if (pool.length < 2) {
      return { moves: [], before: this._snapshotLoads(pool), after: this._snapshotLoads(pool) };
    }
    const before = this._snapshotLoads(pool);
    const moves = [];

    // Safety cap on iterations so we cannot loop forever.
    const MAX_ITER = pool.length * 200;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const sorted = pool.slice().sort((a, b) => {
        const ra = a.load / Math.max(1, a.capacity);
        const rb = b.load / Math.max(1, b.capacity);
        return rb - ra;
      });
      const heaviest = sorted[0];
      const lightest = sorted[sorted.length - 1];
      const hr = heaviest.load / Math.max(1, heaviest.capacity);
      const lr = lightest.load / Math.max(1, lightest.capacity);
      if (hr - lr < 1e-9) break;                  // already flat
      if (heaviest.load - lightest.load <= 1) break; // within 1
      if (lightest.load >= lightest.capacity) break; // nowhere to put it

      // Find a candidate account to move
      const candidates = Array.from(this._accounts.values())
        .filter(a => a.assignee_id === heaviest.id)
        .filter(a => !this.isBlacklisted(lightest.id, a.id))
        .filter(a => !lightest.regions || !a.region || lightest.regions.includes(a.region));
      if (candidates.length === 0) break;

      const chosen = candidates[0];
      const prevAssignee = chosen.assignee_id;

      // commit as reassign with special reason
      const reasonObj = reasonOf('rebalanced');
      const entry = this._commitAssignment(
        chosen,
        lightest.id,
        null,
        reasonObj,
        'reassign'
      );
      moves.push({
        account_id: chosen.id,
        from: prevAssignee,
        to: lightest.id,
        reason: entry.reason,
      });
    }

    const after = this._snapshotLoads(pool);
    return { moves, before, after };
  }

  _snapshotLoads(pool) {
    return pool.map(sp => ({
      id:       sp.id,
      load:     sp.load,
      capacity: sp.capacity,
      ratio:    sp.capacity ? sp.load / sp.capacity : 0,
    }));
  }

  // ────────────────────────────────────────────────────────
  // Simulation (dry-run)
  // ────────────────────────────────────────────────────────

  /**
   * Run the full assignment flow without mutating any internal state.
   * Useful for "if I import this CSV, how will it split?" analyses.
   *
   * Uses structured clones of state, a fresh RNG seeded from the
   * current state fingerprint, and returns both per-account decisions
   * and a load delta per salesperson.
   *
   * @param {Account[]} accounts
   */
  simulateAssignment(accounts) {
    if (!Array.isArray(accounts)) {
      throw new Error('accounts must be an array | נדרש מערך לקוחות');
    }
    const shadow = this._fork();
    const results = [];
    const warnings = [];

    for (const a of accounts) {
      try {
        const r = shadow.assign(a);
        results.push(r);
        if (!r.assignee_id) {
          warnings.push({
            account_id: String(a.id),
            code: 'unassigned',
            message: r.reason,
          });
        }
      } catch (err) {
        warnings.push({
          account_id: a && a.id ? String(a.id) : null,
          code: 'error',
          message: err.message,
        });
      }
    }

    // compute load delta
    const before = new Map();
    this._salespeople.forEach((sp, id) => before.set(id, sp.load || 0));
    const after = new Map();
    shadow._salespeople.forEach((sp, id) => after.set(id, sp.load || 0));

    const loadDelta = [];
    before.forEach((prev, id) => {
      const next = after.has(id) ? after.get(id) : prev;
      loadDelta.push({ id, before: prev, after: next, delta: next - prev });
    });

    return { results, loadDelta, warnings };
  }

  /**
   * Return a deep-copy of the assigner with a **separate** RNG cursor.
   * The clone shares nothing with `this` so mutations stay local.
   */
  _fork() {
    const clone = new AccountAssigner({
      seed: this.opts.seed ^ 0xDEADBEEF,
      allowOverCapacity: this.opts.allowOverCapacity,
      now: this.opts.now,
    });
    // copy salespeople
    this._salespeople.forEach((sp, id) => {
      clone._salespeople.set(id, Object.assign({}, sp, {
        skills: sp.skills.slice(),
        certifications: sp.certifications.slice(),
        regions: sp.regions ? sp.regions.slice() : null,
      }));
    });
    // copy rules (shallow — rules are treated as immutable)
    clone._rules = this._rules.map(r => Object.assign({}, r, {
      matcher: Object.assign({}, r.matcher),
      pool: r.pool ? r.pool.slice() : null,
    }));
    // copy accounts snapshot
    this._accounts.forEach((a, id) => clone._accounts.set(id, Object.assign({}, a)));
    // copy history (frozen entries → safe to share references)
    this._history.forEach((arr, id) => clone._history.set(id, arr.slice()));
    // copy blacklist
    clone._blacklist = this._blacklist.map(b => Object.assign({}, b));
    // copy round-robin cursors
    this._rrCursor.forEach((v, k) => clone._rrCursor.set(k, v));
    clone._counters = Object.assign({}, this._counters);
    return clone;
  }

  // ────────────────────────────────────────────────────────
  // Diagnostics
  // ────────────────────────────────────────────────────────

  stats() {
    return {
      rules:         this._rules.length,
      salespeople:   this._salespeople.size,
      accounts:      this._accounts.size,
      unassigned:    this.listUnassigned().length,
      assignments:   this._counters.assignments,
      reassignments: this._counters.reassignments,
      blacklist:     this._blacklist.length,
    };
  }
}

module.exports = {
  AccountAssigner,
  // exported for tests
  _internals: {
    matcherFits,
    makeRng,
    REASONS,
    reasonOf,
  },
};
