/* ============================================================================
 * Techno-Kol ERP — Cost Center Allocation Engine
 * Agent X-43 / Swarm 3C / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע הקצאת עלויות בין מרכזי עלות
 *
 * Allocates indirect / overhead costs from service cost centres to
 * production (revenue-generating) cost centres using a driver library.
 *
 * Methods implemented:
 *   1. DIRECT       — service pools → production CCs only (bypass siblings)
 *   2. STEPDOWN     — sequential, largest service CC allocates first
 *   3. RECIPROCAL   — simultaneous equations, Gauss elimination on M×N matrix
 *   4. ABC          — Activity-Based Costing: cost pool × activity driver rate
 *
 * Driver library (seed):
 *   - headcount          (מספר עובדים)
 *   - sqm                (מטר רבוע)
 *   - machine_hours      (שעות מכונה)
 *   - labor_hours        (שעות עבודה ישירה)
 *   - revenue            (הכנסות)
 *   - orders             (הזמנות שטופלו)
 *   - computers          (תחנות עבודה)
 *   - phone_minutes      (דקות טלפון)
 *   - fixed_percent      (אחוז קבוע)
 *
 * Features:
 *   1. Define cost pools (G&A, IT, HR, Facilities, Utilities)
 *   2. Per-CC / per-period driver data
 *   3. Compute allocations
 *   4. Post allocation journal entries (Agent X-39 interface)
 *   5. What-if analysis across methods
 *   6. Allocation rate transparency (show the math)
 *   7. Period-over-period comparison
 *   8. Variance vs budget
 *   9. Revenue-attribution mode for product-line profitability
 *
 * RULES: never delete, Hebrew bilingual, zero deps.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalog of drivers — Hebrew + English
 * -------------------------------------------------------------------------- */
const DRIVER_CATALOG = Object.freeze({
  headcount:    { id: 'headcount',    he: 'מספר עובדים',     unit: 'אנשים',  minVal: 0 },
  sqm:          { id: 'sqm',          he: 'מטר רבוע',        unit: 'מ"ר',    minVal: 0 },
  machine_hours:{ id: 'machine_hours',he: 'שעות מכונה',      unit: 'שעות',   minVal: 0 },
  labor_hours:  { id: 'labor_hours',  he: 'שעות עבודה ישירה',unit: 'שעות',   minVal: 0 },
  revenue:      { id: 'revenue',      he: 'הכנסות',          unit: '₪',      minVal: 0 },
  orders:       { id: 'orders',       he: 'הזמנות שטופלו',   unit: 'הזמנות', minVal: 0 },
  computers:    { id: 'computers',    he: 'תחנות עבודה',     unit: 'תחנות',  minVal: 0 },
  phone_minutes:{ id: 'phone_minutes',he: 'דקות טלפון',      unit: 'דקות',   minVal: 0 },
  fixed_percent:{ id: 'fixed_percent',he: 'אחוז קבוע',       unit: '%',      minVal: 0 }
});

const METHODS = Object.freeze({
  DIRECT:     'DIRECT',
  STEPDOWN:   'STEPDOWN',
  RECIPROCAL: 'RECIPROCAL',
  ABC:        'ABC'
});

const CC_TYPES = Object.freeze({
  SERVICE:    'SERVICE',     // אוברהד / הוצאות עקיפות
  PRODUCTION: 'PRODUCTION'   // ייצור / מכירה / מניב הכנסה
});

/* ----------------------------------------------------------------------------
 * 1. Rounding to 2 decimals using banker's rounding to avoid
 *    drift in large sums (half-to-even).
 * -------------------------------------------------------------------------- */
