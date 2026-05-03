# AGENT FIX — ERP BUILD: missing `wouter`

**Date:** 2026-04-29
**Branch:** claude/objective-merkle-40ff93
**Status:** wouter resolved (build now advances past wouter; next missing dep is `sonner`)

## Option chosen: B — install `wouter` as a dependency

### Rationale for not using Option A
- `wouter` is imported across **172 source files** (App.tsx, all 13 route modules, 100+ pages, layout, command-palette, etc.).
- Replacing wouter with react-router-dom would touch every file — far exceeding the < 30 LOC budget.
- The wouter API (`Switch`, `useRoute`, `Redirect`, nested `Router base=`, etc.) is a non-trivial port to react-router v6 (`Routes`, `useParams`, `<Navigate>`, `<Outlet>` patterns).
- `erp-app/package.json` already declares `"wouter": "^3.3.5"` (line 74) — it just was never installed.

### Action taken
```
cd <worktree-root>
npm install --save wouter --no-audit --no-fund
```
Result: `added 4 packages in 3s` (wouter@3.9.0 + mitt, regexparam, use-sync-external-store).

### Lines changed
- **Source files: 0** (zero LOC — pure dependency install)
- `package.json` (root): +1 line `"wouter": "^3.9.0"` in dependencies
- `package-lock.json`: regenerated (+4 packages)

### Build verification
```
> @workspace/erp-app@0.0.0 build
> vite build --config vite.config.ts
vite v5.4.21 building for production...
transforming...
✓ 15 modules transformed.
x Build failed in 1.84s
error during build:
[vite]: Rollup failed to resolve import "sonner" from ".../erp-app/src/App.tsx".
```

**Wouter import is now resolved.** The build progressed past the wouter error (15 modules transformed vs 0 before) and now stops on the **next** missing dependency: `sonner`. This is a separate issue out of scope for this task.

### Files inspected
- `erp-app/src/App.tsx` line 1: `import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";`
- `erp-app/package.json` line 74: declares `wouter ^3.3.5`
- `node_modules/wouter/package.json`: confirms v3.9.0 installed
- 172 files use wouter (App.tsx, 13 route modules, 100+ pages, components/layout, command-palette, etc.)

### Next steps (separate task)
The build now needs `sonner` installed (also declared in `erp-app/package.json` line 70 as `^2.0.7`, also missing from root `node_modules`). Likely a chain of similarly missing erp-app deps that need root install. Recommended fix: `npm install --save sonner` (and check the rest of erp-app/package.json deps systematically).

### Commit status
NOT committed (per task instructions).
