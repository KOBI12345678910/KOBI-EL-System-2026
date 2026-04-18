# AG-X98 — Feature Flag System

**Agent:** X98
**Module:** `onyx-procurement/src/flags/feature-flags.js`
**Tests:** `onyx-procurement/test/flags/feature-flags.test.js`
**Audit log:** `onyx-procurement/data/flag-audit.jsonl`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — no deletions, only upgrades and growth.

---

## 1. Overview

A zero-dependency, bilingual (Hebrew + English) feature-flag engine for the
Techno-Kol Uzi Mega-ERP. Supports five complementary flag types that can be
combined on a single flag, sticky per-user rollouts via FNV-1a hashing,
AND/OR/NOT rule trees with nine operators, start/end date scheduling, append-
only JSONL audit trail, Express middleware, and non-destructive import.

Everything is additive — the API never exposes a `deleteFlag` method. Flag
changes bump a monotonic `version` counter and log before/after snapshots to
the audit trail.

### 1.1 Design principles

- **Zero external deps.** Only `fs` + `path` from Node core.
- **Non-destructive upgrades.** `defineFlag` on an existing key increments
  `version`, preserves `createdAt`, and logs the previous snapshot.
- **Sticky bucketing.** Same `userId + flagName` always lands in the same
  0-99 bucket via FNV-1a 32-bit, salted by flag name.
- **Deterministic evaluation.** Injectable clock (`opts.clock`) makes date
  and rollout tests reproducible.
- **Append-only audit.** JSONL log so a `tail -f` can stream changes; an
  in-memory ring mirrors the same entries for tests.
- **Bilingual descriptions.** Every flag carries both `description` (en) and
  `description_he` (he) fields preserved across upgrades.

---

## 2. Flag Types

| Type        | When to use                             | Primary gate           |
|-------------|-----------------------------------------|------------------------|
| `boolean`   | Kill switch, on/off everywhere          | `default`              |
| `rollout`   | Gradual rollout to N% of users          | `rolloutPercent` + FNV bucket |
| `user-list` | Beta allowlist / VIP access             | `{attr:'userId', op:'in', val:[...]}` |
| `attribute` | Role/tier/country/plan gating           | `rules` tree            |
| `schedule`  | Time-boxed launches / holiday features  | `startDate` / `endDate` |

A flag can combine them: a rollout flag can also have a rules gate plus a
start date. Evaluation order is documented in section 4.

---

## 3. Rule Syntax

A rule node is one of:

```js
// Leaf:
{ attr: 'role', op: 'eq', val: 'admin' }

// AND (all children must match):
{ all: [ <node>, <node>, ... ] }

// OR (at least one child must match):
{ any: [ <node>, <node>, ... ] }

// NOT (invert child):
{ not: <node> }
```

### 3.1 Operators

| Op         | Meaning                          | Example                                          |
|------------|----------------------------------|--------------------------------------------------|
| `eq`       | Strict equality                  | `{attr:'role', op:'eq', val:'admin'}`            |
| `ne`       | Strict inequality                | `{attr:'plan', op:'ne', val:'free'}`             |
| `in`       | Membership in array              | `{attr:'country', op:'in', val:['IL','US']}`     |
| `nin`      | Non-membership                   | `{attr:'blocklist', op:'nin', val:['spam']}`     |
| `gt`       | Numeric greater-than             | `{attr:'tier', op:'gt', val:2}`                  |
| `gte`      | Numeric greater-or-equal         | `{attr:'age', op:'gte', val:18}`                 |
| `lt`       | Numeric less-than                | `{attr:'tier', op:'lt', val:5}`                  |
| `lte`      | Numeric less-or-equal            | `{attr:'age', op:'lte', val:120}`                |
| `contains` | String substring match           | `{attr:'email', op:'contains', val:'@tko.co.il'}`|
| `regex`    | Regex match on string attribute  | `{attr:'phone', op:'regex', val:'^05\\d{8}$'}`   |
| `exists`   | Attribute present (non-null)     | `{attr:'userId', op:'exists'}`                   |

### 3.2 Nested example

```js
ff.defineFlag({
  name: 'admin-il-or-us',
  rules: {
    all: [
      { attr: 'role', op: 'eq', val: 'admin' },
      { any: [
        { attr: 'country', op: 'in', val: ['IL', 'US'] },
        { attr: 'tier',    op: 'gte', val: 3 }
      ] },
      { not: { attr: 'banned', op: 'eq', val: true } }
    ]
  }
});
```

### 3.3 Context attribute resolution

