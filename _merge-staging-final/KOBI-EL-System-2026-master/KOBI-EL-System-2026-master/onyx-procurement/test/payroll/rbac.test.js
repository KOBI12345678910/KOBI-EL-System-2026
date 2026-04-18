/**
 * RBAC — Unit Tests
 * Agent 97 — Techno-Kol Uzi ERP
 *
 * Covers:
 *   - defineRole / getRole / listRoles
 *   - can / canAny / canAll
 *   - inheritance (multi-level, multi-parent, cycles)
 *   - wildcards (resource:*, *:*)
 *   - assignRole / revokeRole
 *   - grantCustomPermission / denyCustomPermission
 *   - requirePermission (Express middleware)
 *   - fail-closed semantics (unknown roles, malformed perms, null users)
 *
 * Run with:   node --test test/payroll/rbac.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const rbac = require(path.resolve(__dirname, '..', '..', 'src', 'auth', 'rbac.js'));

const {
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
  RESOURCES,
  ACTIONS,
  ROOT_PERMISSION,
  _resetAll,
  _normalizePerm,
  _permMatches,
} = rbac;

// ─── Helpers ────────────────────────────────────────────────────

function makeUser(role, extras) {
  return Object.assign(
    { id: 'u-test-' + role, role, permissions: [], denyPermissions: [] },
    extras || {}
  );
}

/**
 * Tiny mock of Express (req, res, next). `res.status(n).json(body)`
 * records the exchange so the test can assert against it.
 */
function makeRes() {
  const state = { statusCode: null, body: null, sent: false };
  const res = {
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; state.sent = true; return this; },
  };
  return { res, state };
}

function makeNext() {
  const calls = [];
  const next = (err) => { calls.push(err === undefined ? 'ok' : err); };
  next.calls = calls;
  return next;
}

// Reset before every test to guarantee isolation — defineRole /
// assignRole mutate module state.
function beforeEach() { _resetAll(); }

// ─── 1. defineRole & getRole ────────────────────────────────────

test('defineRole: creates a role with canonical permission set', () => {
  beforeEach();
  const r = defineRole('test-role', ['invoices:read', 'invoices:create']);
  assert.equal(r.name, 'test-role');
  assert.deepEqual(r.permissions, ['invoices:create', 'invoices:read']);
  assert.deepEqual(r.parents, []);
});

test('defineRole: lower-cases name and trims whitespace', () => {
  beforeEach();
  defineRole('  WeirdCase  ', ['reports:view']);
  const g = getRole('weirdcase');
  assert.ok(g);
  assert.equal(g.name, 'weirdcase');
});

test('defineRole: rejects empty name', () => {
  beforeEach();
  assert.throws(() => defineRole('', ['x:y']), /non-empty/);
  assert.throws(() => defineRole('   ', ['x:y']), /non-empty/);
  assert.throws(() => defineRole(null, ['x:y']), /non-empty/);
});

test('defineRole: silently drops malformed permissions', () => {
  beforeEach();
  const r = defineRole('dirty', [
    'invoices:read', // OK
    '',              // empty
    'no-colon',      // no separator
    ':no-resource',  // empty LHS
    'no-action:',    // empty RHS
    null,            // wrong type
    'multi:colon:bad', // allowed — colon in action passes normalizer? no: regex rejects
    'with space:bad',  // whitespace
  ]);
  assert.deepEqual(r.permissions, ['invoices:read']);
});

test('getRole: returns null for unknown role', () => {
  beforeEach();
  assert.equal(getRole('nope'), null);
  assert.equal(getRole(''), null);
  assert.equal(getRole(null), null);
});

test('listRoles: contains all bootstrapped roles', () => {
  beforeEach();
  const roles = listRoles();
  for (const name of ['owner','admin','manager','accountant','hr','sales','procurement','warehouse','viewer','employee']) {
    assert.ok(roles.includes(name), `missing role ${name}`);
  }
});

// ─── 2. Permission normalizer & matcher ─────────────────────────

