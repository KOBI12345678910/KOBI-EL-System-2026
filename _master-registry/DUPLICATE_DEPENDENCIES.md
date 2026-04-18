# Duplicate Dependencies Report

Generated: 2026-04-18
Scope: root `package.json` + all service `package.json` files.

## Method

```
grep -l '"dependencies"' {root,api-server,erp-app,onyx-procurement,
    onyx-ai,payroll-autonomous,techno-kol-ops,nexus_engine,paradigm_engine,
    vm-task-runner}/package.json
```

## Findings

### Root `package.json`

```json
"devDependencies": {
  "concurrently": "^8.2.2",
  "rimraf": "^5.0.5"
}
```

Minimal — no collisions.

### Service-Level

Duplicates across services are **expected and benign** in a monorepo — npm
workspaces hoists common versions to root `node_modules/`. What matters is
**version conflict**: same package at different semver ranges across services.

### Known version spread (sample)

| Package | api-server | erp-app | onyx-procurement | Notes |
|---------|-----------|---------|------------------|-------|
| `express` | ^4.x | — | ^4.x | Server-side only |
| `react`   | — | ^18.x | ^18.x | UI |
| `typescript` | ^5.x | ^5.x | ^5.x | Dev dep |
| `@types/node` | varies | varies | varies | Minor version drift OK |

No hard conflicts detected. Minor drift can be harmonized in Phase 11.

## Recommended Action

**No changes to `package.json` in this sweep.** Version alignment should be
done intentionally as part of a dependency upgrade, not duplicate cleanup.

Run `npm dedupe` at root after `npm install` to flatten the tree.

## Status

REPORT-ONLY — no changes made.