`readAttr(ctx, path)` supports three lookup strategies:

1. Top-level key on the context object (e.g. `ctx.role`).
2. `ctx.attributes[path]` shortcut (e.g. `attributes.country`).
3. Dotted path traversal (e.g. `user.profile.tier`).

Missing attributes return `undefined` and all operators (except `exists`)
treat them as a non-match, so rules self-guard.

---

## 4. Evaluation Order

`evaluate(flagName, context, trace)` pipeline:

1. **Unknown flag?** → `{enabled:false, reason:'unknown-flag'}`
2. **Schedule check** — `startDate` / `endDate` against `clock()`
3. **Rule tree** — if present, must pass or `reason:'rules-failed'`
4. **Rollout percent** — sticky `bucketUser(userId, flagName) < rolloutPercent`
5. **Rules-pass override** — rules matched and no rollout → `enabled:true`
6. **Default fallback** — `flag.default`

Every branch returns a reason string for debugging:
`unknown-flag | before-start-date | after-end-date | rules-failed | rollout-in | rollout-out | rollout-100 | rollout-0 | rules-pass | default`

---

## 5. Bucketing (FNV-1a Sticky Hash)

```js
bucketUser(userId, flagName) → 0..99
  return fnv1a32(`${flagName}::${userId}`) % 100
```

Properties verified in tests:

- **Stable** — same inputs always yield the same bucket (1000-user test).
- **Salted** — identical userId on two flags lands in different buckets
  (verified: <50% collision rate over 500 users across two flags).
- **Uniform** — 10 000-user simulation of `rolloutPercent:50` hit 50% ± 3%.

FNV-1a is cheap, dependency-free, and deterministic across Node versions.

---

## 6. Audit Trail Format

File: `data/flag-audit.jsonl` (JSONL, append-only)

Each line is a JSON object:

```json
{
  "ts": "2026-04-11T12:34:56.789Z",
  "event": "set",
  "name": "new-dashboard",
  "actor": "uzi@tko.co.il",
  "before": { "default": false, "version": 1, "rolloutPercent": null, ... },
  "after":  { "default": true,  "version": 2, "rolloutPercent": null, ... },
  "reason": "setFlag"
}
```

### 6.1 Event types

| Event    | Trigger                                        |
|----------|------------------------------------------------|
| `define` | First `defineFlag` for a given name            |
| `upgrade`| `defineFlag` on an existing name (version bump)|
| `set`    | `setFlag(name, value, actor)`                  |

`before` is `null` for `define` events. `actor` defaults to `"system"` when
not supplied. Audit entries are also mirrored in-memory on `ff.auditMemory`
for tests and ops tooling. If the audit directory cannot be created, writes
fall back to memory only — an audit failure never breaks the app.

---

## 7. Public API

```js
const { FeatureFlags } = require('./src/flags/feature-flags');
const ff = new FeatureFlags({ auditFile: 'data/flag-audit.jsonl' });

ff.defineFlag({
  name: 'new-dashboard',
  type: 'rollout',
  default: false,
  rolloutPercent: 25,
  rules: { attr: 'country', op: 'eq', val: 'IL' },
  startDate: '2026-05-01T00:00:00Z',
  description: 'New procurement dashboard',
  description_he: 'דשבורד רכש חדש',
  owner: 'uzi@tko.co.il'
});

ff.isEnabled('new-dashboard', { userId: 'u-42', country: 'IL' });
// → true / false

ff.evaluate('new-dashboard', { userId: 'u-42', country: 'IL' }, true);
// → { enabled, reason, bucket, percent, traces: [...] }

ff.setFlag('new-dashboard', { rolloutPercent: 50 }, 'uzi@tko.co.il');
ff.setFlag('new-dashboard', true, 'uzi@tko.co.il'); // boolean form
ff.getFlag('new-dashboard');
ff.listFlags();

const snapshot = ff.exportState();
ff.importState(snapshot); // non-destructive merge

app.use(ff.express()); // attaches req.flags
// inside a route:
if (req.flags.isEnabled('new-dashboard')) { ... }
```

---

## 8. Hebrew Glossary / מילון מונחים

