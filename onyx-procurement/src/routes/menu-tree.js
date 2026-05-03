/**
 * Menu Tree — Express route
 * ────────────────────────────────────────────────
 * GET /api/menu/tree
 *
 * Returns the Techno-Kol Uzi menu organised by **service + domain**, not
 * by raw `parent_id`. Reads live from `public.app_menu` (Supabase, tenant
 * 4d60841d-…) and groups rows using the canonical `order_index` ranges
 * established by the catalog seeder migrations:
 *
 *   1       –     999  → core            (native control rooms + sub-pages)
 *   1000    –    9999  → marketplace     (categories with their modules)
 *   10000   –   19999  → registry cats
 *   20000   –   49999  → registry modules (folded under their category)
 *   5000    –    5999  → hamelech cats
 *   6000    –    9999  → hamelech modules (overlaps with marketplace tail
 *                        — disambiguated by `parent_id` linkage; if a row
 *                        has no parent we treat 6000-9999 as hamelech)
 *   50000   –   50999  → addons
 *   51000   –   51999  → integrations
 *   52000   –   59999  → misc (products, templates, combos)
 *   60000   –   69999  → source pages
 *   70000   –   79999  → components / hooks / api-routes
 *   80000   –   89999  → DB tables (grouped by schema)
 *   90000   –   94999  → RPCs / functions
 *   95000   –   99999  → views
 *   100000+            → backend route docs
 *
 * Each `service` bucket is returned with:
 *   { service: <key>, label_he: <hebrew label>, count: N, children: [...] }
 *
 * Children preserve parent → child nesting (so a marketplace category
 * keeps its modules underneath, a DB schema keeps its tables underneath,
 * etc.). Inside each bucket we sort by `order_index` then `label`.
 *
 * Mounted from server.js:
 *   const { registerMenuTreeRoutes } = require('./src/routes/menu-tree');
 *   registerMenuTreeRoutes(app, { supabase });
 *
 * No external deps — pure supabase-js usage, mirroring app-menu.js.
 */

'use strict';

// ── Hebrew labels for top-level buckets ────────────────────────────────
const SERVICE_LABELS = {
  core:         'מערכת ליבה',
  marketplace:  'שוק',
  registry:     'מודולי פלטפורמה',
  hamelech:     'מודולי המלך',
  addons:       'תוספים',
  integrations: 'אינטגרציות',
  misc:         'מוצרים ותבניות',
  code:         'קוד מקור',
  db:           'טבלאות בסיס נתונים',
  rpcs:         'RPCs ופונקציות',
  views:        'תצוגות (Views)',
  backend:      'תיעוד נתיבי שרת',
};

// Stable display order for the returned `services` array.
const SERVICE_ORDER = [
  'core',
  'marketplace',
  'registry',
  'hamelech',
  'addons',
  'integrations',
  'misc',
  'code',
  'db',
  'rpcs',
  'views',
  'backend',
];

/**
 * Map an order_index to one of the canonical service buckets.
 *
 * The hamelech vs marketplace overlap (6000-9999) is resolved by
 * checking whether the row has a parent in the 5000-5999 hamelech
 * category band — caller passes that flag in.
 *
 * @param {number} idx           order_index value (may be null)
 * @param {boolean} parentIsHamelech true when row's parent sits in 5000-5999
 * @returns {string} service key
 */
function classifyByIndex(idx, parentIsHamelech) {
  const i = idx == null ? 0 : Number(idx);
  if (!Number.isFinite(i) || i < 1) return 'core'; // unranked → core
  if (i < 1000) return 'core';
  if (i < 5000) return 'marketplace';
  if (i < 6000) return 'hamelech';        // 5000-5999 hamelech cats
  if (i < 10000) {
    // 6000-9999 — hamelech modules if parented under a hamelech cat,
    // otherwise treat as marketplace tail.
    return parentIsHamelech ? 'hamelech' : 'marketplace';
  }
  if (i < 20000) return 'registry';        // registry categories
  if (i < 50000) return 'registry';        // registry modules
  if (i < 51000) return 'addons';
  if (i < 52000) return 'integrations';
  if (i < 60000) return 'misc';
  if (i < 70000) return 'code';            // source pages
  if (i < 80000) return 'code';            // components / hooks / api-routes
  if (i < 90000) return 'db';
  if (i < 95000) return 'rpcs';
  if (i < 100000) return 'views';
  return 'backend';
}

/**
 * Visibility filter — same lenient rules as /api/app-menu so the two
 * endpoints render the same set for any caller.
 */
