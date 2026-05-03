# AGENT 210 - Pipeline Routes Mount Patch

**Worktree:** `objective-merkle-40ff93`
**Target:** `onyx-procurement/server.js`
**Date:** 2026-04-29
**Issue source:** Agent 196 #1 - 6 pipeline APIs defined in `src/pipeline/*` but never mounted on the Express app.

---

## 1. Diagnosis

The 6 pipeline modules under `onyx-procurement/src/pipeline/` already export
`register*Routes(app[, deps])` helpers that wire every route the CLAUDE.md
contract requires. But `server.js` never calls them. Confirmed via grep:

```
$ grep -n "registerPipelineRoutes\|registerWiringRoutes\|registerEntityMapRoutes\|\
registerStateMachineRoutes\|registerOrchestratorRoutes\|registerWorkflowRoutes" \
  onyx-procurement/server.js
(no matches)
```

The only `src/pipeline/*` import in `server.js` is `state-enforcement` (line 184).
Result: every route below returns Express's default 404 even though the
implementation is fully written and tested.

| Required route                              | Defined in                  | Exporter                       |
|---------------------------------------------|-----------------------------|--------------------------------|
| `GET  /api/wiring/spec`                     | `wiring-spec.js:312`        | `registerWiringRoutes`         |
| `GET  /api/entity-map/:type`                | `entity-map.js:384`         | `registerEntityMapRoutes`      |
| `GET  /api/state-machines/:type/transitions`| `state-machines.js:363`     | `registerStateMachineRoutes`   |
| `POST /api/orchestrator/execute`            | `orchestrator.js:326`       | `registerOrchestratorRoutes`   |
| `GET  /api/pipeline/stages`                 | `pipeline-engine.js:351`    | `registerPipelineRoutes`       |
| `GET  /api/workflows/:id`                   | `workflow-flows.js:120`     | `registerWorkflowRoutes`       |

Each exporter ALSO mounts adjacent endpoints (e.g. `registerStateMachineRoutes`
adds `/api/state-machines`, `/api/state-machines/:type`,
`/api/state-machines/:type/can-transition` alongside the `/transitions`
route). Mounting once unlocks the full set per module.

Signatures (verified at the bottom of each file):

```js
registerWiringRoutes(app)                        // wiring-spec.js:303
registerEntityMapRoutes(app)                     // entity-map.js:376
registerStateMachineRoutes(app)                  // state-machines.js:341
registerOrchestratorRoutes(app, deps)            // orchestrator.js:304   (deps = { supabase, audit })
registerPipelineRoutes(app, { supabase, audit }) // pipeline-engine.js:347
registerWorkflowRoutes(app)                      // workflow-flows.js:115
```

`supabase` is created at `server.js:168-173`, and `audit()` is defined at
`server.js:498`. Both identifiers are in scope at the chosen insertion point.

---

## 2. Insertion Point

Mount the 6 modules right after the notifications wiring block ends
(line 553) and before the `API: STATUS` banner (line 555). At that point:

- `app` has Helmet, CORS, JSON body-parser, rate-limiters, and `requireAuth`
  applied to `/api/` (line 268).
- `supabase` client is initialized.
- `audit()` and `app.locals.{auditWriter,stateHistoryWriter,enforceTransition}`
  are populated.
- Notifications and admin/query-stats are already mounted - the pipeline
  routes follow the same wiring pattern (try/catch, `console.log` on success).

---

## 3. Unified Diff

```diff
--- a/onyx-procurement/server.js
+++ b/onyx-procurement/server.js
@@ -550,6 +550,40 @@ console.log('✓ state-enforcement wired — enforceTransition + recordTransitio
   console.log('✓ notifications wired — /api/notifications/*');
 } catch (e) {
   console.warn('⚠️  notifications wiring skipped:', e && e.message);
 }

+// ═══════════════════════════════════════════════════════════════
+// PIPELINE / WIRING / ENTITY-MAP / STATE-MACHINES / ORCHESTRATOR /
+// WORKFLOW-FLOWS — System Blueprint APIs (Agent 210)
+//
+// CLAUDE.md "Key APIs" contract:
+//   GET  /api/wiring/spec
+//   GET  /api/entity-map/:type
+//   GET  /api/state-machines/:type/transitions?current=X
+//   POST /api/orchestrator/execute
+//   GET  /api/pipeline/stages
+//   GET  /api/workflows/:id
+//
+// Each module exports a register*Routes(app[, deps]) helper that mounts
+// the contract route plus its sibling endpoints. supabase + audit() are
+// already in scope (defined above at lines 168 and 498).
+// ═══════════════════════════════════════════════════════════════
+try {
+  const { registerWiringRoutes }       = require('./src/pipeline/wiring-spec');
+  const { registerEntityMapRoutes }    = require('./src/pipeline/entity-map');
+  const { registerStateMachineRoutes } = require('./src/pipeline/state-machines');
+  const { registerOrchestratorRoutes } = require('./src/pipeline/orchestrator');
+  const { registerPipelineRoutes }     = require('./src/pipeline/pipeline-engine');
+  const { registerWorkflowRoutes }     = require('./src/pipeline/workflow-flows');
+
+  registerWiringRoutes(app);
+  registerEntityMapRoutes(app);
+  registerStateMachineRoutes(app);
+  registerOrchestratorRoutes(app, { supabase, audit });
+  registerPipelineRoutes(app, { supabase, audit });
+  registerWorkflowRoutes(app);
+
+  console.log('✓ pipeline blueprint APIs wired — wiring-spec + entity-map + state-machines + orchestrator + pipeline-engine + workflow-flows');
+} catch (e) {
+  console.error('❌ pipeline blueprint wiring failed:', e && e.message);
+  if (errorTracker) errorTracker.capture(e, { tag: 'pipeline-blueprint-wiring' });
+}
+
 // ═══════════════════════════════════════════════════════════════
 // API: STATUS
 // ═══════════════════════════════════════════════════════════════
```

