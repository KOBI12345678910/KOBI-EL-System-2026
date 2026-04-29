/**
 * App Menu — Express routes
 * ────────────────────────────────────────────────
 * Per AGENT-330 (sidebar-rendering audit): the `public.app_menu`
 * table holds the canonical, DB-driven sidebar tree (~138 active
 * rows after 00067 deactivated dead routes), but no backend route
 * exposes it. Frontends either hit Supabase PostgREST directly
 * (techno-kol-ops `services/menuService.ts`) or hard-code the menu
 * (erp-app, payroll-autonomous, legacy techno-kol-ops Sidebar).
 *
 * This module exposes:
 *   GET /api/app-menu                  — full hierarchical tree
 *   GET /api/app-menu?flat=1           — flat list ordered by parent_id, order_index
 *   GET /api/app-menu?include_inactive=1 — include is_active=false rows
 *
 * Mounted from server.js via:
 *   const { registerAppMenuRoutes } = require('./src/routes/app-menu');
 *   registerAppMenuRoutes(app, { supabase });
 *
 * Source schema (00017_app_menu.sql + 00067 deactivation +
 * 00072 tenant_id column add):
 *   id bigserial PK
 *   label text NOT NULL
 *   route text
 *   icon text
 *   parent_id bigint FK -> app_menu(id)
 *   order_index integer DEFAULT 0
 *   required_permission text
 *   is_visible boolean DEFAULT true
 *   is_active boolean DEFAULT true   -- added by 00067
 *   tenant_id uuid                   -- added by 00072
 *   created_at timestamptz
 *
 * Permission filter: rows whose `required_permission` is non-null
 * are returned only when `req.user.role === 'admin'/'owner'` OR
 * the role's permission set (RBAC) covers the required slug. The
 * filter is intentionally permissive for unauthenticated callers
 * (returns all is_visible rows) so the sidebar can render before
 * login; the frontend is expected to re-fetch on auth and re-filter.
 *
 * Zero external deps — only the supabase-js client passed in.
 */

'use strict';

/**
 * Build a parent→children tree from a flat ordered list of menu rows.
 *
 * @param {Array<{id:number,parent_id:number|null,order_index:number}>} rows
 * @returns {Array} top-level rows, each with `.children` (recursive)
 */
function buildTree(rows) {
  const byId = new Map();
  for (const r of rows) {
    byId.set(r.id, { ...r, children: [] });
  }
  const roots = [];
  for (const r of rows) {
    const node = byId.get(r.id);
    if (r.parent_id != null && byId.has(r.parent_id)) {
      byId.get(r.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  // sort each level by order_index, then label as a stable tie-break
  const sortLevel = (arr) => {
    arr.sort((a, b) => {
      const ai = a.order_index == null ? 0 : a.order_index;
      const bi = b.order_index == null ? 0 : b.order_index;
      if (ai !== bi) return ai - bi;
      return String(a.label || '').localeCompare(String(b.label || ''), 'he');
    });
    for (const node of arr) sortLevel(node.children);
  };
  sortLevel(roots);
  return roots;
}

/**
 * Decide whether a menu row is visible to the current request.
 * Lenient by default — when no role is resolvable we return public-only
 * rows (required_permission IS NULL). Admin/owner roles see everything.
 */
function rowVisibleToCaller(row, req) {
  if (row.is_visible === false) return false;
  if (!row.required_permission) return true;

  const role = (req.user && (req.user.role || (Array.isArray(req.user.roles) && req.user.roles[0]))) || null;
  if (!role) return false; // gated row, anonymous caller — hide
  if (role === 'admin' || role === 'owner' || role === 'super_admin') return true;

  // Optional RBAC integration — best-effort, fail-open if module missing
  try {
    const rbac = require('../auth/rbac');
    if (rbac && typeof rbac.roleHasPermission === 'function') {
      return !!rbac.roleHasPermission(role, row.required_permission);
    }
    // Older RBAC API: requirePermission factory; we do not have a res here
    // so fall through to the conservative path below.
  } catch (_) {
    // module not available — fall through
  }

  // Conservative fallback: gate on role name matching the resource
  // prefix of the permission slug ("resource:action").
  const resource = String(row.required_permission).split(':')[0];
  return role === resource || role === `${resource}_admin`;
}

/**
 * registerAppMenuRoutes — attaches GET /api/app-menu to the given
 * Express app using the provided Supabase client.
 *
 * @param {import('express').Express} app
 * @param {{ supabase: any }} deps
 */
function registerAppMenuRoutes(app, deps = {}) {
  const { supabase } = deps;
  if (!app || typeof app.get !== 'function') {
    throw new Error('registerAppMenuRoutes: express `app` is required');
  }
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('registerAppMenuRoutes: `supabase` client is required');
  }

  app.get('/api/app-menu', async (req, res) => {
    try {
      const flat = req.query.flat === '1' || req.query.flat === 'true';
      const includeInactive =
        req.query.include_inactive === '1' || req.query.include_inactive === 'true';

      // Paginate around the PostgREST 1000-row cap to fetch the full menu
      // (Techno-Kol Uzi tenant has 2,509 rows after marketplace catalog seed).
      const PAGE = 1000;
      const allRows = [];
      let offset = 0;
      let lastErr = null;
      // Hard ceiling: 200 pages = 200,000 rows; supports the full catalog (50,945 + extras).
      for (let page = 0; page < 200; page++) {
        let q = supabase
          .from('app_menu')
          .select(
            'id,label,label_he,route,icon,parent_id,order_index,required_permission,is_visible,is_active'
          )
          .order('parent_id', { ascending: true, nullsFirst: true })
          .order('order_index', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (!includeInactive) {
          q = q.or('is_active.is.null,is_active.eq.true');
        }
        const { data: pageRows, error } = await q;
        if (error) { lastErr = error; break; }
        if (!pageRows || pageRows.length === 0) break;
        allRows.push(...pageRows);
        if (pageRows.length < PAGE) break;
        offset += PAGE;
      }
      const data = allRows;
      const error = lastErr;
      if (error) {
        return res.status(500).json({
          error: 'app_menu_fetch_failed',
          detail: error.message || String(error),
        });
      }

      const rows = (data || []).filter((r) => rowVisibleToCaller(r, req));

      if (flat) {
        return res.json({
          source: 'public.app_menu',
          count: rows.length,
          items: rows,
        });
      }

      const tree = buildTree(rows);
      return res.json({
        source: 'public.app_menu',
        count: rows.length,
        roots: tree.length,
        tree,
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
  registerAppMenuRoutes,
  // exported for unit testing
  buildTree,
  rowVisibleToCaller,
};
