/**
 * Period-lock adapter — Supabase-backed
 * Techno-Kol ERP 2026 / AGENT-229 (Year-End Close Orchestrator)
 * ----------------------------------------------------------------------------
 * Plugged into createBook({ periods }) to enforce ERR_PERIOD_LOCKED whenever
 * a JE date falls inside a fiscal year whose status is one of:
 *   { 'closed', 'audited', 'submitted' }
 *
 * The journal-entry.js validate/post/unpost paths call `periods.isLocked(period)`
 * SYNCHRONOUSLY — this adapter therefore maintains an in-memory cache.
 *
 * Boot wiring:
 *   const adapter = createSupabasePeriodLockAdapter(supabase);
 *   await adapter.warmup([2023, 2024, 2025, 2026]);
 *   const glBook = createBook({ periods: adapter, ...rest });
 *   app.locals.glBook = glBook;
 *   app.locals.glPeriods = adapter;        // for invalidate() after /close
 *
 * Cache invalidation:
 *   - TTL bound: ttlMs (default 60s) — refreshed on miss
 *   - Hard invalidation: adapter.invalidate(year) after a fiscal-year close
 * ============================================================================ */

'use strict';

const LOCKED_STATUSES = Object.freeze(['closed', 'audited', 'submitted']);

/**
 * Build a Supabase-backed period-lock adapter.
 * @param {object} supabase - Supabase JS client (must expose .from('fiscal_years'))
 * @param {object} [opts]
 * @param {number} [opts.ttlMs=60000]      Cache TTL per year
 * @param {string[]} [opts.lockedStatuses] Override list of locking statuses
 * @returns {{
 *   isLocked(periodKey: string|number): boolean,
 *   warmup(years: number[]): Promise<void>,
 *   invalidate(year?: number): void,
 *   getCacheSnapshot(): Array<{year:number, locked:boolean, expiresAt:number}>
 * }}
 */
function createSupabasePeriodLockAdapter(supabase, opts) {
  const options = opts || {};
  const ttlMs = Number(options.ttlMs || 60_000);
  const lockedStatuses = options.lockedStatuses || LOCKED_STATUSES;

  // Map<year, { locked: boolean, expiresAt: number }>
  const cache = new Map();
  let pending = new Map(); // year -> Promise (de-duplicate concurrent fetches)

  async function fetchLockedYear(year) {
    if (!supabase || typeof supabase.from !== 'function') return false;
    try {
      const q = supabase.from('fiscal_years').select('status').eq('year', year);
      const { data } = typeof q.maybeSingle === 'function'
        ? await q.maybeSingle()
        : await q.single().catch(() => ({ data: null }));
      if (!data) return false;
      return lockedStatuses.includes(String(data.status));
    } catch (_e) {
      // If the DB is unavailable, treat as not-locked to avoid blocking
      // legitimate work — surfaces upstream via DB monitoring.
      return false;
    }
  }

  function primeAsync(year) {
    if (pending.has(year)) return pending.get(year);
    const p = fetchLockedYear(year)
      .then((locked) => {
        cache.set(year, { locked, expiresAt: Date.now() + ttlMs });
        return locked;
      })
      .catch(() => false)
      .finally(() => { pending.delete(year); });
    pending.set(year, p);
    return p;
  }

  /**
   * Synchronous lock check.
   *   - On cache hit (within TTL): returns the cached value.
   *   - On miss/stale: schedules an async refresh AND returns the last-known
   *     value (false if never seen). Callers needing strict correctness must
   *     warmup() at boot and invalidate() after every close.
   */
  function isLocked(periodKey) {
    const s = String(periodKey || '');
    const yr = parseInt(s.slice(0, 4), 10);
    if (!Number.isFinite(yr) || yr < 1900 || yr > 2999) return false;

    const hit = cache.get(yr);
    const now = Date.now();
    if (hit && hit.expiresAt > now) return hit.locked;

    // Miss or stale — schedule prime, return last-known (false if none)
    primeAsync(yr);
    return hit ? hit.locked : false;
  }

  /**
   * Eagerly fetch lock status for the given years.
   * Called at composition root before the GL book is constructed, so the
   * synchronous isLocked() never lies on the first call.
   */
  async function warmup(years) {
    const list = Array.isArray(years) ? years : [];
    for (const y of list) {
      const yr = Number(y);
      if (!Number.isFinite(yr)) continue;
      const locked = await fetchLockedYear(yr);
      cache.set(yr, { locked, expiresAt: Date.now() + ttlMs });
    }
  }

  /** Drop one (or all) years from cache — call after fiscal-year close/reopen. */
  function invalidate(year) {
    if (year == null) {
      cache.clear();
      pending.clear();
      return;
    }
    const yr = Number(year);
    cache.delete(yr);
    pending.delete(yr);
  }

  /** Inspection helper for tests / admin UI. */
  function getCacheSnapshot() {
    const out = [];
    for (const [year, v] of cache.entries()) {
      out.push({ year, locked: v.locked, expiresAt: v.expiresAt });
    }
    return out;
  }

  return { isLocked, warmup, invalidate, getCacheSnapshot };
}

module.exports = {
  createSupabasePeriodLockAdapter,
  LOCKED_STATUSES,
};
