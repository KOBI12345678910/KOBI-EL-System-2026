# AGENT-268 — ARCH #3: Monorepo Strategy Audit

**Agent:** 268 — Architecture #3
**Scope:** pnpm workspace vs npm workspaces, `packages/*` layout, version management, build orchestration
**Verdict:** **RED — split-brain monorepo. npm workspaces at root, pnpm islands inside. Cannot install.**
**Recommendation:** Consolidate on **pnpm** (single root pnpm workspace with catalog).

---

## 1. What's actually on disk

### 1.1 Root claims to be an npm workspace

`package.json` at the worktree root declares:

```json
{
  "name": "techno-kol-uzi-erp-2026",
  "private": true,
  "workspaces": [
    "techno-kol-ops", "techno-kol-ops/client",
    "onyx-procurement", "onyx-ai", "payroll-autonomous",
    "vm-task-runner", "nexus_engine", "paradigm_engine",
    "packages/*"
  ],
  "engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }
}
```

`package-lock.json` (16,889 lines) is committed alongside. `.npmrc` sets only `legacy-peer-deps=true`, `fund=false`, `audit=false`. No `pnpm-workspace.yaml` at the root. **At the root level, the chosen tool is npm workspaces.**

### 1.2 But pnpm is everywhere underneath

Inside the same tree:

| Path | Workspace tool | Lockfile | Catalog | Notes |
|---|---|---|---|---|
| `/` (root) | **npm workspaces** | `package-lock.json` | none | declared in CLAUDE-supported docs |
| `AI-Task-Manager/` | **pnpm** | `pnpm-lock.yaml` | yes | own `pnpm-workspace.yaml`, has `preinstall` hook that **rejects npm/yarn** ("Use pnpm instead", `exit 1`) |
| `GPS-Connect/` | **pnpm** | `pnpm-lock.yaml` | yes | same `preinstall` lock-out, full overrides block |
| `packages/erp-upload/` | **pnpm** | (no lock) | yes | nested `pnpm-workspace.yaml` inside an npm workspace member — **invalid** |
| `packages/technokoluzi-erp/` | **pnpm** | (no lock) | yes | same problem; build script: `pnpm --filter @workspace/erp-app build` |
| `erp-app/` | (member of pnpm) | — | — | `name: "@workspace/erp-app"`, deps use `catalog:` and `workspace:*` |
| `api-server/` | (member of pnpm) | — | — | `name: "@workspace/api-server"`, `"@workspace/db": "workspace:*"` — npm cannot resolve this |
| `lib-client/` | (member of pnpm) | — | — | Replit-style `workspace:*` consumers |
| `onyx-procurement/`, `onyx-ai/`, `techno-kol-ops/`, `payroll-autonomous/`, `vm-task-runner/`, `nexus_engine/`, `paradigm_engine/` | npm workspace members | — | — | declared in root, all have plain `package.json` |
| `mobile-app/` | not a workspace member | — | — | listed in MONOREPO.md as "workspace" but **not** in root `workspaces[]` |

### 1.3 Lockfile census across the worktree

- `package-lock.json` files in repo: **roughly a dozen** (root + several side trees)
- `pnpm-lock.yaml` files in repo: **roughly a dozen** (AI-Task-Manager, GPS-Connect, plus many duplicates inside `_merge-incoming/`, `_merge-staging-final/`)
- `yarn.lock`: only inside `node_modules/.pnpm/` (transitive — not at our top-level)
- `lerna.json`: not used (only inside a `node_modules` test fixture)
- `turbo.json`: only in `_merge-incoming/` legacy imports, **none active**
- `nx.json`: none

---

## 2. The four hard problems this creates

### Problem 1 — `npm install` at root will fail or silently corrupt

The `workspaces[]` array includes `packages/*`, which expands to `packages/erp-upload` and `packages/technokoluzi-erp`. Both of those:
- contain a `pnpm-workspace.yaml` (npm ignores it but the file is misleading)
- declare engines `"pnpm": ">=9.0.0"` — npm has no equivalent enforcement
- list the build script `pnpm --filter @workspace/erp-app build` — **only runs under pnpm**, will fail under `npm run build --workspaces`