test('_normalizePerm: canonicalizes valid perms', () => {
  beforeEach();
  assert.equal(_normalizePerm(' Invoices:Read '), 'invoices:read');
  assert.equal(_normalizePerm('wage-slips:read-own'), 'wage-slips:read-own');
  assert.equal(_normalizePerm('*:*'), '*:*');
});

test('_normalizePerm: rejects malformed shapes', () => {
  beforeEach();
  const bad = ['', '  ', 'nocolon', ':action', 'resource:', 'a b:c', null, undefined, 42, {}];
  for (const b of bad) assert.equal(_normalizePerm(b), null, `should reject ${String(b)}`);
});

test('_permMatches: exact match', () => {
  beforeEach();
  assert.equal(_permMatches('invoices:read', 'invoices:read'), true);
  assert.equal(_permMatches('invoices:read', 'invoices:create'), false);
});

test('_permMatches: resource wildcard', () => {
  beforeEach();
  assert.equal(_permMatches('invoices:*', 'invoices:read'), true);
  assert.equal(_permMatches('invoices:*', 'invoices:delete'), true);
  assert.equal(_permMatches('invoices:*', 'bills:read'), false);
});

test('_permMatches: root god permission', () => {
  beforeEach();
  assert.equal(_permMatches('*:*', 'any:thing'), true);
  assert.equal(_permMatches('*:*', 'company:delete'), true);
});

// ─── 3. can() — basic role checks ───────────────────────────────

test('can: viewer can read invoices but cannot create', () => {
  beforeEach();
  const u = makeUser('viewer');
  assert.equal(can(u, 'invoices:read'), true);
  assert.equal(can(u, 'invoices:create'), false);
  assert.equal(can(u, 'invoices:delete'), false);
});

test('can: sales can create invoices', () => {
  beforeEach();
  const u = makeUser('sales');
  assert.equal(can(u, 'invoices:create'), true);
  assert.equal(can(u, 'invoices:read'), true);
  assert.equal(can(u, 'invoices:export'), true);
});

test('can: accountant can create payments, sales cannot', () => {
  beforeEach();
  assert.equal(can(makeUser('accountant'), 'payments:create'), true);
  assert.equal(can(makeUser('sales'), 'payments:create'), false);
});

test('can: hr can generate wage slips, employee cannot', () => {
  beforeEach();
  assert.equal(can(makeUser('hr'), 'wage-slips:generate'), true);
  assert.equal(can(makeUser('employee'), 'wage-slips:generate'), false);
});

test('can: employee reads own wage slip only', () => {
  beforeEach();
  const e = makeUser('employee');
  assert.equal(can(e, 'wage-slips:read-own'), true);
  assert.equal(can(e, 'wage-slips:read-all'), false);
  assert.equal(can(e, 'employees:read'), false);
  assert.equal(can(e, 'employees:read-own'), true);
});

test('can: owner holds root (*:*) — can do anything', () => {
  beforeEach();
  const o = makeUser('owner');
  for (const p of [
    'invoices:delete', 'users:delete', 'company:delete',
    'billing:manage', 'anything:weird', 'some.future:module',
  ]) {
    assert.equal(can(o, p), true, `owner should have ${p}`);
  }
});

test('can: admin does NOT have *:* but inherits most things', () => {
  beforeEach();
  const a = makeUser('admin');
  assert.equal(can(a, 'users:manage'), true);
  assert.equal(can(a, 'roles:manage'), true);
  assert.equal(can(a, 'invoices:read'), true);   // via viewer→manager
  assert.equal(can(a, 'wage-slips:generate'), true); // via hr
  assert.equal(can(a, 'company:delete'), false); // owner-only
  assert.equal(can(a, 'billing:manage'), false); // owner-only
});

test('can: manager inherits sales + procurement + warehouse', () => {
  beforeEach();
  const m = makeUser('manager');
  assert.equal(can(m, 'invoices:create'), true);         // sales
  assert.equal(can(m, 'purchase-orders:approve'), true); // procurement
  assert.equal(can(m, 'stock-movements:create'), true);  // warehouse
  assert.equal(can(m, 'users:manage'), false);           // admin only
});

