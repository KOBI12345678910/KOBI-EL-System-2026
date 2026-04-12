# AG-Y196 — Master Wiring Aggregator

**Agent**: Y-196
**Module**: `onyx-procurement/src/wiring/master-aggregator.js`
**Tests**:  `onyx-procurement/test/wiring/master-aggregator.test.js`
**Status**: PASS (25/25)
**Date**: 2026-04-11

---

## 1. סיכום מנהלים / Executive Summary

### עברית

בניתי שורש־חיבור ראשי (Master Composition Root) עבור מערכת Techno-Kol Uzi
mega-ERP המאגד את ארבע תת־המערכות תחת מחלקה אחת טהורה:

- `onyx-ai`
- `onyx-procurement`
- `payroll-autonomous`
- `techno-kol-ops`

המחלקה `MasterAggregator` היא רכיב לוגי טהור — **בלי Imports ישירים** של מודולים.
כל מודול מעביר את עצמו לרישום דרך `registerModule({id, factory, dependencies, scope,
name, description, healthCheck, shutdown, meta})`. הגרף נפתר באמצעות אלגוריתם Kahn
(למיון טופולוגי דטרמיניסטי), וזיהוי מעגלים ב־SCC בסגנון Tarjan. הבנייה בסדר
התלויות, בדיקת הבריאות רצה על כל המודולים, והכיבוי מבוצע בסדר הפוך עם סובלנות
לשגיאות.

הספרייה פועלת על מודולי ליבה של Node בלבד (`node:events`), ללא כל תלות חיצונית.
הרישום דו־לשוני מלא: כל מודול מחזיק `{he, en}` עבור שם ותיאור, וה־registry
מחזיר גם HE וגם EN ברמת רשומה. **לא מוחקים — רק משדרגים ומגדלים**: הקובץ החדש
חי תחת `src/wiring/` (שהייתה ריקה), אפס שינויים בקבצים קיימים.

### English

A pure-logic Master Composition Root for the Techno-Kol Uzi mega-ERP, unifying
four sub-systems (`onyx-ai`, `onyx-procurement`, `payroll-autonomous`,
`techno-kol-ops`) behind a single `MasterAggregator` class. No actual imports
of downstream modules — they self-register via
`registerModule({id, factory, dependencies, scope, name, description,
healthCheck, shutdown, meta})`.

Topological ordering uses Kahn's algorithm with alphabetical tie-breaking for
deterministic builds. Cycle detection is a Tarjan-style SCC pass over the
unresolved sub-graph. `buildAll` instantiates in dependency order, passes
dep-injected instances into each factory, `healthCheckAll` aggregates
health probes, and `shutdown` tears down in the reverse of build order while
tolerating per-module errors.

Zero external dependencies — only `node:events`. Bilingual everywhere: every
module carries `{he, en}` name/description; `bilingualRegistry()` exposes both
languages plus per-scope grouping. Additive only — the new file lives under a
previously empty `src/wiring/`, touching nothing existing.

---

## 2. קבצים שנוצרו / Deliverables

| # | Path                                                        | Purpose                                | LOC |
|---|-------------------------------------------------------------|----------------------------------------|-----|
| 1 | `onyx-procurement/src/wiring/master-aggregator.js`          | Core module (class, topo, lifecycle)   | ~440 |
| 2 | `onyx-procurement/test/wiring/master-aggregator.test.js`    | 25 unit + integration tests            | ~380 |
| 3 | `_qa-reports/AG-Y196-master-aggregator.md`                  | This bilingual QA report               | —    |

No existing file was modified, renamed, or deleted.
Complies with **"לא מוחקים רק משדרגים ומגדלים"**.

---

## 3. API Surface

### Exports

