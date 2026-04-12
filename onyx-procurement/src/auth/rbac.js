/**
 * ONYX — Role-Based Access Control (RBAC)
 * ═══════════════════════════════════════════════════════════════
 * Agent 97 — Techno-Kol Uzi ERP
 *
 * Fine-grained, deterministic, ZERO external dependencies.
 *
 * Core concepts
 * ─────────────
 *   - Role          : a named bag of permission strings, which may
 *                     inherit other roles (multi-parent, cycle-safe,
 *                     merged transitively).
 *   - Permission    : a `resource:action` string. Wildcards allowed
 *                     on the RHS only — e.g. `invoices:*` grants every
 *                     action on invoices, and the synthetic `*:*`
 *                     grants everything (owner only).
 *   - User identity : a plain object carrying any of:
 *                       { id, role, roles[], permissions[], denyPermissions[] }
 *                     `role` (singular) and `roles` (array) both accepted.
 *   - Effective set : union of all inherited role permissions
 *                     + user-specific grants MINUS user-specific denies.
 *
 * Security-critical module — NEVER deletes state, always fails closed:
 *   - Unknown role          → treated as empty (no implicit permissions)
 *   - Missing permission    → false (deny)
 *   - Missing user          → false (deny)
 *   - Malformed permission  → false (deny)
 *   - Inheritance cycle     → breaks safely, logs once
 *
 * Resources covered (>80, grouped): invoices, quotes, receipts,
 * credit-notes, clients, vendors, purchase-orders, goods-receipts,
 * inventory, stock-movements, products, price-lists, categories,
 * wage-slips, employees, time-entries, leave-requests, pension,
 * severance, expenses, bills, bank-accounts, bank-statements,
 * bank-reconciliation, payments, transfers, tax-vat, tax-annual,
 * tax-form-30a, tax-form-101, tax-pcn836, reports, dashboards,
 * audit, users, roles, permissions, settings, billing, company,
 * contracts, projects, tasks, tickets, cases, notes, files,
 * attachments, notifications, webhooks, integrations, api-keys,
 * sessions, backups, exports, imports, templates, emails, sms,
 * whatsapp, calendar, chat, search, ai-assistant, prompts,
 * ontology, pipelines, jobs, queues, schedules, data-stores,
 * brand-kits, designs, vendors-onboarding, supplier-portal,
 * kyc, compliance, real-estate, permits, construction-pm,
 * maintenance, assets, insurance, grants, leads, opportunities,
 * deals, campaigns, support-tickets, knowledge-base, help-desk.
 *
 * Express middleware
 * ──────────────────
 *   app.get('/invoices', requirePermission('invoices:read'), handler);
 *
 * Always returns 401 if no actor, 403 if actor lacks the permission.
 * Never throws — response bodies are deterministic JSON.
 *
 * NOTE: This module is PROCESS-LOCAL. The role registry lives in a
 * module-scoped Map. For multi-instance deployments replace `_registry`
 * with a Redis-backed store (same API). User assignments SHOULD be
 * persisted in Postgres/Supabase — the in-memory `_userStore` below is
 * only used when the caller does not provide their own storage.
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────
const WILDCARD = '*';
const SEPARATOR = ':';
const ROOT_PERMISSION = '*:*'; // owner-only god mode

// Maximum inheritance depth — any chain longer is a configuration bug
// and we bail out rather than blow the stack.
const MAX_INHERITANCE_DEPTH = 32;

// ─── Canonical resources (for docs + sanity checks) ─────────────
// Listed here for reference. The module does NOT reject unknown
// resources — new modules can add permissions without touching this
// file. The list is exposed via `RESOURCES` for UIs and docs.
const RESOURCES = Object.freeze([
  // sales
  'invoices', 'quotes', 'credit-notes', 'receipts', 'clients',
  'leads', 'opportunities', 'deals', 'campaigns',
  // procurement
  'vendors', 'purchase-orders', 'goods-receipts', 'bills',
  'vendor-onboarding', 'supplier-portal',
  // inventory
  'inventory', 'stock-movements', 'products', 'price-lists',
  'categories', 'warehouses',
  // payroll
  'wage-slips', 'employees', 'time-entries', 'leave-requests',
  'pension', 'severance', 'payroll-runs',
  // finance
  'expenses', 'bank-accounts', 'bank-statements',
  'bank-reconciliation', 'payments', 'transfers', 'journal-entries',
  'ledger',
  // tax
  'tax-vat', 'tax-annual', 'tax-form-30a', 'tax-form-101',
  'tax-pcn836', 'tax-reports',
  // analytics
  'reports', 'dashboards', 'kpis', 'search',
  // governance / admin
  'audit', 'users', 'roles', 'permissions', 'settings', 'billing',
  'company', 'api-keys', 'sessions', 'backups',
  // ops
  'exports', 'imports', 'templates', 'webhooks', 'integrations',
  'jobs', 'queues', 'schedules', 'notifications',
  // comms
  'emails', 'sms', 'whatsapp', 'calendar', 'chat',
  // data + AI
  'ai-assistant', 'prompts', 'ontology', 'pipelines', 'data-stores',
  // content
  'brand-kits', 'designs', 'files', 'attachments', 'notes',
  // verticals (Techno-Kol Uzi)
  'real-estate', 'permits', 'construction-pm', 'maintenance',
  'assets', 'insurance', 'grants', 'contracts', 'projects', 'tasks',
  // support
  'tickets', 'cases', 'support-tickets', 'knowledge-base',
  'help-desk', 'kyc', 'compliance',
]);

// Canonical actions (again — advisory only; not enforced).
const ACTIONS = Object.freeze([
  'create', 'read', 'read-own', 'read-all', 'update', 'delete',
  'export', 'import', 'approve', 'reject', 'sign', 'generate',
  'schedule', 'cancel', 'archive', 'restore', 'assign', 'manage',
  'view', 'list',
]);

// ─── In-memory registries ───────────────────────────────────────
// Single source of truth — do NOT clone; rely on defineRole / grant APIs.
const _registry = new Map();       // roleName -> { name, permissions:Set, parents:Set }
const _userStore = new Map();      // userId -> { roles:Set, grants:Set, denies:Set }
const _cycleReported = new Set();  // rolesNames we've already logged a cycle for

// ─── Utilities ──────────────────────────────────────────────────

/** Normalize a permission string: trim + lowercase + strict shape check. */
function _normalizePerm(perm) {
  if (typeof perm !== 'string') return null;
  const trimmed = perm.trim().toLowerCase();
  if (!trimmed) return null;
  // must contain exactly one colon, non-empty both sides
  const idx = trimmed.indexOf(SEPARATOR);
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  // no embedded whitespace
  if (/\s/.test(trimmed)) return null;
  // allow only letters, digits, dash, dot, underscore, star on both sides
  if (!/^[a-z0-9._*-]+:[a-z0-9._*-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Split resource:action. Returns null on malformed input. */
function _splitPerm(perm) {
  const n = _normalizePerm(perm);
  if (!n) return null;
  const i = n.indexOf(SEPARATOR);
  return { resource: n.slice(0, i), action: n.slice(i + 1) };
}

/** Build a Set of permissions from an array, silently dropping invalids. */
function _toPermSet(list) {
  const out = new Set();
  if (!Array.isArray(list)) return out;
  for (const p of list) {
    const n = _normalizePerm(p);
    if (n) out.add(n);
  }
  return out;
}

/** Deep-log a cycle (once per role to avoid log flooding). */
function _warnCycleOnce(roleName) {
  if (_cycleReported.has(roleName)) return;
  _cycleReported.add(roleName);
  // eslint-disable-next-line no-console
  try {
    console.warn(
      `[rbac] inheritance cycle detected around role "${roleName}" — chain broken`
    );
  } catch (_) { /* swallow log failures */ }
}

// ─── Core API: defineRole ───────────────────────────────────────

/**
 * Define (or redefine) a role. Subsequent definitions REPLACE the
 * previous permission set — this is the only mutation point and it
 * is idempotent for config-as-code bootstraps.
 *
 * @param {string} name
 * @param {string[]} permissions  array of `resource:action` strings
 * @param {object}  [opts]
 * @param {string[]} [opts.inherits]  role names to inherit from
 * @returns {{ name:string, permissions:string[], parents:string[] }}
 */
function defineRole(name, permissions, opts) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('defineRole: name must be a non-empty string');
  }
  const roleName = name.trim().toLowerCase();

  const permSet = _toPermSet(permissions);
  const parentList = (opts && Array.isArray(opts.inherits)) ? opts.inherits : [];
  const parents = new Set();
  for (const p of parentList) {
    if (typeof p === 'string' && p.trim()) parents.add(p.trim().toLowerCase());
  }

  _registry.set(roleName, { name: roleName, permissions: permSet, parents });
  // Clear any previously-reported cycle warnings for this role.
  _cycleReported.delete(roleName);

  return {
    name: roleName,
    permissions: [...permSet].sort(),
    parents: [...parents].sort(),
  };
}

/** Read-only snapshot of a role (or null). */
function getRole(name) {
  if (typeof name !== 'string') return null;
  const r = _registry.get(name.trim().toLowerCase());
  if (!r) return null;
  return {
    name: r.name,
    permissions: [...r.permissions].sort(),
    parents: [...r.parents].sort(),
  };
}

/** List defined role names. */
function listRoles() {
  return [...Array.from(_registry.keys())].sort();
}

// ─── Inheritance walker ─────────────────────────────────────────

/**
 * Walk the inheritance DAG from a given role and return the merged
 * permission set. Cycle-safe, depth-capped, diamond-safe.
 *
 * Distinguishes two kinds of "already visited":
 *   - `path`: roles on the CURRENT descent chain — re-visiting one
 *             of these is a true cycle (a→b→a). We log and break.
 *   - `done`: roles whose permission set we've already computed in
 *             this call — revisiting is a harmless DAG diamond
 *             (manager inherits sales and procurement, both of which
 *             inherit viewer). We skip without warning.
 *
 * @param {string} roleName
 * @param {Set<string>} [_path]    internal: roles on current descent
 * @param {Set<string>} [_done]    internal: roles already resolved
 * @param {number}      [_depth]   internal: current depth
 * @returns {Set<string>} merged permissions
 */
function _resolveRolePerms(roleName, _path, _done, _depth) {
  const path = _path || new Set();
  const done = _done || new Set();
  const depth = _depth || 0;

  if (depth > MAX_INHERITANCE_DEPTH) {
    _warnCycleOnce(roleName);
    return new Set();
  }
  if (path.has(roleName)) {
    _warnCycleOnce(roleName);
    return new Set();
  }
  // Already computed on a different branch — this is a DAG diamond,
  // not a cycle. Return an empty set (the permissions were already
  // folded into the caller's merged set at first visit).
  if (done.has(roleName)) {
    return new Set();
  }

  path.add(roleName);

  const role = _registry.get(roleName);
  if (!role) {
    path.delete(roleName);
    done.add(roleName);
    return new Set();
  }

  const merged = new Set(role.permissions);
  for (const parent of role.parents) {
    const parentPerms = _resolveRolePerms(parent, path, done, depth + 1);
    for (const p of parentPerms) merged.add(p);
  }

  path.delete(roleName);
  done.add(roleName);
  return merged;
}

// ─── User identity helpers ──────────────────────────────────────

/**
 * Extract role names from a user object. Accepts either `role` (string)
 * or `roles` (string[]), merging both when present.
 */
function _rolesOf(user) {
  if (!user || typeof user !== 'object') return [];
  const names = new Set();
  if (typeof user.role === 'string' && user.role.trim()) {
    names.add(user.role.trim().toLowerCase());
  }
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) {
      if (typeof r === 'string' && r.trim()) names.add(r.trim().toLowerCase());
    }
  }
  // overlay with in-memory store entries for this user, if any
  if (user.id != null) {
    const rec = _userStore.get(String(user.id));
    if (rec) for (const r of rec.roles) names.add(r);
  }
  return [...names];
}