test('can: unknown role → false (fail closed)', () => {
  beforeEach();
  const u = makeUser('mystery-role');
  assert.equal(can(u, 'invoices:read'), false);
});

test('can: null / undefined user → false', () => {
  beforeEach();
  assert.equal(can(null, 'invoices:read'), false);
  assert.equal(can(undefined, 'invoices:read'), false);
  assert.equal(can({}, 'invoices:read'), false);
});

test('can: malformed permission string → false', () => {
  beforeEach();
  const u = makeUser('owner'); // owner has everything
  assert.equal(can(u, ''), false);
  assert.equal(can(u, 'no-colon'), false);
  assert.equal(can(u, null), false);
});

// ─── 4. canAny / canAll ─────────────────────────────────────────

test('canAny: true when any permission matches', () => {
  beforeEach();
  const u = makeUser('sales');
  assert.equal(canAny(u, ['reports:export', 'invoices:create']), true);
  assert.equal(canAny(u, ['users:manage', 'billing:manage']), false);
});

test('canAny: empty / invalid list → false', () => {
  beforeEach();
  assert.equal(canAny(makeUser('owner'), []), false);
  assert.equal(canAny(makeUser('owner'), null), false);
});

test('canAll: requires every permission to match', () => {
  beforeEach();
  const u = makeUser('hr');
  assert.equal(canAll(u, ['wage-slips:generate', 'wage-slips:sign']), true);
  assert.equal(canAll(u, ['wage-slips:generate', 'company:delete']), false);
});

// ─── 5. Inheritance semantics ───────────────────────────────────

test('inheritance: multi-level DAG is walked transitively', () => {
  beforeEach();
  defineRole('leaf', ['leaf:ping']);
  defineRole('mid', ['mid:ping'], { inherits: ['leaf'] });
  defineRole('top', ['top:ping'], { inherits: ['mid'] });
  const u = makeUser('top');
  assert.equal(can(u, 'leaf:ping'), true);
  assert.equal(can(u, 'mid:ping'), true);
  assert.equal(can(u, 'top:ping'), true);
});

test('inheritance: cycle is detected and does not recurse forever', () => {
  beforeEach();
  defineRole('a', ['a:x'], { inherits: ['b'] });
  defineRole('b', ['b:x'], { inherits: ['a'] });
  // must not throw / must terminate
  const effective = getEffectivePermissions(makeUser('a'));
  assert.ok(Array.isArray(effective));
  assert.ok(effective.includes('a:x'));
  assert.ok(effective.includes('b:x'));
});

test('inheritance: missing parent is treated as empty, not error', () => {
  beforeEach();
  defineRole('orphan', ['orphan:x'], { inherits: ['ghost'] });
  const u = makeUser('orphan');
  assert.equal(can(u, 'orphan:x'), true);
  // ghost did not pollute
  assert.equal(can(u, 'anything:else'), false);
});

// ─── 6. Effective permissions ───────────────────────────────────

test('getEffectivePermissions: merges roles + grants, minus denies', () => {
  beforeEach();
  const u = makeUser('viewer', {
    permissions: ['invoices:create'],          // grant above viewer
    denyPermissions: ['audit:read'],           // deny even though viewer has it
  });
  const eff = getEffectivePermissions(u);
  assert.ok(eff.includes('invoices:read'));    // from viewer
  assert.ok(eff.includes('invoices:create'));  // from grant
  assert.ok(!eff.includes('audit:read'));      // explicitly denied
});

test('getEffectivePermissions: user with multiple roles merges both', () => {
  beforeEach();
  const u = { id: 'u-multi', roles: ['sales', 'procurement'] };
  const eff = getEffectivePermissions(u);
  assert.ok(eff.includes('invoices:create'));         // sales
  assert.ok(eff.includes('purchase-orders:approve')); // procurement
});