`packages/files-4/` is matched by `packages/*` but has no `package.json`, so npm will warn and skip it. The other eight `packages/shared-*` directories listed in `MONOREPO.md` (shared-audit, shared-events, shared-observability, shared-permissions, shared-types, shared-ui, shared-validation, shared-workflows) **have no `package.json` either** — they are loose `.js` source folders. The MONOREPO.md doc claims they are workspaces; they are not. **This is the most damaging gap.**

### Problem 2 — `workspace:*` and `catalog:` references unresolvable to npm

`api-server/package.json` and `erp-app/package.json` use:
- `"@workspace/db": "workspace:*"` — pnpm protocol, not npm.
- `"drizzle-orm": "catalog:"`, `"zod": "catalog:"`, `"@types/node": "catalog:"` — pnpm catalog, not npm.

These directories are **not** in the root `workspaces[]` (root lists `techno-kol-ops`, etc., but not `erp-app/api-server/lib-client`). They are pnpm members of a still-active pnpm workspace — except no `pnpm-workspace.yaml` exists at the worktree root. So `erp-app/`, `api-server/`, `lib-client/` are **orphan pnpm members with no parent workspace** at the current root layout.

### Problem 3 — preinstall lock-outs inside subtrees

`AI-Task-Manager/package.json` and `GPS-Connect/package.json` carry:

```sh
preinstall: "rm -f package-lock.json yarn.lock; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac"
```

If they were ever included in the root npm workspace (they are listed in `MONOREPO.md` but not in root `workspaces[]`), `npm install` would abort. Today they are silently skipped, which means **anyone running `npm install` from the root never installs the front-end app or GPS-Connect**, contradicting the docs.

### Problem 4 — version drift across the islands

Catalog comparisons between the three pnpm islands:

| Package | AI-Task-Manager | GPS-Connect | erp-upload (nested) | technokoluzi-erp (nested) |
|---|---|---|---|---|
| react | **19.1.0** (pin) | **19.1.0** (pin) | ^18.3.1 | ^18.3.1 |
| react-dom | **19.1.0** | **19.1.0** | ^18.3.1 | ^18.3.1 |
| @types/react | ^19.2.0 | ^19.1.2 | ^18.3.18 | ^18.3.18 |
| vite | ^7.3.0 | ^6.3.5 | ^6.2.0 | ^6.2.0 |
| @vitejs/plugin-react | ^5.0.4 | ^4.5.2 | ^4.3.4 | ^4.3.4 |
| tailwind-merge | ^3.3.1 | ^3.3.0 | ^2.6.0 | ^2.6.0 |
| drizzle-orm | ^0.45.1 | ^0.39.3 | ^0.39.3 | ^0.39.3 |
| @tanstack/react-query | ^5.90.21 | ^5.74.4 | ^5.64.2 | ^5.64.2 |
| @types/node | ^25.3.3 | ^22.15.18 | ^22.13.5 | ^22.13.5 |

That's **two major versions of React and three major versions of vite-plugin-react** in the same repo. Each island will resolve a different node_modules tree, doubling install size and guaranteeing typing conflicts where the islands cross-reference shared `lib/` code.

Inside the npm-workspace half, the four service packages also drift on shared deps without any catalog or override mechanism:

| Package | onyx-procurement | onyx-ai | techno-kol-ops | payroll-autonomous |
|---|---|---|---|---|
| express | ^4.21.0 | ^4.21.2 | ^4.18.2 | (vite app) |
| express-rate-limit | ^7.4.1 | ^7.0.0 | ^8.3.2 | — |
| helmet | ^8.0.0 | ^8.0.0 | ^8.1.0 | — |
| cors | ^2.8.5 | ^2.8.5 | ^2.8.6 | — |
| typescript | (none) | ^5.7.3 | ^5.3.3 | (none, vite) |
| @types/express | — | ^5.0.0 | ^4.17.21 | — |
| Module type | (commonjs default) | commonjs | (default) | **module** |
| Node engines | >=20 | >=20 | (none) | (none) |