/** Extract direct user grants (overrides layered ON TOP of roles). */
function _grantsOf(user) {
  const out = new Set();
  if (user && Array.isArray(user.permissions)) {
    for (const p of user.permissions) {
      const n = _normalizePerm(p);
      if (n) out.add(n);
    }
  }
  if (user && user.id != null) {
    const rec = _userStore.get(String(user.id));
    if (rec) for (const g of rec.grants) out.add(g);
  }
  return out;
}

/** Extract direct user denies (subtracted AFTER grants). */
function _deniesOf(user) {
  const out = new Set();
  if (user && Array.isArray(user.denyPermissions)) {
    for (const p of user.denyPermissions) {
      const n = _normalizePerm(p);
      if (n) out.add(n);
    }
  }
  if (user && user.id != null) {
    const rec = _userStore.get(String(user.id));
    if (rec) for (const d of rec.denies) out.add(d);
  }
  return out;
}

// ─── Core API: getEffectivePermissions ──────────────────────────

/**
 * Return the sorted, deduplicated list of permissions a user actually
 * holds — roles ∪ grants \ denies. Wildcards are preserved verbatim;
 * expansion happens in `can()` at check time.
 *
 * @param {object} user
 * @returns {string[]}
 */
function getEffectivePermissions(user) {
  if (!user) return [];

  const merged = new Set();
  for (const roleName of _rolesOf(user)) {
    const rolePerms = _resolveRolePerms(roleName);
    for (const p of rolePerms) merged.add(p);
  }
  for (const g of _grantsOf(user)) merged.add(g);
  for (const d of _deniesOf(user)) merged.delete(d);

  return [...merged].sort();
}

