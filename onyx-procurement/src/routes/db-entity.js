/**
 * Generic DB Entity browser — Express routes
 * ────────────────────────────────────────────────
 * Lets the UI peek at any whitelisted table/view in any whitelisted
 * schema without having to hand-roll a route per entity. This is the
 * connective tissue behind the Master 360 pages and the wiring-spec
 * "related records" rails — when an entity-map points at a row in a
 * support table that has no dedicated /api/<thing> endpoint, the
 * frontend can fall through to /api/db-entity/:schema/:table/:id.
 *
 * Endpoints:
 *   GET  /api/db-entity/:schema/:table             → first 100 rows + columns + total
 *   GET  /api/db-entity/:schema/:table/columns     → just the column metadata
 *   GET  /api/db-entity/:schema/:table/:id         → single row by primary id
 *
 * Mounted from server.js right after the registerWiringRoutes block:
 *   const { registerDbEntityRoutes } = require('./src/routes/db-entity');
 *   registerDbEntityRoutes(app, { supabase });
 *
 * Defense-in-depth:
 *   1. Identifier allowlist — schema/table names must match
 *      /^[a-z_][a-z0-9_]{0,62}$/i, the standard Postgres unquoted
 *      identifier shape. Anything else is rejected with 400 before
 *      it touches the database. This is belt-and-suspenders: the
 *      Supabase JS client already URL-encodes its inputs, but we
 *      refuse to even build a probe query for a malformed name.
 *   2. Schema allowlist — only the schemas that the running ERP
 *      legitimately uses are reachable. Hitting `pg_catalog`,
 *      `information_schema`, `auth`, `storage`, `vault`, etc. is
 *      rejected with 403. The list mirrors the schemas that
 *      `enterprise-routes.js` and the pipeline modules actually
 *      query, with `public` as the default.
 *   3. Table existence probe — before returning data we run a
 *      `head: true, count: 'exact', limit: 0` query. If PostgREST
 *      reports PGRST205 (table not found) / PGRST106 (schema not
 *      exposed) / 42P01 (relation doesn't exist) we return 404.
 *      Successful probes are memoised for 5 minutes per (schema,
 *      table) so a hammered list view doesn't pay the existence
 *      tax on every request.
 *   4. No raw SQL — every query goes through PostgREST via the
 *      supabase-js client. There is no string interpolation into
 *      SQL anywhere in this file.
 *
 * Why not query information_schema directly?
 *   PostgREST doesn't expose `information_schema` to the anon/service
 *   role unless an explicit RPC is defined, and we don't want to
 *   require one just for a generic browser. The probe-then-cache
 *   approach gives the same defensive guarantee (only real, exposed
 *   tables answer) without adding new DB objects.
 *
 * Limits:
 *   - 100 rows per list call, no pagination knobs (intentional —
 *     this is a browser, not a query API). The total count is
 *     returned alongside so the UI can show "showing 100 of 4,217".
 *   - The :id path assumes the table has a column literally called
 *     `id`. Tables keyed on `code`, `slug`, or composite keys will
 *     404 here — the caller should hit the dedicated entity API
 *     instead. Not every table in the ERP is reachable through this
 *     route by design.
 */

'use strict';

// ── Identifier syntax: standard unquoted Postgres identifier (≤63 chars).
//    Letters, digits, underscores; must start with letter or underscore.
//    Case-insensitive because Postgres folds unquoted names to lowercase
//    but we accept either casing on input.
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/i;

// ── Schema allowlist: every schema the ERP legitimately surfaces.
//    Mirrors the schemas referenced by enterprise-routes.js, the
//    pipeline modules, and the existing migrations. Add new schemas
//    here as they go live; everything else is intentionally 403.
const SCHEMA_ALLOWLIST = new Set([
  'public',
  'crm',
  'execution',
  'workforce',
  'orchestration',
  'finance',
  'procurement',
  'inventory',
  'compliance',
  'hr',
  'payroll',
  'audit',
  'reporting',
]);

// ── Probe cache: (schema|table) → { ok, expires } so we don't re-probe
//    every list/detail call. 5 minutes is short enough that a freshly
//    created table appears within one cup of coffee, long enough that
//    the cache actually pays.
const PROBE_TTL_MS = 5 * 60 * 1000;
const probeCache = new Map();
// ── Tenant-column cache: (schema|table) → { hasTenantId, expires }.
//    Whether the table has a `tenant_id` column dictates whether we
//    add an `.eq('tenant_id', req.tenantId)` filter. Determining this
//    via a column-probe (select tenant_id, head:true) is cheap; we
//    cache the answer on the same TTL so we don't pay it per request.
const tenantColCache = new Map();

