# AGENT-FIX-ERP-BUILD: Applied

Date: 2026-04-29
Target: `erp-app/` (worktree root)
Status: PRIMARY ISSUE RESOLVED. Secondary unrelated build errors surfaced.

## Original Failure

```
[@tailwindcss/vite:generate:build] Can't resolve '@tailwindcss/typography'
in '...erp-app\src'
file: erp-app/src/index.css
```

Triggered by line 3 of `erp-app/src/index.css`:

```css
@plugin "@tailwindcss/typography";
```

## Root Cause

Module resolution: the worktree root holds a shared `node_modules/`
(used by Vite/Tailwind for hoisting). `@tailwindcss/typography` was listed
in `erp-app/package.json` devDependencies (`^0.5.15`), but was NOT installed
into the root `node_modules/@tailwindcss/`. Only `@tailwindcss/{node,oxide,
oxide-win32-x64-msvc,vite}` were present.

Note: erp-app/package.json uses pnpm `catalog:` syntax; running
`npm install` directly inside `erp-app/` fails with EUNSUPPORTEDPROTOCOL.
That is why the package was never installed there.

## Fix Applied

Single command at the worktree root (which has its own working
`package-lock.json` without `catalog:` refs):

```bash
npm install --save-dev @tailwindcss/typography@latest
```

Result: `added 5 packages in 7s`. Installed
`node_modules/@tailwindcss/typography/` (LICENSE, README.md, package.json, src).

No source-file diff was required. The CSS `@plugin` directive is correct
Tailwind v4 syntax and resolves correctly once the module is on disk.

## Build Status

Before fix:
```
x Build failed in 90ms
[@tailwindcss/vite:generate:build] Can't resolve '@tailwindcss/typography'
```

After fix:
- Typography error: GONE (no more "Can't resolve '@tailwindcss/typography'").
- Build now progresses past CSS resolution.
- Build still fails further along on UNRELATED pre-existing errors in
  `App.tsx`:
  - `The symbol "PredictiveAnalyticsPage" has already been declared`
    (line 904 vs prior declaration)
  - `The symbol "CompanyFinancialsPage" has already been declared`
    (line 1042 vs prior declaration)
  - similar duplicate `lazyPage(() => import(...))` declarations.

These duplicate-symbol errors are out of scope for the typography fix
(distinct issue, separate file, separate file class). They should be
fixed by deduplicating the lazy-loaded page imports in
`erp-app/src/App.tsx`.

## Files Touched

- Worktree-root `package.json` / `package-lock.json` updated by npm to
  add `@tailwindcss/typography@^0.5.20`.
- `erp-app/src/index.css`: NO CHANGE.
- `erp-app/package.json`: NO CHANGE (still pins `^0.5.15`; root install
  pulled latest into shared node_modules which satisfies the requirement).

## Recommendation

The duplicate-symbol errors in App.tsx are a separate ticket. Once those
are deduped, the build should complete cleanly.