// ─── Core API: can / canAny / canAll ────────────────────────────

/**
 * Does `held` permit `needed`?
 *
 * Matching rules (strict):
 *   - exact match                 :  invoices:read  == invoices:read
 *   - resource wildcard           :  invoices:*     > invoices:read
 *   - full god-mode               :  *:*            > anything
 *
 * Action-side wildcard (`foo:*`) is supported. Resource-side wildcard
 * (`*:read`) is NOT supported — it would be error-prone (accountant
 * suddenly inheriting `roles:read`).
 */
function _permMatches(held, needed) {
  if (held === needed) return true;
  if (held === ROOT_PERMISSION) return true;

  const h = _splitPerm(held);
  const n = _splitPerm(needed);
  if (!h || !n) return false;

  if (h.resource !== n.resource) return false;
  if (h.action === WILDCARD) return true;
  return h.action === n.action;
}

/**
 * Check whether a user holds a single permission.
 *
 * @param {object} user
 * @param {string} permission         `resource:action`
 * @param {string} [resource]         optional resource override — if
 *                                    provided, acts as a namespace hint
 *                                    for logging/auditing only; NOT
 *                                    used in the matching algorithm.
 * @returns {boolean}
 */
function can(user, permission, _resource) {
  if (!user) return false;
  const needed = _normalizePerm(permission);
  if (!needed) return false;

  const effective = getEffectivePermissions(user);
  if (effective.length === 0) return false;

  // Fast path: explicit deny wins even if a role grants it.
  const denies = _deniesOf(user);
  for (const d of denies) {
    if (_permMatches(d, needed)) return false;
  }

  for (const held of effective) {
    if (_permMatches(held, needed)) return true;
  }
  return false;
}