---

## 4. Why This Order?

1. **`registerWiringRoutes`** first - read-only, no deps, foundational map.
2. **`registerEntityMapRoutes`** - read-only, no deps.
3. **`registerStateMachineRoutes`** - read-only, no deps.
4. **`registerOrchestratorRoutes(app, { supabase, audit })`** - the `POST
   /api/orchestrator/execute` handler writes audit rows via `audit()` and may
   query Supabase, so it needs both deps.
5. **`registerPipelineRoutes(app, { supabase, audit })`** - serves
   `/api/pipeline/stages` (in-memory) AND `/api/pipeline/items`,
   `/api/pipeline/trigger`, `/api/pipeline/health` which require Supabase + audit.
6. **`registerWorkflowRoutes`** last - read-only, no deps.

Order is not strictly load-bearing (each `app.get/post` is independent), but it
keeps dep-free helpers first and Supabase-backed helpers last for readability.

---

## 5. Side-Effects / Risk Assessment

| Concern | Outcome |
|---------|---------|
| Auth | All 6 register helpers mount `/api/*` paths, so `requireAuth` middleware at line 268 covers them automatically. No bypass. |
| RBAC | These are read-mostly blueprint endpoints; they do not bypass RBAC because no `requirePermission` is currently applied. If the team wants RBAC on `POST /api/orchestrator/execute`, that's a separate follow-up - the helper does not block it. |
| Rate limiting | `apiLimiter` (line 139) already covers `/api/*`. Inherited automatically. |
| Order vs. catch-all 404 | The catch-all `/api/*` 404 handler (if any) lives lower in the file; mounting before it is correct. The chosen position is well above any error handlers. |
| Module load failure | Wrapped in try/catch with `errorTracker.capture` so a missing dependency produces a clear log, not a boot crash. Mirrors the notifications block (line 544-553). |
| Duplicate routes | Verified none of the 6 routes already exist on `app` - grep for `/api/wiring/`, `/api/entity-map`, `/api/state-machines`, `/api/orchestrator`, `/api/pipeline/stages`, `/api/workflows` in server.js returns zero matches. |
| `app.locals` pollution | None - register helpers only call `app.get`/`app.post`. They do not write to `app.locals`. |
| Auth on read endpoints | `GET /api/wiring/spec`, `/api/entity-map/:type`, etc. fall under `/api/` and therefore require an API key in production (AUTH_MODE=api_key). If the UI needs unauthenticated access, add them to the public allowlist at line 258-272 in a separate change. |

---

## 6. Verification Plan (post-patch)

```bash
# 1. Boot the server
cd onyx-procurement && node server.js
# Expect: "✓ pipeline blueprint APIs wired — ..." in stdout, plus the
# 6 sub-logs from each register helper:
#   ✓ Wiring spec routes registered
#   ✓ Entity map routes registered (16 entities)
#   ✓ State machines registered (13 entities)
#   ✓ Orchestrator registered (18 actions)
#   ✓ Pipeline engine routes registered
#   ✓ Workflow flows registered (5 flows)

# 2. Smoke test the 6 contract endpoints
H='-H X-API-Key:$DEV_KEY'
curl -s $H http://localhost:3100/api/wiring/spec        | jq '.system'
curl -s $H http://localhost:3100/api/entity-map/lead    | jq '.entity.label'
curl -s $H 'http://localhost:3100/api/state-machines/quote/transitions?current=draft' | jq '.transitions'
curl -s $H -X POST -H 'Content-Type: application/json' \
  -d '{"action":"convert_quote_to_project","context":{"quoteId":"demo"}}' \
  http://localhost:3100/api/orchestrator/execute        | jq '.ok'
curl -s $H http://localhost:3100/api/pipeline/stages    | jq '.stages | length'
curl -s $H http://localhost:3100/api/workflows/sales_to_project | jq '.flow.label'
```

Each call should return 200 with shaped JSON (not a 404 HTML page).

---

## 7. Apply Instructions

```bash
# From repo root (objective-merkle-40ff93 worktree):
cd "onyx-procurement"
git apply <<'EOF'
<the diff block from section 3>
EOF

# Or hand-edit:
#   Open onyx-procurement/server.js, scroll to line 553
#   (end of notifications try/catch), and paste the 34-line block from
#   section 3 immediately before the "API: STATUS" banner at line 555.
```

No new dependencies, no DB migrations, no env vars required. The patch is
purely a wiring fix - all referenced files already exist and export the
right symbols.

---

## 8. Files Touched

- `onyx-procurement/server.js` (single insertion at line 554, +34 lines)

## 9. Files Read for This Report (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\server.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\entity-map.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\state-machines.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\orchestrator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\pipeline-engine.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\workflow-flows.js`