test('getEffectivePermissions: empty for null user', () => {
  beforeEach();
  assert.deepEqual(getEffectivePermissions(null), []);
  assert.deepEqual(getEffectivePermissions({}), []);
});

// ─── 7. assignRole / revokeRole ─────────────────────────────────

test('assignRole: persists to user store and affects can()', () => {
  beforeEach();
  const u = { id: 'u-42' };
  // before: no role
  assert.equal(can(u, 'invoices:read'), false);
  const rec = assignRole('u-42', 'viewer');
  assert.deepEqual(rec.roles, ['viewer']);
  // after: viewer perms are applied
  assert.equal(can(u, 'invoices:read'), true);
});

test('assignRole: rejects unknown role', () => {
  beforeEach();
  assert.throws(() => assignRole('u-1', 'not-a-role'), /not defined/);
});

test('revokeRole: removes role and access collapses', () => {
  beforeEach();
  const u = { id: 'u-99' };
  assignRole('u-99', 'sales');
  assert.equal(can(u, 'invoices:create'), true);
  revokeRole('u-99', 'sales');
  assert.equal(can(u, 'invoices:create'), false);
});

// ─── 8. grantCustomPermission / denyCustomPermission ────────────

test('grantCustomPermission: one-off override works', () => {
  beforeEach();
  const u = { id: 'u-grant' };
  assignRole('u-grant', 'viewer');
  assert.equal(can(u, 'invoices:delete'), false);
  grantCustomPermission('u-grant', 'invoices:delete');
  assert.equal(can(u, 'invoices:delete'), true);
});

test('grantCustomPermission: rejects malformed perm', () => {
  beforeEach();
  assert.throws(() => grantCustomPermission('u-1', 'nope'), /invalid/);
  assert.throws(() => grantCustomPermission(null, 'invoices:read'), /userId/);
});

test('denyCustomPermission: overrides a role grant', () => {
  beforeEach();
  const u = { id: 'u-deny' };
  assignRole('u-deny', 'sales');
  assert.equal(can(u, 'invoices:create'), true);
  denyCustomPermission('u-deny', 'invoices:create');
  assert.equal(can(u, 'invoices:create'), false);
});

test('grant after deny: last write wins, grant clears deny', () => {
  beforeEach();
  const u = { id: 'u-flip' };
  assignRole('u-flip', 'viewer');
  denyCustomPermission('u-flip', 'invoices:read');
  assert.equal(can(u, 'invoices:read'), false);
  grantCustomPermission('u-flip', 'invoices:read');
  assert.equal(can(u, 'invoices:read'), true);
});

test('getUserRecord: returns null for unknown user, snapshot for known', () => {
  beforeEach();
  assert.equal(getUserRecord('nope'), null);
  assignRole('u-known', 'hr');
  const rec = getUserRecord('u-known');
  assert.deepEqual(rec.roles, ['hr']);
});

// ─── 9. Express middleware ──────────────────────────────────────

test('requirePermission: 401 when req.user is missing', () => {
  beforeEach();
  const mw = requirePermission('invoices:read');
  const { res, state } = makeRes();
  const next = makeNext();
  mw({}, res, next);
  assert.equal(state.statusCode, 401);
  assert.equal(state.body.error, 'unauthenticated');
  assert.deepEqual(next.calls, []);
});

test('requirePermission: 403 when user lacks permission', () => {
  beforeEach();
  const mw = requirePermission('invoices:delete');
  const { res, state } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('viewer') }, res, next);
  assert.equal(state.statusCode, 403);
  assert.equal(state.body.error, 'forbidden');
  assert.equal(state.body.required, 'invoices:delete');
  assert.deepEqual(next.calls, []);
});

test('requirePermission: next() when user has permission', () => {
  beforeEach();
  const mw = requirePermission('invoices:read');
  const { res, state } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('viewer') }, res, next);
  assert.equal(state.sent, false);
  assert.deepEqual(next.calls, ['ok']);
});