/** True if the user holds ANY of the listed permissions. */
function canAny(user, perms) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  for (const p of perms) {
    if (can(user, p)) return true;
  }
  return false;
}

/** True if the user holds ALL of the listed permissions. */
function canAll(user, perms) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  for (const p of perms) {
    if (!can(user, p)) return false;
  }
  return true;
}

// ─── Express middleware factory ─────────────────────────────────

/**
 * Returns an Express middleware that enforces the given permission.
 *
 * Behaviour:
 *   - If req.user is missing → 401  { error: 'unauthenticated' }
 *   - If user lacks perm     → 403  { error: 'forbidden', required }
 *   - On success             → next()
 *
 * NOTE: The middleware expects `req.user` to be populated by an earlier
 * auth layer (session, JWT, API-key-to-user mapper, etc.). It never
 * reaches into headers directly — separation of concerns.
 */
function requirePermission(permission) {
  const needed = _normalizePerm(permission);
  if (!needed) {
    // Fail LOUD at construction time — misconfiguration is a bug.
    throw new TypeError(
      `requirePermission: invalid permission "${String(permission)}"`
    );
  }

  return function rbacGate(req, res, next) {
    const user = req && req.user;
    if (!user) {
      if (res && typeof res.status === 'function') {
        return res.status(401).json({
          error: 'unauthenticated',
          required: needed,
        });
      }
      return next && next(new Error('unauthenticated'));
    }

    if (!can(user, needed)) {
      if (res && typeof res.status === 'function') {
        return res.status(403).json({
          error: 'forbidden',
          required: needed,
          user_id: user.id != null ? String(user.id) : undefined,
        });
      }
      return next && next(new Error('forbidden'));
    }

    return next && next();
  };
}