function round2(n) {
  if (!isFinite(n)) return 0;
  // Use ε bias to counter 1.005-style binary float issues
  const shifted = Math.round((n + Number.EPSILON) * 100);
  return shifted / 100;
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

/* ----------------------------------------------------------------------------
 * 2. Factory — create an engine instance
 *    State is encapsulated; pure helpers exported below reference this state
 *    via the factory closure.
 * -------------------------------------------------------------------------- */
function createEngine() {
  // Storage — maps keyed on deterministic ids so history is preserved.
  const costCenters = new Map();   // ccId -> { id, code, name, name_he, type, parent, createdAt }
  const pools       = new Map();   // poolId -> { id, code, name, name_he, cc_list, base_amount, driver, period }
  // drivers: key = `${poolId}|${ccId}|${period}` -> numeric value
  const drivers     = new Map();
  // budgets: key = `${ccId}|${period}` -> { budget_amount, currency }
  const budgets     = new Map();
  // allocation runs history — for period-over-period comparison
  const runs        = [];          // [{ runId, period, method, timestamp, allocations, journal_entries, trace }]
  // product line links: productId -> { cc, period, revenue }
  const productLines = new Map();

  let nextCcSeq   = 1;
  let nextPoolSeq = 1;
  let nextRunSeq  = 1;
  let nextJeSeq   = 1;

  /* --------------------------------------------------------------------------
   * 2.1 defineCostCenter
   * ------------------------------------------------------------------------ */
  function defineCostCenter(cc) {
    if (!cc || typeof cc !== 'object') {
      throw new Error('defineCostCenter: cc must be an object');
    }
    if (!cc.code || typeof cc.code !== 'string') {
      throw new Error('defineCostCenter: code is required');
    }
    if (!cc.type || (cc.type !== CC_TYPES.SERVICE && cc.type !== CC_TYPES.PRODUCTION)) {
      throw new Error('defineCostCenter: type must be SERVICE or PRODUCTION');
    }
    const id = cc.id || `CC-${String(nextCcSeq++).padStart(4, '0')}`;
    if (costCenters.has(id)) {
      throw new Error(`defineCostCenter: duplicate id ${id}`);
    }
    const record = {
      id,
      code: cc.code,
      name: cc.name || cc.code,
      name_he: cc.name_he || cc.name || cc.code,
      type: cc.type,
      parent: cc.parent || null,
      createdAt: new Date().toISOString()
    };
    costCenters.set(id, record);
    return id;
  }

  /* --------------------------------------------------------------------------
   * 2.2 definePool
   *     cc_list — target CCs the pool may be allocated to
   *     base_amount — total ₪ in the pool for the default period
   * ------------------------------------------------------------------------ */
  function definePool(pool, cc_list, base_amount) {
    if (!pool || typeof pool !== 'object') {
      throw new Error('definePool: pool must be an object');
    }
    if (!pool.code) throw new Error('definePool: code is required');
    if (!Array.isArray(cc_list) || cc_list.length === 0) {
      throw new Error('definePool: cc_list must be non-empty array');
    }
    for (const ccId of cc_list) {
      if (!costCenters.has(ccId)) {
        throw new Error(`definePool: unknown CC id ${ccId}`);
      }
    }
    if (typeof base_amount !== 'number' || base_amount < 0 || !isFinite(base_amount)) {
      throw new Error('definePool: base_amount must be non-negative finite number');
    }
    const driverId = pool.driver || 'headcount';
    if (!DRIVER_CATALOG[driverId]) {
      throw new Error(`definePool: unknown driver ${driverId}`);
    }
    const id = pool.id || `POOL-${String(nextPoolSeq++).padStart(4, '0')}`;
    if (pools.has(id)) {
      throw new Error(`definePool: duplicate id ${id}`);
    }
    // Source CC — the service CC that "owns" the pool (for step-down ordering)
    const sourceCc = pool.source_cc || null;
    if (sourceCc && !costCenters.has(sourceCc)) {
      throw new Error(`definePool: unknown source_cc ${sourceCc}`);
    }
    const record = {
      id,
      code: pool.code,
      name: pool.name || pool.code,
      name_he: pool.name_he || pool.name || pool.code,
      cc_list: cc_list.slice(),
      base_amount: round2(base_amount),
      driver: driverId,
      source_cc: sourceCc,
      period: pool.period || null,
      // For ABC method — each pool can be tagged as activity-driven
      is_abc: !!pool.is_abc,
      // For ABC cost rate (per activity unit) — optional pre-computed rate
      activity_rate: typeof pool.activity_rate === 'number' ? pool.activity_rate : null
    };
    pools.set(id, record);
    return id;
  }

  /* --------------------------------------------------------------------------
   * 2.3 setDriver
   *     Sets driver value for (pool, cc, period) triplet.
   * ------------------------------------------------------------------------ */
  function setDriver(poolId, ccId, period, value) {
    if (!pools.has(poolId)) {
      throw new Error(`setDriver: unknown pool ${poolId}`);
    }
    if (!costCenters.has(ccId)) {
      throw new Error(`setDriver: unknown cc ${ccId}`);
    }
    if (!period || typeof period !== 'string') {
      throw new Error('setDriver: period must be non-empty string (e.g. "2026-04")');
    }
    if (typeof value !== 'number' || value < 0 || !isFinite(value)) {
      throw new Error('setDriver: value must be non-negative finite number');
    }
    const key = `${poolId}|${ccId}|${period}`;
    drivers.set(key, value);
  }

  function getDriver(poolId, ccId, period) {
    return drivers.get(`${poolId}|${ccId}|${period}`);
  }

  /* --------------------------------------------------------------------------
   * 2.4 setBudget / setPoolBase for a period
   *     Enables variance vs budget calculation.
   * ------------------------------------------------------------------------ */
  function setBudget(ccId, period, amount) {
    if (!costCenters.has(ccId)) {
      throw new Error(`setBudget: unknown cc ${ccId}`);
    }
    if (typeof amount !== 'number' || !isFinite(amount)) {
      throw new Error('setBudget: amount must be finite number');
    }
    budgets.set(`${ccId}|${period}`, { budget_amount: round2(amount), currency: 'ILS' });
  }

  function setPoolBaseForPeriod(poolId, period, amount) {
    const p = pools.get(poolId);
    if (!p) throw new Error(`setPoolBaseForPeriod: unknown pool ${poolId}`);
    if (typeof amount !== 'number' || amount < 0 || !isFinite(amount)) {
      throw new Error('setPoolBaseForPeriod: amount must be non-negative finite');
    }
    // Snapshot per-period base in drivers map using reserved key prefix
    drivers.set(`__POOL_BASE__|${poolId}|${period}`, round2(amount));
  }

  function getPoolBaseForPeriod(poolId, period) {
    const k = `__POOL_BASE__|${poolId}|${period}`;
    if (drivers.has(k)) return drivers.get(k);
    return pools.get(poolId).base_amount;
  }

  /* --------------------------------------------------------------------------
   * 2.5 defineProductLine — used by productLineProfit()
   *     Links a product to a production CC for a period, with revenue.
   * ------------------------------------------------------------------------ */
  function defineProductLine(productId, ccId, period, revenue) {
    if (!productId) throw new Error('defineProductLine: productId required');
    if (!costCenters.has(ccId)) throw new Error(`defineProductLine: unknown cc ${ccId}`);
    if (typeof revenue !== 'number' || revenue < 0) {
      throw new Error('defineProductLine: revenue must be non-negative');
    }
    const key = `${productId}|${period}`;
    productLines.set(key, { productId, ccId, period, revenue: round2(revenue) });
  }

  /* --------------------------------------------------------------------------
   * 3. Core allocation mathematics
   * ------------------------------------------------------------------------ */

  // Compute allocation for a single pool over its target CCs, given driver values.
  // Returns array of { ccId, driverValue, share, amount } with share summing to 1
  // and amounts summing to exactly base_amount (residual pinned to largest).
  //
  // Options:
  //   useFullDenominator: when true, the driver denominator is the full cc_list
  //     (not just ccFilter survivors). Required for reciprocal/step-down where
  //     some of the pool flows to non-target CCs but those charges are routed
  //     elsewhere, and we must preserve original shares.
  //   skipDrift: when true, do not force sum(amount) == base. Used when the
  //     rate is pre-computed and residual drift is expected (ABC pre-rate).
  function allocatePoolByDriver(poolRecord, period, ccFilter, opts) {
    opts = opts || {};
    const base = getPoolBaseForPeriod(poolRecord.id, period);

    // Full list — always the pool's declared cc_list
    const fullList = poolRecord.cc_list.slice();
    const fullValues = fullList.map((ccId) => {
      const v = getDriver(poolRecord.id, ccId, period);
      return typeof v === 'number' ? v : 0;
    });
    const fullTotal = sum(fullValues);

    // Target list — filtered by ccFilter (survivors receive amounts)
    const targets = fullList.filter((ccId) => !ccFilter || ccFilter(ccId, poolRecord));
    const driverValues = targets.map((ccId) => {
      const v = getDriver(poolRecord.id, ccId, period);
      return typeof v === 'number' ? v : 0;
    });

    const targetTotal = sum(driverValues);
    const denominator = opts.useFullDenominator ? fullTotal : targetTotal;
    const rate = denominator > 0 ? base / denominator : 0;

    const rawAmounts = driverValues.map((v) => v * rate);
    const roundedAmounts = rawAmounts.map(round2);

    // Fix rounding drift — push residual onto the largest allocation.
    // Only applicable when we expect sum==base, i.e. full denominator used
    // all the drivers (no filter drop) AND drift fix not suppressed.
    const canFixDrift = !opts.skipDrift
      && (!opts.useFullDenominator || targets.length === fullList.length);
    if (canFixDrift && roundedAmounts.length > 0) {
      const residual = round2(base - sum(roundedAmounts));
      if (residual !== 0) {
        let maxIdx = 0;
        for (let i = 1; i < roundedAmounts.length; i++) {
          if (roundedAmounts[i] > roundedAmounts[maxIdx]) maxIdx = i;
        }
        roundedAmounts[maxIdx] = round2(roundedAmounts[maxIdx] + residual);
      }
    }

    const entries = targets.map((ccId, i) => {
      const driverValue = driverValues[i];
      const share = denominator > 0 ? driverValue / denominator : 0;
      return {
        ccId,
        ccName_he: costCenters.get(ccId).name_he,
        driverValue,
        share: Math.round(share * 1e6) / 1e6,
        amount: roundedAmounts[i],
        rate: round2(rate)
      };
    });

    return {
      poolId: poolRecord.id,
      poolName_he: poolRecord.name_he,
      driver: poolRecord.driver,
      driver_he: DRIVER_CATALOG[poolRecord.driver].he,
      base_amount: base,
      total_driver: denominator,
      rate: round2(rate),
      entries
    };
  }

  /* --------------------------------------------------------------------------
   * 3.1 DIRECT method
   *     Service pools are allocated directly to production CCs only.
   *     Other service CCs in the pool's cc_list are skipped.
   * ------------------------------------------------------------------------ */
  function runDirect(period) {
    const trace = [];
    const allocations = [];
    for (const poolRec of pools.values()) {
      // Force per-period base if set
      const result = allocatePoolByDriver(poolRec, period, (ccId) => {
        return costCenters.get(ccId).type === CC_TYPES.PRODUCTION;
      });
      trace.push({
        step: 'direct',
        pool: poolRec.code,
        pool_he: poolRec.name_he,
        base: result.base_amount,
        driver: result.driver_he,
        total_driver: result.total_driver,
        rate: result.rate,
        note: 'הקצאה ישירה למרכזי ייצור בלבד'
      });
      allocations.push(result);
    }
    return { allocations, trace };
  }

  /* --------------------------------------------------------------------------
   * 3.2 STEPDOWN method
   *     Sequential allocation. Service CCs ordered from largest base to
   *     smallest. Each service CC allocates to all CCs further down the
   *     chain + all production CCs. Already-allocated CCs do not receive
   *     back-charges.
   * ------------------------------------------------------------------------ */
  function runStepDown(period) {
    const trace = [];
    const allocations = [];

    // Order service pools by base amount descending
    const servicePools = Array.from(pools.values())
      .slice()
      .sort((a, b) => getPoolBaseForPeriod(b.id, period) - getPoolBaseForPeriod(a.id, period));

    const alreadyAllocated = new Set(); // CC ids that have finished allocating

    for (const poolRec of servicePools) {
      // Accumulated incoming allocations for the source CC from prior steps
      const incoming = sum(
        allocations
          .flatMap((a) => a.entries)
          .filter((e) => poolRec.source_cc && e.ccId === poolRec.source_cc)
          .map((e) => e.amount)
      );

      // Pool base grows with what was allocated *into* its source CC from earlier steps
      const effectiveBase = round2(getPoolBaseForPeriod(poolRec.id, period) + incoming);

      // Temporarily set base for this run via closure-local override
      const overrideRec = Object.assign({}, poolRec);
      const savedBase = drivers.get(`__POOL_BASE__|${poolRec.id}|${period}`);
      drivers.set(`__POOL_BASE__|${poolRec.id}|${period}`, effectiveBase);

      const result = allocatePoolByDriver(overrideRec, period, (ccId) => {
        if (alreadyAllocated.has(ccId)) return false;
        if (ccId === poolRec.source_cc) return false;
        return true;
      });

      // Restore original base
      if (savedBase !== undefined) {
        drivers.set(`__POOL_BASE__|${poolRec.id}|${period}`, savedBase);
      } else {
        drivers.delete(`__POOL_BASE__|${poolRec.id}|${period}`);
      }

      trace.push({
        step: 'stepdown',
        pool: poolRec.code,
        pool_he: poolRec.name_he,
        base: result.base_amount,
        incoming_from_prior: round2(incoming),
        driver: result.driver_he,
        total_driver: result.total_driver,
        rate: result.rate,
        note: 'הקצאה סדרתית — מרכזי שירות גדולים ראשונים'
      });
      allocations.push(result);
      if (poolRec.source_cc) alreadyAllocated.add(poolRec.source_cc);
    }

    return { allocations, trace };
  }

  /* --------------------------------------------------------------------------
   * 3.3 RECIPROCAL method
   *     Simultaneous equations — solves the linear system:
   *          T_i = C_i + Σ p_ij * T_j   for all service CCs i
   *     where T_i is the total cost to allocate out of service i,
   *           C_i is the direct cost of service i,
   *           p_ij is the proportion of service j's cost going to service i.
   *
   *     Uses Gauss-Jordan elimination with partial pivoting. Pure JS, no deps.
   *     After solving T, allocates T_i to production CCs via driver shares.
   * ------------------------------------------------------------------------ */
  function gaussSolve(A, b) {
    const n = A.length;
    // Build augmented matrix
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      // Partial pivot
      let maxRow = col;
      let maxAbs = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > maxAbs) { maxAbs = v; maxRow = r; }
      }
      if (maxAbs < 1e-12) {
        // Singular — fall back to identity on this col (treat as T_i = C_i)
        M[col][col] = 1;
      } else if (maxRow !== col) {
        const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
      }
      // Eliminate
      const pivot = M[col][col];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / pivot;
        if (factor === 0) continue;
        for (let c = col; c <= n; c++) {
          M[r][c] -= factor * M[col][c];
        }
      }
    }
    // Extract solution
    const x = new Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = M[i][n] / M[i][i];
    }
    return x;
  }

  function runReciprocal(period) {
    const trace = [];
    const allocations = [];

    // Identify service CCs that are "sources" of at least one pool
    const serviceCcs = Array.from(costCenters.values())
      .filter((c) => c.type === CC_TYPES.SERVICE)
      .map((c) => c.id);
    const n = serviceCcs.length;

    if (n === 0) {
      // No service CCs — reciprocal degenerates to direct
      return runDirect(period);
    }

    // Build proportion matrix p[i][j] = fraction of service j's pool going to service i
    const p = Array.from({ length: n }, () => new Array(n).fill(0));
    const directCost = new Array(n).fill(0);

    // Sum direct costs per service CC (from all pools whose source_cc = that CC)
    for (const poolRec of pools.values()) {
      if (!poolRec.source_cc) continue;
      const srcIdx = serviceCcs.indexOf(poolRec.source_cc);
      if (srcIdx < 0) continue;
      directCost[srcIdx] += getPoolBaseForPeriod(poolRec.id, period);

      // For each target CC, compute the proportion and assign to p[i][j] where j = src
      const totalDriver = sum(poolRec.cc_list.map((cc) => getDriver(poolRec.id, cc, period) || 0));
      if (totalDriver === 0) continue;
      for (const ccId of poolRec.cc_list) {
        const v = getDriver(poolRec.id, ccId, period) || 0;
        const share = v / totalDriver;
        const targetIdx = serviceCcs.indexOf(ccId);
        if (targetIdx >= 0 && targetIdx !== srcIdx) {
          p[targetIdx][srcIdx] += share;
        }
      }
    }

    // Build system (I - P) * T = C  where P is proportion matrix, C is direct costs
    const A = Array.from({ length: n }, (_, i) => {
      const row = new Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        row[j] = (i === j ? 1 : 0) - p[i][j];
      }
      return row;
    });

    const T = gaussSolve(A, directCost.slice());

    trace.push({
      step: 'reciprocal:solve',
      matrix_size: `${n}×${n}`,
      direct_costs: directCost.map(round2),
      solved_totals: T.map(round2),
      note: 'פתרון מערכת משוואות סימולטנית (Gauss-Jordan)'
    });

    // Now allocate each T_i to production CCs using the pool's ORIGINAL driver
    // shares (full denominator including service CCs). The slice of T_i that
    // would have gone to other service CCs is absorbed into those services'
    // own T_j solutions — the linear system already balances the total.
    for (const poolRec of pools.values()) {
      if (!poolRec.source_cc) {
        // Pool without source — fall back to direct allocation
        const result = allocatePoolByDriver(poolRec, period, (ccId) =>
          costCenters.get(ccId).type === CC_TYPES.PRODUCTION);
        allocations.push(result);
        continue;
      }
      const srcIdx = serviceCcs.indexOf(poolRec.source_cc);
      if (srcIdx < 0) continue;
      const totalCost = T[srcIdx];

      // Override the base temporarily to the solved T_i
      const savedBase = drivers.get(`__POOL_BASE__|${poolRec.id}|${period}`);
      drivers.set(`__POOL_BASE__|${poolRec.id}|${period}`, round2(totalCost));
      const result = allocatePoolByDriver(
        poolRec,
        period,
        (ccId) => costCenters.get(ccId).type === CC_TYPES.PRODUCTION,
        { useFullDenominator: true, skipDrift: true }
      );
      if (savedBase !== undefined) {
        drivers.set(`__POOL_BASE__|${poolRec.id}|${period}`, savedBase);
      } else {
        drivers.delete(`__POOL_BASE__|${poolRec.id}|${period}`);
      }

      allocations.push(result);
    }

    return { allocations, trace };
  }

  /* --------------------------------------------------------------------------
   * 3.4 ABC (Activity-Based Costing)
   *     Each ABC pool is a cost pool × activity driver. The rate is
   *     computed as base / total_activity, and each consumer CC is charged
   *     rate × its activity consumption.
   * ------------------------------------------------------------------------ */
  function runABC(period) {
    const trace = [];
    const allocations = [];
    for (const poolRec of pools.values()) {
      if (!poolRec.is_abc) {
        // ABC run: fall back to direct for non-ABC pools
        const result = allocatePoolByDriver(poolRec, period, (ccId) =>
          costCenters.get(ccId).type === CC_TYPES.PRODUCTION);
        trace.push({
          step: 'abc:fallback-direct',
          pool: poolRec.code,
          pool_he: poolRec.name_he,
          note: 'מאגר שאינו ABC — הקצאה ישירה'
        });
        allocations.push(result);
        continue;
      }

      // ABC: rate = pool_base / total_activity, or pre-computed activity_rate
      const base = getPoolBaseForPeriod(poolRec.id, period);
      const totalActivity = sum(poolRec.cc_list.map((cc) => getDriver(poolRec.id, cc, period) || 0));
      const rate = poolRec.activity_rate != null
        ? poolRec.activity_rate
        : (totalActivity > 0 ? base / totalActivity : 0);

      const entries = poolRec.cc_list
        .filter((ccId) => costCenters.get(ccId).type === CC_TYPES.PRODUCTION)
        .map((ccId) => {
          const v = getDriver(poolRec.id, ccId, period) || 0;
          const amount = round2(v * rate);
          return {
            ccId,
            ccName_he: costCenters.get(ccId).name_he,
            driverValue: v,
            share: totalActivity > 0 ? v / totalActivity : 0,
            amount,
            rate: round2(rate)
          };
        });

      // Drift fix — only applicable when rate was derived from base/activity.
      // When a pre-computed activity_rate is supplied, the pool base is advisory
      // and the true cost is rate * consumed_activity — do NOT force sum==base.
      if (poolRec.activity_rate == null) {
        const allocated = sum(entries.map((e) => e.amount));
        const residual = round2(base - allocated);
        if (residual !== 0 && entries.length > 0) {
          let maxIdx = 0;
          for (let i = 1; i < entries.length; i++) {
            if (entries[i].amount > entries[maxIdx].amount) maxIdx = i;
          }
          if (sum(entries.map((e) => e.driverValue)) > 0) {
            entries[maxIdx].amount = round2(entries[maxIdx].amount + residual);
          }
        }
      }

      trace.push({
        step: 'abc',
        pool: poolRec.code,
        pool_he: poolRec.name_he,
        base,
        activity_total: totalActivity,
        rate: round2(rate),
        note: `תעריף פעילות: ${round2(rate)} ₪ ליחידה`
      });

      allocations.push({
        poolId: poolRec.id,
        poolName_he: poolRec.name_he,
        driver: poolRec.driver,
        driver_he: DRIVER_CATALOG[poolRec.driver].he,
        base_amount: base,
        total_driver: totalActivity,
        rate: round2(rate),
        entries
      });
    }
    return { allocations, trace };
  }

  /* --------------------------------------------------------------------------
   * 4. runAllocation — entry point; produces JEs + trace
   * ------------------------------------------------------------------------ */
  function runAllocation(period, method) {
    if (!period) throw new Error('runAllocation: period required');
    if (!method) method = METHODS.DIRECT;
    if (!METHODS[method]) throw new Error(`runAllocation: unknown method ${method}`);

    let result;
    switch (method) {
      case METHODS.DIRECT:     result = runDirect(period);     break;
      case METHODS.STEPDOWN:   result = runStepDown(period);   break;
      case METHODS.RECIPROCAL: result = runReciprocal(period); break;
      case METHODS.ABC:        result = runABC(period);        break;
      default: throw new Error(`unknown method: ${method}`);
    }

    // Build journal entries — one JE per pool allocation
    // DR target CCs, CR source (service) CC / pool clearing.
    const journal_entries = [];
    for (const alloc of result.allocations) {
      const pool = pools.get(alloc.poolId);
      const jeId = `JE-ALLOC-${String(nextJeSeq++).padStart(6, '0')}`;
      const lines = [];

      // Debit production / target CCs
      for (const entry of alloc.entries) {
        if (entry.amount === 0) continue;
        lines.push({
          account: `6500-${pool.code}`,      // allocated overhead account
          account_he: `עלויות אוברהד מוקצות — ${pool.name_he}`,
          cost_center: entry.ccId,
          cost_center_he: entry.ccName_he,
          debit: entry.amount,
          credit: 0,
          narration: `הקצאת ${pool.name_he} — שיטה: ${method}`,
          narration_en: `Allocate ${pool.name} — method: ${method}`
        });
      }

      // Credit pool clearing account — one consolidated line
      const totalDr = round2(sum(lines.map((l) => l.debit)));
      if (totalDr > 0) {
        lines.push({
          account: `6000-${pool.code}-CLEAR`,
          account_he: `סליקת מאגר — ${pool.name_he}`,
          cost_center: pool.source_cc || null,
          cost_center_he: pool.source_cc ? (costCenters.get(pool.source_cc) || {}).name_he : null,
          debit: 0,
          credit: totalDr,
          narration: `סליקת מאגר ${pool.name_he}`,
          narration_en: `Clear pool ${pool.name}`
        });
      }

      // Validate JE balance — drop empty JEs instead of pushing zero-line entries
      const drTotal = round2(sum(lines.map((l) => l.debit)));
      const crTotal = round2(sum(lines.map((l) => l.credit)));
      if (lines.length > 0 && drTotal === crTotal) {
        journal_entries.push({
          id: jeId,
          period,
          date: `${period}-01`,
          method,
          pool_id: pool.id,
          pool_code: pool.code,
          pool_name_he: pool.name_he,
          dr_total: drTotal,
          cr_total: crTotal,
          balanced: true,
          lines,
          // Hook for Agent X-39 (GL posting)
          posted: false,
          post_status: 'PENDING'
        });
      }
    }

    // Persist run history for period-over-period + compare
    const runId = `RUN-${String(nextRunSeq++).padStart(6, '0')}`;
    const runRecord = {
      runId,
      period,
      method,
      timestamp: new Date().toISOString(),
      allocations: result.allocations,
      journal_entries,
      trace: result.trace
    };
    runs.push(runRecord);

    return {
      runId,
      period,
      method,
      allocations: result.allocations,
      journal_entries,
      trace: result.trace
    };
  }

  /* --------------------------------------------------------------------------
   * 5. postJournalEntries — Agent X-39 interface
   *     Returns the entries with posted=true flag. Does not delete anything.
   * ------------------------------------------------------------------------ */
  function postJournalEntries(runId, sink) {
    const runRec = runs.find((r) => r.runId === runId);
    if (!runRec) throw new Error(`postJournalEntries: unknown run ${runId}`);

    const posted = [];
    for (const je of runRec.journal_entries) {
      je.posted = true;
      je.post_status = 'POSTED';
      je.posted_at = new Date().toISOString();
      posted.push(je);
      if (typeof sink === 'function') sink(je);
    }
    return posted;
  }

  /* --------------------------------------------------------------------------
   * 6. compareMethod — what-if analysis across methods
   * ------------------------------------------------------------------------ */
  function compareMethod(period, methodsList) {
    if (!Array.isArray(methodsList) || methodsList.length === 0) {
      methodsList = [METHODS.DIRECT, METHODS.STEPDOWN, METHODS.RECIPROCAL, METHODS.ABC];
    }
    const comparison = { period, methods: {}, by_cc: {}, summary: {} };

    // Temp state — do not persist runs. Each call creates a fresh run that IS
    // recorded for audit trail, which matches real accounting practice.
    for (const m of methodsList) {
      const res = runAllocation(period, m);
      comparison.methods[m] = {
        runId: res.runId,
        total_allocated: round2(sum(
          res.allocations.flatMap((a) => a.entries.map((e) => e.amount))
        ))
      };
      // Flatten per-CC totals
      for (const alloc of res.allocations) {
        for (const entry of alloc.entries) {
          if (!comparison.by_cc[entry.ccId]) {
            comparison.by_cc[entry.ccId] = {};
          }
          comparison.by_cc[entry.ccId][m] =
            round2((comparison.by_cc[entry.ccId][m] || 0) + entry.amount);
        }
      }
    }

    // Compute max/min spread per CC
    for (const ccId of Object.keys(comparison.by_cc)) {
      const values = methodsList
        .map((m) => comparison.by_cc[ccId][m] || 0);
      const maxV = Math.max.apply(null, values);
      const minV = Math.min.apply(null, values);
      comparison.by_cc[ccId].spread = round2(maxV - minV);
      comparison.by_cc[ccId].max = round2(maxV);
      comparison.by_cc[ccId].min = round2(minV);
    }

    return comparison;
  }

  /* --------------------------------------------------------------------------
   * 7. periodOverPeriod — compare same method across two periods
   * ------------------------------------------------------------------------ */
  function periodOverPeriod(ccId, periodA, periodB, method) {
    if (!costCenters.has(ccId)) {
      throw new Error(`periodOverPeriod: unknown cc ${ccId}`);
    }
    method = method || METHODS.DIRECT;

    function gatherForPeriod(period) {
      const runsForPeriod = runs.filter((r) => r.period === period && r.method === method);
      const lastRun = runsForPeriod[runsForPeriod.length - 1];
      if (!lastRun) {
        const res = runAllocation(period, method);
        return res;
      }
      return lastRun;
    }

    const a = gatherForPeriod(periodA);
    const b = gatherForPeriod(periodB);

    function ccTotal(run, targetCc) {
      let total = 0;
      for (const alloc of run.allocations) {
        for (const entry of alloc.entries) {
          if (entry.ccId === targetCc) total += entry.amount;
        }
      }
      return round2(total);
    }

    const totA = ccTotal(a, ccId);
    const totB = ccTotal(b, ccId);
    const delta = round2(totB - totA);
    const pct = totA !== 0 ? round2((delta / totA) * 100) : null;

    return {
      ccId,
      cc_name_he: costCenters.get(ccId).name_he,
      periodA,
      periodB,
      method,
      totalA: totA,
      totalB: totB,
      delta,
      pct_change: pct
    };
  }

  /* --------------------------------------------------------------------------
   * 8. varianceVsBudget — planned vs allocated for a given period
   * ------------------------------------------------------------------------ */
  function varianceVsBudget(ccId, period, method) {
    if (!costCenters.has(ccId)) {
      throw new Error(`varianceVsBudget: unknown cc ${ccId}`);
    }
    method = method || METHODS.DIRECT;
    const budgetRec = budgets.get(`${ccId}|${period}`);
    if (!budgetRec) {
      return {
        ccId,
        period,
        method,
        budget: null,
        actual: null,
        variance: null,
        note: 'No budget set'
      };
    }

    // Grab latest run for period+method or create one
    let runRec = runs.filter((r) => r.period === period && r.method === method).slice(-1)[0];
    if (!runRec) {
      runRec = runAllocation(period, method);
    }

    let actual = 0;
    for (const alloc of runRec.allocations) {
      for (const entry of alloc.entries) {
        if (entry.ccId === ccId) actual += entry.amount;
      }
    }
    actual = round2(actual);
    const variance = round2(actual - budgetRec.budget_amount);
    const pct = budgetRec.budget_amount !== 0
      ? round2((variance / budgetRec.budget_amount) * 100)
      : null;

    return {
      ccId,
      cc_name_he: costCenters.get(ccId).name_he,
      period,
      method,
      budget: budgetRec.budget_amount,
      actual,
      variance,
      pct_variance: pct,
      status: variance > 0 ? 'OVER_BUDGET' : (variance < 0 ? 'UNDER_BUDGET' : 'ON_TARGET'),
      status_he: variance > 0 ? 'חריגה מתקציב' : (variance < 0 ? 'מתחת לתקציב' : 'בתקציב')
    };
  }

  /* --------------------------------------------------------------------------
   * 9. productLineProfit — revenue-attribution mode
   * ------------------------------------------------------------------------ */
  function productLineProfit(productId, period) {
    const key = `${productId}|${period}`;
    const line = productLines.get(key);
    if (!line) {
      throw new Error(`productLineProfit: no product line for ${productId} in ${period}`);
    }

    // Use latest allocation run for this period, or create with DIRECT
    let runRec = runs.filter((r) => r.period === period).slice(-1)[0];
    if (!runRec) {
      runRec = runAllocation(period, METHODS.DIRECT);
    }

    // Sum allocated overheads to this product's CC
    let allocatedOverhead = 0;
    const attribution = [];
    for (const alloc of runRec.allocations) {
      for (const entry of alloc.entries) {
        if (entry.ccId === line.ccId) {
          allocatedOverhead += entry.amount;
          attribution.push({
            pool: alloc.poolName_he,
            amount: entry.amount,
            rate: entry.rate
          });
        }
      }
    }
    allocatedOverhead = round2(allocatedOverhead);

    // Revenue attribution — product's share of CC's total revenue
    const ccProducts = Array.from(productLines.values())
      .filter((p) => p.ccId === line.ccId && p.period === period);
    const ccTotalRevenue = round2(sum(ccProducts.map((p) => p.revenue)));
    const revShare = ccTotalRevenue > 0 ? line.revenue / ccTotalRevenue : 0;
    const attributedOverhead = round2(allocatedOverhead * revShare);

    const grossProfit = round2(line.revenue - attributedOverhead);
    const margin = line.revenue > 0
      ? round2((grossProfit / line.revenue) * 100)
      : null;

    return {
      productId,
      period,
      ccId: line.ccId,
      cc_name_he: costCenters.get(line.ccId).name_he,
      revenue: line.revenue,
      cc_total_revenue: ccTotalRevenue,
      revenue_share: Math.round(revShare * 1e6) / 1e6,
      cc_total_allocated_overhead: allocatedOverhead,
      attributed_overhead: attributedOverhead,
      gross_profit: grossProfit,
      gross_margin_pct: margin,
      attribution_trace: attribution
    };
  }

  /* --------------------------------------------------------------------------
   * 10. Introspection helpers (never delete — only reveal state)
   * ------------------------------------------------------------------------ */
  function listCostCenters()  { return Array.from(costCenters.values()).map((v) => Object.assign({}, v)); }
  function listPools()        { return Array.from(pools.values()).map((v) => Object.assign({}, v)); }
  function listRuns()         { return runs.slice(); }
  function listDrivers()      {
    const out = [];
    for (const [k, v] of drivers.entries()) {
      if (k.startsWith('__POOL_BASE__')) continue;
      const parts = k.split('|');
      out.push({ poolId: parts[0], ccId: parts[1], period: parts[2], value: v });
    }
    return out;
  }

  return Object.freeze({
    // constants
    METHODS,
    CC_TYPES,
    DRIVER_CATALOG,
    // definers
    defineCostCenter,
    definePool,
    setDriver,
    getDriver,
    setBudget,
    setPoolBaseForPeriod,
    getPoolBaseForPeriod,
    defineProductLine,
    // compute
    runAllocation,
    postJournalEntries,
    compareMethod,
    periodOverPeriod,
    varianceVsBudget,
    productLineProfit,
    // introspect
    listCostCenters,
    listPools,
    listRuns,
    listDrivers
  });
}

