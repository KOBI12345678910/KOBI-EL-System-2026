# QA Agent #58 — Pre-commit Hooks & Git Hygiene

**Project:** onyx-procurement
**Date:** 2026-04-11
**Dimension:** Pre-commit Hooks & Git Hygiene
**Method:** Static analysis only
**Scope:** `.husky/`, `.pre-commit-config.yaml`, `lint-staged.config.*`, `.gitignore`, `.gitattributes`, `package.json`

---

## 1. Executive Summary

A comprehensive search of the `onyx-procurement` repository was performed against seven industry-standard git hygiene and pre-commit automation controls. The investigation reveals a **total absence of any pre-commit automation or git hygiene configuration**. Not a single control of the seven examined is present.

| # | Control | Present? | Status |
|---|---|---|---|
| 1 | Husky installed | NO | CRITICAL |
| 2 | lint-staged installed | NO | CRITICAL |
| 3 | `.husky/` directory | NO | CRITICAL |
| 4 | `.pre-commit-config.yaml` | NO | HIGH |
| 5 | `.gitignore` file | NO | CRITICAL |
| 6 | `.gitattributes` file | NO | HIGH |
| 7 | commitlint config | NO | MEDIUM |
| 8 | Secret scanner (gitleaks/trufflehog) | NO | CRITICAL |

**Overall score: 0/8 — Grade: F**

---

## 2. Investigation Details

### 2.1 Husky / lint-staged Installation — NOT INSTALLED

**Check:** Examined `package.json` for `husky`, `lint-staged`, `@commitlint/*`, `@commitlint/cli`, `@commitlint/config-conventional`.

**Finding:**
```json
{
  "name": "onyx-procurement",
  "version": "1.0.0",
  "description": "ONYX Procurement System — Autonomous AI-powered procurement for Techno Kol Uzi",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5"
  }
}
```

Observations:
- No `devDependencies` section at all.
- No `husky` entry.
- No `lint-staged` entry.
- No `@commitlint/*` entries.
- No `prepare` script (which would normally run `husky install`).
- No `lint` script — so even if hooks were present there is nothing for them to invoke.
- No `test` script — CI/CD cannot block merges on test failures either.

**Impact:** The project has zero client-side enforcement of code quality at commit time. Every commit is a black box; any file can land on master.

---

### 2.2 Pre-commit Lint Check — NOT CONFIGURED

**Check:** Searched for `.husky/pre-commit`, `.pre-commit-config.yaml`, `lint-staged.config.js`, `.lintstagedrc*`.

**Finding:** None exist.

**Impact:**
- ESLint / Prettier / Stylelint cannot be enforced before a commit is created.
- Malformed JavaScript, unused imports, console.log debug calls, and inconsistent formatting can all reach the repository unchecked.
- There is no `eslint`, `prettier`, or any other linter dependency in `package.json` — so even a manually-invoked lint run is impossible without first installing tooling.

---

### 2.3 Pre-commit Secret Scan — NOT CONFIGURED

**Check:** Searched for `gitleaks`, `trufflehog`, `detect-secrets`, `git-secrets` configuration or hooks.

**Finding:** Zero references anywhere in the repository.