| Symbol                 | Kind       | Summary |
|------------------------|------------|---------|
| `MasterAggregator`     | class      | The composition root. |
| `createAggregator()`   | function   | Factory (`new MasterAggregator(opts)` shortcut). |
| `SCOPES`               | const enum | Frozen object of the four sub-systems. |
| `KNOWN_SCOPES`         | const      | Frozen array of scope string values. |
| `STATE`                | const enum | Frozen enum of lifecycle states. |

### Class: `MasterAggregator extends EventEmitter`

| Method | Returns | Description |
|---|---|---|
| `registerModule(spec)`   | `this` | Register one module. Validates id, factory, deps, scope, bilingual name. |
| `registerAll(specs)`     | `this` | Bulk register; array of specs. |
| `hasModule(id)`          | `boolean` | Exact-id lookup. |
| `moduleCount()`          | `number` | Number of registered modules. |
| `listIds()`              | `string[]` | All ids. |
| `bilingualRegistry()`    | object | `{ he[], en[], byId, byScope }`. |
| `resolveGraph()`         | object | `{ order, cycles, missing }`. |
| `buildAll(ctx)`          | `Promise<Map>` | Topo-ordered instantiation. |
| `getInstance(id)`        | any | Built instance lookup (throws pre-build). |
| `getBuildOrder()`        | `string[]` | Deterministic order once built. |
| `healthCheckAll(ctx)`    | `Promise<{ok, results}>` | Run every `healthCheck`. |
| `getHealth(id)`          | object\|null | Last recorded health record for `id`. |
| `shutdown(ctx)`          | `Promise<{ok, errors, order}>` | Reverse-order teardown. |
| `renderBilingualReport()`| `string` | Human-readable HE/EN summary. |

### Emitted events

| Event                | Payload                          |
|----------------------|-----------------------------------|
| `module:registered`  | `{ id, scope }`                   |
| `module:built`       | `{ id, instance }`                |
| `module:failed`      | `{ id, error, phase }`            |
| `module:healthy`     | `{ id, details }`                 |
| `module:unhealthy`   | `{ id, details }`                 |
| `module:stopped`     | `{ id }`                          |
| `build:complete`     | `{ order }`                       |
| `shutdown:complete`  | `{ order }`                       |

### Module spec schema

```js
{
  id:           'auth',                                     // required
  factory:      async (ctx, deps) => authService,           // required
  dependencies: ['db', 'config'],                           // optional, default []
  scope:        SCOPES.ONYX_PROCUREMENT,                    // optional, strict
  name:         { he: 'אימות', en: 'Auth' },                // optional, bilingual
  description:  { he: 'שירות הזדהות', en: 'Identity svc' }, // optional, bilingual
  healthCheck:  (instance, ctx) => ({ ok: true }),          // optional
  shutdown:     async (instance, ctx) => { /* stop */ },    // optional
  meta:         { version: '1.0.0', tags: ['security'] },   // optional
}
```

### Sample usage

```js
const { MasterAggregator, SCOPES } = require('./wiring/master-aggregator');

const root = new MasterAggregator();

root.registerAll([
  {
    id: 'ai-core',
    factory: () => require('../../../onyx-ai/src/index').bootstrap(),
    scope: SCOPES.ONYX_AI,
    name: { he: 'ליבת בינה', en: 'AI Core' },
    healthCheck: (svc) => svc.ping(),
    shutdown: (svc) => svc.close(),
  },
  {
    id: 'proc-core',
    factory: (_ctx, deps) => buildProcurement(deps['ai-core']),
    dependencies: ['ai-core'],
    scope: SCOPES.ONYX_PROCUREMENT,
    name: { he: 'ליבת רכש', en: 'Procurement Core' },
  },
]);

await root.buildAll({ tenant: 'uzi' });
const health = await root.healthCheckAll();
console.log(root.renderBilingualReport());
// ... app runs ...
await root.shutdown();
```

---

## 4. אלגוריתם / Algorithm Overview