/** Convenience: require ANY of the listed permissions. */
function requireAnyPermission(perms) {
  const normalized = [];
  if (Array.isArray(perms)) {
    for (const p of perms) {
      const n = _normalizePerm(p);
      if (n) normalized.push(n);
    }
  }
  if (normalized.length === 0) {
    throw new TypeError('requireAnyPermission: empty/invalid permission list');
  }
  return function rbacAnyGate(req, res, next) {
    const user = req && req.user;
    if (!user) {
      return res.status(401).json({ error: 'unauthenticated', required_any: normalized });
    }
    if (!canAny(user, normalized)) {
      return res.status(403).json({
        error: 'forbidden',
        required_any: normalized,
        user_id: user.id != null ? String(user.id) : undefined,
      });
    }
    return next();
  };
}

// ─── User assignment helpers ────────────────────────────────────

/**
 * Assign a role to a user by ID. Creates the user record if needed.
 * Returns the updated user record snapshot.
 *
 * NOTE: This writes to the IN-MEMORY fallback store. Production code
 * SHOULD persist to the DB and overlay via user.roles on each request;
 * this helper exists for tests and bootstraps.
 */
function assignRole(userId, roleName) {
  if (userId == null) throw new TypeError('assignRole: userId required');
  if (typeof roleName !== 'string' || !roleName.trim()) {
    throw new TypeError('assignRole: roleName must be a non-empty string');
  }
  const id = String(userId);
  const r = roleName.trim().toLowerCase();

  if (!_registry.has(r)) {
    throw new Error(`assignRole: role "${r}" is not defined`);
  }

  let rec = _userStore.get(id);
  if (!rec) {
    rec = { roles: new Set(), grants: new Set(), denies: new Set() };
    _userStore.set(id, rec);
  }
  rec.roles.add(r);

  return {
    id,
    roles: [...rec.roles].sort(),
    grants: [...rec.grants].sort(),
    denies: [...rec.denies].sort(),
  };
}

/** Remove a role from a user (does not delete the user). */
function revokeRole(userId, roleName) {
  if (userId == null) return null;
  const id = String(userId);
  const rec = _userStore.get(id);
  if (!rec) return null;
  if (typeof roleName === 'string') rec.roles.delete(roleName.trim().toLowerCase());
  return {
    id,
    roles: [...rec.roles].sort(),
    grants: [...rec.grants].sort(),
    denies: [...rec.denies].sort(),
  };
}

/**
 * Grant a user-specific permission that overrides their roles.
 * Use sparingly — every grant is a deviation from the role matrix
 * and should be audited.
 */
function grantCustomPermission(userId, permission) {
  if (userId == null) throw new TypeError('grantCustomPermission: userId required');
  const n = _normalizePerm(permission);
  if (!n) throw new TypeError(`grantCustomPermission: invalid permission "${permission}"`);
  const id = String(userId);

  let rec = _userStore.get(id);
  if (!rec) {
    rec = { roles: new Set(), grants: new Set(), denies: new Set() };
    _userStore.set(id, rec);
  }
  rec.grants.add(n);
  // Explicit grant clears any matching deny — last write wins.
  rec.denies.delete(n);

  return {
    id,
    roles: [...rec.roles].sort(),
    grants: [...rec.grants].sort(),
    denies: [...rec.denies].sort(),
  };
}

/** Record a user-specific DENY — takes precedence over role grants. */
function denyCustomPermission(userId, permission) {
  if (userId == null) throw new TypeError('denyCustomPermission: userId required');
  const n = _normalizePerm(permission);
  if (!n) throw new TypeError(`denyCustomPermission: invalid permission "${permission}"`);
  const id = String(userId);

  let rec = _userStore.get(id);
  if (!rec) {
    rec = { roles: new Set(), grants: new Set(), denies: new Set() };
    _userStore.set(id, rec);
  }
  rec.denies.add(n);

  return {
    id,
    roles: [...rec.roles].sort(),
    grants: [...rec.grants].sort(),
    denies: [...rec.denies].sort(),
  };
}

/** Read the in-memory user record (or null). */
function getUserRecord(userId) {
  if (userId == null) return null;
  const rec = _userStore.get(String(userId));
  if (!rec) return null;
  return {
    id: String(userId),
    roles: [...rec.roles].sort(),
    grants: [...rec.grants].sort(),
    denies: [...rec.denies].sort(),
  };
}

// ─── Bootstrap: default roles for Techno-Kol Uzi ────────────────
// Called at module load. Safe to call again — defineRole is idempotent.