The `@types/express` v4 vs v5 split is the kind of drift that creates subtle compile breaks when shared code starts moving between services.

---

## 3. Build & dev orchestration today

Root `package.json` orchestrates only the npm half:

```
dev → concurrently: npm:dev:ops, dev:proc, dev:ai, dev:payroll, dev:vm
build → npm run build --workspaces --if-present
```

There is no orchestration that touches `erp-app`, `api-server`, `AI-Task-Manager`, `GPS-Connect`, `mobile-app` from root. To build the front-end you must `cd AI-Task-Manager && pnpm install && pnpm build` separately. `docker-compose.yml` builds only the four backend services + `vm-task-runner` — the front-end is not in the compose graph at all.

CI/Husky: `.husky/` exists; we did not inspect it for which package manager it invokes.

---

## 4. Recommendation: consolidate on pnpm

### Why pnpm, not npm

1. **Two of the three side-island trees already mandate pnpm** via `preinstall` hooks. Those are non-trivial Replit-derived apps with hundreds of deps and locked overrides that pin native binaries away from non-target platforms. Re-doing those in npm would discard a lot of working configuration.
2. **`erp-app`, `api-server`, `lib-client` use `workspace:*` and `catalog:` protocols** that are pnpm-native. npm has no `catalog:` equivalent. Rewriting every dependency line is high-risk noise.
3. **Catalogs are the right answer to the version drift in §2.4.** A single root catalog forces React 19 / vite 7 (or whatever we pick) across every island.
4. **pnpm's `overrides` already handle the Linux-only binary pruning** present in every island — needed for the Replit/Railway target.
5. The npm root has no special features (no Lerna, no Turbo, no Changesets). Migrating its 8 members to pnpm is mechanical.

### Why not Turbo / Nx on top

Turbo or Nx solve task-graph caching, not workspace resolution. They sit on top of pnpm. They are P2 — only worth adding once the foundational consolidation is done. Add `turbo.json` later if CI build time becomes painful; it is not the current bottleneck.

---

## 5. Consolidation plan (the unification)

### Step A — single root pnpm workspace

Create at the worktree root:

**`pnpm-workspace.yaml`** (replacing the npm `workspaces[]` field):
```yaml
packages:
  - 'techno-kol-ops'
  - 'techno-kol-ops/client'
  - 'onyx-procurement'
  - 'onyx-ai'
  - 'payroll-autonomous'
  - 'vm-task-runner'
  - 'nexus_engine'
  - 'paradigm_engine'
  - 'api-server'
  - 'erp-app'
  - 'lib-client/*'
  - 'packages/shared-*'   # once they get package.json (see Step C)
  - 'mobile-app'

catalog:
  react: 19.1.0
  react-dom: 19.1.0
  '@types/react': ^19.2.0
  '@types/react-dom': ^19.2.0
  vite: ^7.3.0
  '@vitejs/plugin-react': ^5.0.4
  drizzle-orm: ^0.45.1
  '@tanstack/react-query': ^5.90.21
  zod: ^3.25.76
  tsx: ^4.21.0
  typescript: ~5.9.2
  '@types/node': ^22.15.18
  express: ^4.21.2
  express-rate-limit: ^7.5.0
  helmet: ^8.1.0
  cors: ^2.8.5

minimumReleaseAge: 1440
```

Choose **one** React major (recommend 19, matching the Replit-derived `erp-app` and `api-server`); pick a single `@types/express` major (v5).

Rewrite root `package.json`:
- delete `workspaces[]`
- replace npm scripts with `pnpm -r --parallel run dev`, `pnpm -r run build`, `pnpm -r run test`
- add `"engines": { "pnpm": ">=9.0.0" }` and a `preinstall` `only-allow pnpm` guard

Delete root `package-lock.json`.

### Step B — absorb the islands

`AI-Task-Manager/` and `GPS-Connect/` should be moved under `packages/` (or kept at root) but their internal `pnpm-workspace.yaml` files **must be deleted** — a pnpm workspace cannot nest. Their current internal `artifacts/*` and `lib/*` members get listed under the root `pnpm-workspace.yaml` instead. Rename internal package names so they don't collide with `@workspace/*` already used by `erp-app`/`api-server` (e.g. namespace as `@taskmgr/*`, `@gps/*`).