// ── Tenant-id shape: RFC 4122 UUID, the same shape requireTenant()
//    accepts. Defense-in-depth — we re-validate even though the
//    middleware also checks. Requested by the P0 spec.
const TENANT_ID_RE = /^[0-9a-f-]{36}$/i;

function cacheKey(schema, table) {
  return `${schema}|${table}`;
}

function getCachedProbe(schema, table) {
  const hit = probeCache.get(cacheKey(schema, table));
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    probeCache.delete(cacheKey(schema, table));
    return null;
  }
  return hit;
}

function setCachedProbe(schema, table, ok) {
  probeCache.set(cacheKey(schema, table), {
    ok,
    expires: Date.now() + PROBE_TTL_MS,
  });
}

function getCachedTenantCol(schema, table) {
  const hit = tenantColCache.get(cacheKey(schema, table));
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    tenantColCache.delete(cacheKey(schema, table));
    return null;
  }
  return hit;
}

function setCachedTenantCol(schema, table, hasTenantId) {
  tenantColCache.set(cacheKey(schema, table), {
    hasTenantId,
    expires: Date.now() + PROBE_TTL_MS,
  });
}

/**
 * Detect whether (schema, table) has a `tenant_id` column. We can't
 * read information_schema through PostgREST without a custom RPC, so
 * we probe by issuing `SELECT tenant_id ... LIMIT 0` against the
 * table. A 42703 ("column does not exist") tells us cleanly that the
 * table has no tenant_id column and is therefore NOT tenant-scoped.
 * Any other success means the column exists.
 *
 * Returns true / false. Cached on PROBE_TTL_MS.
 *
 * Why this matters: the P0 cross-tenant bypass on /api/db-entity is
 * fixed by adding `.eq('tenant_id', req.tenantId)` to the SELECT —
 * but only for tables that actually have such a column. Reference
 * tables (countries, currencies, schema_migrations, etc.) don't, and
 * forcing the filter on them would break legitimate reads.
 */
async function detectTenantIdColumn(supabase, schema, table) {
  const cached = getCachedTenantCol(schema, table);
  if (cached) return cached.hasTenantId;

  const { error } = await supabase
    .schema(schema)
    .from(table)
    .select('tenant_id', { head: true, count: 'exact' })
    .limit(0);

  if (error) {
    // 42703 = column does not exist → table is NOT tenant-scoped.
    if (error.code === '42703' ||
        String(error.message || '').toLowerCase().includes('tenant_id')) {
      setCachedTenantCol(schema, table, false);
      return false;
    }
    // Anything else is a transport/permissions issue we can't classify
    // safely. Fail closed: assume the column exists so the route still
    // applies the filter. Worst-case the query returns empty rows.
    setCachedTenantCol(schema, table, true);
    return true;
  }

  setCachedTenantCol(schema, table, true);
  return true;
}

/**
 * Verify the request carries a real tenant context attached by
 * requireTenant() — not just a spoofed X-Tenant-Id header reaching a
 * handler that forgot to mount the middleware. requireTenant() always
 * sets BOTH `req.tenantId` AND `req.tenantContext`; if only the first
 * is present the value didn't come from the middleware, only from a
 * caller setting `req.tenantId` directly which we don't trust.
 *
 * Returns true on success. On failure writes a 401 and returns false
 * so the caller can `return` immediately.
 */
function requireTenantOnRequest(req, res) {
  // 1. Must be a non-empty string.
  if (!req.tenantId || typeof req.tenantId !== 'string') {
    res.status(401).json({ error: 'tenant_required' });
    return false;
  }
  // 2. Must match UUID shape (RFC 4122).
  if (!TENANT_ID_RE.test(req.tenantId)) {
    res.status(401).json({ error: 'tenant_required' });
    return false;
  }
  // 3. Must have been set by requireTenant(), not by a downstream
  //    handler stuffing the field. requireTenant() ALWAYS writes
  //    req.tenantContext — if it's missing, the middleware did not
  //    run on this request and we will not trust a bare value.
  if (!req.tenantContext || typeof req.tenantContext !== 'object') {
    res.status(401).json({ error: 'tenant_required' });
    return false;
  }
  return true;
}

/**
 * Validate `:schema` and `:table` path params. Returns
 * `{ schema, table }` (lowercased — Postgres canonical form) on
 * success, or sends a 400/403 on the response and returns null.
 */