function bootstrapDefaultRoles() {
  // ── Viewer: read-only across the whole ERP ──────────────────
  defineRole('viewer', [
    'invoices:read', 'quotes:read', 'credit-notes:read', 'receipts:read',
    'clients:read', 'leads:read', 'opportunities:read', 'deals:read',
    'campaigns:read',
    'vendors:read', 'purchase-orders:read', 'goods-receipts:read', 'bills:read',
    'inventory:read', 'stock-movements:read', 'products:read',
    'price-lists:read', 'categories:read', 'warehouses:read',
    'wage-slips:read-own',
    'employees:read', 'time-entries:read', 'leave-requests:read',
    'expenses:read', 'bank-accounts:read', 'bank-statements:read',
    'bank-reconciliation:read', 'payments:read', 'transfers:read',
    'journal-entries:read', 'ledger:read',
    'tax-vat:read', 'tax-annual:read', 'tax-form-30a:read',
    'tax-form-101:read', 'tax-pcn836:read', 'tax-reports:read',
    'reports:view', 'dashboards:view', 'kpis:view', 'search:read',
    'audit:read', 'notifications:read',
    'contracts:read', 'projects:read', 'tasks:read',
    'tickets:read', 'cases:read', 'support-tickets:read',
    'knowledge-base:read', 'help-desk:read',
    'files:read', 'attachments:read', 'notes:read',
    'real-estate:read', 'permits:read', 'construction-pm:read',
    'maintenance:read', 'assets:read', 'insurance:read', 'grants:read',
    'ai-assistant:read', 'ontology:read', 'pipelines:read',
    'data-stores:read', 'brand-kits:read', 'designs:read',
  ]);

  // ── Sales: everything a sales rep touches ───────────────────
  defineRole('sales', [
    'invoices:create', 'invoices:read', 'invoices:update', 'invoices:export',
    'quotes:create', 'quotes:read', 'quotes:update', 'quotes:export',
    'credit-notes:create', 'credit-notes:read', 'credit-notes:update',
    'receipts:create', 'receipts:read', 'receipts:export',
    'clients:create', 'clients:read', 'clients:update',
    'leads:create', 'leads:read', 'leads:update',
    'opportunities:create', 'opportunities:read', 'opportunities:update',
    'deals:create', 'deals:read', 'deals:update',
    'campaigns:read', 'products:read', 'price-lists:read',
    'emails:create', 'whatsapp:create',
  ], { inherits: ['viewer'] });

  // ── Procurement: vendor + PO + GR side ──────────────────────
  defineRole('procurement', [
    'vendors:create', 'vendors:read', 'vendors:update',
    'vendor-onboarding:create', 'vendor-onboarding:read', 'vendor-onboarding:update',
    'supplier-portal:read', 'supplier-portal:update',
    'purchase-orders:create', 'purchase-orders:read', 'purchase-orders:update',
    'purchase-orders:approve', 'purchase-orders:cancel', 'purchase-orders:export',
    'goods-receipts:create', 'goods-receipts:read', 'goods-receipts:update',
    'bills:create', 'bills:read', 'bills:update',
    'products:read', 'inventory:read',
  ], { inherits: ['viewer'] });

  // ── Warehouse: inventory + stock moves ──────────────────────
  defineRole('warehouse', [
    'inventory:create', 'inventory:read', 'inventory:update',
    'stock-movements:create', 'stock-movements:read', 'stock-movements:update',
    'products:read', 'products:update',
    'price-lists:read',
    'categories:read',
    'warehouses:read', 'warehouses:update',
    'goods-receipts:read', 'goods-receipts:update',
  ], { inherits: ['viewer'] });

  // ── Accountant: financial + tax ─────────────────────────────
  defineRole('accountant', [
    'invoices:read', 'invoices:update', 'invoices:export',
    'bills:create', 'bills:read', 'bills:update', 'bills:export',
    'payments:create', 'payments:read', 'payments:update', 'payments:export',
    'transfers:create', 'transfers:read', 'transfers:update',
    'journal-entries:create', 'journal-entries:read', 'journal-entries:update',
    'ledger:read', 'ledger:export',
    'expenses:read', 'expenses:update', 'expenses:export',
    'bank-accounts:read', 'bank-statements:read', 'bank-statements:import',
    'bank-reconciliation:create', 'bank-reconciliation:read',
    'bank-reconciliation:update',
    'tax-vat:create', 'tax-vat:read', 'tax-vat:update', 'tax-vat:export',
    'tax-annual:create', 'tax-annual:read', 'tax-annual:update', 'tax-annual:export',
    'tax-form-30a:generate', 'tax-form-30a:read',
    'tax-form-101:read',
    'tax-pcn836:generate', 'tax-pcn836:read', 'tax-pcn836:export',
    'tax-reports:view', 'tax-reports:export',
    'reports:view', 'reports:export', 'reports:schedule',
    'dashboards:view',
    'audit:read',
  ], { inherits: ['viewer'] });

  // ── HR: payroll + employees ─────────────────────────────────
  defineRole('hr', [
    'employees:create', 'employees:read', 'employees:update',
    'time-entries:create', 'time-entries:read', 'time-entries:update',
    'leave-requests:create', 'leave-requests:read', 'leave-requests:update',
    'leave-requests:approve', 'leave-requests:reject',
    'wage-slips:read-all', 'wage-slips:generate', 'wage-slips:sign',
    'wage-slips:export',
    'pension:read', 'pension:update',
    'severance:read', 'severance:update',
    'payroll-runs:create', 'payroll-runs:read', 'payroll-runs:update',
    'tax-form-101:read', 'tax-form-101:update',
    'reports:view', 'reports:export',
  ], { inherits: ['viewer'] });

  // ── Employee: own wage slips + own time entries only ────────
  defineRole('employee', [
    'wage-slips:read-own',
    'time-entries:create', 'time-entries:read-own', 'time-entries:update',
    'leave-requests:create', 'leave-requests:read-own',
    'employees:read-own',
    'tax-form-101:read-own', 'tax-form-101:update-own',
    'notifications:read',
  ]);

  // ── Manager: operational supervisor, cross-domain ───────────
  defineRole('manager', [
    'reports:view', 'reports:export', 'reports:schedule',
    'dashboards:view',
    'tasks:create', 'tasks:read', 'tasks:update', 'tasks:assign',
    'projects:create', 'projects:read', 'projects:update',
    'contracts:read', 'contracts:update',
    'audit:read',
  ], { inherits: ['sales', 'procurement', 'warehouse'] });

  // ── Admin: everything except owner-only actions ─────────────
  defineRole('admin', [
    'users:manage', 'roles:manage', 'permissions:manage',
    'settings:manage', 'api-keys:manage',
    'webhooks:manage', 'integrations:manage',
    'templates:manage', 'prompts:manage',
    'backups:create', 'backups:read',
    'exports:create', 'imports:create',
    'audit:read', 'audit:export',
    'notifications:manage',
  ], { inherits: ['manager', 'accountant', 'hr'] });

  // ── Owner (Kobi): god mode ──────────────────────────────────
  defineRole('owner', [
    ROOT_PERMISSION,           // *:*  — everything
    'company:delete',          // owner-only
    'billing:manage',          // owner-only
    'billing:update',
    'roles:delete',
    'users:delete',
  ], { inherits: ['admin'] });
}

