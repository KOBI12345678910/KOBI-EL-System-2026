/**
 * ONYX Procurement — DB Pool / Supabase Client Configuration
 * ───────────────────────────────────────────────────────────
 * Agent-58 / Connection Pool Module
 *
 * Purpose
 * -------
 * Provide a single, canonical helper for building a Supabase client (and,
 * optionally, a raw `pg.Pool`) with the settings recommended in
 * `docs/db-connection-pool.md`.
 *
 * This module is PURELY ADDITIVE — it never removes or replaces the primary
 * supabase client in `server.js`. Callers opt-in by doing:
 *
 *   const { makeSupabase } = require('./src/db/pool-config');
 *   const supabase = makeSupabase();                // anon, env-aware
 *   const admin    = makeSupabase({ role: 'service' });
 *
 * Or, for scripts that need a raw pg Pool:
 *
 *   const { makePgPool } = require('./src/db/pool-config');
 *   const pool = makePgPool();
 *
 * Environment awareness
 * ---------------------
 * `NODE_ENV=production` → "tight" profile (30 s statement timeout, 5 s
 *                          connect timeout, 10 max connections).
 * Anything else         → "relaxed" profile (60 s, 10 s, 20 max).
 *
 * The tier limits come from `docs/db-connection-pool.md` section 3. Supabase
 * free-tier has ~60 concurrent connections total across all services, so we
 * hard-cap each service at 10 in production by default. Override with
 * SUPABASE_POOL_MAX if you're on Pro.
 *
 * Defaults table — see docs/db-connection-pool.md §3 for rationale.
 *
 *                               development         production
 *   pool.max                    20                  Number(SUPABASE_POOL_MAX) || 10
 *   pool.min                    0                   0
 *   idleTimeoutMillis           30000               30000
 *   connectionTimeoutMillis     10000               5000
 *   statement_timeout (ms)      60000               30000
 *   idle_in_tx_timeout (ms)     120000              60000
 *   fetch timeout (ms)          60000               30000
 *   application_name            onyx-procurement@dev  onyx-procurement@prod
 *
 * Nothing in this file reads secrets eagerly; `makeSupabase()` / `makePgPool()`
 * only touch `process.env` when called. That lets tests stub env before
 * constructing the client.
 *
 * ─────────────────────────────────────────────────────────── */

'use strict';

// ─── profile table ──────────────────────────────────────────────────────────
const PROFILES = Object.freeze({
  production: Object.freeze({
    name: 'production',
    poolMax: 10,
    poolMin: 0,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    idleInTxTimeoutMs: 60_000,
    fetchTimeoutMs: 30_000,
    appNameSuffix: 'prod',
  }),
  development: Object.freeze({
    name: 'development',
    poolMax: 20,
    poolMin: 0,
    idleTimeoutMs: 30_000,
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 60_000,
    idleInTxTimeoutMs: 120_000,
    fetchTimeoutMs: 60_000,
    appNameSuffix: 'dev',
  }),
});

/**
 * Return the active profile based on NODE_ENV and optional overrides.
 * Never mutates the frozen PROFILES object.
 */
function resolveProfile(overrides) {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  const base =
    env === 'production' || env === 'prod'
      ? PROFILES.production
      : PROFILES.development;

  // Allow SUPABASE_POOL_MAX to override pool.max even in prod (for Pro tier).
  const envPoolMax = Number(process.env.SUPABASE_POOL_MAX);
  const poolMax =
    Number.isFinite(envPoolMax) && envPoolMax > 0 ? envPoolMax : base.poolMax;

  return Object.freeze({
    ...base,
    poolMax,
    ...(overrides || {}),
  });
}

/**
 * Build a fetch function that aborts after `timeoutMs` ms.
 * Uses globalThis.fetch (Node 18+). Returns undefined on older Node so
 * supabase-js falls back to its own fetch.
 */
function makeTimedFetch(timeoutMs) {
  if (typeof globalThis.fetch !== 'function') return undefined;
  return function timedFetch(url, init) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    // Allow caller to pass their own signal; merge both.
    const merged =
      init && init.signal
        ? linkSignals(init.signal, ctrl.signal)
        : ctrl.signal;
    return globalThis
      .fetch(url, { ...(init || {}), signal: merged })
      .finally(() => clearTimeout(t));
  };
}

/** Combine two AbortSignals into one that aborts if either does. */
function linkSignals(a, b) {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}

/**
 * Build a Supabase client with the recommended settings for the current
 * NODE_ENV.
 *
 *   makeSupabase()                           → anon role, default project
 *   makeSupabase({ role: 'service' })        → service-role key (admin)
 *   makeSupabase({ url, key })               → explicit url/key
 *   makeSupabase({ overrides: { poolMax } }) → custom profile tweak
 *
 * Throws if URL / key are missing. Never silently swallows — scripts that
 * need to log-and-exit should try/catch.
 *
 * Note: @supabase/supabase-js does not manage a TCP pool directly (it uses
 * HTTP REST through PgBouncer). The "pool" settings here are advisory: we
 * pass `application_name` via headers so the connection shows up in
 * `pg_stat_activity`, and we use a timed fetch to enforce client-side
 * request timeout.
 */
