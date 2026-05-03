# AGENT-05 — Terminal Runtime Audit: AI-Task-Manager

**Agent:** 05
**Date:** 2026-04-29
**Scope:** `AI-Task-Manager/` pnpm workspace (artifacts/* + lib/* + lib/integrations/* + scripts)
**Mode:** Static audit only — no install / no run. `pnpm install` is currently in progress in background; `node_modules/` is partial (only `.pnpm/` directory present).
**Rule of engagement:** read-only. Findings are recorded; nothing is changed.

---

## 0. Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Workspace topology | OK | 5 artifacts + 7 libs + 1 stub-lib + scripts |
| `workspace:*` deps resolve | OK (logical) | All `@workspace/*` consumers point to existing packages with `src/` present |
| Catalog (`pnpm-workspace.yaml`) | OK + 1 drift | `erp-mobile` deviates from catalog on `@types/react`, `@types/react-dom` |
| `minimumReleaseAge: 1440` | NOTED | Will block any package version published in the last 24h (1440 min). Slows install of just-released patches. |
| React 19 + plugins | OK | All in-tree React deps pinned to 19.1.0 via override; Vite + `@vitejs/plugin-react` versions are React-19-compatible. |
| Vite configs | 2 issues found | Stale lock with disabled `react-compiler`; potential `top-level-await` requirement on older runtimes. |
| Duplicate package name | **ISSUE** | `@workspace/integrations-anthropic-ai` is declared in **two** workspace folders. pnpm will fail or non-deterministically pick one. |
| `@anthropic-ai/sdk` skew | NOTED | `kobi-agent` pins `^0.30.0`, `lib/integrations-anthropic-ai` pins `^0.78.0`. |
| `express` major skew | NOTED | `api-server` on Express 5, `kobi-agent` on Express 4. |

No fatal install blocker discovered statically other than the duplicate package name. The workspace will probably install once pnpm resolves the duplicate (most likely by erroring, or by silently using whichever appears first in the discovery order).

---

## 1. Workspace topology

### 1.1 `pnpm-workspace.yaml` — globs

```yaml
packages:
  - artifacts/*
  - lib/*
  - lib/integrations/*
  - scripts
```

Resolved package set (each has its own `package.json`):

| Path | Name | Role | Runtime |
|------|------|------|---------|
| `artifacts/api-server` | `@workspace/api-server` | Express 5 + Drizzle backend | Node 20+, `tsx` dev, esbuild build via `build.ts` |
| `artifacts/erp-app` | `@workspace/erp-app` | Web ERP UI | Vite 7 + React 19 + Tailwind v4 + PWA |
| `artifacts/erp-mobile` | `@workspace/erp-mobile` | Native + web shell | Expo SDK 54, React Native 0.81, RN-Web 0.21 |
| `artifacts/kobi-agent` | `@workspace/kobi-agent` | Standalone agent runner | Node, `tsx`, Express 4, Anthropic SDK |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | Vite preview/sandbox | Vite 7 + React 19 + Tailwind v4 |
| `lib/api-client-react` | `@workspace/api-client-react` | Generated React-Query client | TS-only, `react>=18` peer |
| `lib/api-spec` | `@workspace/api-spec` | OpenAPI codegen (orval) | `orval` build only |
| `lib/api-zod` | `@workspace/api-zod` | Generated zod schemas | TS-only, `zod` (catalog) |
| `lib/db` | `@workspace/db` | Drizzle ORM + schema | TS-only, exports `./schema` |
| `lib/integrations-anthropic-ai` | `@workspace/integrations-anthropic-ai` (A) | Anthropic SDK wrapper | `@anthropic-ai/sdk@^0.78.0` |
| `lib/integrations-gemini-ai` | `@workspace/integrations-gemini-ai` | Gemini wrapper | `@google/genai@^1.44.0` |
| `lib/integrations-openai-ai-react` | `@workspace/integrations-openai-ai-react` | OpenAI client (browser) | TS-only, `react>=18` peer |
| `lib/integrations-openai-ai-server` | `@workspace/integrations-openai-ai-server` | OpenAI client (server) | `openai@^6.27.0` |
| `lib/object-storage-web` | `@workspace/object-storage-web` | Uppy uploader | TS-only, `@uppy/*@^5` |
| `lib/integrations/anthropic-ai` | `@workspace/integrations-anthropic-ai` (B) | **Empty stub** (`export {};`) | n/a |
| `scripts` | `@workspace/scripts` | tsx scripts | dev only |

### 1.2 Critical finding — duplicate package name

There is **one logical package name (`@workspace/integrations-anthropic-ai`) declared in two folders**:

- `lib/integrations-anthropic-ai/package.json` — full implementation, depends on `@anthropic-ai/sdk@^0.78.0`, exports `.` and `./batch`. `src/index.ts` exists with real client.
- `lib/integrations/anthropic-ai/package.json` — minimal stub (`{"name":"@workspace/integrations-anthropic-ai","main":"src/index.ts"}`), `src/index.ts` is just `export {};`.

Both folders are matched by the workspace globs (`lib/*` matches the first; `lib/integrations/*` matches the second). pnpm v9+ refuses to register two workspace packages with the same `name`; expected error during install:

```
ERR_PNPM_DUPLICATE_PACKAGE_NAME
Two workspace packages have the same name "@workspace/integrations-anthropic-ai":
  lib/integrations-anthropic-ai
  lib/integrations/anthropic-ai
```

If pnpm install is currently still running, it may either:
- have already produced this error (check the install log), or
- be quietly resolving to one of the two (older pnpm versions did this), in which case `api-server`'s `@workspace/integrations-anthropic-ai` import may resolve to the empty stub at runtime.

**Recommendation (do not act):** delete or rename one of the two. Since the stub at `lib/integrations/anthropic-ai/` is `export {};`, it is the one to retire. Alternatively narrow the `pnpm-workspace.yaml` glob to drop `lib/integrations/*`, since the only entry under it is the duplicate.

---

## 2. Cross-package imports — verification

All `workspace:*` consumers and their declared dependency targets:

| Consumer | Declares | Target package | Target src present | Status |
|----------|----------|----------------|--------------------|--------|
| `api-server` | `@workspace/api-zod` | `lib/api-zod` | `src/index.ts`, `src/generated/` | OK |
| `api-server` | `@workspace/db` | `lib/db` | `src/index.ts`, `src/schema/` | OK |
| `api-server` | `@workspace/integrations-anthropic-ai` | **two candidates** | both `src/index.ts` exist | AMBIGUOUS — see §1.2 |
| `api-server` | `@workspace/integrations-gemini-ai` | `lib/integrations-gemini-ai` | `src/index.ts`, `src/batch/`, `src/image/` | OK |
| `api-server` | `@workspace/integrations-openai-ai-server` | `lib/integrations-openai-ai-server` | `src/index.ts`, `src/batch/`, `src/image/`, `src/audio/` | OK |
| `erp-app` | `@workspace/api-client-react` | `lib/api-client-react` | `src/index.ts`, `src/custom-fetch.ts`, `src/generated/` | OK |
| `erp-app` | `@workspace/object-storage-web` | `lib/object-storage-web` | `src/index.ts`, `src/ObjectUploader.tsx`, `src/use-upload.ts` | OK |
| `erp-mobile` | `@workspace/api-client-react` | same as above | OK | OK |
| `kobi-agent` | `@workspace/db` | `lib/db` | OK | OK |

Note: `lib/integrations-openai-ai-react` exists but is **not consumed** by any artifact — orphan workspace package (not necessarily wrong; may be reserved for future use).

### 2.1 TypeScript project-references parity

Root `tsconfig.json` references all 7 implementation libs (api-client-react, api-zod, db, integrations-anthropic-ai, integrations-openai-ai-server, integrations-gemini-ai, object-storage-web). It does **not** reference `lib/integrations/anthropic-ai/` (no tsconfig there anyway), and does **not** reference `lib/integrations-openai-ai-react/`. Consistent with consumer set.

`artifacts/erp-app/tsconfig.json` references `lib/api-client-react` + `lib/object-storage-web` — matches its `workspace:*` deps.
`artifacts/api-server/tsconfig.json` references `db`, `api-zod`, `integrations-anthropic-ai`, `integrations-openai-ai-server`, `integrations-gemini-ai` — matches.

---

## 3. Catalog audit

Catalog declared in `pnpm-workspace.yaml` (28 entries). Cross-checked every `"catalog:"` reference (54 total, 10 files).

### 3.1 Drift (consumer pins instead of catalog)

| Package consumer | Dep | Consumer pin | Catalog | Comment |
|------------------|-----|--------------|---------|---------|
| `erp-mobile` | `@types/react` | `~19.1.10` | `^19.2.0` | Skew. Expo SDK 54 ships its own `@types/react` floor; this is intentional but risks two `@types/react` versions in node_modules. |
| `erp-mobile` | `@types/react-dom` | `~19.1.7` | `^19.2.0` | Same. |
| `erp-mobile` | `typescript` | `~5.9.2` | (root pin `~5.9.2`) | Matches root, OK. |
| `kobi-agent` | `@types/node` | `^20.11.0` | `^25.3.3` | Pinned to Node 20 typings; intentional? Its own `package.json` doesn't lock a Node engine, but its scripts use `node` directly. |
| `kobi-agent` | `typescript` | `^5.3.3` | `~5.9.2` (root) | Lower bound — should satisfy. |
| `erp-mobile` | `react`, `react-dom` | `catalog:` | `19.1.0` | OK — pinned through catalog AND root `pnpm.overrides`. |

The root `package.json` `pnpm.overrides` block forces:
```
"react": "19.1.0",
"react-dom": "19.1.0"
```
This wins over any catalog deviation, so React itself is uniform across the tree at 19.1.0.

### 3.2 Catalog declarations not used

`@types/node`, `@types/react`, `@types/react-dom`, `tsx`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `@tanstack/react-query`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`, `react`, `react-dom`, `class-variance-authority`, `clsx`, `drizzle-orm`, `framer-motion`, `lucide-react`, `tailwind-merge`, `zod` — all consumed somewhere. No dead catalog entries.

---

## 4. `minimumReleaseAge: 1440`

This is a 24-hour quarantine on newly published versions. Effects:

- `pnpm install` will refuse to resolve a version published less than 1440 min ago.
- For a long-lived lockfile this is invisible (lockfile already pins versions).
- For fresh installs after `pnpm-lock.yaml` is regenerated, any "just released" patch (e.g. an Expo nightly, a Sentry release) will be rejected and pnpm will fall back to the next-newest.
- This **does not** affect the install currently in flight beyond enforcing the rule for any unlocked range that resolves to a version <24h old.

The lockfile present (`pnpm-lock.yaml`, 801 KB, dated 2026-04-29) was generated under the same `minimumReleaseAge` setting per the `.npmrc`/`pnpm-workspace.yaml` combo, so today's install will respect already-frozen versions.

### Risk
The 1440-min window can intermittently break CI on the day a new patch ships, e.g. a fresh `@expo/cli` or `vite` patch. Manageable, but worth knowing if a build fails with "no version available within minimumReleaseAge".

---

## 5. React 19 plugin compatibility

`react@19.1.0` + `react-dom@19.1.0` are forced via `pnpm.overrides`. Plugins consumed across the workspace:

| Plugin | Version | React 19 status |
|--------|---------|-----------------|
| `@vitejs/plugin-react` | catalog `^5.0.4` | OK (5.x added React 19 + react-compiler hook) |
| `@tailwindcss/vite` | catalog `^4.1.14` | OK (Tailwind v4 is React-agnostic) |
| `@replit/vite-plugin-cartographer` | catalog `^0.5.0` | OK (no React surface) |
| `@replit/vite-plugin-dev-banner` | `^0.1.1` | OK |
| `@replit/vite-plugin-runtime-error-modal` | `^0.0.6` | OK |
| `vite-plugin-pwa` | `^1.2.0` (erp-app only) | OK |
| `framer-motion` | catalog `12.35.1` | OK (12.x supports React 19) |
| `react-hook-form` | `^7.71.2` (erp-app), `^7.66.0` (mockup) | OK |
| `@hookform/resolvers` | `^3.10.0` | OK on RHF 7 + zod 3 |
| `@tanstack/react-query` | catalog `^5.90.21` | OK (v5 supports React 19) |
| `wouter` | `^3.3.5` | OK |
| `recharts` | `^2.15.4` | OK; `recharts@2.x` works on React 19 |
| `@uppy/react` | `^5.2.0` (erp-app), `^5.0.0` (lib/object-storage-web) | OK |
| `@xyflow/react` | `^12.10.2` | OK (12.x React-19-ready) |
| `react-leaflet` | `^5.0.0` | OK |
| `react-day-picker` | `^9.11.1` | OK |
| `next-themes` | `^0.4.6` | OK |
| `react-native-web` | `^0.21.0` (erp-mobile) | OK on React 19 |
| `babel-plugin-react-compiler` | `^19.0.0-beta-e993439-20250117` (erp-mobile) | Pinned to a specific 2025-01 beta — known unstable identifier; see §6.2 |

No plugin in the tree is known to be incompatible with React 19. Risks below are about how they're wired, not whether they exist.

---

## 6. Vite config inspection

### 6.1 `artifacts/erp-app/vite.config.ts` (337 lines)

**Strong points:**
- Strict `fs` allowlist that explicitly opens the two workspace lib paths (`api-client-react/src`, `object-storage-web/src`). Good — without this, Vite 7's `fs.strict: true` would refuse to serve TS sources from sibling workspace packages.
- React/react-dom de-duplication via `resolve.alias` and `resolve.dedupe`. Important on a pnpm tree where multiple `react` copies are easy to end up with.
- Manual chunks for vendor / radix / leaflet / xlsx / jspdf / exceljs / monaco / xyflow / uppy. Explicit, will produce predictable bundle.

**Findings:**
- **F-1 (medium): top-level await** — the cartographer/dev-banner plugins are loaded with `await import(...)` at the top of `defineConfig`'s `plugins` array (lines 104–112). Vite 7 supports TLA in config files, but this requires Node 20.6+ (or the loader config recognizes ESM TLA). On older Node versions the config will fail to parse. The api-server runs on Node, version not pinned via `engines`. Worth noting; not necessarily wrong if all environments are Node 20+.
- **F-2 (low): `attached_assets` path assumption** — `@assets` alias points to `path.resolve(import.meta.dirname, "..", "..", "attached_assets")`, i.e. `AI-Task-Manager/attached_assets/`. The directory exists at the worktree root one level up (`./attached_assets/`), not under `AI-Task-Manager/`. From `artifacts/erp-app`, two levels up resolves to `AI-Task-Manager/`, not the worktree root. There is **no `AI-Task-Manager/attached_assets` folder** in the listing. Imports from `@assets/...` will 404 at dev and break at build.
- **F-3 (low): `manualChunks` includes packages not listed in deps** — fine to over-list, but `@monaco-editor/react`, `@xyflow/react`, etc., do exist in deps. `lucide-react` is both in `manualChunks` and `optimizeDeps.include`. No bug, just verbose.

### 6.2 `artifacts/mockup-sandbox/vite.config.ts` (72 lines)

**Findings:**
- **F-4 (medium): mandatory env vars in config** — both `PORT` and `BASE_PATH` are required, with `throw new Error` if missing. Any plain `pnpm --filter @workspace/mockup-sandbox dev` without exported env will instantly fail. Compare to `erp-app` which falls back to `"23023"` and `"/"`. Likely intentional for Replit, but local dev will trip on it.
- **F-5 (low): `mockupPreviewPlugin` import** — config imports `./mockupPreviewPlugin` (relative). Not yet verified, but if that file is missing the config errors at startup. Did not open it; flagged for the runtime task.
- **F-6 (low): no react/react-dom dedupe** — unlike `erp-app`, no `resolve.dedupe`. In a pnpm workspace this can yield two react copies if a transitive dep brings its own. Less critical for a sandbox, but inconsistent with `erp-app`.

### 6.3 `babel-plugin-react-compiler` in `erp-mobile`

The pinned identifier `^19.0.0-beta-e993439-20250117` is from January 2025. With `minimumReleaseAge: 1440` this is fine (it's older than 24h). However, react-compiler beta packages frequently cycle their identifier; if any other package transitively requires a different beta hash, npm/pnpm may emit a peer warning. Not seen statically.

---

## 7. Runtime/version skew highlights

| Issue | Files | Risk |
|-------|-------|------|
| `@anthropic-ai/sdk` major skew (`0.30.0` vs `0.78.0`) | `kobi-agent` vs `lib/integrations-anthropic-ai` | If `kobi-agent` ever consumes the lib version, two SDK copies in the tree. Currently it does not import it (only its own SDK pin). |
| Express major skew (4 vs 5) | `kobi-agent` vs `api-server` | Independent processes; OK, just keep mental note when sharing middleware. |
| `@types/node` skew (`^20.11.0` vs catalog `^25.3.3`) | `kobi-agent` vs everyone else | hoisting will keep both — not a runtime risk, just a typecheck divergence for kobi-agent. |
| `@types/react` skew | `erp-mobile` vs catalog | See §3.1 |
| `lib/object-storage-web` `@uppy/*@^5.0.0` vs `erp-app` `@uppy/*@^5.1.x/^5.2.x` | both | Same major; pnpm will hoist the highest. Safe. |
| `drizzle-zod@^0.8.3` peer | `lib/db` | Requires drizzle-orm in a specific minor range. Catalog has `drizzle-orm@^0.45.1`. drizzle-zod 0.8.x peers `drizzle-orm@>=0.36`. OK. |

---

## 8. Things explicitly OK

- `auto-install-peers=false` in `.npmrc` and `autoInstallPeers: false` in `pnpm-workspace.yaml` — consistent.
- `strict-peer-dependencies=false` — will swallow any peer-mismatch warnings during install. Generally safe for a pnpm workspace; the tradeoff is we lose those warnings in the log.
- `onlyBuiltDependencies` allowlist (`@swc/core`, `cpu-features`, `esbuild`, `msw`, `ssh2`, `unrs-resolver`) — postinstall scripts are gated. Anything else attempting a build script will be skipped, which is the safe default.
- Massive native-binary `'-'` overrides for tailwindcss/oxide, lightningcss, rollup, esbuild, ngrok — these strip arch-specific subpackages the project does not need (Replit/x64-linux only). Saves install time and lockfile size.
- `path-to-regexp`, `picomatch`, `serialize-javascript`, `node-forge` overrides — security pin for known-CVE versions. Good practice.
- Root `preinstall` script blocks accidental npm/yarn invocations and removes stray lockfiles. Solid guardrail.

---

## 9. Recommendations (advisory, no edits made)

| # | Severity | Action |
|---|----------|--------|
| R1 | High | Resolve duplicate `@workspace/integrations-anthropic-ai` (delete or rename `lib/integrations/anthropic-ai/` stub, OR remove `lib/integrations/*` from the workspace globs). |
| R2 | Medium | Confirm `attached_assets` location — either move it to `AI-Task-Manager/attached_assets/` or fix the `@assets` alias in `erp-app/vite.config.ts` to point at the worktree root. |
| R3 | Medium | Either default `PORT`/`BASE_PATH` in `mockup-sandbox/vite.config.ts` (matching `erp-app`'s fallback) or document the requirement in the run book. |
| R4 | Low | Align `erp-mobile` `@types/react` / `@types/react-dom` to the catalog (or add catalog entries pinned to Expo's required range) to remove the version drift. |
| R5 | Low | Bring `kobi-agent` `@types/node` and `@anthropic-ai/sdk` onto catalog or document why they need to lag. |
| R6 | Low | Add `engines.node` to root + each artifact (current TLA usage in `erp-app/vite.config.ts` requires Node 20.6+). |
| R7 | Info | Once `pnpm install` finishes, re-check `pnpm-lock.yaml` diff for unintended version bumps caused by `minimumReleaseAge` quarantining a patch. |

---

## 10. Files inspected

- `AI-Task-Manager/pnpm-workspace.yaml`
- `AI-Task-Manager/package.json`
- `AI-Task-Manager/.npmrc`
- `AI-Task-Manager/tsconfig.json`, `AI-Task-Manager/tsconfig.base.json`
- `AI-Task-Manager/artifacts/api-server/{package.json,tsconfig.json,src/index.ts}`
- `AI-Task-Manager/artifacts/erp-app/{package.json,tsconfig.json,vite.config.ts}`
- `AI-Task-Manager/artifacts/erp-mobile/package.json`
- `AI-Task-Manager/artifacts/kobi-agent/package.json`
- `AI-Task-Manager/artifacts/mockup-sandbox/{package.json,vite.config.ts}`
- `AI-Task-Manager/scripts/package.json`
- `AI-Task-Manager/lib/api-client-react/package.json` + `src/`
- `AI-Task-Manager/lib/api-spec/package.json`
- `AI-Task-Manager/lib/api-zod/package.json` + `src/`
- `AI-Task-Manager/lib/db/package.json` + `src/`
- `AI-Task-Manager/lib/integrations-anthropic-ai/package.json` + `src/`
- `AI-Task-Manager/lib/integrations-gemini-ai/package.json` + `src/`
- `AI-Task-Manager/lib/integrations-openai-ai-react/package.json`
- `AI-Task-Manager/lib/integrations-openai-ai-server/package.json` + `src/`
- `AI-Task-Manager/lib/object-storage-web/package.json` + `src/`
- `AI-Task-Manager/lib/integrations/anthropic-ai/package.json` + `src/index.ts` (stub, duplicate name)

Static audit complete. No installs executed. No files modified.
