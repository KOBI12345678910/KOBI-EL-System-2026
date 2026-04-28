# AGENT-169 — Ignore-File Audit (`.gitignore` / `.gcloudignore` / `.replitignore`)

**Date:** 2026-04-29
**Worktree:** `.claude\worktrees\objective-merkle-40ff93`
**Scope:** Confirm sensitive paths (`node_modules`, `dist`, `.env`, `*.pem`, `*.key`, `_qa-reports-25`, `_merge-incoming`) are excluded from VCS, GCP, and Replit deploys.

## Verdict — FAIL
Critical gaps in all three ignore files. Several sensitive globs are NOT covered. Harden before next push / deploy.

## Files audited
| File | Path | Lines | Status |
|---|---|---|---|
| `.gitignore` | repo root | 44 | Partial coverage |
| `.gcloudignore` | repo root | 12 | Minimal (deploy-size only) |
| `.replitignore` | repo root | absent | MISSING |
| `.replitignore` | `AI-Task-Manager/`, `GPS-Connect/` (+14 nested under `_merge-*`) | 5 each | Only ignores `.local` |

## `git check-ignore -v` results
| Path | Result | Rule |
|---|---|---|
| `node_modules/foo.js` | IGNORED | `.gitignore:10:node_modules/` |
| `.env`, `.env.local`, `onyx-procurement/.env` | IGNORED | `.gitignore:13-14` |
| `.env.production`, `.env.staging`, `onyx-procurement/.env.production` | **NOT IGNORED** | gap |
| `dist/index.js`, `onyx-procurement/dist/x.js`, `build/x`, `coverage/x` | **NOT IGNORED** | gap |
| `server.pem`, `tls.pem`, `secrets/api.pem` | **NOT IGNORED** | gap |
| `server.key`, `client.key`, `private.key` | **NOT IGNORED** | gap |
| `id_rsa`, `id_ed25519`, `*.p12`, `*.pfx` | **NOT IGNORED** | gap |
| `credentials.json`, `service-account.json`, `google-credentials.json` | **NOT IGNORED** | gap |
| `_qa-reports-25/`, `_merge-incoming/` | **NOT IGNORED** (untracked, status `??`) | gap |
| `.DS_Store`, `Thumbs.db`, `.vscode/`, `.claude/` | IGNORED | OK |

## `.gcloudignore` analysis
Contents: `.git` `.gitignore` `node_modules/` (+ per-service variants) `*/client/` `techno-kol-ops/client/` `*.md` `.env*`.
Covers: `node_modules`, `.env*` (good), `*.md` (intentional).
**Missing:** `dist/`, `build/`, `coverage/`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `_qa-reports-25/`, `_merge-incoming/`, `_merge-staging-final/`, `_audit_tmp/`, `_delivery/`, `_github-backups/`, `_master-registry/`, `dev/`, `*.zip`, `*.log`, `credentials*.json`, `service-account*.json`.
Effect: `gcloud app deploy` / `gcloud builds submit` would upload audit dumps, merge dumps, and any keypair in the tree.

## `.replitignore` analysis
- **No root `.replitignore`** — Replit deploys ship the full worktree.
- The in-scope per-app files only contain `.local` (pnpm store).
- 14 nested copies under `_merge-incoming/**` and `_merge-staging-final/**` are inside dumps, not authoritative.
- Effect: a Replit deploy from any sub-app ships `node_modules`, `.env*`, secrets, and ignored audit dirs.

## Required fixes

### `.gitignore` — append:
```
# Build artifacts
dist/
build/
coverage/
*/dist/
*/build/

# All env variants
.env*
!.env.example

# Secrets / keys
*.pem
*.key
*.p12
*.pfx
id_rsa
id_rsa.pub
id_ed25519
id_ed25519.pub
credentials*.json
service-account*.json
google-credentials*.json

# Audit / merge dumps (never commit)
_qa-reports-25/
_qa-reports/
_merge-incoming/
_merge-staging/
_merge-staging-final/
_audit_tmp/
_audit-clones/
_delivery/
_github-backups/
_master-registry/
_external-backups/
dev/
*.zip
*.tar.gz
*.log
```

### `.gcloudignore` — append (mirror of above, minus `.env*`/`node_modules/` already there):
```
dist/
build/
coverage/
*.pem
*.key
*.p12
*.pfx
id_rsa*
id_ed25519*
credentials*.json
service-account*.json
_qa-reports-25/
_qa-reports/
_merge-incoming/
_merge-staging/
_merge-staging-final/
_audit_tmp/
_audit-clones/
_delivery/
_github-backups/
_master-registry/
_external-backups/
dev/
*.zip
*.log
```

### Create root `.replitignore`
Same body as the `.gcloudignore` additions plus `node_modules/`, `.git/`, `.env*`.

## Tracked-file scan (recommended follow-up)
Confirm nothing sensitive is already committed:
```
git ls-files | grep -E '\.(pem|key|p12|pfx)$|^\.env\.|credentials.*\.json|service-account.*\.json'
```

## Current at-risk untracked dirs
`git status --short`:
```
?? _merge-incoming/
?? _qa-reports-25/
?? dev/
```
All three at risk of `git add -A` / `git add .` capture. Fix `.gitignore` before next stage.