function makeSupabase(opts = {}) {
  const profile = resolveProfile(opts.overrides);
  const role = opts.role || 'anon'; // 'anon' | 'service'

  const url = opts.url || process.env.SUPABASE_URL;
  let key = opts.key;
  if (!key) {
    if (role === 'service') {
      key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE;
    } else {
      key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    }
  }
  if (!url) throw new Error('pool-config: SUPABASE_URL is required');
  if (!key) {
    throw new Error(
      `pool-config: missing ${
        role === 'service' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY'
      }`
    );
  }

  const pkgName =
    (opts.appName && String(opts.appName)) ||
    'onyx-procurement';
  const appName = `${pkgName}@${profile.appNameSuffix}`;

  // Lazy-require supabase-js so this module stays usable in projects that
  // don't have it installed (unit tests, tooling, etc.).
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    throw new Error(
      'pool-config: @supabase/supabase-js is not installed in this workspace; ' +
        'add it to package.json to use makeSupabase()'
    );
  }

  const fetchImpl = makeTimedFetch(profile.fetchTimeoutMs);

  const clientOpts = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: opts.schema || 'public',
    },
    global: {
      headers: {
        'X-Client-Info': appName,
        'X-Statement-Timeout-Ms': String(profile.statementTimeoutMs),
      },
      // fetch is only overridden when globalThis.fetch is available (Node 18+).
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    },
  };

  const client = createClient(url, key, clientOpts);

  // Attach profile metadata for observability / tests. Non-enumerable so it
  // doesn't affect JSON.stringify or inspection output.
  Object.defineProperty(client, '__onyxPoolProfile', {
    value: Object.freeze({
      profile: profile.name,
      appName,
      statementTimeoutMs: profile.statementTimeoutMs,
      fetchTimeoutMs: profile.fetchTimeoutMs,
      role,
    }),
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return client;
}

/**
 * Build a raw `pg.Pool` with the recommended settings. Used by migration /
 * backup scripts that talk to Postgres directly (bypassing PgBouncer).
 *
 *   makePgPool()                → uses process.env.DATABASE_URL
 *   makePgPool({ connectionString })
 *   makePgPool({ overrides })
 *
 * Lazy-requires `pg` so this module is safe to load in projects that don't
 * need raw pg (e.g. onyx-procurement's server runtime).
 *
 * Also sets `statement_timeout` and `idle_in_transaction_session_timeout`
 * on every new connection via the `client.query(SET ...)` hook.
 */
function makePgPool(opts = {}) {
  const profile = resolveProfile(opts.overrides);

  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch (e) {
    throw new Error(
      'pool-config: `pg` is not installed in this workspace; add it to ' +
        'package.json to use makePgPool()'
    );
  }

  const connectionString =
    opts.connectionString ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error(
      'pool-config: DATABASE_URL (or SUPABASE_DB_URL) is required for makePgPool()'
    );
  }

  const appName = `${opts.appName || 'onyx-procurement'}@${profile.appNameSuffix}`;

  const pool = new Pool({
    connectionString,
    max: profile.poolMax,
    min: profile.poolMin,
    idleTimeoutMillis: profile.idleTimeoutMs,
    connectionTimeoutMillis: profile.connectionTimeoutMs,
    application_name: appName,
    keepAlive: true,
  });

  // Per-connection server-side guards. Runs once when pg hands us a new
  // physical connection. Errors here surface as 'error' events (do not crash).
  pool.on('connect', (client) => {
    const guards = [
      `SET statement_timeout = ${profile.statementTimeoutMs}`,
      `SET idle_in_transaction_session_timeout = ${profile.idleInTxTimeoutMs}`,
      `SET application_name = '${appName.replace(/'/g, "''")}'`,
    ];
    Promise.all(guards.map((sql) => client.query(sql))).catch((err) => {
      // Non-fatal: log and continue. The pool still works without the SETs.
      // eslint-disable-next-line no-console
      console.warn('[pool-config] guard SET failed:', err && err.message);
    });
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[pool-config] pg pool error:', err && err.message);
  });

  Object.defineProperty(pool, '__onyxPoolProfile', {
    value: Object.freeze({
      profile: profile.name,
      appName,
      poolMax: profile.poolMax,
      statementTimeoutMs: profile.statementTimeoutMs,
    }),
    enumerable: false,
  });

  return pool;
}

module.exports = {
  PROFILES,
  resolveProfile,
  makeSupabase,
  makePgPool,
  // Exported for unit tests only — not part of the public contract.
  __internal: { makeTimedFetch, linkSignals },
};