The two nested workspaces under `packages/erp-upload` and `packages/technokoluzi-erp` must be **deleted entirely** — they are duplicates of code that already exists at `erp-app/` and `api-server/` (same `@workspace/erp-app` filter target). Their presence inside `packages/*` only confuses the npm-workspace glob today.

### Step C — make `packages/shared-*` real workspaces

Each of `shared-audit`, `shared-events`, `shared-observability`, `shared-permissions`, `shared-types`, `shared-ui`, `shared-validation`, `shared-workflows` needs a `package.json`:

```json
{
  "name": "@tku/shared-audit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "exports": { ".": "./index.js" }
}
```

Then service packages (`onyx-procurement`, `techno-kol-ops`, `onyx-ai`, `vm-task-runner`) replace their loose `require('./../packages/shared-events')` style imports with `"@tku/shared-events": "workspace:*"`.

Without this step the entire P0 architecture promise of "shared libraries" in `MONOREPO.md` is fictional — they are just unrelated `.js` files in a directory.

### Step D — single dev/build runner

Replace the bespoke `concurrently` script with pnpm filters:

```json
"scripts": {
  "dev": "pnpm -r --parallel --aggregate-output run dev",
  "build": "pnpm -r run build",
  "test": "pnpm -r run test",
  "lint": "pnpm -r run lint",
  "typecheck": "pnpm -r run typecheck",
  "dev:backend": "pnpm --filter './techno-kol-ops...' --filter './onyx-*' --filter './payroll-*' --filter './vm-task-runner' --parallel run dev",
  "dev:frontend": "pnpm --filter '@workspace/erp-app' run dev"
}
```

`docker-compose.yml` build contexts can stay per-service; recommend adding a top-level `Dockerfile.builder` that runs `pnpm install --frozen-lockfile` at the worktree root and produces the per-service node_modules via `pnpm deploy --filter <svc>` for image hardening.

### Step E — version policy

- One `pnpm-lock.yaml` at the root, committed.
- All shared deps moved to `catalog:` references over the next sprint.
- Add `syncpack` or pnpm's built-in `pnpm dedupe` to CI to fail any PR that introduces a non-catalog version of a catalogued package.
- Drop the `legacy-peer-deps=true` from `.npmrc`; pnpm's `auto-install-peers=false` is already in the islands' configs and is the correct default.

---

## 6. Risks and migration order

1. **Risk: breaking the four currently-runnable backends** during the move. Mitigation: do Step A as a separate PR with no code edits except `package.json` deletions and `pnpm-workspace.yaml` creation; verify `pnpm install` plus `docker compose build` of all five backend images green before merging.
2. **Risk: pnpm's strict peer resolution surfaces broken peers that npm hid.** Mitigation: keep `auto-install-peers=false` for now and add a `.pnpmfile.cjs` only if needed.
3. **Risk: lockfile churn destroys `git blame`.** Acceptable — the existing `package-lock.json` is already 16,889 lines and will be regenerated regardless.
4. **Order:** A → B (delete nested workspaces) → C (shared-* package.json) → D (scripts) → E (catalog enforcement). Steps B and C can land together in one PR; A must land alone.

---

## 7. One-line decision

> Pick **pnpm**, write one `pnpm-workspace.yaml` at the root, delete the four conflicting child workspace files, give every `packages/shared-*` a real `package.json`, and route every script through `pnpm -r`. That removes the split-brain, fixes version drift via catalog, and is the smallest change that lets `pnpm install` at the root produce a working tree.

---

**Files referenced:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.npmrc`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\MONOREPO.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\AI-Task-Manager\pnpm-workspace.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\GPS-Connect\pnpm-workspace.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\erp-upload\pnpm-workspace.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\packages\technokoluzi-erp\pnpm-workspace.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-ai\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\techno-kol-ops\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\vm-task-runner\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\docker-compose.yml`
