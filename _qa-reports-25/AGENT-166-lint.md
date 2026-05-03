# AGENT-166 — ESLint + Prettier Audit (All Services)

**Scope:** monorepo root + 4 ERP services (`techno-kol-ops`, `onyx-procurement`, `payroll-autonomous`, `onyx-ai`) + auxiliary trees (`api-server`, `erp-app`, `mobile-app`, `lib-client`, `packages`, `dev`, `nexus_engine`, `paradigm_engine`, `vm-task-runner`).
**Date:** 2026-04-29

## Verdict: CRITICAL — No Lint or Format Layer in Live Codebase

The Palantir-grade ERP **has zero ESLint configs and zero Prettier configs in any active service**. No formatter or linter currently runs on production code paths. Every "Inconsistencies / missing rules" question below has the same root cause: **the rules don't exist anywhere**.

## 1. Configuration File Inventory

Searched for `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `.eslintignore`, `.prettierignore`, `biome.json`, embedded `eslintConfig`/`prettier` keys in `package.json`.

| Location | ESLint config | Prettier config | Husky | lint-staged |
|---|---|---|---|---|
| Repo root `/package.json` | None | None | None | None |
| `techno-kol-ops/` | None | None | None | None |
| `techno-kol-ops/client/` | None | None | None | None |
| `onyx-procurement/` | **None** (declares `eslint@^9.15.0` devDep + `lint` script — broken, no config) | None | None | None |
| `payroll-autonomous/` | None | None | None | None |
| `onyx-ai/` | None | None | None | None |
| `api-server/` | None | None | None | None |
| `erp-app/` | None | None | None | None |
| `mobile-app/` | None | None | None | None |
| `lib-client/*`, `packages/*`, `dev/`, `nexus_engine/`, `paradigm_engine/`, `vm-task-runner/` | None | None | None | None |

**Only artifact found:** `_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/.prettierrc` (parked merge incoming, NOT wired to any active service).

```json
// _merge-incoming/.prettierrc — orphaned
{ "semi": true, "singleQuote": false, "tabWidth": 2,
  "trailingComma": "all", "printWidth": 100, "bracketSpacing": true }
```

`_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/.husky/pre-commit` exists and runs `npm test --if-present` — **but no lint/format step**, and the husky hooks live in the merge incoming tree, not active.

## 2. Critical Findings

### 2.1 `onyx-procurement` — broken lint script
- `package.json` line 19: `"lint": "eslint . --ext .js"`
- `package.json` line 43: `"eslint": "^9.15.0"` in devDeps
- **No `eslint.config.js` exists.** ESLint v9 (flat config) requires one. Running `npm run lint` will fail with `ESLint couldn't find an eslint.config.(js|mjs|cjs) file`.
- Root `package.json` invokes `npm run lint --workspaces --if-present` → propagates the broken script.

### 2.2 No security rules anywhere
No service uses `eslint-plugin-security`, `eslint-plugin-no-secrets`, or any equivalent. With ~6500 source files and the system handling JWT, bcrypt, helmet, Supabase keys, payroll PII, this is a P0 gap. Examples of unguarded patterns: `eval`, `child_process` exec, unsanitized `req.body`, raw SQL string concat.

### 2.3 No `react-hooks` rules in any React surface
React 18 + hooks live in:
- `payroll-autonomous` (Vite + React 18.3.1 + react-query)
- `erp-app` (React + Radix + react-hook-form + leaflet)
- `techno-kol-ops/client` (TSX engines, large React app)
- `mobile-app` (React Native + Expo)

None install `eslint-plugin-react-hooks` or `eslint-plugin-react`. `exhaustive-deps` and `rules-of-hooks` are completely unenforced — high probability of stale-closure bugs in dashboards/360 pages.

### 2.4 No TypeScript lint rules
TypeScript projects (`techno-kol-ops`, `onyx-ai`, `erp-app`, `api-server`, `techno-kol-ops/client`) have neither `@typescript-eslint/parser` nor `@typescript-eslint/eslint-plugin`. `no-unused-vars`, `no-explicit-any`, `no-floating-promises`, `await-thenable` are unchecked. TypeScript only catches type errors via `tsc --noEmit`; lint-level concerns are silent.

### 2.5 No `no-unused-vars` enforcement
Default JS/TS code currently relies on TypeScript compiler's `noUnusedLocals` (not verified set across all `tsconfig.json`) — no ESLint backstop in plain `.js` files (e.g., the entire `onyx-procurement` Express server, written in JS).

### 2.6 No Prettier in active services
`AI-Task-Manager`, `GPS-Connect`, and `_merge-incoming` packages declare `prettier@^3.8.x` in devDeps but the live ERP services (the 4 in `CLAUDE.md`) do not. No `format` script exists in any active package. No `.prettierrc` rules to define line width, quote style, or trailing comma → inevitable formatting drift across 6500+ files.

### 2.7 No prettier-vs-eslint conflict — but only because neither exists
Standard concern (rule overlap on `quotes`, `indent`, `semi`, `comma-dangle`) is moot here. When ESLint is added, `eslint-config-prettier` MUST be appended last in `extends` to disable conflicting stylistic rules.

### 2.8 `.editorconfig` is the only baseline
Root `.editorconfig` defines: `indent_size=2`, `end_of_line=lf`, `charset=utf-8`, `trim_trailing_whitespace=true`, `insert_final_newline=true`. This is the de facto sole formatting source of truth — IDE-only, no CI enforcement.

### 2.9 Ignore files missing
No `.eslintignore` / `.prettierignore`. When tooling is added, `dist/`, `coverage/`, `_audit_tmp/`, `_master-registry/`, `_github-backups/`, `node_modules/` (already auto-ignored), generated SQL, and the 6500-file delivery bundle in `_delivery/` must be excluded or lint runs will explode.

## 3. Inconsistencies Across Services

| Concern | techno-kol-ops | onyx-procurement | payroll-autonomous | onyx-ai |
|---|---|---|---|---|
| Language | TS (server) + TS (client) | JS (CommonJS) | JS modules + JSX | TS (CommonJS) |
| Module system | ESM (server `tsx`) | CJS | `"type":"module"` | `"type":"commonjs"` |
| ESLint declared | No | **Yes (broken)** | No | No |
| Prettier declared | No | No | No | No |
| Lint script | No | Yes (broken) | No | No |
| Format script | No | No | No | No |

The four services use **four different language/module configurations** with zero shared lint baseline. Each service will accrete divergent style without a root-level config.

## 4. Recommended Fixes (priority order)

1. **P0 — Add root `eslint.config.mjs` (flat config)** at repo root: `js`, `@typescript-eslint`, `eslint-plugin-security`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-promise`, `eslint-config-prettier` (last). Cover `.js .jsx .ts .tsx` with overrides per service.
2. **P0 — Fix `onyx-procurement/package.json` lint script** OR add `onyx-procurement/eslint.config.js` so `npm run lint` actually runs.
3. **P0 — Add root `.prettierrc`** matching the orphaned `_merge-incoming` config (printWidth 100, semi, double quotes, trailing comma all). Add `format` and `format:check` scripts.
4. **P0 — Add `.eslintignore` + `.prettierignore`** for `dist/`, `coverage/`, `_audit_tmp/`, `_delivery/`, `_master-registry/`, `_github-backups/`, `_merge-incoming/`, `_merge-staging*/`, `_qa-reports*/`.
5. **P1 — Required rules:** `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: warn`, `no-unused-vars: ['error',{argsIgnorePattern:'^_'}]` (or `@typescript-eslint/no-unused-vars`), `security/detect-object-injection`, `security/detect-non-literal-fs-filename`, `no-eval`, `no-implied-eval`.
6. **P1 — Wire husky + lint-staged** at repo root: `lint-staged` runs `eslint --fix` + `prettier --write` on staged `*.{js,jsx,ts,tsx}`. Pattern already exists in `_merge-incoming` — reuse.
7. **P1 — CI gate:** add `lint` + `format:check` to `scripts/ci-checks.sh` and Vercel/Railway pipelines.
8. **P2 — TS-aware project rules:** `@typescript-eslint/no-floating-promises`, `await-thenable`, `no-misused-promises` (requires `parserOptions.project`).

## 5. Files Touched / Inspected

- `/package.json`
- `/.editorconfig`
- `/techno-kol-ops/package.json`, `/techno-kol-ops/client/package.json`
- `/onyx-procurement/package.json` (broken lint script line 19)
- `/payroll-autonomous/package.json`
- `/onyx-ai/package.json`
- `/api-server/package.json`, `/erp-app/package.json`, `/mobile-app/package.json`
- `/_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/.prettierrc` (orphan)
- `/_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/.husky/pre-commit` (parked, has tests but no lint)

## 6. Bottom Line

There is no lint or format layer to "audit for inconsistencies." There is a vacuum. Treat this report as a **gap analysis**: every rule the prompt asks about (security, react-hooks, no-unused-vars, prettier-eslint conflicts) is absent because the entire toolchain is missing. The single declared `eslint` dependency (`onyx-procurement`) is non-functional. Recommended action is build-out, not reconciliation.