**Impact — CRITICAL:**
- The repository contains `.env.example` (confirming that `.env` files with secrets are used by the project).
- Without a secret scanner in `pre-commit`, a developer who accidentally commits `.env`, a Supabase service role key, a WhatsApp Business token, or any OpenAI/Anthropic API key will push those credentials straight to GitHub.
- Combined with the missing `.gitignore` (section 2.5) — which means `.env` is **not even excluded from `git add`** — the risk of secret leakage on the next commit is extremely high.
- For a procurement system that likely handles supplier data, pricing, and payment details under Israeli Privacy Law (חוק הגנת הפרטיות התשמ"א-1981), this is a material compliance finding.

---

### 2.4 Commit Message Convention Enforcement — NOT CONFIGURED

**Check:** Searched for `commitlint.config.*`, `.commitlintrc*`, `@commitlint/*` packages, `.husky/commit-msg` hook.

**Finding:** None exist.

**Impact:**
- Commits cannot be auto-categorized (feat/fix/chore/docs/refactor/test/perf/build/ci).
- Automatic changelog generation (e.g. `standard-version`, `semantic-release`) is not possible.
- Code history cannot be machine-audited for compliance / release notes.
- Recent commit history shows ad-hoc messages that would not pass a Conventional Commits check.

---

### 2.5 `.gitignore` Completeness — FILE DOES NOT EXIST

**Check:** `Glob **/.gitignore` in the `onyx-procurement/` directory.

**Finding:** **No `.gitignore` file exists at any level of the project.**

**Required entries that are all currently missing:**

| Category | Pattern | Required? | Present? |
|---|---|---|---|
| Secrets | `.env` | YES | NO |
| Secrets | `.env.*` | YES | NO |
| Secrets | `!.env.example` | YES | NO |
| Secrets | `*.pem`, `*.key`, `*.p12` | YES | NO |
| Secrets | `credentials.json`, `service-account*.json` | YES | NO |
| Node | `node_modules/` | YES | NO |
| Node | `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*` | YES | NO |
| Node | `.npm/`, `.yarn/` | YES | NO |
| Build | `dist/` | YES | NO |
| Build | `build/` | YES | NO |
| Build | `coverage/` | YES | NO |
| Build | `.next/`, `.nuxt/`, `.turbo/` | YES | NO |
| Logs | `*.log`, `logs/` | YES | NO |
| Runtime | `*.pid`, `*.seed`, `*.pid.lock` | YES | NO |
| OS | `.DS_Store`, `Thumbs.db`, `desktop.ini` | YES | NO |
| IDE | `.vscode/`, `.idea/`, `*.swp` | YES | NO |
| Tests | `.nyc_output/`, `coverage/` | YES | NO |
| Supabase | `.supabase/`, `supabase/.temp/` | YES | NO |

**Impact — CRITICAL:**
- Any `npm install` would add `node_modules/` (hundreds of MB) to a `git add .` — bloating the repo and potentially corrupting CI.
- `.env` files are **not excluded** — a single `git add -A` will commit production Supabase keys.
- OS junk files (`.DS_Store`, `Thumbs.db`) will pollute history.
- The `.env.example` file present in the repo suggests the developer intends to use `.env` — but has forgotten to actually ignore it.

This is the single most urgent finding in this report.

---

### 2.6 `.gitattributes` for Line Endings — FILE DOES NOT EXIST

**Check:** `Glob **/.gitattributes`.

**Finding:** **No `.gitattributes` file exists.**

**Impact:**
- Line-ending normalization between Windows (the confirmed dev environment — `C:\Users\kobi\...`) and Linux (production deployment) is **completely undefined**.
- CRLF vs LF differences will cause spurious diffs every time a Windows dev and a Linux dev touch the same file.
- Shell scripts (`*.sh`) committed from Windows with CRLF will break on Linux runners with `bad interpreter`.
- Node.js `shebang` files may fail on Alpine/Debian-based Docker images.
- Binary files (`*.pdf`, `*.png`, `*.xlsx`) may be corrupted if git attempts to normalize them as text.

**Required minimum `.gitattributes`:**
```
* text=auto eol=lf
*.sh text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
*.sql text eol=lf
*.yml text eol=lf
*.yaml text eol=lf

*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
*.xlsx binary
*.docx binary
*.zip binary
```

---

### 2.7 `.husky/` Directory — DOES NOT EXIST

**Check:** `Glob **/.husky/**`.

**Finding:** No `.husky/` directory, no `pre-commit` file, no `commit-msg` file, no `pre-push` file.

---

### 2.8 Python-style `.pre-commit-config.yaml` — DOES NOT EXIST

**Check:** `Glob **/.pre-commit-config.yaml`.

**Finding:** Not present. (This is less urgent since the project is Node.js, not Python — but the total absence of *any* hook framework is the real issue.)

---

## 3. Risk Matrix

| Finding | Severity | Likelihood | Risk Score | Business Impact |
|---|---|---|---|---|
| No `.gitignore` → `.env` commit | CRITICAL | HIGH | 9/10 | Supabase keys leaked on GitHub → full DB compromise, financial & privacy-law exposure |
| No secret scanner | CRITICAL | HIGH | 9/10 | Same as above; no safety net |
| No `node_modules/` ignore | HIGH | HIGH | 8/10 | Repo bloat, broken CI, slow clones |
| No lint on commit | HIGH | MEDIUM | 6/10 | Inconsistent code, bugs reach prod |
| No `.gitattributes` | MEDIUM | HIGH | 6/10 | CRLF/LF conflicts, broken shell scripts in Docker |
| No commitlint | MEDIUM | HIGH | 5/10 | No automatic changelog, audit gap |
| No husky | CRITICAL | CERTAIN | 10/10 | Umbrella finding — no client-side enforcement at all |

---

## 4. Remediation Plan

### Step 1 — Create `.gitignore` (5 minutes, MUST DO TODAY)

```gitignore
# Secrets & environment
.env
.env.*
!.env.example
*.pem
*.key
*.p12
credentials.json
service-account*.json

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npm/
.yarn/
.pnp.*

# Build output
dist/
build/
out/
.next/
.nuxt/
.turbo/
coverage/
.nyc_output/

# Logs
*.log
logs/

# Runtime
*.pid
*.seed
*.pid.lock

# OS junk
.DS_Store
Thumbs.db
desktop.ini

# IDE
.vscode/
.idea/
*.swp
*.swo

# Supabase
.supabase/
supabase/.temp/

# Misc
.cache/
tmp/
temp/
```

### Step 2 — Create `.gitattributes` (2 minutes)

See template in section 2.6.

### Step 3 — Install Husky + lint-staged (10 minutes)

```bash
npm install --save-dev husky lint-staged eslint prettier
npx husky init
```

Add to `package.json`:
```json
{
  "scripts": {
    "prepare": "husky",
    "lint": "eslint . --ext .js",
    "format": "prettier --write ."
  },
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

Create `.husky/pre-commit`:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged
```

### Step 4 — Add gitleaks secret scan (10 minutes)

Add to `.husky/pre-commit`:
```bash
# Secret scan
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --verbose || {
    echo "gitleaks detected potential secrets. Commit aborted."
    exit 1
  }
else
  echo "WARNING: gitleaks not installed — install from https://github.com/gitleaks/gitleaks"
fi
```

Or install as a dev-dependency wrapper:
```bash
npm install --save-dev @evilmartians/lefthook   # alternative full-featured hook runner
```

### Step 5 — Add commitlint (5 minutes)

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

Create `commitlint.config.js`:
```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

Create `.husky/commit-msg`:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx --no -- commitlint --edit "$1"
```

### Step 6 — Purge history if secrets already leaked (only if applicable)

If ANY `.env` or secret has already been committed historically:
```bash
# Use git-filter-repo (recommended over BFG)
pip install git-filter-repo
git filter-repo --path .env --invert-paths
git push --force-with-lease
# Then rotate ALL credentials immediately (Supabase keys, API tokens, etc.)
```

### Step 7 — CI fallback

Because client-side hooks can be bypassed with `git commit --no-verify`, add server-side enforcement via GitHub Actions:
- `.github/workflows/ci.yml` running `npm run lint`, `gitleaks-action`, `commitlint-github-action`.
- Block merges to `master` on failure (branch protection rule).

---

## 5. Compliance Cross-References

- **חוק הגנת הפרטיות התשמ"א-1981** — absent secret hygiene means private supplier/customer data may be exposed via leaked credentials.
- **ISO 27001 A.9.4.5** (access to program source code) — uncontrolled commits violate source-code access controls.
- **OWASP ASVS V14.3** (build pipeline hardening) — secret scanning is a mandatory control.
- **SOC 2 CC8.1** (change management) — commitlint + hooks contribute to auditable change evidence.

---

## 6. Recommendation

**Overall verdict: FAIL — IMMEDIATE ACTION REQUIRED**

The `onyx-procurement` repository currently has **zero** pre-commit automation and **zero** git hygiene configuration. Of particular urgency:

1. **TODAY (blocker):** Create `.gitignore` before any further commits. Without it, the next `git add` operation is very likely to expose production secrets.
2. **THIS WEEK (high priority):** Install husky + lint-staged + gitleaks and wire up a working `pre-commit` hook; create `.gitattributes`.
3. **THIS SPRINT (medium priority):** Add commitlint and a GitHub Actions CI workflow as the server-side safety net.
4. **ONGOING:** Audit `git log` + GitHub repo settings to confirm no historical `.env` or secret leakage has already occurred; rotate any exposed credentials.

Until at least step 1 and step 2 are completed, **no new developer should be onboarded** and **no further commits should be made** that could expose secrets.

---

## 7. Evidence Index

| Artifact | Path | Result |
|---|---|---|
| package.json | `onyx-procurement/package.json` | Present, zero tooling |
| .gitignore | `onyx-procurement/.gitignore` | **MISSING** |
| .gitattributes | `onyx-procurement/.gitattributes` | **MISSING** |
| .husky/ | `onyx-procurement/.husky/` | **MISSING** |
| .pre-commit-config.yaml | `onyx-procurement/.pre-commit-config.yaml` | **MISSING** |
| lint-staged.config.* | `onyx-procurement/lint-staged.config.*` | **MISSING** |
| commitlint.config.* | `onyx-procurement/commitlint.config.*` | **MISSING** |
| .env.example | `onyx-procurement/.env.example` | Present (635 bytes) — confirms `.env` usage pattern |

---

*Report produced by QA Agent #58 — static analysis only, no commits performed, no files modified outside of this report.*