function validateIdentifiers(req, res) {
  const schemaRaw = String(req.params.schema || '');
  const tableRaw = String(req.params.table || '');

  if (!IDENT_RE.test(schemaRaw)) {
    res.status(400).json({
      error: 'invalid_schema',
      detail: 'schema must match /^[a-z_][a-z0-9_]{0,62}$/i',
    });
    return null;
  }
  if (!IDENT_RE.test(tableRaw)) {
    res.status(400).json({
      error: 'invalid_table',
      detail: 'table must match /^[a-z_][a-z0-9_]{0,62}$/i',
    });
    return null;
  }

  const schema = schemaRaw.toLowerCase();
  const table = tableRaw.toLowerCase();

  if (!SCHEMA_ALLOWLIST.has(schema)) {
    res.status(403).json({
      error: 'schema_not_allowed',
      detail: `schema '${schema}' is not in the allowlist`,
      allowed: Array.from(SCHEMA_ALLOWLIST).sort(),
    });
    return null;
  }

  return { schema, table };
}

/**
 * Probe whether (schema, table) exists and is reachable through
 * PostgREST. Returns true on success, false on missing/forbidden.
 * Throws only on transport-level errors the caller should treat as 5xx.
 */
async function probeTable(supabase, schema, table) {
  const cached = getCachedProbe(schema, table);
  if (cached) return cached.ok;

  // head:true means "give me the count, no rows"; limit(0) keeps the
  // server from materialising rows even if PostgREST ignores `head`.
  const q = supabase.schema(schema).from(table).select('*', { count: 'exact', head: true }).limit(0);
  const { error, count } = await q;

  if (error) {
    // PGRST205 = table not exposed / not found in schema cache.
    // PGRST106 = schema not in `db-schemas` config.
    // 42P01    = relation does not exist (raw Postgres).
    // 42501    = insufficient privilege — treat as not-reachable so
    //            we don't leak existence of locked tables.
    const code = error.code || '';
    const msg = String(error.message || '').toLowerCase();
    const missing =
      code === 'PGRST205' ||
      code === 'PGRST106' ||
      code === '42P01' ||
      code === '42501' ||
      msg.includes('not found') ||
      msg.includes('does not exist');
    if (missing) {
      setCachedProbe(schema, table, false);
      return false;
    }
    // Transport / unknown — bubble up so the route returns 500.
    const wrapped = new Error(`probe failed: ${error.message || code}`);
    wrapped.cause = error;
    throw wrapped;
  }

  setCachedProbe(schema, table, true);
  // count is informational here; the caller will re-fetch with rows.
  return true;
  // eslint-disable-next-line no-unused-vars
  void count;
}

/**
 * Derive a column-metadata list from a sample row. Postgres types
 * aren't reachable through PostgREST without information_schema, so
 * we report JS-side types as the next best thing — enough for the
 * UI to choose a renderer (number → right-align, string → left,
 * object → JSON viewer).
 */
function inferColumnsFromRow(row) {
  if (!row || typeof row !== 'object') return [];
  return Object.keys(row).map((name) => {
    const v = row[name];
    let jsType;
    if (v === null) jsType = 'null';
    else if (Array.isArray(v)) jsType = 'array';
    else jsType = typeof v;
    return { name, jsType };
  });
}

/**
 * registerDbEntityRoutes — attaches the three GET endpoints to the
 * given Express app, using the provided Supabase client.
 *
 * @param {import('express').Express} app
 * @param {{ supabase: any }} deps
 */