function rowVisibleToCaller(row, req) {
  if (row.is_visible === false) return false;
  if (!row.required_permission) return true;
  const role =
    (req.user && (req.user.role || (Array.isArray(req.user.roles) && req.user.roles[0]))) || null;
  if (!role) return false;
  if (role === 'admin' || role === 'owner' || role === 'super_admin') return true;
  try {
    const rbac = require('../auth/rbac');
    if (rbac && typeof rbac.roleHasPermission === 'function') {
      return !!rbac.roleHasPermission(role, row.required_permission);
    }
  } catch (_) { /* ignore */ }
  const resource = String(row.required_permission).split(':')[0];
  return role === resource || role === `${resource}_admin`;
}

/**
 * Build a parent→children tree from a flat row list. Used inside each
 * service bucket so categories keep their nested modules / tables /
 * pages.
 */
function buildSubtree(rows) {
  const byId = new Map();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots = [];
  for (const r of rows) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      byId.get(r.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortLevel = (arr) => {
    arr.sort((a, b) => {
      const ai = a.order_index == null ? 0 : a.order_index;
      const bi = b.order_index == null ? 0 : b.order_index;
      if (ai !== bi) return ai - bi;
      return String(a.label || '').localeCompare(String(b.label || ''), 'he');
    });
    for (const n of arr) sortLevel(n.children);
  };
  sortLevel(roots);
  return roots;
}

/**
 * Group all visible rows into the 12 service buckets and build a nested
 * tree inside each bucket.
 */
function buildServiceTree(allRows) {
  // Pre-compute the parent's order_index for the hamelech disambiguator.
  const orderById = new Map();
  for (const r of allRows) orderById.set(r.id, r.order_index);

  // Bucket the rows.
  const buckets = Object.create(null);
  for (const key of SERVICE_ORDER) buckets[key] = [];

  for (const r of allRows) {
    const parentIdx = r.parent_id != null ? orderById.get(r.parent_id) : null;
    const parentIsHamelech =
      parentIdx != null && Number(parentIdx) >= 5000 && Number(parentIdx) < 6000;
    const svc = classifyByIndex(r.order_index, parentIsHamelech);
    (buckets[svc] || buckets.misc).push(r);
  }

  // Within each bucket, only treat parents that themselves live in the
  // bucket as nesting roots — otherwise a row whose parent is in another
  // bucket would orphan-disappear. We strip the parent_id of cross-bucket
  // children so they surface at the bucket root.
  const services = [];
  for (const key of SERVICE_ORDER) {
    const rows = buckets[key];
    if (!rows || rows.length === 0) continue;
    const idsInBucket = new Set(rows.map((r) => r.id));
    const localRows = rows.map((r) =>
      r.parent_id != null && !idsInBucket.has(r.parent_id)
        ? { ...r, parent_id: null }
        : r
    );
    services.push({
      service: key,
      label_he: SERVICE_LABELS[key],
      count: rows.length,
      children: buildSubtree(localRows),
    });
  }
  return services;
}

/**
 * registerMenuTreeRoutes — attach GET /api/menu/tree.
 * @param {import('express').Express} app
 * @param {{ supabase: any }} deps
 */
function registerMenuTreeRoutes(app, deps = {}) {
  const { supabase } = deps;
  if (!app || typeof app.get !== 'function') {
    throw new Error('registerMenuTreeRoutes: express `app` is required');
  }
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('registerMenuTreeRoutes: `supabase` client is required');
  }

  app.get('/api/menu/tree', async (req, res) => {
    try {
      const includeInactive =
        req.query.include_inactive === '1' || req.query.include_inactive === 'true';

      // Page through the full catalog (Techno-Kol Uzi has 50k+ rows after
      // the catalog/source/db/rpc seeders run).
      const PAGE = 1000;
      const allRows = [];
      let offset = 0;
      let lastErr = null;
      for (let page = 0; page < 200; page++) {
        let q = supabase
          .from('app_menu')
          .select(
            'id,label,label_he,route,icon,parent_id,order_index,required_permission,is_visible,is_active'
          )
          .order('order_index', { ascending: true, nullsFirst: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (!includeInactive) q = q.or('is_active.is.null,is_active.eq.true');
        const { data: pageRows, error } = await q;
        if (error) { lastErr = error; break; }
        if (!pageRows || pageRows.length === 0) break;
        allRows.push(...pageRows);
        if (pageRows.length < PAGE) break;
        offset += PAGE;
      }
      if (lastErr) {
        return res.status(500).json({
          error: 'menu_tree_fetch_failed',
          detail: lastErr.message || String(lastErr),
        });
      }

      const visible = allRows.filter((r) => rowVisibleToCaller(r, req));
      const services = buildServiceTree(visible);

      return res.json({
        source: 'public.app_menu',
        total_rows: visible.length,
        service_count: services.length,
        services,
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
  registerMenuTreeRoutes,
  // exported for unit testing
  classifyByIndex,
  buildServiceTree,
  buildSubtree,
  rowVisibleToCaller,
  SERVICE_LABELS,
  SERVICE_ORDER,
};