1. **Validation on register** — id must be a non-empty string, factory must be
   a function, deps an array of non-empty strings, no self-dependency, no
   duplicates. Scope is validated against `KNOWN_SCOPES` unless
   `strictScopes: false`. Bilingual `name`/`description` each require both
   `he` and `en` non-empty strings.

2. **Topological sort — Kahn's algorithm**:
   - Build indegree map and adjacency (`dep → dependents`).
   - Seed queue with all indegree-0 nodes, alphabetized.
   - Pop smallest-available ready node; append to `order`; decrement
     dependents' indegree; insertion-sort newly ready nodes into queue.
   - Deterministic: same registration set always yields the same order.

3. **Cycle detection — Tarjan SCC** over the leftover sub-graph:
   - Any node not in `order` is either part of a cycle or transitively
     depends on one.
   - Tarjan gives connected components; components with ≥ 2 nodes are
     reported as cycles. Self-loops are refused at registration time.

4. **Missing dependency reporting** — edges pointing to un-registered ids
   are collected into `missing: [{from, to}]` without blocking the rest of
   the graph. `buildAll` then refuses to start if `missing.length > 0`.

5. **buildAll**:
   - Calls `resolveGraph()`; throws on missing or cycles **before** invoking
     any factory.
   - For each id in topo order: collects dep instances into a plain object
     keyed by id, calls `factory(ctx, depInstances)`, awaits if needed,
     stores instance.
   - Wraps thrown errors with module id and sets `err.cause`.

6. **healthCheckAll**:
   - Only callable once `buildAll` has succeeded.
   - Modules without `healthCheck` are reported as `{ok: true, skipped: true}`.
   - Throwing probes become `{ok: false, error: message}`.
   - Aggregate `ok` is `false` if any individual record is `ok: false`.

7. **shutdown**:
   - Iterates `buildOrder` in **reverse**. Every module's `shutdown` is
     awaited; per-module errors are collected in `errors[]` and the next
     module still runs. Final `{ok, errors, order}` is returned and all
     instances are cleared (registrations are preserved → "never delete").

---

## 5. תוצאות טסטים / Test Results

Run command:

```
cd onyx-procurement
node --test test/wiring/master-aggregator.test.js
```

Result:

```
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 118.57
```

### Test-by-test coverage

| #  | Name                                                             | Area |
|---|------------------------------------------------------------------|---|
| 01 | SCOPES enum exposes the four sub-systems                         | enum |
| 02 | registerModule accepts minimal valid spec                        | happy path |
| 03 | registerModule rejects missing or duplicate id                   | validation |
| 04 | registerModule requires a factory function                      | validation |
| 05 | registerModule refuses self-dependency and non-array deps       | validation |
| 06 | strict scope check rejects unknown sub-systems                   | validation |
| 07 | registerModule rejects broken bilingual name                     | bilingual |
| 08 | resolveGraph produces linear topological order                   | topo |
| 09 | resolveGraph reports missing dependencies                        | graph |
| 10 | resolveGraph detects a direct 2-node cycle                       | **cycle** |
| 11 | resolveGraph detects a 3-node indirect cycle (SCC)               | **cycle** |
| 12 | buildAll instantiates in topo order and injects deps             | lifecycle |
| 13 | buildAll throws on cycle and attaches details                    | **cycle** |
| 14 | buildAll surfaces factory failures with cause                    | error path |
| 15 | healthCheckAll aggregates healthy, unhealthy, thrown, skipped    | health |
| 16 | shutdown runs in reverse build order and tolerates errors        | shutdown |
| 17 | bilingualRegistry returns HE and EN plus scope grouping          | bilingual |
| 18 | aggregator emits lifecycle events                                | events |
| 19 | healthCheckAll requires a prior buildAll                         | guard |
| 20 | renderBilingualReport contains HE and EN lines                   | bilingual |
| 21 | createAggregator returns a MasterAggregator instance             | factory |
| 22 | STATE enum is frozen and has expected members                    | enum |
| 23 | integration: four sub-systems wired in dep order                 | **integration** |
| 24 | getInstance before buildAll throws RangeError                    | guard |
| 25 | buildAll throws on missing dependency                            | error path |