test('requirePermission: owner passes even for owner-only actions', () => {
  beforeEach();
  const mw = requirePermission('company:delete');
  const { res } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('owner') }, res, next);
  assert.deepEqual(next.calls, ['ok']);
});

test('requirePermission: admin blocked from owner-only company:delete', () => {
  beforeEach();
  const mw = requirePermission('company:delete');
  const { res, state } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('admin') }, res, next);
  assert.equal(state.statusCode, 403);
});

test('requirePermission: throws at construction on bad permission', () => {
  beforeEach();
  assert.throws(() => requirePermission(''), /invalid/);
  assert.throws(() => requirePermission('nope'), /invalid/);
  assert.throws(() => requirePermission(null), /invalid/);
});

test('requireAnyPermission: passes if ANY permission held', () => {
  beforeEach();
  const mw = requireAnyPermission(['invoices:delete', 'invoices:read']);
  const { res } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('viewer') }, res, next);
  assert.deepEqual(next.calls, ['ok']);
});

test('requireAnyPermission: 403 if NONE held', () => {
  beforeEach();
  const mw = requireAnyPermission(['users:delete', 'company:delete']);
  const { res, state } = makeRes();
  const next = makeNext();
  mw({ user: makeUser('viewer') }, res, next);
  assert.equal(state.statusCode, 403);
});

// ─── 10. Wildcard semantics ─────────────────────────────────────

test('wildcard: resource:* grants all actions on that resource', () => {
  beforeEach();
  defineRole('inv-boss', ['invoices:*']);
  const u = makeUser('inv-boss');
  for (const a of ['read','create','update','delete','export','approve']) {
    assert.equal(can(u, `invoices:${a}`), true, `invoices:${a}`);
  }
  assert.equal(can(u, 'bills:read'), false);
});

test('wildcard: *:* matches every permission', () => {
  beforeEach();
  defineRole('godlike', ['*:*']);
  const u = makeUser('godlike');
  assert.equal(can(u, 'anything:anywhere'), true);
  assert.equal(can(u, 'future-module:future-action'), true);
});

// ─── 11. Constants / catalogues ─────────────────────────────────

test('RESOURCES / ACTIONS are non-empty frozen catalogues', () => {
  beforeEach();
  assert.ok(Array.isArray(RESOURCES));
  assert.ok(RESOURCES.length >= 50, 'should expose 50+ resources');
  assert.ok(Object.isFrozen(RESOURCES));
  assert.ok(Array.isArray(ACTIONS));
  assert.ok(Object.isFrozen(ACTIONS));
});

test('ROOT_PERMISSION is *:*', () => {
  beforeEach();
  assert.equal(ROOT_PERMISSION, '*:*');
});

// ─── 12. Realistic multi-role user flow ─────────────────────────

test('realistic flow: accountant temporarily granted backup:create', () => {
  beforeEach();
  const u = { id: 'u-emma' };
  assignRole('u-emma', 'accountant');
  assert.equal(can(u, 'tax-vat:export'), true);
  assert.equal(can(u, 'backups:create'), false);   // admin-only
  grantCustomPermission('u-emma', 'backups:create');
  assert.equal(can(u, 'backups:create'), true);
});

test('realistic flow: HR loses wage-slip:sign while on PIP', () => {
  beforeEach();
  const u = { id: 'u-noa' };
  assignRole('u-noa', 'hr');
  assert.equal(can(u, 'wage-slips:sign'), true);
  denyCustomPermission('u-noa', 'wage-slips:sign');
  assert.equal(can(u, 'wage-slips:sign'), false);
  // but other HR perms remain
  assert.equal(can(u, 'employees:read'), true);
});

test('defineRole: redefinition replaces permissions, not appends', () => {
  beforeEach();
  defineRole('scratch', ['a:b', 'c:d']);
  defineRole('scratch', ['x:y']);
  const g = getRole('scratch');
  assert.deepEqual(g.permissions, ['x:y']);
});