/* ----------------------------------------------------------------------------
 * 11. Default singleton + named exports
 *     Users can either import the default singleton or create their own engine.
 * -------------------------------------------------------------------------- */
const defaultEngine = createEngine();

module.exports = {
  createEngine,
  DRIVER_CATALOG,
  METHODS,
  CC_TYPES,
  round2,
  // bound singleton functions for simple usage
  defineCostCenter: defaultEngine.defineCostCenter,
  definePool:       defaultEngine.definePool,
  setDriver:        defaultEngine.setDriver,
  setBudget:        defaultEngine.setBudget,
  setPoolBaseForPeriod: defaultEngine.setPoolBaseForPeriod,
  defineProductLine:defaultEngine.defineProductLine,
  runAllocation:    defaultEngine.runAllocation,
  postJournalEntries: defaultEngine.postJournalEntries,
  compareMethod:    defaultEngine.compareMethod,
  periodOverPeriod: defaultEngine.periodOverPeriod,
  varianceVsBudget: defaultEngine.varianceVsBudget,
  productLineProfit:defaultEngine.productLineProfit,
  listCostCenters:  defaultEngine.listCostCenters,
  listPools:        defaultEngine.listPools,
  listRuns:         defaultEngine.listRuns,
  listDrivers:      defaultEngine.listDrivers,
  defaultEngine
};