function registerDbEntityRoutes(app, deps = {}) {
  const { supabase } = deps;
  if (!app || typeof app.get !== 'function') {
    throw new Error('registerDbEntityRoutes: express `app` is required');
  }
  if (!supabase || typeof supabase.from !== 'function' || typeof supabase.schema !== 'function') {
    throw new Error('registerDbEntityRoutes: a `supabase` client with .schema()/.from() is required');
  }

  // ── /columns first so the literal "columns" doesn't collide with :id.
  app.get('/api/db-entity/:schema/:table/columns', async (req, res) => {
    try {
      if (!requireTenantOnRequest(req, res)) return;

      const ids = validateIdentifiers(req, res);
      if (!ids) return;

      const exists = await probeTable(supabase, ids.schema, ids.table);
      if (!exists) {
        return res.status(404).json({
          error: 'table_not_found',
          schema: ids.schema,
          table: ids.table,
        });
      }

      // Fetch one row to derive column shape. Empty table = empty columns.
      // Filter by tenant_id if the table has it so a foreign tenant
      // cannot infer column shape from another tenant's data.
      const hasTenantId = await detectTenantIdColumn(supabase, ids.schema, ids.table);
      let q = supabase.schema(ids.schema).from(ids.table).select('*').limit(1);
      if (hasTenantId) q = q.eq('tenant_id', req.tenantId);
      const { data, error } = await q;
      if (error) {
        return res.status(500).json({
          error: 'columns_fetch_failed',
          detail: error.message || String(error),
        });
      }

      const columns = inferColumnsFromRow((data && data[0]) || null);
      return res.json({
        schema: ids.schema,
        table: ids.table,
        columns,
        sampled: !!(data && data[0]),
      });
    } catch (err) {
      return res.status(500).json({
        error: 'internal',
        detail: err && err.message,
      });
    }
  });

  // ── Single row by id. Tables without an `id` column will 404.
  app.get('/api/db-entity/:schema/:table/:id', async (req, res) => {
    try {
      if (!requireTenantOnRequest(req, res)) return;

      const ids = validateIdentifiers(req, res);
      if (!ids) return;

      const exists = await probeTable(supabase, ids.schema, ids.table);
      if (!exists) {
        return res.status(404).json({
          error: 'table_not_found',
          schema: ids.schema,
          table: ids.table,
        });
      }

      // Cross-tenant guard: if the table has a tenant_id column, scope
      // the lookup to req.tenantId. A row owned by a different tenant
      // becomes a 404 for the caller, not a 403 — we never confirm the
      // existence of foreign-tenant rows.
      const hasTenantId = await detectTenantIdColumn(supabase, ids.schema, ids.table);
      let q = supabase
        .schema(ids.schema)
        .from(ids.table)
        .select('*')
        .eq('id', req.params.id);
      if (hasTenantId) q = q.eq('tenant_id', req.tenantId);
      const { data, error } = await q.maybeSingle();

      if (error) {
        // 22P02 = invalid_text_representation (e.g. non-uuid where uuid expected).
        // 42703 = column "id" does not exist — table not addressable here.
        if (error.code === '42703') {
          return res.status(404).json({
            error: 'table_has_no_id_column',
            schema: ids.schema,
            table: ids.table,
            hint: 'this table is not keyed on an `id` column; use the dedicated entity API',
          });
        }
        return res.status(500).json({
          error: 'row_fetch_failed',
          detail: error.message || String(error),
          code: error.code,
        });
      }

      if (!data) {
        return res.status(404).json({
          error: 'row_not_found',
          schema: ids.schema,
          table: ids.table,
          id: req.params.id,
        });
      }

      return res.json({
        schema: ids.schema,
        table: ids.table,
        id: req.params.id,
        row: data,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'internal',
        detail: err && err.message,
      });
    }
  });

  // ── List: first 100 rows + columns + total count.
  app.get('/api/db-entity/:schema/:table', async (req, res) => {
    try {
      if (!requireTenantOnRequest(req, res)) return;

      const ids = validateIdentifiers(req, res);
      if (!ids) return;

      const exists = await probeTable(supabase, ids.schema, ids.table);
      if (!exists) {
        return res.status(404).json({
          error: 'table_not_found',
          schema: ids.schema,
          table: ids.table,
        });
      }

      // Cross-tenant guard: if the table is tenant-scoped, every list
      // call MUST be filtered by req.tenantId. This is the fix for the
      // P0 bypass on /api/db-entity/public/customers — a caller with a
      // different (or fake) X-Tenant-Id will see zero rows, never the
      // owning tenant's data.
      const hasTenantId = await detectTenantIdColumn(supabase, ids.schema, ids.table);
      let listQ = supabase
        .schema(ids.schema)
        .from(ids.table)
        .select('*', { count: 'exact' })
        .limit(100);
      if (hasTenantId) listQ = listQ.eq('tenant_id', req.tenantId);
      const { data, error, count } = await listQ;

      if (error) {
        return res.status(500).json({
          error: 'rows_fetch_failed',
          detail: error.message || String(error),
          code: error.code,
        });
      }

      const rows = data || [];
      const columns = inferColumnsFromRow(rows[0] || null);

      return res.json({
        schema: ids.schema,
        table: ids.table,
        rowCount: rows.length,
        total: typeof count === 'number' ? count : null,
        columns,
        rows,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'internal',
        detail: err && err.message,
      });
    }
  });
}

module.exports = {
  registerDbEntityRoutes,
  // exported for unit testing
  validateIdentifiers,
  inferColumnsFromRow,
  probeTable,
  detectTenantIdColumn,
  requireTenantOnRequest,
  IDENT_RE,
  SCHEMA_ALLOWLIST,
  TENANT_ID_RE,
};