25 tests ≥ 15 required. All green. Three dedicated cycle-detection tests
(10, 11, 13) plus a four-subsystem integration test (23).

---

## 6. תאימות / Compliance Checklist

- **"לא מוחקים רק משדרגים ומגדלים"**: pass — brand-new file, zero deletions or edits to existing files.
- **Node built-ins only**: pass — only `node:events`. No npm deps.
- **Pure logic, no imports**: pass — the aggregator never `require`s downstream modules; registration is API-based.
- **Bilingual registry**: pass — `{he, en}` enforced on `name`/`description`; `bilingualRegistry()` returns both languages and per-scope groups.
- **Class `MasterAggregator`**: pass — exported.
- **`registerModule({id, factory, dependencies})`**: pass — plus optional `scope`, `name`, `description`, `healthCheck`, `shutdown`, `meta`.
- **`resolveGraph` with topo sort + cycle detection**: pass — Kahn + Tarjan SCC.
- **`buildAll(ctx)` returns instantiated modules in dep order**: pass — deterministic.
- **`healthCheckAll`**: pass — aggregates ok/unhealthy/thrown/skipped.
- **`shutdown` in reverse order**: pass — reverse build order, error-tolerant.
- **≥ 15 tests including cycle detection**: pass — 25 tests, 3 cycle-focused.
- **Bilingual QA report**: pass — this file (HE + EN, side by side).

---

## 7. Integration Hooks (growth path)

This aggregator is designed to be the **single mount point** for all four
sub-systems. Recommended future plug-ins (additive only, no signature
breakage):

- **`onyx-ai/src/index.ts`** — expose a `bootstrapAI()` factory and
  register via `{ id: 'ai-core', factory: bootstrapAI, scope: SCOPES.ONYX_AI }`.
- **`onyx-procurement/server.js`** — on startup, construct a
  `MasterAggregator`, call a set of `register-*.js` helpers, then
  `await root.buildAll(ctx)` before `app.listen(...)`.
- **`payroll-autonomous/src/App.jsx`** — emit a registration descriptor at
  module load and attach via `registerAll`.
- **`techno-kol-ops/src/index.ts`** — same pattern; use `healthCheckAll`
  to feed `/status` endpoint.
- **`renderBilingualReport()`** is ready to feed a Hebrew/English status
  page or SSE heartbeat for Ops dashboards.
- **Events**: the `EventEmitter` base can be piped straight into the
  existing `src/logger.js` for structured audit trails of each boot and
  shutdown cycle.

Future upgrades (all additive):

- **Parallel build levels** — group nodes with identical indegree depth and
  `await Promise.all(level)` per level. Current serial build is simpler to
  reason about; parallel mode can be added as `buildAll({parallel: true})`.
- **Partial rebuild** — `rebuildSubtree(id)` that stops and re-instantiates
  `id` plus its transitive dependents without touching the rest.
- **Snapshot export** — serialize `bilingualRegistry()` to JSON for
  ERP-wide dashboards.

---

## 8. Reproduction

```bash
cd onyx-procurement
node --test test/wiring/master-aggregator.test.js
```

Expected tail:

```
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

---

## 9. Non-Destructive Guarantee

This agent ran under the **"never delete, only grow"** mandate:

- Zero existing files were edited.
- Zero existing files were renamed or moved.
- Two new directories already existed empty (`src/wiring/`, `test/wiring/`)
  and are now populated.
- All tests are new; no previously-green suite was touched or reordered.
- `resolveGraph()` preserves registered modules across rebuilds and cycles —
  it never removes registrations, only reports problems.
- `shutdown()` clears **instances** but preserves the **registry**, so
  the aggregator can be re-built without re-registering.

---

**Signed-off**: Agent Y-196 · 2026-04-11
