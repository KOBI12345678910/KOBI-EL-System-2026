# ERP App — Production Build Checklist

Run through this list before every production release.

---

## 1. Build configuration

| Item | Status | Notes |
|------|--------|-------|
| `sourcemap: false` in `vite.config.ts` | Confirmed | Line 147 of `vite.config.ts` |
| `manifest: true` in `vite.config.ts` | Confirmed | Line 100 — emits `.vite/manifest.json` for smoke test |
| `NODE_ENV=production` set at runtime | Required | API server and static serving depend on this |
| `BASE_PATH` matches deployment sub-path | Required | Defaults to `/` |

### sourcemap confirmation

`artifacts/erp-app/vite.config.ts` contains:

```ts
build: {
  sourcemap: false,   // ← line 147 — source maps are NOT emitted
  ...
}
```

No `.map` files are written to `dist/public/assets/`, so raw source is never
reachable from the browser.

---

## 2. Source-file exposure hardening

The Express production-static middleware in `artifacts/api-server/src/app.ts`
contains an explicit deny guard (runs only when `NODE_ENV=production`):

- Any request whose path starts with `/src/` → **HTTP 403**
- Any request whose path ends with `.tsx` → **HTTP 403**
- Any request whose path ends with `.ts` (non-declaration, non-minified) → **HTTP 403**

This is a defence-in-depth measure; the built `dist/public/` folder contains
no source files, but the guard prevents accidental exposure if middleware
ordering ever changes.

---

## 3. Smoke test — required before launch

Run the route + chunk verification script after every production build:

```bash
# Build + verify in one command (recommended for CI/release)
pnpm --filter @workspace/erp-app build:verify

# Or run separately:
# 1. Build the app
pnpm --filter @workspace/erp-app build

# 2. Run the smoke test (chunk existence check only)
pnpm --filter @workspace/erp-app verify-routes

# 3. Optional: include HTTP checks against the running server
PORT=23023 pnpm --filter @workspace/erp-app verify-routes -- --http
```

The script:
- Parses `App.tsx` and extracts all `lazyPage(() => import(...))` declarations,
  building a `ComponentName → importPath` map.
- Parses `App.tsx` to extract all `<Route path="..." component={...} />`
  declarations, building a `routePath → ComponentName` map.
- Joins the two maps and cross-references against the Vite build manifest
  (`dist/public/.vite/manifest.json`) for a deterministic `importPath → chunk`
  lookup.
- Exits **code 1** if any route's import path is absent from the manifest
  (meaning the source file was never bundled).
- With `--http`: performs HTTP GET against `/` and every `.js` file in
  `dist/public/assets/`, exiting **code 1** on any non-200 response.
- Prints a full summary to stdout.

**A clean smoke-test run (exit 0) is required before tagging a release.**

> **Note:** `vite.config.ts` must have `build.manifest: true` (already set) so
> that `dist/public/.vite/manifest.json` is emitted by each build.

---

## 4. Pre-release checklist summary

- [ ] `pnpm --filter @workspace/erp-app build` succeeds with no errors
- [ ] `verify-routes.ts` exits 0 (chunk existence check)
- [ ] `verify-routes.ts --http` exits 0 (HTTP smoke test against staging)
- [ ] No `.map` files present in `dist/public/assets/`
- [ ] Requests to `/src/*.tsx` return 403 (manual curl test)
- [ ] `NODE_ENV=production` set in deployment environment