| English                 | עברית                        | Notes                                          |
|-------------------------|------------------------------|------------------------------------------------|
| Feature flag            | דגל תכונה / מתג תכונה         | mechanism for progressive rollout              |
| Rollout percentage      | אחוז הצגה הדרגתי             | 0..100 — sticky via FNV-1a bucket              |
| User list               | רשימת משתמשים מורשים         | explicit allowlist                             |
| Rule tree               | עץ כללים                     | AND/OR/NOT of attribute predicates             |
| Attribute gate          | שער לפי תכונה                | e.g. role, country, tier                       |
| Audit trail             | יומן ביקורת                  | append-only JSONL                              |
| Kill switch             | מתג כיבוי חירום              | boolean flag set to false                      |
| Sticky bucket           | דליי יציב                    | deterministic per user                         |
| Non-destructive upgrade | שדרוג לא הרסני               | never delete, only bump version                |
| Schedule window         | חלון זמן מתוזמן              | startDate/endDate gating                       |
| Default value           | ערך ברירת מחדל               | fallback when no other gate applies            |
| Evaluation reason       | סיבת הערכה                   | debug string returned by `evaluate()`          |
| Trace                   | עקבות הערכה                  | step-by-step rule-tree debug output            |
| Owner                   | בעלים                        | team/person responsible for the flag           |
| Rollout                 | גרסת פריסה הדרגתית           | gradual release                                |

---

## 9. Test Matrix

File: `test/flags/feature-flags.test.js` (24 cases, all pass).

| # | Case                                                         | Result |
|---|--------------------------------------------------------------|--------|
| 1 | FNV-1a determinism & 32-bit range                            | pass   |
| 2 | `defineFlag` + `listFlags` + defensive copy                  | pass   |
| 3 | `defineFlag` as non-destructive upgrade (version bump)       | pass   |
| 4 | Boolean default for flag with no rules                       | pass   |
| 5 | Unknown flag → `enabled:false, reason:'unknown-flag'`        | pass   |
| 6 | Bucket stickiness (1000 users × 2 reads)                     | pass   |
| 7 | Bucket salting across flags (<50% collision)                 | pass   |
| 8 | Rollout 50% accuracy (10 000 samples, ± 3%)                  | pass   |
| 9 | Rollout 0% and 100% hard boundaries                          | pass   |
|10 | AND of two leaf conditions                                   | pass   |
|11 | OR nested under AND                                          | pass   |
|12 | NOT / contains / regex / exists operators                    | pass   |
|13 | user-list via `attr/in`                                      | pass   |
|14 | `readAttr` dotted paths and `attributes` shortcut            | pass   |
|15 | `startDate` / `endDate` gating with injected clock           | pass   |
|16 | `setFlag` audit entry has before/after/actor/ts              | pass   |
|17 | JSONL audit file is line-parseable                           | pass   |
|18 | `setFlag` on unknown flag throws                             | pass   |
|19 | `exportState` / `importState` round-trip                     | pass   |
|20 | `importState` preserves existing flags                       | pass   |
|21 | `express()` middleware attaches `req.flags`                  | pass   |
|22 | `express()` middleware denies on role mismatch               | pass   |
|23 | `evaluate(trace=true)` returns trace array                   | pass   |
|24 | `evalRule` handles empty `all` / `any` / null node           | pass   |

**Run:** `node --test test/flags/feature-flags.test.js`
**Total:** 24 / 24 pass, ~170 ms

---

## 10. Files Touched (Non-destructive)

- NEW `onyx-procurement/src/flags/feature-flags.js`
- NEW `onyx-procurement/test/flags/feature-flags.test.js`
- NEW `_qa-reports/AG-X98-feature-flags.md`
- NEW (at first write) `onyx-procurement/data/flag-audit.jsonl`

No existing file was modified. No file was deleted. Following the Uzi rule:
**לא מוחקים רק משדרגים ומגדלים**.

---

## 11. Integration Notes

Wire into `server.js` (future agent, not this one):

```js
const { FeatureFlags } = require('./src/flags/feature-flags');
const flags = new FeatureFlags();

// Seed initial flags on boot (safe to re-run — upgrades, not replaces)
flags.defineFlag({
  name: 'new-procurement-dashboard',
  type: 'rollout',
  rolloutPercent: 10,
  description_he: 'דשבורד רכש חדש — פריסה הדרגתית',
  owner: 'procurement-team'
});

app.use(flags.express());

// In any route:
app.get('/procurement', (req, res) => {
  if (req.flags.isEnabled('new-procurement-dashboard')) {
    return res.render('dashboard-v2');
  }
  return res.render('dashboard-v1');
});

// Admin route for toggling:
app.post('/admin/flags/:name', requireAdmin, (req, res) => {
  const updated = flags.setFlag(req.params.name, req.body, req.user.email);
  res.json(updated);
});
```

---

**End of report — AG-X98 feature-flags**