// Bootstrap at module load.
bootstrapDefaultRoles();

// ─── Test / ops helpers (non-production surface) ────────────────

/**
 * WARNING: Test-only. Wipes role + user registries AND re-runs the
 * default bootstrap so the next test starts from the canonical state.
 * NEVER call this from application code.
 */
function _resetAll() {
  _registry.clear();
  _userStore.clear();
  _cycleReported.clear();
  bootstrapDefaultRoles();
}

/** Snapshot of internal state for diagnostics. */
function _snapshot() {
  return {
    roles: [...Array.from(_registry.keys())].sort(),
    userCount: _userStore.size,
  };
}

module.exports = {
  // Core API
  defineRole,
  getRole,
  listRoles,
  can,
  canAny,
  canAll,
  requirePermission,
  requireAnyPermission,
  getEffectivePermissions,
  assignRole,
  revokeRole,
  grantCustomPermission,
  denyCustomPermission,
  getUserRecord,

  // Constants / catalogues
  RESOURCES,
  ACTIONS,
  ROOT_PERMISSION,
  WILDCARD,
  MAX_INHERITANCE_DEPTH,

  // Internals (tests only — DO NOT use in application code)
  _resetAll,
  _snapshot,
  _normalizePerm,
  _permMatches,
  _resolveRolePerms,
};
